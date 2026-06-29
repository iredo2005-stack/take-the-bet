import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { basePricePerShare, DEFAULT_TOTAL_SHARES, MIN_SHARE_PRICE, TREASURY_PERCENT } from '@/lib/pricing'

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: admin } = await supabase.from('users').select('*').eq('clerk_id', userId).single()
    if (!admin || admin.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const { data: creators } = await supabase.from('creators').select('*, offerings(*)')
    const results = []
    const TOTAL_SHARES = DEFAULT_TOTAL_SHARES
    const TREASURY = Math.floor(TOTAL_SHARES * TREASURY_PERCENT)

    for (const c of (creators || []) as any[]) {
      const newPrice = basePricePerShare({
        subscribers: c.subscribers ?? 0,
        monthly_views: c.monthly_views ?? 0,
        engagement_rate: Number(c.engagement_rate ?? 0),
        post_frequency: c.post_frequency ?? 'regular',
        monthly_growth_percent: Number(c.monthly_growth_percent ?? 0),
        platform: c.platform ?? 'youtube',
      }, TOTAL_SHARES)

      const offerings = c.offerings || []
      for (const o of offerings) {
        const sharesSold = o.shares_sold || 0
        await supabase.from('offerings').update({
          total_shares: TOTAL_SHARES,
          treasury_shares: TREASURY,
          shares_available: Math.max(0, (TOTAL_SHARES - TREASURY) - sharesSold),
          initial_price: newPrice,
          current_price: newPrice,
        }).eq('id', o.id)

        await supabase.from('price_history').delete().eq('offering_id', o.id)
        await supabase.from('price_history').insert({ offering_id: o.id, price: newPrice })
      }

      results.push({ name: c.display_name, subs: c.subscribers ?? 0, platform: c.platform, price: newPrice })
    }

    results.sort((a, b) => b.price - a.price)
    return NextResponse.json({ success: true, results })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
