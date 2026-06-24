'use client'

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { formatCurrency } from '@/lib/utils'

type Props = {
  data: { time: string; invested: number }[]
  currentValue: number
}

export default function PortfolioChart({ data, currentValue }: Props) {
  const chartData = data.map((d, i) => ({
    idx: i,
    value: d.invested,
    label: new Date(d.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }))

  // Replace last point with actual current holdings value
  if (chartData.length > 0) {
    chartData[chartData.length - 1].value = currentValue
  }

  const values = chartData.map((d) => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = (max - min) * 0.15 || 10
  const isUp = chartData.length >= 2 && chartData[chartData.length - 1].value >= chartData[0].value
  const stroke = isUp ? '#22C55E' : '#EF4444'

  return (
    <div className="h-[180px] w-full select-none">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid horizontal vertical={false} stroke="#1C1C20" />
          <XAxis dataKey="idx" hide />
          <YAxis
            domain={[min - pad, max + pad]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#8A8A82', fontSize: 10, fontFamily: 'SF Mono, Menlo, monospace' }}
            tickFormatter={(v: number) => `$${Math.round(v)}`}
            width={40}
            mirror
          />
          <Tooltip
            cursor={{ stroke: '#2A2A2E', strokeWidth: 1 }}
            contentStyle={{ background: '#16161A', border: '1px solid #2A2A2E', borderRadius: '8px', padding: '6px 10px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
            formatter={(value: number) => [formatCurrency(value), 'Value']}
            labelFormatter={() => ''}
            itemStyle={{ color: '#F5F5F0', fontWeight: 600, fontSize: 12 }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={2}
            fill="url(#portfolioGrad)"
            dot={false}
            activeDot={{ r: 4, fill: stroke, stroke: '#16161A', strokeWidth: 2 }}
            animationDuration={500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
