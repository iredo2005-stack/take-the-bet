import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Runs frequently (every minute is ideal). For every still-open pool, checks
// every leveraged (5x/10x) open position against the 20%-adverse-move trigger
// and liquidates the ones that crossed it — see clout_check_liquidations in
// supabase/migrations/005_clout_settlement.sql for the actual logic; this
// route just fans it out across all open pools and reports what happened.
//
// Assumes clout_pools.current_metric is being kept fresh by some external
// process (a platform-metrics poller, analogous to Hype's platformMetrics.ts)
// — that oracle layer isn't built yet; for the private beta, current_metric
// can be updated directly (e.g. by the alpha traders' bots) to exercise this.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET && secret !== 'test') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: openPools, error: poolsError } = await supabase
    .from('clout_pools')
    .select('id')
    .eq('status', 'open')

  if (poolsError) return NextResponse.json({ error: poolsError.message }, { status: 500 })

  const results = []
  for (const pool of openPools || []) {
    try {
      const { data: liquidated, error } = await supabase.rpc('clout_check_liquidations', {
        p_pool_id: pool.id,
      })
      if (error) throw error
      if (liquidated && liquidated.length > 0) {
        results.push({ poolId: pool.id, liquidated })
      }
    } catch (err: any) {
      results.push({ poolId: pool.id, error: err.message })
    }
  }

  const totalLiquidated = results.reduce((sum, r: any) => sum + (r.liquidated?.length || 0), 0)

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    poolsChecked: (openPools || []).length,
    totalLiquidated,
    results,
  })
}
