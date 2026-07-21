import { createAdminClient } from '@/lib/supabase/admin'
import { createPredictionPool, type PoolPlatform, type MetricType } from '@/lib/predictionPools'

// Instant Market Creation: called the moment a webhook/poller detects a new
// upload, stream, tweet, or Reel. Pulls the creator's stored rolling 4-week
// average and spins up the 48h pool immediately.
export async function handleNewContent(
  supabase: ReturnType<typeof createAdminClient>,
  params: {
    creatorId: string
    platform: PoolPlatform
    contentExternalId: string
    contentTitle?: string | null
    contentUrl?: string | null
    metricType?: MetricType
    eventType: string
  }
) {
  const { data: creator } = await supabase
    .from('creators')
    .select('rolling_avg_metric')
    .eq('id', params.creatorId)
    .single()

  if (!creator) {
    await supabase.from('ingestion_events').insert({
      platform: params.platform,
      external_id: params.contentExternalId,
      event_type: params.eventType,
      status: 'error',
      error: 'creator_not_found',
    })
    return { data: null, duplicate: false as const }
  }

  try {
    const result = await createPredictionPool(supabase, {
      creatorId: params.creatorId,
      platform: params.platform,
      contentExternalId: params.contentExternalId,
      contentTitle: params.contentTitle,
      contentUrl: params.contentUrl,
      metricType: params.metricType,
      rollingAvgMetric: Number(creator.rolling_avg_metric) || 0,
    })

    await supabase.from('ingestion_events').insert({
      platform: params.platform,
      creator_id: params.creatorId,
      external_id: params.contentExternalId,
      event_type: params.eventType,
      status: result.duplicate ? 'duplicate' : 'pool_created',
    })

    return result
  } catch (err) {
    await supabase.from('ingestion_events').insert({
      platform: params.platform,
      creator_id: params.creatorId,
      external_id: params.contentExternalId,
      event_type: params.eventType,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}
