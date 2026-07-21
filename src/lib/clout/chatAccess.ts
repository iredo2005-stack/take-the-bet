import { createHmac, timingSafeEqual } from 'crypto'

// Same hand-rolled HMAC-SHA256 token as Hype's lib/tier.ts (header.payload.signature,
// dependency-free) but scoped to a specific CLOUT alpha chat rather than a
// global tier, since CLOUT has multiple independently-thresholded rooms.

const TOKEN_TTL_SECONDS = 15 * 60

function chatTokenSecret(): string {
  const secret = process.env.CLOUT_CHAT_TOKEN_SECRET
  if (!secret) throw new Error('CLOUT_CHAT_TOKEN_SECRET not configured')
  return secret
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

export function issueChatAccessToken(userId: string, chatId: string): { token: string; expiresAt: string } {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({ sub: userId, chatId, exp }))
  const signature = base64url(createHmac('sha256', chatTokenSecret()).update(`${header}.${payload}`).digest())

  return { token: `${header}.${payload}.${signature}`, expiresAt: new Date(exp * 1000).toISOString() }
}

export function verifyChatAccessToken(token: string): { userId: string; chatId: string } {
  const [header, payload, signature] = token.split('.')
  if (!header || !payload || !signature) throw new Error('malformed_token')

  const expected = base64url(createHmac('sha256', chatTokenSecret()).update(`${header}.${payload}`).digest())
  const expectedBuf = Buffer.from(expected)
  const providedBuf = Buffer.from(signature)
  if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
    throw new Error('invalid_signature')
  }

  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  if (typeof decoded.exp !== 'number' || decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('token_expired')
  }
  return { userId: decoded.sub, chatId: decoded.chatId }
}
