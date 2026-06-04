import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { refreshAccessToken, getTokenExpiry } from '@/lib/oauth/providers'
import { syncProviderData } from '@/lib/oauth/sync'

// ── Strava Webhook ─────────────────────────────────────────────
//
// Strava sends a POST to this endpoint whenever an athlete creates,
// updates, or deletes an activity. We verify the event, look up the
// athlete's provider_connection, and trigger a sync.
//
// Strava also sends a GET to validate the subscription (challenge).
//
// Setup:
// 1. Set STRAVA_WEBHOOK_VERIFY_TOKEN in env (any random string)
// 2. Create subscription via Strava API:
//    POST https://www.strava.com/api/v3/push_subscriptions
//    -d client_id=YOUR_ID
//    -d client_secret=YOUR_SECRET
//    -d callback_url=https://YOUR_DOMAIN/api/webhook/strava
//    -d verify_token=YOUR_VERIFY_TOKEN

// GET — Strava subscription validation (challenge-response)
export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  const verifyToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    // Respond with the challenge to confirm subscription
    return NextResponse.json({ 'hub.challenge': challenge })
  }

  return NextResponse.json({ error: 'Invalid verification' }, { status: 403 })
}

// POST — Strava event notification
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Missing config' }, { status: 500 })
  }

  let body: {
    object_type?: string
    object_id?: number
    aspect_type?: string
    owner_id?: number
    subscription_id?: number
    event_time?: number
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // We only care about activity events
  if (body.object_type !== 'activity') {
    return NextResponse.json({ ok: true, skipped: 'not an activity event' })
  }

  const stravaAthleteId = body.owner_id
  if (!stravaAthleteId) {
    return NextResponse.json({ ok: true, skipped: 'no owner_id' })
  }

  const supabase = createServiceClient(supabaseUrl, serviceRoleKey)

  // Find the provider_connection for this Strava athlete
  const { data: connection } = await supabase
    .from('provider_connections')
    .select('*')
    .eq('provider', 'strava')
    .eq('external_user_id', String(stravaAthleteId))
    .single()

  if (!connection) {
    return NextResponse.json({ ok: true, skipped: 'athlete not connected' })
  }

  try {
    let accessToken = connection.access_token as string
    const refreshToken = connection.refresh_token as string | null
    const expiresAt = connection.expires_at ? Date.parse(connection.expires_at as string) : null

    // Refresh token if needed
    if (refreshToken && expiresAt && expiresAt <= Date.now() + 60_000) {
      const refreshed = await refreshAccessToken('strava', refreshToken)
      accessToken = refreshed.access_token

      await supabase
        .from('provider_connections')
        .update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token || refreshToken,
          expires_at: getTokenExpiry(refreshed),
        })
        .eq('id', connection.id)
    }

    // Sync activities (fetches last 30 days, upserts, and auto-links)
    const result = await syncProviderData(supabase, 'strava', connection.user_id as string, accessToken)

    await supabase
      .from('provider_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connection.id)

    return NextResponse.json({
      ok: true,
      event: body.aspect_type,
      activities: result.activities,
      linked: result.linked,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`Strava webhook sync failed for athlete ${stravaAthleteId}:`, message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
