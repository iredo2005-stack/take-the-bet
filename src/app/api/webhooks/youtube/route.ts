import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleNewContent } from '@/lib/ingestion'

// YouTube PubSubHubbub (WebSub) push notifications.
//
// GET  — the hub's subscription verification handshake: echo back hub.challenge.
// POST — the actual "new video" notification (Atom XML body).
export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const challenge = url.searchParams.get('hub.challenge')

  if ((mode === 'subscribe' || mode === 'unsubscribe') && challenge) {
    // Optionally cross-check hub.topic against a monitored-channels table here.
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return NextResponse.json({ error: 'Invalid verification request' }, { status: 400 })
}

// YouTube's WebSub Atom payload has a stable, narrow shape (a handful of
// namespaced tags per <entry>), so a small tag-scoped regex extractor avoids
// pulling in a general XML parser dependency for this one call site.
function extractTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`))
  return match?.[1]?.trim()
}

function parseYouTubeAtomEntries(rawBody: string): { videoId?: string; channelId?: string; title?: string }[] {
  const entryBlocks = rawBody.match(/<entry>[\s\S]*?<\/entry>/g) ?? []
  return entryBlocks.map((block) => ({
    videoId: extractTag(block, 'yt:videoId'),
    channelId: extractTag(block, 'yt:channelId'),
    title: extractTag(block, 'title'),
  }))
}

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.YOUTUBE_PUBSUB_SECRET
  if (!secret) return true // no secret configured — skip verification (dev mode)
  if (!signatureHeader) return false

  const [algo, providedHex] = signatureHeader.split('=')
  if (algo !== 'sha1') return false

  const expected = createHmac('sha1', secret).update(rawBody).digest('hex')
  const expectedBuf = Buffer.from(expected, 'hex')
  const providedBuf = Buffer.from(providedHex, 'hex')
  if (expectedBuf.length !== providedBuf.length) return false
  return timingSafeEqual(expectedBuf, providedBuf)
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-hub-signature')

    if (!verifySignature(rawBody, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
    }

    const entries = parseYouTubeAtomEntries(rawBody)
    if (entries.length === 0) return NextResponse.json({ success: true, processed: 0 })

    const supabase = createAdminClient()
    const results = []

    for (const entry of entries) {
      const { videoId, channelId, title } = entry
      if (!videoId || !channelId) continue

      const { data: creator } = await supabase
        .from('creators')
        .select('id')
        .eq('platform', 'youtube')
        .eq('platform_id', channelId)
        .single()

      if (!creator) {
        results.push({ videoId, status: 'creator_not_monitored' })
        continue
      }

      const result = await handleNewContent(supabase, {
        creatorId: creator.id,
        platform: 'youtube',
        contentExternalId: videoId,
        contentTitle: title,
        contentUrl: `https://www.youtube.com/watch?v=${videoId}`,
        metricType: 'views',
        eventType: 'video.published',
      })
      results.push({ videoId, status: result.duplicate ? 'duplicate' : 'pool_created' })
    }

    return NextResponse.json({ success: true, processed: results.length, results })
  } catch (err) {
    console.error('[webhooks:youtube] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
