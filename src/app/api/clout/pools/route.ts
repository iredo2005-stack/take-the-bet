import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const EMBED_PLATFORMS = ['youtube', 'twitch'] as const
const METRIC_TYPES = ['views', 'likes', 'concurrent_viewers', 'streams'] as const

// clout_pools.creator_a_share_bps plays two different roles depending on
// pool_type (the single-creator's full 5% share, vs. a War Pool's 2.5% half)
// and its column default (500) only matches the single-pool case — so this
// route must always set both share fields explicitly rather than ever
// relying on the table defaults, which is exactly the bug a local Postgres
// test caught: a War Pool created without an explicit override took the
// single-pool default and ended up with a 12.5% rake instead of 10%.
const DEFAULT_SINGLE_CREATOR_SHARE_BPS = 500 // 5%
const DEFAULT_WAR_CREATOR_SHARE_BPS = 250 // 2.5% each side
const DEFAULT_PLATFORM_SHARE_BPS = 500 // 5%

// GET /api/clout/pools?status=open — public listing.
export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get('status') ?? 'open'
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('clout_pools')
    .select('*, creator_a:creator_a_id(display_name, slug, photo_url), creator_b:creator_b_id(display_name, slug, photo_url)')
    .eq('status', status)
    .order('expires_at', { ascending: true })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pools: data })
}

// POST /api/clout/pools — admin-only. Creates either a single-creator pool
// (vs. their own rolling baseline) or a Creator Wars pool (head-to-head).
export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: user } = await supabase.from('users').select('role').eq('clerk_id', userId).single()
    if (user?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const body = await req.json()
    const {
      poolType = 'single',
      creatorAId,
      creatorBId,
      platform,
      metricType,
      windowLabel,
      baselineMetric,
      expiresAt,
      embedPlatformA,
      embedChannelIdA,
      embedPlatformB,
      embedChannelIdB,
      baselineShareA,
    } = body

    if (poolType !== 'single' && poolType !== 'war') {
      return NextResponse.json({ error: 'poolType must be "single" or "war"' }, { status: 400 })
    }
    if (!creatorAId) return NextResponse.json({ error: 'creatorAId is required' }, { status: 400 })
    if (poolType === 'war' && (!creatorBId || creatorBId === creatorAId)) {
      return NextResponse.json({ error: 'creatorBId is required and must differ from creatorAId for a War Pool' }, { status: 400 })
    }
    if (!platform || !METRIC_TYPES.includes(metricType)) {
      return NextResponse.json({ error: 'Invalid platform/metricType' }, { status: 400 })
    }
    if (!windowLabel || !(baselineMetric >= 0) || !expiresAt) {
      return NextResponse.json({ error: 'windowLabel, baselineMetric, and expiresAt are required' }, { status: 400 })
    }
    if (embedPlatformA && !EMBED_PLATFORMS.includes(embedPlatformA)) {
      return NextResponse.json({ error: 'embedPlatformA must be "youtube" or "twitch"' }, { status: 400 })
    }
    if (embedPlatformB && !EMBED_PLATFORMS.includes(embedPlatformB)) {
      return NextResponse.json({ error: 'embedPlatformB must be "youtube" or "twitch"' }, { status: 400 })
    }
    if (
      poolType === 'war' &&
      baselineShareA !== undefined &&
      baselineShareA !== null &&
      !(baselineShareA > 0 && baselineShareA < 1)
    ) {
      return NextResponse.json({ error: 'baselineShareA must be strictly between 0 and 1' }, { status: 400 })
    }

    const platformShareBps = body.platformShareBps ?? DEFAULT_PLATFORM_SHARE_BPS
    const creatorAShareBps =
      body.creatorAShareBps ?? (poolType === 'war' ? DEFAULT_WAR_CREATOR_SHARE_BPS : DEFAULT_SINGLE_CREATOR_SHARE_BPS)
    const creatorBShareBps = poolType === 'war' ? body.creatorBShareBps ?? DEFAULT_WAR_CREATOR_SHARE_BPS : 0

    const totalRakeBps = platformShareBps + creatorAShareBps + creatorBShareBps
    if (totalRakeBps <= 0 || totalRakeBps > 10000) {
      return NextResponse.json({ error: 'Rake shares must sum to something between 0 and 100%' }, { status: 400 })
    }

    const { data: pool, error } = await supabase
      .from('clout_pools')
      .insert({
        pool_type: poolType,
        creator_a_id: creatorAId,
        creator_b_id: poolType === 'war' ? creatorBId : null,
        platform,
        metric_type: metricType,
        window_label: windowLabel,
        baseline_metric: baselineMetric,
        current_metric: baselineMetric,
        current_metric_a: poolType === 'war' ? baselineMetric : null,
        current_metric_b: poolType === 'war' ? baselineMetric : null,
        // War Pool market-share baseline (0..1). Left null (defaults to 0.5 /
        // 50-50 inside clout_check_liquidations) unless the admin explicitly
        // overrides it — e.g. to seed a War Pool that opens already favoring
        // one creator's metric.
        baseline_share_a: poolType === 'war' ? baselineShareA ?? null : null,
        embed_platform_a: embedPlatformA ?? null,
        embed_channel_id_a: embedChannelIdA ?? null,
        embed_platform_b: poolType === 'war' ? (embedPlatformB ?? null) : null,
        embed_channel_id_b: poolType === 'war' ? (embedChannelIdB ?? null) : null,
        platform_share_bps: platformShareBps,
        creator_a_share_bps: creatorAShareBps,
        creator_b_share_bps: creatorBShareBps,
        expires_at: expiresAt,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, pool })
  } catch (err) {
    console.error('[clout:pools:create] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
