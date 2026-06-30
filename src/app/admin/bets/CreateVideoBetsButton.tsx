'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CreateVideoBetsButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handle() {
    if (!confirm('Auto-create tiered video bets for all YouTube creators (using their latest video)?')) return
    setLoading(true); setResult(null)
    try {
      const res = await fetch('/api/admin/video-bets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hours: 48 }) })
      const data = await res.json()
      if (res.ok) {
        const created = data.results?.filter((r: any) => r.status === 'created').length ?? 0
        const skipped = data.results?.filter((r: any) => r.status === 'skipped').length ?? 0
        const failed = data.results?.filter((r: any) => r.status === 'failed').length ?? 0
        setResult(`Created ${created} · Skipped ${skipped} · Failed ${failed}`)
        router.refresh()
      } else {
        setResult(data.error || 'Failed')
      }
    } catch { setResult('Network error') }
    finally { setLoading(false) }
  }

  return (
    <div className="text-right">
      <button
        onClick={handle}
        disabled={loading}
        className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-bg font-semibold text-xs px-4 py-2 rounded-lg transition-colors"
      >
        {loading ? 'Creating…' : '🎬 Auto-Create Video Bets'}
      </button>
      {result && <p className="text-accent text-[10px] mt-1">{result}</p>}
    </div>
  )
}
