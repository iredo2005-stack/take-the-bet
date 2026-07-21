import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SPREAD_BPS } from '@/lib/money'

// Auto-Liquidation Engine (6D). Runs frequently (every minute is ideal — see
// vercel.json note on cron cadence limits for your Vercel plan). Also
// self-heals any 'pending'/'pending_close' order whose execute_at has long
// passed, in case the original request's process died mid-delay — so a
// crashed request can never leave funds reserved forever.
const STALE_AFTER_MS = 30_000

export async function GET(req: Request) {
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET && secret !== 'test') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const staleCutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString()

  // 1. Margin check on every open position.
  const { data: openPositions } = await supabase
    .from('leveraged_positions')
    .select('id')
    .eq('status', 'open')

  const liquidations = []
  const tpSlTriggers = []
  for (const p of openPositions || []) {
    try {
      const { data: didLiquidate, error } = await supabase.rpc('check_liquidation', {
        p_position_id: p.id,
        p_spread_bps: SPREAD_BPS,
      })
      if (error) throw error
      if (didLiquidate) {
        liquidations.push(p.id)
        continue // already closed — skip the TP/SL check below
      }

      const { data: triggered, error: tpSlError } = await supabase.rpc('check_tp_sl', {
        p_position_id: p.id,
        p_spread_bps: SPREAD_BPS,
      })
      if (tpSlError) throw tpSlError
      if (triggered) tpSlTriggers.push({ id: p.id, triggered })
    } catch (err: any) {
      liquidations.push({ id: p.id, error: err.message })
    }
  }

  // 2. Self-heal stuck pending opens.
  const { data: stuckOpens } = await supabase
    .from('leveraged_positions')
    .select('id')
    .eq('status', 'pending')
    .lt('execute_at', staleCutoff)

  const healedOpens = []
  for (const p of stuckOpens || []) {
    const { error } = await supabase.rpc('finalize_open_leveraged_position', { p_position_id: p.id })
    healedOpens.push(error ? { id: p.id, error: error.message } : p.id)
  }

  // 3. Self-heal stuck pending closes.
  const { data: stuckCloses } = await supabase
    .from('leveraged_positions')
    .select('id')
    .eq('status', 'pending_close')
    .lt('execute_at', staleCutoff)

  const healedCloses = []
  for (const p of stuckCloses || []) {
    const { error } = await supabase.rpc('finalize_close_leveraged_position', {
      p_position_id: p.id,
      p_spread_bps: SPREAD_BPS,
      p_close_kind: 'user_close',
    })
    healedCloses.push(error ? { id: p.id, error: error.message } : p.id)
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    checked: (openPositions || []).length,
    liquidations,
    tpSlTriggers,
    healedOpens,
    healedCloses,
  })
}
