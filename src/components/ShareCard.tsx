'use client'

import { useRef, useState } from 'react'

type Props = {
  creatorName: string
  gainPct: number
  photoUrl?: string | null
}

export default function ShareCard({ creatorName, gainPct, photoUrl }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)

  async function downloadCard() {
    if (!cardRef.current) return
    setSaving(true)
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, backgroundColor: '#FFFFFF' })
      const link = document.createElement('a')
      link.download = `hype-${creatorName.toLowerCase().replace(/\s/g, '-')}.png`
      link.href = dataUrl
      link.click()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const isUp = gainPct >= 0

  return (
    <div className="space-y-3">
      {/* The card to capture */}
      <div
        ref={cardRef}
        className="w-[340px] bg-[#FFFFFF] border border-[#F0B90B]/40 rounded-2xl p-6 select-none"
        style={{ fontFamily: 'system-ui, sans-serif' }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between mb-5">
          <span className="text-[#F0B90B] font-bold text-sm tracking-tight">H<span className="text-[#1E2329]">ype</span></span>
          <span className="text-[#98A1B0] text-[10px] tracking-widest uppercase">Virtual Trading</span>
        </div>

        {/* Creator */}
        <div className="flex items-center gap-3 mb-5">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="w-12 h-12 rounded-xl object-cover" style={{ border: '2px solid #F0B90B' }} />
          ) : (
            <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg text-[#3a2e00]"
              style={{ background: 'linear-gradient(135deg, #F0B90B, #D4A200)' }}>
              {creatorName[0]}
            </div>
          )}
          <div>
            <p className="text-[#1E2329] font-bold text-base">{creatorName}</p>
            <p className="text-[#707A8A] text-xs">Creator shares</p>
          </div>
        </div>

        {/* The flex line */}
        <div className="bg-[#F5F7FA] rounded-xl p-4 mb-4">
          <p className="text-[#98A1B0] text-[10px] uppercase tracking-widest mb-1">I backed before</p>
          <p className={`text-3xl font-bold ${isUp ? 'text-[#0ECB81]' : 'text-[#F6465D]'}`}>
            {isUp ? '+' : ''}{gainPct.toFixed(1)}%
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <p className="text-[#98A1B0] text-[10px]">hype.vercel.app</p>
          <p className="text-[#F0B90B] text-[10px] font-semibold">@Hype</p>
        </div>
      </div>

      {/* Download button */}
      <button
        onClick={downloadCard}
        disabled={saving}
        className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 text-bg font-semibold text-xs py-2.5 rounded-xl transition-colors"
      >
        {saving ? 'Generating…' : '↓ Save Card'}
      </button>
    </div>
  )
}
