// Perpetual Creator Index Engine — "Stocks Mode" pricing.
//
// index_price = base_index_price * clamp(realtime_metric / rolling_avg_metric, floor, ceiling)
//
// The ratio drives the price up/down around a stable base as a creator's
// live performance runs hot or cold relative to their own 4-week normal —
// there's no market maker, the ratio itself IS the signal.

export const INDEX_RATIO_FLOOR = 0.5
export const INDEX_RATIO_CEIL = 2.0

// EMA smoothing factor for the rolling 4-week average (updated once per cron
// tick). With daily ticks, alpha ≈ 2/(28+1) approximates a 28-day EMA.
export const ROLLING_AVG_ALPHA = 2 / 29

export function updateRollingAverage(prevAvg: number, latestMetric: number): number {
  if (prevAvg <= 0) return latestMetric
  return prevAvg * (1 - ROLLING_AVG_ALPHA) + latestMetric * ROLLING_AVG_ALPHA
}

export type HybridMetrics = {
  videoMetric: number // views/engagement from posts, VODs, etc.
  liveMetric: number // concurrent viewers while live
  liveWeight?: number // 0..1, defaults to 0.5 (50/50 split for hybrid creators)
}

export function weightedMetric({ videoMetric, liveMetric, liveWeight = 0.5 }: HybridMetrics): number {
  const w = Math.max(0, Math.min(1, liveWeight))
  return videoMetric * (1 - w) + liveMetric * w
}

export function computeIndexPrice(baseIndexPrice: number, realtimeMetric: number, rollingAvgMetric: number): number {
  if (rollingAvgMetric <= 0) return round4(baseIndexPrice)
  const ratio = realtimeMetric / rollingAvgMetric
  const clamped = Math.max(INDEX_RATIO_FLOOR, Math.min(INDEX_RATIO_CEIL, ratio))
  return round4(baseIndexPrice * clamped)
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}
