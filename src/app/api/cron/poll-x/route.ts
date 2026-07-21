import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleNewContent } from '@/lib/ingestion'

// X (Twitter) has no free real-time webhook for arbitrary accounts, so this
// runs on a schedule (see vercel.json) and diffs against the last-seen tweet
// id we stored on the creator row.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET && secret !== 'test') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.X_BEARER_TOKEN
  if (!token) return NextResponse.json({ error: 'X_BEARER_TOKEN not configured' }, { status: 500 })

  const supabase = createAdminClient()
  const { data: creators } = await supabase
    .from('creators')
    .select('id, platform_id, last_seen_content_id')
    .eq('platform', 'twitter')
    .not('platform_id', 'is', null)

  const results = []
  for (const creator of creators || []) {
    try {
      const userRes = await fetch(`https://api.twitter.com/2/users/by/username/${creator.platform_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const userData = await userRes.json()
      const xUserId = userData.data?.id
      if (!xUserId) {
        results.push({ creator: creator.id, status: 'x_user_not_found' })
        continue
      }

      const tweetsRes = await fetch(
        `https://api.twitter.com/2/users/${xUserId}/tweets?max_results=5&tweet.fields=created_at&exclude=retweets,replies`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const tweetsData = await tweetsRes.json()
      const latest = tweetsData.data?.[0]
      if (!latest) {
        results.push({ creator: creator.id, status: 'no_tweets' })
        continue
      }

      if (latest.id === creator.last_seen_content_id) {
        results.push({ creator: creator.id, status: 'no_new_tweet' })
        continue
      }

      const result = await handleNewContent(supabase, {
        creatorId: creator.id,
        platform: 'twitter',
        contentExternalId: latest.id,
        contentTitle: latest.text?.slice(0, 100),
        contentUrl: `https://x.com/${creator.platform_id}/status/${latest.id}`,
        metricType: 'views',
        eventType: 'tweet.published',
      })

      await supabase.from('creators').update({ last_seen_content_id: latest.id }).eq('id', creator.id)
      results.push({ creator: creator.id, status: result.duplicate ? 'duplicate' : 'pool_created', tweetId: latest.id })
    } catch (err) {
      results.push({ creator: creator.id, status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  return NextResponse.json({ success: true, timestamp: new Date().toISOString(), results })
}
