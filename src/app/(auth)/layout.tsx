import { Logo } from '@/components/Logo'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-bg flex flex-col items-center justify-center px-4">
      <a href="/" className="mb-10"><Logo size="lg" /></a>
      {children}
    </main>
  )
}
