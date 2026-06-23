import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = createAdminClient()

    // Recent transactions (last 20)
    const { data: txs } = await supabase
      .from('transactions')
      .select('shares, price_per_share, total_amount, created_at, offerings(title, current_price, initial_price, creators(display_name, slug))')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(20)

    // Recent bets opened
    const { data: bets } = await supabase
      .from('video_bets')
      .select('question, created_at, creators(display_name, slug)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(5)

    // Active offerings with price data for ticker
    const { data: offerings } = await supabase
      .from('offerings')
      .select('title, current_price, initial_price, shares_sold, creators(display_name, slug)')
      .eq('status', 'active')
      .order('shares_sold', { ascending: false })
      .limit(10)

    // Build activity feed
    const feed: { id: string; type: string; text: string; time: string }[] = []

    for (const tx of (txs || []) as any[]) {
      const creator = tx.offerings?.creators?.display_name || 'a creator'
      feed.push({
        id: `tx-${tx.created_at}`,
        type: 'buy',
        text: `bought ${tx.shares} share${tx.shares > 1 ? 's' : ''} of ${creator}`,
        time: tx.created_at,
      })
    }

    for (const bet of (bets || []) as any[]) {
      const creator = bet.creators?.display_name || 'a creator'
      feed.push({
        id: `bet-${bet.created_at}`,
        type: 'bet',
        text: `New bet on ${creator}: "${bet.question}"`,
        time: bet.created_at,
      })
    }

    // Sort by time, newest first
    feed.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

    // Ticker data
    const ticker = ((offerings || []) as any[]).map((o) => {
      const pct = o.initial_price > 0 ? ((o.current_price - o.initial_price) / o.initial_price) * 100 : 0
      return {
        name: o.creators?.display_name || o.title,
        slug: o.creators?.slug || '',
        price: Number(o.current_price),
        change: Math.round(pct * 10) / 10,
        sold: o.shares_sold,
      }
    })

    return NextResponse.json({ feed: feed.slice(0, 15), ticker })
  } catch (err) {
    return NextResponse.json({ feed: [], ticker: [] })
  }
}
