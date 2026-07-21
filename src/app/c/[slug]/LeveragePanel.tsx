'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { SPREAD_BPS, LEVERAGE_OPTIONS, type Leverage, bpsOf } from '@/lib/money'

type Position = {
  id: string
  side: 'long' | 'short'
  leverage: number
  collateral_cents: number
  notional_cents: number
  entry_index_price: string | number | null
  take_profit_price: string | number | null
  stop_loss_price: string | number | null
  status: string
  pnl_cents: number | null
}

type Props = { creatorId: string; currentPrice: number }

function centsToHc(cents: number): number {
  return cents / 100
}

export default function LeveragePanel({ creatorId, currentPrice }: Props) {
  const [side, setSide] = useState<'long' | 'short'>('long')
  const [leverage, setLeverage] = useState<Leverage>(3)
  const [collateralHc, setCollateralHc] = useState(50)
  const [tpEnabled, setTpEnabled] = useState(false)
  const [slEnabled, setSlEnabled] = useState(false)
  const [takeProfitPrice, setTakeProfitPrice] = useState('')
  const [stopLossPrice, setStopLossPrice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [positions, setPositions] = useState<Position[]>([])
  const [closingId, setClosingId] = useState<string | null>(null)

  const notionalCents = Math.round(collateralHc * 100) * leverage
  const openFeeCents = bpsOf(notionalCents, SPREAD_BPS)
  const totalLockedCents = Math.round(collateralHc * 100) + openFeeCents

  const loadPositions = useCallback(async () => {
    try {
      const res = await fetch('/api/leverage')
      const data = await res.json()
      if (res.ok) setPositions((data.positions || []).filter((p: any) => p.creator_id === creatorId))
    } catch {
      // best-effort refresh — leave the last known list in place
    }
  }, [creatorId])

  useEffect(() => {
    loadPositions()
  }, [loadPositions])

  async function handleOpen() {
    if (collateralHc <= 0) return
    setSubmitting(true)
    setError('')
    setFlash('')
    try {
      const res = await fetch('/api/leverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorId,
          side,
          leverage,
          collateralCents: Math.round(collateralHc * 100),
          clientRequestId: crypto.randomUUID(),
          takeProfitPrice: tpEnabled && takeProfitPrice ? Number(takeProfitPrice) : null,
          stopLossPrice: slEnabled && stopLossPrice ? Number(stopLossPrice) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Order failed')
        return
      }
      setFlash(`${side === 'long' ? 'Long' : 'Short'} ${leverage}x filled at ${formatCurrency(Number(data.position.entry_index_price))}`)
      await loadPositions()
    } catch {
      setError('Network error. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleClose(id: string) {
    setClosingId(id)
    setError('')
    try {
      const res = await fetch(`/api/leverage/${id}/close`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Close failed')
        return
      }
      await loadPositions()
    } catch {
      setError('Network error. Try again.')
    } finally {
      setClosingId(null)
    }
  }

  function unrealizedPnlCents(p: Position): number | null {
    if (p.status !== 'open' || !p.entry_index_price) return null
    const entry = Number(p.entry_index_price)
    const direction = p.side === 'long' ? 1 : -1
    const raw = Math.round(p.notional_cents * direction * ((currentPrice - entry) / entry))
    return Math.max(raw, -p.collateral_cents)
  }

  return (
    <div className="bg-card border border-edge rounded-2xl p-5 space-y-4">
      <h3 className="text-[#1E2329] font-semibold text-sm">Leveraged Trading</h3>

      {/* Long / Short */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setSide('long')}
          className={`py-3 rounded-xl text-sm font-bold transition-all border-2 ${
            side === 'long' ? 'bg-up text-white border-up shadow-lg shadow-up/20' : 'bg-up/10 text-up border-up/30 hover:bg-up/20'
          }`}
        >
          ▲ LONG
        </button>
        <button
          onClick={() => setSide('short')}
          className={`py-3 rounded-xl text-sm font-bold transition-all border-2 ${
            side === 'short' ? 'bg-down text-white border-down shadow-lg shadow-down/20' : 'bg-down/10 text-down border-down/30 hover:bg-down/20'
          }`}
        >
          ▼ SHORT
        </button>
      </div>

      {/* Leverage */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">Leverage</label>
        <div className="grid grid-cols-2 gap-2">
          {LEVERAGE_OPTIONS.map((lv) => (
            <button
              key={lv}
              onClick={() => setLeverage(lv)}
              className={`py-2 rounded-lg text-sm font-bold border transition-colors ${
                leverage === lv ? 'bg-accent/15 border-accent text-accent' : 'bg-subtle border-edge text-[#707A8A] hover:text-[#1E2329]'
              }`}
            >
              {lv}x
            </button>
          ))}
        </div>
      </div>

      {/* Margin */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">Margin (HC)</label>
        <input
          type="number"
          value={collateralHc}
          onChange={(e) => setCollateralHc(Math.max(1, parseFloat(e.target.value) || 1))}
          min={1}
          step={10}
          className="w-full bg-subtle border border-edge rounded-lg px-3 py-2 text-[#1E2329] text-center font-semibold focus:outline-none focus:ring-2 focus:ring-accent/30 transition [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>

      {/* Take Profit / Stop Loss */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-1.5">
            <input type="checkbox" checked={tpEnabled} onChange={(e) => setTpEnabled(e.target.checked)} />
            Take Profit
          </label>
          <input
            type="number"
            disabled={!tpEnabled}
            value={takeProfitPrice}
            onChange={(e) => setTakeProfitPrice(e.target.value)}
            placeholder={formatCurrency(currentPrice * (side === 'long' ? 1.1 : 0.9))}
            className="w-full bg-subtle border border-edge rounded-lg px-2 py-2 text-[#1E2329] text-center text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-up/30 transition disabled:opacity-40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-1.5">
            <input type="checkbox" checked={slEnabled} onChange={(e) => setSlEnabled(e.target.checked)} />
            Stop Loss
          </label>
          <input
            type="number"
            disabled={!slEnabled}
            value={stopLossPrice}
            onChange={(e) => setStopLossPrice(e.target.value)}
            placeholder={formatCurrency(currentPrice * (side === 'long' ? 0.9 : 1.1))}
            className="w-full bg-subtle border border-edge rounded-lg px-2 py-2 text-[#1E2329] text-center text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-down/30 transition disabled:opacity-40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="bg-subtle rounded-xl p-3 space-y-1.5 text-xs">
        <div className="flex justify-between text-[#707A8A]">
          <span>Current index price</span>
          <span className="text-[#1E2329]">{formatCurrency(currentPrice)}</span>
        </div>
        <div className="flex justify-between text-[#707A8A]">
          <span>Notional ({leverage}x)</span>
          <span className="text-[#1E2329]">{formatCurrency(centsToHc(notionalCents))}</span>
        </div>
        <div className="flex justify-between text-[#707A8A]">
          <span>Open spread (1%)</span>
          <span className="text-down">{formatCurrency(centsToHc(openFeeCents))}</span>
        </div>
        <div className="border-t border-edge pt-1.5 flex justify-between font-semibold">
          <span className="text-[#1E2329]">Total locked</span>
          <span className="text-[#1E2329]">{formatCurrency(centsToHc(totalLockedCents))}</span>
        </div>
      </div>

      {error && <p className="text-down text-sm bg-down/10 border border-down/20 rounded-lg px-3 py-2">{error}</p>}
      {flash && !error && <p className="text-up text-sm bg-up/10 border border-up/20 rounded-lg px-3 py-2">{flash}</p>}

      <button
        disabled={submitting || collateralHc <= 0}
        onClick={handleOpen}
        className={`w-full font-bold py-3 rounded-xl transition-all text-sm text-white disabled:opacity-50 ${
          side === 'long' ? 'bg-up hover:brightness-110' : 'bg-down hover:brightness-110'
        }`}
      >
        {submitting
          ? 'Settling at market… (3–5s, prevents front-running)'
          : `${side === 'long' ? '▲ Open Long' : '▼ Open Short'} ${leverage}x — lock ${formatCurrency(centsToHc(totalLockedCents))}`}
      </button>

      {/* Open positions on this creator */}
      {positions.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-edge">
          <p className="text-[#1E2329] text-xs font-semibold">Your open positions</p>
          {positions.map((p) => {
            const pnl = unrealizedPnlCents(p)
            return (
              <div key={p.id} className="flex items-center justify-between bg-subtle rounded-lg px-3 py-2 text-xs">
                <div>
                  <span className={`font-bold ${p.side === 'long' ? 'text-up' : 'text-down'}`}>
                    {p.side === 'long' ? '▲' : '▼'} {p.leverage}x
                  </span>
                  <span className="text-[#707A8A] ml-2">@ {formatCurrency(Number(p.entry_index_price))}</span>
                </div>
                <div className="flex items-center gap-2">
                  {pnl !== null && (
                    <span className={pnl >= 0 ? 'text-up font-semibold' : 'text-down font-semibold'}>
                      {pnl >= 0 ? '+' : ''}
                      {formatCurrency(centsToHc(pnl))}
                    </span>
                  )}
                  {p.status === 'open' && (
                    <button
                      onClick={() => handleClose(p.id)}
                      disabled={closingId === p.id}
                      className="text-[10px] font-semibold bg-card border border-edge px-2 py-1 rounded-md hover:bg-muted transition disabled:opacity-50"
                    >
                      {closingId === p.id ? 'Settling…' : 'Close'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-center text-[10px] text-[#707A8A]">
        3x/5x leverage · 1% spread on open + close · 4h funding rate · auto-liquidated at 50% margin loss
      </p>
    </div>
  )
}
