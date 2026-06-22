// ── Linear Bonding Curve ─────────────────────────────────────────────────────
//
// price(s) = initialPrice × (1 + 4 × s / totalShares)
//
// At s = 0 (no shares sold):            price = 1× initial
// At s = totalShares (all shares sold):  price = 5× initial
//
// The "4" comes from: we want a 5× ceiling, so the slope adds 4× over the
// full supply.  Buying N shares costs the integral under the curve from
// s_current to s_current + N — big buys climb the curve and pay more per share.
// ─────────────────────────────────────────────────────────────────────────────

const MULTIPLIER = 4 // price goes from 1× to (1+MULTIPLIER)× = 5×

/** Spot price when `sharesSold` shares have already been sold. */
export function spotPrice(
  initialPrice: number,
  totalShares: number,
  sharesSold: number,
): number {
  const price = initialPrice * (1 + (MULTIPLIER * sharesSold) / totalShares)
  return capPrice(initialPrice, price)
}

/**
 * Total cost of buying `quantity` shares starting when `sharesSold` have
 * already been sold.  This is the definite integral of the price curve —
 * so buying 100 shares costs more per share than buying 1.
 */
export function costOfShares(
  initialPrice: number,
  totalShares: number,
  sharesSold: number,
  quantity: number,
): number {
  const slope = (MULTIPLIER * initialPrice) / totalShares
  const cost = initialPrice * quantity + slope * quantity * (sharesSold + quantity / 2)
  return round2(cost)
}

/** Average price per share for a buy of `quantity`. */
export function avgPriceForBuy(
  initialPrice: number,
  totalShares: number,
  sharesSold: number,
  quantity: number,
): number {
  if (quantity <= 0) return spotPrice(initialPrice, totalShares, sharesSold)
  return round2(costOfShares(initialPrice, totalShares, sharesSold, quantity) / quantity)
}

/** The new spot price AFTER buying `quantity` shares. */
export function priceAfterBuy(
  initialPrice: number,
  totalShares: number,
  sharesSold: number,
  quantity: number,
): number {
  return spotPrice(initialPrice, totalShares, sharesSold + quantity)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function capPrice(initialPrice: number, price: number): number {
  const ceiling = initialPrice * (1 + MULTIPLIER) // 5×
  return Math.max(initialPrice, Math.min(price, ceiling))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
