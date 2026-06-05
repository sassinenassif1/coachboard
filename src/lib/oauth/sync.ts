import type { SupabaseClient } from '@supabase/supabase-js'
import { type FitnessProvider, getProviderLabel } from './providers'

interface SyncResult {
  activities: number
  sleepLogs: number
  linked: number
}

interface StravaActivity {
  id: number
  name?: string
  type?: string
  sport_type?: string
  start_date?: string
  distance?: number
  moving_time?: number
  elapsed_time?: number
  average_heartrate?: number
  max_heartrate?: number
  average_speed?: number
  total_elevation_gain?: number
}

interface WhoopCollection<T> {
  records?: T[]
}

interface WhoopProfile {
  user_id?: number
}

interface WhoopWorkout {
  id: string
  start?: string
  end?: string
  sport_name?: string
  score?: {
    average_heart_rate?: number
    max_heart_rate?: number
  }
}

interface WhoopSleep {
  id: string
  start?: string
  score?: {
    sleep_performance_percentage?: number
    stage_summary?: {
      total_in_bed_time_milli?: number
      total_awake_time_milli?: number
      total_light_sleep_time_milli?: number
      total_slow_wave_sleep_time_milli?: number
      total_rem_sleep_time_milli?: number
    }
  }
}

interface WhoopRecovery {
  sleep_id?: string
  score?: {
    recovery_score?: number
    resting_heart_rate?: number
    hrv_rmssd_milli?: number
  }
}

async function providerFetch<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error(`Provider request failed (${response.status}): ${await response.text()}`)
  }

  return response.json()
}

function secondsPerKm(distanceMeters?: number, durationSeconds?: number) {
  if (!distanceMeters || !durationSeconds) return null
  return Math.round(durationSeconds / (distanceMeters / 1000))
}

function minutesFromMs(value?: number) {
  return value == null ? null : Math.round(value / 60000)
}

function dateOnly(value?: string) {
  return value ? value.split('T')[0] : new Date().toISOString().split('T')[0]
}

export async function fetchProviderExternalUserId(provider: FitnessProvider, accessToken: string) {
  if (provider === 'strava') {
    const athlete = await providerFetch<{ id?: number }>('https://www.strava.com/api/v3/athlete', accessToken)
    return athlete.id ? String(athlete.id) : null
  }

  const profile = await providerFetch<WhoopProfile>(
    'https://api.prod.whoop.com/developer/v2/user/profile/basic',
    accessToken
  )
  return profile.user_id ? String(profile.user_id) : null
}

export async function syncProviderData(
  supabase: SupabaseClient,
  provider: FitnessProvider,
  userId: string,
  accessToken: string
): Promise<SyncResult> {
  let result: SyncResult

  if (provider === 'strava') {
    result = await syncStravaActivities(supabase, userId, accessToken)
  } else {
    result = await syncWhoopData(supabase, userId, accessToken)
  }

  // Auto-link activities to planned sessions
  const linked = await linkActivitiesToSessions(supabase, userId)
  result.linked = linked

  return result
}

async function syncStravaActivities(
  supabase: SupabaseClient,
  userId: string,
  accessToken: string
): Promise<SyncResult> {
  // Paginate through the athlete's ENTIRE activity history (no date filter)
  const activities: StravaActivity[] = []
  let page = 1
  const perPage = 200
  while (true) {
    const batch = await providerFetch<StravaActivity[]>(
      `https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${perPage}`,
      accessToken
    )
    activities.push(...batch)
    if (batch.length < perPage) break
    page++
    if (page > 50) break // safety limit: 10,000 activities max
  }

  const rows = activities.map((activity) => ({
    client_id: userId,
    provider: 'strava',
    external_id: String(activity.id),
    start_time: activity.start_date,
    type: activity.sport_type || activity.type || 'activity',
    name: activity.name || 'Strava activity',
    distance_km: activity.distance != null ? activity.distance / 1000 : null,
    duration_sec: activity.moving_time ?? activity.elapsed_time ?? null,
    avg_hr: activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
    max_hr: activity.max_heartrate ?? null,
    avg_pace_sec_per_km: secondsPerKm(activity.distance, activity.moving_time),
    elevation_gain_m: activity.total_elevation_gain ?? null,
    raw_data: activity,
    synced_at: new Date().toISOString(),
  }))

  if (rows.length > 0) {
    const { error } = await supabase.from('activities').upsert(rows, { onConflict: 'provider,external_id' })
    if (error) throw new Error(`Could not save ${getProviderLabel('strava')} activities: ${error.message}`)
  }

  return { activities: rows.length, sleepLogs: 0, linked: 0 }
}

