import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:      '#0A0A0B',
        card:    '#16161A',
        subtle:  '#1C1C20',
        edge:    '#2A2A2E',
        muted:   '#3A3A3E',
        accent:  { DEFAULT: '#D4AF37', hover: '#C9A227', dim: '#B8962A' },
        gold:    { DEFAULT: '#D4AF37', light: '#E8D48B', dark: '#A68B2A' },
        up:      { DEFAULT: '#22C55E', bright: '#34D399', muted: 'rgba(34,197,94,0.12)' },
        down:    { DEFAULT: '#EF4444', bright: '#F87171', muted: 'rgba(239,68,68,0.12)' },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['SF Mono', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
