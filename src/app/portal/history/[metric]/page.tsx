import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Activity, ArrowLeft, Heart, LogOut, Moon, TrendingUp, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { logout } from '../../actions'

type Metric = 'activities' | 'distance' | 'sleep' | 'recovery' | 'resting-hr' | 'sessions'

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

interface SessionRow {
  id: string
  scheduled_date: string
  type: string
  title: string
  description: string | null
  status: string
  targets: Record<string, unknown> | null
}

const METRIC_META: Record<Metric, { title: string; label: string; icon: typeof Activity }> = {
  activities: { title: 'Workout history', label: 'All synced workouts', icon: Activity },
  distance: { title: 'Distance history', label: 'Running volume over time', icon: TrendingUp },
  sleep: { title: 'Sleep history', label: 'Sleep duration and stages', icon: Moon },
  recovery: { title: 'Recovery history', label: 'HRV, recovery score, and readiness', icon: Heart },
  'resting-hr': { title: 'Resting HR history', label: 'Resting heart rate trend', icon: Heart },
  sessions: { title: 'Session history', label: 'Planned training and completion', icon: TrendingUp },
}

function isMetric(value: string): value is Metric {
  return value in METRIC_META
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
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

export default async function MetricHistoryPage({
  params,
}: {
  params: Promise<{ metric: string }>
}) {
  const { metric: metricParam } = await params
  if (!isMetric(metricParam)) redirect('/portal')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'coach') redirect('/portal/coach')

  const [{ data: activities }, { data: sleepLogs }, { data: sessions }] = await Promise.all([
    supabase
      .from('activities')
      .select('id, provider, start_time, type, name, distance_km, duration_sec, avg_hr, max_hr, avg_pace_sec_per_km, elevation_gain_m')
      .eq('client_id', user.id)
      .order('start_time', { ascending: false })
      .limit(100),
    supabase
      .from('sleep_logs')
      .select('id, date, provider, total_minutes, deep_minutes, rem_minutes, light_minutes, awake_minutes, hrv_ms, resting_hr, sleep_score')
      .eq('client_id', user.id)
      .order('date', { ascending: false })
      .limit(100),
    supabase
      .from('sessions')
      .select('id, scheduled_date, type, title, description, status, targets')
      .eq('client_id', user.id)
      .order('scheduled_date', { ascending: false })
      .limit(100),
  ])

  const metric = metricParam
  const meta = METRIC_META[metric]
  const Icon = meta.icon
  const activityRows = (activities || []) as ActivityRow[]
  const sleepRows = (sleepLogs || []) as SleepRow[]
  const sessionRows = (sessions || []) as SessionRow[]

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/portal" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: '#FC4C02' }}>
              <Zap className="w-4 h-4 text-white" strokeWidth={2.5} fill="white" />
            </div>
            <span className="font-bold text-sm tracking-tight">COACHBOARD</span>
          </Link>
          <div className="flex items-center gap-6">
            <span className="text-xs font-bold tracking-wider uppercase text-gray-400">History</span>
            <form action={logout}>
              <button type="submit" className="text-gray-400 hover:text-gray-600 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <Link href="/portal" className="text-xs font-bold tracking-wider uppercase text-gray-400 hover:text-gray-600 inline-flex items-center gap-1 mb-6">
          <ArrowLeft className="w-3 h-3" /> Dashboard
        </Link>

        <div className="flex items-start justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider uppercase text-gray-400 mb-2">
              <Icon className="w-3 h-3" /> {meta.label}
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{meta.title}</h1>
          </div>
          <HistoryTabs active={metric} />
        </div>

        {metric === 'activities' && <ActivitiesTable activities={activityRows} />}
        {metric === 'distance' && <DistanceHistory activities={activityRows} />}
        {metric === 'sleep' && <SleepTable sleepLogs={sleepRows} />}
        {metric === 'recovery' && <RecoveryTable sleepLogs={sleepRows} />}
        {metric === 'resting-hr' && <RestingHrTable sleepLogs={sleepRows} />}
        {metric === 'sessions' && <SessionsTable sessions={sessionRows} />}
      </main>
    </div>
  )
}