async function syncWhoopData(
  supabase: SupabaseClient,
  userId: string,
  accessToken: string
): Promise<SyncResult> {
  const start = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString()
  const [workouts, sleeps, recoveries] = await Promise.all([
    providerFetch<WhoopCollection<WhoopWorkout>>(
      `https://api.prod.whoop.com/developer/v2/activity/workout?limit=25&start=${encodeURIComponent(start)}`,
      accessToken
    ),
    providerFetch<WhoopCollection<WhoopSleep>>(
      `https://api.prod.whoop.com/developer/v2/activity/sleep?limit=25&start=${encodeURIComponent(start)}`,
      accessToken
    ),
    providerFetch<WhoopCollection<WhoopRecovery>>(
      `https://api.prod.whoop.com/developer/v2/recovery?limit=25&start=${encodeURIComponent(start)}`,
      accessToken
    ),
  ])

  const activityRows = (workouts.records || []).map((workout) => ({
    client_id: userId,
    provider: 'whoop',
    external_id: workout.id,
    start_time: workout.start,
    type: workout.sport_name || 'workout',
    name: workout.sport_name ? `WHOOP ${workout.sport_name}` : 'WHOOP workout',
    distance_km: null,
    duration_sec: workout.start && workout.end
      ? Math.max(0, Math.round((Date.parse(workout.end) - Date.parse(workout.start)) / 1000))
      : null,
    avg_hr: workout.score?.average_heart_rate ?? null,
    max_hr: workout.score?.max_heart_rate ?? null,
    avg_pace_sec_per_km: null,
    elevation_gain_m: null,
    raw_data: workout,
    synced_at: new Date().toISOString(),
  }))

  const recoveryBySleepId = new Map(
    (recoveries.records || [])
      .filter((recovery) => recovery.sleep_id)
      .map((recovery) => [recovery.sleep_id as string, recovery])
  )

  const sleepRows = (sleeps.records || []).map((sleep) => {
    const stage = sleep.score?.stage_summary
    const recovery = recoveryBySleepId.get(sleep.id)
    return {
      client_id: userId,
      provider: 'whoop',
      date: dateOnly(sleep.start),
      total_minutes: minutesFromMs(stage?.total_in_bed_time_milli),
      deep_minutes: minutesFromMs(stage?.total_slow_wave_sleep_time_milli),
      rem_minutes: minutesFromMs(stage?.total_rem_sleep_time_milli),
      light_minutes: minutesFromMs(stage?.total_light_sleep_time_milli),
      awake_minutes: minutesFromMs(stage?.total_awake_time_milli),
      hrv_ms: recovery?.score?.hrv_rmssd_milli ? Math.round(recovery.score.hrv_rmssd_milli) : null,
      resting_hr: recovery?.score?.resting_heart_rate ?? null,
      sleep_score: recovery?.score?.recovery_score ?? sleep.score?.sleep_performance_percentage ?? null,
      raw_data: { sleep, recovery: recovery || null },
      synced_at: new Date().toISOString(),
    }
  })

  if (activityRows.length > 0) {
    const { error } = await supabase.from('activities').upsert(activityRows, { onConflict: 'provider,external_id' })
    if (error) throw new Error(`Could not save ${getProviderLabel('whoop')} workouts: ${error.message}`)
  }

  if (sleepRows.length > 0) {
    const { error } = await supabase.from('sleep_logs').upsert(sleepRows, { onConflict: 'client_id,provider,date' })
    if (error) throw new Error(`Could not save ${getProviderLabel('whoop')} sleep: ${error.message}`)
  }

  return { activities: activityRows.length, sleepLogs: sleepRows.length, linked: 0 }
}

// ── Activity↔Session Auto-Linking ──────────────────────────────
//
// Matches unlinked activities to planned sessions based on:
// 1. Same date (activity start_time date == session scheduled_date)
// 2. Compatible type (run activity → run session, etc.)
// 3. Session not already linked
// 4. Session status updated to 'done' on match

const ACTIVITY_TYPE_MAP: Record<string, string[]> = {
  // Strava sport_type/type → session types
  Run: ['run'],
  TrailRun: ['run'],
  VirtualRun: ['run'],
  Walk: ['run', 'mobility'],
  Hike: ['run', 'cross_training'],
  Ride: ['cross_training'],
  VirtualRide: ['cross_training'],
  Swim: ['cross_training'],
  WeightTraining: ['strength'],
  Crossfit: ['strength', 'cross_training'],
  Yoga: ['mobility'],
  Workout: ['strength', 'cross_training'],
  // Whoop types
  Running: ['run'],
  Cycling: ['cross_training'],
  'Functional Fitness': ['strength', 'cross_training'],
  Stretching: ['mobility'],
}

function activityMatchesSession(activityType: string, sessionType: string): boolean {
  const mappedTypes = ACTIVITY_TYPE_MAP[activityType]
  if (mappedTypes) return mappedTypes.includes(sessionType)
  // Fallback: fuzzy match on common keywords
  const lower = activityType.toLowerCase()
  if (sessionType === 'run' && (lower.includes('run') || lower.includes('jog'))) return true
  if (sessionType === 'strength' && (lower.includes('weight') || lower.includes('strength') || lower.includes('lift'))) return true
  if (sessionType === 'cross_training' && (lower.includes('ride') || lower.includes('swim') || lower.includes('cross'))) return true
  if (sessionType === 'mobility' && (lower.includes('yoga') || lower.includes('stretch') || lower.includes('mobility'))) return true
  return false
}

async function linkActivitiesToSessions(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  // Get unlinked activities from the last 30 days
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: unlinkedActivities } = await supabase
    .from('activities')
    .select('id, start_time, type')
    .eq('client_id', userId)
    .gte('start_time', since)
    .order('start_time', { ascending: false })

  if (!unlinkedActivities?.length) return 0

  // Get planned (unlinkable) sessions for the same period
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, scheduled_date, type, status, linked_activity_id')
    .eq('client_id', userId)
    .gte('scheduled_date', startDate)
    .is('linked_activity_id', null)
    .in('status', ['planned', 'modified'])

  if (!sessions?.length) return 0

  let linked = 0

  for (const activity of unlinkedActivities) {
    const activityDate = (activity.start_time as string)?.split('T')[0]
    if (!activityDate) continue

    // Find a matching session: same date, compatible type, not yet linked
    const match = sessions.find(
      (s) =>
        (s.scheduled_date as string) === activityDate &&
        activityMatchesSession(activity.type as string, s.type as string) &&
        !s.linked_activity_id
    )

    if (match) {
      const { error } = await supabase
        .from('sessions')
        .update({
          linked_activity_id: activity.id,
          status: 'done',
        })
        .eq('id', match.id)

      if (!error) {
        // Mark this session as linked so we don't match it again in this loop
        match.linked_activity_id = activity.id
        linked++
      }
    }
  }

  return linked
}
