import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { dollarsToCents, centsToDollars } from '@/lib/money'

const VALID_SIDES = ['up', 'down'] as const
const VALID_LEVERAGE = [1, 5, 10] as const

function shapePosition(position: any) {
  return {
    id: position.id,
    poolId: position.pool_id,
    side: position.side,
    leverage: position.leverage,
    marginUsdc: centsToDollars(position.margin_cents),
    notionalUsdc: centsToDollars(position.notional_cents),
    fundedFromBonusUsdc: centsToDollars(position.funded_from_bonus_cents),
    insurancePurchased: position.insurance_purchased,
    insurancePremiumUsdc: centsToDollars(position.insurance_premium_cents),
    status: position.status,
    createdAt: position.created_at,
  }
}

// POST /api/clout/positions/place — place a leveraged $CLOUT wager on a pool.
//
// All the actual work — draw play_balance_cents first then
// promo_bonus_balance_cents for the remainder, insert the position, credit
// the pool's cash side — happens atomically inside clout_place_position
// (row-locks both the pool and the wallet with `for update` before touching
// either). This route is deliberately thin: validate the input, convert the
// dollar-denominated wager to integer cents, call the RPC, and reshape the
// result back to $CLOUT/USDC for the client. There's no separate "recompute
// the pool's side-notional aggregate" step — that aggregate was never a
// stored column, it's summed on read (see GET /api/clout/pools/[id]), so the
// very next fetch already reflects this position.
export async function POST(req: Request) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: user } = await supabase.from('users').select('id').eq('clerk_id', clerkId).single()
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const body = await req.json()
    const { poolId, side, marginAmountUsd, leverage, hasInsurance, clientRequestId } = body

    if (!poolId) return NextResponse.json({ error: 'poolId is required' }, { status: 400 })
    if (!VALID_SIDES.includes(side)) {
      return NextResponse.json({ error: 'side must be "up" or "down"' }, { status: 400 })
    }
    if (!VALID_LEVERAGE.includes(leverage)) {
      return NextResponse.json({ error: 'leverage must be 1, 5, or 10' }, { status: 400 })
    }
    if (typeof marginAmountUsd !== 'number' || !(marginAmountUsd > 0)) {
      return NextResponse.json({ error: 'marginAmountUsd must be a positive number' }, { status: 400 })
    }

    const marginCents = dollarsToCents(marginAmountUsd)
    const effectiveClientRequestId = clientRequestId ?? randomUUID()

    const { data: position, error } = await supabase.rpc('clout_place_position', {
      p_user_id: user.id,
      p_pool_id: poolId,
      p_side: side,
      p_margin_cents: marginCents,
      p_leverage: leverage,
      p_buy_insurance: !!hasInsurance,
      p_client_request_id: effectiveClientRequestId,
    })

    if (error) {
      // A retried/double-tapped submission replays the same client_request_id
      // and hits idx_clout_positions_idempotency (23505) — that's not a
      // failure, it's the original trade. Return it as-is instead of a 500.
      if (error.code === '23505') {
        const { data: existing } = await supabase
          .from('clout_pool_positions')
          .select('*')
          .eq('user_id', user.id)
          .eq('client_request_id', effectiveClientRequestId)
          .single()
        if (existing) return NextResponse.json({ success: true, position: shapePosition(existing), replay: true })
        return NextResponse.json({ error: 'duplicate_request' }, { status: 409 })
      }

      const known = ['invalid_side', 'invalid_leverage', 'invalid_margin', 'pool_not_found', 'pool_closed', 'pool_expired', 'insufficient_balance']
      const status = known.some((k) => error.message.includes(k)) ? 400 : 500
      return NextResponse.json({ error: error.message }, { status })
    }

    return NextResponse.json({ success: true, position: shapePosition(position) })
  } catch (err) {
    console.error('[clout:positions:place] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
