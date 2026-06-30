import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateTiers } from '@/lib/videoTiers'

// Fetch latest YouTube video for a channel
async function fetchLatestVideo(channelId: string): Promise<{ videoId: string; title: string; viewCount: number } | null> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return null

  // Search for latest video
  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&order=date&maxResults=1&key=${key}`
  )
  const searchData = await searchRes.json()
  if (searchData.error || !searchData.items?.[0]) return null

  const videoId = searchData.items[0].id.videoId
  const title = searchData.items[0].snippet.title

  // Get view count
  const statsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${key}`
  )
  const statsData = await statsRes.json()
  const viewCount = parseInt(statsData.items?.[0]?.statistics?.viewCount || '0')

  return { videoId, title, viewCount }
}

// POST: admin creates video bets for all YouTube creators automatically
export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: admin } = await supabase.from('users').select('*').eq('clerk_id', userId).single()
    if (!admin || admin.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const { creatorId, hours = 48 } = body

    // Get YouTube creators (with platform_id = channel ID)
    let query = supabase.from('creators').select('*').eq('platform', 'youtube').eq('status', 'approved').not('platform_id', 'is', null)
    if (creatorId) query = query.eq('id', creatorId) as any

    const { data: creators } = await query

    const results = []

    for (const c of creators || []) {
      // Skip if already has an open bet
      const { data: existingBet } = await supabase
        .from('video_bets')
        .select('id')
        .eq('creator_id', c.id)
        .eq('status', 'open')
        .maybeSingle()

      if (existingBet) {
        results.push({ creator: c.display_name, status: 'skipped', reason: 'already has open bet' })
        continue
      }

      // Fetch latest video
      const video = await fetchLatestVideo(c.platform_id)
      if (!video) {
        results.push({ creator: c.display_name, status: 'failed', reason: 'no video found' })
        continue
      }

      const subs = c.subscribers || c.declared_followers || 0
      const tiers = generateTiers(subs)
      if (tiers.length === 0) {
        results.push({ creator: c.display_name, status: 'failed', reason: 'could not generate tiers' })
        continue
      }

      const deadline = new Date(Date.now() + hours * 3600000).toISOString()

      // Create the bet
      const { data: bet, error: betErr } = await supabase.from('video_bets').insert({
        creator_id: c.id,
        question: `How many views will "${video.title.slice(0, 60)}" hit in ${hours}h?`,
        bet_type: 'tiered',
        deadline,
        status: 'open',
        video_id: video.videoId,
        video_title: video.title,
        start_views: video.viewCount,
        current_views: video.viewCount,
      }).select().single()

      if (betErr) {
        results.push({ creator: c.display_name, status: 'failed', reason: betErr.message })
        continue
      }

      // Create tier outcomes
      const outcomeRows = tiers.map((t, i) => ({
        bet_id: bet.id,
        label: t.label,
        target_views: t.target,
        sort_order: i,
        pool_amount: 0,
      }))
      await supabase.from('bet_outcomes').insert(outcomeRows)

      results.push({
        creator: c.display_name,
        status: 'created',
        video: video.title.slice(0, 50),
        tiers: tiers.map(t => t.label),
        deadline,
      })
    }

    return NextResponse.json({ success: true, results })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
