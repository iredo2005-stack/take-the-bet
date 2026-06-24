import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateSlug } from '@/lib/utils'

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: admin } = await supabase.from('users').select('*').eq('clerk_id', userId).single()
    if (!admin || admin.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const body = await req.json()
    const { displayName, photoUrl, platform, subscribers, monthlyViews, engagementRate, postFrequency, monthlyGrowthPercent } = body

    if (!displayName?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (!subscribers || subscribers < 1) return NextResponse.json({ error: 'Subscribers required' }, { status: 400 })

    // Generate unique slug
    const baseSlug = generateSlug(displayName)
    let slug = baseSlug
    let suffix = 2
    while (true) {
      const { data: taken } = await supabase.from('creators').select('id').eq('slug', slug).maybeSingle()
      if (!taken) break
      slug = `${baseSlug}-${suffix}`
      suffix++
    }

    // Create creator (no user_id — admin-added public figures aren't registered users)
    const { data: creator, error: createErr } = await supabase.from('creators').insert({
      display_name: displayName.trim(),
      photo_url: photoUrl?.trim() || null,
      bio: null,
      slug,
      status: 'approved',
      platform: platform || 'youtube',
      declared_followers: subscribers,
      subscribers,
      monthly_views: monthlyViews || 0,
      engagement_rate: engagementRate || 0,
      post_frequency: postFrequency || 'regular',
      monthly_growth_percent: monthlyGrowthPercent || 0,
    }).select().single()

    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 })

    // Calculate initial price from metrics
    const rawBase = (subscribers * 0.01) + ((monthlyViews || 0) * 0.001) + ((engagementRate || 0) * 100)
    const fm: Record<string, number> = { regular: 1, rare: 0.8, inactive: 0.6 }
    const gp = monthlyGrowthPercent || 0
    const gm = gp >= 20 ? 1.5 : gp >= 5 ? 1.2 : gp >= 0 ? 1.0 : 0.7
    const baseValue = rawBase * (fm[postFrequency] ?? 1) * gm
    const totalShares = 100_000
    const initialPrice = Math.max(0.01, Math.round((baseValue / totalShares) * 100) / 100)

    const commissionRate = parseFloat(process.env.PRIMARY_COMMISSION_RATE || '0.05')
    const treasury = Math.floor(totalShares * 0.20)

    // Auto-create offering
    const { data: offering, error: offerErr } = await supabase.from('offerings').insert({
      creator_id: creator.id,
      title: `${displayName.trim()} Shares`,
      description: `Invest in ${displayName.trim()}. Share price tracks real growth metrics.`,
      image_url: photoUrl?.trim() || null,
      total_shares: totalShares,
      shares_available: totalShares - treasury,
      initial_price: initialPrice,
      current_price: initialPrice,
      status: 'active',
      primary_commission_rate: commissionRate,
      treasury_shares: treasury,
    }).select().single()

    if (offerErr) return NextResponse.json({ error: offerErr.message }, { status: 500 })

    // Seed price history
    await supabase.from('price_history').insert({ offering_id: offering.id, price: initialPrice })

    return NextResponse.json({ success: true, creator, offering, initialPrice })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
