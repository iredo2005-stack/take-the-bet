// Integer-cents helpers for the leverage/pool engine. Never do this math in
// floats — round to the nearest cent immediately and keep everything else an
// integer basis-point (bps) calculation.

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100)
}

export function centsToDollars(cents: number): number {
  return cents / 100
}

export function bpsOf(amountCents: number, bps: number): number {
  return Math.round((amountCents * bps) / 10000)
}

export const SPREAD_BPS = 100 // 1% order spread, charged on entry and exit
export const POOL_FEE_BPS = 1000 // 10% platform fee on 48h pool resolution
export const MAINTENANCE_MARGIN_BPS = 5000 // liquidate at 50% of initial collateral remaining
export const MAX_FUNDING_RATE_BPS = 50 // cap funding at 0.5% of notional per 4h period
export const LEVERAGE_OPTIONS = [3, 5] as const
export type Leverage = (typeof LEVERAGE_OPTIONS)[number]

export function isValidLeverage(n: unknown): n is Leverage {
  return n === 3 || n === 5
}

export const MIN_ORDER_GAP_SECONDS = 5
export const MIN_EXECUTION_DELAY_MS = 3000
export const MAX_EXECUTION_DELAY_MS = 5000

export function randomExecutionDelayMs(): number {
  return Math.floor(MIN_EXECUTION_DELAY_MS + Math.random() * (MAX_EXECUTION_DELAY_MS - MIN_EXECUTION_DELAY_MS))
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
