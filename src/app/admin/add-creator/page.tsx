'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ImageUpload from '@/components/ImageUpload'

const inputCls = "w-full bg-subtle border border-edge rounded-xl px-4 py-3 text-[#F5F5F0] placeholder-[#8A8A82] focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition text-xs"

export default function AddCreatorPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{ name: string; price: number; slug: string } | null>(null)
  const [form, setForm] = useState({
    displayName: '',
    photoUrl: '',
    platform: 'youtube',
    subscribers: '',
    monthlyViews: '',
    engagementRate: '',
    postFrequency: 'regular',
    monthlyGrowthPercent: '',
  })

  function update(field: string, value: string) { setForm((p) => ({ ...p, [field]: value })) }

  // Live price preview
  const subs = parseInt(form.subscribers) || 0
  const views = parseInt(form.monthlyViews) || 0
  const eng = parseFloat(form.engagementRate) || 0
  const gp = parseFloat(form.monthlyGrowthPercent) || 0
  const fm: Record<string, number> = { regular: 1, rare: 0.8, inactive: 0.6 }
  const gm = gp >= 20 ? 1.5 : gp >= 5 ? 1.2 : gp >= 0 ? 1.0 : 0.7
  const rawBase = (subs * 0.01) + (views * 0.001) + (eng * 100)
  const baseValue = rawBase * (fm[form.postFrequency] ?? 1) * gm
  const previewPrice = subs > 0 ? Math.max(0.01, Math.round((baseValue / 100_000) * 100) / 100) : 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(''); setSuccess(null)
    try {
      const res = await fetch('/api/admin/add-creator', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: form.displayName, photoUrl: form.photoUrl, platform: form.platform,
          subscribers: parseInt(form.subscribers) || 0, monthlyViews: parseInt(form.monthlyViews) || 0,
          engagementRate: parseFloat(form.engagementRate) || 0, postFrequency: form.postFrequency,
          monthlyGrowthPercent: parseFloat(form.monthlyGrowthPercent) || 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed'); return }
      setSuccess({ name: form.displayName, price: data.initialPrice, slug: data.creator.slug })
      setForm({ displayName: '', photoUrl: '', platform: 'youtube', subscribers: '', monthlyViews: '', engagementRate: '', postFrequency: 'regular', monthlyGrowthPercent: '' })
    } catch { setError('Network error') } finally { setLoading(false) }
  }

  const [seeding, setSeeding] = useState(false)
  const [seedResult, setSeedResult] = useState<string | null>(null)

  async function handleSeed() {
    if (!confirm('Seed 8 example gaming creators (Ninja, Pokimane, xQc, etc.)?')) return
    setSeeding(true); setSeedResult(null)
    try {
      const res = await fetch('/api/admin/seed', { method: 'POST' })
      const data = await res.json()
      if (res.ok) { setSeedResult(`Added ${data.results.length} creators!`); router.refresh() }
      else setSeedResult(data.error || 'Failed')
    } catch { setSeedResult('Network error') } finally { setSeeding(false) }
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-bold text-[#F5F5F0]">Add Creator</h1>
        <button onClick={handleSeed} disabled={seeding}
          className="bg-subtle border border-edge text-[#8A8A82] hover:text-accent text-[10px] font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
          {seeding ? 'Seeding…' : '🎮 Seed Gaming Creators'}
        </button>
      </div>
      {seedResult && <p className="text-accent text-xs mb-4 bg-accent/10 border border-accent/20 rounded-lg px-3 py-2">{seedResult}</p>}

      {success && (
        <div className="bg-up/10 border border-up/20 rounded-xl p-4 mb-5">
          <p className="text-up text-xs font-semibold mb-1">✓ {success.name} added!</p>
          <p className="text-[#8A8A82] text-xs">Share price: ${success.price.toFixed(2)} · <Link href={`/c/${success.slug}`} className="text-accent hover:underline">View page →</Link></p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-card border border-edge rounded-2xl p-5 space-y-4">
        {/* Name */}
        <div>
          <label className="block text-[10px] text-[#8A8A82] uppercase tracking-widest mb-1.5">Creator Name *</label>
          <input type="text" value={form.displayName} onChange={(e) => update('displayName', e.target.value)}
            placeholder="e.g. Ninja" required className={inputCls} />
        </div>

        {/* Photo */}
        <ImageUpload label="Photo / Avatar" value={form.photoUrl} onChange={(url) => update('photoUrl', url)} hint="Profile image for the creator card." />

        {/* Platform */}
        <div>
          <label className="block text-[10px] text-[#8A8A82] uppercase tracking-widest mb-1.5">Platform</label>
          <select value={form.platform} onChange={(e) => update('platform', e.target.value)} className={inputCls + ' appearance-none'}>
            <option value="youtube">YouTube</option>
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram</option>
            <option value="twitter">X (Twitter)</option>
            <option value="twitch">Twitch</option>
          </select>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] text-[#8A8A82] uppercase tracking-widest mb-1.5">Subscribers *</label>
            <input type="number" value={form.subscribers} onChange={(e) => update('subscribers', e.target.value)}
              placeholder="500000" min="1" required className={inputCls} />
          </div>
          <div>
            <label className="block text-[10px] text-[#8A8A82] uppercase tracking-widest mb-1.5">Monthly Views</label>
            <input type="number" value={form.monthlyViews} onChange={(e) => update('monthlyViews', e.target.value)}
              placeholder="2000000" min="0" className={inputCls} />
          </div>
          <div>
            <label className="block text-[10px] text-[#8A8A82] uppercase tracking-widest mb-1.5">Engagement Rate</label>
            <input type="number" value={form.engagementRate} onChange={(e) => update('engagementRate', e.target.value)}
              placeholder="0.045" min="0" step="0.001" className={inputCls} />
            <p className="text-[#8A8A82] text-[9px] mt-0.5">Decimal, e.g. 0.045 = 4.5%</p>
          </div>
          <div>
            <label className="block text-[10px] text-[#8A8A82] uppercase tracking-widest mb-1.5">Growth %/month</label>
            <input type="number" value={form.monthlyGrowthPercent} onChange={(e) => update('monthlyGrowthPercent', e.target.value)}
              placeholder="8" step="0.1" className={inputCls} />
          </div>
        </div>

        {/* Frequency */}
        <div>
          <label className="block text-[10px] text-[#8A8A82] uppercase tracking-widest mb-1.5">Post Frequency</label>
          <div className="flex gap-2">
            {(['regular', 'rare', 'inactive'] as const).map((f) => (
              <button key={f} type="button" onClick={() => update('postFrequency', f)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                  form.postFrequency === f ? 'bg-accent/15 text-accent border border-accent/25' : 'bg-subtle border border-edge text-[#8A8A82]'
                }`}>
                {f === 'regular' ? '1+/week' : f === 'rare' ? 'Rarely' : '30d+ ago'}
              </button>
            ))}
          </div>
        </div>

        {/* Price preview */}
        {previewPrice > 0 && (
          <div className="bg-subtle border border-edge rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="text-[#8A8A82] text-[9px] uppercase tracking-widest">Calculated share price</p>
              <p className="text-accent text-lg font-bold">${previewPrice.toFixed(2)} <span className="text-xs font-semibold text-[#8A8A82]">/ share</span></p>
            </div>
            <div className="text-right">
              <p className="text-[#8A8A82] text-[9px]">100,000 total shares</p>
              <p className="text-[#8A8A82] text-[9px]">80,000 public · 20,000 treasury</p>
            </div>
          </div>
        )}

        {error && <p className="text-down text-xs">{error}</p>}

        <button type="submit" disabled={loading || !form.displayName.trim() || subs < 1}
          className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 text-bg font-semibold py-3 rounded-xl transition-colors text-xs">
          {loading ? 'Adding…' : 'Add Creator & Launch Offering'}
        </button>
      </form>
    </div>
  )
}
