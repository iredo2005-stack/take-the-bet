// ── Bonding Curve (market price driven by supply/demand) ─────────────────────

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

// ── Growth-Based Pricing ─────────────────────────────────────────────────────
//
// Price = base_floor + momentum_score
//
// base_floor: small, from log(audience). Gives bigger creators a slight edge
//   but NOT the main driver. Range: ~$1–$3.
//
// momentum_score: the MAIN driver. Based on growth_percent between updates.
//   - Growing fast (>5%): price rises sharply
//   - Flat (0-2%): price stays near base
//   - Stalling/shrinking (<0%): price FALLS below base
//   Range: -$2 to +$6
//
// This means prices go UP and DOWN — creating real risk and a real game.

const PLATFORM_MULTIPLIER: Record<string, number> = {
  youtube: 1.0,
  twitch: 1.8,
  tiktok: 0.6,
  instagram: 0.8,
  twitter: 0.7,
}

const FREQUENCY_MULTIPLIERS: Record<string, number> = {
  regular: 1.0,
  rare: 0.85,
  inactive: 0.65,
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

  // ── Base floor: log scale of audience ──
  // Gives bigger creators a slight premium ($1–$3 range)
  const audienceLog = normalizedAudience > 0 ? Math.log10(normalizedAudience) : 0
  const baseFloor = Math.max(0, audienceLog - 5) * 80_000 // ~$1.3 to $2.5

  // ── Momentum score: growth rate modulates the base price ──
  // Tighter range: 0.7× (stalling) to 1.4× (growing fast)
  // A creator can only move ±40% from their base via momentum.
  // With the ±15% daily cron cap, realistic daily swings are ±1-3%.
  const g = Math.max(-20, Math.min(20, metrics.monthly_growth_percent)) // clamp input

  // Monotonic: -20% → 0.65, 0% → 0.85, +5% → 1.0, +10% → 1.2, +20% → 1.4
  let momentum: number
  if (g <= -10) momentum = 0.65 + (g + 20) * 0.008 // 0.65 → 0.73
  else if (g <= 0) momentum = 0.73 + (g + 10) * 0.012 // 0.73 → 0.85
  else if (g <= 5) momentum = 0.85 + g * 0.03 // 0.85 → 1.0
  else if (g <= 10) momentum = 1.0 + (g - 5) * 0.04 // 1.0 → 1.2
  else momentum = 1.2 + (g - 10) * 0.02 // 1.2 → 1.4

  const momentumScore = baseFloor * momentum

  // ── Small bonuses ──
  const engBonus = metrics.engagement_rate * 5_000
  const freqMult = FREQUENCY_MULTIPLIERS[metrics.post_frequency] ?? 1.0

  return round2((momentumScore + engBonus) * freqMult)
}

export const DEFAULT_TOTAL_SHARES = 100_000
export const MIN_SHARE_PRICE = 0.50  // raised floor — nothing below $0.50
export const MAX_SHARE_PRICE = 20.00 // ceiling — nothing above $20

export function basePricePerShare(metrics: CreatorMetrics, totalShares: number = DEFAULT_TOTAL_SHARES): number {
  const bv = calculateBaseValue(metrics)
  if (totalShares <= 0) return MIN_SHARE_PRICE
  const raw = round2(bv / totalShares)
  return Math.max(MIN_SHARE_PRICE, Math.min(MAX_SHARE_PRICE, raw))
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
