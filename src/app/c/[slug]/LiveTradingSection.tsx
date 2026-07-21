'use client'

import { useLiveTicks } from '@/lib/useLiveTicks'
import StreamEmbed from '@/components/StreamEmbed'
import LiveIndexChart from './LiveIndexChart'
import LeveragePanel from './LeveragePanel'

type Props = {
  creatorId: string
  platform: string | null
  platformId: string | null
  lastVideoId: string | null
  isLive: boolean
  initialIndexPrice: number
  initialTicks: { index_price: number; ts: string }[]
}

// One Realtime subscription shared by the chart and the embed's live badge,
// so opening the panel doesn't spin up duplicate channels.
export default function LiveTradingSection({
  creatorId,
  platform,
  platformId,
  lastVideoId,
  isLive,
  initialIndexPrice,
  initialTicks,
}: Props) {
  const latestTick = useLiveTicks(creatorId)
  const currentPrice = latestTick ? Number(latestTick.index_price) : initialIndexPrice

  return (
    <div className="space-y-3 mb-4">
      <StreamEmbed platform={platform} platformId={platformId} lastVideoId={lastVideoId} isLive={latestTick?.is_live ?? isLive} />

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        <div className="sm:col-span-3 bg-card border border-edge rounded-2xl p-4">
          <LiveIndexChart initialHistory={initialTicks} latestTick={latestTick} fallbackPrice={initialIndexPrice} />
        </div>
        <div className="sm:col-span-2">
          <LeveragePanel creatorId={creatorId} currentPrice={currentPrice} />
        </div>
      </div>
    </div>
  )
}
