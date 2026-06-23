'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const inputCls = "w-full bg-subtle border border-edge rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent/30 transition"

export default function CreateBetForm({ creators }: { creators: { id: string; name: string }[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [creatorId, setCreatorId] = useState('')
  const [question, setQuestion] = useState('')
  const [betType, setBetType] = useState<'binary' | 'multi'>('binary')
  const [deadline, setDeadline] = useState('')
  const [outcomes, setOutcomes] = useState(['Yes', 'No'])

  function addOutcome() { setOutcomes([...outcomes, '']) }
  function removeOutcome(i: number) { setOutcomes(outcomes.filter((_, idx) => idx !== i)) }
  function updateOutcome(i: number, v: string) { const o = [...outcomes]; o[i] = v; setOutcomes(o) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/bets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorId, question, betType, deadline, outcomes: outcomes.filter(Boolean) }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed'); return }
      setQuestion(''); setDeadline(''); setOutcomes(betType === 'binary' ? ['Yes', 'No'] : [''])
      router.refresh()
    } catch { setError('Network error') } finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Creator</label>
          <select value={creatorId} onChange={(e) => setCreatorId(e.target.value)} required className={inputCls + ' appearance-none'}>
            <option value="" disabled>Select creator…</option>
            {creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Type</label>
          <select value={betType} onChange={(e) => { const t = e.target.value as 'binary' | 'multi'; setBetType(t); setOutcomes(t === 'binary' ? ['Yes', 'No'] : ['']) }} className={inputCls + ' appearance-none'}>
            <option value="binary">Binary (Yes/No)</option>
            <option value="multi">Multi-range</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Question</label>
        <input type="text" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Will the next video hit 1M views in 48h?" required className={inputCls} />
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Deadline</label>
        <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} required className={inputCls} />
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Outcomes</label>
        <div className="space-y-2">
          {outcomes.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input type="text" value={o} onChange={(e) => updateOutcome(i, e.target.value)}
                placeholder={betType === 'binary' ? (i === 0 ? 'Yes' : 'No') : `Range ${i + 1} (e.g. 0-500K)`}
                disabled={betType === 'binary'} className={inputCls} />
              {betType === 'multi' && outcomes.length > 2 && (
                <button type="button" onClick={() => removeOutcome(i)} className="text-gray-500 hover:text-down text-sm px-2">✕</button>
              )}
            </div>
          ))}
          {betType === 'multi' && (
            <button type="button" onClick={addOutcome} className="text-accent text-xs hover:underline">+ Add outcome</button>
          )}
        </div>
      </div>

      {error && <p className="text-down text-sm">{error}</p>}
      <button type="submit" disabled={loading || !creatorId || !question || !deadline}
        className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-bg font-semibold py-2.5 px-6 rounded-xl transition-colors text-sm">
        {loading ? 'Creating…' : 'Create Bet'}
      </button>
    </form>
  )
}
