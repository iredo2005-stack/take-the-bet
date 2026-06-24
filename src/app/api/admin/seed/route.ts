import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateSlug } from '@/lib/utils'

const SEED_CREATORS = [
  { name: 'Ninja', platform: 'twitch', subs: 18_900_000, views: 5_000_000, eng: 0.035, freq: 'regular', growth: 2 },
  { name: 'Pokimane', platform: 'twitch', subs: 9_400_000, views: 3_200_000, eng: 0.052, freq: 'regular', growth: 5 },
  { name: 'Shroud', platform: 'twitch', subs: 10_100_000, views: 2_800_000, eng: 0.041, freq: 'rare', growth: 1 },
  { name: 'xQc', platform: 'twitch', subs: 12_500_000, views: 8_500_000, eng: 0.063, freq: 'regular', growth: 12 },
  { name: 'IShowSpeed', platform: 'youtube', subs: 30_000_000, views: 45_000_000, eng: 0.078, freq: 'regular', growth: 25 },
  { name: 'Kai Cenat', platform: 'twitch', subs: 14_000_000, views: 20_000_000, eng: 0.085, freq: 'regular', growth: 18 },
  { name: 'Valkyrae', platform: 'youtube', subs: 4_100_000, views: 1_500_000, eng: 0.048, freq: 'regular', growth: 3 },
  { name: 'DrDisrespect', platform: 'youtube', subs: 4_500_000, views: 2_000_000, eng: 0.038, freq: 'rare', growth: -2 },
]

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: admin } = await supabase.from('users').select('*').eq('clerk_id', userId).single()
    if (!admin || admin.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const results = []

    for (const c of SEED_CREATORS) {
      // Check if already exists
      const baseSlug = generateSlug(c.name)
      let slug = baseSlug
      let suffix = 2
      while (true) {
        const { data: taken } = await supabase.from('creators').select('id').eq('slug', slug).maybeSingle()
        if (!taken) break
        slug = `${baseSlug}-${suffix}`
        suffix++
      }

      const { data: creator, error: cErr } = await supabase.from('creators').insert({
        display_name: c.name,
        slug,
        status: 'approved',
        platform: c.platform,
        declared_followers: c.subs,
        subscribers: c.subs,
        monthly_views: c.views,
        engagement_rate: c.eng,
        post_frequency: c.freq,
        monthly_growth_percent: c.growth,
      }).select().single()

      if (cErr) { results.push({ name: c.name, error: cErr.message }); continue }

      // Calculate price
      const rawBase = (c.subs * 0.01) + (c.views * 0.001) + (c.eng * 100)
      const fm: Record<string, number> = { regular: 1, rare: 0.8, inactive: 0.6 }
      const gm = c.growth >= 20 ? 1.5 : c.growth >= 5 ? 1.2 : c.growth >= 0 ? 1.0 : 0.7
      const baseValue = rawBase * (fm[c.freq] ?? 1) * gm
      const initialPrice = Math.max(0.01, Math.round((baseValue / 1000) * 100) / 100)
      const treasury = 200

      const { data: offering } = await supabase.from('offerings').insert({
        creator_id: creator.id,
        title: `${c.name} Shares`,
        description: `Invest in ${c.name}. Price tracks real growth.`,
        total_shares: 1000,
        shares_available: 800,
        initial_price: initialPrice,
        current_price: initialPrice,
        status: 'active',
        primary_commission_rate: 0.05,
        treasury_shares: treasury,
      }).select().single()

      if (offering) {
        await supabase.from('price_history').insert({ offering_id: offering.id, price: initialPrice })
      }

      results.push({ name: c.name, slug, price: initialPrice })
    }

    return NextResponse.json({ success: true, results })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
