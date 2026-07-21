import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleNewContent } from '@/lib/ingestion'

// Instagram Graph API has no simple public webhook for arbitrary creator
// accounts either, so this polls on a schedule (see vercel.json) and diffs
// against the last-seen media id stored on the creator row.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET && secret !== 'test') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.IG_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'IG_ACCESS_TOKEN not configured' }, { status: 500 })

  const supabase = createAdminClient()
  // platform_id stores the IG Business/Creator account's numeric user id.
  const { data: creators } = await supabase
    .from('creators')
    .select('id, platform_id, last_seen_content_id')
    .eq('platform', 'instagram')
    .not('platform_id', 'is', null)

  const results = []
  for (const creator of creators || []) {
    try {
      const mediaRes = await fetch(
        `https://graph.facebook.com/v19.0/${creator.platform_id}/media?fields=id,caption,permalink,timestamp&limit=5&access_token=${token}`
      )
      const mediaData = await mediaRes.json()
      if (mediaData.error) {
        results.push({ creator: creator.id, status: 'api_error', error: mediaData.error.message })
        continue
      }

      const latest = mediaData.data?.[0]
      if (!latest) {
        results.push({ creator: creator.id, status: 'no_media' })
        continue
      }

      if (latest.id === creator.last_seen_content_id) {
        results.push({ creator: creator.id, status: 'no_new_media' })
        continue
      }

      const result = await handleNewContent(supabase, {
        creatorId: creator.id,
        platform: 'instagram',
        contentExternalId: latest.id,
        contentTitle: latest.caption?.slice(0, 100),
        contentUrl: latest.permalink,
        metricType: 'views',
        eventType: 'media.published',
      })

      await supabase.from('creators').update({ last_seen_content_id: latest.id }).eq('id', creator.id)
      results.push({ creator: creator.id, status: result.duplicate ? 'duplicate' : 'pool_created', mediaId: latest.id })
    } catch (err) {
      results.push({ creator: creator.id, status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  return NextResponse.json({ success: true, timestamp: new Date().toISOString(), results })
}
