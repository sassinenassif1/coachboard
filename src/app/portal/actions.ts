'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { type FitnessProvider, getTokenExpiry, isFitnessProvider, refreshAccessToken } from '@/lib/oauth/providers'
import { syncProviderData } from '@/lib/oauth/sync'

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

export async function syncProvider(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const providerValue = formData.get('provider')
  if (typeof providerValue !== 'string' || !isFitnessProvider(providerValue)) {
    return
  }

  const { data: connection } = await supabase
    .from('provider_connections')
    .select('*')
    .eq('user_id', user.id)
    .eq('provider', providerValue)
    .single()

  if (!connection?.access_token) {
    redirect(`/api/oauth/${providerValue}/start`)
  }

  let accessToken = connection.access_token as string
  const refreshToken = connection.refresh_token as string | null
  const expiresAt = connection.expires_at ? Date.parse(connection.expires_at as string) : null

  if (refreshToken && expiresAt && expiresAt <= Date.now() + 60_000) {
    const refreshed = await refreshAccessToken(providerValue as FitnessProvider, refreshToken)
    accessToken = refreshed.access_token

    await supabase
      .from('provider_connections')
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token || refreshToken,
        expires_at: getTokenExpiry(refreshed),
      })
      .eq('user_id', user.id)
      .eq('provider', providerValue)
  }

  await syncProviderData(supabase, providerValue, user.id, accessToken)

  await supabase
    .from('provider_connections')
    .update({ last_sync_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('provider', providerValue)

  revalidatePath('/portal')
}
