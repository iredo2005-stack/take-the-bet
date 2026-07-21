import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchCloutPoolDetail } from '@/lib/clout/poolDetail'

type Props = { params: Promise<{ id: string }> }

// GET /api/clout/pools/[id] — pool details shaped for the frontend, with a
// clean embed{} object per creator so the client can render the right
// iframe (YouTube or Twitch) without knowing the raw column layout. War
// Pools carry both; single pools only ever populate creatorA.
//
// $CLOUT is displayed 1:1 against USDC ("1 $CLOUT = $1"), so pool cash
// values are converted from integer cents to dollar-denominated *Usdc
// fields right here at the API boundary — the DB and every settlement/
// liquidation calculation stay in integer cents throughout.
//
// The shaping itself lives in fetchCloutPoolDetail so this route and the
// server-rendered pool page (src/app/clout/pools/[id]/page.tsx) never drift.
export async function GET(req: Request, { params }: Props) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const supabase = createAdminClient()

    const pool = await fetchCloutPoolDetail(supabase, id)
    if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

    return NextResponse.json({ pool })
  } catch (err) {
    console.error('[clout:pools:get] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
