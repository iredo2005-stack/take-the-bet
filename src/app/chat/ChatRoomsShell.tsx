'use client'

import { useEffect, useState } from 'react'
import { ROOM_CONFIG, meetsTier, lockMessage, type Tier } from '@/lib/roomTiers'
import ChatRoom from './ChatRoom'

type Access = { tier: Tier; roi30d: number; token: string } | null

export default function ChatRoomsShell() {
  const [active, setActive] = useState<Tier>('bronze')
  const [access, setAccess] = useState<Access>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadAccess() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/access/tier')
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not audit your ROI')
        return
      }
      setAccess({ tier: data.tier, roi30d: data.roi30d, token: data.token })
    } catch {
      setError('Network error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAccess()
  }, [])

  return (
    <div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {ROOM_CONFIG.map((room) => {
          const unlocked = access ? meetsTier(access.tier, room.tier) : false
          return (
            <button
              key={room.tier}
              onClick={() => setActive(room.tier)}
              className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-all flex flex-col items-center gap-0.5 ${
                active === room.tier ? 'border-accent bg-accent/10 text-accent' : 'border-edge bg-card text-[#707A8A] hover:text-[#1E2329]'
              }`}
            >
              <span>{room.label}</span>
              {!unlocked && <span className="text-[9px]">🔒</span>}
            </button>
          )
        })}
      </div>

      {loading && <div className="h-64 bg-card rounded-2xl animate-pulse" />}

      {!loading && error && (
        <div className="bg-card border border-edge rounded-2xl p-6 text-center">
          <p className="text-down text-sm mb-3">{error}</p>
          <button onClick={loadAccess} className="text-xs font-semibold bg-subtle border border-edge px-3 py-1.5 rounded-lg hover:bg-muted transition">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && access && (
        meetsTier(access.tier, active) ? (
          <ChatRoom tier={active} token={access.token} onTokenExpired={loadAccess} />
        ) : (
          <LockOverlay tier={active} roi30d={access.roi30d} onRefresh={loadAccess} />
        )
      )}
    </div>
  )
}

function LockOverlay({ tier, roi30d, onRefresh }: { tier: Tier; roi30d: number; onRefresh: () => void }) {
  return (
    <div className="relative bg-gradient-to-b from-gold-light to-card border-2 border-accent/40 rounded-2xl p-8 text-center overflow-hidden">
      <div className="text-4xl mb-3">🔒</div>
      <h2 className="text-accent font-extrabold text-lg mb-2 tracking-wide">{lockMessage(tier)}</h2>
      <p className="text-[#707A8A] text-xs mb-4">
        Your audited trailing 30-day ROI is <span className="font-semibold text-[#1E2329]">{(roi30d * 100).toFixed(1)}%</span>.
        Keep trading profitably to unlock this room.
      </p>
      <div className="flex items-center justify-center gap-2">
        <a href="/dashboard" className="text-xs font-semibold bg-accent text-bg px-4 py-2 rounded-xl hover:brightness-110 transition">
          Start Trading
        </a>
        <button onClick={onRefresh} className="text-xs font-semibold bg-subtle border border-edge px-4 py-2 rounded-xl hover:bg-muted transition">
          Re-check ROI
        </button>
      </div>
    </div>
  )
}
