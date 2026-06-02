import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  buildAuthorizationUrl,
  getProviderLabel,
  isFitnessProvider,
} from '@/lib/oauth/providers'

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

  try {
    const state = randomUUID()
    const authorizationUrl = buildAuthorizationUrl(providerParam, request.nextUrl.origin, state)
    const response = NextResponse.redirect(authorizationUrl)

    response.cookies.set(`coachboard_oauth_state_${providerParam}`, state, {
      httpOnly: true,
      maxAge: 60 * 10,
      path: `/api/oauth/${providerParam}/callback`,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })

    return response
  } catch (error) {
    console.error(`${getProviderLabel(providerParam)} OAuth start failed`, error)
    redirect(`/portal?oauth_error=${providerParam}_not_configured`)
  }
}
