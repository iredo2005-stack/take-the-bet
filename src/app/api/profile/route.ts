import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: user } = await supabase.from('users').select('*').eq('clerk_id', userId).single()
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { username, profilePublic } = await req.json()

    if (username !== undefined) {
      const clean = username.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '').slice(0, 30)
      if (clean.length < 3) return NextResponse.json({ error: 'Username must be at least 3 characters (letters, numbers, - _)' }, { status: 400 })

      const { data: taken } = await supabase.from('users').select('id').eq('username', clean).neq('id', user.id).maybeSingle()
      if (taken) return NextResponse.json({ error: 'Username already taken' }, { status: 409 })

      await supabase.from('users').update({ username: clean }).eq('id', user.id)
    }

    if (profilePublic !== undefined) {
      await supabase.from('users').update({ profile_public: profilePublic }).eq('id', user.id)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
