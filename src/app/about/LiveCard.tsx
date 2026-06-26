'use client'

import { useState, useEffect, useRef } from 'react'

export default function LiveCard() {
  const [price, setPrice] = useState(142.50)
  const [subs, setSubs] = useState(1_240_000)
  const [flash, setFlash] = useState(false)
  const ptsRef = useRef<number[]>([])
  const basePrice = 136.7

  // Seed sparkline
  useEffect(() => {
    const arr: number[] = []
    let v = 120
    for (let i = 0; i < 24; i++) { v += Math.random() * 9 - 3.2; arr.push(v) }
    ptsRef.current = arr
  }, [])

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return

    const interval = setInterval(() => {
      setSubs((s) => s + Math.floor(Math.random() * 900 + 120))
      setPrice((p) => {
        const next = Math.max(1, p + (Math.random() * 1.7 - 0.45))
        ptsRef.current.push(120 + (next - 142.5))
        ptsRef.current.shift()
        return next
      })
      setFlash(true)
      setTimeout(() => setFlash(false), 300)
    }, 1600)

    return () => clearInterval(interval)
  }, [])

  const pct = ((price - basePrice) / basePrice) * 100
  const isUp = pct >= 0

  function fitPoints(arr: number[]) {
    if (arr.length < 2) return ''
    const min = Math.min(...arr), max = Math.max(...arr)
    const rng = (max - min) || 1, W = 300, H = 54
    const step = W / (arr.length - 1)
    return arr.map((p, i) => `${(i * step).toFixed(1)},${(H - ((p - min) / rng) * (H - 8) - 4).toFixed(1)}`).join(' ')
  }

  return (
    <div className="relative rounded-[20px] p-5 overflow-hidden" style={{
      background: 'linear-gradient(180deg, #151B30, #0F1424)',
      border: '1px solid rgba(244,233,107,0.10)',
      boxShadow: '0 24px 60px -28px rgba(0,0,0,0.8)',
    }}>
      {/* Glow overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(400px 140px at 80% 0, rgba(244,233,107,0.10), transparent 70%)' }} />

      <div className="relative">
        <div className="text-[10.5px] tracking-[0.2em] uppercase text-[#8A93B0]" style={{ fontFamily: 'var(--font-mono-about)' }}>Live price</div>

        {/* Creator row */}
        <div className="flex items-center gap-3 my-3.5">
          <div className="w-[46px] h-[46px] rounded-[14px] flex items-center justify-center text-[#0A0D18] text-xl font-bold flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #F4E96B, #B98E2E)', fontFamily: 'var(--font-display)' }}>
            M
          </div>
          <div>
            <div className="font-semibold text-[17px]" style={{ fontFamily: 'var(--font-display)' }}>@MidnightPlays</div>
            <div className="text-[12.5px] text-[#8A93B0]">YouTube · Gaming</div>
          </div>
        </div>

        {/* Subscribers */}
        <div className="flex justify-between items-baseline text-[13px] text-[#8A93B0] border-t border-dashed border-white/[0.07] pt-3"
          style={{ fontFamily: 'var(--font-mono-about)' }}>
          <span>Subscribers</span>
          <span className="text-[#EDEFF7] font-bold">{subs.toLocaleString()}</span>
        </div>

        {/* Price + delta */}
        <div className="flex items-end justify-between mt-1.5">
          <div>
            <div className="text-[11px] tracking-[0.18em] uppercase text-[#8A93B0]" style={{ fontFamily: 'var(--font-mono-about)' }}>Price</div>
            <div className="font-bold text-[34px] leading-none tracking-tight" style={{ fontFamily: 'var(--font-mono-about)' }}>
              {price.toFixed(2)}
            </div>
          </div>
          <div className={`font-bold text-sm px-2.5 py-1 rounded-lg transition-colors ${flash ? (isUp ? 'bg-[rgba(74,222,128,0.34)]' : 'bg-[rgba(248,113,113,0.34)]') : (isUp ? 'bg-[rgba(74,222,128,0.10)]' : 'bg-[rgba(248,113,113,0.10)]')}`}
            style={{ fontFamily: 'var(--font-mono-about)', color: isUp ? '#4ADE80' : '#F87171' }}>
            {isUp ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
          </div>
        </div>

        {/* Sparkline */}
        <svg className="w-full block mt-4 overflow-visible" viewBox="0 0 300 54" preserveAspectRatio="none" style={{ height: '54px' }}>
          <polyline
            points={fitPoints(ptsRef.current)}
            fill="none"
            stroke={isUp ? '#4ADE80' : '#F87171'}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  )
}
