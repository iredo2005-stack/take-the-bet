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
// Unified formula — same rule for every creator, normalized across platforms:
// 1. Normalize audience: platform multiplier makes Twitch/YouTube/etc comparable
// 2. Score = audience (primary) + views (capped at 30% of audience) + engagement
// 3. Apply frequency + growth multipliers
// 4. Price = score / total_shares, floor $0.25

const PLATFORM_MULTIPLIER: Record<string, number> = {
  youtube: 1.0,
  twitch: 1.8,
  tiktok: 0.6,
  instagram: 0.8,
  twitter: 0.7,
}

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
  platform?: string
}

export function calculateBaseValue(metrics: CreatorMetrics): number {
  const platform = metrics.platform || 'youtube'
  const platMult = PLATFORM_MULTIPLIER[platform] ?? 1.0
  const normalizedAudience = metrics.subscribers * platMult

  // Logarithmic scale: compresses 9M vs 122M from 13× gap to ~1.4× gap
  // log10(9M)=6.95, log10(122M)=8.09 → shifted scores 1.95 to 3.09
  // Multiplied by 250K → divided by 100K shares → $4.88 to $7.73 range
  const audienceLog = normalizedAudience > 0 ? Math.log10(normalizedAudience) : 0
  const audienceScore = Math.max(0, audienceLog - 5) * 250_000

  // Views bonus: log scale, capped at 15% of audience score
  const viewsLog = metrics.monthly_views > 0 ? Math.log10(metrics.monthly_views) : 0
  const viewsScore = Math.max(0, viewsLog - 5) * 40_000
  const viewsCapped = Math.min(viewsScore, audienceScore * 0.15)

  const engBonus = metrics.engagement_rate * 20_000

  const rawScore = audienceScore + viewsCapped + engBonus

  const freqMultiplier = FREQUENCY_MULTIPLIERS[metrics.post_frequency] ?? 1.0

  let growthMultiplier = 1.0
  const g = metrics.monthly_growth_percent
  if (g >= 20) growthMultiplier = 1.15
  else if (g >= 10) growthMultiplier = 1.1
  else if (g >= 5) growthMultiplier = 1.05
  else if (g >= 0) growthMultiplier = 1.0
  else growthMultiplier = 0.9

  return round2(rawScore * freqMultiplier * growthMultiplier)
}

export const DEFAULT_TOTAL_SHARES = 100_000
export const MIN_SHARE_PRICE = 0.25

export function basePricePerShare(metrics: CreatorMetrics, totalShares: number = DEFAULT_TOTAL_SHARES): number {
  const bv = calculateBaseValue(metrics)
  if (totalShares <= 0) return MIN_SHARE_PRICE
  return Math.max(MIN_SHARE_PRICE, round2(bv / totalShares))
}

// ── Treasury ─────────────────────────────────────────────────────────────────

export const TREASURY_PERCENT = 0.20

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
