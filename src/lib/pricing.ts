// ── Bonding Curve (market price driven by supply/demand) ─────────────────────
//
// price(s) = initialPrice × (1 + 4 × s / totalShares)
//
// At s = 0: price = 1× initial
// At s = totalShares: price = 5× initial (ceiling)

const CURVE_MULTIPLIER = 4

export function spotPrice(initialPrice: number, totalShares: number, sharesSold: number): number {
  const price = initialPrice * (1 + (CURVE_MULTIPLIER * sharesSold) / totalShares)
  return capPrice(initialPrice, price)
}

export function costOfShares(initialPrice: number, totalShares: number, sharesSold: number, quantity: number): number {
  const slope = (CURVE_MULTIPLIER * initialPrice) / totalShares
  const cost = initialPrice * quantity + slope * quantity * (sharesSold + quantity / 2)
  return round2(cost)
}

export function avgPriceForBuy(initialPrice: number, totalShares: number, sharesSold: number, quantity: number): number {
  if (quantity <= 0) return spotPrice(initialPrice, totalShares, sharesSold)
  return round2(costOfShares(initialPrice, totalShares, sharesSold, quantity) / quantity)
}

export function priceAfterBuy(initialPrice: number, totalShares: number, sharesSold: number, quantity: number): number {
  return spotPrice(initialPrice, totalShares, sharesSold + quantity)
}

function capPrice(initialPrice: number, price: number): number {
  const ceiling = initialPrice * (1 + CURVE_MULTIPLIER)
  return Math.max(initialPrice, Math.min(price, ceiling))
}

// ── Base Value (metric-driven fair value anchor) ─────────────────────────────
//
// raw_base = (subscribers × 0.01) + (monthly_views × 0.001) + (engagement_rate × 100)
// base_value = raw_base × frequency_multiplier × growth_multiplier
// base_price_per_share = base_value / total_shares

const FREQUENCY_MULTIPLIERS: Record<string, number> = {
  regular: 1.0,
  rare: 0.8,
  inactive: 0.6,
}

export type CreatorMetrics = {
  subscribers: number
  monthly_views: number
  engagement_rate: number
  post_frequency: string
  monthly_growth_percent: number
}

export function calculateBaseValue(metrics: CreatorMetrics): number {
  const rawBase =
    (metrics.subscribers * 0.01) +
    (metrics.monthly_views * 0.001) +
    (metrics.engagement_rate * 100)

  const freqMultiplier = FREQUENCY_MULTIPLIERS[metrics.post_frequency] ?? 1.0

  let growthMultiplier = 1.0
  const g = metrics.monthly_growth_percent
  if (g >= 20) growthMultiplier = 1.5
  else if (g >= 5) growthMultiplier = 1.2
  else if (g >= 0) growthMultiplier = 1.0
  else growthMultiplier = 0.7

  return round2(rawBase * freqMultiplier * growthMultiplier)
}

export function basePricePerShare(metrics: CreatorMetrics, totalShares: number = 1000): number {
  const bv = calculateBaseValue(metrics)
  if (totalShares <= 0) return 0
  return round2(bv / totalShares)
}

// ── Treasury ─────────────────────────────────────────────────────────────────

export const TREASURY_PERCENT = 0.20 // platform holds 20% of total shares

export function treasuryShares(totalShares: number): number {
  return Math.floor(totalShares * TREASURY_PERCENT)
}

export function publicShares(totalShares: number): number {
  return totalShares - treasuryShares(totalShares)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
