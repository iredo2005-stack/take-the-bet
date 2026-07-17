// Content Deletion Handler ("Creator Rig Guard", spec §6C). Every fetch here
// is wrapped so a 404/403 (video deleted, post set to private, account gone)
// surfaces as a typed error the resolve-pools cron can catch and turn into an
// instant VOID + 100% refund, instead of crashing the cron or silently
// resolving against a zero/garbage reading.

export class ContentGoneError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContentGoneError'
  }
}

export type PoolPlatform = 'youtube' | 'twitch' | 'twitter' | 'instagram'

export async function fetchContentMetric(
  platform: PoolPlatform,
  externalId: string,
  metricType: 'views' | 'concurrent_viewers'
): Promise<number> {
  try {
    switch (platform) {
      case 'youtube':
        return await fetchYouTubeMetric(externalId, metricType)
      case 'twitch':
        return await fetchTwitchMetric(externalId, metricType)
      case 'twitter':
        return await fetchTwitterMetric(externalId)
      case 'instagram':
        return await fetchInstagramMetric(externalId)
    }
  } catch (err) {
    if (err instanceof ContentGoneError) throw err
    // Transient network/API failure — NOT a void condition, just re-throw so
    // the caller skips this cycle and retries on the next cron tick.
    throw err
  }
}

async function fetchYouTubeMetric(videoId: string, metricType: 'views' | 'concurrent_viewers'): Promise<number> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) throw new Error('YOUTUBE_API_KEY not configured')

  const part = metricType === 'concurrent_viewers' ? 'liveStreamingDetails' : 'statistics'
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=${part}&id=${videoId}&key=${key}`)
  const data = await res.json()

  if (res.status === 403) throw new ContentGoneError(`YouTube video ${videoId} forbidden (private/deleted)`)
  if (!data.items || data.items.length === 0) {
    throw new ContentGoneError(`YouTube video ${videoId} not found (deleted or private)`)
  }

  if (metricType === 'concurrent_viewers') {
    const concurrent = data.items[0]?.liveStreamingDetails?.concurrentViewers
    if (concurrent === undefined) throw new Error(`YouTube video ${videoId} is not currently live`)
    return parseInt(concurrent)
  }
  return parseInt(data.items[0]?.statistics?.viewCount || '0')
}

async function fetchTwitchMetric(channelLogin: string, metricType: 'views' | 'concurrent_viewers'): Promise<number> {
  const clientId = process.env.TWITCH_CLIENT_ID
  const clientSecret = process.env.TWITCH_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Twitch credentials not configured')

  const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
  })
  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) throw new Error(`Twitch auth failed: ${JSON.stringify(tokenData)}`)

  const streamRes = await fetch(`https://api.twitch.tv/helix/streams?user_login=${channelLogin}`, {
    headers: { 'Client-ID': clientId, Authorization: `Bearer ${tokenData.access_token}` },
  })
  const streamData = await streamRes.json()
  const stream = streamData.data?.[0]

  if (metricType === 'concurrent_viewers') {
    if (!stream) throw new ContentGoneError(`Twitch channel ${channelLogin} is not live (stream ended)`)
    return parseInt(stream.viewer_count) || 0
  }
  return 0
}

async function fetchTwitterMetric(tweetId: string): Promise<number> {
  const token = process.env.X_BEARER_TOKEN
  if (!token) throw new Error('X_BEARER_TOKEN not configured')

  const res = await fetch(`https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=public_metrics`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 404 || res.status === 403) {
    throw new ContentGoneError(`Tweet ${tweetId} not found (deleted/protected)`)
  }
  const data = await res.json()
  if (!data.data) throw new ContentGoneError(`Tweet ${tweetId} not found (deleted/protected)`)
  return data.data.public_metrics?.impression_count ?? 0
}

async function fetchInstagramMetric(mediaId: string): Promise<number> {
  const token = process.env.IG_ACCESS_TOKEN
  if (!token) throw new Error('IG_ACCESS_TOKEN not configured')

  const res = await fetch(`https://graph.facebook.com/v19.0/${mediaId}/insights?metric=impressions&access_token=${token}`)
  if (res.status === 404 || res.status === 400) {
    throw new ContentGoneError(`Instagram media ${mediaId} not found (deleted/private)`)
  }
  const data = await res.json()
  if (data.error) throw new ContentGoneError(`Instagram media ${mediaId} unavailable: ${data.error.message}`)
  return data.data?.[0]?.values?.[0]?.value ?? 0
}
