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
        bg:      '#F5F7FA',
        card:    '#FFFFFF',
        subtle:  '#F0F2F5',
        edge:    '#EAECEF',
        muted:   '#D1D5DB',
        accent:  { DEFAULT: '#F0B90B', hover: '#D4A200', dim: '#8A6D00' },
        gold:    { DEFAULT: '#F0B90B', light: '#FFF1BF', dark: '#8A6D00' },
        up:      { DEFAULT: '#0ECB81', bright: '#0ECB81', muted: '#E7F8F1' },
        down:    { DEFAULT: '#F6465D', bright: '#F87171', muted: '#FDECEF' },
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
