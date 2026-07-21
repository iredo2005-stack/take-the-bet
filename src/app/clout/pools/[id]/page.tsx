import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { centsToDollars } from '@/lib/money'
import { fetchCloutPoolDetail } from '@/lib/clout/poolDetail'
import type { AlphaChatMessage, WinTickerEntry } from '@/components/clout/AlphaChatWidget'
import PoolPageClient from './PoolPageClient'

type Props = { params: Promise<{ id: string }> }

// Builds the network win ticker from recently-settled winning positions.
// Two follow-up queries (users, pools+creators) instead of a triple-nested
// PostgREST embed — simpler and avoids FK-ambiguity edge cases across
// creator_a_id/creator_b_id both pointing at the same `creators` table.
async function buildWinTicker(supabase: ReturnType<typeof createAdminClient>): Promise<WinTickerEntry[]> {
  const { data: won } = await supabase
    .from('clout_pool_positions')
    .select('id, payout_cents, user_id, pool_id')
    .eq('status', 'won')
    .order('settled_at', { ascending: false })
    .limit(10)

  if (!won || won.length === 0) return []

  const userIds = [...new Set(won.map((p: any) => p.user_id))]
  const poolIds = [...new Set(won.map((p: any) => p.pool_id))]

  const [{ data: users }, { data: pools }] = await Promise.all([
    supabase.from('users').select('id, username, full_name').in('id', userIds),
    supabase
      .from('clout_pools')
      .select('id, pool_type, window_label, creator_a:creator_a_id(display_name), creator_b:creator_b_id(display_name)')
      .in('id', poolIds),
  ])

  const userMap = new Map<string, string>((users || []).map((u: any) => [u.id, u.username || u.full_name || 'Anonymous Trader']))
  const poolMap = new Map<string, any>((pools || []).map((p: any) => [p.id, p]))

  return won.map((pos: any) => {
    const pool = poolMap.get(pos.pool_id)
    const poolLabel = pool
      ? pool.pool_type === 'war'
        ? `${pool.creator_a?.display_name ?? '?'} vs ${pool.creator_b?.display_name ?? '?'}`
        : pool.creator_a?.display_name ?? pool.window_label
      : 'a CLOUT pool'
    return {
      id: pos.id,
      displayName: userMap.get(pos.user_id) ?? 'Anonymous Trader',
      amountUsdc: centsToDollars(pos.payout_cents ?? 0),
      poolLabel,
    }
  })
}

export default async function CloutPoolPage({ params }: Props) {
  const { id } = await params
  const supabase = createAdminClient()

  const pool = await fetchCloutPoolDetail(supabase, id)
  if (!pool) notFound()

  const { userId: clerkId } = await auth()

  let userRowId: string | null = null
  if (clerkId) {
    const { data: user } = await supabase.from('users').select('id').eq('clerk_id', clerkId).single()
    userRowId = user?.id ?? null
  }

  let balanceUsdc = 0
  let currentRoiPercent = 0
  if (userRowId) {
    const { data: wallet } = await supabase.rpc('clout_get_or_create_wallet', { p_user_id: userRowId })
    const walletRow = Array.isArray(wallet) ? wallet[0] : wallet
    if (walletRow) {
      balanceUsdc = centsToDollars((walletRow.play_balance_cents ?? 0) + (walletRow.promo_bonus_balance_cents ?? 0))
    }

    const { data: statsRows } = await supabase.rpc('clout_calculate_rolling_stats', { p_user_id: userRowId, p_days: 30 })
    currentRoiPercent = (statsRows?.[0]?.roi_bps ?? 0) / 100
  }

  // Feature the single most exclusive Alpha Chat as this page's sidebar room —
  // there's no pool-to-chat mapping in the schema (chats are global tiers
  // gated by rolling ROI/volume, not tied to any one pool), so the most
  // exclusive one gives the sidebar its intended "Whale Chat" aspirational feel.
  const { data: chats } = await supabase.from('clout_alpha_chats').select('*').order('min_roi_bps', { ascending: false }).limit(1)
  const chat = chats?.[0] ?? null

  let chatName = 'Alpha Chat'
  let requiredRoiPercent = 0
  let chatGated = true
  let chatMessages: AlphaChatMessage[] = []

  if (chat) {
    chatName = chat.name
    requiredRoiPercent = chat.min_roi_bps / 100

    if (userRowId) {
      const { data: member } = await supabase
        .from('clout_chat_members')
        .select('status')
        .eq('chat_id', chat.id)
        .eq('user_id', userRowId)
        .maybeSingle()
      chatGated = !member || member.status !== 'active'
    }

    if (!chatGated) {
      const { data: rows } = await supabase
        .from('clout_chat_messages')
        .select('id, message_text, created_at, users(username, full_name)')
        .eq('chat_id', chat.id)
        .order('created_at', { ascending: false })
        .limit(30)

      chatMessages = (rows || [])
        .slice()
        .reverse()
        .map((row: any) => ({
          id: row.id,
          displayName: row.users?.username || row.users?.full_name || 'Anonymous Trader',
          messageText: row.message_text,
          createdAt: row.created_at,
        }))
    }
  }

  const winTicker = await buildWinTicker(supabase)

  return (
    <PoolPageClient
      pool={pool}
      balanceUsdc={balanceUsdc}
      chatName={chatName}
      chatMessages={chatMessages}
      chatGated={chatGated}
      currentRoiPercent={currentRoiPercent}
      requiredRoiPercent={requiredRoiPercent}
      winTicker={winTicker}
    />
  )
}
