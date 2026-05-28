'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

export async function addComment(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const sessionId = formData.get('session_id') as string
  const body = formData.get('body') as string

  if (!body?.trim()) return

  await supabase.from('session_comments').insert({
    session_id: sessionId,
    author_id: user.id,
    body: body.trim(),
  })

  revalidatePath('/portal')
}
