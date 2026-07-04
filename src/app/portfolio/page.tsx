import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { UserButton } from '@clerk/nextjs'
import { Logo } from '@/components/Logo'
import PortfolioChart from './PortfolioChart'
import PortfolioHoldings from './PortfolioHoldings'
import PortfolioShorts from './PortfolioShorts'

export default async function PortfolioPage() {
  const user = await requireUser()
  const supabase = createAdminClient()
  const balance = Number(user.balance ?? 0)

  // Holdings — try with optional columns, fall back if they don't exist yet
  const { data: rawHoldings, error: holdingsErr } = await supabase
    .from('holdings')
    .select('*, offerings(id, title, current_price, initial_price, last_change_pct, creators(display_name, slug, photo_url, price_driver))')
    .eq('user_id', user.id)
    .gt('shares_owned', 0)
  let finalHoldings: any[] | null = rawHoldings as any[] | null
  if (holdingsErr) {
    const { data: fallbackH } = await supabase
      .from('holdings')
      .select('*, offerings(id, title, current_price, initial_price, creators(display_name, slug, photo_url))')
      .eq('user_id', user.id)
      .gt('shares_owned', 0)
    finalHoldings = fallbackH
  }
  const holdings = (finalHoldings || []).filter((h: any) => h.offerings != null) as any[]

  // Open short positions (graceful if table doesn't exist yet)
  const { data: rawShorts } = await supabase
    .from('shorts')
    .select('*, offerings(id, current_price, creators(display_name, slug, photo_url))')
    .eq('user_id', user.id)
    .eq('status', 'open')
  const shorts = (rawShorts || []).filter((sh: any) => sh.offerings != null) as any[]

  const totalInvested = holdings.reduce((s: number, h: any) => s + Number(h.total_invested), 0)
  const holdingsValue = holdings.reduce((s: number, h: any) => s + h.shares_owned * Number(h.offerings?.current_price ?? 0), 0)

  // Shorts current value = collateral + unrealized P&L (max loss = collateral)
  const shortsValue = shorts.reduce((s: number, sh: any) => {
    const rawPnl = (Number(sh.open_price) - Number(sh.offerings?.current_price ?? sh.open_price)) * sh.shares
    const finalPnl = Math.max(-Number(sh.collateral), rawPnl)
    return s + Math.max(0, Number(sh.collateral) + finalPnl)
  }, 0)

  const totalValue = holdingsValue + balance + shortsValue
  const totalPnl = holdingsValue - totalInvested
  const pnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0
  const isUp = totalPnl >= 0

  // Transaction history for portfolio chart
  const { data: txHistory } = await supabase
    .from('transactions')
    .select('total_amount, created_at')
    .eq('buyer_id', user.id)
    .eq('status', 'completed')
    .order('created_at', { ascending: true })
    .limit(50)

  let cumInvested = 0
  const chartData = (txHistory || []).map((tx: any) => {
    cumInvested += Number(tx.total_amount)
    return { time: tx.created_at, invested: Math.round(cumInvested * 100) / 100 }
  })
  if (chartData.length > 0) {
    chartData.push({ time: new Date().toISOString(), invested: Math.round(totalInvested * 100) / 100 })
  }

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

        {/* Stats bar */}
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

        {/* Short positions (client component, handles close action) */}
        <PortfolioShorts shorts={shorts} />

        {/* Long holdings (client component, handles share card) */}
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
            <PortfolioHoldings holdings={holdings} />
          )}
        </div>
      </main>
    </div>
  )
}
