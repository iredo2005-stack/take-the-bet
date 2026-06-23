import { createAdminClient } from '@/lib/supabase/admin'
import { PLATFORMS, type PlatformKey, formatFollowers } from '@/lib/platforms'
import ApprovalButtons from './ApprovalButtons'

export default async function AdminPage() {
  const supabase = createAdminClient()
  const { data: pending } = await supabase.from('creators').select('*').eq('status', 'pending').order('created_at', { ascending: true })
  const { data: recent } = await supabase.from('creators').select('*').in('status', ['approved', 'rejected']).order('updated_at', { ascending: false }).limit(20)

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Creator Applications</h1>
      <h2 className="text-lg font-semibold text-white mb-3">Pending Review
        {pending && pending.length > 0 && <span className="ml-2 text-sm bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded-full">{pending.length}</span>}
      </h2>
      {!pending || pending.length === 0 ? (
        <div className="bg-card border border-edge rounded-2xl p-6 text-center mb-10"><p className="text-gray-500">No pending applications.</p></div>
      ) : (
        <div className="space-y-4 mb-10">{pending.map((c) => <AppCard key={c.id} creator={c} showActions />)}</div>
      )}
      <h2 className="text-lg font-semibold text-white mb-3">Recent Decisions</h2>
      {!recent || recent.length === 0 ? (
        <div className="bg-card border border-edge rounded-2xl p-6 text-center"><p className="text-gray-500">No decisions yet.</p></div>
      ) : (
        <div className="space-y-3">{recent.map((c) => <AppCard key={c.id} creator={c} showActions={false} />)}</div>
      )}
    </div>
  )
}

function AppCard({ creator, showActions }: { creator: any; showActions: boolean }) {
  const p = creator.platform ? PLATFORMS[creator.platform as PlatformKey] : null
  const sc: Record<string, string> = { pending: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', approved: 'text-up bg-up/10 border-up/20', rejected: 'text-down bg-down/10 border-down/20' }
  return (
    <div className="bg-card border border-edge rounded-2xl p-5">
      <div className="flex items-start gap-4">
        {creator.photo_url ? <img src={creator.photo_url} alt={creator.display_name} className="w-14 h-14 rounded-xl object-cover border border-edge flex-shrink-0" />
        : <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center text-accent text-xl font-bold flex-shrink-0">{creator.display_name[0]}</div>}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap"><h3 className="text-white font-semibold">{creator.display_name}</h3><span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${sc[creator.status] || ''}`}>{creator.status}</span></div>
          {p && <div className="flex items-center gap-3 text-sm text-gray-400 mb-2"><span className="text-white font-medium">{p.label}</span><span>{formatFollowers(creator.declared_followers)} {p.unit}</span></div>}
          {creator.profile_url && <a href={creator.profile_url} target="_blank" rel="noopener noreferrer" className="text-accent text-sm underline underline-offset-2 mb-2 inline-block">View profile →</a>}
          {creator.bio && <p className="text-gray-500 text-sm leading-relaxed mt-1">{creator.bio}</p>}
          <p className="text-[#8A8A82] text-xs mt-2">/c/{creator.slug}</p>
        </div>
      </div>
      {showActions && <div className="mt-4 pt-4 border-t border-edge"><ApprovalButtons creatorId={creator.id} /></div>}
    </div>
  )
}
