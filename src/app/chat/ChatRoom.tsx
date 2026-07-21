'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Tier } from '@/lib/roomTiers'

type Message = { id: string; display_name: string; body: string; created_at: string }

type Props = { tier: Tier; token: string; onTokenExpired: () => void }

export default function ChatRoom({ tier, token, onTokenExpired }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/chat/${tier}?token=${encodeURIComponent(token)}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return
        if (!ok) {
          if (data.error === 'token_expired') onTokenExpired()
          setError(data.error || 'Could not load messages')
          return
        }
        setMessages(data.messages || [])
      })
      .catch(() => !cancelled && setError('Network error. Try again.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, token])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`chat_messages:${tier}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `tier=eq.${tier}` },
        (payload) => {
          const incoming = payload.new as Message
          setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tier])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setError('')
    try {
      const res = await fetch(`/api/chat/${tier}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, body }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error === 'token_expired') onTokenExpired()
        setError(data.error || 'Message failed to send')
        return
      }
      setDraft('')
      setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]))
    } catch {
      setError('Network error. Try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-card border border-edge rounded-2xl flex flex-col h-[420px]">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && <p className="text-[#707A8A] text-xs text-center py-8">Loading room…</p>}
        {!loading && messages.length === 0 && <p className="text-[#707A8A] text-xs text-center py-8">No messages yet — say hi.</p>}
        {messages.map((m) => (
          <div key={m.id} className="text-xs">
            <span className="font-semibold text-accent">{m.display_name}</span>
            <span className="text-[#707A8A] ml-1.5">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <p className="text-[#1E2329] mt-0.5">{m.body}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <p className="text-down text-[11px] px-3 pb-1">{error}</p>}

      <div className="flex items-center gap-2 p-3 border-t border-edge">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          maxLength={500}
          placeholder="Message this room…"
          className="flex-1 bg-subtle border border-edge rounded-lg px-3 py-2 text-xs text-[#1E2329] focus:outline-none focus:ring-2 focus:ring-accent/30 transition"
        />
        <button
          onClick={send}
          disabled={sending || !draft.trim()}
          className="bg-accent text-bg text-xs font-semibold px-3 py-2 rounded-lg hover:brightness-110 transition disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  )
}
