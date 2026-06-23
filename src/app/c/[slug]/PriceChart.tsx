'use client'

import { useState, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { PriceHistoryRow } from '@/types/database'
import { formatCurrency } from '@/lib/utils'

type Props = {
  history: PriceHistoryRow[]
  currentPrice: number
  initialPrice: number
}

type Range = '1H' | '1D' | '1W' | '1M' | '1Y'

const RANGES: Range[] = ['1H', '1D', '1W', '1M', '1Y']

const RANGE_MS: Record<Range, number> = {
  '1H': 3600000,
  '1D': 86400000,
  '1W': 604800000,
  '1M': 2592000000,
  '1Y': 31536000000,
}

function niceStep(range: number): number {
  const r = range / 4, m = Math.pow(10, Math.floor(Math.log10(r))), res = r / m
  if (res <= 1.5) return m; if (res <= 3.5) return 2 * m; if (res <= 7.5) return 5 * m; return 10 * m
}

function niceTicks(min: number, max: number): number[] {
  const range = max - min; if (range < 0.01) return [Math.floor(min), Math.ceil(max) || min + 1]
  const step = niceStep(range), lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step
  const t: number[] = []; for (let v = lo; v <= hi + step * 0.001; v += step) t.push(Math.round(v * 100) / 100); return t
}

export default function PriceChart({ history, currentPrice, initialPrice }: Props) {
  const [range, setRange] = useState<Range>('1M')

  const { data, firstPrice, pctChange } = useMemo(() => {
    const now = Date.now()
    const cutoff = now - RANGE_MS[range]

    let filtered = history
      .map((h, i) => ({ idx: i, price: Number(h.price), ts: new Date(h.recorded_at).getTime() }))
      .filter((h) => h.ts >= cutoff)

    if (filtered.length === 0) {
      filtered = [{ idx: 0, price: initialPrice, ts: cutoff }]
    }

    // Always end with current price
    if (filtered[filtered.length - 1].price !== currentPrice) {
      filtered.push({ idx: filtered.length, price: currentPrice, ts: now })
    }

    const first = filtered[0].price
    const pct = first > 0 ? ((currentPrice - first) / first) * 100 : 0

    return {
      data: filtered.map((h, i) => ({ idx: i, price: h.price })),
      firstPrice: first,
      pctChange: pct,
    }
  }, [history, currentPrice, initialPrice, range])

  const isUp = pctChange >= 0
  const stroke = isUp ? '#22C55E' : '#EF4444'

  const prices = data.map((d) => d.price)
  const rawMin = Math.min(...prices), rawMax = Math.max(...prices)
  const pad = (rawMax - rawMin) * 0.12 || 1
  const ticks = niceTicks(rawMin - pad, rawMax + pad)

  return (
    <div className="mb-4">
      {/* Price header */}
      <div className="flex items-end gap-3 mb-3 px-1">
        <span className="text-2xl font-bold text-[#F5F5F0]">{formatCurrency(currentPrice)}</span>
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${isUp ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
          {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{pctChange.toFixed(2)}%
        </span>
      </div>

      {/* Chart */}
      <div className="h-[280px] sm:h-[340px] w-full select-none -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.20} />
                <stop offset="50%" stopColor={stroke} stopOpacity={0.06} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid horizontal vertical={false} stroke="#1C1C20" strokeDasharray="" />
            <XAxis dataKey="idx" hide />
            <YAxis
              domain={[ticks[0], ticks[ticks.length - 1]]}
              ticks={ticks}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#8A8A82', fontSize: 10, fontFamily: 'SF Mono, Menlo, monospace' }}
              tickFormatter={(v: number) => `$${v % 1 === 0 ? v : v.toFixed(2)}`}
              width={48}
              mirror
            />
            <Tooltip
              cursor={{ stroke: '#2A2A2E', strokeWidth: 1 }}
              contentStyle={{ background: '#16161A', border: '1px solid #2A2A2E', borderRadius: '8px', padding: '6px 10px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
              formatter={(value: number) => [`$${value.toFixed(2)}`, '']}
              labelFormatter={() => ''}
              itemStyle={{ color: '#F5F5F0', fontWeight: 600, fontSize: 12 }}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={stroke}
              strokeWidth={2}
              fill="url(#chartGrad)"
              dot={false}
              activeDot={{ r: 4, fill: stroke, stroke: '#16161A', strokeWidth: 2 }}
              animationDuration={500}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Time range buttons */}
      <div className="flex items-center justify-center gap-1 mt-2">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
              range === r
                ? 'bg-accent/15 text-accent'
                : 'text-[#8A8A82] hover:text-[#F5F5F0] hover:bg-subtle'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  )
}
