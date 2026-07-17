import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleNewContent } from '@/lib/ingestion'

// Twitch EventSub webhook — handles the subscription challenge and
// stream.online / stream.offline notifications.
function verifySignature(req: Request, rawBody: string): boolean {
  const secret = process.env.TWITCH_EVENTSUB_SECRET
  if (!secret) return true // dev mode — no secret configured

  const messageId = req.headers.get('twitch-eventsub-message-id') ?? ''
  const timestamp = req.headers.get('twitch-eventsub-message-timestamp') ?? ''
  const signatureHeader = req.headers.get('twitch-eventsub-message-signature') ?? ''

  const expected = 'sha256=' + createHmac('sha256', secret).update(messageId + timestamp + rawBody).digest('hex')
  const expectedBuf = Buffer.from(expected)
  const providedBuf = Buffer.from(signatureHeader)
  if (expectedBuf.length !== providedBuf.length) return false
  return timingSafeEqual(expectedBuf, providedBuf)
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text()
    if (!verifySignature(req, rawBody)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
    }

    const messageType = req.headers.get('twitch-eventsub-message-type')
    const body = JSON.parse(rawBody)

    if (messageType === 'webhook_callback_verification') {
      return new NextResponse(body.challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }

    if (messageType === 'revocation') {
      return NextResponse.json({ success: true, revoked: true })
    }

    if (messageType !== 'notification') {
      return NextResponse.json({ error: 'Unknown message type' }, { status: 400 })
    }

    const subscriptionType: string = body.subscription?.type
    const event = body.event
    const supabase = createAdminClient()

    const { data: creator } = await supabase
      .from('creators')
      .select('id')
      .eq('platform', 'twitch')
      .eq('platform_id', event?.broadcaster_user_login)
      .single()

    if (!creator) return NextResponse.json({ success: true, status: 'creator_not_monitored' })

    if (subscriptionType === 'stream.online') {
      await supabase.from('creators').update({ is_live: true }).eq('id', creator.id)

      const result = await handleNewContent(supabase, {
        creatorId: creator.id,
        platform: 'twitch',
        contentExternalId: event.id, // Twitch stream id — unique per broadcast
        contentTitle: `${event.broadcaster_user_name} live stream`,
        contentUrl: `https://twitch.tv/${event.broadcaster_user_login}`,
        metricType: 'concurrent_viewers',
        eventType: 'stream.online',
      })
      return NextResponse.json({ success: true, status: result.duplicate ? 'duplicate' : 'pool_created' })
    }

    if (subscriptionType === 'stream.offline') {
      await supabase.from('creators').update({ is_live: false }).eq('id', creator.id)
      // Any pool still open against this stream gets caught by the
      // resolve-pools cron's early-void check on its next tick.
      return NextResponse.json({ success: true, status: 'marked_offline' })
    }

    return NextResponse.json({ success: true, status: 'ignored', subscriptionType })
  } catch (err) {
    console.error('[webhooks:twitch] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
