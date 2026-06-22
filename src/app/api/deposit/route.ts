import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Mock deposit — in production this would be triggered by MoonPay webhook
export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { amount } = body

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: user } = await supabase
      .from('users')
      .select('id, balance')
      .eq('clerk_id', userId)
      .single()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // MoonPay charges ~4% fee — user receives 96% of what they pay
    const moonpayFee = Math.round(amount * 0.04 * 100) / 100
    const credited = Math.round((amount - moonpayFee) * 100) / 100
    const newBalance = Math.round((Number(user.balance) + credited) * 100) / 100

    await supabase
      .from('users')
      .update({ balance: newBalance })
      .eq('id', user.id)

    return NextResponse.json({
      success: true,
      deposited: amount,
      moonpayFee,
      credited,
      newBalance,
    })
  } catch (err) {
    console.error('[deposit] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 }
    )
  }
}
