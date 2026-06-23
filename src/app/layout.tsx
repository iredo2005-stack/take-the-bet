import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import MobileNav from '@/components/MobileNav'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'Hype — The stock market for creators',
  description: 'Invest in creators early. Prices follow real growth. Profit when you spot winners.',
  icons: { icon: '/favicon.svg' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#D4AF37',
          colorBackground: '#16161A',
          colorInputBackground: '#1C1C20',
          colorInputText: '#F5F5F0',
          colorText: '#F5F5F0',
        },
      }}
    >
      <html lang="en" className={inter.variable}>
        <body className="pb-16 sm:pb-0">
          {children}
          <MobileNav />
        </body>
      </html>
    </ClerkProvider>
  )
}
