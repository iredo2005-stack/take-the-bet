import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { costOfShares, avgPriceForBuy, priceAfterBuy } from '@/lib/pricing'

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_id', userId)
      .single()

    if (!user || !user.age_verified) {
      return NextResponse.json({ error: 'Age verification required' }, { status: 403 })
    }

    const body = await req.json()
    const { offeringId, shares } = body

    if (!offeringId || !shares || shares < 1) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { data: offering } = await supabase
      .from('offerings')
      .select('*')
      .eq('id', offeringId)
      .eq('status', 'active')
      .single()

    if (!offering) {
      return NextResponse.json({ error: 'Offering not found or not active' }, { status: 404 })
    }

    if (shares > offering.shares_available) {
      return NextResponse.json(
        { error: `Only ${offering.shares_available} shares available` },
        { status: 400 }
      )
    }

    // Anti wash-trading
    const { data: offeringCreator } = await supabase
      .from('creators')
      .select('*')
      .eq('id', offering.creator_id)
      .single()

    if (offeringCreator && offeringCreator.user_id && offeringCreator.user_id === user.id) {
      return NextResponse.json(
        { error: 'You cannot buy shares in your own offering' },
        { status: 403 }
      )
    }

    // Bonding curve pricing
    const initPrice = Number(offering.initial_price)
    const totalShares = offering.total_shares
    const sharesSold = offering.shares_sold

    const subtotal = costOfShares(initPrice, totalShares, sharesSold, shares)
    const avgPrice = avgPriceForBuy(initPrice, totalShares, sharesSold, shares)
    const newSpotPrice = priceAfterBuy(initPrice, totalShares, sharesSold, shares)

    const commissionRate = parseFloat(process.env.PRIMARY_COMMISSION_RATE || '0.02')
    const commissionAmount = Math.round(subtotal * commissionRate * 100) / 100
    // totalAmount = what leaves the user's balance (shares + fee)
    const totalAmount = Math.round((subtotal + commissionAmount) * 100) / 100
    // netAmount = shares cost only (no fee) — used for total_raised on the offering
    const netAmount = Math.round(subtotal * 100) / 100

    // Check virtual balance
    const userBalance = Number(user.balance)
    if (userBalance < totalAmount) {
      return NextResponse.json(
        { error: `Insufficient Hype Coins. You have ${Math.round(userBalance)} HC but need ${Math.round(totalAmount)} HC.` },
        { status: 400 }
      )
    }

    // Deduct from virtual balance
    await supabase
      .from('users')
      .update({ balance: Math.round((userBalance - totalAmount) * 100) / 100 })
      .eq('id', user.id)

    // Record transaction
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        offering_id: offeringId,
        buyer_id: user.id,
        shares,
        price_per_share: avgPrice,
        total_amount: totalAmount,
        commission_rate: commissionRate,
        commission_amount: commissionAmount,
        net_amount: netAmount,
        payment_ref: `bal_${Date.now()}`,
        status: 'completed',
      })
      .select()
      .single()

    if (txError) {
      // Refund balance on failure
      await supabase
        .from('users')
        .update({ balance: userBalance })
        .eq('id', user.id)
      console.error('[buy] Transaction insert error:', txError)
      return NextResponse.json({ error: txError.message }, { status: 500 })
    }

    // Update offering
    await supabase
      .from('offerings')
      .update({
        shares_available: offering.shares_available - shares,
        shares_sold: offering.shares_sold + shares,
        total_raised: Number(offering.total_raised) + netAmount,
        current_price: newSpotPrice,
      })
      .eq('id', offeringId)

    // Upsert holding
    const { data: existingHolding } = await supabase
      .from('holdings')
      .select('*')
      .eq('user_id', user.id)
      .eq('offering_id', offeringId)
      .single()

    // total_invested includes the fee so P&L starts at -fee (honest breakeven)
    const totalInvestedForHolding = Math.round(totalAmount * 100) / 100

    if (existingHolding) {
      const newShares = existingHolding.shares_owned + shares
      const newInvested = Number(existingHolding.total_invested) + totalInvestedForHolding
      await supabase
        .from('holdings')
        .update({
          shares_owned: newShares,
          avg_buy_price: Math.round((newInvested / newShares) * 100) / 100,
          total_invested: Math.round(newInvested * 100) / 100,
        })
        .eq('id', existingHolding.id)
    } else {
      await supabase
        .from('holdings')
        .insert({
          user_id: user.id,
          offering_id: offeringId,
          shares_owned: shares,
          avg_buy_price: Math.round((totalInvestedForHolding / shares) * 100) / 100,
          total_invested: totalInvestedForHolding,
        })
    }

    // Price history
    await supabase.from('price_history').insert({
      offering_id: offeringId,
      price: newSpotPrice,
    })

    return NextResponse.json({
      success: true,
      transaction: {
        id: transaction.id,
        shares,
        avgPricePerShare: avgPrice,
        totalAmount,
        commissionAmount,
        newPrice: newSpotPrice,
        newBalance: Math.round((userBalance - totalAmount) * 100) / 100,
      },
    })
  } catch (err) {
    console.error('[buy] Unexpected error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 }
    )
  }
}
