import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyTierToken } from '@/lib/tier'
import { meetsTier, lockMessage, type Tier } from '@/lib/roomTiers'

type Props = { params: Promise<{ tier: string }> }

const VALID_TIERS: Tier[] = ['bronze', 'silver', 'gold', 'alpha']

function isValidTier(t: string): t is Tier {
  return (VALID_TIERS as string[]).includes(t)
}

// Every request must carry the signed token from GET /api/access/tier,
// proving the caller's audited ROI actually clears this room's bar — the
// room param alone is never trusted.
function authorizeRoom(token: string | null, roomTier: Tier) {
  if (!token) throw new Error('missing_token')
  const { userId, tier } = verifyTierToken(token)
  if (!meetsTier(tier, roomTier)) throw new Error('tier_not_met')
  return userId
}

// GET /api/chat/[tier]?token=... — recent history for an authorized room.
export async function GET(req: Request, { params }: Props) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { tier } = await params
    if (!isValidTier(tier)) return NextResponse.json({ error: 'Invalid room' }, { status: 400 })

    const token = new URL(req.url).searchParams.get('token')
    try {
      authorizeRoom(token, tier)
    } catch (err: any) {
      return NextResponse.json({ error: err.message, lockMessage: lockMessage(tier) }, { status: 403 })
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('tier', tier)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ messages: (data || []).reverse() })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

// POST /api/chat/[tier] — { token, body } send a message into an authorized room.
export async function POST(req: Request, { params }: Props) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { tier } = await params
    if (!isValidTier(tier)) return NextResponse.json({ error: 'Invalid room' }, { status: 400 })

    const { token, body: messageBody } = await req.json()
    if (typeof messageBody !== 'string' || messageBody.trim().length === 0 || messageBody.length > 500) {
      return NextResponse.json({ error: 'Message must be 1-500 characters' }, { status: 400 })
    }

    let internalUserId: string
    try {
      internalUserId = authorizeRoom(token, tier)
    } catch (err: any) {
      return NextResponse.json({ error: err.message, lockMessage: lockMessage(tier) }, { status: 403 })
    }

    const supabase = createAdminClient()
    const { data: user } = await supabase
      .from('users')
      .select('id, username, full_name')
      .eq('id', internalUserId)
      .eq('clerk_id', clerkId)
      .single()

    if (!user) return NextResponse.json({ error: 'Token does not match the signed-in user' }, { status: 403 })

    const { data: message, error } = await supabase
      .from('chat_messages')
      .insert({
        tier,
        user_id: user.id,
        display_name: user.username || user.full_name || 'Anonymous Trader',
        body: messageBody.trim(),
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, message })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
