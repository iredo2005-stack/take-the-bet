'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, BarChart3, Wallet, Trophy, User } from 'lucide-react'

const TABS = [
  { href: '/', icon: Home, label: 'Home' },
  { href: '/dashboard', icon: BarChart3, label: 'Markets' },
  { href: '/portfolio', icon: Wallet, label: 'Portfolio' },
  { href: '/leaderboard', icon: Trophy, label: 'Board' },
  { href: '/profile', icon: User, label: 'Profile' },
]

export default function MobileNav() {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    if (href === '/profile') return pathname.startsWith('/profile') || pathname.startsWith('/trader')
    return pathname.startsWith(href)
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-t border-edge sm:hidden">
      <div className="flex items-center justify-around px-1 py-1.5 safe-bottom">
        {TABS.map((tab) => {
          const active = isActive(tab.href)
          const Icon = tab.icon
          return (
            <Link key={tab.href} href={tab.href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg min-w-[3.5rem] transition-colors ${
                active ? 'text-accent' : 'text-[#8A8A82]'
              }`}>
              <Icon size={20} strokeWidth={active ? 2.2 : 1.5} />
              <span className="text-[9px] font-medium leading-none">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
