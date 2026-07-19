'use client'

import { useEffect, useRef, useState } from 'react'

type WarMeterProps = {
  poolType: 'war'
  creatorAName: string
  creatorBName: string
  /** Creator A's current share of the combined metric, 0-100. */
  shareAPercent: number
  /** The share ratio at pool-open — defaults to 50 (50/50) if the pool didn't override it. */
  baselineSharePercent?: number
}

type SingleMeterProps = {
  poolType: 'single'
  metricLabel?: string
  currentMetric: number
  baselineMetric: number
  /** Matches clout_pool_positions.liquidation_trigger_ratio's default — shades the danger zone. */
  triggerRatio?: number
}

type Props = WarMeterProps | SingleMeterProps

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

// The "CLOUT Meter" — a live-updating tug-of-war / momentum gauge that maps
// straight onto the same numbers clout_check_liquidations and
// clout_settle_pool actually decide on: share_a vs baseline_share_a for War
// Pools, current_metric vs baseline_metric for single pools. Pulses briefly
// whenever the tracked value moves, so a shift in the underlying metric
// reads as an event, not just a number changing.
export default function CloutMeter(props: Props) {
  const trackedValue = props.poolType === 'war' ? props.shareAPercent : (props.currentMetric / Math.max(props.baselineMetric, 1)) * 100

  const prevRef = useRef<number | null>(null)
  const [pulsing, setPulsing] = useState(false)

  useEffect(() => {
    if (prevRef.current !== null && Math.abs(trackedValue - prevRef.current) > 0.25) {
      setPulsing(true)
      const t = setTimeout(() => setPulsing(false), 900)
      prevRef.current = trackedValue
      return () => clearTimeout(t)
    }
    prevRef.current = trackedValue
  }, [trackedValue])

  if (props.poolType === 'war') {
    return <WarMeter {...props} pulsing={pulsing} />
  }
  return <SingleMeter {...props} pulsing={pulsing} />
}

function WarMeter({ creatorAName, creatorBName, shareAPercent, baselineSharePercent = 50, pulsing }: WarMeterProps & { pulsing: boolean }) {
  const shareA = clamp(shareAPercent, 0, 100)
  const shareB = 100 - shareA

  return (
    <div className="w-full rounded-2xl border border-black/5 bg-white/70 p-4 shadow-xl shadow-black/5 backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider">
        <span className="text-emerald-600">{creatorAName} · HYPE</span>
        <span className="text-rose-500">{creatorBName} · FADE</span>
      </div>

      <div
        className={`relative h-7 w-full overflow-hidden rounded-full bg-black/5 ring-1 ring-black/5 ${
          pulsing ? 'text-emerald-500 animate-clout-meter-pulse' : ''
        }`}
      >
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-700 ease-out"
          style={{ width: `${shareA}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-gradient-to-l from-rose-400 to-rose-500 transition-all duration-700 ease-out"
          style={{ width: `${shareB}%` }}
        />
        {/* Opening baseline tick */}
        <div
          className="absolute top-0 h-full w-0.5 bg-black/25"
          style={{ left: `${clamp(baselineSharePercent, 0, 100)}%` }}
          title={`Opening ratio: ${baselineSharePercent.toFixed(1)}%`}
        />
      </div>

      <div className="mt-2 flex justify-between font-mono text-sm font-bold">
        <span className="text-emerald-600">{shareA.toFixed(1)}%</span>
        <span className="text-rose-500">{shareB.toFixed(1)}%</span>
      </div>
    </div>
  )
}

function SingleMeter({ metricLabel = 'Metric', currentMetric, baselineMetric, triggerRatio = 0.2, pulsing }: SingleMeterProps & { pulsing: boolean }) {
  // Scaled to a 0-200%-of-baseline track: 0% = left edge, 100% (baseline) = center, 200% = right edge.
  const pctOfBaseline = baselineMetric > 0 ? (currentMetric / baselineMetric) * 100 : 100
  const position = clamp(pctOfBaseline / 2, 0, 100) // position along the 0-200 track, expressed as 0-100% width
  const isUp = pctOfBaseline >= 100

  const dangerLowPct = 100 * (1 - triggerRatio) // e.g. 80% of baseline -> UP liquidation line
  const dangerHighPct = 100 * (1 + triggerRatio) // e.g. 120% of baseline -> DOWN liquidation line
  const dangerLowPos = clamp(dangerLowPct / 2, 0, 100)
  const dangerHighPos = clamp(dangerHighPct / 2, 0, 100)

  return (
    <div className="w-full rounded-2xl border border-black/5 bg-white/70 p-4 shadow-xl shadow-black/5 backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-gray-400">
        <span>{metricLabel} vs 4-Week Baseline</span>
        <span className={isUp ? 'text-emerald-600' : 'text-rose-500'}>{isUp ? '▲ HYPE' : '▼ FADE'}</span>
      </div>

      <div
        className={`relative h-7 w-full overflow-hidden rounded-full bg-black/5 ring-1 ring-black/5 ${
          pulsing ? `animate-clout-meter-pulse ${isUp ? 'text-emerald-500' : 'text-rose-500'}` : ''
        }`}
      >
        {/* Liquidation danger zones */}
        <div className="absolute inset-y-0 left-0 bg-rose-500/10" style={{ width: `${dangerLowPos}%` }} />
        <div className="absolute inset-y-0 right-0 bg-emerald-500/10" style={{ width: `${100 - dangerHighPos}%` }} />

        {/* Fill up to the current position */}
        <div
          className={`absolute inset-y-0 left-0 transition-all duration-700 ease-out ${
            isUp ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500'
          }`}
          style={{ width: `${position}%` }}
        />

        {/* Baseline center tick (100%) */}
        <div className="absolute top-0 h-full w-0.5 bg-black/25" style={{ left: '50%' }} title="Baseline" />
        {/* Liquidation trigger ticks */}
        <div className="absolute top-0 h-full w-px bg-rose-500/60" style={{ left: `${dangerLowPos}%` }} title="UP liquidation line" />
        <div className="absolute top-0 h-full w-px bg-emerald-500/60" style={{ left: `${dangerHighPos}%` }} title="DOWN liquidation line" />
      </div>

      <div className="mt-2 flex justify-between font-mono text-sm font-bold">
        <span className="text-gray-400">0%</span>
        <span className={isUp ? 'text-emerald-600' : 'text-rose-500'}>{pctOfBaseline.toFixed(1)}% of baseline</span>
        <span className="text-gray-400">200%</span>
      </div>
    </div>
  )
}
