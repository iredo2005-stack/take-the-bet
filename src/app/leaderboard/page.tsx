import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatCurrency } from '@/lib/utils'
import LeaderboardTabs from './LeaderboardTabs'

type RankedTrader = {
  userId: string
  username: string | null
  fullName: string | null
  avatarUrl: string | null
  stat: number
  label: string
}

export default async function LeaderboardPage() {
  const supabase = createAdminClient()

  // Current user
  let currentUserId: string | null = null
  try {
    const { userId: clerkId } = await auth()
    if (clerkId) {
      const { data } = await supabase.from('users').select('id').eq('clerk_id', clerkId).single()
      currentUserId = data?.id ?? null
    }
  } catch {}

  // All users with usernames
  const { data: allUsers } = await supabase.from('users').select('id, username, full_name, avatar_url, balance')
  const usersMap = new Map((allUsers || []).map((u: any) => [u.id, u]))

  // All holdings
  const { data: allHoldings } = await supabase.from('holdings').select('user_id, shares_owned, avg_buy_price, total_invested, offerings(current_price)').gt('shares_owned', 0)

  // Calculate P&L per user
  const pnlMap = new Map<string, { invested: number; value: number }>()
  for (const h of (allHoldings || []) as any[]) {
    const uid = h.user_id
    const inv = Number(h.total_invested)
    const val = h.shares_owned * Number(h.offerings?.current_price ?? 0)
    const prev = pnlMap.get(uid) || { invested: 0, value: 0 }
    pnlMap.set(uid, { invested: prev.invested + inv, value: prev.value + val })
  }

  // All-time P&L leaderboard
  const allTimePnl: RankedTrader[] = []
  for (const [uid, { invested, value }] of pnlMap) {
    const u = usersMap.get(uid)
    if (!u) continue
    allTimePnl.push({ userId: uid, username: u.username, fullName: u.full_name, avatarUrl: u.avatar_url, stat: value - invested, label: formatCurrency(value - invested) })
  }
  allTimePnl.sort((a, b) => b.stat - a.stat)

  // Weekly P&L — transactions from last 7 days
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const { data: weeklyTx } = await supabase.from('transactions').select('buyer_id, shares, price_per_share, total_amount, offering_id, offerings(current_price)').eq('status', 'completed').gte('created_at', weekAgo)

  const weekPnlMap = new Map<string, number>()
  for (const tx of (weeklyTx || []) as any[]) {
    const uid = tx.buyer_id
    const costBasis = Number(tx.total_amount)
    const currentVal = tx.shares * Number(tx.offerings?.current_price ?? 0)
    const pnl = currentVal - costBasis
    weekPnlMap.set(uid, (weekPnlMap.get(uid) || 0) + pnl)
  }

  const weeklyPnl: RankedTrader[] = []
  for (const [uid, pnl] of weekPnlMap) {
    const u = usersMap.get(uid)
    if (!u) continue
    weeklyPnl.push({ userId: uid, username: u.username, fullName: u.full_name, avatarUrl: u.avatar_url, stat: pnl, label: formatCurrency(pnl) })
  }
  weeklyPnl.sort((a, b) => b.stat - a.stat)

  // Bet win rate
  const { data: allPositions } = await supabase.from('bet_positions').select('user_id, outcome_id, amount, payout, video_bets(status, winning_outcome_id)')

  const betStatsMap = new Map<string, { wins: number; total: number }>()
  for (const p of (allPositions || []) as any[]) {
    if (p.video_bets?.status !== 'resolved') continue
    const uid = p.user_id
    const prev = betStatsMap.get(uid) || { wins: 0, total: 0 }
    prev.total++
    if (p.outcome_id === p.video_bets.winning_outcome_id) prev.wins++
    betStatsMap.set(uid, prev)
  }

  const winRate: RankedTrader[] = []
  for (const [uid, { wins, total }] of betStatsMap) {
    if (total < 1) continue
    const u = usersMap.get(uid)
    if (!u) continue
    const rate = Math.round((wins / total) * 100)
    winRate.push({ userId: uid, username: u.username, fullName: u.full_name, avatarUrl: u.avatar_url, stat: rate, label: `${rate}% (${wins}/${total})` })
  }
  winRate.sort((a, b) => b.stat - a.stat || 0)

  // Biggest single win this week (bet payout - amount)
  const weekBetPositions = (allPositions || []).filter((p: any) => p.video_bets?.status === 'resolved' && p.outcome_id === p.video_bets?.winning_outcome_id && Number(p.payout ?? 0) > Number(p.amount))
  const biggestWins: RankedTrader[] = weekBetPositions.map((p: any) => {
    const u = usersMap.get(p.user_id)
    const profit = Number(p.payout ?? 0) - Number(p.amount)
    return { userId: p.user_id, username: u?.username, fullName: u?.full_name, avatarUrl: u?.avatar_url, stat: profit, label: `+${formatCurrency(profit)}` }
  }).filter((t: any) => t.username).sort((a: any, b: any) => b.stat - a.stat).slice(0, 50)

  return (
    <LeaderboardTabs
      allTimePnl={allTimePnl.slice(0, 50)}
      weeklyPnl={weeklyPnl.slice(0, 50)}
      winRate={winRate.slice(0, 50)}
      biggestWins={biggestWins}
      currentUserId={currentUserId}
      allTimeFull={allTimePnl}
      weeklyFull={weeklyPnl}
      winRateFull={winRate}
      biggestWinsFull={biggestWins}
    />
  )
}
