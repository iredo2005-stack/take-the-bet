'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'
import { costOfShares, avgPriceForBuy, priceAfterBuy } from '@/lib/pricing'
import type { OfferingRow } from '@/types/database'

const BUY_FEE = 0.02   // 2% to buy — matches API (PRIMARY_COMMISSION_RATE=0.02)
const SHORT_OPEN_FEE = 0.02
const SHORT_CLOSE_FEE = 0.01

type Props = { offering: OfferingRow; isOwner?: boolean; defaultTab?: 'buy' | 'short' }

export default function BuyPanel({ offering, isOwner, defaultTab = 'buy' }: Props) {
  const [tab, setTab] = useState<'buy' | 'short'>(defaultTab)

  if (isOwner) return (
    <div className="sm:col-span-2 bg-card border border-edge rounded-2xl p-5 flex flex-col items-center justify-center text-center gap-3">
      <div className="w-10 h-10 rounded-full bg-subtle flex items-center justify-center text-gray-500 text-lg">🚫</div>
      <div>
        <p className="text-gray-300 text-sm font-medium">This is your offering</p>
        <p className="text-gray-500 text-xs mt-1">You can&apos;t trade your own shares.</p>
      </div>
    </div>
  )

  return (
    <div className="sm:col-span-2 flex flex-col gap-3">
      {/* Big action selector — clearly visible */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setTab('buy')}
          className={`py-3 rounded-xl text-sm font-bold transition-all border-2 ${
            tab === 'buy'
              ? 'bg-up text-white border-up shadow-lg shadow-up/20'
              : 'bg-up/10 text-up border-up/30 hover:bg-up/20'
          }`}
        >
          ▲ BUY
        </button>
        <button
          onClick={() => setTab('short')}
          className={`py-3 rounded-xl text-sm font-bold transition-all border-2 ${
            tab === 'short'
              ? 'bg-down text-white border-down shadow-lg shadow-down/20'
              : 'bg-down/10 text-down border-down/30 hover:bg-down/20'
          }`}
        >
          ▼ SHORT
        </button>
      </div>

      {/* Form panel */}
      <div className={`bg-card border rounded-2xl p-5 ${tab === 'buy' ? 'border-up/30' : 'border-down/30'}`}>
        {tab === 'buy' ? (
          <BuyForm offering={offering} />
        ) : (
          <ShortForm offering={offering} />
        )}
      </div>
    </div>
  )
}

// ── Buy Form ──────────────────────────────────────────────────────────────────

