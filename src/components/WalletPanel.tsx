'use client'

import { formatNumber } from '@/lib/utils'

export default function WalletPanel({ balance }: { balance: number }) {
  return (
    <div className="bg-card border border-edge rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[#8A8A82] text-[10px] uppercase tracking-widest mb-1">Play Balance</p>
          <p className="text-accent text-xl font-bold">{formatNumber(Math.round(balance))} <span className="text-sm font-semibold">HC</span></p>
        </div>
        <div className="bg-accent/10 border border-accent/20 rounded-lg px-3 py-1.5">
          <p className="text-accent text-[10px] font-semibold">Hype Coins</p>
        </div>
      </div>
      <p className="text-[#8A8A82] text-[10px] mt-2">Virtual play money — no real money involved.</p>
    </div>
  )
}
