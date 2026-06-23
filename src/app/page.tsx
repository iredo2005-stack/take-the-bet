import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-bg flex flex-col">
      <nav className="bg-card px-6 py-4 flex items-center justify-between border-b border-edge">
        <span className="text-accent font-bold text-lg tracking-tight">Take The Bet</span>
        <div className="flex items-center gap-3">
          <Link href="/sign-in" className="text-sm text-[#8A8A82] hover:text-[#F5F5F0] transition-colors px-3 py-1.5">Log in</Link>
          <Link href="/sign-up" className="text-sm bg-accent hover:bg-accent-hover text-bg font-semibold px-4 py-2 rounded-lg transition-colors">Sign up</Link>
        </div>
      </nav>
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-xl w-full">
          <div className="inline-flex items-center gap-1.5 bg-card border border-edge text-[#8A8A82] text-xs font-medium px-3 py-1 rounded-full mb-8">
            <span className="w-1.5 h-1.5 bg-accent rounded-full" />Live on testnet
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-[#F5F5F0] leading-[1.1] mb-5 tracking-tight">The stock market<br /><span className="text-accent">for people.</span></h1>
          <p className="text-[#8A8A82] text-lg mb-10 leading-relaxed max-w-md mx-auto">Buy shares in creators you believe in. Prices rise with demand. Profit when they grow.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/sign-up" className="bg-accent hover:bg-accent-hover text-bg font-semibold px-8 py-3 rounded-xl transition-colors">Start trading</Link>
            <Link href="/sign-in" className="bg-card hover:bg-subtle border border-edge text-[#F5F5F0] font-semibold px-8 py-3 rounded-xl transition-colors">I have an account</Link>
          </div>
          <div className="flex items-center justify-center gap-8 mt-14 text-sm">
            <div><div className="text-accent font-bold text-lg">$0 fees</div><div className="text-[#8A8A82]">to sign up</div></div>
            <div className="w-px h-8 bg-edge" />
            <div><div className="text-accent font-bold text-lg">5%</div><div className="text-[#8A8A82]">commission only</div></div>
            <div className="w-px h-8 bg-edge" />
            <div><div className="text-accent font-bold text-lg">18+</div><div className="text-[#8A8A82]">verified</div></div>
          </div>
        </div>
      </div>
    </main>
  )
}
