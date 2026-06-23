export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-bg flex flex-col items-center justify-center px-4">
      <a href="/" className="text-accent font-bold text-xl mb-10 tracking-tight hover:text-accent-hover transition-colors">
        Take The Bet
      </a>
      {children}
    </main>
  )
}
