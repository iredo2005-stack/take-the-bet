import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPredictionPool } from '@/lib/predictionPools'

// GET /api/pools — public list of open (and recently resolved) pools.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const status = url.searchParams.get('status') ?? 'open'

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('prediction_pools')
    .select('*, creators(display_name, slug, photo_url)')
    .eq('status', status)
    .order('expires_at', { ascending: true })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pools: data })
}

// POST /api/pools — manually spin up a 48h pool (admin/demo path). In
// production the normal path is automatic: a webhook/poller in
// /api/webhooks/* or /api/cron/poll-* detects new content and calls
// createPredictionPool() directly.
export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: user } = await supabase.from('users').select('role').eq('clerk_id', userId).single()
    if (user?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const body = await req.json()
    const { creatorId, platform, contentExternalId, contentTitle, contentUrl, metricType, rollingAvgMetric } = body

    if (!creatorId || !platform || !contentExternalId || !(rollingAvgMetric >= 0)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const result = await createPredictionPool(supabase, {
      creatorId, platform, contentExternalId, contentTitle, contentUrl, metricType, rollingAvgMetric,
    })

    if (result.duplicate) {
      return NextResponse.json({ error: 'A pool for this content is already open' }, { status: 409 })
    }
    return NextResponse.json({ success: true, pool: result.data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
