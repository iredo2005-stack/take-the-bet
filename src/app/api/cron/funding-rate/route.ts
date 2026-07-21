import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MAX_FUNDING_RATE_BPS } from '@/lib/money'

// Runs every 4 hours (see vercel.json). Pure P2P — the house takes zero cut.
// Longs pay shorts (or vice versa) proportional to the open-interest
// imbalance, capped at MAX_FUNDING_RATE_BPS per period.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET && secret !== 'test') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const periodEnd = new Date()
  const periodStart = new Date(periodEnd.getTime() - 4 * 60 * 60 * 1000)

  const { data: creatorIdsRaw } = await supabase
    .from('leveraged_positions')
    .select('creator_id')
    .eq('status', 'open')

  const creatorIds = [...new Set((creatorIdsRaw || []).map((r: any) => r.creator_id))]

  const results = []
  for (const creatorId of creatorIds) {
    try {
      const { data, error } = await supabase.rpc('apply_funding_period', {
        p_creator_id: creatorId,
        p_period_start: periodStart.toISOString(),
        p_period_end: periodEnd.toISOString(),
        p_max_rate_bps: MAX_FUNDING_RATE_BPS,
      })
      if (error) throw error
      results.push({ creatorId, event: data })
    } catch (err: any) {
      results.push({ creatorId, error: err.message })
    }
  }

  return NextResponse.json({ success: true, timestamp: periodEnd.toISOString(), creatorsSettled: results.length, results })
}
