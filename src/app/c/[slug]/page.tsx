import { Logo } from "@/components/Logo"
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { basePricePerShare, type CreatorMetrics } from '@/lib/pricing'
import type { CreatorRow, OfferingRow, PriceHistoryRow } from '@/types/database'
import PriceChart from './PriceChart'
import BuyPanel from './BuyPanel'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ tab?: string }>
}

async function getCreatorData(slug: string) {
  const supabase = createAdminClient()
  const { data: creator } = await supabase.from('creators').select('*').eq('slug', slug).single()
  if (!creator) return null
  const { data: offerings } = await supabase.from('offerings').select('*').eq('creator_id', creator.id).eq('status', 'active').order('created_at', { ascending: false })
  const offering = offerings?.[0] || null
  let priceHistory: PriceHistoryRow[] = []
  if (offering) {
    const { data } = await supabase.from('price_history').select('*').eq('offering_id', offering.id).order('recorded_at', { ascending: true })
    priceHistory = data || []
  }
  return { creator, offering, priceHistory }
}

export default async function CreatorPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { tab } = await searchParams
  const defaultTab = tab === 'short' ? 'short' : 'buy'

  const data = await getCreatorData(slug)
  if (!data) notFound()
  const { creator, offering, priceHistory } = data

  let isOwner = false
  try {
    const { userId } = await auth()
    if (userId) {
      const supabase = createAdminClient()
      const { data: v } = await supabase.from('users').select('id').eq('clerk_id', userId).single()
      if (v && v.id === creator.user_id) isOwner = true
    }
  } catch {}

  const metrics: CreatorMetrics = {
    subscribers: creator.subscribers ?? 0,
    monthly_views: creator.monthly_views ?? 0,
    engagement_rate: Number(creator.engagement_rate ?? 0),
    post_frequency: creator.post_frequency ?? 'regular',
    monthly_growth_percent: Number(creator.monthly_growth_percent ?? 0),
  }
  const basePrice = offering ? basePricePerShare(metrics, offering.total_shares) : 0
  const hasMetrics = metrics.subscribers > 0 || metrics.monthly_views > 0

  return (
    <div className="min-h-screen bg-bg pb-20 sm:pb-0">
      <nav className="bg-card border-b border-edge px-4 sm:px-6 py-2.5 flex items-center justify-between">
        <Link href="/dashboard"><Logo size="sm" /></Link>
        <Link href="/sign-up" className="text-xs text-[#707A8A] hover:text-[#1E2329] transition-colors">Sign up</Link>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-5">
        {/* Creator header */}
        <div className="flex items-center gap-3 mb-4">
          {(offering as any)?.image_url || creator.photo_url ? (
            <img src={(offering as any)?.image_url || creator.photo_url} alt={creator.display_name}
              className="w-10 h-10 rounded-xl object-cover border border-edge flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-sm font-bold flex-shrink-0">
              {creator.display_name[0]}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold text-[#1E2329] truncate">{creator.display_name}</h1>
            {metrics.subscribers > 0 && (
              <p className="text-[#707A8A] text-[10px] flex items-center gap-1 mt-0.5">
                <span className={`text-[9px] ${metrics.monthly_growth_percent > 0 ? 'text-up' : metrics.monthly_growth_percent < 0 ? 'text-down' : 'text-[#707A8A]'}`}>
                  {metrics.monthly_growth_percent > 0 ? '▲' : metrics.monthly_growth_percent < 0 ? '▼' : '—'}
                </span>
                {metrics.subscribers >= 1_000_000
                  ? `${(metrics.subscribers / 1_000_000).toFixed(1)}M`
                  : metrics.subscribers >= 1_000
                    ? `${Math.round(metrics.subscribers / 1_000)}K`
                    : String(metrics.subscribers)
                } {creator.platform === 'twitch' ? 'followers' : 'subscribers'}
                {metrics.monthly_growth_percent !== 0 && (
                  <span className={`ml-1 ${metrics.monthly_growth_percent > 0 ? 'text-up' : 'text-down'}`}>
                    ({metrics.monthly_growth_percent > 0 ? '+' : ''}{metrics.monthly_growth_percent.toFixed(1)}%)
                  </span>
                )}
              </p>
            )}
          </div>
          {hasMetrics && basePrice > 0 && (
            <div className="text-right flex-shrink-0">
              <p className="text-[#707A8A] text-[10px] uppercase tracking-wide">Fair Value</p>
              <p className="text-[#1E2329] text-xs font-semibold">{formatCurrency(basePrice)}</p>
            </div>
          )}
        </div>

        {offering ? (
          <>
            {/* Big chart */}
            <PriceChart history={priceHistory} currentPrice={Number(offering.current_price)} initialPrice={Number(offering.initial_price)} />

            {/* Driver label — shown only after cron runs and columns exist */}
            {(creator as any).price_driver && (offering as any).last_change_pct != null && (
              <div className="flex items-center gap-1.5 mb-2 px-1">
                <span className={`text-[10px] font-semibold ${Number((offering as any).last_change_pct) >= 0 ? 'text-up' : 'text-down'}`}>
                  {Number((offering as any).last_change_pct) >= 0 ? '▲' : '▼'} {Math.abs(Number((offering as any).last_change_pct)).toFixed(1)}%
                </span>
                <span className="text-[#707A8A] text-[10px]">— {(creator as any).price_driver}</span>
              </div>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              <MiniStat label="Available" value={formatNumber(offering.shares_available)} />
              <MiniStat label="Sold" value={formatNumber(offering.shares_sold)} />
              <MiniStat label="Volume" value={formatCurrency(Number(offering.total_raised))} />
              <MiniStat label="Supply" value={formatNumber(offering.total_shares)} />
            </div>

            {/* Info + Action */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 mb-3">
              <div className="sm:col-span-3">
                <OfferingInfo offering={offering} />
                <TrustBadges />
              </div>
              <BuyPanel offering={offering} isOwner={isOwner} defaultTab={defaultTab as 'buy' | 'short'} />
            </div>

            <HowItWorks />
          </>
        ) : (
          <div className="bg-card border border-edge rounded-xl p-6 text-center">
            <p className="text-[#707A8A] text-xs">No active offering yet.</p>
          </div>
        )}
      </main>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-edge rounded-lg p-2.5 text-center">
      <p className="text-[#707A8A] text-[9px] uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-[#1E2329] text-xs font-bold truncate">{value}</p>
    </div>
  )
}

function OfferingInfo({ offering }: { offering: OfferingRow }) {
  return offering.description ? (
    <div className="bg-card border border-edge rounded-xl p-3 mb-2">
      <h2 className="text-[#1E2329] text-xs font-semibold mb-1">{offering.title}</h2>
      <p className="text-[#707A8A] text-xs leading-relaxed whitespace-pre-line">{offering.description}</p>
    </div>
  ) : null
}

function TrustBadges() {
  return (
    <div className="bg-card border border-edge rounded-xl p-3 space-y-2">
      <p className="text-[#1E2329] text-[10px] font-semibold uppercase tracking-wider">Trust & Transparency</p>
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[10px] font-medium px-2 py-1 rounded-md bg-up/10 text-up border border-up/10">✓ Verified</span>
        <span className="text-[10px] font-medium px-2 py-1 rounded-md bg-accent/10 text-accent border border-accent/10">2% buy / 1% sell</span>
        <span className="text-[10px] font-medium px-2 py-1 rounded-md bg-accent/10 text-accent border border-accent/10">◈ Bot-Filtered</span>
        <span className="text-[10px] font-medium px-2 py-1 rounded-md bg-subtle text-[#707A8A] border border-edge">20% Treasury</span>
        <span className="text-[10px] font-medium px-2 py-1 rounded-md bg-subtle text-[#707A8A] border border-edge">🎮 Play Money</span>
      </div>
    </div>
  )
}

function HowItWorks() {
  return (
    <div className="bg-card border border-edge rounded-xl p-3 mt-3">
      <p className="text-[#1E2329] text-[10px] font-semibold uppercase tracking-wider mb-2">How it works</p>
      <div className="space-y-1.5 text-[11px] text-[#707A8A] leading-relaxed">
        <p>Prices follow <span className="text-[#1E2329]">growth momentum</span>. Blowing up → price rises. Stalling → price drops.</p>
        <p><span className="text-[#1E2329]">2% fee on every buy</span>, <span className="text-[#1E2329]">1% fee on every sell or short close</span>. 20% treasury held for liquidity.</p>
        <p>Growth is tracked live and <span className="text-[#1E2329]">updated daily</span> from real platform data. Price moves are capped at ±15%/day.</p>
        <p className="text-[9px] text-[#707A8A]/70 border-t border-edge pt-1.5 mt-1">
          Hype Coins (HC) are virtual play currency with no real-world cash value. This is a game.
        </p>
      </div>
    </div>
  )
}
