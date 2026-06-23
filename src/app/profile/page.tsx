import { Logo } from "@/components/Logo"
import { requireUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import ProfileSetup from '@/components/ProfileSetup'
import WalletPanel from '@/components/WalletPanel'

export default async function ProfilePage() {
  const user = await requireUser()

  return (
    <div className="min-h-screen bg-bg pb-24">
      <nav className="bg-card border-b border-edge px-4 py-3 flex items-center justify-between sm:px-6">
        <Link href="/dashboard"><Logo size="sm" /></Link>
        <UserButton afterSignOutUrl="/" />
      </nav>
      <main className="max-w-lg mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold text-[#F5F5F0] mb-6">Your Profile</h1>

        {/* Avatar + name */}
        <div className="bg-card border border-edge rounded-2xl p-5 mb-4 flex items-center gap-4">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-edge" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-accent/10 border-2 border-accent/20 flex items-center justify-center text-accent text-2xl font-bold">
              {(user.full_name || user.email)[0].toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-[#F5F5F0] font-semibold text-lg">{user.full_name || 'Anonymous'}</p>
            <p className="text-[#8A8A82] text-sm">{user.email}</p>
            <p className="text-[#8A8A82] text-xs mt-1">Member since {new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</p>
          </div>
        </div>

        {/* Balance */}
        <WalletPanel balance={Number(user.balance ?? 0)} />

        {/* Username setup */}
        <ProfileSetup currentUsername={user.username ?? null} profilePublic={user.profile_public ?? true} />

        {/* Quick links */}
        <div className="space-y-2 mt-6">
          {user.username && (
            <Link href={`/trader/${user.username}`} className="block bg-card border border-edge rounded-xl p-4 hover:border-accent/30 transition-colors">
              <div className="flex items-center justify-between">
                <div><p className="text-[#F5F5F0] font-medium text-sm">Public Profile</p><p className="text-[#8A8A82] text-xs">View how others see you</p></div>
                <span className="text-accent text-sm">→</span>
              </div>
            </Link>
          )}
          <Link href="/dashboard" className="block bg-card border border-edge rounded-xl p-4 hover:border-accent/30 transition-colors">
            <div className="flex items-center justify-between">
              <div><p className="text-[#F5F5F0] font-medium text-sm">Dashboard & Portfolio</p><p className="text-[#8A8A82] text-xs">View your holdings and balance</p></div>
              <span className="text-accent text-sm">→</span>
            </div>
          </Link>
          <Link href="/leaderboard" className="block bg-card border border-edge rounded-xl p-4 hover:border-accent/30 transition-colors">
            <div className="flex items-center justify-between">
              <div><p className="text-[#F5F5F0] font-medium text-sm">Leaderboard</p><p className="text-[#8A8A82] text-xs">See where you rank</p></div>
              <span className="text-accent text-sm">→</span>
            </div>
          </Link>
        </div>

        <div className="mt-8 text-center">
          <p className="text-[#8A8A82] text-xs">Role: {user.role} · Age verified: {user.age_verified ? '✓' : '✗'}</p>
        </div>
      </main>
    </div>
  )
}
