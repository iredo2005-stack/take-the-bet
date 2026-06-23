'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ResolveButton({ betId, outcomes }: { betId: string; outcomes: { id: string; label: string }[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(false)

  async function resolve() {
    if (!selected) { alert('Select a winning outcome first'); return }
    if (!confirm(`Resolve this bet? Winner: "${outcomes.find((o) => o.id === selected)?.label}". This cannot be undone.`)) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/bets/${betId}/resolve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winningOutcomeId: selected }),
      })
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Failed'); return }
      router.refresh()
    } catch { alert('Network error') } finally { setLoading(false) }
  }

  return (
    <div className="flex items-center gap-2">
      <select value={selected} onChange={(e) => setSelected(e.target.value)}
        className="bg-subtle border border-edge rounded-lg px-3 py-1.5 text-sm text-white appearance-none flex-1">
        <option value="">Select winner…</option>
        {outcomes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <button onClick={resolve} disabled={loading || !selected}
        className="bg-up hover:brightness-110 disabled:opacity-40 text-white font-semibold text-sm px-4 py-1.5 rounded-lg transition-all">
        {loading ? '…' : 'Resolve'}
      </button>
    </div>
  )
}
