import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_id', userId)
      .single()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { data: creator } = await supabase
      .from('creators')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: 'Not a creator' }, { status: 403 })
    }

    if (creator.status !== 'approved') {
      return NextResponse.json(
        { error: 'Your creator application is still pending review. You can create an offering once approved.' },
        { status: 403 }
      )
    }

    // One active offering per creator
    const { data: existing } = await supabase
      .from('offerings')
      .select('*')
      .eq('creator_id', creator.id)
      .eq('status', 'active')
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'You already have an active offering' }, { status: 409 })
    }

    const body = await req.json()
    const { title, description, imageUrl, totalShares, initialPrice } = body

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }
    if (!description?.trim()) {
      return NextResponse.json({ error: 'Bio / description is required' }, { status: 400 })
    }
    if (!imageUrl?.trim()) {
      return NextResponse.json({ error: 'Image URL is required' }, { status: 400 })
    }
    if (!totalShares || totalShares < 1) {
      return NextResponse.json({ error: 'Total shares must be at least 1' }, { status: 400 })
    }
    if (!initialPrice || initialPrice <= 0) {
      return NextResponse.json({ error: 'Price must be greater than 0' }, { status: 400 })
    }

    const commissionRate = parseFloat(process.env.PRIMARY_COMMISSION_RATE || '0.05')

    // 20% of shares held by platform treasury for liquidity
    const treasury = Math.floor(totalShares * 0.20)
    const available = totalShares - treasury

    const { data: offering, error: offeringError } = await supabase
      .from('offerings')
      .insert({
        creator_id: creator.id,
        title: title.trim(),
        description: description.trim(),
        image_url: imageUrl.trim(),
        total_shares: totalShares,
        shares_available: available,
        initial_price: initialPrice,
        current_price: initialPrice,
        status: 'active',
        primary_commission_rate: commissionRate,
        treasury_shares: treasury,
      })
      .select()
      .single()

    if (offeringError) {
      console.error('[offerings] Insert error:', offeringError)
      return NextResponse.json({ error: offeringError.message }, { status: 500 })
    }

    await supabase.from('price_history').insert({
      offering_id: offering.id,
      price: initialPrice,
    })

    return NextResponse.json({ success: true, offering })
  } catch (err) {
    console.error('[offerings] Unexpected error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 }
    )
  }
}
