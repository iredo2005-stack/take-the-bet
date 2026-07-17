import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export type Tier = 'bronze' | 'silver' | 'gold' | 'alpha'

// Trailing 30-day ROI thresholds gating access to each chatroom tier.
const TIER_THRESHOLDS: { tier: Tier; minRoi: number }[] = [
  { tier: 'alpha', minRoi: 0.5 },
  { tier: 'gold', minRoi: 0.25 },
  { tier: 'silver', minRoi: 0.1 },
  { tier: 'bronze', minRoi: -Infinity },
]

const TOKEN_TTL_SECONDS = 15 * 60

function tierSecret(): string {
  const secret = process.env.TIER_TOKEN_SECRET
  if (!secret) throw new Error('TIER_TOKEN_SECRET not configured')
  return secret
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

// A minimal HMAC-SHA256-signed token (HS256 JWT, hand-rolled) so this stays
// dependency-free: header.payload.signature, same shape as a real JWT.
export function issueTierToken(userId: string, tier: Tier): { token: string; expiresAt: string } {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({ sub: userId, tier, exp }))
  const signature = base64url(createHmac('sha256', tierSecret()).update(`${header}.${payload}`).digest())

  return { token: `${header}.${payload}.${signature}`, expiresAt: new Date(exp * 1000).toISOString() }
}

export function verifyTierToken(token: string): { userId: string; tier: Tier } {
  const [header, payload, signature] = token.split('.')
  if (!header || !payload || !signature) throw new Error('malformed_token')

  const expected = base64url(createHmac('sha256', tierSecret()).update(`${header}.${payload}`).digest())
  const expectedBuf = Buffer.from(expected)
  const providedBuf = Buffer.from(signature)
  if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
    throw new Error('invalid_signature')
  }

  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  if (typeof decoded.exp !== 'number' || decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('token_expired')
  }
  return { userId: decoded.sub, tier: decoded.tier }
}

// ROI over the trailing 30 days = realized PnL / capital deployed, pooled
// across closed leverage positions and resolved prediction tickets.
export async function computeRoi30d(supabase: ReturnType<typeof createAdminClient>, userId: string) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: positions } = await supabase
    .from('leveraged_positions')
    .select('pnl_cents, collateral_cents')
    .eq('user_id', userId)
    .in('status', ['closed', 'liquidated'])
    .gte('closed_at', since)

  const { data: tickets } = await supabase
    .from('prediction_tickets')
    .select('amount_cents, payout_cents')
    .eq('user_id', userId)
    .not('payout_cents', 'is', null)
    .gte('created_at', since)

  let realizedPnlCents = 0
  let capitalDeployedCents = 0

  for (const p of positions || []) {
    realizedPnlCents += p.pnl_cents ?? 0
    capitalDeployedCents += p.collateral_cents
  }
  for (const t of tickets || []) {
    realizedPnlCents += (t.payout_cents ?? 0) - t.amount_cents
    capitalDeployedCents += t.amount_cents
  }

  const roi = capitalDeployedCents > 0 ? realizedPnlCents / capitalDeployedCents : 0
  return { roi, realizedPnlCents, capitalDeployedCents }
}

export function tierForRoi(roi: number): Tier {
  return TIER_THRESHOLDS.find((t) => roi >= t.minRoi)!.tier
}

// Does `tier` meet or exceed the room's required tier?
const TIER_RANK: Record<Tier, number> = { bronze: 0, silver: 1, gold: 2, alpha: 3 }
export function meetsTier(userTier: Tier, requiredTier: Tier): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[requiredTier]
}
