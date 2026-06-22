import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import type { UserRow } from '@/types/database'

// Use in any server component or API route that requires an age-verified user.
export async function requireUser(): Promise<UserRow> {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const supabase = createAdminClient()
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('clerk_id', userId)
    .single()

  if (!user) redirect('/onboarding')
  if (!user.age_verified) redirect('/onboarding')

  return user
}
