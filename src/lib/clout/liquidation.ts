// Client-side mirror of the liquidation check in
// supabase/migrations/005_clout_settlement.sql / 009_clout_war_liquidation.sql
// (clout_check_liquidations) — same threshold math, for showing a "distance
// to liquidation" indicator as the live metric moves. Read-only display
// logic; the SQL function is the only thing that actually liquidates a
// position.

export type PoolSide = 'up' | 'down'

// Only leveraged (5x/10x) positions can be liquidated — a Regular (1x)
// position has no knockout risk, matching clout_check_liquidations' `and
// leverage > 1` filter.
export function isLiquidatable(leverage: number): boolean {
  return leverage > 1
}

export function liquidationThreshold(
  baselineMetric: number,
  side: PoolSide,
  triggerRatio: number = 0.2
): number {
  return side === 'up' ? baselineMetric * (1 - triggerRatio) : baselineMetric * (1 + triggerRatio)
}

export function isPositionLiquidated(
  currentMetric: number,
  baselineMetric: number,
  side: PoolSide,
  triggerRatio: number = 0.2
): boolean {
  const threshold = liquidationThreshold(baselineMetric, side, triggerRatio)
  return side === 'up' ? currentMetric <= threshold : currentMetric >= threshold
}

// 0 = at the liquidation line right now, 1 = at the baseline (full room left).
// Negative once the metric has crossed past the trigger.
export function liquidationHeadroomRatio(
  currentMetric: number,
  baselineMetric: number,
  side: PoolSide,
  triggerRatio: number = 0.2
): number {
  const threshold = liquidationThreshold(baselineMetric, side, triggerRatio)
  const totalMove = Math.abs(baselineMetric - threshold)
  if (totalMove === 0) return 0
  const movedSoFar = side === 'up' ? baselineMetric - currentMetric : currentMetric - baselineMetric
  return 1 - movedSoFar / totalMove
}

// ─────────────────────────────────────────────────────────────────────────────
// War Pools — Market Share / Ratio Model.
//
// UP backs Creator A, DOWN backs Creator B. Liquidation triggers on a
// relative drop in *market share*, not the raw metric: a position on
// Creator A liquidates once Creator A's share of the combined metric has
// fallen triggerRatio (20% by default) below the share baseline recorded
// when the pool opened (or 0.5/50-50 if none was set).
// ─────────────────────────────────────────────────────────────────────────────

// Creator A's share of the combined metric. Returns null when both metrics
// are zero (no usable signal yet) — mirrors the SQL's `v_total_metric <= 0`
// early-return, where no position is liquidated.
export function marketShareA(currentMetricA: number, currentMetricB: number): number | null {
  const total = currentMetricA + currentMetricB
  if (total <= 0) return null
  return currentMetricA / total
}

export function isWarPositionLiquidated(
  currentMetricA: number,
  currentMetricB: number,
  side: PoolSide,
  baselineShareA: number = 0.5,
  triggerRatio: number = 0.2
): boolean {
  const shareA = marketShareA(currentMetricA, currentMetricB)
  if (shareA === null) return false

  if (side === 'up') {
    return shareA <= baselineShareA * (1 - triggerRatio)
  }
  const shareB = 1 - shareA
  const baselineShareB = 1 - baselineShareA
  return shareB <= baselineShareB * (1 - triggerRatio)
}

// 0 = at the liquidation line right now, 1 = at the baseline share (full room
// left). Negative once the share has crossed past the trigger. Same shape as
// liquidationHeadroomRatio, expressed in share-space instead of metric-space.
export function warLiquidationHeadroomRatio(
  currentMetricA: number,
  currentMetricB: number,
  side: PoolSide,
  baselineShareA: number = 0.5,
  triggerRatio: number = 0.2
): number {
  const shareA = marketShareA(currentMetricA, currentMetricB)
  if (shareA === null) return 1 // no signal yet — treat as full room left

  const baselineShare = side === 'up' ? baselineShareA : 1 - baselineShareA
  const currentShare = side === 'up' ? shareA : 1 - shareA
  const threshold = baselineShare * (1 - triggerRatio)
  const totalMove = baselineShare - threshold
  if (totalMove === 0) return 0
  const movedSoFar = baselineShare - currentShare
  return 1 - movedSoFar / totalMove
}
