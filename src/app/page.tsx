import Link from 'next/link'
import { Logo } from '@/components/Logo'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-bg flex flex-col pb-16 sm:pb-0">
      <nav className="bg-card px-5 py-2.5 flex items-center justify-between border-b border-edge">
        <Logo size="sm" />
        <div className="flex items-center gap-2.5">
          <Link href="/sign-in" className="text-xs text-[#8A8A82] hover:text-[#F5F5F0] transition-colors px-2 py-1">Log in</Link>
          <Link href="/sign-up" className="text-xs bg-accent hover:bg-accent-hover text-bg font-semibold px-3.5 py-1.5 rounded-md transition-colors">Sign up</Link>
        </div>
      </nav>
      <div className="flex-1 flex flex-col items-center justify-center px-5 text-center">
        <div className="max-w-md w-full">
          <div className="inline-flex items-center gap-1.5 bg-card border border-edge text-[#8A8A82] text-[10px] font-medium px-2.5 py-1 rounded-full mb-6">
            <span className="w-1 h-1 bg-accent rounded-full" />Live on testnet
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-[#F5F5F0] leading-[1.1] mb-4 tracking-tight">The stock market<br /><span className="text-accent">for people.</span></h1>
          <p className="text-[#8A8A82] text-sm mb-8 leading-relaxed max-w-sm mx-auto">Buy shares in creators you believe in. Prices rise with demand. Profit when they grow.</p>
          <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
            <Link href="/sign-up" className="bg-accent hover:bg-accent-hover text-bg font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors">Start trading</Link>
            <Link href="/sign-in" className="bg-card hover:bg-subtle border border-edge text-[#F5F5F0] font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors">I have an account</Link>
          </div>
          <div className="flex items-center justify-center gap-6 mt-10 text-xs">
            <div><div className="text-accent font-bold text-sm">$0 fees</div><div className="text-[#8A8A82] text-[10px]">to sign up</div></div>
            <div className="w-px h-6 bg-edge" />
            <div><div className="text-accent font-bold text-sm">5%</div><div className="text-[#8A8A82] text-[10px]">commission</div></div>
            <div className="w-px h-6 bg-edge" />
            <div><div className="text-accent font-bold text-sm">18+</div><div className="text-[#8A8A82] text-[10px]">verified</div></div>
          </div>
        </div>
      </div>
    </main>
  )
}
