import { UserButton } from '@clerk/nextjs'
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { Logo } from '@/components/Logo'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()

  return (
    <div className="min-h-screen bg-bg">
      <nav className="bg-card border-b border-edge px-4 sm:px-6 py-2.5 flex items-center justify-between">
        <Link href="/dashboard"><Logo size="sm" /></Link>
        <div className="flex items-center gap-3">
          <Link href="/about" className="text-[#8A8A82] hover:text-[#F5F5F0] text-xs transition-colors hidden sm:block">How it works</Link>
          <Link href="/leaderboard" className="text-[#8A8A82] hover:text-[#F5F5F0] text-xs transition-colors hidden sm:block">🏆 Leaderboard</Link>
          {user.role === 'admin' && (
            <Link href="/admin" className="text-[10px] bg-accent/10 text-accent border border-accent/20 px-2 py-0.5 rounded-full font-medium hover:bg-accent/20 transition-colors">Admin</Link>
          )}
          <span className="text-[#8A8A82] text-xs hidden sm:block">{user.full_name || user.email}</span>
          <UserButton afterSignOutUrl="/" />
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  )
}
