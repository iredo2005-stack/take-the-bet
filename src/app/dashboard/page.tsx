import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatCurrency, formatNumber } from '@/lib/utils'
import type { CreatorRow, OfferingRow } from '@/types/database'
import CreatorGrid from './CreatorGrid'

type HoldingWithDetails = {
  id: string; shares_owned: number; avg_buy_price: number; total_invested: number
  offerings: { id: string; title: string; current_price: number; initial_price: number; creators: { display_name: string; slug: string; photo_url: string | null } }
}
type CreatorListing = {
  id: string; display_name: string; slug: string; photo_url: string | null; bio: string | null
  subscribers: number; declared_followers: number | null
  offering: { id: string; title: string; image_url: string | null; current_price: number; initial_price: number; shares_sold: number; total_shares: number; shares_available: number; created_at: string }
  priceHistory: number[]
  basePrice: number
}

export default async function DashboardPage() {
  const user = await requireUser()
  const supabase = createAdminClient()

  const { data: rawHoldings } = await supabase.from('holdings').select(`id, shares_owned, avg_buy_price, total_invested, offerings ( id, title, current_price, initial_price, creators ( display_name, slug, photo_url ) )`).eq('user_id', user.id).gt('shares_owned', 0)
  const holdings = (rawHoldings || []) as unknown as HoldingWithDetails[]

  const { data: rawListings } = await supabase.from('offerings').select(`id, title, current_price, initial_price, shares_sold, total_shares, shares_available, image_url, created_at, creators ( id, display_name, slug, photo_url, bio, subscribers, monthly_views, engagement_rate, post_frequency, monthly_growth_percent, declared_followers )`).eq('status', 'active').order('shares_sold', { ascending: false })

  // Fetch recent price history for sparklines (last 10 points per offering)
  const offeringIds = (rawListings || []).map((o: any) => o.id)
  let priceMap: Record<string, number[]> = {}
  if (offeringIds.length > 0) {
    const { data: prices } = await supabase.from('price_history').select('offering_id, price').in('offering_id', offeringIds).order('recorded_at', { ascending: true })
    for (const p of (prices || []) as any[]) {
      if (!priceMap[p.offering_id]) priceMap[p.offering_id] = []
      priceMap[p.offering_id].push(Number(p.price))
    }
    // Keep last 10 points per offering
    for (const k of Object.keys(priceMap)) {
      if (priceMap[k].length > 10) priceMap[k] = priceMap[k].slice(-10)
    }
  }

  const listings: CreatorListing[] = ((rawListings || []) as any[]).map((o) => {
    const c = o.creators
    const metrics = { subscribers: c.subscribers ?? 0, monthly_views: c.monthly_views ?? 0, engagement_rate: Number(c.engagement_rate ?? 0), post_frequency: c.post_frequency ?? 'regular', monthly_growth_percent: Number(c.monthly_growth_percent ?? 0) }
    const bv = (metrics.subscribers * 0.01 + metrics.monthly_views * 0.001 + metrics.engagement_rate * 100)
    const fm = ({ regular: 1, rare: 0.8, inactive: 0.6 } as Record<string, number>)[metrics.post_frequency] ?? 1
    const gm = metrics.monthly_growth_percent >= 20 ? 1.5 : metrics.monthly_growth_percent >= 5 ? 1.2 : metrics.monthly_growth_percent >= 0 ? 1.0 : 0.7
    const baseVal = bv * fm * gm
    const bp = o.total_shares > 0 ? Math.round((baseVal / o.total_shares) * 100) / 100 : 0
    return {
      id: c.id, display_name: c.display_name, slug: c.slug, photo_url: c.photo_url, bio: c.bio,
      subscribers: c.subscribers ?? 0, declared_followers: c.declared_followers,
      offering: { id: o.id, title: o.title, image_url: o.image_url, current_price: Number(o.current_price), initial_price: Number(o.initial_price), shares_sold: o.shares_sold, total_shares: o.total_shares, shares_available: o.shares_available, created_at: o.created_at },
      priceHistory: priceMap[o.id] || [Number(o.initial_price), Number(o.current_price)],
      basePrice: bp,
    }
  })

  // Fetch open video bets
  const { data: rawBets } = await supabase.from('video_bets').select('*, bet_outcomes(*), creators(display_name, photo_url)').eq('status', 'open').order('deadline', { ascending: true })
  const bets = ((rawBets || []) as any[]).map((b) => ({
    id: b.id, question: b.question, bet_type: b.bet_type, deadline: b.deadline, total_pool: Number(b.total_pool), status: b.status,
    creator_name: b.creators?.display_name ?? '', creator_photo: b.creators?.photo_url ?? null,
    outcomes: ((b.bet_outcomes || []) as any[]).sort((a: any, b: any) => a.sort_order - b.sort_order).map((o: any) => ({ id: o.id, label: o.label, pool_amount: Number(o.pool_amount) })),
  }))

  const { data: creatorRaw } = await supabase.from('creators').select('*').eq('user_id', user.id).maybeSingle()
  const creator = creatorRaw?.id ? creatorRaw : null

  if (creator && creator.status === 'approved') {
    const { data: offerings } = await supabase.from('offerings').select('*').eq('creator_id', creator.id).order('created_at', { ascending: false })
    return <CreatorView creator={creator} offerings={offerings || []} holdings={holdings} />
  }

  let statusBanner: { type: 'pending' | 'rejected'; message: string } | null = null
  if (creator && creator.status === 'pending') statusBanner = { type: 'pending', message: 'Your creator application is under review.' }
  else if (creator && creator.status === 'rejected') statusBanner = { type: 'rejected', message: 'Your creator application was not approved.' }

  return <FanView userName={user.full_name} holdings={holdings} creators={listings} bets={bets} statusBanner={statusBanner} hasApplied={!!creator} />
}

