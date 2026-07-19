import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/clout/chat/send — { chatId, messageText }
//
// CRITICAL SECURITY CHECK: membership is verified inside clout_post_chat_message
// itself (row-locked, atomic with the insert) — not here in the route. A
// check performed in this handler and then acted on with a separate insert
// would leave a window where a boot sweep could revoke access in between;
// doing both in one Postgres function closes that window entirely.
export async function POST(req: Request) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { chatId, messageText } = await req.json()
    if (!chatId || typeof chatId !== 'string') {
      return NextResponse.json({ error: 'chatId is required' }, { status: 400 })
    }
    if (typeof messageText !== 'string' || messageText.trim().length === 0) {
      return NextResponse.json({ error: 'messageText is required' }, { status: 400 })
    }
    if (messageText.length > 500) {
      return NextResponse.json({ error: 'Message must be 500 characters or fewer' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: user } = await supabase.from('users').select('id, username, full_name').eq('clerk_id', clerkId).single()
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { data: message, error } = await supabase.rpc('clout_post_chat_message', {
      p_user_id: user.id,
      p_chat_id: chatId,
      p_message_text: messageText,
    })

    if (error) {
      const reasonMap: Record<string, { status: number; message: string }> = {
        not_active_member: { status: 403, message: 'You need active, verified access to this room to post.' },
        empty_message: { status: 400, message: 'Message cannot be empty.' },
        message_too_long: { status: 400, message: 'Message must be 500 characters or fewer.' },
      }
      const mapped = reasonMap[error.message] ?? { status: 500, message: error.message }
      return NextResponse.json({ error: error.message, message: mapped.message }, { status: mapped.status })
    }

    return NextResponse.json({
      success: true,
      message: { ...message, display_name: user.username || user.full_name || 'Anonymous Trader' },
    })
  } catch (err) {
    console.error('[clout:chat:send] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
