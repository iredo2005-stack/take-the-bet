'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ProfileSetup({ currentUsername, profilePublic }: { currentUsername: string | null; profilePublic: boolean }) {
  const router = useRouter()
  const [username, setUsername] = useState(currentUsername || '')
  const [isPublic, setIsPublic] = useState(profilePublic)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setLoading(true); setError(''); setSaved(false)
    try {
      const res = await fetch('/api/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.toLowerCase().trim(), profilePublic: isPublic }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed'); return }
      setSaved(true); router.refresh()
      setTimeout(() => setSaved(false), 2000)
    } catch { setError('Network error') } finally { setLoading(false) }
  }

  return (
    <div className="bg-card border border-edge rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white text-sm font-semibold">Your Profile</h3>
        {currentUsername && (
          <Link href={`/trader/${currentUsername}`} className="text-accent text-xs hover:underline">View public profile →</Link>
        )}
      </div>
      <div className="flex gap-2 mb-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">@</span>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30))}
            placeholder="choose-username"
            className="w-full bg-subtle border border-edge rounded-lg pl-7 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-accent/30 transition" />
        </div>
        <button onClick={handleSave} disabled={loading || username.length < 3}
          className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-white font-semibold text-xs px-4 py-2 rounded-lg transition-colors">
          {loading ? '…' : saved ? '✓' : 'Save'}
        </button>
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isPublic} onChange={(e) => { setIsPublic(e.target.checked); setSaved(false) }}
            className="w-3.5 h-3.5 rounded border-edge bg-subtle accent-accent" />
          <span className="text-gray-400 text-xs">Public profile</span>
        </label>
        {error && <p className="text-down text-xs">{error}</p>}
      </div>
    </div>
  )
}
