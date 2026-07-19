'use client'

import { useMemo, useState } from 'react'
import { dollarsToCents, centsToDollars } from '@/lib/money'
import { previewLivePayoutCents, type PoolSnapshot, type PoolSide } from '@/lib/clout/payout'

// clout_pool_positions_leverage_check only allows leverage in {1, 5, 10} — not
// a continuous range — so the slider is stepped across exactly those three
// tiers rather than letting the user drag to an arbitrary multiplier the
// backend would reject on submit.
const LEVERAGE_TIERS = [1, 5, 10] as const

// Panel chrome tints from a neutral "silver" glass at 1x toward a warning
// shade as leverage climbs — the whole trade box, not just the slider,
// carries the risk signal.
const TIER_PANEL_CLASSES = [
  'border-black/5 shadow-xl shadow-black/5',
  'border-amber-300/60 shadow-xl shadow-amber-300/30',
  'border-rose-300/70 shadow-xl shadow-rose-300/40',
] as const

const TIER_TRACK_GRADIENT = [
  'linear-gradient(90deg, #D1D5DB, #E5E7EB, #D1D5DB)', // silver, neutral
  'linear-gradient(90deg, #FCD34D, #FBBF24, #FCD34D)', // amber
  'linear-gradient(90deg, #FDA4AF, #FB7185, #FDA4AF)', // rose
] as const

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

  return (
    <div
      className={`w-full rounded-2xl border bg-white/70 p-5 backdrop-blur-xl transition-colors duration-300 ${TIER_PANEL_CLASSES[tierIndex]}`}
    >
      {/* Wager input */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Wager ($CLOUT)</label>
        {balanceUsdc !== undefined && (
          <span className="font-mono text-xs text-gray-500">
            Balance: <span className="text-gray-900">{fmt(balanceUsdc)} $CLOUT</span>
          </span>
        )}
      </div>
      <div className="mb-5 flex items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-3 shadow-sm">
        <span className="font-mono text-lg font-bold text-gray-400">$</span>
        <input
          type="number"
          min={minWagerUsdc}
          step={1}
          value={wagerUsdc}
          onChange={(e) => setWagerUsdc(Math.max(0, Number(e.target.value)))}
          className="w-full bg-transparent font-mono text-lg font-bold text-gray-900 outline-none"
        />
        <span className="font-mono text-xs uppercase tracking-wider text-gray-400">$CLOUT</span>
      </div>
      {overBalance && <p className="-mt-4 mb-4 text-xs font-semibold text-rose-500">Exceeds your available $CLOUT balance.</p>}

      {/* Leverage slider — stepped across the only valid tiers: 1x / 5x / 10x */}
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-gray-400">
          <span>Multiplier</span>
          <span
            className={`font-mono text-sm ${
              leverage === 10 ? 'text-rose-500' : leverage === 5 ? 'text-amber-500' : 'text-gray-700'
            }`}
          >
            X{leverage}
          </span>
        </div>

        <div
          className="relative h-1.5 w-full rounded-full shadow-inner shadow-black/5"
          style={{ backgroundImage: TIER_TRACK_GRADIENT[tierIndex] }}
        >
          <input
            type="range"
            min={0}
            max={LEVERAGE_TIERS.length - 1}
            step={1}
            value={tierIndex}
            onChange={(e) => setTierIndex(Number(e.target.value))}
            className="clout-slider absolute inset-0 z-10 h-1.5 w-full cursor-pointer appearance-none bg-transparent"
            aria-label="Leverage multiplier"
          />
        </div>

        <div className="mt-2 flex justify-between font-mono text-[11px] text-gray-400">
          {LEVERAGE_TIERS.map((t) => (
            <span key={t}>X{t}</span>
          ))}
        </div>
        {leverage === 10 && (
          <p className="mt-2 text-[11px] font-semibold text-rose-500">
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
          className="group relative overflow-hidden rounded-xl border border-black/10 bg-white py-5 font-black uppercase tracking-wide text-gray-900 shadow-md shadow-black/5 transition-all duration-200 hover:border-emerald-300 hover:shadow-[0_0_30px_-6px_rgba(16,185,129,0.55)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {confirmSide === 'up' && (
            <span className="pointer-events-none absolute inset-0 animate-clout-confirm rounded-xl bg-emerald-400/30" />
          )}
          <span className="relative block text-2xl">🚀</span>
          <span className="relative block">HYPE / UP</span>
        </button>

        <button
          type="button"
          disabled={submitting || wagerUsdc < minWagerUsdc || overBalance}
          onClick={() => handleTap('down')}
          className="group relative overflow-hidden rounded-xl border border-black/10 bg-white py-5 font-black uppercase tracking-wide text-gray-900 shadow-md shadow-black/5 transition-all duration-200 hover:border-rose-300 hover:shadow-[0_0_30px_-6px_rgba(244,63,94,0.5)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {confirmSide === 'down' && (
            <span className="pointer-events-none absolute inset-0 animate-clout-confirm rounded-xl bg-rose-400/30" />
          )}
          <span className="relative block text-2xl">📉</span>
          <span className="relative block">FADE / DOWN</span>
        </button>
      </div>

      {/* Live payout preview — same math as clout_calculate_live_payout */}
      <div className="rounded-xl border border-black/5 bg-gray-50/80 px-4 py-3 text-center font-mono text-sm">
        <span className="text-gray-400">Wager: </span>
        <span className="font-bold text-gray-900">{fmt(wagerUsdc)} $CLOUT</span>
        <span className="text-gray-300"> | </span>
        <span className="text-gray-400">Potential Payout: </span>
        <span className="font-bold text-gray-900">{fmt(payoutUsdc)} $CLOUT</span>
        <span className="text-gray-300"> | </span>
        <span className="text-gray-400">Est. Return: </span>
        <span className={`font-bold ${returnPct >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
          {returnPct >= 0 ? '+' : ''}
          {returnPct.toFixed(0)}%
        </span>
      </div>

      <style jsx>{`
        .clout-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 9999px;
          background: linear-gradient(180deg, #ffffff, #d1d5db);
          box-shadow:
            0 1px 3px rgba(0, 0, 0, 0.25),
            0 0 0 1px rgba(0, 0, 0, 0.05);
          cursor: pointer;
          margin-top: -1px;
        }
        .clout-slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border: none;
          border-radius: 9999px;
          background: linear-gradient(180deg, #ffffff, #d1d5db);
          box-shadow:
            0 1px 3px rgba(0, 0, 0, 0.25),
            0 0 0 1px rgba(0, 0, 0, 0.05);
          cursor: pointer;
        }
      `}</style>
    </div>
  )
}
