'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import CreatorTradingDashboard, { type CloutPoolDetail } from '@/components/clout/CreatorTradingDashboard'
import type { AlphaChatMessage, WinTickerEntry } from '@/components/clout/AlphaChatWidget'
import type { PoolSide } from '@/lib/clout/payout'

type Props = {
  pool: CloutPoolDetail
  balanceUsdc: number
  chatName: string
  chatMessages: AlphaChatMessage[]
  chatGated: boolean
  currentRoiPercent: number
  requiredRoiPercent: number
  winTicker: WinTickerEntry[]
}

// Server Components can't hand a client component a live closure, so this
// thin client wrapper is where CreatorTradingDashboard's onTrade actually
// gets wired to the real position-placement endpoint — the dashboard itself
// stays a pure, presentational component driven entirely by props.
export default function PoolPageClient(props: Props) {
  const router = useRouter()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleTrade = async ({ side, leverage, wagerUsdc }: { side: PoolSide; leverage: number; wagerUsdc: number }) => {
    setErrorMessage(null)
    try {
      const res = await fetch('/api/clout/positions/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId: props.pool.id,
          side,
          leverage,
          marginAmountUsd: wagerUsdc,
          hasInsurance: false,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMessage(data.error ?? 'Trade failed — please try again.')
        return
      }
      // Re-fetch server data so the pool totals, live payout preview, and
      // wallet balance all reflect the position that was just placed.
      router.refresh()
    } catch {
      setErrorMessage('Network error placing trade — please try again.')
    }
  }

  const handleRequestChatUpgrade = () => {
    document.getElementById('clout-trade-module')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div>
      {errorMessage && (
        <div className="mx-auto max-w-7xl px-4 pt-4 md:px-8">
          <div className="flex items-center justify-between rounded-xl border border-[#FF3B5C]/40 bg-[#FF3B5C]/10 px-4 py-3 text-sm text-[#FF3B5C]">
            <span>{errorMessage}</span>
            <button type="button" onClick={() => setErrorMessage(null)} className="font-bold">
              ✕
            </button>
          </div>
        </div>
      )}
      <CreatorTradingDashboard
        pool={props.pool}
        balanceUsdc={props.balanceUsdc}
        chatName={props.chatName}
        chatMessages={props.chatMessages}
        chatGated={props.chatGated}
        currentRoiPercent={props.currentRoiPercent}
        requiredRoiPercent={props.requiredRoiPercent}
        winTicker={props.winTicker}
        onTrade={handleTrade}
        onRequestChatUpgrade={handleRequestChatUpgrade}
      />
    </div>
  )
}
