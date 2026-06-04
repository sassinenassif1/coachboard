import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Zap, LogOut, ArrowLeft, Activity, Moon, Heart, TrendingUp } from 'lucide-react'
import { logout } from '../../../actions'

type Tab = 'activities' | 'sleep' | 'recovery'

interface ActivityRow {
  id: string
  provider: string
  start_time: string
  type: string | null
  name: string | null
  distance_km: number | null
  duration_sec: number | null
  avg_hr: number | null
  max_hr: number | null
  avg_pace_sec_per_km: number | null
  elevation_gain_m: number | null
}

interface SleepRow {
  id: string
  date: string
  provider: string
  total_minutes: number | null
  deep_minutes: number | null
  rem_minutes: number | null
  light_minutes: number | null
  awake_minutes: number | null
  hrv_ms: number | null
  resting_hr: number | null
  sleep_score: number | null
}

function formatDate(value: string) {
  return new Date(value.includes('T') ? value : value + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatDuration(seconds: number | null) {
  if (!seconds) return '-'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

function formatSleep(minutes: number | null) {
  if (!minutes) return '-'
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function formatPace(seconds: number | null) {
  if (!seconds) return '-'
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}/km`
}

export default async function CoachClientHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { clientId } = await params
  const query = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'coach') redirect('/portal')

  // Verify active link
  const { data: link } = await supabase
    .from('coach_client')
    .select('id')
    .eq('coach_id', user.id)
    .eq('client_id', clientId)
    .eq('status', 'active')
    .single()

  if (!link) redirect('/portal/coach')

  const { data: client } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', clientId)
    .single()

  const clientName = (client?.full_name as string) || 'Athlete'
  const activeTab: Tab = (query.tab === 'sleep' || query.tab === 'recovery') ? query.tab : 'activities'

  // Fetch data
  const [{ data: activities }, { data: sleepLogs }] = await Promise.all([
    supabase
      .from('activities')
      .select('id, provider, start_time, type, name, distance_km, duration_sec, avg_hr, max_hr, avg_pace_sec_per_km, elevation_gain_m')
      .eq('client_id', clientId)
      .order('start_time', { ascending: false })
      .limit(100),
    supabase
      .from('sleep_logs')
      .select('id, date, provider, total_minutes, deep_minutes, rem_minutes, light_minutes, awake_minutes, hrv_ms, resting_hr, sleep_score')
      .eq('client_id', clientId)
      .order('date', { ascending: false })
      .limit(100),
  ])

  const activityRows = (activities || []) as ActivityRow[]
  const sleepRows = (sleepLogs || []) as SleepRow[]

  // Aggregate stats
  const totalDistance = activityRows.reduce((sum, a) => sum + (a.distance_km || 0), 0)
  const avgHrv = sleepRows.filter(s => s.hrv_ms).length > 0
    ? Math.round(sleepRows.filter(s => s.hrv_ms).reduce((sum, s) => sum + (s.hrv_ms || 0), 0) / sleepRows.filter(s => s.hrv_ms).length)
    : null
  const avgRestingHr = sleepRows.filter(s => s.resting_hr).length > 0
    ? Math.round(sleepRows.filter(s => s.resting_hr).reduce((sum, s) => sum + (s.resting_hr || 0), 0) / sleepRows.filter(s => s.resting_hr).length)
    : null
  const avgSleepScore = sleepRows.filter(s => s.sleep_score).length > 0
    ? Math.round(sleepRows.filter(s => s.sleep_score).reduce((sum, s) => sum + (s.sleep_score || 0), 0) / sleepRows.filter(s => s.sleep_score).length)
    : null

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: '#FC4C02' }}>
              <Zap className="w-4 h-4 text-white" strokeWidth={2.5} fill="white" />
            </div>
            <span className="font-bold text-sm tracking-tight">COACHBOARD</span>
          </div>
          <div className="flex items-center gap-6">
            <span className="text-xs font-bold tracking-wider uppercase text-gray-400">HISTORY</span>
            <form action={logout}>
              <button type="submit" className="text-gray-400 hover:text-gray-600 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <Link href={`/portal/coach/${clientId}`} className="text-xs font-bold tracking-wider uppercase text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-6">
          <ArrowLeft className="w-3 h-3" /> {clientName}
        </Link>

        <h1 className="text-3xl font-bold tracking-tight mb-2">{clientName}</h1>
        <p className="text-sm text-gray-400 mb-8">Full training and recovery history</p>

        {/* Summary stats */}
        <div className="grid grid-cols-4 border border-gray-100 rounded mb-8">
          <div className="p-5">
            <div className="text-[10px] font-bold tracking-wider uppercase text-gray-400 mb-1">TOTAL DISTANCE</div>
            <div className="text-2xl font-bold">{totalDistance > 0 ? totalDistance.toFixed(1) : '—'}
              {totalDistance > 0 && <span className="text-sm font-normal text-gray-400 ml-1">km</span>}
            </div>
          </div>
          <div className="p-5 border-l border-gray-100">
            <div className="text-[10px] font-bold tracking-wider uppercase text-gray-400 mb-1">WORKOUTS</div>
            <div className="text-2xl font-bold">{activityRows.length}</div>
          </div>
          <div className="p-5 border-l border-gray-100">
            <div className="text-[10px] font-bold tracking-wider uppercase text-gray-400 mb-1">AVG HRV</div>
            <div className="text-2xl font-bold">{avgHrv ?? '—'}
              {avgHrv && <span className="text-sm font-normal text-gray-400 ml-1">ms</span>}
            </div>
          </div>
          <div className="p-5 border-l border-gray-100">
            <div className="text-[10px] font-bold tracking-wider uppercase text-gray-400 mb-1">AVG RESTING HR</div>
            <div className="text-2xl font-bold">{avgRestingHr ?? '—'}
              {avgRestingHr && <span className="text-sm font-normal text-gray-400 ml-1">bpm</span>}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {([
            { key: 'activities', label: 'Activities', icon: Activity },
            { key: 'sleep', label: 'Sleep', icon: Moon },
            { key: 'recovery', label: 'Recovery', icon: Heart },
          ] as const).map(({ key, label, icon: Icon }) => (
            <Link
              key={key}
              href={`/portal/coach/${clientId}/history?tab=${key}`}
              className={`text-[10px] font-bold tracking-wider uppercase px-3 py-2 rounded border transition-colors flex items-center gap-1.5 ${
                activeTab === key
                  ? 'border-[#FC4C02] text-[#FC4C02]'
                  : 'border-gray-100 text-gray-400 hover:text-gray-600 hover:border-gray-200'
              }`}
            >
              <Icon className="w-3 h-3" />
              {label}
            </Link>
          ))}
        </div>

        {/* Content */}
        {activeTab === 'activities' && (
          activityRows.length === 0 ? (
            <EmptyState label="activities" />
          ) : (
            <div className="border border-gray-100 rounded overflow-hidden">
              <div className="grid grid-cols-7 gap-4 px-5 py-3 bg-gray-50 text-[10px] font-bold tracking-wider uppercase text-gray-400">
                <div>Date</div><div>Workout</div><div>Distance</div><div>Duration</div><div>Pace</div><div>HR</div><div>Source</div>
              </div>
              {activityRows.map((a) => (
                <div key={a.id} className="grid grid-cols-7 gap-4 px-5 py-4 border-t border-gray-100 items-center text-sm">
                  <div className="text-gray-500">{formatDate(a.start_time)}</div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{a.name || 'Workout'}</div>
                    <div className="text-[10px] font-bold tracking-wider uppercase text-gray-400">{a.type || 'Activity'}</div>
                  </div>
                  <div className="font-semibold">{a.distance_km != null ? `${a.distance_km.toFixed(1)} km` : '-'}</div>
                  <div>{formatDuration(a.duration_sec)}</div>
                  <div>{formatPace(a.avg_pace_sec_per_km)}</div>
                  <div>{a.avg_hr ? `${a.avg_hr} bpm` : '-'}</div>
                  <div className="text-[10px] font-bold tracking-wider uppercase text-gray-400">{a.provider}</div>
                </div>
              ))}
            </div>
          )
        )}

        {activeTab === 'sleep' && (
          sleepRows.length === 0 ? (
            <EmptyState label="sleep data" />
          ) : (
            <div className="border border-gray-100 rounded overflow-hidden">
              <div className="grid grid-cols-7 gap-4 px-5 py-3 bg-gray-50 text-[10px] font-bold tracking-wider uppercase text-gray-400">
                <div>Date</div><div>Total</div><div>Deep</div><div>REM</div><div>Light</div><div>Awake</div><div>Score</div>
              </div>
              {sleepRows.map((s) => (
                <div key={s.id} className="grid grid-cols-7 gap-4 px-5 py-4 border-t border-gray-100 items-center text-sm">
                  <div className="font-medium">{formatDate(s.date)}</div>
                  <div className="font-semibold">{formatSleep(s.total_minutes)}</div>
                  <div>{formatSleep(s.deep_minutes)}</div>
                  <div>{formatSleep(s.rem_minutes)}</div>
                  <div>{formatSleep(s.light_minutes)}</div>
                  <div>{formatSleep(s.awake_minutes)}</div>
                  <div>{s.sleep_score ? `${s.sleep_score}/100` : '-'}</div>
                </div>
              ))}
            </div>
          )
        )}

        {activeTab === 'recovery' && (() => {
          const recoveryRows = sleepRows.filter(s => s.hrv_ms || s.resting_hr || s.sleep_score)
          return recoveryRows.length === 0 ? (
            <EmptyState label="recovery data" />
          ) : (
            <div className="border border-gray-100 rounded overflow-hidden">
              <div className="grid grid-cols-5 gap-4 px-5 py-3 bg-gray-50 text-[10px] font-bold tracking-wider uppercase text-gray-400">
                <div>Date</div><div>Recovery</div><div>HRV</div><div>Resting HR</div><div>Sleep</div>
              </div>
              {recoveryRows.map((s) => (
                <div key={s.id} className="grid grid-cols-5 gap-4 px-5 py-4 border-t border-gray-100 items-center text-sm">
                  <div className="font-medium">{formatDate(s.date)}</div>
                  <div className="font-semibold">{s.sleep_score ? `${s.sleep_score}/100` : '-'}</div>
                  <div>{s.hrv_ms ? `${s.hrv_ms} ms` : '-'}</div>
                  <div>{s.resting_hr ? `${s.resting_hr} bpm` : '-'}</div>
                  <div>{formatSleep(s.total_minutes)}</div>
                </div>
              ))}
            </div>
          )
        })()}
      </main>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="py-16 text-center text-gray-400 text-sm border border-gray-100 rounded">
      No {label} yet.
    </div>
  )
}