// ─── Fan View ────────────────────────────────────────────────────────────────

function FanView({ userName, holdings, creators, bets, statusBanner, hasApplied }: {
  userName: string | null; holdings: HoldingWithDetails[]; creators: CreatorListing[]; bets?: any[]
  statusBanner?: { type: 'pending' | 'rejected'; message: string } | null; hasApplied?: boolean
}) {
  return (
    <div>
      {/* Hero */}
      <div className="mb-6 pt-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#F5F5F0] leading-tight tracking-tight mb-1.5">
          The stock market for <span className="text-accent">creators</span>
        </h1>
        <p className="text-[#8A8A82] text-sm leading-relaxed max-w-md">
          Invest in creators early. Prices follow real growth — subscribers, views, and momentum.
        </p>
      </div>

      {statusBanner && (
        <div className={`rounded-2xl p-4 mb-6 border ${statusBanner.type === 'pending' ? 'bg-yellow-500/5 border-yellow-500/20' : 'bg-down/5 border-down/20'}`}>
          <div className="flex items-start gap-3">
            <span className="text-lg flex-shrink-0">{statusBanner.type === 'pending' ? '⏳' : '❌'}</span>
            <div>
              <p className={`text-sm font-medium ${statusBanner.type === 'pending' ? 'text-yellow-400' : 'text-down'}`}>Creator application {statusBanner.type}</p>
              <p className="text-gray-400 text-xs mt-0.5">
                {statusBanner.message}
                {statusBanner.type === 'rejected' && <> If you believe this is an error, <a href="mailto:iredo2005@gmail.com" className="text-accent hover:underline">contact us</a>.</>}
              </p>
            </div>
          </div>
        </div>
      )}

      <CreatorGrid creators={creators} bets={bets} />
      <div className="mt-10"><Portfolio holdings={holdings} /></div>

      {!hasApplied && (
        <div className="mt-10 pt-6 border-t border-edge text-center">
          <p className="text-[#8A8A82] text-sm mb-2">Are you a content creator?</p>
          <Link href="/dashboard/become-creator" className="text-gray-500 hover:text-accent text-sm font-medium transition-colors">Apply to be a creator →</Link>
        </div>
      )}
    </div>
  )
}

// ─── Creator View ────────────────────────────────────────────────────────────

function CreatorView({ creator, offerings, holdings }: { creator: CreatorRow; offerings: OfferingRow[]; holdings: HoldingWithDetails[] }) {
  const totalRaised = offerings.reduce((s, o) => s + Number(o.total_raised), 0)
  const totalSold = offerings.reduce((s, o) => s + o.shares_sold, 0)
  const hasActive = offerings.some((o) => o.status === 'active')

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          {creator.photo_url ? <img src={creator.photo_url} alt={creator.display_name} className="w-14 h-14 rounded-full object-cover border border-edge" />
          : <div className="w-14 h-14 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-xl font-bold">{creator.display_name[0]}</div>}
          <div><h1 className="text-base font-bold text-[#F5F5F0]">{creator.display_name}</h1><p className="text-gray-500 text-sm">/c/{creator.slug}</p></div>
        </div>
        {!hasActive && <Link href="/dashboard/create-offering" className="bg-accent hover:bg-accent-hover text-bg font-semibold px-5 py-2.5 rounded-xl transition-colors text-center text-sm">+ New Offering</Link>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        <StatCard label="Offerings" value={String(offerings.length)} />
        <StatCard label="Total Raised" value={formatCurrency(totalRaised)} />
        <StatCard label="Shares Sold" value={formatNumber(totalSold)} />
      </div>
      <h2 className="text-sm font-bold text-[#F5F5F0] mb-3">Your Offerings</h2>
      {offerings.length === 0 ? (
        <div className="bg-card border border-edge rounded-2xl p-6 text-center mb-8"><p className="text-gray-500 mb-4">No offerings yet.</p><Link href="/dashboard/create-offering" className="text-accent font-semibold text-sm">Create your first offering →</Link></div>
      ) : (
        <div className="space-y-3 mb-8">{offerings.map((o) => <OfferingCard key={o.id} offering={o} slug={creator.slug} />)}</div>
      )}
      <Portfolio holdings={holdings} />
    </div>
  )
}

