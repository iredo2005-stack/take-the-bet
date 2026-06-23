'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/', icon: '🏠', label: 'Home' },
  { href: '/dashboard', icon: '📊', label: 'Markets' },
  { href: '/dashboard?tab=bets', icon: '🎲', label: 'Bets' },
  { href: '/leaderboard', icon: '🏆', label: 'Board' },
  { href: '/profile', icon: '👤', label: 'Profile' },
]

export default function MobileNav() {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    if (href === '/dashboard?tab=bets') return pathname === '/dashboard' && false // handled via tab state
    if (href === '/profile') return pathname.startsWith('/profile') || pathname.startsWith('/trader')
    return pathname.startsWith(href)
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-edge sm:hidden">
      <div className="flex items-center justify-around px-1 py-1.5 safe-bottom">
        {TABS.map((tab) => {
          const active = isActive(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg min-w-[3.5rem] transition-colors ${
                active ? 'text-accent' : 'text-[#8A8A82]'
              }`}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
