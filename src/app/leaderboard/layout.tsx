import { UserButton } from '@clerk/nextjs'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'

export default async function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()

  return (
    <div className="min-h-screen bg-bg">
      <nav className="bg-card border-b border-edge px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="text-accent font-bold text-lg tracking-tight hover:text-accent-hover transition-colors">
          Take The Bet
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/leaderboard" className="text-[#F5F5F0] text-sm font-medium">🏆 Leaderboard</Link>
          <Link href="/dashboard" className="text-[#8A8A82] hover:text-[#F5F5F0] text-sm transition-colors">Dashboard</Link>
          {user.role === 'admin' && (
            <Link href="/admin" className="text-xs bg-accent/10 text-accent border border-accent/20 px-2.5 py-1 rounded-full font-medium hover:bg-accent/20 transition-colors">Admin</Link>
          )}
          <UserButton afterSignOutUrl="/" />
        </div>
      </nav>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  )
}
