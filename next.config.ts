import type { NextConfig } from 'next'

// deploy: cad6e82 — Short buttons, HC currency, 2%/1% fees
const nextConfig: NextConfig = {
  allowedDevOrigins: ['http://10.0.0.3:3001', 'http://10.0.0.3:3000'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
}

export default nextConfig
