import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — place a bet (buy a position in an outcome)
export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: user } = await supabase.from('users').select('*').eq('clerk_id', userId).single()
    if (!user?.age_verified) return NextResponse.json({ error: 'Age verification required' }, { status: 403 })

    const { betId, outcomeId, amount } = await req.json()
    if (!betId || !outcomeId || !amount || amount <= 0) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

    // Check bet is open
    const { data: bet } = await supabase.from('video_bets').select('*').eq('id', betId).single()
    if (!bet || bet.status !== 'open') return NextResponse.json({ error: 'Bet is not open' }, { status: 400 })
    if (new Date(bet.deadline) < new Date()) return NextResponse.json({ error: 'Deadline has passed' }, { status: 400 })

    // Check balance
    const balance = Number(user.balance ?? 0)
    if (balance < amount) return NextResponse.json({ error: `Insufficient Hype Coins. You have ${Math.round(balance)} HC.` }, { status: 400 })

    // Deduct balance
    await supabase.from('users').update({ balance: Math.round((balance - amount) * 100) / 100 }).eq('id', user.id)

    // Add position
    const { error: posErr } = await supabase.from('bet_positions').insert({
      bet_id: betId, outcome_id: outcomeId, user_id: user.id, amount,
    })
    if (posErr) {
      await supabase.from('users').update({ balance }).eq('id', user.id) // refund
      return NextResponse.json({ error: posErr.message }, { status: 500 })
    }

    // Update outcome pool
    const { data: outcome } = await supabase.from('bet_outcomes').select('*').eq('id', outcomeId).single()
    await supabase.from('bet_outcomes').update({ pool_amount: Number(outcome.pool_amount) + amount }).eq('id', outcomeId)

    // Update total pool
    await supabase.from('video_bets').update({ total_pool: Number(bet.total_pool) + amount }).eq('id', betId)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[bets] Error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
