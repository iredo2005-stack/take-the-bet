'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatCurrency, formatNumber } from '@/lib/utils'

type CreatorListing = {
  id: string; display_name: string; slug: string; photo_url: string | null; bio: string | null
  subscribers: number; declared_followers: number | null
  offering: { id: string; title: string; image_url: string | null; current_price: number; initial_price: number; shares_sold: number; total_shares: number; shares_available: number; created_at: string }
  priceHistory: number[]
  basePrice: number
}

type BetListing = {
  id: string; question: string; bet_type: string; deadline: string; total_pool: number; status: string
  creator_name: string; creator_photo: string | null
  outcomes: { id: string; label: string; pool_amount: number }[]
}

type Tab = 'trending' | 'breaking' | 'new' | 'big' | 'bets'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'trending', label: 'Trending', icon: '🔥' },
  { key: 'breaking', label: 'Breaking', icon: '📈' },
  { key: 'new', label: 'New', icon: '🆕' },
  { key: 'big', label: 'Big Creators', icon: '👑' },
  { key: 'bets', label: 'Video Bets', icon: '🎲' },
]

const BIG_THRESHOLD = 500_000

export default function CreatorGrid({ creators, bets = [] }: { creators: CreatorListing[]; bets?: BetListing[] }) {
  const [tab, setTab] = useState<Tab>('trending')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    let list = [...creators]

    // Tab filter + sort
    switch (tab) {
      case 'trending':
        list.sort((a, b) => b.offering.shares_sold - a.offering.shares_sold)
        break
      case 'breaking':
        list.sort((a, b) => {
          const aChg = Math.abs((a.offering.current_price - a.offering.initial_price) / a.offering.initial_price)
          const bChg = Math.abs((b.offering.current_price - b.offering.initial_price) / b.offering.initial_price)
          return bChg - aChg
        })
        break
      case 'new':
        list.sort((a, b) => new Date(b.offering.created_at).getTime() - new Date(a.offering.created_at).getTime())
        break
      case 'big':
        list = list.filter((c) => (c.subscribers >= BIG_THRESHOLD) || (c.declared_followers && c.declared_followers >= BIG_THRESHOLD))
        list.sort((a, b) => b.subscribers - a.subscribers)
        break
    }

    // Search
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((c) => c.display_name.toLowerCase().includes(q) || c.offering.title.toLowerCase().includes(q))
    }

    return list
  }, [creators, tab, search])

  return (
    <div>
      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto scrollbar-none pb-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.key ? 'bg-subtle text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-subtle/50'
            }`}>
            <span className="text-xs">{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {tab === 'bets' ? (
        /* Bets grid */
        bets.length === 0 ? (
          <div className="bg-card border border-edge rounded-xl p-8 text-center">
            <p className="text-gray-500 text-sm">No active video bets right now.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {bets.map((b) => <BetCard key={b.id} bet={b} />)}
          </div>
        )
      ) : (
        <>
          {/* Search */}
          <div className="relative mb-4">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-xs">🔍</span>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search creators..."
              className="w-full bg-card border border-edge rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-accent/30 transition" />
          </div>
          {/* Creator grid */}
          {filtered.length === 0 ? (
            <div className="bg-card border border-edge rounded-xl p-8 text-center">
              <p className="text-gray-500 text-sm">{search ? 'No creators match your search.' : tab === 'big' ? 'No creators above 500K followers yet.' : 'No creators in this category yet.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {filtered.map((c) => <CreatorCard key={c.id} creator={c} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CreatorCard({ creator }: { creator: CreatorListing }) {
  const { offering } = creator
  const pctChange = offering.initial_price > 0
    ? ((offering.current_price - offering.initial_price) / offering.initial_price) * 100
    : 0
  const isUp = pctChange >= 0
  const hasBase = creator.basePrice > 0

  return (
    <Link href={`/c/${creator.slug}`}
      className="bg-card border border-edge rounded-xl p-3 hover:border-muted transition-all group block">

      {/* Top row: avatar + name + sparkline */}
      <div className="flex items-center gap-2.5 mb-2.5">
        {creator.photo_url ? (
          <img src={creator.photo_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs font-bold flex-shrink-0">{creator.display_name[0]}</div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-white text-sm font-semibold truncate leading-tight">{creator.display_name}</h3>
          <p className="text-gray-600 text-xs truncate">{offering.title}</p>
        </div>
        {/* Sparkline */}
        <Sparkline data={creator.priceHistory} isUp={isUp} />
      </div>

      {/* Price row */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-white text-base font-bold leading-tight">{formatCurrency(offering.current_price)}</p>
          {hasBase && (
            <p className="text-gray-600 text-[10px] mt-0.5">FV {formatCurrency(creator.basePrice)}</p>
          )}
        </div>
        <div className="text-right">
          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
            isUp ? 'bg-up/10 text-up' : pctChange === 0 ? 'bg-subtle text-gray-500' : 'bg-down/10 text-down'
          }`}>
            {isUp ? '+' : ''}{pctChange.toFixed(1)}%
          </span>
          <p className="text-gray-600 text-[10px] mt-1">{formatNumber(offering.shares_sold)} sold</p>
        </div>
      </div>
    </Link>
  )
}

