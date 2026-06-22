export type PlatformKey = 'youtube' | 'tiktok' | 'instagram' | 'twitter' | 'twitch'

export const PLATFORMS: Record<PlatformKey, { label: string; min: number; unit: string; placeholder: string }> = {
  youtube:   { label: 'YouTube',      min: 10_000, unit: 'subscribers', placeholder: 'https://youtube.com/@handle' },
  tiktok:    { label: 'TikTok',       min: 50_000, unit: 'followers',   placeholder: 'https://tiktok.com/@handle' },
  instagram: { label: 'Instagram',    min: 25_000, unit: 'followers',   placeholder: 'https://instagram.com/handle' },
  twitter:   { label: 'X (Twitter)',   min: 25_000, unit: 'followers',   placeholder: 'https://x.com/handle' },
  twitch:    { label: 'Twitch',       min: 5_000,  unit: 'followers',   placeholder: 'https://twitch.tv/handle' },
}

export const PLATFORM_KEYS = Object.keys(PLATFORMS) as PlatformKey[]

export function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}
