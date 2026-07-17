// Client-safe tier config — no Node built-ins here, so this can be imported
// from both server routes and 'use client' components (unlike lib/tier.ts,
// which pulls in Node's 'crypto' for token signing).

export type Tier = 'bronze' | 'silver' | 'gold' | 'alpha'

export const ROOM_CONFIG: { tier: Tier; label: string; minRoi: number }[] = [
  { tier: 'bronze', label: 'Bronze', minRoi: 0 },
  { tier: 'silver', label: 'Silver', minRoi: 0.05 },
  { tier: 'gold', label: 'Gold', minRoi: 0.1 },
  { tier: 'alpha', label: 'Alpha', minRoi: 0.2 },
]

const TIER_RANK: Record<Tier, number> = { bronze: 0, silver: 1, gold: 2, alpha: 3 }

// Highest room whose ROI threshold the caller clears (bronze is always open).
export function tierForRoi(roi: number): Tier {
  let best: Tier = 'bronze'
  for (const room of ROOM_CONFIG) {
    if (roi >= room.minRoi && TIER_RANK[room.tier] > TIER_RANK[best]) best = room.tier
  }
  return best
}

export function meetsTier(userTier: Tier, requiredTier: Tier): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[requiredTier]
}

export function roomConfig(tier: Tier) {
  return ROOM_CONFIG.find((r) => r.tier === tier)!
}

// "Alpha Group - 20%+ ROI Required"
export function lockMessage(tier: Tier): string {
  const room = roomConfig(tier)
  return `${room.label} Group - ${Math.round(room.minRoi * 100)}%+ ROI Required`
}
