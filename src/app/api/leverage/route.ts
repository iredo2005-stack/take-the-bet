import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  MIN_ORDER_GAP_SECONDS,
  MAINTENANCE_MARGIN_BPS,
  SPREAD_BPS,
  isValidLeverage,
  randomExecutionDelayMs,
  sleep,
} from '@/lib/money'

// POST /api/leverage — open a leveraged Long/Short position on a creator's index.
//
// Anti front-running (6A): the order is accepted immediately, but the entry
// price is only stamped after a randomized 3-5s server-side delay, read at
// that later moment — never the price the user saw when they clicked.
export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: user } = await supabase.from('users').select('*').eq('clerk_id', userId).single()
    if (!user?.age_verified) return NextResponse.json({ error: 'Age verification required' }, { status: 403 })

    const body = await req.json()
    const { creatorId, side, leverage, collateralCents, clientRequestId, takeProfitPrice, stopLossPrice } = body

    if (!creatorId || (side !== 'long' && side !== 'short')) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    if (!isValidLeverage(leverage)) {
      return NextResponse.json({ error: 'Leverage must be 3x or 5x' }, { status: 400 })
    }
    if (!Number.isInteger(collateralCents) || collateralCents <= 0) {
      return NextResponse.json({ error: 'collateralCents must be a positive integer' }, { status: 400 })
    }
    if (takeProfitPrice != null && (typeof takeProfitPrice !== 'number' || takeProfitPrice <= 0)) {
      return NextResponse.json({ error: 'takeProfitPrice must be a positive number' }, { status: 400 })
    }
    if (stopLossPrice != null && (typeof stopLossPrice !== 'number' || stopLossPrice <= 0)) {
      return NextResponse.json({ error: 'stopLossPrice must be a positive number' }, { status: 400 })
    }
    if (takeProfitPrice != null && stopLossPrice != null && takeProfitPrice === stopLossPrice) {
      return NextResponse.json({ error: 'takeProfitPrice and stopLossPrice cannot be equal' }, { status: 400 })
    }

    const { data: creator } = await supabase.from('creators').select('id').eq('id', creatorId).single()
    if (!creator) return NextResponse.json({ error: 'Creator not found' }, { status: 404 })

    // 1 request per 5s per user — single atomic UPDATE, no read-then-write race.
    const { data: claimed } = await supabase.rpc('try_claim_order_slot', {
      p_user_id: user.id,
      p_min_gap_seconds: MIN_ORDER_GAP_SECONDS,
    })
    if (!claimed) {
      return NextResponse.json({ error: 'Rate limited — max 1 order per 5 seconds' }, { status: 429 })
    }

    const executionDelayMs = randomExecutionDelayMs()
    const executeAt = new Date(Date.now() + executionDelayMs).toISOString()

    let pending
    try {
      const { data, error } = await supabase.rpc('request_open_leveraged_position', {
        p_user_id: user.id,
        p_creator_id: creatorId,
        p_side: side,
        p_leverage: leverage,
        p_collateral_cents: collateralCents,
        p_spread_bps: SPREAD_BPS,
        p_maintenance_ratio_bps: MAINTENANCE_MARGIN_BPS,
        p_execute_at: executeAt,
        p_client_request_id: clientRequestId ?? randomUUID(),
        p_take_profit_price: takeProfitPrice ?? null,
        p_stop_loss_price: stopLossPrice ?? null,
      })
      if (error) throw error
      pending = data
    } catch (err: any) {
      if (err?.message?.includes('insufficient_balance')) {
        return NextResponse.json({ error: 'Insufficient balance for collateral + spread fee' }, { status: 400 })
      }
      throw err
    }

    // Hold the request open through the delay so the response carries the real
    // settled fill — the client never sees (or can react to) the entry price
    // before it's already locked in server-side.
    await sleep(executionDelayMs)

    const { data: filled, error: finalizeError } = await supabase.rpc('finalize_open_leveraged_position', {
      p_position_id: pending.id,
    })
    if (finalizeError) return NextResponse.json({ error: finalizeError.message }, { status: 500 })

    return NextResponse.json({ success: true, position: filled })
  } catch (err) {
    console.error('[leverage:open] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

// GET /api/leverage — list the caller's positions with live unrealized PnL.
export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: user } = await supabase.from('users').select('id').eq('clerk_id', userId).single()
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { data: positions, error } = await supabase
      .from('leveraged_positions')
      .select('*, creators(display_name, slug, index_price)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const withPnl = (positions || []).map((p: any) => {
      if (p.status !== 'open' || !p.entry_index_price) return p
      const currentPrice = Number(p.creators?.index_price ?? p.entry_index_price)
      const direction = p.side === 'long' ? 1 : -1
      const unrealizedPnlCents = Math.round(
        p.notional_cents * direction * ((currentPrice - p.entry_index_price) / p.entry_index_price)
      )
      return { ...p, unrealized_pnl_cents: Math.max(unrealizedPnlCents, -p.collateral_cents) }
    })

    return NextResponse.json({ positions: withPnl })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
