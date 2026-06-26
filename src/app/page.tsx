import Link from 'next/link'
import { Logo } from '@/components/Logo'
import LiveHome from './LiveHome'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

async function getInitialData() {
  try {
    const supabase = createAdminClient()

    const { data: txs } = await supabase.from('transactions').select('shares, price_per_share, total_amount, created_at, offerings(title, current_price, initial_price, creators(display_name, slug))').eq('status', 'completed').order('created_at', { ascending: false }).limit(15)

    const { data: bets } = await supabase.from('video_bets').select('question, created_at, creators(display_name, slug)').eq('status', 'open').order('created_at', { ascending: false }).limit(5)

    const { data: offerings } = await supabase.from('offerings').select('title, current_price, initial_price, shares_sold, creators(display_name, slug)').eq('status', 'active').order('shares_sold', { ascending: false }).limit(10)

    const feed: any[] = []
    for (const tx of (txs || []) as any[]) {
      feed.push({ id: `tx-${tx.created_at}`, type: 'buy', text: `bought ${tx.shares} share${tx.shares > 1 ? 's' : ''} of ${tx.offerings?.creators?.display_name || '?'}`, time: tx.created_at })
    }
    for (const bet of (bets || []) as any[]) {
      feed.push({ id: `bet-${bet.created_at}`, type: 'bet', text: `New bet: "${bet.question}"`, time: bet.created_at })
    }
    feed.sort((a: any, b: any) => new Date(b.time).getTime() - new Date(a.time).getTime())

    const ticker = ((offerings || []) as any[]).map((o: any) => ({
      name: o.creators?.display_name || o.title,
      slug: o.creators?.slug || '',
      price: Number(o.current_price),
      change: o.initial_price > 0 ? Math.round(((o.current_price - o.initial_price) / o.initial_price) * 1000) / 10 : 0,
    }))

    return { feed: feed.slice(0, 10), ticker }
  } catch { return { feed: [], ticker: [] } }
}

export default async function HomePage() {
  const data = await getInitialData()

  return (
    <main className="min-h-screen animate-bg-glow flex flex-col pb-16 sm:pb-0">
      {/* Nav */}
      <nav className="bg-card/80 backdrop-blur-sm px-5 py-2.5 flex items-center justify-between border-b border-edge sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <Logo size="sm" />
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-down">
            <span className="w-1.5 h-1.5 bg-down rounded-full animate-pulse-gold" />
            Live
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <Link href="/about" className="text-xs text-[#8A8A82] hover:text-[#F5F5F0] transition-colors px-2 py-1 hidden sm:block">How it works</Link>
          <Link href="/sign-in" className="text-xs text-[#8A8A82] hover:text-[#F5F5F0] transition-colors px-2 py-1">Log in</Link>
          <Link href="/sign-up" className="text-xs bg-accent hover:bg-accent-hover text-bg font-semibold px-3.5 py-1.5 rounded-md transition-colors">Sign up</Link>
        </div>
      </nav>

      <LiveHome initialFeed={data.feed} initialTicker={data.ticker} />
    </main>
  )
}
