import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatCurrency, formatNumber } from '@/lib/utils'
import type { Metadata } from 'next'

type Props = { params: Promise<{ username: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  return { title: `@${username} — Take The Bet`, description: `View ${username}'s trading profile on Take The Bet.` }
}

export default async function TraderProfilePage({ params }: Props) {
  const { username } = await params
  const supabase = createAdminClient()

  const { data: user } = await supabase.from('users').select('*').eq('username', username).single()
  if (!user) notFound()
  if (!user.profile_public) {
    return (
      <Shell username={username}>
        <div className="bg-card border border-edge rounded-2xl p-10 text-center">
          <p className="text-gray-500">This profile is private.</p>
        </div>
      </Shell>
    )
  }

  // Holdings with creator data
  const { data: rawHoldings } = await supabase.from('holdings').select('*, offerings(id, title, current_price, initial_price, creators(display_name, slug, photo_url))').eq('user_id', user.id).gt('shares_owned', 0)
  const holdings = (rawHoldings || []) as any[]

  const totalInvested = holdings.reduce((s: number, h: any) => s + Number(h.total_invested), 0)
  const currentValue = holdings.reduce((s: number, h: any) => s + h.shares_owned * Number(h.offerings.current_price), 0)
  const portfolioValue = currentValue + Number(user.balance ?? 0)
  const totalPnl = currentValue - totalInvested
  const pnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0

  // Bet stats
  const { data: betPositions } = await supabase.from('bet_positions').select('*, video_bets(status, winning_outcome_id)').eq('user_id', user.id)
  const resolvedBets = (betPositions || []).filter((p: any) => p.video_bets?.status === 'resolved')
  const wonBets = resolvedBets.filter((p: any) => p.outcome_id === p.video_bets?.winning_outcome_id)
  const winRate = resolvedBets.length > 0 ? Math.round((wonBets.length / resolvedBets.length) * 100) : null
  const totalBetProfit = resolvedBets.reduce((s: number, p: any) => s + (Number(p.payout ?? 0) - Number(p.amount)), 0)

  // Best trades (holdings with highest unrealized P&L)
  const bestTrades = [...holdings]
    .map((h: any) => ({
      name: h.offerings.creators.display_name,
      slug: h.offerings.creators.slug,
      photo: h.offerings.creators.photo_url,
      shares: h.shares_owned,
      invested: Number(h.total_invested),
      value: h.shares_owned * Number(h.offerings.current_price),
      pnl: h.shares_owned * Number(h.offerings.current_price) - Number(h.total_invested),
    }))
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, 3)

  // Best bet wins
  const bestBets = wonBets
    .map((p: any) => ({ amount: Number(p.amount), payout: Number(p.payout ?? 0) }))
    .sort((a: any, b: any) => (b.payout - b.amount) - (a.payout - a.amount))
    .slice(0, 3)

  const isUp = totalPnl >= 0

  return (
    <Shell username={username}>
      {/* Profile header */}
      <div className="bg-card border border-edge rounded-2xl p-5 sm:p-6 mb-4">
        <div className="flex items-center gap-4 mb-5">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt={username} className="w-16 h-16 rounded-full object-cover border-2 border-edge" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-accent/10 border-2 border-accent/20 flex items-center justify-center text-accent text-2xl font-bold">
              {(user.full_name || username)[0].toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-white">@{username}</h1>
            {user.full_name && <p className="text-gray-400 text-sm">{user.full_name}</p>}
            <p className="text-gray-600 text-xs mt-1">Member since {new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Portfolio Value" value={formatCurrency(portfolioValue)} />
          <Stat label="All-time P&L" value={`${isUp ? '+' : ''}${formatCurrency(totalPnl)}`} color={isUp ? 'text-up' : 'text-down'} sub={`${isUp ? '+' : ''}${pnlPct.toFixed(1)}%`} />
          <Stat label="Bet Win Rate" value={winRate !== null ? `${winRate}%` : '—'} sub={resolvedBets.length > 0 ? `${wonBets.length}/${resolvedBets.length} bets` : 'No bets yet'} />
          <Stat label="Bet Profit" value={`${totalBetProfit >= 0 ? '+' : ''}${formatCurrency(totalBetProfit)}`} color={totalBetProfit >= 0 ? 'text-up' : 'text-down'} />
        </div>
      </div>

      {/* Holdings */}
      <div className="bg-card border border-edge rounded-2xl p-5 mb-4">
        <h2 className="text-white font-semibold text-sm mb-4">Holdings ({holdings.length})</h2>
        {holdings.length === 0 ? (
          <p className="text-gray-500 text-sm">No holdings yet.</p>
        ) : (
          <div className="space-y-2">
            {holdings.map((h: any) => {
              const cv = h.shares_owned * Number(h.offerings.current_price)
              const pnl = cv - Number(h.total_invested)
              const up = pnl >= 0
              return (
                <Link key={h.id} href={`/c/${h.offerings.creators.slug}`} className="flex items-center gap-3 bg-subtle rounded-xl p-3 hover:bg-muted transition-colors">
                  {h.offerings.creators.photo_url ? (
                    <img src={h.offerings.creators.photo_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs font-bold flex-shrink-0">{h.offerings.creators.display_name[0]}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{h.offerings.creators.display_name}</p>
                    <p className="text-gray-500 text-xs">{formatNumber(h.shares_owned)} shares</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-white text-sm font-semibold">{formatCurrency(cv)}</p>
                    <p className={`text-xs font-medium ${up ? 'text-up' : 'text-down'}`}>{up ? '+' : ''}{formatCurrency(pnl)}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Best trades */}
      {bestTrades.length > 0 && bestTrades[0].pnl > 0 && (
        <div className="bg-card border border-edge rounded-2xl p-5 mb-4">
          <h2 className="text-white font-semibold text-sm mb-4">Best Trades</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {bestTrades.filter(t => t.pnl > 0).map((t, i) => (
              <Link key={i} href={`/c/${t.slug}`} className="bg-up/5 border border-up/10 rounded-xl p-3 hover:bg-up/10 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  {t.photo ? <img src={t.photo} alt="" className="w-6 h-6 rounded-full object-cover" /> : <div className="w-6 h-6 rounded-full bg-up/20 flex items-center justify-center text-up text-[10px] font-bold">{t.name[0]}</div>}
                  <span className="text-white text-xs font-semibold truncate">{t.name}</span>
                </div>
                <p className="text-up text-lg font-bold">+{formatCurrency(t.pnl)}</p>
                <p className="text-gray-500 text-[10px]">{formatNumber(t.shares)} shares · {formatCurrency(t.invested)} invested</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Best bet wins */}
      {bestBets.length > 0 && bestBets[0].payout > bestBets[0].amount && (
        <div className="bg-card border border-edge rounded-2xl p-5">
          <h2 className="text-white font-semibold text-sm mb-4">Best Bet Wins</h2>
          <div className="flex gap-2">
            {bestBets.filter(b => b.payout > b.amount).map((b, i) => (
              <div key={i} className="bg-up/5 border border-up/10 rounded-xl p-3 flex-1">
                <p className="text-up text-sm font-bold">+{formatCurrency(b.payout - b.amount)}</p>
                <p className="text-gray-500 text-[10px]">Bet {formatCurrency(b.amount)} → Won {formatCurrency(b.payout)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Shell>
  )
}

function Shell({ username, children }: { username: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <nav className="bg-card border-b border-edge px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link href="/" className="text-white font-bold text-lg tracking-tight hover:text-accent transition-colors">Take The Bet</Link>
        <Link href="/sign-up" className="text-sm text-gray-400 hover:text-white transition-colors">Sign up</Link>
      </nav>
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">{children}</main>
      <footer className="text-center py-6"><p className="text-gray-700 text-xs">take-the-bet.vercel.app/trader/{username}</p></footer>
    </div>
  )
}

function Stat({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="bg-subtle rounded-xl p-3">
      <p className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-base font-bold truncate ${color || 'text-white'}`}>{value}</p>
      {sub && <p className="text-gray-500 text-[10px] mt-0.5">{sub}</p>}
    </div>
  )
}
