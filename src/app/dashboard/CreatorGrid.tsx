'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatCurrency, formatNumber } from '@/lib/utils'

type CreatorListing = {
  id: string
  display_name: string
  slug: string
  photo_url: string | null
  bio: string | null
  offering: { title: string; image_url: string | null; current_price: number; shares_sold: number; total_shares: number; shares_available: number }
}

export default function CreatorGrid({ creators }: { creators: CreatorListing[] }) {
  const [search, setSearch] = useState('')
  const filtered = creators.filter((c) => {
    const q = search.toLowerCase()
    return c.display_name.toLowerCase().includes(q) || c.offering.title.toLowerCase().includes(q) || (c.bio || '').toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="relative mb-5">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search creators..."
          className="w-full bg-card border border-edge rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition" />
      </div>
      {filtered.length === 0 ? (
        <div className="bg-card border border-edge rounded-2xl p-8 text-center"><p className="text-gray-500">{search ? 'No creators match your search.' : 'No creators with active offerings yet.'}</p></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((c) => <CreatorCard key={c.id} creator={c} />)}
        </div>
      )}
    </div>
  )
}

function CreatorCard({ creator }: { creator: CreatorListing }) {
  const { offering } = creator
  const percentSold = offering.total_shares > 0 ? Math.round((offering.shares_sold / offering.total_shares) * 100) : 0
  const imageUrl = offering.image_url || creator.photo_url

  return (
    <Link href={`/c/${creator.slug}`} className="group bg-card border border-edge rounded-2xl overflow-hidden hover:border-muted hover:shadow-lg hover:shadow-black/20 transition-all">
      {imageUrl ? (
        <div className="h-36 overflow-hidden"><img src={imageUrl} alt={creator.display_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" /></div>
      ) : (
        <div className="h-36 bg-subtle flex items-center justify-center"><span className="text-5xl font-bold text-gray-700">{creator.display_name[0]}</span></div>
      )}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-1">
          {creator.photo_url && <img src={creator.photo_url} alt="" className="w-6 h-6 rounded-full object-cover" />}
          <h3 className="text-white font-semibold text-sm truncate">{creator.display_name}</h3>
        </div>
        <p className="text-gray-500 text-xs mb-3 line-clamp-2 leading-relaxed">{offering.title}</p>
        <div className="flex items-center justify-between">
          <div><p className="text-white font-bold">{formatCurrency(offering.current_price)}</p><p className="text-gray-500 text-xs">per share</p></div>
          <div className="text-right">
            <p className="text-gray-300 text-sm font-medium">{formatNumber(offering.shares_sold)} sold</p>
            <div className="w-20 h-1.5 bg-subtle rounded-full overflow-hidden mt-1"><div className="h-full bg-accent rounded-full" style={{ width: `${percentSold}%` }} /></div>
          </div>
        </div>
      </div>
    </Link>
  )
}
