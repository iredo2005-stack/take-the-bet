import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const CLOSE_FEE = 0.01

type Props = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Props) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: user } = await supabase.from('users').select('*').eq('clerk_id', userId).single()
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const { id } = await params
    const { data: short } = await supabase.from('shorts').select('*').eq('id', id).eq('user_id', user.id).single()
    if (!short) return NextResponse.json({ error: 'Short not found' }, { status: 404 })
    if (short.status !== 'open') return NextResponse.json({ error: 'Short already closed' }, { status: 400 })

    const { data: offering } = await supabase.from('offerings').select('current_price').eq('id', short.offering_id).single()
    const closePrice = Number(offering?.current_price ?? short.open_price)

    // P&L = (open - close) × shares (positive when price fell)
    const rawPnl = (Number(short.open_price) - closePrice) * short.shares
    const closeFee = Math.round(Math.abs(rawPnl) * CLOSE_FEE * 100) / 100
    const netPnl = Math.round((rawPnl - closeFee) * 100) / 100

    // Max loss = collateral (can't go below zero)
    const finalPnl = Math.max(-Number(short.collateral), netPnl)

    // Return collateral + profit (or collateral - loss)
    const returned = Math.round((Number(short.collateral) + finalPnl) * 100) / 100
    const newBalance = Math.round((Number(user.balance ?? 0) + returned) * 100) / 100

    await supabase.from('users').update({ balance: newBalance }).eq('id', user.id)
    await supabase.from('shorts').update({
      status: 'closed', close_price: closePrice,
      pnl: finalPnl, closed_at: new Date().toISOString(),
    }).eq('id', id)

    return NextResponse.json({ success: true, closePrice, rawPnl, closeFee, finalPnl, returned, newBalance })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
