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
    switch (tab) {
      case 'trending': list.sort((a, b) => b.offering.shares_sold - a.offering.shares_sold); break
      case 'breaking': list.sort((a, b) => Math.abs((b.offering.current_price - b.offering.initial_price) / b.offering.initial_price) - Math.abs((a.offering.current_price - a.offering.initial_price) / a.offering.initial_price)); break
      case 'new': list.sort((a, b) => new Date(b.offering.created_at).getTime() - new Date(a.offering.created_at).getTime()); break
      case 'big': list = list.filter((c) => c.subscribers >= BIG_THRESHOLD || (c.declared_followers && c.declared_followers >= BIG_THRESHOLD)); list.sort((a, b) => b.subscribers - a.subscribers); break
    }
    if (search) { const q = search.toLowerCase(); list = list.filter((c) => c.display_name.toLowerCase().includes(q) || c.offering.title.toLowerCase().includes(q)) }
    return list
  }, [creators, tab, search])

  return (
    <div>
      {/* Tab row */}
      <div className="flex items-center gap-1.5 mb-6 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              tab === t.key
                ? 'bg-accent/15 text-accent border border-accent/25'
                : 'text-[#8A8A82] hover:text-[#F5F5F0] border border-transparent hover:border-edge'
            }`}>
            <span>{t.icon}</span>{t.label}
            {t.key === 'bets' && bets.length > 0 && <span className="bg-accent/20 text-accent text-[9px] px-1.5 py-0.5 rounded-full ml-0.5">{bets.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'bets' ? (
        bets.length === 0 ? (
          <Empty text="No active video bets right now." />
        ) : (
          <div className="space-y-4">
            {bets.map((b) => <BetCard key={b.id} bet={b} />)}
          </div>
        )
      ) : (
        <>
          <div className="relative mb-5">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8A8A82] text-xs">🔍</span>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search creators..."
              className="w-full bg-card border border-edge rounded-xl pl-9 pr-4 py-2.5 text-xs text-[#F5F5F0] placeholder-[#8A8A82] focus:outline-none focus:ring-1 focus:ring-accent/30 transition" />
          </div>
          {filtered.length === 0 ? (
            <Empty text={search ? 'No creators match your search.' : tab === 'big' ? 'No creators above 500K yet.' : 'No creators in this category.'} />
          ) : (
            <div className="space-y-3">
              {filtered.map((c) => <CreatorCard key={c.id} creator={c} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="bg-card border border-edge rounded-2xl p-10 text-center"><p className="text-[#8A8A82] text-xs">{text}</p></div>
}

// ── Creator Card: one row, bold price, clear Buy button ──────────────────────

function CreatorCard({ creator }: { creator: CreatorListing }) {
  const { offering } = creator
  const pct = offering.initial_price > 0 ? ((offering.current_price - offering.initial_price) / offering.initial_price) * 100 : 0
  const isUp = pct >= 0

  return (
    <div className="bg-card border border-edge rounded-2xl p-4 hover:border-edge/80 transition-all">
      <div className="flex items-center gap-3">
        {/* Avatar */}
        {creator.photo_url ? (
          <img src={creator.photo_url} alt="" className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
        ) : (
          <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center text-accent text-sm font-bold flex-shrink-0">{creator.display_name[0]}</div>
        )}

        {/* Name + sparkline */}
        <div className="flex-1 min-w-0">
          <h3 className="text-[#F5F5F0] text-sm font-semibold truncate">{creator.display_name}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[#8A8A82] text-[10px]">{formatNumber(offering.shares_sold)} sold</span>
            <Sparkline data={creator.priceHistory} isUp={isUp} />
          </div>
        </div>

        {/* Price + change */}
        <div className="text-right mr-3 flex-shrink-0">
          <p className="text-[#F5F5F0] text-lg font-bold leading-none">{formatCurrency(offering.current_price)}</p>
          <span className={`text-[10px] font-bold ${isUp ? 'text-up' : pct === 0 ? 'text-[#8A8A82]' : 'text-down'}`}>
            {isUp ? '+' : ''}{pct.toFixed(1)}%
          </span>
        </div>

        {/* Buy button */}
        <Link href={`/c/${creator.slug}`}
          className="bg-up hover:brightness-110 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all flex-shrink-0">
          Buy
        </Link>
      </div>
    </div>
  )
}

// ── Bet Card: Polymarket-style with big Yes/No buttons ───────────────────────

function BetCard({ bet }: { bet: BetListing }) {
  const total = bet.total_pool
  const deadline = new Date(bet.deadline)
  const hoursLeft = Math.max(0, Math.round((deadline.getTime() - Date.now()) / 3600000))
  const timeLabel = hoursLeft > 24 ? `${Math.round(hoursLeft / 24)}d left` : hoursLeft > 0 ? `${hoursLeft}h left` : 'Ended'
  const isBinary = bet.bet_type === 'binary' && bet.outcomes.length === 2

  return (
    <div className="bg-card border border-edge rounded-2xl p-5 hover:border-edge/80 transition-all">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        {bet.creator_photo ? (
          <img src={bet.creator_photo} alt="" className="w-9 h-9 rounded-xl object-cover flex-shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center text-accent text-xs font-bold flex-shrink-0">{bet.creator_name[0]}</div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[#F5F5F0] text-sm font-semibold leading-snug mb-1">{bet.question}</p>
          <div className="flex items-center gap-2">
            <span className="text-[#8A8A82] text-[10px]">{bet.creator_name}</span>
            <span className="text-[#8A8A82] text-[10px]">·</span>
            <span className={`text-[10px] font-semibold ${hoursLeft > 0 ? 'text-accent' : 'text-[#8A8A82]'}`}>{timeLabel}</span>
            <span className="text-[#8A8A82] text-[10px]">·</span>
            <span className="text-[#8A8A82] text-[10px] font-medium">${total.toFixed(0)} pool</span>
          </div>
        </div>
      </div>

      {/* Outcome buttons */}
      {isBinary ? (
        <BinaryButtons outcomes={bet.outcomes} total={total} />
      ) : (
        <MultiButtons outcomes={bet.outcomes} total={total} />
      )}
    </div>
  )
}

function BinaryButtons({ outcomes, total }: { outcomes: BetListing['outcomes']; total: number }) {
  const [yes, no] = outcomes
  const yesPct = total > 0 ? Math.round((yes.pool_amount / total) * 100) : 50
  const noPct = 100 - yesPct

  return (
    <div className="grid grid-cols-2 gap-3">
      <button className="bg-up/15 hover:bg-up/25 border border-up/20 rounded-xl py-4 text-center transition-all group">
        <p className="text-up text-2xl font-bold mb-0.5">{yesPct}%</p>
        <p className="text-up/70 text-xs font-semibold group-hover:text-up transition-colors">{yes.label}</p>
      </button>
      <button className="bg-down/15 hover:bg-down/25 border border-down/20 rounded-xl py-4 text-center transition-all group">
        <p className="text-down text-2xl font-bold mb-0.5">{noPct}%</p>
        <p className="text-down/70 text-xs font-semibold group-hover:text-down transition-colors">{no.label}</p>
      </button>
    </div>
  )
}

function MultiButtons({ outcomes, total }: { outcomes: BetListing['outcomes']; total: number }) {
  return (
    <div className="space-y-2">
      {outcomes.map((o) => {
        const pct = total > 0 ? Math.round((o.pool_amount / total) * 100) : Math.round(100 / outcomes.length)
        const isLeading = pct === Math.max(...outcomes.map((x) => total > 0 ? Math.round((x.pool_amount / total) * 100) : Math.round(100 / outcomes.length)))
        return (
          <button key={o.id} className="w-full flex items-center justify-between bg-subtle hover:bg-muted border border-edge rounded-xl px-4 py-3 transition-all group">
            <span className="text-[#F5F5F0] text-xs font-medium">{o.label}</span>
            <span className={`text-sm font-bold ${isLeading ? 'text-up' : 'text-accent'}`}>{pct}%</span>
          </button>
        )
      })}
    </div>
  )
}

function Sparkline({ data, isUp }: { data: number[]; isUp: boolean }) {
  if (data.length < 2) return null
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1
  const w = 40, h = 14
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ')
  return (
    <svg width={w} height={h} className="flex-shrink-0" viewBox={`0 0 ${w} ${h}`}>
      <polyline points={points} fill="none" stroke={isUp ? '#22C55E' : '#EF4444'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
