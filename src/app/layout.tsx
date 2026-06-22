import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Take The Bet — The stock market for people',
  description: 'Buy shares in creators you believe in. Profit when they grow.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#3B82F6',
          colorBackground: '#141519',
          colorInputBackground: '#1A1D23',
          colorInputText: '#E5E7EB',
          colorText: '#E5E7EB',
        },
      }}
    >
      <html lang="en" className={inter.variable}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}
