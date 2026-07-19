import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Props = { params: Promise<{ id: string }> }

// GET /api/clout/pools/[id] — pool details shaped for the frontend, with a
// clean embed{} object per creator so the client can render the right
// iframe (YouTube or Twitch) without knowing the raw column layout. War
// Pools carry both; single pools only ever populate creatorA.
export async function GET(req: Request, { params }: Props) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const supabase = createAdminClient()

    const { data: pool, error } = await supabase
      .from('clout_pools')
      .select('*, creator_a:creator_a_id(id, display_name, slug, photo_url), creator_b:creator_b_id(id, display_name, slug, photo_url)')
      .eq('id', id)
      .single()

    if (error || !pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

    const embed = (platform: string | null, channelId: string | null) =>
      platform && channelId ? { platform, channelId } : null

    return NextResponse.json({
      pool: {
        id: pool.id,
        poolType: pool.pool_type,
        platform: pool.platform,
        metricType: pool.metric_type,
        windowLabel: pool.window_label,
        status: pool.status,
        baselineMetric: pool.baseline_metric,
        upPoolCents: pool.up_pool_cents,
        downPoolCents: pool.down_pool_cents,
        opensAt: pool.opens_at,
        expiresAt: pool.expires_at,
        resolvedAt: pool.resolved_at,
        finalMetricA: pool.final_metric_a,
        finalMetricB: pool.final_metric_b,
        voidReason: pool.void_reason,
        creatorA: pool.creator_a
          ? { ...pool.creator_a, embed: embed(pool.embed_platform_a, pool.embed_channel_id_a) }
          : null,
        creatorB: pool.creator_b
          ? { ...pool.creator_b, embed: embed(pool.embed_platform_b, pool.embed_channel_id_b) }
          : null,
      },
    })
  } catch (err) {
    console.error('[clout:pools:get] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
