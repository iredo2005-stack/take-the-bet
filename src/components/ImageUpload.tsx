'use client'

import { useState, useRef } from 'react'

type Props = { label: string; value: string; onChange: (url: string) => void; required?: boolean; hint?: string }

export default function ImageUpload({ label, value, onChange, required, hint }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Please select an image file'); return }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5MB'); return }
    setUploading(true); setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Upload failed'); return }
      onChange(data.url)
    } catch { setError('Network error. Try again.') }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = '' }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">
        {label} {required && <span className="text-down">*</span>}
      </label>
      {value ? (
        <div className="relative group">
          <div className="rounded-xl overflow-hidden border border-edge h-40">
            <img src={value} alt="Uploaded" className="w-full h-full object-cover" />
          </div>
          <button type="button" onClick={() => { onChange(''); inputRef.current?.click() }}
            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
            <span className="text-white text-sm font-semibold">Change photo</span>
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
          className="w-full border-2 border-dashed border-edge hover:border-accent/50 rounded-xl h-40 flex flex-col items-center justify-center gap-2 transition-colors disabled:opacity-50 bg-subtle">
          {uploading ? (
            <><div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /><span className="text-gray-400 text-sm">Uploading…</span></>
          ) : (
            <><div className="w-10 h-10 rounded-full bg-card border border-edge flex items-center justify-center text-gray-400 text-lg">📷</div>
            <span className="text-gray-400 text-sm font-medium">Tap to upload a photo</span>
            <span className="text-gray-600 text-xs">JPG, PNG, WebP · Max 5MB</span></>
          )}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
      {error && <p className="text-down text-xs mt-2">{error}</p>}
      {hint && !error && <p className="text-gray-600 text-xs mt-1">{hint}</p>}
    </div>
  )
}
