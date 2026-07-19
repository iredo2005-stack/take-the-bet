import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

// GET /api/clout/chat/history?chatId=...&limit=...&offset=...
//
// CRITICAL SECURITY CHECK: membership status is looked up fresh on every
// call (not from a cached token) — a member booted seconds ago is locked
// out of reading history immediately, not just posting.
export async function GET(req: Request) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const chatId = url.searchParams.get('chatId')
    if (!chatId) return NextResponse.json({ error: 'chatId is required' }, { status: 400 })

    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get('limit') || '', 10) || DEFAULT_LIMIT))
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '', 10) || 0)

    const supabase = createAdminClient()
    const { data: user } = await supabase.from('users').select('id').eq('clerk_id', clerkId).single()
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { data: member } = await supabase
      .from('clout_chat_members')
      .select('status, boot_reason')
      .eq('chat_id', chatId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!member) {
      return NextResponse.json(
        { error: 'not_a_member', message: 'You need active, verified access to this room to view it.' },
        { status: 403 }
      )
    }
    if (member.status !== 'active') {
      return NextResponse.json(
        {
          error: 'not_active_member',
          message: 'Your access to this room was revoked — verify again once your stats clear the bar.',
          bootReason: member.boot_reason,
        },
        { status: 403 }
      )
    }

    // Fetch one extra row to know if there's more without a separate count query.
    const { data: rows, error } = await supabase
      .from('clout_chat_messages')
      .select('id, chat_id, user_id, message_text, created_at, users(username, full_name)')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const hasMore = (rows || []).length > limit
    const page = (rows || []).slice(0, limit).reverse()

    const messages = page.map((row: any) => ({
      id: row.id,
      chatId: row.chat_id,
      userId: row.user_id,
      messageText: row.message_text,
      createdAt: row.created_at,
      displayName: row.users?.username || row.users?.full_name || 'Anonymous Trader',
    }))

    return NextResponse.json({ messages, limit, offset, hasMore })
  } catch (err) {
    console.error('[clout:chat:history] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
