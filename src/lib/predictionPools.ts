import { createAdminClient } from '@/lib/supabase/admin'

const POOL_DURATION_MS = 48 * 60 * 60 * 1000
const MILESTONE_MULTIPLIER = 1.2 // "will this beat the creator's 4-week average by 20%?"

export type PoolPlatform = 'youtube' | 'twitch' | 'twitter' | 'instagram'
export type MetricType = 'views' | 'concurrent_viewers'

// Instant Market Creation (spec §3): the moment new content is detected, spin
// up a 48h Yes/No pool against a milestone derived from the creator's own
// rolling 4-week average — no manual admin step required.
export async function createPredictionPool(
  supabase: ReturnType<typeof createAdminClient>,
  params: {
    creatorId: string
    platform: PoolPlatform
    contentExternalId: string
    contentTitle?: string | null
    contentUrl?: string | null
    metricType?: MetricType
    rollingAvgMetric: number
  }
) {
  const metricType = params.metricType ?? 'views'
  const threshold = Math.max(1, Math.round(params.rollingAvgMetric * MILESTONE_MULTIPLIER))
  const expiresAt = new Date(Date.now() + POOL_DURATION_MS).toISOString()
  const label = metricType === 'concurrent_viewers' ? 'concurrent viewers' : 'views'

  const { data, error } = await supabase
    .from('prediction_pools')
    .insert({
      creator_id: params.creatorId,
      platform: params.platform,
      content_external_id: params.contentExternalId,
      content_title: params.contentTitle ?? null,
      content_url: params.contentUrl ?? null,
      metric_type: metricType,
      rolling_avg_at_creation: params.rollingAvgMetric,
      threshold_metric: threshold,
      question: `Will this hit ${threshold.toLocaleString()} ${label} within 48 hours?`,
      status: 'open',
      expires_at: expiresAt,
    })
    .select()
    .single()

  // Unique partial index (platform, content_external_id) where status='open'
  // means a duplicate webhook delivery for the same content is a harmless no-op.
  if (error && error.code === '23505') return { data: null, duplicate: true as const }
  if (error) throw error
  return { data, duplicate: false as const }
}
