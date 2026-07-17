import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MIN_ORDER_GAP_SECONDS, SPREAD_BPS, randomExecutionDelayMs, sleep } from '@/lib/money'

type Props = { params: Promise<{ id: string }> }

// POST /api/leverage/[id]/close — request close now, settle at the future price
// after the same randomized 3-5s delay used on open.
export async function POST(req: Request, { params }: Props) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: user } = await supabase.from('users').select('id').eq('clerk_id', userId).single()
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { id } = await params

    const { data: claimed } = await supabase.rpc('try_claim_order_slot', {
      p_user_id: user.id,
      p_min_gap_seconds: MIN_ORDER_GAP_SECONDS,
    })
    if (!claimed) {
      return NextResponse.json({ error: 'Rate limited — max 1 order per 5 seconds' }, { status: 429 })
    }

    const executionDelayMs = randomExecutionDelayMs()
    const executeAt = new Date(Date.now() + executionDelayMs).toISOString()

    const { error: reqError } = await supabase.rpc('request_close_leveraged_position', {
      p_position_id: id,
      p_user_id: user.id,
      p_execute_at: executeAt,
    })
    if (reqError) {
      const status = reqError.message.includes('not_found') ? 404 : 400
      return NextResponse.json({ error: reqError.message }, { status })
    }

    await sleep(executionDelayMs)

    const { data: closed, error: finalizeError } = await supabase.rpc('finalize_close_leveraged_position', {
      p_position_id: id,
      p_spread_bps: SPREAD_BPS,
      p_force_liquidate: false,
    })
    if (finalizeError) return NextResponse.json({ error: finalizeError.message }, { status: 500 })

    return NextResponse.json({ success: true, position: closed })
  } catch (err) {
    console.error('[leverage:close] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
