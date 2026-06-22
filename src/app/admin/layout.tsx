import { requireUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import Link from 'next/link'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/dashboard')

  return (
    <div className="min-h-screen bg-bg">
      <nav className="bg-card border-b border-edge px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-white font-bold text-lg tracking-tight hover:text-accent transition-colors">Take The Bet</Link>
          <span className="text-xs bg-accent/10 text-accent border border-accent/20 px-2 py-0.5 rounded-full font-medium">Admin</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-400 hover:text-white text-sm transition-colors">Dashboard</Link>
          <UserButton afterSignOutUrl="/" />
        </div>
      </nav>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  )
}
