import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const OPEN_FEE = 0.02  // 2% to open
const CLOSE_FEE = 0.01 // 1% to close

// POST — open a short position
export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()
    const { data: user } = await supabase.from('users').select('*').eq('clerk_id', userId).single()
    if (!user?.age_verified) return NextResponse.json({ error: 'Age verification required' }, { status: 403 })

    const { offeringId, shares, collateral } = await req.json()
    if (!offeringId || !shares || shares < 1 || !collateral || collateral <= 0) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { data: offering } = await supabase.from('offerings').select('*').eq('id', offeringId).eq('status', 'active').single()
    if (!offering) return NextResponse.json({ error: 'Offering not found' }, { status: 404 })

    const openPrice = Number(offering.current_price)
    const openFee = Math.round(collateral * OPEN_FEE * 100) / 100
    const totalDeducted = Math.round((collateral + openFee) * 100) / 100

    const balance = Number(user.balance ?? 0)
    if (balance < totalDeducted) {
      return NextResponse.json({ error: `Insufficient balance. Need ${totalDeducted} HC (collateral + 2% fee).` }, { status: 400 })
    }

    // Liquidation price: when price rises so loss = collateral
    // Loss = (open_price - current_price) × shares → liquidated when current_price = open_price + collateral/shares
    const liquidationPrice = Math.round((openPrice + collateral / shares) * 10000) / 10000

    // Deduct collateral + fee from balance
    await supabase.from('users').update({ balance: Math.round((balance - totalDeducted) * 100) / 100 }).eq('id', user.id)

    const { data: short, error } = await supabase.from('shorts').insert({
      user_id: user.id,
      offering_id: offeringId,
      shares,
      open_price: openPrice,
      collateral,
      open_fee: openFee,
      liquidation_price: liquidationPrice,
      status: 'open',
    }).select().single()

    if (error) {
      await supabase.from('users').update({ balance }).eq('id', user.id) // refund
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, short, openPrice, liquidationPrice })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
