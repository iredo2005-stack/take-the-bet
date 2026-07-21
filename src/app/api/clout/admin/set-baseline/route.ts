import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/clout/admin/set-baseline — admin-only.
//
// Baseline & Metric Ingestion Engine. There's no real oracle poller wired up
// for CLOUT yet, so this is how an admin seeds/overrides the numbers that
// drive settlement and liquidation during the beta:
//
//   - creatorId + rollingAvgMetric/realtimeMetric: updates the creator's
//     rolling baseline and live number (creators.rolling_avg_metric /
//     creators.realtime_metric) — the baseline any *new* single-creator pool
//     against this creator will use.
//   - poolId + currentMetric (single pools) or currentMetricA/currentMetricB
//     (War Pools): pushes a live value directly into an *existing open*
//     pool, so an admin can walk it right up to its liquidation or
//     settlement line on demand.
//
// Both are optional and independent; at least one must be provided. All the
// actual validation/locking happens inside clout_admin_set_metrics — this
// route is just auth + a thin pass-through.
export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: user } = await supabase.from('users').select('role').eq('clerk_id', userId).single()
    if (user?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const body = await req.json()
    const {
      creatorId,
      rollingAvgMetric,
      realtimeMetric,
      poolId,
      currentMetric,
      currentMetricA,
      currentMetricB,
    } = body

    if (!creatorId && !poolId) {
      return NextResponse.json({ error: 'creatorId and/or poolId is required' }, { status: 400 })
    }
    for (const [name, value] of [
      ['rollingAvgMetric', rollingAvgMetric],
      ['realtimeMetric', realtimeMetric],
      ['currentMetric', currentMetric],
      ['currentMetricA', currentMetricA],
      ['currentMetricB', currentMetricB],
    ] as const) {
      if (value !== undefined && value !== null && typeof value !== 'number') {
        return NextResponse.json({ error: `${name} must be a number` }, { status: 400 })
      }
    }

    const { data, error } = await supabase.rpc('clout_admin_set_metrics', {
      p_creator_id: creatorId ?? null,
      p_rolling_avg_metric: rollingAvgMetric ?? null,
      p_realtime_metric: realtimeMetric ?? null,
      p_pool_id: poolId ?? null,
      p_current_metric: currentMetric ?? null,
      p_current_metric_a: currentMetricA ?? null,
      p_current_metric_b: currentMetricB ?? null,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true, creator: data?.creator ?? null, pool: data?.pool ?? null })
  } catch (err) {
    console.error('[clout:admin:set-baseline] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
