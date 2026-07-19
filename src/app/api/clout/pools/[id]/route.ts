import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { centsToDollars } from '@/lib/money'

type Props = { params: Promise<{ id: string }> }

// GET /api/clout/pools/[id] — pool details shaped for the frontend, with a
// clean embed{} object per creator so the client can render the right
// iframe (YouTube or Twitch) without knowing the raw column layout. War
// Pools carry both; single pools only ever populate creatorA.
//
// $CLOUT is displayed 1:1 against USDC ("1 $CLOUT = $1"), so pool cash
// values are converted from integer cents to dollar-denominated *Usdc
// fields right here at the API boundary — the DB and every settlement/
// liquidation calculation stay in integer cents throughout.
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

    // Aggregate open-position notional per side — the Trade Module's live
    // payout preview needs this (clout_calculate_live_payout's prize split is
    // by notional, not by cash contributed), and it's cheap: one indexed
    // query, summed in JS rather than a round trip through a new RPC.
    const { data: openPositions, error: posError } = await supabase
      .from('clout_pool_positions')
      .select('side, notional_cents')
      .eq('pool_id', id)
      .eq('status', 'open')

    if (posError) return NextResponse.json({ error: posError.message }, { status: 500 })

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

    return NextResponse.json({
      pool: {
        id: pool.id,
        poolType: pool.pool_type,
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
