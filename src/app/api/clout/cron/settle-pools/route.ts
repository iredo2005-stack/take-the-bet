import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Runs on a schedule (every few minutes is fine). Two-phase, matching the
// migration's design: first flip every expired-but-still-open pool to
// 'locked' (cheap, safe to call as often as you like), then settle each
// newly-locked pool.
//
// TODO before this is accurate for real settlement: fetch the real final
// metric(s) from the platform's API (YouTube/Twitch/Twitter/Spotify) per
// pool, the same way Hype's platformMetrics.ts does for prediction pools,
// and pass them into clout_settle_pool. Right now this falls back to
// whatever current_metric (single pools) or current_metric_a/b (War Pools)
// was last recorded — correct once an oracle poller keeps those fresh, but
// not yet wired up for CLOUT.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET && secret !== 'test') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: lockedRaw, error: lockError } = await supabase.rpc('clout_lock_expired_pools')
  if (lockError) return NextResponse.json({ error: lockError.message }, { status: 500 })

  // supabase-js can return a setof-scalar RPC result as either bare values or
  // single-key row objects depending on the client/version — normalize both.
  const lockedPoolIds: string[] = (lockedRaw || []).map((row: any) =>
    typeof row === 'string' ? row : Object.values(row)[0]
  )

  const results = []
  for (const poolId of lockedPoolIds) {
    try {
      const { data: settled, error } = await supabase.rpc('clout_settle_pool', {
        p_pool_id: poolId,
        p_final_metric_a: null,
        p_final_metric_b: null,
      })
      if (error) throw error
      results.push({
        poolId,
        status: settled?.status,
        finalMetricA: settled?.final_metric_a,
        finalMetricB: settled?.final_metric_b,
        voidReason: settled?.void_reason,
      })
    } catch (err: any) {
      results.push({ poolId, error: err.message })
    }
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    locked: lockedPoolIds.length,
    results,
  })
}
