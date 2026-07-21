import type { SupabaseClient } from '@supabase/supabase-js'
import { centsToDollars } from '@/lib/money'

// Shared by GET /api/clout/pools/[id] and the server-rendered pool page, so
// the two never drift on what a "pool detail" object looks like.
export async function fetchCloutPoolDetail(supabase: SupabaseClient, id: string) {
  const { data: pool, error } = await supabase
    .from('clout_pools')
    .select('*, creator_a:creator_a_id(id, display_name, slug, photo_url), creator_b:creator_b_id(id, display_name, slug, photo_url)')
    .eq('id', id)
    .single()

  if (error || !pool) return null

  // Aggregate open-position notional per side — needed for the live payout
  // preview (clout_calculate_live_payout's split is by notional, not cash
  // contributed); cheap enough as one indexed query summed in JS.
  const { data: openPositions, error: posError } = await supabase
    .from('clout_pool_positions')
    .select('side, notional_cents')
    .eq('pool_id', id)
    .eq('status', 'open')

  if (posError) throw new Error(posError.message)

  const sideNotionalCents = (openPositions || []).reduce(
    (acc: { up: number; down: number }, p: any) => {
      if (p.side === 'up') acc.up += p.notional_cents
      else acc.down += p.notional_cents
      return acc
    },
    { up: 0, down: 0 }
  )

  const embed = (platform: string | null, channelId: string | null) =>
    platform && channelId ? { platform, channelId } : null

  return {
    id: pool.id,
    poolType: pool.pool_type as 'single' | 'war',
    platform: pool.platform,
    metricType: pool.metric_type,
    windowLabel: pool.window_label,
    status: pool.status,
    baselineMetric: pool.baseline_metric,
    currentMetric: pool.current_metric,
    currentMetricA: pool.current_metric_a,
    currentMetricB: pool.current_metric_b,
    baselineShareA: pool.baseline_share_a,
    rakeBps: pool.rake_bps,
    upPoolUsdc: centsToDollars(pool.up_pool_cents),
    downPoolUsdc: centsToDollars(pool.down_pool_cents),
    upSideNotionalUsdc: centsToDollars(sideNotionalCents.up),
    downSideNotionalUsdc: centsToDollars(sideNotionalCents.down),
    opensAt: pool.opens_at,
    expiresAt: pool.expires_at,
    resolvedAt: pool.resolved_at,
    finalMetricA: pool.final_metric_a,
    finalMetricB: pool.final_metric_b,
    voidReason: pool.void_reason,
    creatorA: pool.creator_a ? { ...pool.creator_a, embed: embed(pool.embed_platform_a, pool.embed_channel_id_a) } : null,
    creatorB: pool.creator_b ? { ...pool.creator_b, embed: embed(pool.embed_platform_b, pool.embed_channel_id_b) } : null,
  }
}

export type CloutPoolDetailData = NonNullable<Awaited<ReturnType<typeof fetchCloutPoolDetail>>>
