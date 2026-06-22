import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: ['http://10.0.0.3:3001', 'http://10.0.0.3:3000'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
}

export default nextConfig
