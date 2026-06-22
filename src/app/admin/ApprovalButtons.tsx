'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ApprovalButtons({ creatorId }: { creatorId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)

  async function handleAction(action: 'approved' | 'rejected') {
    setLoading(action === 'approved' ? 'approve' : 'reject')
    try {
      const res = await fetch(`/api/admin/creators/${creatorId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: action }) })
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Action failed'); return }
      router.refresh()
    } catch { alert('Network error') } finally { setLoading(null) }
  }

  return (
    <div className="flex gap-3">
      <button onClick={() => handleAction('approved')} disabled={loading !== null}
        className="flex-1 bg-up hover:brightness-110 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-all text-sm">
        {loading === 'approve' ? 'Approving…' : '✓ Approve'}
      </button>
      <button onClick={() => handleAction('rejected')} disabled={loading !== null}
        className="flex-1 bg-subtle hover:bg-down/20 border border-edge hover:border-down/30 disabled:opacity-50 text-gray-300 hover:text-down font-semibold py-2.5 rounded-xl transition-all text-sm">
        {loading === 'reject' ? 'Rejecting…' : '✗ Reject'}
      </button>
    </div>
  )
}
