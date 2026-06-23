import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — admin creates a new bet
export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: admin } = await supabase.from('users').select('*').eq('clerk_id', userId).single()
    if (!admin || admin.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const { creatorId, question, betType, deadline, outcomes } = await req.json()

    if (!creatorId || !question || !betType || !deadline || !outcomes?.length) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    if (!['binary', 'multi'].includes(betType)) {
      return NextResponse.json({ error: 'betType must be binary or multi' }, { status: 400 })
    }
    if (betType === 'binary' && outcomes.length !== 2) {
      return NextResponse.json({ error: 'Binary bets need exactly 2 outcomes' }, { status: 400 })
    }

    // Creator must be big (500k+)
    const { data: creator } = await supabase.from('creators').select('*').eq('id', creatorId).single()
    if (!creator) return NextResponse.json({ error: 'Creator not found' }, { status: 404 })
    const subs = creator.subscribers ?? creator.declared_followers ?? 0
    if (subs < 500_000) return NextResponse.json({ error: `Creator needs 500K+ followers (has ${subs.toLocaleString()})` }, { status: 400 })

    // Create bet
    const { data: bet, error: betErr } = await supabase.from('video_bets').insert({
      creator_id: creatorId, question, bet_type: betType, deadline, status: 'open',
    }).select().single()

    if (betErr) return NextResponse.json({ error: betErr.message }, { status: 500 })

    // Create outcomes
    const outcomeRows = outcomes.map((label: string, i: number) => ({
      bet_id: bet.id, label, sort_order: i, pool_amount: 0,
    }))
    const { error: outErr } = await supabase.from('bet_outcomes').insert(outcomeRows)
    if (outErr) return NextResponse.json({ error: outErr.message }, { status: 500 })

    return NextResponse.json({ success: true, bet })
  } catch (err) {
    console.error('[admin/bets] Error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
