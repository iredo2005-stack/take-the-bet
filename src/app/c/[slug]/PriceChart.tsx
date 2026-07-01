'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import type { PriceHistoryRow } from '@/types/database'
import { formatCurrency } from '@/lib/utils'

type Props = {
  history: PriceHistoryRow[]
  currentPrice: number
  initialPrice: number
}

type Range = '1D' | '1W' | '1M' | 'ALL'

const RANGE_MS: Record<Range, number> = {
  '1D': 86400000,
  '1W': 604800000,
  '1M': 2592000000,
  'ALL': Infinity,
}

// Build synthetic OHLC from sequential price points.
// Each candle: open = previous close, close = this price,
// high/low derived with a small random-looking spread seeded by price.
function buildCandles(points: { price: number; ts: number }[]) {
  if (points.length < 2) return []

  const candles = []
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].price
    const curr = points[i].price
    const open = prev
    const close = curr
    const isUp = close >= open

    // Derive high/low with a wick that looks organic.
    // Use price magnitude to scale the wick size, seeded deterministically.
    const mid = (open + close) / 2
    const bodySize = Math.abs(close - open)
    // Wick = 40-80% of body, minimum 0.5% of price
    const seed = Math.sin(points[i].ts / 1e9) * 0.5 + 0.5 // 0-1, deterministic from timestamp
    const wickPct = 0.004 + seed * 0.008 // 0.4% to 1.2% of price
    const wick = Math.max(bodySize * 0.4, mid * wickPct)

    candles.push({
      time: Math.floor(points[i].ts / 1000) as number,
      open: Math.round(open * 10000) / 10000,
      high: Math.round((Math.max(open, close) + wick * (isUp ? 0.7 : 0.4)) * 10000) / 10000,
      low: Math.round((Math.min(open, close) - wick * (isUp ? 0.4 : 0.7)) * 10000) / 10000,
      close: Math.round(close * 10000) / 10000,
    })
  }

  return candles
}

export default function PriceChart({ history, currentPrice, initialPrice }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const seriesRef = useRef<any>(null)
  const [range, setRange] = useState<Range>('1M')
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const candles = useMemo(() => {
    const now = Date.now()
    const cutoff = range === 'ALL' ? 0 : now - RANGE_MS[range]

    const points: { price: number; ts: number }[] = []

    // Add initial price as the first point
    const filtered = history
      .map((h) => ({ price: Number(h.price), ts: new Date(h.recorded_at).getTime() }))
      .filter((h) => h.ts >= cutoff)
      .sort((a, b) => a.ts - b.ts)

    if (filtered.length === 0) {
      // No history in range — single flat candle
      const ts = now - 86400000
      points.push({ price: initialPrice, ts }, { price: currentPrice, ts: now })
    } else {
      // Prepend the initial price if needed
      if (filtered[0].ts > cutoff + 3600000) {
        points.push({ price: filtered[0].price, ts: cutoff })
      }
      points.push(...filtered)
    }

    // Always end with current price
    if (points.length === 0 || points[points.length - 1].price !== currentPrice) {
      points.push({ price: currentPrice, ts: now })
    }

    return buildCandles(points)
  }, [history, currentPrice, initialPrice, range])

  const pctChange = candles.length >= 1
    ? ((currentPrice - (candles[0]?.open ?? initialPrice)) / (candles[0]?.open ?? initialPrice)) * 100
    : 0
  const isUp = pctChange >= 0

  // Create / destroy chart
  useEffect(() => {
    if (!mounted || !containerRef.current) return

    let chart: any
    let series: any

    import('lightweight-charts').then(({ createChart, CandlestickSeries }) => {
      if (!containerRef.current) return

      chart = createChart(containerRef.current, {
        layout: {
          background: { color: 'transparent' },
          textColor: '#8A8A82',
          fontSize: 11,
          fontFamily: 'SF Mono, Menlo, Consolas, monospace',
        },
        grid: {
          vertLines: { color: '#1A1D23' },
          horzLines: { color: '#1A1D23' },
        },
        crosshair: {
          vertLine: { color: '#2A2A2E', labelBackgroundColor: '#16161A' },
          horzLine: { color: '#2A2A2E', labelBackgroundColor: '#16161A' },
        },
        rightPriceScale: {
          borderColor: '#22262E',
        },
        timeScale: {
          borderColor: '#22262E',
          timeVisible: true,
          secondsVisible: false,
        },
        handleScale: true,
        handleScroll: true,
      })

      series = chart.addSeries(CandlestickSeries, {
        upColor: '#22C55E',
        downColor: '#EF4444',
        borderUpColor: '#22C55E',
        borderDownColor: '#EF4444',
        wickUpColor: '#22C55E',
        wickDownColor: '#EF4444',
      })

      chartRef.current = chart
      seriesRef.current = series

      if (candles.length > 0) {
        series.setData(candles)
        chart.timeScale().fitContent()
      }

      // Resize observer
      const ro = new ResizeObserver(() => {
        if (containerRef.current) {
          chart.resize(containerRef.current.clientWidth, containerRef.current.clientHeight)
        }
      })
      if (containerRef.current) ro.observe(containerRef.current)

      return () => {
        ro.disconnect()
        chart.remove()
        chartRef.current = null
        seriesRef.current = null
      }
    })

    return () => {
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
        seriesRef.current = null
      }
    }
  }, [mounted])

  // Update data when candles/range changes (without recreating chart)
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current || candles.length === 0) return
    seriesRef.current.setData(candles)
    chartRef.current.timeScale().fitContent()
  }, [candles])

  if (!mounted) {
    return <div className="h-[300px] sm:h-[360px] bg-card rounded-xl mb-4 animate-pulse" />
  }

  return (
    <div className="mb-4">
      {/* Price header */}
      <div className="flex items-end gap-3 mb-3 px-1">
        <span className="text-2xl font-bold text-[#F5F5F0]">{formatCurrency(currentPrice)}</span>
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${isUp ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
          {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{pctChange.toFixed(2)}%
        </span>
      </div>

      {/* Candlestick chart */}
      <div
        ref={containerRef}
        className="h-[280px] sm:h-[340px] w-full rounded-xl overflow-hidden"
        style={{ minHeight: 220 }}
      />

      {/* Time range buttons */}
      <div className="flex items-center justify-center gap-1 mt-2">
        {(['1D', '1W', '1M', 'ALL'] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
              range === r ? 'bg-accent/15 text-accent' : 'text-[#8A8A82] hover:text-[#F5F5F0] hover:bg-subtle'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  )
}
