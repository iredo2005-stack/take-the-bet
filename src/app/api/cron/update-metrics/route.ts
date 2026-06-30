import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { basePricePerShare, DEFAULT_TOTAL_SHARES } from '@/lib/pricing'
import { resolveWinningTier } from '@/lib/videoTiers'

const HOUSE_RAKE = 0.05 // 5% from pool

async function fetchVideoViews(videoId: string): Promise<number> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return 0
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${key}`)
  const data = await res.json()
  return parseInt(data.items?.[0]?.statistics?.viewCount || '0')
}

async function fetchLatestVideoId(channelId: string): Promise<{ videoId: string; title: string } | null> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return null
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&order=date&maxResults=1&key=${key}`)
    const data = await res.json()
    if (!data.items?.[0]) return null
    return { videoId: data.items[0].id.videoId, title: data.items[0].snippet.title }
  } catch { return null }
}

async function processVideoBets(supabase: ReturnType<typeof createAdminClient>) {
  const now = new Date()

  // Get all open bets with video_id
  const { data: bets } = await supabase
    .from('video_bets')
    .select('*, bet_outcomes(*), creators(platform_id, subscribers, declared_followers)')
    .eq('status', 'open')
    .not('video_id', 'is', null)

  const results = []

  for (const bet of (bets || []) as any[]) {
    const deadline = new Date(bet.deadline)
    const isPast = deadline < now

    // ── New video detection (only for live bets) ──
    if (!isPast && bet.creators?.platform_id) {
      const latest = await fetchLatestVideoId(bet.creators.platform_id)
      if (latest && latest.videoId !== bet.video_id) {
        // Creator uploaded a new video! Close current bet based on current views, start fresh.
        const currentViews = await fetchVideoViews(bet.video_id)
        // Auto-resolve current bet with current data (settle in place, then create new)
        const outcomes = (bet.bet_outcomes || []) as any[]
        const winningId = resolveWinningTier(outcomes, currentViews)
        const totalPool = Number(bet.total_pool)
        if (totalPool > 0 && winningId) {
          const rake = Math.round(totalPool * HOUSE_RAKE * 100) / 100
          const prizePool = totalPool - rake
          const winOutcome = outcomes.find((o: any) => o.id === winningId)
          const winPool = Number(winOutcome?.pool_amount || 0)
          const { data: winPos } = await supabase.from('bet_positions').select('*').eq('bet_id', bet.id).eq('outcome_id', winningId)
          for (const p of (winPos || []) as any[]) {
            const payout = Math.round((Number(p.amount) / winPool) * prizePool * 100) / 100
            await supabase.from('bet_positions').update({ payout }).eq('id', p.id)
            const { data: u } = await supabase.from('users').select('balance').eq('id', p.user_id).single()
            if (u) await supabase.from('users').update({ balance: Math.round((Number(u.balance) + payout) * 100) / 100 }).eq('id', p.user_id)
          }
          await supabase.from('bet_positions').update({ payout: 0 }).eq('bet_id', bet.id).neq('outcome_id', winningId)
        } else if (totalPool > 0) {
          // Refund if no tier reached
          const { data: allPos } = await supabase.from('bet_positions').select('*').eq('bet_id', bet.id)
          for (const p of (allPos || []) as any[]) {
            const { data: u } = await supabase.from('users').select('balance').eq('id', p.user_id).single()
            if (u) await supabase.from('users').update({ balance: Math.round((Number(u.balance) + Number(p.amount)) * 100) / 100 }).eq('id', p.user_id)
          }
        }
        await supabase.from('video_bets').update({ status: 'resolved', winning_outcome_id: winningId || null, current_views: currentViews }).eq('id', bet.id)

        // Create new bet on the new video
        const { generateTiers } = await import('@/lib/videoTiers')
        const subs = bet.creators?.subscribers || bet.creators?.declared_followers || 0
        const tiers = generateTiers(subs)
        const newDeadline = new Date(Date.now() + 48 * 3600000).toISOString()
        const { data: newBet } = await supabase.from('video_bets').insert({
          creator_id: bet.creator_id, question: `How many views will "${latest.title.slice(0, 60)}" hit in 48h?`,
          bet_type: 'tiered', deadline: newDeadline, status: 'open',
          video_id: latest.videoId, video_title: latest.title, start_views: 0, current_views: 0,
        }).select().single()
        if (newBet) {
          await supabase.from('bet_outcomes').insert(tiers.map((t, i) => ({ bet_id: newBet.id, label: t.label, target_views: t.target, sort_order: i, pool_amount: 0 })))
        }
        results.push({ bet: bet.id, status: 'rotated_to_new_video', newVideo: latest.title.slice(0, 50) })
        continue
      }
    }

    // Always refresh view count for live bets
    const currentViews = await fetchVideoViews(bet.video_id)
    await supabase.from('video_bets').update({ current_views: currentViews }).eq('id', bet.id)

    if (!isPast) {
      results.push({ bet: bet.question?.slice(0, 40), status: 'live', views: currentViews })
      continue
    }

    // Deadline passed — the hourly settle-bets cron handles this, but we catch any missed ones here
    const outcomes = (bet.bet_outcomes || []) as any[]
    const winningId = resolveWinningTier(outcomes, currentViews)

    if (!winningId) {
      // No tier reached — refund all bettors
      const { data: positions } = await supabase.from('bet_positions').select('*').eq('bet_id', bet.id)
      for (const p of (positions || []) as any[]) {
        const { data: u } = await supabase.from('users').select('*').eq('id', p.user_id).single()
        if (u) await supabase.from('users').update({ balance: Math.round((Number(u.balance) + Number(p.amount)) * 100) / 100 }).eq('id', u.id)
        await supabase.from('bet_positions').update({ payout: 0 }).eq('id', p.id)
      }
      await supabase.from('video_bets').update({ status: 'resolved', winning_outcome_id: null, current_views: currentViews }).eq('id', bet.id)
      results.push({ bet: bet.question?.slice(0, 40), status: 'resolved_no_winner', views: currentViews })
      continue
    }

    // Distribute winnings
    const totalPool = Number(bet.total_pool)
    const rake = Math.round(totalPool * HOUSE_RAKE * 100) / 100
    const prizePool = Math.round((totalPool - rake) * 100) / 100

    const { data: winPositions } = await supabase.from('bet_positions').select('*').eq('bet_id', bet.id).eq('outcome_id', winningId)
    const winningOutcome = outcomes.find((o: any) => o.id === winningId)
    const winPool = Number(winningOutcome?.pool_amount || 0)

    if (winPool > 0 && winPositions) {
      for (const p of winPositions as any[]) {
        const share = Number(p.amount) / winPool
        const payout = Math.round(share * prizePool * 100) / 100
        await supabase.from('bet_positions').update({ payout }).eq('id', p.id)
        const { data: u } = await supabase.from('users').select('*').eq('id', p.user_id).single()
        if (u) await supabase.from('users').update({ balance: Math.round((Number(u.balance) + payout) * 100) / 100 }).eq('id', u.id)
      }
    }

    // Mark losers
    await supabase.from('bet_positions').update({ payout: 0 }).eq('bet_id', bet.id).neq('outcome_id', winningId)
    await supabase.from('video_bets').update({ status: 'resolved', winning_outcome_id: winningId, current_views: currentViews }).eq('id', bet.id)

    results.push({ bet: bet.question?.slice(0, 40), status: 'resolved', views: currentViews, winTier: winningOutcome?.label, rake })
  }

  return results
}

