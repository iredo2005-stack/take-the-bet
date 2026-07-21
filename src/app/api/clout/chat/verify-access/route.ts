import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { issueChatAccessToken } from '@/lib/clout/chatAccess'
import { centsToDollars } from '@/lib/money'

// GET /api/clout/chat/verify-access?chatId=... — audits the caller's trailing
// 30-day ROI/volume against one specific Alpha Chat's bar. On success, grants
// (or re-activates) membership and issues a short-lived signed token for
// entering that room; on failure, reports exactly which bar wasn't cleared
// and by how much, so the UI can show "need 4.2% more ROI" instead of a
// bare rejection.
export async function GET(req: Request) {
  try {
    const { userId: clerkId } = await auth()
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const chatId = new URL(req.url).searchParams.get('chatId')
    if (!chatId) return NextResponse.json({ error: 'chatId is required' }, { status: 400 })

    const supabase = createAdminClient()
    const { data: user } = await supabase.from('users').select('id').eq('clerk_id', clerkId).single()
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { data: chat } = await supabase.from('clout_alpha_chats').select('*').eq('id', chatId).single()
    if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 })

    const { data: statsRows, error: statsError } = await supabase.rpc('clout_calculate_rolling_stats', {
      p_user_id: user.id,
      p_days: 30,
    })
    if (statsError) return NextResponse.json({ error: statsError.message }, { status: 500 })
    const stats = statsRows?.[0] ?? { roi_bps: 0, volume_cents: 0, invested_cents: 0, returned_cents: 0 }

    const { data: member, error: grantError } = await supabase.rpc('clout_grant_chat_access', {
      p_user_id: user.id,
      p_chat_id: chatId,
    })

    if (grantError) {
      const reasonMap: Record<string, { status: number; message: string }> = {
        roi_below_threshold: {
          status: 403,
          message: `Your trailing 30-day ROI is ${(stats.roi_bps / 100).toFixed(1)}% — this room requires ${(chat.min_roi_bps / 100).toFixed(1)}%.`,
        },
        volume_below_threshold: {
          status: 403,
          message: `Your trailing 30-day volume is $${(stats.volume_cents / 100).toFixed(2)} — this room requires $${(chat.min_volume_cents / 100).toFixed(2)}.`,
        },
        chat_full: { status: 409, message: 'This room is at capacity right now.' },
        chat_not_found: { status: 404, message: 'Chat not found.' },
      }
      const mapped = reasonMap[grantError.message] ?? { status: 500, message: grantError.message }
      return NextResponse.json(
        {
          error: grantError.message,
          message: mapped.message,
          stats: { roiBps: stats.roi_bps, volumeUsdc: centsToDollars(stats.volume_cents) },
          required: { minRoiBps: chat.min_roi_bps, minVolumeUsdc: centsToDollars(chat.min_volume_cents) },
        },
        { status: mapped.status }
      )
    }

    const { token, expiresAt } = issueChatAccessToken(user.id, chatId)

    return NextResponse.json({
      success: true,
      member,
      stats: { roiBps: stats.roi_bps, volumeUsdc: centsToDollars(stats.volume_cents) },
      token,
      expiresAt,
    })
  } catch (err) {
    console.error('[clout:verify-access] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
