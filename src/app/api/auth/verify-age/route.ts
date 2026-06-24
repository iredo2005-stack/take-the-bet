import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

function calculateAge(dob: string): number {
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const dateOfBirth: string = body.dateOfBirth
    if (!dateOfBirth) {
      return NextResponse.json({ error: 'Date of birth required' }, { status: 400 })
    }

    const age = calculateAge(dateOfBirth)
    if (age < 18) {
      return NextResponse.json({ blocked: true })
    }

    // currentUser() is simpler than clerkClient() and always available in route handlers
    const clerkUser = await currentUser()
    const email = clerkUser?.emailAddresses[0]?.emailAddress ?? ''
    const fullName =
      [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ') || null
    const avatarUrl = clerkUser?.imageUrl ?? null

    if (!email) {
      return NextResponse.json({ error: 'Could not read email from Clerk' }, { status: 500 })
    }

    const supabase = createAdminClient()

    const { error } = await supabase.from('users').upsert(
      {
        clerk_id: userId,
        email,
        full_name: fullName,
        avatar_url: avatarUrl,
        date_of_birth: dateOfBirth,
        age_verified: true,
        role: 'fan',
        balance: 10000,
      },
      { onConflict: 'clerk_id' }
    )

    if (error) {
      console.error('[verify-age] Supabase error:', JSON.stringify(error, null, 2))
      // Return the real error in dev so it's visible in the browser
      return NextResponse.json(
        { error: `DB error: ${error.message} (code: ${error.code})` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[verify-age] Unexpected error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error' },
      { status: 500 }
    )
  }
}
