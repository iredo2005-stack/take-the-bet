'use client'

import { useState } from 'react'
import Link from 'next/link'

type RankedTrader = {
  userId: string
  username: string | null
  fullName: string | null
  avatarUrl: string | null
  stat: number
  label: string
}

type Tab = 'weekly' | 'alltime' | 'winrate' | 'biggest'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'weekly', label: 'This Week', icon: '📅' },
  { key: 'alltime', label: 'All-Time', icon: '🏆' },
  { key: 'winrate', label: 'Win Rate', icon: '🎯' },
  { key: 'biggest', label: 'Biggest Win', icon: '💎' },
]

const MEDALS = ['🥇', '🥈', '🥉']

type Props = {
  allTimePnl: RankedTrader[]
  weeklyPnl: RankedTrader[]
  winRate: RankedTrader[]
  biggestWins: RankedTrader[]
  currentUserId: string | null
  allTimeFull: RankedTrader[]
  weeklyFull: RankedTrader[]
  winRateFull: RankedTrader[]
  biggestWinsFull: RankedTrader[]
}

export default function LeaderboardTabs({ allTimePnl, weeklyPnl, winRate, biggestWins, currentUserId, allTimeFull, weeklyFull, winRateFull, biggestWinsFull }: Props) {
  const [tab, setTab] = useState<Tab>('weekly')

  const dataMap: Record<Tab, RankedTrader[]> = { weekly: weeklyPnl, alltime: allTimePnl, winrate: winRate, biggest: biggestWins }
  const fullMap: Record<Tab, RankedTrader[]> = { weekly: weeklyFull, alltime: allTimeFull, winrate: winRateFull, biggest: biggestWinsFull }
  const list = dataMap[tab]
  const full = fullMap[tab]

  // Find current user's rank in the full list
  const myRankIdx = currentUserId ? full.findIndex((t) => t.userId === currentUserId) : -1
  const myEntry = myRankIdx >= 0 ? full[myRankIdx] : null
  const isInTop = myRankIdx >= 0 && myRankIdx < list.length

  const emptyMessages: Record<Tab, string> = {
    weekly: 'No trades this week yet. Be the first!',
    alltime: 'No traders with P&L data yet.',
    winrate: 'No resolved bets yet.',
    biggest: 'No bet wins yet.',
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
          <p className="text-gray-500 text-sm mt-1">Top traders ranked by performance</p>
        </div>
        <Link href="/dashboard" className="text-gray-500 hover:text-white text-sm transition-colors">← Dashboard</Link>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.key ? 'bg-subtle text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-subtle/50'
            }`}>
            <span className="text-xs">{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* My rank banner */}
      {myEntry && !isInTop && (
        <div className="bg-accent/5 border border-accent/20 rounded-xl p-3 mb-4 flex items-center gap-3">
          <span className="text-accent text-xs font-bold">#{myRankIdx + 1}</span>
          <span className="text-white text-sm font-medium">You</span>
          <span className="text-gray-400 text-sm ml-auto">{myEntry.label}</span>
        </div>
      )}

      {/* Table */}
      {list.length === 0 ? (
        <div className="bg-card border border-edge rounded-2xl p-10 text-center">
          <p className="text-gray-500">{emptyMessages[tab]}</p>
        </div>
      ) : (
        <div className="bg-card border border-edge rounded-2xl overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[3rem_1fr_auto] px-4 py-2.5 border-b border-edge text-gray-500 text-xs uppercase tracking-wide">
            <span>Rank</span>
            <span>Trader</span>
            <span className="text-right">{tab === 'winrate' ? 'Win Rate' : tab === 'biggest' ? 'Profit' : 'P&L'}</span>
          </div>

          {/* Rows */}
          {list.map((trader, i) => {
            const isMe = currentUserId === trader.userId
            const rank = i + 1

            return (
              <div key={`${trader.userId}-${i}`}
                className={`grid grid-cols-[3rem_1fr_auto] items-center px-4 py-3 border-b border-edge/50 last:border-0 transition-colors ${
                  isMe ? 'bg-accent/5' : 'hover:bg-subtle/30'
                }`}>
                {/* Rank */}
                <span className="text-sm font-bold">
                  {rank <= 3 ? (
                    <span className="text-lg">{MEDALS[rank - 1]}</span>
                  ) : (
                    <span className="text-gray-500">#{rank}</span>
                  )}
                </span>

                {/* Trader */}
                <div className="flex items-center gap-2.5 min-w-0">
                  {trader.avatarUrl ? (
                    <img src={trader.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-subtle flex items-center justify-center text-gray-400 text-xs font-bold flex-shrink-0">
                      {(trader.fullName || trader.username || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    {trader.username ? (
                      <Link href={`/trader/${trader.username}`} className="text-white text-sm font-medium hover:text-accent transition-colors truncate block">
                        @{trader.username}
                        {isMe && <span className="text-accent text-xs ml-1.5">(you)</span>}
                      </Link>
                    ) : (
                      <span className="text-gray-400 text-sm truncate block">
                        {trader.fullName || 'Anonymous'}
                        {isMe && <span className="text-accent text-xs ml-1.5">(you)</span>}
                      </span>
                    )}
                  </div>
                </div>

                {/* Stat */}
                <span className={`text-sm font-bold text-right whitespace-nowrap ${
                  tab === 'winrate'
                    ? 'text-white'
                    : trader.stat >= 0
                      ? 'text-up'
                      : 'text-down'
                }`}>
                  {tab !== 'winrate' && trader.stat >= 0 ? '+' : ''}{trader.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* My rank at bottom if not in top */}
      {myEntry && !isInTop && (
        <div className="mt-4 bg-card border border-accent/20 rounded-xl">
          <div className="grid grid-cols-[3rem_1fr_auto] items-center px-4 py-3 bg-accent/5 rounded-xl">
            <span className="text-sm font-bold text-accent">#{myRankIdx + 1}</span>
            <div className="flex items-center gap-2.5 min-w-0">
              {myEntry.avatarUrl ? (
                <img src={myEntry.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-subtle flex items-center justify-center text-accent text-xs font-bold flex-shrink-0">
                  {(myEntry.fullName || myEntry.username || '?')[0].toUpperCase()}
                </div>
              )}
              <span className="text-white text-sm font-medium">You</span>
            </div>
            <span className={`text-sm font-bold text-right ${myEntry.stat >= 0 ? 'text-up' : 'text-down'}`}>
              {myEntry.stat >= 0 ? '+' : ''}{myEntry.label}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
