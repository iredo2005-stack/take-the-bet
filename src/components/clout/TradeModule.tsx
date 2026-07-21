'use client'

import { useMemo, useState } from 'react'
import { dollarsToCents, centsToDollars } from '@/lib/money'
import { previewLivePayoutCents, type PoolSnapshot, type PoolSide } from '@/lib/clout/payout'

// clout_pool_positions_leverage_check only allows leverage in {1, 5, 10} — not
// a continuous range — so leverage is picked from exactly those three chips
// rather than a freeform control the backend would reject on submit.
const LEVERAGE_TIERS = [1, 5, 10] as const

// Whole trade panel tints from neutral toward a warning shade as leverage
// climbs — the risk signal isn't just on the leverage chips themselves.
const TIER_PANEL_CLASSES = [
  'border-black/5 shadow-xl shadow-black/5',
  'border-amber-300/60 shadow-xl shadow-amber-300/30',
  'border-rose-300/70 shadow-xl shadow-rose-300/40',
] as const

const QUICK_ADD_USDC = [10, 25, 50, 100] as const

export type TradeModulePool = {
  upPoolUsdc: number
  downPoolUsdc: number
  rakeBps: number
  upSideNotionalUsdc: number
  downSideNotionalUsdc: number
}

type Props = {
  pool: TradeModulePool
  /** CLOUT isn't just Creator Wars — most pools are a single creator vs their own baseline. */
  poolType: 'single' | 'war'
  poolLabel: string
  creatorAName: string
  creatorAPhotoUrl?: string | null
  /** Only present for War Pools — single pools only ever have one creator. */
  creatorBName?: string
  creatorBPhotoUrl?: string | null
  balanceUsdc?: number
  minWagerUsdc?: number
  defaultWagerUsdc?: number
  onSubmit?: (params: { side: PoolSide; leverage: number; wagerUsdc: number }) => void | Promise<void>
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function TradeModule({
  pool,
  poolType,
  poolLabel,
  creatorAName,
  creatorAPhotoUrl,
  creatorBName,
  creatorBPhotoUrl,
  balanceUsdc,
  minWagerUsdc = 1,
  defaultWagerUsdc = 50,
  onSubmit,
}: Props) {
  const [wagerUsdc, setWagerUsdc] = useState(defaultWagerUsdc)
  const [side, setSide] = useState<PoolSide>('up')
  const [tierIndex, setTierIndex] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [justTraded, setJustTraded] = useState(false)

  const leverage = LEVERAGE_TIERS[tierIndex]

  // War Pools swap the header photo/name with the selected side (UP backs
  // Creator A, DOWN backs Creator B); a single pool only ever has one
  // creator, so it stays put regardless of which side is picked.
  const activeName = poolType === 'war' && side === 'down' ? creatorBName ?? creatorAName : creatorAName
  const activePhoto = poolType === 'war' && side === 'down' ? creatorBPhotoUrl : creatorAPhotoUrl

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

  const wagerCents = dollarsToCents(Math.max(wagerUsdc, 0))
  const payoutCents = previewLivePayoutCents(snapshot, side, wagerCents, leverage)
  const payoutUsdc = centsToDollars(payoutCents)
  const returnPct = wagerUsdc > 0 ? ((payoutUsdc - wagerUsdc) / wagerUsdc) * 100 : 0

  const fmt = (n: number) => (Number.isInteger(n) ? n.toString() : n.toFixed(2))

  const overBalance = balanceUsdc !== undefined && wagerUsdc > balanceUsdc
  const canTrade = !submitting && wagerUsdc >= minWagerUsdc && !overBalance

  const handleTrade = async () => {
    if (!canTrade) return
    setSubmitting(true)
    try {
      await onSubmit?.({ side, leverage, wagerUsdc })
      setJustTraded(true)
      setTimeout(() => setJustTraded(false), 1200)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className={`w-full rounded-2xl border bg-white/70 p-5 backdrop-blur-xl transition-colors duration-300 ${TIER_PANEL_CLASSES[tierIndex]}`}
    >
      {/* Header — creator photo (or initials fallback) + pool context, swaps with side on War Pools */}
      <div className="mb-4 flex items-center gap-3">
        {activePhoto ? (
          <img src={activePhoto} alt={activeName} className="h-10 w-10 flex-shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 text-sm font-bold text-white">
            {initials(activeName)}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-xs text-gray-400">{poolLabel}</p>
          <p className="truncate text-sm font-bold text-gray-900">
            {activeName} · <span className={side === 'up' ? 'text-emerald-600' : 'text-rose-500'}>{side === 'up' ? 'HYPE' : 'FADE'}</span>
          </p>
        </div>
      </div>

      {/* Huge wager entry */}
      <div className="mb-4 flex items-center justify-center gap-1">
        <span className="font-mono text-3xl font-extrabold text-gray-300">$</span>
        <input
          type="number"
          min={minWagerUsdc}
          step={1}
          value={wagerUsdc}
          onChange={(e) => setWagerUsdc(Math.max(0, Number(e.target.value)))}
          className="w-40 bg-transparent text-center font-mono text-5xl font-extrabold tracking-tight text-gray-900 outline-none"
        />
      </div>
      {balanceUsdc !== undefined && (
        <p className="mb-4 text-center font-mono text-xs text-gray-400">
          Balance: <span className="text-gray-700">{fmt(balanceUsdc)} $CLOUT</span>
        </p>
      )}
      {overBalance && <p className="-mt-2 mb-4 text-center text-xs font-semibold text-rose-500">Exceeds your available $CLOUT balance.</p>}

      {/* HYPE / FADE pill toggle — selects the side, doesn't submit */}
      <div className="mb-3 flex rounded-full bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setSide('up')}
          className={`flex-1 rounded-full py-2.5 text-sm font-extrabold transition-all ${
            side === 'up' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400'
          }`}
        >
          HYPE
        </button>
        <button
          type="button"
          onClick={() => setSide('down')}
          className={`flex-1 rounded-full py-2.5 text-sm font-extrabold transition-all ${
            side === 'down' ? 'bg-white text-rose-500 shadow-sm' : 'text-gray-400'
          }`}
        >
          FADE
        </button>
      </div>

      {/* Leverage chips — the only three tiers the backend accepts */}
      <div className="mb-3 flex gap-1.5">
        {LEVERAGE_TIERS.map((t, i) => (
          <button
            key={t}
            type="button"
            onClick={() => setTierIndex(i)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-extrabold transition-colors ${
              i === tierIndex ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'
            }`}
          >
            X{t}
          </button>
        ))}
      </div>
      {leverage === 10 && (
        <p className="mb-3 text-center text-[11px] font-semibold text-rose-500">
          ⚠ A 20% adverse move against you at X10 triggers a full liquidation.
        </p>
      )}

      {/* To win — live math from previewLivePayoutCents, the same formula clout_calculate_live_payout uses */}
      <div className="mb-4 text-center">
        <p className="text-xs text-gray-400">To win</p>
        <p className="font-mono text-xl font-extrabold text-emerald-600">{fmt(payoutUsdc)} $CLOUT</p>
        <p className="mt-0.5 font-mono text-[11px] text-gray-400">
          {returnPct >= 0 ? '+' : ''}
          {returnPct.toFixed(0)}% return
        </p>
      </div>

      {/* Quick-add chips */}
      <div className="mb-4 flex gap-2">
        {QUICK_ADD_USDC.map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() => setWagerUsdc((w: number) => w + amount)}
            className="flex-1 rounded-lg border border-gray-200 bg-white py-2 text-xs font-bold text-gray-700 transition hover:border-gray-300"
          >
            +${amount}
          </button>
        ))}
      </div>

      {/* Single Trade CTA — color-coded to the selected side */}
      <button
        type="button"
        disabled={!canTrade}
        onClick={handleTrade}
        className={`w-full rounded-2xl py-4 text-sm font-extrabold text-white shadow-md transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
          side === 'up' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'
        }`}
      >
        {justTraded ? 'Trade Placed ✓' : submitting ? 'Placing…' : 'Trade'}
      </button>
    </div>
  )
}
