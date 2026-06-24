'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'
import { costOfShares, avgPriceForBuy, priceAfterBuy, spotPrice } from '@/lib/pricing'
import type { OfferingRow } from '@/types/database'

type Props = { offering: OfferingRow; isOwner?: boolean }

export default function BuyPanel({ offering, isOwner }: Props) {
  const router = useRouter()
  const [shares, setShares] = useState(1)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ shares: number; totalAmount: number; newPrice: number } | null>(null)
  const [error, setError] = useState('')

  const initPrice = Number(offering.initial_price), totalShares = offering.total_shares, sharesSold = offering.shares_sold, maxShares = offering.shares_available
  const commission = Number(offering.primary_commission_rate)
  const currentSpot = spotPrice(initPrice, totalShares, sharesSold)
  const subtotal = costOfShares(initPrice, totalShares, sharesSold, shares)
  const avgPrice = avgPriceForBuy(initPrice, totalShares, sharesSold, shares)
  const newPrice = priceAfterBuy(initPrice, totalShares, sharesSold, shares)
  const fee = Math.round(subtotal * commission * 100) / 100
  const total = Math.round((subtotal + fee) * 100) / 100

  async function handleBuy() {
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await fetch('/api/buy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offeringId: offering.id, shares }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Purchase failed'); return }
      setResult({ shares: data.transaction.shares, totalAmount: data.transaction.totalAmount, newPrice: data.transaction.newPrice })
      router.refresh()
    } catch { setError('Network error. Try again.') }
    finally { setLoading(false) }
  }

  if (isOwner) return (
    <div className="sm:col-span-2 bg-card border border-edge rounded-2xl p-5 flex flex-col items-center justify-center text-center">
      <div className="w-10 h-10 rounded-full bg-subtle flex items-center justify-center text-gray-500 text-lg mb-3">🚫</div>
      <p className="text-gray-300 text-sm font-medium mb-1">This is your offering</p>
      <p className="text-gray-500 text-xs">You can&apos;t invest in your own shares to prevent wash trading.</p>
    </div>
  )

  if (result) {
    const resultFee = result.totalAmount - (result.totalAmount / (1 + commission))
    const resultShares = result.shares
    const resultSubtotal = result.totalAmount - resultFee
    return (
      <div className="sm:col-span-2 bg-card border border-up/30 rounded-2xl p-5">
        <div className="text-center mb-4">
          <div className="text-3xl mb-2">🎉</div>
          <h3 className="text-[#F5F5F0] font-bold text-base mb-1">Purchase Complete!</h3>
          <p className="text-up text-xs font-medium">Price moved to {formatCurrency(result.newPrice)}</p>
        </div>
        <div className="bg-subtle rounded-xl p-3 space-y-1.5 text-xs mb-4">
          <div className="flex justify-between text-[#8A8A82]"><span>{resultShares} share{resultShares > 1 ? 's' : ''}</span><span className="text-[#F5F5F0]">{formatCurrency(resultSubtotal)}</span></div>
          <div className="flex justify-between text-[#8A8A82]"><span>Trading fee ({(commission * 100).toFixed(0)}%)</span><span className="text-accent">{formatCurrency(resultFee)}</span></div>
          <div className="border-t border-edge pt-1.5 flex justify-between font-semibold"><span className="text-[#F5F5F0]">Total paid</span><span className="text-[#F5F5F0]">{formatCurrency(result.totalAmount)}</span></div>
        </div>
        <p className="text-[#8A8A82] text-[10px] text-center mb-4">The fee is a one-time trading commission — your shares are now valued at market price.</p>
        <div className="flex flex-col gap-2">
          <button onClick={() => { setResult(null); setShares(1) }} className="w-full bg-subtle hover:bg-muted border border-edge text-[#F5F5F0] font-semibold py-2.5 rounded-xl transition-colors text-sm">Buy More</button>
          <a href="/portfolio" className="w-full bg-accent hover:bg-accent-hover text-bg font-semibold py-2.5 rounded-xl transition-colors text-sm block text-center">View Portfolio →</a>
        </div>
      </div>
    )
  }

  return (
    <div className="sm:col-span-2 bg-card border border-accent/30 rounded-2xl p-5">
      <h3 className="text-white font-semibold mb-4">Buy Shares</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Shares</label>
          <div className="flex items-center gap-2">
            <button onClick={() => setShares((s) => Math.max(1, s - 1))} disabled={shares <= 1} className="w-9 h-9 rounded-lg bg-subtle border border-edge text-white font-bold hover:bg-muted disabled:opacity-30 transition">−</button>
            <input type="number" value={shares} onChange={(e) => setShares(Math.max(1, Math.min(maxShares, parseInt(e.target.value) || 1)))} min={1} max={maxShares}
              className="flex-1 bg-subtle border border-edge rounded-lg px-3 py-2 text-white text-center font-semibold focus:outline-none focus:ring-2 focus:ring-accent/30 transition [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
            <button onClick={() => setShares((s) => Math.min(maxShares, s + 1))} disabled={shares >= maxShares} className="w-9 h-9 rounded-lg bg-subtle border border-edge text-white font-bold hover:bg-muted disabled:opacity-30 transition">+</button>
          </div>
          <p className="text-[#8A8A82] text-xs mt-1 text-right">{maxShares} available</p>
        </div>
        <div className="bg-subtle rounded-xl p-3 space-y-1.5 text-xs">
          <div className="flex justify-between text-[#8A8A82]"><span>{shares} share{shares > 1 ? 's' : ''} × {formatCurrency(avgPrice)}</span><span className="text-[#F5F5F0]">{formatCurrency(subtotal)}</span></div>
          <div className="flex justify-between text-[#8A8A82]"><span>Trading fee ({(commission * 100).toFixed(0)}%)</span><span className="text-accent">{formatCurrency(fee)}</span></div>
          <div className="border-t border-edge pt-1.5 flex justify-between font-semibold"><span className="text-[#F5F5F0]">You pay</span><span className="text-[#F5F5F0]">{formatCurrency(total)}</span></div>
          {shares > 1 && <div className="flex justify-between text-[#8A8A82] pt-1"><span>Price after buy</span><span className="text-accent">{formatCurrency(newPrice)}</span></div>}
          <p className="text-[#8A8A82] text-[9px] pt-1">Fee is a one-time commission. Your shares are valued at market price after purchase.</p>
        </div>
        {error && <p className="text-down text-sm bg-down/10 border border-down/20 rounded-lg px-3 py-2">{error}</p>}
        <button disabled={maxShares === 0 || loading} onClick={handleBuy}
          className="w-full bg-up hover:brightness-110 disabled:bg-muted disabled:text-gray-500 text-white font-bold py-3 rounded-xl transition-all text-sm">
          {loading ? 'Processing…' : maxShares > 0 ? `Buy ${shares} share${shares > 1 ? 's' : ''} — ${formatCurrency(total)}` : 'Sold Out'}
        </button>
        <p className="text-center text-xs text-[#8A8A82]">Virtual trading · Paid with Hype Coins</p>
      </div>
    </div>
  )
}