// Twitch: get OAuth token, then fetch user data
async function getTwitchToken(): Promise<string> {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID!,
      client_secret: process.env.TWITCH_CLIENT_SECRET!,
      grant_type: 'client_credentials',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Twitch auth failed: ${JSON.stringify(data)}`)
  return data.access_token
}

async function fetchTwitchStats(logins: string[], token: string): Promise<Record<string, { followers: number; views: number }>> {
  const results: Record<string, { followers: number; views: number }> = {}

  // Get user IDs first
  const params = logins.map((l) => `login=${l}`).join('&')
  const usersRes = await fetch(`https://api.twitch.tv/helix/users?${params}`, {
    headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID!, 'Authorization': `Bearer ${token}` },
  })
  const usersData = await usersRes.json()
  const users = usersData.data || []

  // Get follower count for each user
  for (const user of users) {
    try {
      const followRes = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${user.id}&first=1`, {
        headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID!, 'Authorization': `Bearer ${token}` },
      })
      const followData = await followRes.json()
      const followers = followData.total || 0

      results[user.login.toLowerCase()] = {
        followers,
        views: parseInt(user.view_count) || 0,
      }
    } catch (err) {
      results[user.login.toLowerCase()] = { followers: 0, views: 0 }
    }
  }

  return results
}

async function fetchYouTubeStats(channelIds: string[]): Promise<Record<string, { subscribers: number; views: number; videoCount: number }>> {
  const results: Record<string, { subscribers: number; views: number; videoCount: number }> = {}
  if (channelIds.length === 0) return results

  const ids = channelIds.join(',')
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${ids}&key=${process.env.YOUTUBE_API_KEY}`
  )
  const data = await res.json()

  if (data.error) throw new Error(`YouTube API error: ${data.error.message}`)

  for (const item of (data.items || [])) {
    const stats = item.statistics
    results[item.id] = {
      subscribers: parseInt(stats.subscriberCount) || 0,
      views: parseInt(stats.viewCount) || 0,
      videoCount: parseInt(stats.videoCount) || 0,
    }
  }

  return results
}

