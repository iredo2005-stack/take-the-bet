import { notFound } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { basePricePerShare, type CreatorMetrics } from '@/lib/pricing'
import type { CreatorRow, OfferingRow, PriceHistoryRow } from '@/types/database'
import PriceChart from './PriceChart'
import BuyPanel from './BuyPanel'

type Props = { params: Promise<{ slug: string }> }

async function getCreatorData(slug: string) {
  const supabase = createAdminClient()
  const { data: creator } = await supabase.from('creators').select('*').eq('slug', slug).single()
  if (!creator) return null
  const { data: offerings } = await supabase.from('offerings').select('*').eq('creator_id', creator.id).eq('status', 'active').order('created_at', { ascending: false })
  const offering = offerings?.[0] || null
  let priceHistory: PriceHistoryRow[] = []
  if (offering) { const { data } = await supabase.from('price_history').select('*').eq('offering_id', offering.id).order('recorded_at', { ascending: true }); priceHistory = data || [] }
  return { creator, offering, priceHistory }
}

export default async function CreatorPage({ params }: Props) {
  const { slug } = await params
  const data = await getCreatorData(slug)
  if (!data) notFound()
  const { creator, offering, priceHistory } = data

  let isOwner = false
  try { const { userId } = await auth(); if (userId) { const supabase = createAdminClient(); const { data: v } = await supabase.from('users').select('id').eq('clerk_id', userId).single(); if (v && v.id === creator.user_id) isOwner = true } } catch {}

  const metrics: CreatorMetrics = {
    subscribers: creator.subscribers ?? 0, monthly_views: creator.monthly_views ?? 0,
    engagement_rate: Number(creator.engagement_rate ?? 0), post_frequency: creator.post_frequency ?? 'regular',
    monthly_growth_percent: Number(creator.monthly_growth_percent ?? 0),
  }
  const basePrice = offering ? basePricePerShare(metrics, offering.total_shares) : 0
  const hasMetrics = metrics.subscribers > 0 || metrics.monthly_views > 0

  return (
    <div className="min-h-screen bg-bg pb-20 sm:pb-0">
      <nav className="bg-card border-b border-edge px-4 sm:px-6 py-2.5 flex items-center justify-between">
        <Link href="/dashboard" className="text-accent font-bold text-sm tracking-tight">Take The Bet</Link>
        <Link href="/sign-up" className="text-xs text-[#8A8A82] hover:text-[#F5F5F0] transition-colors">Sign up</Link>
      </nav>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-5">
        {/* Creator header — compact */}
        <div className="flex items-center gap-3 mb-4">
          {(offering as any)?.image_url || creator.photo_url ? (
            <img src={(offering as any)?.image_url || creator.photo_url} alt={creator.display_name} className="w-10 h-10 rounded-xl object-cover border border-edge flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-sm font-bold flex-shrink-0">{creator.display_name[0]}</div>
          )}
          <div className="min-w-0">
            <h1 className="text-base font-bold text-[#F5F5F0] truncate">{creator.display_name}</h1>
            {creator.bio && <p className="text-[#8A8A82] text-xs truncate">{creator.bio.slice(0, 80)}</p>}
          </div>
          {hasMetrics && basePrice > 0 && (
            <div className="ml-auto text-right flex-shrink-0">
              <p className="text-[#8A8A82] text-[10px] uppercase tracking-wide">Fair Value</p>
              <p className="text-[#F5F5F0] text-xs font-semibold">{formatCurrency(basePrice)}</p>
            </div>
          )}
        </div>

        {offering ? (
          <>
            {/* Big chart */}
            <PriceChart history={priceHistory} currentPrice={Number(offering.current_price)} initialPrice={Number(offering.initial_price)} />

            {/* Stats row — compact */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              <MiniStat label="Available" value={formatNumber(offering.shares_available)} />
              <MiniStat label="Sold" value={formatNumber(offering.shares_sold)} />
              <MiniStat label="Raised" value={formatCurrency(Number(offering.total_raised))} />
              <MiniStat label="Supply" value={formatNumber(offering.total_shares)} />
            </div>

            {/* Trust + Buy */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 mb-3">
              <div className="sm:col-span-3">
                <OfferingInfo offering={offering} />
                <TrustBadges commissionRate={Number(offering.primary_commission_rate)} />
              </div>
              <BuyPanel offering={offering} isOwner={isOwner} />
            </div>

            <HowItWorks commissionRate={Number(offering.primary_commission_rate)} />
          </>
        ) : (
          <div className="bg-card border border-edge rounded-xl p-6 text-center"><p className="text-[#8A8A82] text-xs">No active offering yet.</p></div>
        )}
      </main>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-edge rounded-lg p-2.5 text-center">
      <p className="text-[#8A8A82] text-[9px] uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-[#F5F5F0] text-xs font-bold truncate">{value}</p>
    </div>
  )
}

function OfferingInfo({ offering }: { offering: OfferingRow }) {
  return offering.description ? (
    <div className="bg-card border border-edge rounded-xl p-3 mb-2">
      <h2 className="text-[#F5F5F0] text-xs font-semibold mb-1">{offering.title}</h2>
      <p className="text-[#8A8A82] text-xs leading-relaxed whitespace-pre-line">{offering.description}</p>
    </div>
  ) : null
}

function TrustBadges({ commissionRate }: { commissionRate: number }) {
  const pct = (commissionRate * 100).toFixed(0)
  return (
    <div className="bg-card border border-edge rounded-xl p-3 space-y-2">
      <p className="text-[#F5F5F0] text-[10px] font-semibold uppercase tracking-wider">Trust & Transparency</p>
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[10px] font-medium px-2 py-1 rounded-md bg-up/10 text-up border border-up/10">✓ Verified</span>
        <span className="text-[10px] font-medium px-2 py-1 rounded-md bg-accent/10 text-accent border border-accent/10">{pct}% initial fee</span>
        <span className="text-[10px] font-medium px-2 py-1 rounded-md bg-accent/10 text-accent border border-accent/10">◈ Bot-Filtered</span>
        <span className="text-[10px] font-medium px-2 py-1 rounded-md bg-subtle text-[#8A8A82] border border-edge">20% Treasury</span>
      </div>
    </div>
  )
}

function HowItWorks({ commissionRate }: { commissionRate: number }) {
  const pct = (commissionRate * 100).toFixed(0)
  return (
    <div className="bg-card border border-edge rounded-xl p-3 mt-3">
      <p className="text-[#F5F5F0] text-[10px] font-semibold uppercase tracking-wider mb-2">How pricing works</p>
      <div className="space-y-1.5 text-[11px] text-[#8A8A82] leading-relaxed">
        <p>Prices move with <span className="text-[#F5F5F0]">supply and demand</span>. More buyers push the price up.</p>
        <p><span className="text-[#F5F5F0]">{pct}% fee</span> on the initial offering only. 20% treasury held for liquidity.</p>
        <p>Metrics are <span className="text-[#F5F5F0]">bot-filtered</span> to reflect real engagement.</p>
      </div>
    </div>
  )
}
