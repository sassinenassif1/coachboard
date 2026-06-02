import { NextRequest, NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  exchangeCodeForToken,
  getProviderLabel,
  getTokenExpiry,
  isFitnessProvider,
} from '@/lib/oauth/providers'
import { fetchProviderExternalUserId, syncProviderData } from '@/lib/oauth/sync'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerParam } = await params

  if (!isFitnessProvider(providerParam)) {
    redirect('/portal?oauth_error=unsupported_provider')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const url = request.nextUrl
  const error = url.searchParams.get('error')
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const scope = url.searchParams.get('scope')
  const storedState = request.cookies.get(`coachboard_oauth_state_${providerParam}`)?.value
  const response = NextResponse.redirect(new URL('/portal', url.origin))

  response.cookies.delete(`coachboard_oauth_state_${providerParam}`)

  if (error || !code || !state || state !== storedState) {
    response.headers.set('Location', new URL(`/portal?oauth_error=${providerParam}`, url.origin).toString())
    return response
  }

  try {
    const token = await exchangeCodeForToken(providerParam, code, url.origin)
    const externalUserId = token.athlete?.id
      ? String(token.athlete.id)
      : await fetchProviderExternalUserId(providerParam, token.access_token)

    const { error: saveError } = await supabase.from('provider_connections').upsert({
      user_id: user.id,
      provider: providerParam,
      external_user_id: externalUserId,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: getTokenExpiry(token),
      scope: scope || token.scope || null,
      last_sync_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' })

    if (saveError) {
      throw new Error(saveError.message)
    }

    await syncProviderData(supabase, providerParam, user.id, token.access_token)

    response.headers.set('Location', new URL(`/portal?connected=${providerParam}`, url.origin).toString())
    return response
  } catch (callbackError) {
    console.error(`${getProviderLabel(providerParam)} OAuth callback failed`, callbackError)
    response.headers.set('Location', new URL(`/portal?oauth_error=${providerParam}`, url.origin).toString())
    return response
  }
}
