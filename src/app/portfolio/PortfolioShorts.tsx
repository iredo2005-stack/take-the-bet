'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatNumber } from '@/lib/utils'

type Short = {
  id: string
  shares: number
  open_price: number
  collateral: number
  liquidation_price: number
  status: string
  offerings: {
    current_price: number
    creators: {
      display_name: string
      slug: string
      photo_url?: string | null
    }
  }
}

export default function PortfolioShorts({ shorts }: { shorts: Short[] }) {
  const router = useRouter()
  const [closing, setClosing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function closeShort(id: string) {
    setClosing(id)
    setError(null)
    try {
      const res = await fetch(`/api/shorts/${id}/close`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to close'); return }
      router.refresh()
    } catch { setError('Network error') } finally { setClosing(null) }
  }

  if (shorts.length === 0) return null

  return (
    <div className="mb-4">
      <p className="text-[#8A8A82] text-[10px] uppercase tracking-widest font-semibold mb-3">
        Short Positions ({shorts.length})
      </p>
      <div className="space-y-2">
        {shorts.map((s) => {
          const currentPrice = Number(s.offerings.current_price)
          const openPrice = Number(s.open_price)
          const collateral = Number(s.collateral)
          const liqPrice = Number(s.liquidation_price)
          const rawPnl = (openPrice - currentPrice) * s.shares
          const finalPnl = Math.max(-collateral, rawPnl)
          const isProfit = finalPnl >= 0
          const pctFromOpen = openPrice > 0 ? ((currentPrice - openPrice) / openPrice) * 100 : 0
          const c = s.offerings.creators
          const dangerPct = liqPrice > openPrice
            ? Math.min(100, ((currentPrice - openPrice) / (liqPrice - openPrice)) * 100)
            : 0

          return (
            <div key={s.id} className="bg-card border border-edge rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 p-3.5">
                <div className="relative flex-shrink-0">
                  {c.photo_url ? (
                    <img src={c.photo_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-down/10 flex items-center justify-center text-down text-sm font-bold">
                      {c.display_name[0]}
                    </div>
                  )}
                  <span className="absolute -top-1 -right-1 bg-down text-white text-[7px] font-bold px-1 py-0.5 rounded leading-tight">
                    SHORT
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <Link href={`/c/${c.slug}`} className="text-[#F5F5F0] text-sm font-semibold truncate hover:text-accent transition-colors block">
                    {c.display_name}
                  </Link>
                  <p className="text-[#8A8A82] text-[10px]">
                    {formatNumber(s.shares)} shares short @ {formatCurrency(openPrice)}
                  </p>
                  <p className="text-[9px] text-down/70 mt-0.5">
                    Liquidation at {formatCurrency(liqPrice)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[#F5F5F0] text-sm font-bold">{formatCurrency(collateral)}</p>
                  <p className={`text-[10px] font-semibold ${isProfit ? 'text-up' : 'text-down'}`}>
                    {isProfit ? '+' : ''}{formatCurrency(finalPnl)} P&L
                  </p>
                </div>
              </div>

              {/* Danger bar + close button */}
              <div className="border-t border-edge/50 px-3.5 py-2 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[#8A8A82] text-[9px]">
                      Price {pctFromOpen >= 0 ? '+' : ''}{pctFromOpen.toFixed(1)}% since open · {formatCurrency(currentPrice)}
                    </span>
                  </div>
                  {dangerPct > 0 && (
                    <div className="w-full h-1 bg-edge rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${dangerPct > 75 ? 'bg-down' : dangerPct > 50 ? 'bg-yellow-500' : 'bg-up'}`}
                        style={{ width: `${Math.min(100, dangerPct)}%` }}
                      />
                    </div>
                  )}
                </div>
                <button
                  onClick={() => closeShort(s.id)}
                  disabled={closing === s.id}
                  className="text-[9px] text-down hover:text-white border border-down/30 hover:bg-down/20 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 flex-shrink-0"
                >
                  {closing === s.id ? 'Closing…' : 'Close Short'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {error && <p className="text-down text-xs mt-2">{error}</p>}
    </div>
  )
}