function HistoryTabs({ active }: { active: Metric }) {
  const tabs: Metric[] = ['activities', 'distance', 'sleep', 'recovery', 'resting-hr', 'sessions']

  return (
    <div className="flex flex-wrap gap-1 justify-end max-w-xl">
      {tabs.map((tab) => (
        <Link
          key={tab}
          href={`/portal/history/${tab}`}
          className={`text-[10px] font-bold tracking-wider uppercase px-2.5 py-1.5 rounded border transition-colors ${
            active === tab
              ? 'border-[#FC4C02] text-[#FC4C02]'
              : 'border-gray-100 text-gray-400 hover:text-gray-600'
          }`}
        >
          {METRIC_META[tab].title.replace(' history', '')}
        </Link>
      ))}
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

function ActivitiesTable({ activities }: { activities: ActivityRow[] }) {
  if (activities.length === 0) return <EmptyState label="activities" />

  return (
    <div className="border border-gray-100 rounded overflow-hidden">
      <HistoryHeader columns={['Date', 'Workout', 'Distance', 'Duration', 'Pace', 'HR', 'Provider']} />
      {activities.map((activity) => (
        <div key={activity.id} className="grid grid-cols-7 gap-4 px-5 py-4 border-t border-gray-100 items-center text-sm">
          <div className="text-gray-500">{formatDate(activity.start_time)}</div>
          <div className="min-w-0">
            <div className="font-semibold truncate">{activity.name || 'Workout'}</div>
            <div className="text-[10px] font-bold tracking-wider uppercase text-gray-400">{activity.type || 'Activity'}</div>
          </div>
          <div className="font-semibold">{activity.distance_km != null ? `${activity.distance_km.toFixed(1)} km` : '-'}</div>
          <div>{formatDuration(activity.duration_sec)}</div>
          <div>{formatPace(activity.avg_pace_sec_per_km)}</div>
          <div>{activity.avg_hr ? `${activity.avg_hr} bpm` : '-'}</div>
          <div className="text-[10px] font-bold tracking-wider uppercase text-gray-400">{activity.provider}</div>
        </div>
      ))}
    </div>
  )
}

function DistanceHistory({ activities }: { activities: ActivityRow[] }) {
  const distanceActivities = activities.filter((activity) => activity.distance_km != null)
  if (distanceActivities.length === 0) return <EmptyState label="distance data" />

  const total = distanceActivities.reduce((sum, activity) => sum + (activity.distance_km || 0), 0)
  const longest = Math.max(...distanceActivities.map((activity) => activity.distance_km || 0))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 border border-gray-100 rounded">
        <MiniMetric label="Total logged" value={total.toFixed(1)} unit="km" />
        <MiniMetric label="Longest workout" value={longest.toFixed(1)} unit="km" border />
        <MiniMetric label="Workouts" value={distanceActivities.length} unit="" border />
      </div>
      <ActivitiesTable activities={distanceActivities} />
    </div>
  )
}

function SleepTable({ sleepLogs }: { sleepLogs: SleepRow[] }) {
  if (sleepLogs.length === 0) return <EmptyState label="sleep data" />

  return (
    <div className="border border-gray-100 rounded overflow-hidden">
      <HistoryHeader columns={['Date', 'Total', 'Deep', 'REM', 'Light', 'Awake', 'Score']} />
      {sleepLogs.map((sleep) => (
        <div key={sleep.id} className="grid grid-cols-7 gap-4 px-5 py-4 border-t border-gray-100 items-center text-sm">
          <div className="font-medium">{formatDate(sleep.date)}</div>
          <div className="font-semibold">{formatSleep(sleep.total_minutes)}</div>
          <div>{formatSleep(sleep.deep_minutes)}</div>
          <div>{formatSleep(sleep.rem_minutes)}</div>
          <div>{formatSleep(sleep.light_minutes)}</div>
          <div>{formatSleep(sleep.awake_minutes)}</div>
          <div>{sleep.sleep_score ? `${sleep.sleep_score}/100` : '-'}</div>
        </div>
      ))}
    </div>
  )
}

function RecoveryTable({ sleepLogs }: { sleepLogs: SleepRow[] }) {
  const rows = sleepLogs.filter((sleep) => sleep.hrv_ms || sleep.resting_hr || sleep.sleep_score)
  if (rows.length === 0) return <EmptyState label="recovery data" />

  return (
    <div className="border border-gray-100 rounded overflow-hidden">
      <HistoryHeader columns={['Date', 'Recovery', 'HRV', 'Resting HR', 'Sleep', 'Provider']} />
      {rows.map((sleep) => (
        <div key={sleep.id} className="grid grid-cols-6 gap-4 px-5 py-4 border-t border-gray-100 items-center text-sm">
          <div className="font-medium">{formatDate(sleep.date)}</div>
          <div className="font-semibold">{sleep.sleep_score ? `${sleep.sleep_score}/100` : '-'}</div>
          <div>{sleep.hrv_ms ? `${sleep.hrv_ms} ms` : '-'}</div>
          <div>{sleep.resting_hr ? `${sleep.resting_hr} bpm` : '-'}</div>
          <div>{formatSleep(sleep.total_minutes)}</div>
          <div className="text-[10px] font-bold tracking-wider uppercase text-gray-400">{sleep.provider}</div>
        </div>
      ))}
    </div>
  )
}

function RestingHrTable({ sleepLogs }: { sleepLogs: SleepRow[] }) {
  const rows = sleepLogs.filter((sleep) => sleep.resting_hr)
  if (rows.length === 0) return <EmptyState label="resting heart rate data" />

  return (
    <div className="border border-gray-100 rounded overflow-hidden">
      <HistoryHeader columns={['Date', 'Resting HR', 'HRV', 'Sleep', 'Provider']} />
      {rows.map((sleep) => (
        <div key={sleep.id} className="grid grid-cols-5 gap-4 px-5 py-4 border-t border-gray-100 items-center text-sm">
          <div className="font-medium">{formatDate(sleep.date)}</div>
          <div className="text-lg font-bold">{sleep.resting_hr}<span className="text-xs font-normal text-gray-400 ml-1">bpm</span></div>
          <div>{sleep.hrv_ms ? `${sleep.hrv_ms} ms` : '-'}</div>
          <div>{formatSleep(sleep.total_minutes)}</div>
          <div className="text-[10px] font-bold tracking-wider uppercase text-gray-400">{sleep.provider}</div>
        </div>
      ))}
    </div>
  )
}

function SessionsTable({ sessions }: { sessions: SessionRow[] }) {
  if (sessions.length === 0) return <EmptyState label="sessions" />

  return (
    <div className="border border-gray-100 rounded overflow-hidden">
      <HistoryHeader columns={['Date', 'Session', 'Type', 'Targets', 'Status']} />
      {sessions.map((session) => (
        <div key={session.id} className="grid grid-cols-5 gap-4 px-5 py-4 border-t border-gray-100 items-start text-sm">
          <div className="text-gray-500">{formatDate(session.scheduled_date)}</div>
          <div>
            <div className="font-semibold">{session.title}</div>
            {session.description && <div className="text-gray-500 mt-0.5">{session.description}</div>}
          </div>
          <div className="text-[10px] font-bold tracking-wider uppercase text-gray-400">{session.type.replace(/_/g, ' ')}</div>
          <div>
            <div className="text-[10px] font-bold tracking-wider uppercase text-[#FC4C02]">{session.status}</div>
            {session.targets && (
              <div className="text-[10px] text-gray-400 mt-1">
                {Object.entries(session.targets).map(([key, value]) => `${key.replace(/_/g, ' ')}: ${String(value)}`).join(' · ')}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function HistoryHeader({ columns }: { columns: string[] }) {
  return (
    <div className={`grid gap-4 px-5 py-3 bg-gray-50 text-[10px] font-bold tracking-wider uppercase text-gray-400`} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
      {columns.map((column) => (
        <div key={column}>{column}</div>
      ))}
    </div>
  )
}

function MiniMetric({ label, value, unit, border }: { label: string; value: string | number; unit: string; border?: boolean }) {
  return (
    <div className={`p-5 ${border ? 'border-l border-gray-100' : ''}`}>
      <div className="text-xs font-bold tracking-wider uppercase text-gray-400 mb-2">{label}</div>
      <div className="text-2xl font-bold tracking-tight">
        {value}
        {unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}
      </div>
    </div>
  )
}
