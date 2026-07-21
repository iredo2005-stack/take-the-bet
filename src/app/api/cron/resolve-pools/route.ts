import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchContentMetric, ContentGoneError } from '@/lib/platformMetrics'
import { POOL_FEE_BPS } from '@/lib/money'

// Runs every few minutes. Two jobs:
//   1. Resolve any pool past its 48h expiry — 10% fee, 90% pro-rata to winners.
//   2. Early-void any still-open live-stream pool whose stream just ended
//      abruptly (spec §6C) — no fee, 100% refund, well before the 48h mark.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET && secret !== 'test') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const results: any[] = []

  // ── 1. Resolve expired pools ──
  const { data: expired } = await supabase
    .from('prediction_pools')
    .select('*')
    .eq('status', 'open')
    .lt('expires_at', now.toISOString())

  for (const pool of expired || []) {
    try {
      const metric = await fetchContentMetric(pool.platform, pool.content_external_id, pool.metric_type)
      const outcomeYes = metric >= Number(pool.threshold_metric)
      const { error } = await supabase.rpc('resolve_prediction_pool', {
        p_pool_id: pool.id,
        p_outcome_yes: outcomeYes,
        p_final_metric: metric,
        p_fee_bps: POOL_FEE_BPS,
      })
      if (error) throw error
      results.push({ pool: pool.id, status: outcomeYes ? 'resolved_yes' : 'resolved_no', metric })
    } catch (err) {
      if (err instanceof ContentGoneError) {
        const { error } = await supabase.rpc('void_prediction_pool', { p_pool_id: pool.id, p_reason: err.message })
        results.push({ pool: pool.id, status: 'void', reason: err.message, rpcError: error?.message })
      } else {
        // Transient failure — leave pool open, retry next tick.
        results.push({ pool: pool.id, status: 'skipped_transient_error', error: (err as Error).message })
      }
    }
  }

  // ── 2. Early-void live pools whose stream just ended abruptly ──
  const { data: liveOpen } = await supabase
    .from('prediction_pools')
    .select('*')
    .eq('status', 'open')
    .eq('metric_type', 'concurrent_viewers')
    .gte('expires_at', now.toISOString())

  for (const pool of liveOpen || []) {
    try {
      await fetchContentMetric(pool.platform, pool.content_external_id, pool.metric_type)
    } catch (err) {
      if (err instanceof ContentGoneError) {
        const { error } = await supabase.rpc('void_prediction_pool', {
          p_pool_id: pool.id,
          p_reason: `Stream terminated early: ${err.message}`,
        })
        results.push({ pool: pool.id, status: 'void_early', reason: err.message, rpcError: error?.message })
      }
      // transient errors here are ignored — next tick will re-check
    }
  }

  return NextResponse.json({ success: true, timestamp: now.toISOString(), processed: results.length, results })
}
