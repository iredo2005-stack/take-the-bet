// Client-side mirror of clout_calculate_live_payout() in
// supabase/migrations/004_clout_pools.sql — same math, for optimistic/reactive
// UI display as pool volume streams in over Realtime. The SQL function is the
// only authoritative source for anything that touches a balance; this is
// read-only display math and must never be used to credit/debit a wallet.

export type PoolSide = 'up' | 'down'

export type PoolVolume = {
  upPoolCents: number
  downPoolCents: number
  rakeBps: number
}

export type OpenPosition = {
  side: PoolSide
  notionalCents: number
}

// Same fixed-pot proportional split as the SQL function: leverage only changes
// a position's slice of prize_pool_cents, never the total being distributed —
// see the comment above clout_calculate_live_payout for why that's solvent.
export function calculateLivePayoutCents(
  pool: PoolVolume,
  openPositionsOnSide: OpenPosition[],
  myNotionalCents: number
): number {
  const totalCash = pool.upPoolCents + pool.downPoolCents
  const prizePool = Math.floor((totalCash * (10000 - pool.rakeBps)) / 10000)

  const sideNotional = openPositionsOnSide.reduce((sum, p) => sum + p.notionalCents, 0)
  if (sideNotional === 0) return 0

  // Multiply first, divide once — see the matching comment in
  // clout_calculate_live_payout() in the SQL migration for why dividing
  // notional/sideNotional before multiplying can shave off a cent.
  return Math.floor((prizePool * myNotionalCents) / sideNotional)
}

// Convenience for a single position against a full snapshot of open positions
// in its pool (e.g. from a Realtime-subscribed list).
export function calculateLivePayoutForPosition(
  pool: PoolVolume,
  allOpenPositions: OpenPosition[],
  myPosition: OpenPosition
): number {
  const sidePositions = allOpenPositions.filter((p) => p.side === myPosition.side)
  return calculateLivePayoutCents(pool, sidePositions, myPosition.notionalCents)
}

// Implied multiplier on margin — useful for the "current payout is 2.3x your
// margin" style UI copy, distinct from the leverage multiplier itself.
export function impliedMultiplier(liveMarginCents: number, payoutCents: number): number {
  if (liveMarginCents <= 0) return 0
  return payoutCents / liveMarginCents
}
