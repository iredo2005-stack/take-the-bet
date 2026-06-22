import { notFound } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatCurrency, formatNumber } from '@/lib/utils'
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

  return (
    <div className="min-h-screen bg-bg">
      <nav className="bg-card border-b border-edge px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link href="/" className="text-white font-bold text-lg tracking-tight hover:text-accent transition-colors">Take The Bet</Link>
        <Link href="/sign-up" className="text-sm text-gray-400 hover:text-white transition-colors">Sign up</Link>
      </nav>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <CreatorHeader creator={creator} offering={offering} />
        {offering ? (
          <>
            <TrustBadges commissionRate={Number(offering.primary_commission_rate)} />
            <div className="bg-card border border-edge rounded-2xl p-5 sm:p-6 mb-4">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-5">
                <div><p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Current Price</p><p className="text-3xl font-bold text-white">{formatCurrency(Number(offering.current_price))}</p></div>
                <p className="text-gray-500 text-sm">Initial: {formatCurrency(Number(offering.initial_price))}</p>
              </div>
              <PriceChart history={priceHistory} currentPrice={Number(offering.current_price)} initialPrice={Number(offering.initial_price)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mb-4">
              <OfferingStats offering={offering} />
              <BuyPanel offering={offering} isOwner={isOwner} />
            </div>
            <HowItWorks commissionRate={Number(offering.primary_commission_rate)} />
          </>
        ) : (
          <div className="bg-card border border-edge rounded-2xl p-8 text-center"><p className="text-gray-400">This creator hasn&apos;t launched an offering yet.</p></div>
        )}
      </main>
    </div>
  )
}

function CreatorHeader({ creator, offering }: { creator: CreatorRow; offering: OfferingRow | null }) {
  const img = (offering as any)?.image_url || creator.photo_url
  return (
    <div className="flex flex-col sm:flex-row items-start gap-5 mb-6">
      {img ? <img src={img} alt={creator.display_name} className="w-20 h-20 rounded-2xl object-cover border border-edge flex-shrink-0" />
      : <div className="w-20 h-20 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-3xl font-bold flex-shrink-0">{creator.display_name[0]}</div>}
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">{creator.display_name}</h1>
        {creator.bio && <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-line">{creator.bio}</p>}
      </div>
    </div>
  )
}

function TrustBadges({ commissionRate }: { commissionRate: number }) {
  const pct = (commissionRate * 100).toFixed(0)
  return (
    <div className="bg-card border border-edge rounded-2xl p-4 sm:p-5 mb-4 space-y-3">
      <h3 className="text-white font-semibold text-sm">Trust &amp; Transparency</h3>
      <div className="space-y-2.5">
        <Badge icon="✓" color="up" title="Platform Verified" desc="This creator's identity has been confirmed by Take The Bet." />
        <Badge icon="⬡" color="accent" title={`${pct}% on initial offering`} desc={`A ${pct}% platform fee is applied only when shares are first purchased. Shown transparently on every transaction.`} />
        <Badge icon="◈" color="purple-400" title="Bot-Filtered" desc="Creator metrics are filtered to remove fake followers and bot activity. Numbers reflect real human engagement." />
      </div>
    </div>
  )
}

function Badge({ icon, color, title, desc }: { icon: string; color: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg bg-${color}/10 text-${color} text-xs flex-shrink-0 mt-0.5`}>{icon}</span>
      <div><p className="text-white text-sm font-medium">{title}</p><p className="text-gray-500 text-xs leading-relaxed">{desc}</p></div>
    </div>
  )
}

function OfferingStats({ offering }: { offering: OfferingRow }) {
  const pct = offering.total_shares > 0 ? Math.round((offering.shares_sold / offering.total_shares) * 100) : 0
  return (
    <div className="sm:col-span-3 bg-card border border-edge rounded-2xl p-5">
      <h2 className="text-white font-semibold mb-4">{offering.title}</h2>
      {offering.description && <p className="text-gray-400 text-sm leading-relaxed mb-4 whitespace-pre-line">{offering.description}</p>}
      <div className="space-y-3">
        <Row label="Shares available" value={`${formatNumber(offering.shares_available)} / ${formatNumber(offering.total_shares)}`} />
        <Row label="Shares sold" value={formatNumber(offering.shares_sold)} />
        <Row label="Total raised" value={formatCurrency(Number(offering.total_raised))} />
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1.5"><span>Sold</span><span>{pct}%</span></div>
          <div className="h-2 bg-subtle rounded-full overflow-hidden"><div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-sm"><span className="text-gray-500">{label}</span><span className="text-white font-medium">{value}</span></div>
}

function HowItWorks({ commissionRate }: { commissionRate: number }) {
  const pct = (commissionRate * 100).toFixed(0)
  return (
    <div className="bg-card border border-edge rounded-2xl p-5">
      <h3 className="text-white font-semibold text-sm mb-3">How pricing works</h3>
      <div className="space-y-2 text-sm text-gray-400">
        <p>Share prices are driven by <span className="text-white">supply and demand</span> — more buyers push the price up.</p>
        <p>A <span className="text-white">{pct}% platform fee applies only to the initial offering</span>. Always shown before you confirm.</p>
        <p>Creator metrics are <span className="text-white">bot-filtered</span> to ensure prices reflect real engagement.</p>
      </div>
    </div>
  )
}
