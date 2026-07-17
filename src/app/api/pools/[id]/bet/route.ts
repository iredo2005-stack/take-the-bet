import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { MIN_ORDER_GAP_SECONDS } from '@/lib/money'

type Props = { params: Promise<{ id: string }> }

// POST /api/pools/[id]/bet — place a Yes/No ticket on a 48h pool.
export async function POST(req: Request, { params }: Props) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: user } = await supabase.from('users').select('*').eq('clerk_id', userId).single()
    if (!user?.age_verified) return NextResponse.json({ error: 'Age verification required' }, { status: 403 })

    const { id } = await params
    const body = await req.json()
    const { side, amountCents, clientRequestId } = body

    if (side !== 'yes' && side !== 'no') {
      return NextResponse.json({ error: 'side must be "yes" or "no"' }, { status: 400 })
    }
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: 'amountCents must be a positive integer' }, { status: 400 })
    }

    const { data: claimed } = await supabase.rpc('try_claim_order_slot', {
      p_user_id: user.id,
      p_min_gap_seconds: MIN_ORDER_GAP_SECONDS,
    })
    if (!claimed) {
      return NextResponse.json({ error: 'Rate limited — max 1 order per 5 seconds' }, { status: 429 })
    }

    const { data: ticket, error } = await supabase.rpc('place_prediction_ticket', {
      p_pool_id: id,
      p_user_id: user.id,
      p_side: side,
      p_amount_cents: amountCents,
      p_client_request_id: clientRequestId ?? randomUUID(),
    })

    if (error) {
      const known = ['pool_not_found', 'pool_closed', 'pool_expired', 'insufficient_balance']
      const status = known.some((k) => error.message.includes(k)) ? 400 : 500
      return NextResponse.json({ error: error.message }, { status })
    }

    return NextResponse.json({ success: true, ticket })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
