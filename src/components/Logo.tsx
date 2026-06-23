// Full logo: icon + "Hype" text (for headers)
export function Logo({ className = '', size = 'sm' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const h = size === 'lg' ? 28 : size === 'md' ? 22 : 18
  const textSize = size === 'lg' ? 'text-lg' : size === 'md' ? 'text-sm' : 'text-xs'

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <LogoIcon height={h} />
      <span className={`font-bold tracking-tight text-accent ${textSize}`}>Hype</span>
    </span>
  )
}

// Icon only (for favicon, small spaces, mobile nav)
export function LogoIcon({ height = 20 }: { height?: number }) {
  const w = Math.round(height * 0.85)
  return (
    <svg width={w} height={height} viewBox="0 0 34 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Letter H formed from two vertical bars + an upward trending line connecting them */}
      {/* Left bar */}
      <rect x="2" y="4" width="5.5" height="32" rx="2.75" fill="#D4AF37" />
      {/* Right bar */}
      <rect x="26.5" y="4" width="5.5" height="32" rx="2.75" fill="#D4AF37" />
      {/* Rising crossbar — angled upward from left to right like a chart line */}
      <path
        d="M7.5 24 L14 22 L20 18 L26.5 13"
        stroke="#D4AF37"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Small arrow tip at the top of the rising line */}
      <path
        d="M23 11 L27 12.5 L25.5 8"
        stroke="#D4AF37"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
