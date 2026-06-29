import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import LiveCard from './LiveCard'
import { Space_Grotesk, Space_Mono } from 'next/font/google'

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display' })
const spaceMono = Space_Mono({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-mono-about' })

export const metadata: Metadata = { title: 'Hype — How it works' }

export default function AboutPage() {
  return (
    <div className={`min-h-screen bg-[#0A0D18] text-[#EDEFF7] pb-20 sm:pb-0 ${spaceGrotesk.variable} ${spaceMono.variable}`}>
      {/* Radial glow bg */}
      <div className="fixed inset-0 pointer-events-none" style={{ background: 'radial-gradient(1100px 600px at 70% -5%, rgba(244,233,107,0.07), transparent 60%)' }} />

      <div className="relative max-w-[1040px] mx-auto px-5">

        {/* Nav */}
        <nav className="flex items-center justify-between py-5">
          <Link href="/" className="font-bold text-[22px] tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            H<span className="text-[#F4E96B]">ype</span>
          </Link>
          <Link href="/sign-in" className="text-sm font-semibold border border-white/[0.07] px-4 py-2 rounded-full hover:border-[#F4E96B] hover:text-[#F4E96B] transition-colors">
            I have an account
          </Link>
        </nav>

        {/* Hero */}
        <header className="grid grid-cols-1 md:grid-cols-[1.05fr_0.95fr] gap-8 md:gap-12 items-center py-10 md:py-12">
          <div>
            <div className="flex items-center gap-2 text-[#F4E96B] text-xs tracking-[0.32em] uppercase mb-5" style={{ fontFamily: 'var(--font-mono-about)' }}>
              <span className="w-[7px] h-[7px] rounded-full bg-[#F4E96B] animate-pulse-gold" />
              The stock market for creators
            </div>
            <h1 className="font-bold leading-[1.02] tracking-tight mb-5" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(40px, 6vw, 62px)', letterSpacing: '-0.03em' }}>
              Real growth moves<br />the price.<span className="block text-[#F4E96B]">Spot it first.</span>
            </h1>
            <p className="text-[#8A93B0] text-lg max-w-[30ch] mb-7 leading-relaxed">
              Hype turns creators into tradable stocks. Price rises when they&apos;re blowing up, drops when they stall. Catch the momentum before the crowd does.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/sign-up" className="inline-block font-semibold text-[15px] rounded-full px-6 py-3 bg-[#F4E96B] text-[#0A0D18] hover:bg-[#E7CF4A] hover:-translate-y-0.5 transition-all">
                Start with 10,000 coins
              </Link>
              <a href="#how" className="inline-block font-semibold text-[15px] rounded-full px-6 py-3 border border-white/[0.07] hover:border-[#F4E96B] hover:text-[#F4E96B] transition-colors">
                See how it works
              </a>
            </div>
          </div>

          {/* Live ticking card */}
          <LiveCard />
        </header>

        {/* How it works */}
        <section id="how" className="py-14 border-t border-white/[0.07]">
          <div className="text-[#F4E96B] text-xs tracking-[0.28em] uppercase mb-6" style={{ fontFamily: 'var(--font-mono-about)' }}>How it works</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { n: '01', arrow: true, title: 'A creator picks up speed', desc: "Their channel starts gaining followers faster than before. Hype tracks the growth rate in real time — not just the number, but the acceleration." },
              { n: '02', arrow: true, title: 'Momentum moves the price', desc: "Growing fast? Price surges. Slowing down? Price drops. It's not about being big — it's about who's heating up right now. Prices go up AND down." },
              { n: '03', arrow: false, title: 'You profit if you spotted it early', desc: "Buy before the spike, sell before the cooldown. The game is about catching momentum — not holding forever." },
            ].map((s) => (
              <div key={s.n} className="bg-[#0F1424] border border-white/[0.07] rounded-2xl p-5">
                <div className="text-[#F4E96B] text-[13px] font-bold tracking-wider" style={{ fontFamily: 'var(--font-mono-about)' }}>
                  {s.n} {s.arrow && <span className="text-[#F4E96B]">→</span>}
                </div>
                <h3 className="font-semibold text-[19px] mt-3 mb-2 tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>{s.title}</h3>
                <p className="text-[#8A93B0] text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Two audiences */}
        <section className="py-14 border-t border-white/[0.07]">
          <div className="text-[#F4E96B] text-xs tracking-[0.28em] uppercase mb-6" style={{ fontFamily: 'var(--font-mono-about)' }}>Two ways in</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-gradient-to-b from-[#151B30] to-[#0F1424] border border-[rgba(244,233,107,0.10)] rounded-2xl p-6">
              <div className="text-[#F4E96B] text-[11px] tracking-[0.2em] uppercase mb-3" style={{ fontFamily: 'var(--font-mono-about)' }}>If you watch creators</div>
              <h3 className="font-bold text-[22px] tracking-tight mb-2" style={{ fontFamily: 'var(--font-display)' }}>Bet on who blows up next.</h3>
              <p className="text-[#8A93B0] text-[15px] leading-relaxed">You already know which channel is about to take off. Now it counts for something. Buy in early, build a portfolio, and prove you saw it first.</p>
            </div>
            <div className="bg-gradient-to-b from-[#151B30] to-[#0F1424] border border-[rgba(244,233,107,0.10)] rounded-2xl p-6">
              <div className="text-[#F4E96B] text-[11px] tracking-[0.2em] uppercase mb-3" style={{ fontFamily: 'var(--font-mono-about)' }}>If you are a creator</div>
              <h3 className="font-bold text-[22px] tracking-tight mb-2" style={{ fontFamily: 'var(--font-display)' }}>Your growth is your stock.</h3>
              <p className="text-[#8A93B0] text-[15px] leading-relaxed">You don&apos;t just have an audience — you have a price. As you grow, your stock climbs, your fans win alongside you, and you earn a cut of every trade.</p>
            </div>
          </div>
        </section>

        {/* Honest / Early access */}
        <section className="py-14 border-t border-white/[0.07]">
          <div className="bg-[#0F1424] border border-[rgba(244,233,107,0.10)] rounded-2xl p-6 flex flex-col sm:flex-row gap-4 items-start">
            <span className="text-[10.5px] tracking-[0.18em] uppercase font-bold bg-[#F4E96B] text-[#0A0D18] px-3 py-1.5 rounded-lg whitespace-nowrap" style={{ fontFamily: 'var(--font-mono-about)' }}>Early access</span>
            <div>
              <h3 className="font-semibold text-lg mb-1.5" style={{ fontFamily: 'var(--font-display)' }}>Right now, it&apos;s a game.</h3>
              <p className="text-[#8A93B0] text-sm leading-relaxed">
                You trade with virtual <span className="text-[#F4E96B] font-semibold">Hype Coins</span> — no real money, no risk, just the leaderboard and bragging rights. Real-money trading comes later. Everyone starts with <span className="text-[#F4E96B] font-semibold">10,000 coins free</span>.
              </p>
            </div>
          </div>
        </section>

        {/* Close CTA */}
        <div className="text-center py-16 border-t border-white/[0.07]">
          <h2 className="font-bold tracking-tight mb-3" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(30px, 4.4vw, 44px)', letterSpacing: '-0.02em' }}>
            That&apos;s the whole idea.
          </h2>
          <p className="text-[#8A93B0] text-lg mb-7">Find the next big creator before everyone else.</p>
          <Link href="/sign-up" className="inline-block font-semibold text-[15px] rounded-full px-6 py-3 bg-[#F4E96B] text-[#0A0D18] hover:bg-[#E7CF4A] hover:-translate-y-0.5 transition-all">
            Start with 10,000 coins
          </Link>
          <Link href="/dashboard/become-creator" className="block mt-4 text-[#8A93B0] text-sm hover:text-[#F4E96B] transition-colors">
            Are you a creator? Apply to get listed →
          </Link>
        </div>

        <footer className="text-center text-[#8A93B0] text-xs py-8 tracking-wider" style={{ fontFamily: 'var(--font-mono-about)' }}>
          HYPE — VIRTUAL TRADING · 18+ · v0
        </footer>
      </div>
    </div>
  )
}
