'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'

type Props = {
  balance: number
}

export default function WalletPanel({ balance }: Props) {
  const router = useRouter()
  const [depositAmount, setDepositAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [showDeposit, setShowDeposit] = useState(false)
  const [result, setResult] = useState<{ credited: number; moonpayFee: number; newBalance: number } | null>(null)
  const [error, setError] = useState('')

  const amount = parseFloat(depositAmount) || 0
  const moonpayFee = Math.round(amount * 0.04 * 100) / 100
  const credited = Math.round((amount - moonpayFee) * 100) / 100

  async function handleDeposit() {
    if (amount < 1) return
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const res = await fetch('/api/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Deposit failed'); return }
      setResult(data)
      setDepositAmount('')
      router.refresh()
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  const moonpayKey = process.env.NEXT_PUBLIC_MOONPAY_API_KEY

  function openMoonPay() {
    if (moonpayKey) {
      window.open(
        `https://buy.moonpay.com?apiKey=${moonpayKey}&currencyCode=usdc&baseCurrencyAmount=${amount || 100}`,
        '_blank',
        'width=500,height=700'
      )
    }
  }

  return (
    <div className="bg-card border border-edge rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Balance</p>
          <p className="text-white text-2xl font-bold">{formatCurrency(balance)}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowDeposit(!showDeposit); setResult(null) }}
            className="bg-up text-white font-semibold text-sm px-4 py-2 rounded-lg hover:brightness-110 transition-all"
          >
            Deposit
          </button>
          <button
            onClick={() => moonpayKey ? openMoonPay() : alert('MoonPay not configured. Add NEXT_PUBLIC_MOONPAY_API_KEY to .env.local')}
            className="bg-subtle border border-edge text-gray-300 font-semibold text-sm px-4 py-2 rounded-lg hover:bg-muted transition-colors"
          >
            Withdraw
          </button>
        </div>
      </div>

      {showDeposit && (
        <div className="border-t border-edge pt-4 space-y-3">
          {result ? (
            <div className="bg-up/10 border border-up/20 rounded-xl p-3 text-sm">
              <p className="text-up font-medium mb-1">Deposit successful!</p>
              <p className="text-gray-400">Credited: <span className="text-white">{formatCurrency(result.credited)}</span> (after {formatCurrency(result.moonpayFee)} MoonPay fee)</p>
              <p className="text-gray-400">New balance: <span className="text-white font-semibold">{formatCurrency(result.newBalance)}</span></p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Amount (USD)</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="100.00"
                      min="1"
                      step="0.01"
                      className="w-full bg-subtle border border-edge rounded-lg pl-7 pr-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-accent/30 transition"
                    />
                  </div>
                  <button
                    onClick={handleDeposit}
                    disabled={loading || amount < 1}
                    className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
                  >
                    {loading ? '...' : 'Add funds'}
                  </button>
                </div>
              </div>

              {amount > 0 && (
                <div className="bg-subtle rounded-lg p-2.5 text-xs space-y-1">
                  <div className="flex justify-between text-gray-400">
                    <span>You pay</span>
                    <span className="text-gray-300">{formatCurrency(amount)}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>MoonPay fee (~4%)</span>
                    <span className="text-down">-{formatCurrency(moonpayFee)}</span>
                  </div>
                  <div className="flex justify-between text-gray-300 font-medium border-t border-edge pt-1">
                    <span>You receive</span>
                    <span className="text-white">{formatCurrency(credited)}</span>
                  </div>
                </div>
              )}

              {moonpayKey && amount >= 1 && (
                <button
                  onClick={openMoonPay}
                  className="w-full bg-subtle border border-edge text-gray-400 hover:text-white text-xs py-2 rounded-lg transition-colors"
                >
                  Pay with card via MoonPay →
                </button>
              )}

              {error && <p className="text-down text-xs">{error}</p>}
              <p className="text-gray-600 text-xs">Demo mode: deposits are instant. In production, funds arrive after MoonPay confirmation.</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