function BetCard({ bet }: { bet: BetListing }) {
  const total = bet.total_pool
  const deadline = new Date(bet.deadline)
  const now = new Date()
  const hoursLeft = Math.max(0, Math.round((deadline.getTime() - now.getTime()) / 3600000))
  const timeLabel = hoursLeft > 24 ? `${Math.round(hoursLeft / 24)}d left` : hoursLeft > 0 ? `${hoursLeft}h left` : 'Ended'

  return (
    <div className="bg-card border border-edge rounded-xl p-3.5 hover:border-muted transition-all">
      {/* Header */}
      <div className="flex items-start gap-2 mb-3">
        {bet.creator_photo ? (
          <img src={bet.creator_photo} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center text-accent text-[10px] font-bold flex-shrink-0 mt-0.5">{bet.creator_name[0]}</div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold leading-snug">{bet.question}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-gray-600 text-[10px]">{bet.creator_name}</span>
            <span className="text-gray-600 text-[10px]">·</span>
            <span className={`text-[10px] font-medium ${hoursLeft > 0 ? 'text-yellow-400' : 'text-gray-500'}`}>{timeLabel}</span>
          </div>
        </div>
      </div>

      {/* Outcome bars */}
      <div className="space-y-1.5 mb-2.5">
        {bet.outcomes.map((o) => {
          const pct = total > 0 ? (o.pool_amount / total) * 100 : 100 / bet.outcomes.length
          const isTop = pct === Math.max(...bet.outcomes.map((x) => total > 0 ? (x.pool_amount / total) * 100 : 100 / bet.outcomes.length))
          return (
            <div key={o.id} className="relative">
              <div className="flex items-center justify-between bg-subtle rounded-lg px-3 py-2 relative overflow-hidden">
                <div className="absolute inset-0 rounded-lg opacity-20" style={{ width: `${pct}%`, background: isTop ? '#10B981' : '#3B82F6' }} />
                <span className="text-white text-xs font-medium relative z-10">{o.label}</span>
                <span className={`text-xs font-bold relative z-10 ${isTop ? 'text-up' : 'text-accent'}`}>{Math.round(pct)}%</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-gray-600 text-[10px]">${total.toFixed(0)} pool</span>
        <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded font-medium">{bet.bet_type === 'binary' ? 'Yes/No' : 'Multi'}</span>
      </div>
    </div>
  )
}

function Sparkline({ data, isUp }: { data: number[]; isUp: boolean }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 48, h = 20
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={w} height={h} className="flex-shrink-0" viewBox={`0 0 ${w} ${h}`}>
      <polyline
        points={points}
        fill="none"
        stroke={isUp ? '#10B981' : '#EF4444'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
