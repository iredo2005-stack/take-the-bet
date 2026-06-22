'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ImageUpload from '@/components/ImageUpload'
import { PLATFORMS, PLATFORM_KEYS, formatFollowers, type PlatformKey } from '@/lib/platforms'

const inputCls = "w-full bg-subtle border border-edge rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition"

export default function BecomeCreatorPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ displayName: '', bio: '', photoUrl: '', platform: '' as PlatformKey | '', declaredFollowers: '', profileUrl: '' })
  function update(field: string, value: string) { setForm((p) => ({ ...p, [field]: value })) }

  const sp = form.platform ? PLATFORMS[form.platform] : null
  const fc = parseInt(form.declaredFollowers) || 0
  const meets = sp ? fc >= sp.min : false
  const valid = form.displayName.trim() && form.photoUrl && form.platform && fc > 0 && form.profileUrl.trim()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); if (!valid) return; setLoading(true); setError('')
    try {
      const res = await fetch('/api/creators', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: form.displayName, bio: form.bio, photoUrl: form.photoUrl, platform: form.platform, declaredFollowers: fc, profileUrl: form.profileUrl }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong'); return }
      router.push('/dashboard'); router.refresh()
    } catch { setError('Network error.') } finally { setLoading(false) }
  }

  return (
    <div className="max-w-lg mx-auto">
      <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm mb-6 inline-block">← Back to dashboard</Link>
      <div className="bg-card border border-edge rounded-2xl p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-white mb-2">Apply to be a Creator</h1>
        <p className="text-gray-400 text-sm mb-6">Applications are reviewed manually. You must have a real audience above the minimum threshold.</p>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Primary platform <span className="text-down">*</span></label>
            <select value={form.platform} onChange={(e) => update('platform', e.target.value)} required className={inputCls + ' appearance-none'}>
              <option value="" disabled>Select platform…</option>
              {PLATFORM_KEYS.map((k) => <option key={k} value={k}>{PLATFORMS[k].label} (min {formatFollowers(PLATFORMS[k].min)} {PLATFORMS[k].unit})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Your {sp?.unit || 'follower'} count <span className="text-down">*</span></label>
            <input type="number" value={form.declaredFollowers} onChange={(e) => update('declaredFollowers', e.target.value)} placeholder={sp ? `Min ${sp.min.toLocaleString()}` : 'Select platform first'} min="1" required className={inputCls} />
            {sp && fc > 0 && !meets && <p className="text-down text-xs mt-1.5">Minimum {sp.min.toLocaleString()} {sp.unit} required for {sp.label}.</p>}
            {sp && meets && <p className="text-up text-xs mt-1.5">✓ Meets the {sp.label} threshold</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Public profile link <span className="text-down">*</span></label>
            <input type="url" value={form.profileUrl} onChange={(e) => update('profileUrl', e.target.value)} placeholder={sp?.placeholder || 'https://...'} required className={inputCls} />
            <p className="text-gray-600 text-xs mt-1">We&apos;ll review this to verify your audience.</p>
          </div>
          <div className="border-t border-edge pt-5"><p className="text-gray-500 text-xs mb-4 uppercase tracking-wide font-medium">Profile info</p></div>
          <ImageUpload label="Profile photo" value={form.photoUrl} onChange={(url) => update('photoUrl', url)} required hint="Your public profile photo." />
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Display name <span className="text-down">*</span></label>
            <input type="text" value={form.displayName} onChange={(e) => update('displayName', e.target.value)} placeholder="Your public name" maxLength={50} required className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Bio / Story</label>
            <textarea value={form.bio} onChange={(e) => update('bio', e.target.value)} placeholder="Tell us about your content..." rows={3} maxLength={500} className={inputCls + ' resize-none'} />
          </div>
          {error && <p className="text-down text-sm bg-down/10 border border-down/20 rounded-lg px-4 py-2">{error}</p>}
          <button type="submit" disabled={loading || !valid || !meets} className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors">{loading ? 'Submitting…' : 'Submit Application →'}</button>
          <p className="text-center text-xs text-gray-600">Applications are reviewed within 24–48 hours.</p>
        </form>
      </div>
    </div>
  )
}
