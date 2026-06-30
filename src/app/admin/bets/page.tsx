import { createAdminClient } from '@/lib/supabase/admin'
import CreateBetForm from './CreateBetForm'
import ResolveButton from './ResolveButton'
import CreateVideoBetsButton from './CreateVideoBetsButton'
import { formatCurrency } from '@/lib/utils'

export default async function AdminBetsPage() {
  const supabase = createAdminClient()

  // Big creators (500k+) for the dropdown
  const { data: creators } = await supabase.from('creators').select('*').eq('status', 'approved').gte('subscribers', 500000).order('subscribers', { ascending: false })

  // Also include those with declared_followers >= 500k
  const { data: creators2 } = await supabase.from('creators').select('*').eq('status', 'approved').gte('declared_followers', 500000)
  const allBig = [...(creators || []), ...(creators2 || [])].filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i)

  // Open bets
  const { data: openBets } = await supabase.from('video_bets').select('*, bet_outcomes(*), creators(display_name, photo_url)').eq('status', 'open').order('deadline', { ascending: true })

  // Resolved bets
  const { data: resolvedBets } = await supabase.from('video_bets').select('*, bet_outcomes(*), creators(display_name)').eq('status', 'resolved').order('created_at', { ascending: false }).limit(10)

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Video Bets</h1>

      {/* Create */}
      <div className="bg-card border border-edge rounded-2xl p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Create New Bet</h2>
          <CreateVideoBetsButton />
        </div>
        {allBig.length === 0 ? (
          <p className="text-gray-500 text-sm">No eligible creators (need 500K+ subscribers). Update creator metrics in Supabase first.</p>
        ) : (
          <CreateBetForm creators={allBig.map((c) => ({ id: c.id, name: c.display_name }))} />
        )}
      </div>

      {/* Open */}
      <h2 className="text-lg font-semibold text-white mb-3">Open Bets {openBets && openBets.length > 0 && <span className="ml-2 text-sm bg-accent/10 text-accent border border-accent/20 px-2 py-0.5 rounded-full">{openBets.length}</span>}</h2>
      {!openBets || openBets.length === 0 ? (
        <div className="bg-card border border-edge rounded-2xl p-6 text-center mb-8"><p className="text-gray-500">No open bets.</p></div>
      ) : (
        <div className="space-y-3 mb-8">
          {openBets.map((bet: any) => (
            <div key={bet.id} className="bg-card border border-edge rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-white font-semibold">{bet.question}</p>
                  <p className="text-gray-500 text-xs">{bet.creators?.display_name} · {bet.bet_type} · Pool {formatCurrency(Number(bet.total_pool))}</p>
                </div>
                <span className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded-full">open</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {(bet.bet_outcomes || []).sort((a: any, b: any) => a.sort_order - b.sort_order).map((o: any) => {
                  const pct = Number(bet.total_pool) > 0 ? Math.round((Number(o.pool_amount) / Number(bet.total_pool)) * 100) : Math.round(100 / (bet.bet_outcomes?.length || 1))
                  return <span key={o.id} className="bg-subtle text-gray-300 text-xs px-2 py-1 rounded">{o.label}: {pct}% ({formatCurrency(Number(o.pool_amount))})</span>
                })}
              </div>
              <ResolveButton betId={bet.id} outcomes={(bet.bet_outcomes || []).map((o: any) => ({ id: o.id, label: o.label }))} />
            </div>
          ))}
        </div>
      )}

      {/* Resolved */}
      <h2 className="text-lg font-semibold text-white mb-3">Resolved</h2>
      {!resolvedBets || resolvedBets.length === 0 ? (
        <div className="bg-card border border-edge rounded-2xl p-6 text-center"><p className="text-gray-500">No resolved bets yet.</p></div>
      ) : (
        <div className="space-y-3">
          {resolvedBets.map((bet: any) => (
            <div key={bet.id} className="bg-card border border-edge rounded-xl p-4 opacity-60">
              <p className="text-white font-semibold">{bet.question}</p>
              <p className="text-gray-500 text-xs">{bet.creators?.display_name} · Pool {formatCurrency(Number(bet.total_pool))} · Winner: {(bet.bet_outcomes || []).find((o: any) => o.id === bet.winning_outcome_id)?.label || '?'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