function BuyForm({ offering }: { offering: OfferingRow }) {
  const router = useRouter()
  const [shares, setShares] = useState(1)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ shares: number; totalAmount: number; newPrice: number } | null>(null)
  const [error, setError] = useState('')

  const initPrice = Number(offering.initial_price)
  const totalShares = offering.total_shares
  const sharesSold = offering.shares_sold
  const maxShares = offering.shares_available

  const subtotal = costOfShares(initPrice, totalShares, sharesSold, shares)
  const avgPrice = avgPriceForBuy(initPrice, totalShares, sharesSold, shares)
  const newSpotPrice = priceAfterBuy(initPrice, totalShares, sharesSold, shares)
  const fee = Math.round(subtotal * BUY_FEE * 100) / 100
  const total = Math.round((subtotal + fee) * 100) / 100
  const breakEven = Math.round((total / shares) * 100) / 100

  async function handleBuy() {
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await fetch('/api/buy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offeringId: offering.id, shares }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Purchase failed'); return }
      setResult({ shares: data.transaction.shares, totalAmount: data.transaction.totalAmount, newPrice: data.transaction.newPrice })
      router.refresh()
    } catch { setError('Network error. Try again.') } finally { setLoading(false) }
  }

  if (result) {
    const feeAmt = Math.round(result.totalAmount * BUY_FEE / (1 + BUY_FEE) * 100) / 100
    const sharesAmt = result.totalAmount - feeAmt
    return (
      <div>
        <div className="text-center mb-4">
          <div className="text-3xl mb-2">🎉</div>
          <h3 className="text-[#F5F5F0] font-bold text-base mb-1">You backed them!</h3>
          <p className="text-up text-xs font-medium">Price now {formatCurrency(result.newPrice)}</p>
        </div>
        <div className="bg-subtle rounded-xl p-3 space-y-1.5 text-xs mb-4">
          <div className="flex justify-between text-[#8A8A82]">
            <span>{result.shares} share{result.shares > 1 ? 's' : ''}</span>
            <span className="text-[#F5F5F0]">{formatCurrency(sharesAmt)}</span>
          </div>
          <div className="flex justify-between text-[#8A8A82]">
            <span>Buy fee (2%)</span>
            <span className="text-down">{formatCurrency(feeAmt)}</span>
          </div>
          <div className="border-t border-edge pt-1.5 flex justify-between font-semibold">
            <span className="text-[#F5F5F0]">Total paid</span>
            <span className="text-[#F5F5F0]">{formatCurrency(result.totalAmount)}</span>
          </div>
        </div>
        <p className="text-[#8A8A82] text-[10px] text-center mb-4">
          Hype Coins are virtual play currency with no cash value.
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={() => { setResult(null); setShares(1) }}
            className="w-full bg-subtle hover:bg-muted border border-edge text-[#F5F5F0] font-semibold py-2.5 rounded-xl transition-colors text-sm">
            Back More
          </button>
          <a href="/portfolio"
            className="w-full bg-accent hover:bg-accent-hover text-bg font-semibold py-2.5 rounded-xl transition-colors text-sm block text-center">
            View Portfolio →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-white font-semibold text-sm">Back this creator</h3>
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">Shares</label>
        <div className="flex items-center gap-2">
          <button onClick={() => setShares((s) => Math.max(1, s - 1))} disabled={shares <= 1}
            className="w-9 h-9 rounded-lg bg-subtle border border-edge text-white font-bold hover:bg-muted disabled:opacity-30 transition">−</button>
          <input type="number" value={shares}
            onChange={(e) => setShares(Math.max(1, Math.min(maxShares, parseInt(e.target.value) || 1)))}
            min={1} max={maxShares}
            className="flex-1 bg-subtle border border-edge rounded-lg px-3 py-2 text-white text-center font-semibold focus:outline-none focus:ring-2 focus:ring-up/30 transition [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
          <button onClick={() => setShares((s) => Math.min(maxShares, s + 1))} disabled={shares >= maxShares}
            className="w-9 h-9 rounded-lg bg-subtle border border-edge text-white font-bold hover:bg-muted disabled:opacity-30 transition">+</button>
        </div>
        <p className="text-[#8A8A82] text-xs mt-1 text-right">{maxShares.toLocaleString()} available</p>
      </div>

      <div className="bg-subtle rounded-xl p-3 space-y-1.5 text-xs">
        <div className="flex justify-between text-[#8A8A82]">
          <span>{shares} share{shares > 1 ? 's' : ''} × {formatCurrency(avgPrice)}</span>
          <span className="text-[#F5F5F0]">{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex justify-between text-[#8A8A82]">
          <span>Buy fee (2%)</span>
          <span className="text-down">{formatCurrency(fee)}</span>
        </div>
        <div className="border-t border-edge pt-1.5 flex justify-between font-semibold">
          <span className="text-[#F5F5F0]">You pay</span>
          <span className="text-[#F5F5F0]">{formatCurrency(total)}</span>
        </div>
        <div className="flex justify-between text-[#8A8A82] border-t border-edge/50 pt-1.5">
          <span>Break-even price</span>
          <span className="text-accent font-medium">{formatCurrency(breakEven)}/share</span>
        </div>
        {shares > 1 && (
          <div className="flex justify-between text-[#8A8A82]">
            <span>Price after buy</span>
            <span className="text-[#F5F5F0]">{formatCurrency(newSpotPrice)}</span>
          </div>
        )}
      </div>

      {error && <p className="text-down text-sm bg-down/10 border border-down/20 rounded-lg px-3 py-2">{error}</p>}

      <button disabled={maxShares === 0 || loading} onClick={handleBuy}
        className="w-full bg-up hover:brightness-110 disabled:bg-muted disabled:text-gray-500 text-white font-bold py-3 rounded-xl transition-all text-sm">
        {loading ? 'Processing…' : maxShares > 0 ? `▲ Back ${shares} share${shares > 1 ? 's' : ''} — ${formatCurrency(total)}` : 'Sold Out'}
      </button>
      <p className="text-center text-[10px] text-[#8A8A82]">
        Hype Coins are virtual play currency with no cash value.
      </p>
    </div>
  )
}

// ── Short Form ────────────────────────────────────────────────────────────────

function ShortForm({ offering }: { offering: OfferingRow }) {
  const router = useRouter()
  const [shortShares, setShortShares] = useState(10)
  const [collateral, setCollateral] = useState(50)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ liquidationPrice: number; openPrice: number } | null>(null)
  const [error, setError] = useState('')

  const openPrice = Number(offering.current_price)
  const openFee = Math.round(collateral * SHORT_OPEN_FEE * 100) / 100
  const totalLocked = Math.round((collateral + openFee) * 100) / 100
  const liquidationPrice = shortShares > 0
    ? Math.round((openPrice + collateral / shortShares) * 10000) / 10000
    : 0
  const liqPct = openPrice > 0 ? ((liquidationPrice - openPrice) / openPrice) * 100 : 0

  async function handleShort() {
    if (shortShares < 1 || collateral <= 0) return
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await fetch('/api/shorts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offeringId: offering.id, shares: shortShares, collateral }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to open short'); return }
      setResult({ liquidationPrice: data.liquidationPrice, openPrice: data.openPrice })
      router.refresh()
    } catch { setError('Network error. Try again.') } finally { setLoading(false) }
  }

  if (result) {
    return (
      <div>
        <div className="text-center mb-4">
          <div className="text-3xl mb-2">📉</div>
          <h3 className="text-[#F5F5F0] font-bold text-base mb-1">Short Opened!</h3>
          <p className="text-down text-xs font-medium">You profit if price falls below {formatCurrency(result.openPrice)}</p>
        </div>
        <div className="bg-subtle rounded-xl p-3 space-y-1.5 text-xs mb-4">
          <div className="flex justify-between text-[#8A8A82]">
            <span>Opened at</span>
            <span className="text-[#F5F5F0]">{formatCurrency(result.openPrice)}</span>
          </div>
          <div className="flex justify-between text-[#8A8A82]">
            <span>Liquidation at</span>
            <span className="text-down font-semibold">{formatCurrency(result.liquidationPrice)}</span>
          </div>
          <div className="flex justify-between text-[#8A8A82]">
            <span>Max loss (your collateral)</span>
            <span className="text-down">{formatCurrency(collateral)}</span>
          </div>
        </div>
        <p className="text-[#8A8A82] text-[10px] text-center mb-4">
          Hype Coins are virtual play currency with no cash value.
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={() => setResult(null)}
            className="w-full bg-subtle hover:bg-muted border border-edge text-[#F5F5F0] font-semibold py-2.5 rounded-xl transition-colors text-sm">
            Short Again
          </button>
          <a href="/portfolio"
            className="w-full bg-accent hover:bg-accent-hover text-bg font-semibold py-2.5 rounded-xl transition-colors text-sm block text-center">
            View Portfolio →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-white font-semibold text-sm mb-0.5">Short this creator</h3>
        <p className="text-[#8A8A82] text-[10px]">
          Profit when the price <span className="text-down font-semibold">falls</span>. Your collateral is your max possible loss.
        </p>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1.5">Shares to short</label>
        <div className="flex items-center gap-2">
          <button onClick={() => setShortShares((s) => Math.max(1, s - 1))} disabled={shortShares <= 1}
            className="w-9 h-9 rounded-lg bg-subtle border border-edge text-white font-bold hover:bg-muted disabled:opacity-30 transition">−</button>
          <input type="number" value={shortShares}
            onChange={(e) => setShortShares(Math.max(1, parseInt(e.target.value) || 1))}
            min={1}
            className="flex-1 bg-subtle border border-edge rounded-lg px-3 py-2 text-white text-center font-semibold focus:outline-none focus:ring-2 focus:ring-down/30 transition [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
          <button onClick={() => setShortShares((s) => s + 1)}
            className="w-9 h-9 rounded-lg bg-subtle border border-edge text-white font-bold hover:bg-muted transition">+</button>
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1.5">Collateral (HC)</label>
        <input
          type="number" value={collateral}
          onChange={(e) => setCollateral(Math.max(1, parseFloat(e.target.value) || 1))}
          min={1} step={10}
          className="w-full bg-subtle border border-edge rounded-lg px-3 py-2 text-white text-center font-semibold focus:outline-none focus:ring-2 focus:ring-down/30 transition [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <p className="text-[#8A8A82] text-[10px] mt-1">Maximum you can lose — balance never goes negative.</p>
      </div>

      <div className="bg-subtle rounded-xl p-3 space-y-1.5 text-xs">
        <div className="flex justify-between text-[#8A8A82]">
          <span>Current price</span>
          <span className="text-[#F5F5F0]">{formatCurrency(openPrice)}</span>
        </div>
        <div className="flex justify-between text-[#8A8A82]">
          <span>Liquidation price</span>
          <span className="text-down font-semibold">
            {formatCurrency(liquidationPrice)} (+{liqPct.toFixed(1)}%)
          </span>
        </div>
        <div className="border-t border-edge pt-1.5 flex justify-between text-[#8A8A82]">
          <span>Open fee (2%)</span>
          <span className="text-down">{formatCurrency(openFee)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span className="text-[#F5F5F0]">Total locked</span>
          <span className="text-[#F5F5F0]">{formatCurrency(totalLocked)}</span>
        </div>
      </div>

      {error && <p className="text-down text-sm bg-down/10 border border-down/20 rounded-lg px-3 py-2">{error}</p>}

      <button
        disabled={shortShares < 1 || collateral <= 0 || loading}
        onClick={handleShort}
        className="w-full bg-down hover:brightness-110 disabled:bg-muted disabled:text-gray-500 text-white font-bold py-3 rounded-xl transition-all text-sm"
      >
        {loading ? 'Opening…' : `▼ Short ${shortShares} shares — lock ${formatCurrency(totalLocked)}`}
      </button>
      <p className="text-center text-[10px] text-[#8A8A82]">
        Liquidated if price rises above {formatCurrency(liquidationPrice)}
      </p>
    </div>
  )
}
