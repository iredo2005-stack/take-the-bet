import { requireUser } from '@/lib/auth'
import { Logo } from '@/components/Logo'
import Link from 'next/link'
import ChatRoomsShell from './ChatRoomsShell'

export default async function ChatPage() {
  await requireUser()

  return (
    <div className="min-h-screen bg-bg pb-20 sm:pb-0">
      <nav className="bg-card border-b border-edge px-4 sm:px-6 py-2.5 flex items-center justify-between">
        <Link href="/dashboard"><Logo size="sm" /></Link>
        <Link href="/dashboard" className="text-xs text-[#707A8A] hover:text-[#1E2329] transition-colors">Back to markets</Link>
      </nav>
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-5">
        <h1 className="text-[#1E2329] text-lg font-bold mb-1">Trading Rooms</h1>
        <p className="text-[#707A8A] text-xs mb-4">Access is gated by your audited trailing 30-day ROI.</p>
        <ChatRoomsShell />
      </main>
    </div>
  )
}
