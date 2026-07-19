'use client'

import { useEffect, useState } from 'react'

export type CloutEmbedInfo = { platform: string; channelId: string }

export type CloutEmbedCreator = {
  id?: string
  display_name?: string
  embed: CloutEmbedInfo | null
} | null

type Props = {
  poolType: 'single' | 'war'
  creatorA: CloutEmbedCreator
  creatorB?: CloutEmbedCreator
  className?: string
}

// Native <iframe> embed — no Twitch/YouTube JS SDK, no client-side script
// loading. Meant to sit directly above the UP/DOWN trading buttons for a
// pool, so it stays intentionally simple: one stream for a single-creator
// pool, two side-by-side (stacked on mobile) for a Creator Wars pool.
//
// Twitch's embed URL requires a `parent` query param matching the exact
// embedding hostname, which only exists client-side — hence 'use client'
// and a mounted-gate so the iframe never renders with a wrong/missing parent
// during SSR.
function embedSrc(embed: CloutEmbedInfo | null, parentHost: string): string | null {
  if (!embed?.platform || !embed.channelId) return null
  const channelId = encodeURIComponent(embed.channelId)

  if (embed.platform === 'youtube') {
    return `https://www.youtube.com/embed/live_stream?channel=${channelId}&autoplay=0`
  }
  if (embed.platform === 'twitch') {
    return `https://player.twitch.tv/?channel=${channelId}&parent=${encodeURIComponent(parentHost)}&autoplay=false`
  }
  return null
}

function StreamTile({ creator, parentHost }: { creator: CloutEmbedCreator; parentHost: string }) {
  const src = creator ? embedSrc(creator.embed, parentHost) : null

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      {creator?.display_name && (
        <div className="absolute left-2 top-2 z-10 rounded-md bg-black/70 px-2 py-1 text-xs font-semibold text-white">
          {creator.display_name}
        </div>
      )}
      {src ? (
        <iframe
          src={src}
          className="h-full w-full border-0"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
          No live stream configured
        </div>
      )}
    </div>
  )
}

export default function LiveStreamEmbed({ poolType, creatorA, creatorB, className }: Props) {
  const [parentHost, setParentHost] = useState<string | null>(null)

  useEffect(() => {
    setParentHost(window.location.hostname)
  }, [])

  if (!parentHost) {
    return (
      <div className={className}>
        <div className="aspect-video w-full animate-pulse rounded-xl bg-gray-800" />
      </div>
    )
  }

  const isWar = poolType === 'war' && !!creatorB

  return (
    <div className={className}>
      <div className={isWar ? 'grid grid-cols-1 gap-3 md:grid-cols-2' : ''}>
        <StreamTile creator={creatorA} parentHost={parentHost} />
        {isWar && <StreamTile creator={creatorB} parentHost={parentHost} />}
      </div>
    </div>
  )
}
