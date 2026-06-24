import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const TOTAL_SHARES = 100_000
const TREASURY = 20_000
const MIN_PRICE = 0.25

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: admin } = await supabase.from('users').select('*').eq('clerk_id', userId).single()
    if (!admin || admin.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    // Get all creators with their offerings
    const { data: creators } = await supabase.from('creators').select('*, offerings(*)')

    const results = []

    for (const c of (creators || []) as any[]) {
      const subs = c.subscribers ?? 0
      const views = c.monthly_views ?? 0
      const eng = Number(c.engagement_rate ?? 0)
      const freq = c.post_frequency ?? 'regular'
      const growth = Number(c.monthly_growth_percent ?? 0)

      // Calculate price
      const rawBase = (subs * 0.01) + (views * 0.001) + (eng * 100)
      const fm: Record<string, number> = { regular: 1.0, rare: 0.8, inactive: 0.6 }
      const gm = growth >= 20 ? 1.5 : growth >= 5 ? 1.2 : growth >= 0 ? 1.0 : 0.7
      const baseValue = rawBase * (fm[freq] ?? 1) * gm
      const newPrice = Math.max(MIN_PRICE, Math.round((baseValue / TOTAL_SHARES) * 100) / 100)

      // Update each offering for this creator
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

        // Reset price history to the new price
        await supabase.from('price_history').delete().eq('offering_id', o.id)
        await supabase.from('price_history').insert({ offering_id: o.id, price: newPrice })
      }

      results.push({
        name: c.display_name,
        subs,
        views,
        growth,
        freq,
        price: newPrice,
      })
    }

    // Sort by price descending for display
    results.sort((a, b) => b.price - a.price)

    return NextResponse.json({ success: true, results })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
