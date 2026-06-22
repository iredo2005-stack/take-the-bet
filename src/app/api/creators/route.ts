import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateSlug } from '@/lib/utils'
import { PLATFORMS, type PlatformKey } from '@/lib/platforms'

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()

    const { data: user } = await supabase
      .from('users')
      .select('id, age_verified')
      .eq('clerk_id', userId)
      .single()

    if (!user || !user.age_verified) {
      return NextResponse.json({ error: 'Age verification required' }, { status: 403 })
    }

    const { data: existing } = await supabase
      .from('creators')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Already applied' }, { status: 409 })
    }

    const body = await req.json()
    const { displayName, bio, photoUrl, platform, declaredFollowers, profileUrl } = body

    if (!displayName?.trim()) {
      return NextResponse.json({ error: 'Display name is required' }, { status: 400 })
    }
    if (!platform || !PLATFORMS[platform as PlatformKey]) {
      return NextResponse.json({ error: 'Select a valid platform' }, { status: 400 })
    }
    if (!declaredFollowers || declaredFollowers < 1) {
      return NextResponse.json({ error: 'Follower count is required' }, { status: 400 })
    }
    if (!profileUrl?.trim()) {
      return NextResponse.json({ error: 'Profile link is required' }, { status: 400 })
    }

    const platformInfo = PLATFORMS[platform as PlatformKey]
    if (declaredFollowers < platformInfo.min) {
      return NextResponse.json(
        { error: `Minimum ${platformInfo.min.toLocaleString()} ${platformInfo.unit} required for ${platformInfo.label}. You declared ${declaredFollowers.toLocaleString()}.` },
        { status: 400 }
      )
    }

    // Generate clean slug
    const baseSlug = generateSlug(displayName)
    let slug = baseSlug
    let suffix = 2

    while (true) {
      const { data: taken } = await supabase
        .from('creators')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()

      if (!taken) break
      slug = `${baseSlug}-${suffix}`
      suffix++
    }

    const { data: creator, error: createError } = await supabase
      .from('creators')
      .insert({
        user_id: user.id,
        display_name: displayName.trim(),
        bio: bio?.trim() || null,
        photo_url: photoUrl?.trim() || null,
        slug,
        status: 'pending',
        platform,
        declared_followers: declaredFollowers,
        profile_url: profileUrl.trim(),
      })
      .select()
      .single()

    if (createError) {
      console.error('[creators] Insert error:', createError)
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }

    await supabase
      .from('users')
      .update({ role: 'creator' })
      .eq('id', user.id)

    return NextResponse.json({ success: true, creator })
  } catch (err) {
    console.error('[creators] Unexpected error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 }
    )
  }
}