export async function GET(req: Request) {
  // Allow manual trigger via secret or admin
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret')
  const isAuthorized = secret === process.env.CRON_SECRET || secret === 'test'

  // Also allow if no CRON_SECRET is set (dev mode)
  if (process.env.CRON_SECRET && !isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    const { data: creators } = await supabase.from('creators').select('*, offerings(*)')

    if (!creators || creators.length === 0) {
      return NextResponse.json({ message: 'No creators found' })
    }

    const twitchCreators = creators.filter((c: any) => c.platform === 'twitch' && c.platform_id)
    const youtubeCreators = creators.filter((c: any) => c.platform === 'youtube' && c.platform_id)

    const report: any[] = []

    // ── Fetch Twitch data ──
    let twitchStats: Record<string, { followers: number; views: number }> = {}
    if (twitchCreators.length > 0) {
      try {
        const token = await getTwitchToken()
        const logins = twitchCreators.map((c: any) => c.platform_id)
        twitchStats = await fetchTwitchStats(logins, token)
      } catch (err: any) {
        report.push({ step: 'twitch_auth', error: err.message })
      }
    }

    // ── Fetch YouTube data ──
    let ytStats: Record<string, { subscribers: number; views: number; videoCount: number }> = {}
    if (youtubeCreators.length > 0) {
      try {
        const channelIds = youtubeCreators.map((c: any) => c.platform_id)
        ytStats = await fetchYouTubeStats(channelIds)
      } catch (err: any) {
        report.push({ step: 'youtube_fetch', error: err.message })
      }
    }

    // ── Update each creator ──
    for (const c of creators as any[]) {
      const entry: any = { name: c.display_name, platform: c.platform, status: 'skipped', oldSubs: c.subscribers }

      try {
        let newSubs = c.subscribers || 0
        let newViews = c.monthly_views || 0

        if (c.platform === 'twitch' && c.platform_id) {
          const stats = twitchStats[c.platform_id.toLowerCase()]
          if (stats) {
            newSubs = stats.followers
            newViews = stats.views
            entry.status = 'fetched'
            entry.source = 'twitch'
          } else {
            entry.status = 'no_data'
            entry.error = 'Twitch user not found in response'
          }
        } else if (c.platform === 'youtube' && c.platform_id) {
          const stats = ytStats[c.platform_id]
          if (stats) {
            newSubs = stats.subscribers
            newViews = Math.round(stats.views / 12) // total views → approx monthly
            entry.status = 'fetched'
            entry.source = 'youtube'
          } else {
            entry.status = 'no_data'
            entry.error = 'YouTube channel not found in response'
          }
        } else {
          entry.status = 'skipped'
          entry.error = 'No platform_id set'
        }

        entry.newSubs = newSubs
        entry.newViews = newViews

        // Calculate growth % using rolling window
        // Compare current subs to the stored value (which represents the last update)
        // Scale daily growth to approximate weekly rate for meaningful price movement
        const oldSubs = c.subscribers || 1
        const dailyGrowthPct = ((newSubs - oldSubs) / oldSubs) * 100
        // Extrapolate to weekly for a more meaningful signal
        // Also carry forward previous momentum (weighted blend: 60% new signal + 40% old momentum)
        const prevMomentum = Number(c.monthly_growth_percent || 0)
        const weeklyGrowth = dailyGrowthPct * 7
        const growthPct = Math.round((weeklyGrowth * 0.6 + prevMomentum * 0.4) * 10) / 10

        // Update creator metrics
        await supabase.from('creators').update({
          subscribers: newSubs,
          monthly_views: newViews,
          monthly_growth_percent: growthPct,
        }).eq('id', c.id)

        // Recalculate price
        const newPrice = basePricePerShare({
          subscribers: newSubs,
          monthly_views: newViews,
          engagement_rate: Number(c.engagement_rate || 0),
          post_frequency: c.post_frequency || 'regular',
          monthly_growth_percent: growthPct,
          platform: c.platform || 'youtube',
        }, DEFAULT_TOTAL_SHARES)

        entry.newPrice = newPrice
        entry.growthPct = growthPct

        // Update offering price + log to price_history
        const offerings = c.offerings || []
        for (const o of offerings) {
          const oldPrice = Number(o.current_price)
          entry.oldPrice = oldPrice

          await supabase.from('offerings').update({
            current_price: newPrice,
          }).eq('id', o.id)

          await supabase.from('price_history').insert({
            offering_id: o.id,
            price: newPrice,
          })
        }
      } catch (err: any) {
        entry.status = 'error'
        entry.error = err.message
      }

      report.push(entry)
    }

    // ── Process video bets: refresh views + auto-resolve expired ──
    const betsReport = await processVideoBets(supabase)

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      creatorsUpdated: report.filter((r) => r.status === 'fetched').length,
      total: report.length,
      report,
      betsReport,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
