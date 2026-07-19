'use client'

import { useMemo, useState } from 'react'
import { dollarsToCents, centsToDollars } from '@/lib/money'
import { previewLivePayoutCents, type PoolSnapshot, type PoolSide } from '@/lib/clout/payout'

// clout_pool_positions_leverage_check only allows leverage in {1, 5, 10} — not
// a continuous range — so the slider is stepped across exactly those three
// tiers rather than letting the user drag to an arbitrary multiplier the
// backend would reject on submit.
const LEVERAGE_TIERS = [1, 5, 10] as const

export type TradeModulePool = {
  upPoolUsdc: number
  downPoolUsdc: number
  rakeBps: number
  upSideNotionalUsdc: number
  downSideNotionalUsdc: number
}

type Props = {
  pool: TradeModulePool
  balanceUsdc?: number
  minWagerUsdc?: number
  defaultWagerUsdc?: number
  onSubmit?: (params: { side: PoolSide; leverage: number; wagerUsdc: number }) => void | Promise<void>
}

export default function TradeModule({ pool, balanceUsdc, minWagerUsdc = 1, defaultWagerUsdc = 50, onSubmit }: Props) {
  const [wagerUsdc, setWagerUsdc] = useState(defaultWagerUsdc)
  const [tierIndex, setTierIndex] = useState(0)
  const [confirmSide, setConfirmSide] = useState<PoolSide | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const leverage = LEVERAGE_TIERS[tierIndex]

  const snapshot: PoolSnapshot = useMemo(
    () => ({
      upPoolCents: dollarsToCents(pool.upPoolUsdc),
      downPoolCents: dollarsToCents(pool.downPoolUsdc),
      rakeBps: pool.rakeBps,
      upSideNotionalCents: dollarsToCents(pool.upSideNotionalUsdc),
      downSideNotionalCents: dollarsToCents(pool.downSideNotionalUsdc),
    }),
    [pool]
  )

  const preview = (side: PoolSide) => {
    const wagerCents = dollarsToCents(Math.max(wagerUsdc, 0))
    const payoutCents = previewLivePayoutCents(snapshot, side, wagerCents, leverage)
    const payoutUsdc = centsToDollars(payoutCents)
    const returnPct = wagerUsdc > 0 ? ((payoutUsdc - wagerUsdc) / wagerUsdc) * 100 : 0
    return { payoutUsdc, returnPct }
  }

  // "Preview side" defaults to UP when nothing's been tapped yet, purely for
  // the live preview line below the buttons — it isn't a selection state.
  const previewSide: PoolSide = confirmSide ?? 'up'
  const { payoutUsdc, returnPct } = preview(previewSide)

  const fmt = (n: number) => (Number.isInteger(n) ? n.toString() : n.toFixed(2))

  const handleTap = async (side: PoolSide) => {
    if (submitting || wagerUsdc < minWagerUsdc) return
    setConfirmSide(side)
    setSubmitting(true)
    try {
      await onSubmit?.({ side, leverage, wagerUsdc })
    } finally {
      setSubmitting(false)
      setTimeout(() => setConfirmSide(null), 650)
    }
  }

  const overBalance = balanceUsdc !== undefined && wagerUsdc > balanceUsdc
  const fireIntensity = tierIndex / (LEVERAGE_TIERS.length - 1) // 0, 0.5, 1

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-[#0A0E14]/80 p-5 shadow-[0_0_40px_rgba(0,0,0,0.5)]">
      {/* Wager input */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Wager ($CLOUT)</label>
        {balanceUsdc !== undefined && (
          <span className="font-mono text-xs text-gray-500">
            Balance: <span className="text-white">{fmt(balanceUsdc)} $CLOUT</span>
          </span>
        )}
      </div>
      <div className="mb-5 flex items-center gap-2 rounded-xl border border-white/10 bg-black/60 px-4 py-3">
        <span className="font-mono text-lg font-bold text-[#00F0FF]">$</span>
        <input
          type="number"
          min={minWagerUsdc}
          step={1}
          value={wagerUsdc}
          onChange={(e) => setWagerUsdc(Math.max(0, Number(e.target.value)))}
          className="w-full bg-transparent font-mono text-lg font-bold text-white outline-none"
        />
        <span className="font-mono text-xs uppercase tracking-wider text-gray-500">$CLOUT</span>
      </div>
      {overBalance && <p className="-mt-4 mb-4 text-xs font-semibold text-[#FF3B5C]">Exceeds your available $CLOUT balance.</p>}

      {/* Leverage slider — stepped across the only valid tiers: 1x / 5x / 10x */}
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-gray-400">
          <span>Multiplier</span>
          <span
            className={`font-mono text-sm ${
              leverage === 10 ? 'text-[#FF3B5C]' : leverage === 5 ? 'text-[#FFD23B]' : 'text-[#39FF88]'
            }`}
          >
            X{leverage}
          </span>
        </div>

        <div
          className="relative h-3 w-full rounded-full"
          style={
            fireIntensity > 0
              ? {
                  backgroundImage: 'linear-gradient(90deg, #0FBE63, #FFD23B, #FF3B5C, #FFD23B, #0FBE63)',
                }
              : undefined
          }
        >
          <div
            className={`absolute inset-0 rounded-full ${fireIntensity > 0 ? 'animate-clout-fire opacity-90' : 'bg-white/10'}`}
            style={
              fireIntensity > 0
                ? { backgroundImage: 'linear-gradient(90deg, #0FBE63, #FFD23B, #FF3B5C, #FFD23B, #0FBE63)' }
                : undefined
            }
          />
          <input
            type="range"
            min={0}
            max={LEVERAGE_TIERS.length - 1}
            step={1}
            value={tierIndex}
            onChange={(e) => setTierIndex(Number(e.target.value))}
            className="clout-slider absolute inset-0 z-10 h-3 w-full cursor-pointer appearance-none bg-transparent"
            aria-label="Leverage multiplier"
          />
        </div>

        <div className="mt-2 flex justify-between font-mono text-[11px] text-gray-500">
          {LEVERAGE_TIERS.map((t) => (
            <span key={t}>X{t}</span>
          ))}
        </div>
        {leverage === 10 && (
          <p className="mt-2 text-[11px] font-semibold text-[#FF3B5C]">
            ⚠ High liquidation risk — a 20% adverse move against you at X10 triggers a full liquidation.
          </p>
        )}
      </div>

      {/* HYPE / FADE buttons */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={submitting || wagerUsdc < minWagerUsdc || overBalance}
          onClick={() => handleTap('up')}
          className="group relative overflow-hidden rounded-xl border-2 border-[#39FF88] bg-gradient-to-b from-[#0FBE63]/20 to-black py-5 font-black uppercase tracking-wide text-[#39FF88] shadow-[0_0_25px_rgba(57,255,136,0.35)] transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {confirmSide === 'up' && (
            <span className="pointer-events-none absolute inset-0 animate-clout-confirm rounded-xl bg-[#39FF88]/40" />
          )}
          <span className="relative block text-2xl">🚀</span>
          <span className="relative block">HYPE / UP</span>
        </button>

        <button
          type="button"
          disabled={submitting || wagerUsdc < minWagerUsdc || overBalance}
          onClick={() => handleTap('down')}
          className="group relative overflow-hidden rounded-xl border-2 border-[#FF3B5C] bg-gradient-to-b from-[#C21F3E]/20 to-black py-5 font-black uppercase tracking-wide text-[#FF3B5C] shadow-[0_0_25px_rgba(255,59,92,0.35)] transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {confirmSide === 'down' && (
            <span className="pointer-events-none absolute inset-0 animate-clout-confirm rounded-xl bg-[#FF3B5C]/40" />
          )}
          <span className="relative block text-2xl">📉</span>
          <span className="relative block">FADE / DOWN</span>
        </button>
      </div>

      {/* Live payout preview — same math as clout_calculate_live_payout */}
      <div className="rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-center font-mono text-sm">
        <span className="text-gray-400">Wager: </span>
        <span className="font-bold text-white">{fmt(wagerUsdc)} $CLOUT</span>
        <span className="text-gray-600"> | </span>
        <span className="text-gray-400">Potential Payout: </span>
        <span className="font-bold text-[#00F0FF]">{fmt(payoutUsdc)} $CLOUT</span>
        <span className="text-gray-600"> | </span>
        <span className="text-gray-400">Est. Return: </span>
        <span className={`font-bold ${returnPct >= 0 ? 'text-[#39FF88]' : 'text-[#FF3B5C]'}`}>
          {returnPct >= 0 ? '+' : ''}
          {returnPct.toFixed(0)}%
        </span>
      </div>

      <style jsx>{`
        .clout-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 22px;
          width: 22px;
          border-radius: 9999px;
          background: white;
          box-shadow: 0 0 12px 3px rgba(255, 255, 255, 0.6);
          cursor: pointer;
          margin-top: -1px;
        }
        .clout-slider::-moz-range-thumb {
          height: 22px;
          width: 22px;
          border: none;
          border-radius: 9999px;
          background: white;
          box-shadow: 0 0 12px 3px rgba(255, 255, 255, 0.6);
          cursor: pointer;
        }
      `}</style>
    </div>
  )
}
