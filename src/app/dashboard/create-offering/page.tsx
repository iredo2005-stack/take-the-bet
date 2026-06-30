'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import ImageUpload from '@/components/ImageUpload'

const inputCls = "w-full bg-subtle border border-edge rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition"

export default function CreateOfferingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ title: '', description: '', imageUrl: '', totalShares: '', initialPrice: '' })
  function update(field: string, value: string) { setForm((p) => ({ ...p, [field]: value })) }

  const ts = parseInt(form.totalShares) || 0, ip = parseFloat(form.initialPrice) || 0
  const tv = ts * ip, comm = tv * 0.02
  const valid = form.title.trim() && form.description.trim() && form.imageUrl && ts > 0 && ip > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const res = await fetch('/api/offerings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: form.title, description: form.description, imageUrl: form.imageUrl, totalShares: ts, initialPrice: ip }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong'); return }
      router.push('/dashboard'); router.refresh()
    } catch { setError('Network error.') } finally { setLoading(false) }
  }

  return (
    <div className="max-w-lg mx-auto">
      <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm mb-6 inline-block">← Back to dashboard</Link>
      <div className="bg-card border border-edge rounded-2xl p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-white mb-2">Create Offering</h1>
        <p className="text-gray-400 text-sm mb-6">Launch shares for your fans to buy. All fields are required.</p>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div><label className="block text-sm font-medium text-gray-300 mb-1.5">Offering title <span className="text-down">*</span></label>
            <input type="text" value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="e.g. Series A Shares" maxLength={80} required className={inputCls} /></div>
          <ImageUpload label="Cover image" value={form.imageUrl} onChange={(url) => update('imageUrl', url)} required hint="This image appears on your offering page." />
          <div><label className="block text-sm font-medium text-gray-300 mb-1.5">Bio / Story <span className="text-down">*</span></label>
            <textarea value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="Why should fans buy these shares?" rows={4} maxLength={500} required className={inputCls + ' resize-none'} />
            <p className="text-[#8A8A82] text-xs mt-1 text-right">{form.description.length}/500</p></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-300 mb-1.5">Price per share <span className="text-down">*</span></label>
              <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input type="number" value={form.initialPrice} onChange={(e) => update('initialPrice', e.target.value)} placeholder="1.00" min="0.01" step="0.01" required className={inputCls + ' pl-7'} /></div></div>
            <div><label className="block text-sm font-medium text-gray-300 mb-1.5">Total shares <span className="text-down">*</span></label>
              <input type="number" value={form.totalShares} onChange={(e) => update('totalShares', e.target.value)} placeholder="10,000" min="1" step="1" required className={inputCls} /></div>
          </div>
          {ts > 0 && ip > 0 && (
            <div className="bg-subtle rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between text-gray-400"><span>Total offering value</span><span className="text-white font-semibold">{formatCurrency(tv)}</span></div>
              <div className="flex justify-between text-gray-400"><span>Platform commission (5% on initial)</span><span className="text-down">{formatCurrency(comm)}</span></div>
              <div className="border-t border-edge pt-2 flex justify-between text-gray-400"><span>You receive</span><span className="text-up font-semibold">{formatCurrency(tv - comm)}</span></div>
            </div>
          )}
          {error && <p className="text-down text-sm bg-down/10 border border-down/20 rounded-lg px-4 py-2">{error}</p>}
          <button type="submit" disabled={loading || !valid} className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 text-bg font-semibold py-3 rounded-xl transition-colors">{loading ? 'Creating…' : 'Launch Offering →'}</button>
          <p className="text-center text-xs text-[#8A8A82]">The offering goes live immediately.</p>
        </form>
      </div>
    </div>
  )
}
