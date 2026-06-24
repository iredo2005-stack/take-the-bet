import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { UserButton } from '@clerk/nextjs'
import { Logo } from '@/components/Logo'
import PortfolioChart from './PortfolioChart'

export default async function PortfolioPage() {
  const user = await requireUser()
  const supabase = createAdminClient()
  const balance = Number(user.balance ?? 0)

  // Holdings
  const { data: rawHoldings } = await supabase.from('holdings').select('*, offerings(id, title, current_price, initial_price, creators(display_name, slug, photo_url))').eq('user_id', user.id).gt('shares_owned', 0)
  const holdings = (rawHoldings || []) as any[]

  const totalInvested = holdings.reduce((s: number, h: any) => s + Number(h.total_invested), 0)
  const holdingsValue = holdings.reduce((s: number, h: any) => s + h.shares_owned * Number(h.offerings.current_price), 0)
  const totalValue = holdingsValue + balance
  const totalPnl = holdingsValue - totalInvested
  const pnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0
  const isUp = totalPnl >= 0

  // Transaction history for portfolio chart (last 30 entries)
  const { data: txHistory } = await supabase.from('transactions').select('total_amount, created_at').eq('buyer_id', user.id).eq('status', 'completed').order('created_at', { ascending: true }).limit(50)

  // Build portfolio value over time (cumulative invested vs current value)
  let cumInvested = 0
  const chartData = (txHistory || []).map((tx: any) => {
    cumInvested += Number(tx.total_amount)
    return { time: tx.created_at, invested: Math.round(cumInvested * 100) / 100 }
  })
  // Add current state as final point
  if (chartData.length > 0) {
    chartData.push({ time: new Date().toISOString(), invested: Math.round(totalInvested * 100) / 100 })
  }

  // Sort holdings by value descending
  const sortedHoldings = [...holdings].sort((a: any, b: any) =>
    (b.shares_owned * Number(b.offerings.current_price)) - (a.shares_owned * Number(a.offerings.current_price))
  )

  return (
    <div className="min-h-screen bg-bg pb-20 sm:pb-0">
      <nav className="bg-card border-b border-edge px-4 sm:px-6 py-2.5 flex items-center justify-between">
        <Link href="/dashboard"><Logo size="sm" /></Link>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-[#8A8A82] hover:text-[#F5F5F0] text-xs transition-colors hidden sm:block">Markets</Link>
          <Link href="/leaderboard" className="text-[#8A8A82] hover:text-[#F5F5F0] text-xs transition-colors hidden sm:block">Leaderboard</Link>
          <UserButton afterSignOutUrl="/" />
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        {/* Total value hero */}
        <div className="text-center mb-6">
          <p className="text-[#8A8A82] text-[10px] uppercase tracking-widest mb-1">Total Portfolio Value</p>
          <p className="text-[#F5F5F0] text-3xl sm:text-4xl font-bold tracking-tight">{formatCurrency(totalValue)}</p>
          <div className="flex items-center justify-center gap-3 mt-2">
            <span className={`text-sm font-bold ${isUp ? 'text-up' : 'text-down'}`}>
              {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{formatCurrency(totalPnl)}
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${isUp ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
              {isUp ? '+' : ''}{pnlPct.toFixed(1)}% all-time
            </span>
          </div>
        </div>

        {/* Portfolio chart */}
        {chartData.length >= 2 && (
          <div className="bg-card border border-edge rounded-2xl p-4 mb-5">
            <PortfolioChart data={chartData} currentValue={holdingsValue} />
          </div>
        )}

        {/* Balance + Holdings value */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          <div className="bg-card border border-edge rounded-xl p-3 text-center">
            <p className="text-[#8A8A82] text-[9px] uppercase tracking-widest mb-0.5">Holdings</p>
            <p className="text-[#F5F5F0] text-sm font-bold">{formatCurrency(holdingsValue)}</p>
          </div>
          <div className="bg-card border border-edge rounded-xl p-3 text-center">
            <p className="text-[#8A8A82] text-[9px] uppercase tracking-widest mb-0.5">Available</p>
            <p className="text-accent text-sm font-bold">{formatNumber(Math.round(balance))} HC</p>
          </div>
          <div className="bg-card border border-edge rounded-xl p-3 text-center">
            <p className="text-[#8A8A82] text-[9px] uppercase tracking-widest mb-0.5">Invested</p>
            <p className="text-[#F5F5F0] text-sm font-bold">{formatCurrency(totalInvested)}</p>
          </div>
        </div>

        {/* Holdings */}
        <div className="mb-4">
          <p className="text-[#8A8A82] text-[10px] uppercase tracking-widest font-semibold mb-3">
            Your Holdings ({holdings.length})
          </p>

          {holdings.length === 0 ? (
            <div className="bg-card border border-edge rounded-2xl p-8 text-center">
              <p className="text-[#8A8A82] text-xs mb-3">No holdings yet</p>
              <Link href="/dashboard" className="text-accent text-xs font-semibold hover:underline">Browse creators →</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedHoldings.map((h: any) => {
                const cv = h.shares_owned * Number(h.offerings.current_price)
                const inv = Number(h.total_invested)
                const pnl = cv - inv
                const pct = inv > 0 ? (pnl / inv) * 100 : 0
                const up = pnl >= 0
                const c = h.offerings.creators

                return (
                  <Link key={h.id} href={`/c/${c.slug}`}
                    className="flex items-center gap-3 bg-card border border-edge rounded-xl p-3.5 hover:border-edge/80 transition-all">
                    {/* Avatar */}
                    {c.photo_url ? (
                      <img src={c.photo_url} alt="" className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent text-sm font-bold flex-shrink-0">{c.display_name[0]}</div>
                    )}

                    {/* Name + shares */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[#F5F5F0] text-sm font-semibold truncate">{c.display_name}</p>
                      <p className="text-[#8A8A82] text-[10px]">{formatNumber(h.shares_owned)} shares · avg {formatCurrency(Number(h.avg_buy_price))}</p>
                    </div>

                    {/* Value + P&L */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-[#F5F5F0] text-sm font-bold">{formatCurrency(cv)}</p>
                      <p className={`text-[10px] font-semibold ${up ? 'text-up' : 'text-down'}`}>
                        {up ? '+' : ''}{formatCurrency(pnl)} ({up ? '+' : ''}{pct.toFixed(1)}%)
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
