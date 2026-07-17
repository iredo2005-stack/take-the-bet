'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type LiveTick = {
  index_price: number
  realtime_metric: number | null
  is_live: boolean
  ts: string
}

// Subscribes to new live_ticks rows for one creator via Supabase Realtime —
// a managed WebSocket pipeline, so the frontend gets each sample pushed the
// moment scripts/liveIngest.mjs inserts it, with no polling/page refresh.
export function useLiveTicks(creatorId: string | null) {
  const [latest, setLatest] = useState<LiveTick | null>(null)

  useEffect(() => {
    if (!creatorId) return
    const supabase = createClient()

    const channel = supabase
      .channel(`live_ticks:${creatorId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'live_ticks', filter: `creator_id=eq.${creatorId}` },
        (payload) => setLatest(payload.new as LiveTick)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [creatorId])

  return latest
}
