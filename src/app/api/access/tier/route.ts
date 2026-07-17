import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeRoi30d, tierForRoi, issueTierToken } from '@/lib/tier'

// GET /api/access/tier — audits the caller's trailing 30-day ROI and issues a
// short-lived signed token authorizing entry into their earned chatroom tier
// (bronze/silver/gold/alpha). The room gateway verifies the token with
// verifyTierToken() rather than trusting a client-supplied tier claim.
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: user } = await supabase.from('users').select('id').eq('clerk_id', userId).single()
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { roi, realizedPnlCents, capitalDeployedCents } = await computeRoi30d(supabase, user.id)
    const tier = tierForRoi(roi)

    await supabase.from('users').update({ tier, roi_30d: roi }).eq('id', user.id)

    const { token, expiresAt } = issueTierToken(user.id, tier)

    return NextResponse.json({
      tier,
      roi30d: roi,
      realizedPnlCents,
      capitalDeployedCents,
      token,
      expiresAt,
    })
  } catch (err) {
    console.error('[access:tier] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
