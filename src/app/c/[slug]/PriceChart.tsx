'use client'

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { PriceHistoryRow } from '@/types/database'

type Props = { history: PriceHistoryRow[]; currentPrice: number; initialPrice: number }

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
  const d = history.map((h, i) => ({ idx: i, price: Number(h.price) }))
  if (d.length === 0) d.push({ idx: 0, price: initialPrice })
  if (d.length === 1 || d[d.length - 1].price !== currentPrice) d.push({ idx: d.length, price: currentPrice })
  const prices = d.map((p) => p.price), rawMin = Math.min(...prices), rawMax = Math.max(...prices)
  const pad = (rawMax - rawMin) * 0.15 || 1, ticks = niceTicks(rawMin - pad, rawMax + pad)
  const isUp = currentPrice >= initialPrice, stroke = isUp ? '#10B981' : '#EF4444'

  return (
    <div className="h-[220px] w-full select-none">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={d} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={stroke} stopOpacity={0.18} /><stop offset="100%" stopColor={stroke} stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid horizontal vertical={false} stroke="#1A1D23" />
          <XAxis dataKey="idx" hide />
          <YAxis domain={[ticks[0], ticks[ticks.length - 1]]} ticks={ticks} axisLine={false} tickLine={false} tick={{ fill: '#4B5563', fontSize: 11, fontFamily: 'SF Mono, Menlo, monospace' }} tickFormatter={(v: number) => `$${v % 1 === 0 ? v : v.toFixed(2)}`} width={52} />
          <Tooltip cursor={{ stroke: '#22262E', strokeWidth: 1 }} contentStyle={{ background: '#141519', border: '1px solid #22262E', borderRadius: '10px', padding: '8px 12px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }} formatter={(value: number) => [`$${value.toFixed(2)}`, 'Price']} labelFormatter={(i: number) => i === 0 ? 'Launch' : `Trade ${i}`} labelStyle={{ color: '#6B7280', fontSize: 11, marginBottom: 2 }} itemStyle={{ color: '#E5E7EB', fontWeight: 600, fontSize: 14 }} />
          <Area type="monotone" dataKey="price" stroke={stroke} strokeWidth={2} fill="url(#cg)" dot={false} activeDot={{ r: 4, fill: stroke, stroke: '#141519', strokeWidth: 2 }} animationDuration={600} animationEasing="ease-out" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
