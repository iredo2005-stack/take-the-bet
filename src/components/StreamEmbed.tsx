'use client'

import { useEffect, useId, useRef, useState } from 'react'

type Props = {
  platform: string | null
  platformId: string | null // Twitch channel login
  lastVideoId: string | null // YouTube video id (VOD or current live broadcast)
  isLive: boolean
}

declare global {
  interface Window {
    Twitch?: { Embed: new (elementId: string, options: Record<string, unknown>) => { destroy?: () => void } }
    YT?: { Player: new (el: HTMLElement | string, options: Record<string, unknown>) => { destroy?: () => void } }
    onYouTubeIframeAPIReady?: () => void
  }
}

let twitchScriptPromise: Promise<void> | null = null
function loadTwitchScript(): Promise<void> {
  if (window.Twitch) return Promise.resolve()
  if (twitchScriptPromise) return twitchScriptPromise
  twitchScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://player.twitch.tv/js/embed/v1.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Twitch embed script'))
    document.head.appendChild(script)
  })
  return twitchScriptPromise
}

let youtubeScriptPromise: Promise<void> | null = null
function loadYouTubeScript(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve()
  if (youtubeScriptPromise) return youtubeScriptPromise
  youtubeScriptPromise = new Promise((resolve) => {
    const prevCallback = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prevCallback?.()
      resolve()
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    document.head.appendChild(script)
  })
  return youtubeScriptPromise
}

// Twitch/YouTube Embed Integration — loads the active stream dynamically for
// whichever creator profile is being viewed. Twitch needs the exact page
// hostname as `parent`, which only exists client-side, hence 'use client'.
export default function StreamEmbed({ platform, platformId, lastVideoId, isLive }: Props) {
  const rawId = useId()
  const twitchElementId = `twitch-embed-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`
  const containerRef = useRef<HTMLDivElement>(null)
  const embedRef = useRef<{ destroy?: () => void } | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!mounted || !containerRef.current) return
    containerRef.current.innerHTML = ''
    let cancelled = false

    if (platform === 'twitch' && platformId) {
      loadTwitchScript()
        .then(() => {
          if (cancelled || !containerRef.current || !window.Twitch) return
          embedRef.current = new window.Twitch.Embed(twitchElementId, {
            width: '100%',
            height: '100%',
            channel: platformId,
            parent: [window.location.hostname],
            layout: 'video',
            autoplay: false,
          })
        })
        .catch(() => {})
    } else if (platform === 'youtube' && lastVideoId) {
      loadYouTubeScript()
        .then(() => {
          if (cancelled || !containerRef.current || !window.YT) return
          embedRef.current = new window.YT.Player(containerRef.current, {
            videoId: lastVideoId,
            playerVars: { autoplay: 0, rel: 0 },
          })
        })
        .catch(() => {})
    }

    return () => {
      cancelled = true
      try {
        embedRef.current?.destroy?.()
      } catch {}
      embedRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, platform, platformId, lastVideoId])

  const hasEmbed = (platform === 'twitch' && !!platformId) || (platform === 'youtube' && !!lastVideoId)

  if (!hasEmbed) {
    return (
      <div className="aspect-video w-full rounded-xl bg-card border border-edge flex items-center justify-center">
        <p className="text-[#707A8A] text-xs">No live stream connected for this creator yet.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden border border-edge bg-black relative">
      {isLive && (
        <span className="absolute top-2 left-2 z-10 bg-down text-white text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide">
          ● Live
        </span>
      )}
      <div ref={containerRef} id={twitchElementId} className="aspect-video w-full" />
    </div>
  )
}