// ─── Portfolio ───────────────────────────────────────────────────────────────

function Portfolio({ holdings }: { holdings: HoldingWithDetails[] }) {
  if (holdings.length === 0) return (
    <div className="bg-card border border-edge rounded-2xl p-6">
      <h2 className="text-sm font-bold text-[#F5F5F0] mb-3">Your Portfolio</h2>
      <p className="text-gray-500 text-sm">You don&apos;t own any shares yet.</p>
    </div>
  )
  const totalInvested = holdings.reduce((s, h) => s + Number(h.total_invested), 0)
  const currentValue = holdings.reduce((s, h) => s + h.shares_owned * Number(h.offerings.current_price), 0)
  const pnl = currentValue - totalInvested
  const pnlPct = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0
  const isUp = pnl >= 0

  return (
    <div>
      <h2 className="text-sm font-bold text-[#F5F5F0] mb-3">Your Portfolio</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <StatCard label="Invested" value={formatCurrency(totalInvested)} />
        <StatCard label="Current Value" value={formatCurrency(currentValue)} />
        <div className={`bg-card border rounded-xl p-4 ${isUp ? 'border-up/30' : 'border-down/30'}`}>
          <div className="text-gray-500 text-xs uppercase tracking-wide mb-1">P&L</div>
          <div className={`font-bold truncate ${isUp ? 'text-up' : 'text-down'}`}>
            <span className="text-sm">{isUp ? '+' : ''}{formatCurrency(pnl)}</span>
            <span className="text-xs font-medium ml-1">({isUp ? '+' : ''}{pnlPct.toFixed(1)}%)</span>
          </div>
        </div>
      </div>
      <div className="space-y-3">{holdings.map((h) => <HoldingCard key={h.id} holding={h} />)}</div>
    </div>
  )
}

function HoldingCard({ holding }: { holding: HoldingWithDetails }) {
  const cp = Number(holding.offerings.current_price)
  const cv = holding.shares_owned * cp
  const inv = Number(holding.total_invested)
  const pnl = cv - inv
  const isUp = pnl >= 0
  const c = holding.offerings.creators
  return (
    <Link href={`/c/${c.slug}`} className="block bg-card border border-edge rounded-xl p-4 hover:border-muted transition-all">
      <div className="flex items-start gap-3 min-w-0">
        {c.photo_url ? <img src={c.photo_url} alt={c.display_name} className="w-10 h-10 rounded-full object-cover border border-edge flex-shrink-0" />
        : <div className="w-10 h-10 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent font-bold flex-shrink-0">{c.display_name[0]}</div>}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0"><h3 className="text-white font-semibold text-sm truncate">{c.display_name}</h3><p className="text-gray-500 text-xs truncate">{holding.offerings.title}</p></div>
            <div className="text-right flex-shrink-0"><div className="text-white font-bold text-sm">{formatCurrency(cv)}</div><div className={`text-xs font-medium ${isUp ? 'text-up' : 'text-down'}`}>{isUp ? '+' : ''}{formatCurrency(pnl)}</div></div>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
            <span>{formatNumber(holding.shares_owned)} shares</span><span>Avg {formatCurrency(Number(holding.avg_buy_price))}</span><span>Now {formatCurrency(cp)}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ─── Shared ──────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return <div className="bg-card border border-edge rounded-xl p-4"><div className="text-gray-500 text-xs uppercase tracking-wide mb-1">{label}</div><div className="text-[#F5F5F0] text-sm font-bold truncate">{value}</div></div>
}

function OfferingCard({ offering, slug }: { offering: OfferingRow; slug: string }) {
  const pct = offering.total_shares > 0 ? Math.round((offering.shares_sold / offering.total_shares) * 100) : 0
  const sc: Record<string, string> = { active: 'text-up bg-up/10 border-up/20', draft: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', closed: 'text-gray-400 bg-gray-500/10 border-gray-500/20' }
  return (
    <div className="bg-card border border-edge rounded-xl p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1"><h3 className="text-white font-semibold truncate">{offering.title}</h3><span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${sc[offering.status] || sc.draft}`}>{offering.status}</span></div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-400">
            <span>Price: <span className="text-white">{formatCurrency(Number(offering.current_price))}</span></span>
            <span>Sold: <span className="text-white">{formatNumber(offering.shares_sold)}/{formatNumber(offering.total_shares)}</span> ({pct}%)</span>
            <span>Raised: <span className="text-white">{formatCurrency(Number(offering.total_raised))}</span></span>
          </div>
        </div>
        <Link href={`/c/${slug}`} className="text-accent hover:text-accent-hover text-sm font-semibold whitespace-nowrap">View page →</Link>
      </div>
      <div className="mt-3 h-1.5 bg-subtle rounded-full overflow-hidden"><div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
    </div>
  )
}
