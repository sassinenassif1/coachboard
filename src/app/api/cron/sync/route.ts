import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { type FitnessProvider, refreshAccessToken, getTokenExpiry } from '@/lib/oauth/providers'
import { syncProviderData } from '@/lib/oauth/sync'

// Vercel cron: runs every 4 hours
// Configure in vercel.ts or vercel.json:
//   crons: [{ path: '/api/cron/sync', schedule: '0 */4 * * *' }]

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 })
  }

  // Use service role client to bypass RLS — we need to read all provider_connections
  const supabase = createServiceClient(supabaseUrl, serviceRoleKey)

  const { data: connections, error: fetchError } = await supabase
    .from('provider_connections')
    .select('id, user_id, provider, access_token, refresh_token, expires_at, last_sync_at')

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  if (!connections?.length) {
    return NextResponse.json({ message: 'No connections to sync', synced: 0 })
  }

  const results: {
    userId: string
    provider: string
    activities: number
    sleepLogs: number
    linked: number
    error?: string
  }[] = []

  for (const connection of connections) {
    const provider = connection.provider as FitnessProvider
    let accessToken = connection.access_token as string
    const refreshToken = connection.refresh_token as string | null
    const expiresAt = connection.expires_at ? Date.parse(connection.expires_at as string) : null

    try {
      // Refresh token if expired or expiring within 5 minutes
      if (refreshToken && expiresAt && expiresAt <= Date.now() + 5 * 60 * 1000) {
        const refreshed = await refreshAccessToken(provider, refreshToken)
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

      const result = await syncProviderData(supabase, provider, connection.user_id as string, accessToken)

      await supabase
        .from('provider_connections')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', connection.id)

      results.push({
        userId: connection.user_id as string,
        provider,
        activities: result.activities,
        sleepLogs: result.sleepLogs,
        linked: result.linked,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error(`Sync failed for ${provider} (user ${connection.user_id}):`, message)
      results.push({
        userId: connection.user_id as string,
        provider,
        activities: 0,
        sleepLogs: 0,
        linked: 0,
        error: message,
      })
    }
  }

  const totalActivities = results.reduce((sum, r) => sum + r.activities, 0)
  const totalSleep = results.reduce((sum, r) => sum + r.sleepLogs, 0)
  const totalLinked = results.reduce((sum, r) => sum + r.linked, 0)
  const errors = results.filter(r => r.error).length

  return NextResponse.json({
    message: `Synced ${results.length} connections`,
    synced: results.length,
    totalActivities,
    totalSleep,
    totalLinked,
    errors,
    results,
  })
}
