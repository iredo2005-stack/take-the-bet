import { UserButton } from '@clerk/nextjs'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()

  return (
    <div className="min-h-screen bg-bg">
      <nav className="bg-card border-b border-edge px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="text-white font-bold text-lg tracking-tight hover:text-accent transition-colors">
          Take The Bet
        </Link>
        <div className="flex items-center gap-3">
          {user.role === 'admin' && (
            <Link href="/admin" className="text-xs bg-accent/10 text-accent border border-accent/20 px-2.5 py-1 rounded-full font-medium hover:bg-accent/20 transition-colors">
              Admin
            </Link>
          )}
          <span className="text-gray-400 text-sm hidden sm:block">{user.full_name || user.email}</span>
          <UserButton afterSignOutUrl="/" />
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  )
}
