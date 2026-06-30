'use client'

import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/utils'
import { fmtViews } from '@/lib/videoTiers'

type Outcome = { id: string; label: string; pool_amount: number; target_views: number; sort_order: number }

type Props = {
  bet: {
    id: string
    question: string
    deadline: string
    total_pool: number
    status: string
    video_id: string | null
    video_title: string | null
    start_views: number
    current_views: number
    creator_name: string
    creator_photo: string | null
    outcomes: Outcome[]
  }
}

function useCountdown(deadline: string) {
  const [left, setLeft] = useState('')
  useEffect(() => {
    function update() {
      const ms = new Date(deadline).getTime() - Date.now()
      if (ms <= 0) { setLeft('Ended'); return }
      const h = Math.floor(ms / 3600000)
      const m = Math.floor((ms % 3600000) / 60000)
      setLeft(h > 0 ? `${h}h ${m}m` : `${m}m`)
    }
    update()
    const t = setInterval(update, 30000)
    return () => clearInterval(t)
  }, [deadline])
  return left
}

export default function VideoBetCard({ bet }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [amount, setAmount] = useState(100)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const countdown = useCountdown(bet.deadline)

  const sorted = [...bet.outcomes].sort((a, b) => a.sort_order - b.sort_order)
  const total = bet.total_pool || 0
  const isLive = bet.status === 'open' && countdown !== 'Ended'
  const viewProgress = bet.start_views > 0
    ? Math.min(1, (bet.current_views - bet.start_views) / Math.max(1, sorted[sorted.length - 1]?.target_views - bet.start_views))
    : 0

  async function placeBet() {
    if (!selected || amount <= 0) return
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ betId: bet.id, outcomeId: selected, amount }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed'); return }
      setDone(true)
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  return (
    <div className="bg-card border border-edge rounded-2xl overflow-hidden">
      {/* YouTube embed */}
      {bet.video_id && (
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <iframe
            src={`https://www.youtube.com/embed/${bet.video_id}?modestbranding=1&rel=0`}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={bet.video_title || 'Video'}
          />
        </div>
      )}

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-[#F5F5F0] text-sm font-semibold leading-snug">
              {bet.video_title ? bet.video_title.slice(0, 70) + (bet.video_title.length > 70 ? '…' : '') : bet.question}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[#8A8A82] text-[10px]">{bet.creator_name}</span>
              <span className="text-[#8A8A82] text-[10px]">·</span>
              <span className={`text-[10px] font-semibold ${isLive ? 'text-accent' : 'text-[#8A8A82]'}`}>{countdown}</span>
              <span className="text-[#8A8A82] text-[10px]">·</span>
              <span className="text-[#8A8A82] text-[10px]">{formatCurrency(total)} pool</span>
            </div>
          </div>
        </div>

        {/* View count progress */}
        {bet.current_views > 0 && (
          <div className="mb-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[#8A8A82] text-[10px]">Current views</span>
              <span className="text-[#F5F5F0] text-[10px] font-bold">{fmtViews(bet.current_views)}</span>
            </div>
            <div className="h-1.5 bg-subtle rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500"
                style={{ width: `${Math.max(2, viewProgress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Tier buttons */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          {sorted.map((o) => {
            const pct = total > 0 ? Math.round((o.pool_amount / total) * 100) : 0
            const isSelected = selected === o.id
            const isLeading = o.pool_amount === Math.max(...sorted.map(x => x.pool_amount))
            const reached = bet.current_views >= o.target_views

            return (
              <button
                key={o.id}
                onClick={() => isLive && !done && setSelected(isSelected ? null : o.id)}
                disabled={!isLive || done}
                className={`relative rounded-xl p-3 text-left transition-all border ${
                  isSelected
                    ? 'border-accent bg-accent/10'
                    : isLeading && total > 0
                      ? 'border-up/30 bg-up/5 hover:bg-up/10'
                      : 'border-edge bg-subtle hover:bg-muted'
                } ${(!isLive || done) ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
              >
                <div className={`text-xs font-bold mb-0.5 ${reached ? 'text-up' : isSelected ? 'text-accent' : 'text-[#F5F5F0]'}`}>
                  {reached ? '✓ ' : ''}{o.label}
                </div>
                <div className="text-[#8A8A82] text-[10px]">{pct}% of pool</div>
              </button>
            )
          })}
        </div>

        {/* Bet input */}
        {isLive && !done && (
          <div className="space-y-2">
            {selected && (
              <>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8A82] text-xs">HC</span>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-subtle border border-edge rounded-lg pl-9 pr-3 py-2 text-[#F5F5F0] text-xs focus:outline-none focus:ring-1 focus:ring-accent/30"
                      min="1"
                    />
                  </div>
                  <button
                    onClick={placeBet}
                    disabled={loading}
                    className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-bg font-bold text-xs px-5 py-2 rounded-lg transition-colors"
                  >
                    {loading ? '…' : 'Bet'}
                  </button>
                </div>
                {error && <p className="text-down text-[10px]">{error}</p>}
              </>
            )}
          </div>
        )}

        {done && (
          <div className="bg-up/10 border border-up/20 rounded-lg px-3 py-2 text-center">
            <p className="text-up text-xs font-semibold">Bet placed! 🎯</p>
            <p className="text-[#8A8A82] text-[10px] mt-0.5">Resolves when deadline passes.</p>
          </div>
        )}
      </div>
    </div>
  )
}
