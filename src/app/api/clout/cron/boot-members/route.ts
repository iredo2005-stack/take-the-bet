import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Runs on a schedule (hourly is reasonable). Re-checks every active Alpha
// Chat membership against its room's current ROI/volume bar and revokes
// anyone who's fallen below it — see clout_sweep_chat_boots in
// supabase/migrations/006_clout_alpha_chats.sql for the actual logic.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET && secret !== 'test') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data: booted, error } = await supabase.rpc('clout_sweep_chat_boots')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    bootedCount: (booted || []).length,
    booted,
  })
}
