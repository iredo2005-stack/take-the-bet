import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Props = { params: Promise<{ id: string }> }

const PLATFORM_FEE = 0.05 // 5% from total pool

export async function POST(req: Request, { params }: Props) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: admin } = await supabase.from('users').select('*').eq('clerk_id', userId).single()
    if (!admin || admin.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const { id } = await params
    const { winningOutcomeId } = await req.json()
    if (!winningOutcomeId) return NextResponse.json({ error: 'winningOutcomeId required' }, { status: 400 })

    // Get bet
    const { data: bet } = await supabase.from('video_bets').select('*').eq('id', id).single()
    if (!bet) return NextResponse.json({ error: 'Bet not found' }, { status: 404 })
    if (bet.status !== 'open') return NextResponse.json({ error: 'Bet already resolved' }, { status: 400 })

    const totalPool = Number(bet.total_pool)
    const platformCut = Math.round(totalPool * PLATFORM_FEE * 100) / 100
    const winnerPool = Math.round((totalPool - platformCut) * 100) / 100

    // Get winning positions
    const { data: winningPositions } = await supabase.from('bet_positions').select('*').eq('bet_id', id).eq('outcome_id', winningOutcomeId)

    // Get total staked on winning outcome
    const { data: winOutcome } = await supabase.from('bet_outcomes').select('*').eq('id', winningOutcomeId).single()
    const winOutcomePool = Number(winOutcome?.pool_amount ?? 0)

    // Pay out winners proportionally
    if (winningPositions && winOutcomePool > 0) {
      for (const pos of winningPositions) {
        const share = Number(pos.amount) / winOutcomePool
        const payout = Math.round(share * winnerPool * 100) / 100

        // Update position with payout
        await supabase.from('bet_positions').update({ payout }).eq('id', pos.id)

        // Credit user balance
        const { data: u } = await supabase.from('users').select('*').eq('id', pos.user_id).single()
        if (u) {
          await supabase.from('users').update({ balance: Math.round((Number(u.balance) + payout) * 100) / 100 }).eq('id', u.id)
        }
      }
    }

    // Mark losers with payout = 0
    await supabase.from('bet_positions').update({ payout: 0 }).eq('bet_id', id).neq('outcome_id', winningOutcomeId)

    // Resolve bet
    await supabase.from('video_bets').update({ status: 'resolved', winning_outcome_id: winningOutcomeId }).eq('id', id)

    return NextResponse.json({ success: true, totalPool, platformCut, winnerPool, winnersCount: winningPositions?.length ?? 0 })
  } catch (err) {
    console.error('[admin/bets/resolve] Error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
