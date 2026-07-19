'use client'

import { useState } from 'react'

export type AlphaChatMessage = {
  id: string
  displayName: string
  messageText: string
  createdAt: string
}

export type WinTickerEntry = {
  id: string
  displayName: string
  amountUsdc: number
  poolLabel: string
}

type Props = {
  chatName: string
  messages: AlphaChatMessage[]
  tickerEntries: WinTickerEntry[]
  /** True when the caller has NOT cleared this room's ROI/volume bar. */
  gated: boolean
  currentRoiPercent?: number
  requiredRoiPercent?: number
  onRequestUpgrade?: () => void
  onSendMessage?: (text: string) => void | Promise<void>
}

// The gated Alpha Chat ("Whale Chat") trollbox — mirrors
// clout_grant_chat_access's rejection shape (roi_below_threshold /
// volume_below_threshold) with a locked overlay instead of a bare 403, plus a
// bottom marquee of recent network payouts for ambient FOMO. Reuses the
// existing .animate-ticker keyframe (globals.css) rather than introducing a
// second marquee animation.
export default function AlphaChatWidget({
  chatName,
  messages,
  tickerEntries,
  gated,
  currentRoiPercent = 0,
  requiredRoiPercent = 0,
  onRequestUpgrade,
  onSendMessage,
}: Props) {
  const [draft, setDraft] = useState('')

  const roiGapPercent = Math.max(0, requiredRoiPercent - currentRoiPercent)
  const roiProgressPercent = requiredRoiPercent > 0 ? Math.min(100, (currentRoiPercent / requiredRoiPercent) * 100) : 100

  const send = () => {
    const text = draft.trim()
    if (!text || gated) return
    onSendMessage?.(text)
    setDraft('')
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/70 shadow-xl shadow-black/5 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-violet-500 shadow-[0_0_6px_1px_rgba(139,92,246,0.6)]" />
          <span className="text-sm font-black uppercase tracking-wider text-violet-600">{chatName}</span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-gray-400">Alpha Only</span>
      </div>

      {/* Message feed (relative container so the lock overlay can sit on top) */}
      <div className="relative flex-1 overflow-hidden">
        <div className={`h-full space-y-3 overflow-y-auto px-4 py-3 ${gated ? 'pointer-events-none blur-[2px]' : ''}`}>
          {messages.length === 0 && <p className="text-xs text-gray-400">No messages yet — be the first alpha call.</p>}
          {messages.map((m) => (
            <div key={m.id} className="text-sm">
              <span className="font-bold text-violet-600">{m.displayName}</span>
              <span className="text-gray-300"> · </span>
              <span className="text-gray-600">{m.messageText}</span>
            </div>
          ))}
        </div>

        {gated && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/40 px-6 text-center backdrop-blur-lg">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-b from-gray-100 to-gray-300 shadow-inner shadow-black/10 ring-1 ring-black/10">
              <span className="text-2xl grayscale">🔒</span>
            </div>

            <div className="rounded-xl border border-black/5 bg-white/90 px-4 py-3 shadow-sm">
              <p className="text-sm font-semibold text-gray-800">
                Access Gated: You need <span className="text-amber-600">{roiGapPercent.toFixed(1)}% more</span> 30-day ROI to enter the{' '}
                {chatName}.
              </p>
            </div>

            <div className="w-full max-w-xs">
              <div className="h-2 w-full overflow-hidden rounded-full bg-black/5 ring-1 ring-black/5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all duration-700 ease-out"
                  style={{ width: `${roiProgressPercent}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[10px] text-gray-500">
                <span>{currentRoiPercent.toFixed(1)}%</span>
                <span>{requiredRoiPercent.toFixed(1)}% required</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onRequestUpgrade}
              className="mt-1 rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-violet-700 transition hover:bg-violet-100"
            >
              Wager More to Qualify
            </button>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-black/5 p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            disabled={gated}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder={gated ? 'Locked — clear the ROI bar to chat' : 'Drop some alpha…'}
            className="w-full rounded-lg border border-black/10 bg-gray-50/80 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="button"
            disabled={gated || !draft.trim()}
            onClick={send}
            className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold uppercase text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Send
          </button>
        </div>
      </div>

      {/* Network win ticker */}
      <div className="overflow-hidden border-t border-black/5 bg-gray-50/80 py-2">
        <div className="flex w-max animate-ticker gap-8 whitespace-nowrap">
          {[...tickerEntries, ...tickerEntries].map((entry, i) => (
            <span key={`${entry.id}-${i}`} className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="text-amber-500">⚡</span>
              <span className="text-gray-900">{entry.displayName}</span>
              <span className="text-gray-400">just secured</span>
              <span className="text-emerald-600">+{entry.amountUsdc.toFixed(0)} $CLOUT</span>
              <span className="text-gray-400">on {entry.poolLabel}!</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
