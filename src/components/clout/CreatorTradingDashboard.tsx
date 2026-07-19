'use client'

import LiveStreamEmbed from './LiveStreamEmbed'
import CloutMeter from './CloutMeter'
import TradeModule, { type TradeModulePool } from './TradeModule'
import AlphaChatWidget, { type AlphaChatMessage, type WinTickerEntry } from './AlphaChatWidget'
import type { PoolSide } from '@/lib/clout/payout'
import type { CloutPoolDetailData } from '@/lib/clout/poolDetail'

// Re-exported so callers (the pool page, its client wrapper) can import one
// type from here instead of reaching into lib/clout/poolDetail directly.
// This is the exact shape fetchCloutPoolDetail() produces — the same helper
// both GET /api/clout/pools/[id] and the server-rendered pool page use — so
// this component, the API, and the page can never drift on what a "pool"
// looks like.
export type CloutPoolDetail = CloutPoolDetailData

type Props = {
  pool: CloutPoolDetail
  balanceUsdc?: number
  chatName?: string
  chatMessages?: AlphaChatMessage[]
  chatGated?: boolean
  currentRoiPercent?: number
  requiredRoiPercent?: number
  winTicker?: WinTickerEntry[]
  onRequestChatUpgrade?: () => void
  onSendChatMessage?: (text: string) => void | Promise<void>
  onTrade?: (params: { side: PoolSide; leverage: number; wagerUsdc: number }) => void | Promise<void>
}

// The main Creator Trading Dashboard — a light, frosted-glass Web3 terminal
// shell composing the live media grid, the CLOUT Meter, the Trade Module,
// and the gated Alpha Chat sidebar. Every sub-panel is presentational and
// receives its slice of `pool` as narrow, typed props — this component's
// only job is layout + mapping the API response onto them.
export default function CreatorTradingDashboard({
  pool,
  balanceUsdc,
  chatName = 'Whale Chat',
  chatMessages = [],
  chatGated = true,
  currentRoiPercent = 0,
  requiredRoiPercent = 15,
  winTicker = [],
  onRequestChatUpgrade,
  onSendChatMessage,
  onTrade,
}: Props) {
  const isWar = pool.poolType === 'war' && !!pool.creatorB

  const tradeModulePool: TradeModulePool = {
    upPoolUsdc: pool.upPoolUsdc,
    downPoolUsdc: pool.downPoolUsdc,
    rakeBps: pool.rakeBps,
    upSideNotionalUsdc: pool.upSideNotionalUsdc,
    downSideNotionalUsdc: pool.downSideNotionalUsdc,
  }

  return (
    <div className="min-h-screen w-full bg-[#F9FAFB] bg-[radial-gradient(ellipse_at_20%_0%,rgba(199,184,255,0.25)_0%,transparent_50%),radial-gradient(ellipse_at_80%_10%,rgba(16,185,129,0.10)_0%,transparent_50%)] px-4 py-6 text-gray-900 md:px-8">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        {/* Main column */}
        <div className="flex flex-col gap-6">
          {/* 1. Live Media Grid */}
          <LiveStreamEmbed
            poolType={pool.poolType}
            creatorA={pool.creatorA}
            creatorB={pool.creatorB}
          />

          {/* Pool header strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            <span>
              {isWar ? `${pool.creatorA?.display_name} vs ${pool.creatorB?.display_name}` : pool.creatorA?.display_name} ·{' '}
              {pool.windowLabel}
            </span>
            <span className="text-violet-500">{pool.metricType}</span>
          </div>

          {/* 2. Gamified Momentum Gauge */}
          {isWar ? (
            <CloutMeter
              poolType="war"
              creatorAName={pool.creatorA?.display_name ?? 'Creator A'}
              creatorBName={pool.creatorB?.display_name ?? 'Creator B'}
              shareAPercent={
                pool.currentMetricA != null && pool.currentMetricB != null && pool.currentMetricA + pool.currentMetricB > 0
                  ? (pool.currentMetricA / (pool.currentMetricA + pool.currentMetricB)) * 100
                  : 50
              }
              baselineSharePercent={(pool.baselineShareA ?? 0.5) * 100}
            />
          ) : (
            <CloutMeter
              poolType="single"
              metricLabel={pool.metricType}
              currentMetric={pool.currentMetric ?? pool.baselineMetric}
              baselineMetric={pool.baselineMetric}
            />
          )}

          {/* 3. Quick-Action Trade Module */}
          <div id="clout-trade-module">
            <TradeModule pool={tradeModulePool} balanceUsdc={balanceUsdc} onSubmit={onTrade} />
          </div>
        </div>

        {/* 4. Gated Alpha Chat sidebar */}
        <div className="h-[600px] lg:h-auto">
          <AlphaChatWidget
            chatName={chatName}
            messages={chatMessages}
            tickerEntries={winTicker}
            gated={chatGated}
            currentRoiPercent={currentRoiPercent}
            requiredRoiPercent={requiredRoiPercent}
            onRequestUpgrade={onRequestChatUpgrade}
            onSendMessage={onSendChatMessage}
          />
        </div>
      </div>
    </div>
  )
}
