import { createClient } from '@supabase/supabase-js'

// Service-role client — only use in API routes, never in the browser.
// Untyped to avoid stale type mismatches causing 'never' inference.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
