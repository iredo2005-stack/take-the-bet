'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import type { LiveTick } from '@/lib/useLiveTicks'

type Point = { time: number; value: number }

type Props = {
  initialHistory: { index_price: number; ts: string }[]
  latestTick: LiveTick | null
  fallbackPrice: number
}

// Perpetual creator index, pushed live via Supabase Realtime (see
// useLiveTicks / scripts/liveIngest.mjs) — no polling, no page refresh.
export default function LiveIndexChart({ initialHistory, latestTick, fallbackPrice }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const seriesRef = useRef<any>(null)
  const lastPlottedTsRef = useRef(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const initialPoints: Point[] = useMemo(
    () => initialHistory.map((t) => ({ time: Math.floor(new Date(t.ts).getTime() / 1000), value: Number(t.index_price) })),
    [initialHistory]
  )

  useEffect(() => {
    if (!mounted || !containerRef.current) return
    let chart: any
    let series: any

    import('lightweight-charts').then(({ createChart, LineSeries }) => {
      if (!containerRef.current) return

      chart = createChart(containerRef.current, {
        layout: { background: { color: 'transparent' }, textColor: '#707A8A', fontSize: 11, fontFamily: 'SF Mono, Menlo, Consolas, monospace' },
        grid: { vertLines: { color: '#EAECEF' }, horzLines: { color: '#EAECEF' } },
        crosshair: { vertLine: { color: '#D1D5DB', labelBackgroundColor: '#FFFFFF' }, horzLine: { color: '#D1D5DB', labelBackgroundColor: '#FFFFFF' } },
        rightPriceScale: { borderColor: '#EAECEF' },
        timeScale: { borderColor: '#EAECEF', timeVisible: true, secondsVisible: true },
        handleScale: true,
        handleScroll: true,
      })

      series = chart.addSeries(LineSeries, { color: '#F0B90B', lineWidth: 2 })

      chartRef.current = chart
      seriesRef.current = series

      const now = Math.floor(Date.now() / 1000)
      const seed = initialPoints.length > 0 ? initialPoints : [{ time: now - 60, value: fallbackPrice }, { time: now, value: fallbackPrice }]
      series.setData(seed)
      lastPlottedTsRef.current = seed[seed.length - 1]?.time ?? 0
      chart.timeScale().fitContent()

      const ro = new ResizeObserver(() => {
        if (containerRef.current) chart.resize(containerRef.current.clientWidth, containerRef.current.clientHeight)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  // Append each new push — lightweight-charts requires strictly increasing time.
  useEffect(() => {
    if (!latestTick || !seriesRef.current) return
    const t = Math.floor(new Date(latestTick.ts).getTime() / 1000)
    if (t <= lastPlottedTsRef.current) return
    lastPlottedTsRef.current = t
    seriesRef.current.update({ time: t, value: Number(latestTick.index_price) })
  }, [latestTick])

  const currentValue = latestTick ? Number(latestTick.index_price) : initialPoints[initialPoints.length - 1]?.value ?? fallbackPrice

  if (!mounted) return <div className="h-[220px] w-full bg-card rounded-xl animate-pulse" />

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-[#707A8A] text-[10px] uppercase tracking-wide font-semibold">Live Creator Index</p>
        <p className="text-[#1E2329] text-sm font-bold">{formatCurrency(currentValue)}</p>
      </div>
      <div ref={containerRef} className="h-[200px] w-full rounded-xl overflow-hidden" style={{ minHeight: 160 }} />
    </div>
  )
}
