'use client'

import { useState } from 'react'
import Link from 'next/link'
import ShareCard from '@/components/ShareCard'
import { formatCurrency, formatNumber } from '@/lib/utils'

type Holding = {
  id: string
  shares_owned: number
  total_invested: number
  offerings: {
    current_price: number
    last_change_pct?: number | null
    creators: {
      display_name: string
      slug: string
      photo_url?: string | null
      price_driver?: string | null
    }
  }
}

export default function PortfolioHoldings({ holdings }: { holdings: Holding[] }) {
  const [shareCardId, setShareCardId] = useState<string | null>(null)

  const sorted = [...holdings].sort(
    (a, b) =>
      b.shares_owned * Number(b.offerings.current_price) -
      a.shares_owned * Number(a.offerings.current_price)
  )

  return (
    <div className="space-y-2">
      {sorted.map((h) => {
        const cv = h.shares_owned * Number(h.offerings.current_price)
        const inv = Number(h.total_invested)
        const pnl = cv - inv
        const pct = inv > 0 ? (pnl / inv) * 100 : 0
        const up = pnl >= 0
        const c = h.offerings.creators
        const breakEven = Math.round((inv / h.shares_owned) * 100) / 100
        const driver = c.price_driver
        const lastChange = h.offerings.last_change_pct != null ? Number(h.offerings.last_change_pct) : null
        const showFlex = pct >= 1

        return (
          <div key={h.id} className="bg-card border border-edge rounded-xl overflow-hidden hover:border-edge/80 transition-all">
            <Link href={`/c/${c.slug}`} className="flex items-center gap-3 p-3.5">
              {c.photo_url ? (
                <img src={c.photo_url} alt="" className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent text-sm font-bold flex-shrink-0">
                  {c.display_name[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[#1E2329] text-sm font-semibold truncate">{c.display_name}</p>
                <p className="text-[#707A8A] text-[10px]">
                  {formatNumber(h.shares_owned)} shares · break-even {formatCurrency(breakEven)}
                </p>
                {driver && lastChange !== null && (
                  <p className={`text-[9px] mt-0.5 ${lastChange >= 0 ? 'text-up/80' : 'text-down/80'}`}>
                    {lastChange >= 0 ? '▲' : '▼'} {driver}
                  </p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[#1E2329] text-sm font-bold">{formatCurrency(cv)}</p>
                <p className={`text-[10px] font-semibold ${up ? 'text-up' : 'text-down'}`}>
                  {up ? '+' : ''}{formatCurrency(pnl)} ({up ? '+' : ''}{pct.toFixed(1)}%)
                </p>
              </div>
            </Link>

            {/* Flex line + share button (positive P&L only) */}
            {showFlex && (
              <div className="border-t border-edge/50 px-3.5 py-2 flex items-center justify-between bg-up/5">
                <p className="text-accent text-[10px] font-semibold">
                  You bought {c.display_name} before +{pct.toFixed(1)}%
                </p>
                <button
                  onClick={() => setShareCardId(shareCardId === h.id ? null : h.id)}
                  className="text-[9px] text-[#707A8A] hover:text-accent border border-edge hover:border-accent/40 px-2 py-1 rounded-lg transition-colors"
                >
                  {shareCardId === h.id ? 'Close' : 'Share →'}
                </button>
              </div>
            )}

            {/* Break-even hint (negative P&L) */}
            {!up && (
              <div className="border-t border-edge/50 px-3.5 py-1.5">
                <span className="text-[#707A8A] text-[9px]">
                  Needs {formatCurrency(breakEven)} to break even · currently {formatCurrency(Number(h.offerings.current_price))}
                </span>
              </div>
            )}

            {/* Expanded share card */}
            {shareCardId === h.id && (
              <div className="border-t border-edge/50 p-4 flex justify-center">
                <ShareCard creatorName={c.display_name} gainPct={pct} photoUrl={c.photo_url} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
