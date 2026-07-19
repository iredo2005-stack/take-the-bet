// Client-side mirror of the liquidation check in
// supabase/migrations/005_clout_settlement.sql (clout_check_liquidations) —
// same threshold math, for showing a "distance to liquidation" indicator
// as the live metric moves. Read-only display logic; the SQL function is the
// only thing that actually liquidates a position.

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
