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
        bg:      '#0B0E11',
        card:    '#141519',
        subtle:  '#1A1D23',
        edge:    '#22262E',
        muted:   '#2C3038',
        accent:  { DEFAULT: '#3B82F6', hover: '#2563EB' },
        up:      { DEFAULT: '#10B981', bright: '#34D399', muted: 'rgba(16,185,129,0.12)' },
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
