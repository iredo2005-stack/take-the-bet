// Standalone always-on worker that samples live concurrent-viewer metrics for
// currently-live creators and writes ticks to Supabase. The frontend
// subscribes to those inserts via Supabase Realtime (a managed WebSocket
// pipeline) for push updates without us running a bespoke Socket.io server —
// see README "Live streaming architecture" for why.
//
// Run with: node scripts/liveIngest.mjs
// Needs a long-lived process (a small VM / Railway / Fly worker, NOT a
// Vercel serverless function, which cannot stay resident between ticks).
//
// Poll interval is capped by upstream API quotas, not by us — Twitch/YouTube
// don't push viewer-count changes, so "live" here means: sample every few
// seconds, and push each sample to the frontend within the same second via
// Realtime. That push leg is the part that's actually sub-second.

import { createClient } from '@supabase/supabase-js'

const POLL_INTERVAL_MS = Number(process.env.LIVE_INGEST_INTERVAL_MS || 3000)

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let twitchToken = null
let twitchTokenExpiresAt = 0

async function getTwitchToken() {
  if (twitchToken && Date.now() < twitchTokenExpiresAt) return twitchToken
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID,
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Twitch auth failed: ${JSON.stringify(data)}`)
  twitchToken = data.access_token
  twitchTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000
  return twitchToken
}

async function fetchTwitchConcurrentViewers(login) {
  const token = await getTwitchToken()
  const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${login}`, {
    headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  const stream = data.data?.[0]
  return stream ? stream.viewer_count : null // null = no longer live
}

async function fetchYouTubeConcurrentViewers(videoId) {
  const key = process.env.YOUTUBE_API_KEY
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${videoId}&key=${key}`
  )
  const data = await res.json()
  const concurrent = data.items?.[0]?.liveStreamingDetails?.concurrentViewers
  return concurrent !== undefined ? parseInt(concurrent) : null
}

function computeIndexPrice(base, realtime, rollingAvg) {
  if (rollingAvg <= 0) return base
  const ratio = realtime / rollingAvg
  const clamped = Math.max(0.5, Math.min(2.0, ratio))
  return Math.round(base * clamped * 10000) / 10000
}

async function tick() {
  const { data: liveCreators, error } = await supabase
    .from('creators')
    .select('id, platform, platform_id, base_index_price, rolling_avg_metric, last_seen_content_id')
    .eq('is_live', true)

  if (error) {
    console.error('[liveIngest] fetch creators failed:', error.message)
    return
  }

  for (const creator of liveCreators || []) {
    try {
      let metric = null
      if (creator.platform === 'twitch') {
        metric = await fetchTwitchConcurrentViewers(creator.platform_id)
      } else if (creator.platform === 'youtube' && creator.last_seen_content_id) {
        metric = await fetchYouTubeConcurrentViewers(creator.last_seen_content_id)
      }

      if (metric === null) {
        await supabase.from('creators').update({ is_live: false }).eq('id', creator.id)
        continue
      }

      const indexPrice = computeIndexPrice(Number(creator.base_index_price), metric, Number(creator.rolling_avg_metric))

      await supabase.from('creators').update({ realtime_metric: metric, index_price: indexPrice }).eq('id', creator.id)
      await supabase.from('live_ticks').insert({
        creator_id: creator.id,
        index_price: indexPrice,
        realtime_metric: metric,
        is_live: true,
      })
    } catch (err) {
      console.error(`[liveIngest] creator ${creator.id} failed:`, err.message)
    }
  }
}

console.log(`[liveIngest] starting, polling every ${POLL_INTERVAL_MS}ms`)
setInterval(() => {
  tick().catch((err) => console.error('[liveIngest] tick failed:', err))
}, POLL_INTERVAL_MS)
tick().catch((err) => console.error('[liveIngest] initial tick failed:', err))
