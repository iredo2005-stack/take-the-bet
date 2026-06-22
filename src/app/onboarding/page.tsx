'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const currentYear = new Date().getFullYear()
const years = Array.from({ length: 100 }, (_, i) => currentYear - i)
const months = [
  { value: '01', label: 'January' }, { value: '02', label: 'February' },
  { value: '03', label: 'March' }, { value: '04', label: 'April' },
  { value: '05', label: 'May' }, { value: '06', label: 'June' },
  { value: '07', label: 'July' }, { value: '08', label: 'August' },
  { value: '09', label: 'September' }, { value: '10', label: 'October' },
  { value: '11', label: 'November' }, { value: '12', label: 'December' },
]

function daysInMonth(month: string, year: string): number {
  if (!month || !year) return 31
  return new Date(parseInt(year), parseInt(month), 0).getDate()
}

const selectCls = "flex-1 bg-subtle border border-edge rounded-xl px-3 py-3 text-white focus:outline-none focus:ring-2 focus:ring-accent/30 transition appearance-none"

export default function OnboardingPage() {
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [day, setDay] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const maxDays = daysInMonth(month, year)
  const days = Array.from({ length: maxDays }, (_, i) => i + 1)
  const isComplete = year && month && day

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isComplete) return
    setLoading(true)
    setError('')
    const dob = `${year}-${month}-${day.padStart(2, '0')}`
    try {
      const res = await fetch('/api/auth/verify-age', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateOfBirth: dob }),
      })
      const data = await res.json()
      if (data.blocked) { router.push('/onboarding/blocked'); return }
      if (data.success) { router.push('/dashboard'); return }
      setError(data.error || 'Something went wrong. Please try again.')
    } catch { setError('Network error. Please try again.') }
    finally { setLoading(false) }
  }

  return (
    <main className="min-h-screen bg-bg flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <a href="/" className="text-white font-bold text-xl tracking-tight">Take The Bet</a>
        </div>

        <div className="bg-card rounded-2xl border border-edge p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent/10 border border-accent/20 mb-4">
              <span className="text-2xl">🔐</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Age Verification</h1>
            <p className="text-gray-400 text-sm leading-relaxed">
              Take The Bet is a real-money financial platform. You must be <strong className="text-white">18 or older</strong>.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Date of birth</label>
              <div className="flex gap-2">
                <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectCls}>
                  <option value="" disabled>Month</option>
                  {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <select value={day} onChange={(e) => setDay(e.target.value)} className={selectCls} style={{ maxWidth: '5rem' }}>
                  <option value="" disabled>Day</option>
                  {days.map((d) => <option key={d} value={String(d)}>{d}</option>)}
                </select>
                <select value={year} onChange={(e) => setYear(e.target.value)} className={selectCls}>
                  <option value="" disabled>Year</option>
                  {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
                </select>
              </div>
            </div>

            {error && <p className="text-down text-sm bg-down/10 border border-down/20 rounded-lg px-4 py-2">{error}</p>}

            <button type="submit" disabled={!isComplete || loading}
              className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors">
              {loading ? 'Verifying…' : 'Continue →'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-600 mt-5">Your date of birth is used only for age verification and is never shown publicly.</p>
        </div>
      </div>
    </main>
  )
}
