// Auto-scale view tiers based on creator size

function niceRound(n: number): number {
  if (n >= 10_000_000) return Math.round(n / 1_000_000) * 1_000_000
  if (n >= 1_000_000)  return Math.round(n / 500_000)   * 500_000
  if (n >= 100_000)    return Math.round(n / 50_000)    * 50_000
  if (n >= 10_000)     return Math.round(n / 5_000)     * 5_000
  if (n >= 1_000)      return Math.round(n / 1_000)     * 1_000
  return Math.max(100, Math.round(n / 100) * 100)
}

export function generateTiers(subscribers: number): { label: string; target: number }[] {
  // Expected views for a new video ≈ 3–8% of subscribers (varies by platform)
  // We generate 4 tiers: conservative, expected, stretch, viral
  const base = subscribers * 0.04

  const targets = [
    niceRound(base * 0.3),  // conservative (30% of expected)
    niceRound(base * 1.0),  // expected
    niceRound(base * 3.0),  // stretch (3×)
    niceRound(base * 10.0), // viral (10×)
  ]

  // Remove duplicates and ensure strictly increasing
  const unique = [...new Set(targets)].filter((v, i, arr) => i === 0 || v > arr[i - 1])

  return unique.map((target) => ({
    label: fmtViews(target),
    target,
  }))
}

export function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M views`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 0)}K views`
  return `${n} views`
}

// Which tier did the video reach? (highest tier whose target ≤ actual views)
export function resolveWinningTier(
  outcomes: { id: string; target_views: number }[],
  actualViews: number
): string | null {
  const sorted = [...outcomes].sort((a, b) => b.target_views - a.target_views)
  for (const o of sorted) {
    if (actualViews >= o.target_views) return o.id
  }
  return null // didn't reach any tier
}
