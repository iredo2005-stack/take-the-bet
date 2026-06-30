import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveWinningTier } from '@/lib/videoTiers'

// Runs hourly. Only settles expired bets — does not do creator metrics (that's the daily cron).
// Idempotent: once a bet is marked 'resolved' it's never touched again.

const HOUSE_RAKE = 0.05

async function fetchVideoViews(videoId: string): Promise<number> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return 0
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${key}`)
  const data = await res.json()
  return parseInt(data.items?.[0]?.statistics?.viewCount || '0')
}

async function settleBet(supabase: ReturnType<typeof createAdminClient>, bet: any): Promise<string> {
  // Fetch view count AT deadline settlement time (now, which is after deadline)
  const views = await fetchVideoViews(bet.video_id)
  await supabase.from('video_bets').update({ current_views: views }).eq('id', bet.id)

  const outcomes = (bet.bet_outcomes || []) as any[]
  const winningId = resolveWinningTier(outcomes, views)

  if (!winningId) {
    // No tier reached — full refund
    const { data: positions } = await supabase.from('bet_positions').select('*').eq('bet_id', bet.id)
    for (const p of (positions || []) as any[]) {
      const { data: u } = await supabase.from('users').select('balance').eq('id', p.user_id).single()
      if (u) await supabase.from('users').update({ balance: Math.round((Number(u.balance) + Number(p.amount)) * 100) / 100 }).eq('id', p.user_id)
      await supabase.from('bet_positions').update({ payout: 0 }).eq('id', p.id)
    }
    await supabase.from('video_bets').update({ status: 'resolved', winning_outcome_id: null }).eq('id', bet.id)
    return `refunded (views=${views}, no tier reached)`
  }

  const totalPool = Number(bet.total_pool)
  const rake = Math.round(totalPool * HOUSE_RAKE * 100) / 100
  const prizePool = Math.round((totalPool - rake) * 100) / 100
  const winningOutcome = outcomes.find((o: any) => o.id === winningId)
  const winPool = Number(winningOutcome?.pool_amount || 0)

  const { data: winPositions } = await supabase.from('bet_positions').select('*').eq('bet_id', bet.id).eq('outcome_id', winningId)
  if (winPool > 0 && winPositions) {
    for (const p of winPositions as any[]) {
      const payout = Math.round((Number(p.amount) / winPool) * prizePool * 100) / 100
      await supabase.from('bet_positions').update({ payout }).eq('id', p.id)
      const { data: u } = await supabase.from('users').select('balance').eq('id', p.user_id).single()
      if (u) await supabase.from('users').update({ balance: Math.round((Number(u.balance) + payout) * 100) / 100 }).eq('id', p.user_id)
    }
  }
  await supabase.from('bet_positions').update({ payout: 0 }).eq('bet_id', bet.id).neq('outcome_id', winningId)
  await supabase.from('video_bets').update({ status: 'resolved', winning_outcome_id: winningId, current_views: views }).eq('id', bet.id)

  return `settled tier="${winningOutcome?.label}" views=${views} pool=${prizePool} rake=${rake}`
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET && secret !== 'test') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()

  // Only fetch bets that have passed their deadline and are still 'open'
  const { data: expiredBets } = await supabase
    .from('video_bets')
    .select('*, bet_outcomes(*)')
    .eq('status', 'open')
    .not('video_id', 'is', null)
    .lt('deadline', now.toISOString())

  const results = []
  for (const bet of (expiredBets || []) as any[]) {
    try {
      const result = await settleBet(supabase, bet)
      results.push({ id: bet.id, creator: bet.creator_id, result })
    } catch (err: any) {
      results.push({ id: bet.id, error: err.message })
    }
  }

  return NextResponse.json({ success: true, timestamp: now.toISOString(), settled: results.length, results })
}
