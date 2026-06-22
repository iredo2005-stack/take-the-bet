import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 })
    }

    // 5MB limit
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image must be under 5MB' }, { status: 400 })
    }

    const ext = file.name.split('.').pop() || 'jpg'
    const filePath = `${userId}/${Date.now()}.${ext}`

    const supabase = createAdminClient()

    const { error: uploadError } = await supabase.storage
      .from('creator-photos')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      console.error('[upload] Storage error:', uploadError)
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage
      .from('creator-photos')
      .getPublicUrl(filePath)

    return NextResponse.json({ url: publicUrl })
  } catch (err) {
    console.error('[upload] Unexpected error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
