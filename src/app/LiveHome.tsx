'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'

type FeedItem = { id: string; type: string; text: string; time: string }
type TickerItem = { name: string; slug: string; price: number; change: number }

export default function LiveHome({ initialFeed, initialTicker }: { initialFeed: FeedItem[]; initialTicker: TickerItem[] }) {
  const [feed, setFeed] = useState(initialFeed)
  const [ticker, setTicker] = useState(initialTicker)

  // Poll for new activity every 15s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/activity')
        if (res.ok) {
          const data = await res.json()
          setFeed(data.feed)
          setTicker(data.ticker)
        }
      } catch {}
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  return (
    <>
      {/* Ticker bar */}
      {ticker.length > 0 && (
        <div className="border-b border-edge overflow-hidden bg-card/50">
          <div className="animate-ticker flex whitespace-nowrap py-2">
            {[...ticker, ...ticker].map((t, i) => (
              <Link key={`${t.slug}-${i}`} href={`/c/${t.slug}`} className="inline-flex items-center gap-2 px-4 text-[11px] hover:text-accent transition-colors">
                <span className="text-[#F5F5F0] font-semibold">{t.name}</span>
                <span className="text-[#F5F5F0] font-mono">{formatCurrency(t.price)}</span>
                <span className={`font-bold ${t.change >= 0 ? 'text-up' : 'text-down'}`}>
                  {t.change >= 0 ? '▲' : '▼'}{Math.abs(t.change).toFixed(1)}%
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center px-5 pt-8 sm:pt-14">
        <div className="max-w-lg w-full">
          {/* Hero */}
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-[#F5F5F0] leading-[1.1] mb-3 tracking-tight">
              The stock market<br /><span className="text-accent">for creators.</span>
            </h1>
            <p className="text-[#8A8A82] text-sm leading-relaxed max-w-sm mx-auto">
              Invest in creators early. Prices follow real growth — subscribers, views, and momentum. Profit when you spot winners.
            </p>
            <div className="inline-flex items-center gap-1.5 bg-card border border-edge text-[#8A8A82] text-[10px] font-medium px-2.5 py-1 rounded-full mt-4">
              🎮 Virtual trading game — no real money involved
            </div>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-2.5 justify-center mb-10">
            <Link href="/sign-up" className="bg-accent hover:bg-accent-hover text-bg font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors text-center">
              Start trading
            </Link>
            <Link href="/sign-in" className="bg-card hover:bg-subtle border border-edge text-[#F5F5F0] font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors text-center">
              I have an account
            </Link>
          </div>

          {/* Live stats */}
          <div className="flex items-center justify-center gap-6 mb-10 text-xs">
            <div className="text-center">
              <div className="text-accent font-bold text-sm">10K HC</div>
              <div className="text-[#8A8A82] text-[10px]">free to start</div>
            </div>
            <div className="w-px h-6 bg-edge" />
            <div className="text-center">
              <div className="text-accent font-bold text-sm">5%</div>
              <div className="text-[#8A8A82] text-[10px]">commission</div>
            </div>
            <div className="w-px h-6 bg-edge" />
            <div className="text-center">
              <div className="text-accent font-bold text-sm">18+</div>
              <div className="text-[#8A8A82] text-[10px]">verified</div>
            </div>
          </div>

          {/* Live activity feed */}
          {feed.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-1.5 h-1.5 bg-up rounded-full animate-pulse-gold" />
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#8A8A82]">Live Activity</h2>
              </div>
              <div className="bg-card border border-edge rounded-xl overflow-hidden divide-y divide-edge/50">
                {feed.slice(0, 6).map((item, i) => (
                  <div key={item.id} className="animate-slide-in px-3.5 py-2.5 flex items-center gap-2.5" style={{ animationDelay: `${i * 80}ms` }}>
                    <span className="text-xs flex-shrink-0">
                      {item.type === 'buy' ? '🟢' : '🎲'}
                    </span>
                    <p className="text-[11px] text-[#F5F5F0] truncate flex-1">{item.text}</p>
                    <span className="text-[9px] text-[#8A8A82] flex-shrink-0">{timeAgo(item.time)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trending creators */}
          {ticker.length > 0 && (
            <div className="mb-8">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#8A8A82] mb-3">Trending Now</h2>
              <div className="grid grid-cols-2 gap-2">
                {ticker.slice(0, 4).map((t) => (
                  <Link key={t.slug} href={`/c/${t.slug}`}
                    className="bg-card border border-edge rounded-xl p-3 hover:border-accent/30 transition-all animate-breathe group">
                    <p className="text-[#F5F5F0] text-xs font-semibold truncate group-hover:text-accent transition-colors">{t.name}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[#F5F5F0] text-sm font-bold font-mono">{formatCurrency(t.price)}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.change >= 0 ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                        {t.change >= 0 ? '+' : ''}{t.change.toFixed(1)}%
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Empty state when no activity */}
          {feed.length === 0 && ticker.length === 0 && (
            <div className="bg-card border border-edge rounded-xl p-6 text-center animate-breathe">
              <p className="text-[#8A8A82] text-xs mb-2">No activity yet — be the first to trade</p>
              <Link href="/sign-up" className="text-accent text-xs font-semibold hover:underline">Create an account →</Link>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}
