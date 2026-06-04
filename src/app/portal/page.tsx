import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Zap, LogOut, ChevronRight, Moon, Activity, TrendingUp, RefreshCw, CheckCircle2 } from 'lucide-react'
import { logout, addComment, syncProvider } from './actions'

type SessionType = 'run' | 'strength' | 'rest' | 'mobility' | 'cross_training'
type SessionStatus = 'planned' | 'done' | 'skipped' | 'modified'

interface TrainingSession {
  id: string
  scheduled_date: string
  type: SessionType
  title: string
  description: string | null
  targets: Record<string, unknown> | null
  status: SessionStatus
  comments: { id: string; author_id: string; body: string; created_at: string }[]
}

interface ProviderConnection {
  provider: 'strava' | 'whoop'
  last_sync_at: string | null
  expires_at: string | null
  scope: string | null
}

const TYPE_STYLES: Record<SessionType, { label: string; color: string; bg: string }> = {
  run: { label: 'RUN', color: '#0F6E56', bg: '#E1F5EE' },
  strength: { label: 'STRENGTH', color: '#3C3489', bg: '#EEEDFE' },
  rest: { label: 'REST', color: '#5F5E5A', bg: '#F1EFE8' },
  mobility: { label: 'MOBILITY', color: '#5F5E5A', bg: '#F1EFE8' },
  cross_training: { label: 'CROSS', color: '#3C3489', bg: '#EEEDFE' },
}

const PROVIDER_LABELS: Record<ProviderConnection['provider'], string> = {
  strava: 'Strava',
  whoop: 'WHOOP',
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function isToday(dateStr: string) {
  const today = new Date().toISOString().split('T')[0]
  return dateStr === today
}

function isPast(dateStr: string) {
  const today = new Date().toISOString().split('T')[0]
  return dateStr < today
}

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; oauth_error?: string }>
}) {
  const query = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const firstName = profile?.full_name?.split(' ')[0] || 'Athlete'
  const role = profile?.role || 'client'

  // Coaches see a different dashboard
  if (role === 'coach') {
    redirect('/portal/coach')
  }

  // Fetch this week's sessions
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const weekStart = monday.toISOString().split('T')[0]
  const weekEnd = sunday.toISOString().split('T')[0]

  const { data: sessions } = await supabase
    .from('sessions')
    .select('*')
    .eq('client_id', user.id)
    .gte('scheduled_date', weekStart)
    .lte('scheduled_date', weekEnd)
    .order('scheduled_date', { ascending: true })

  // Fetch comments for these sessions
  const sessionIds = (sessions || []).map((s: { id: string }) => s.id)
  const { data: comments } = sessionIds.length > 0
    ? await supabase
        .from('session_comments')
        .select('*')
        .in('session_id', sessionIds)
        .order('created_at', { ascending: true })
    : { data: [] }

  const sessionsWithComments: TrainingSession[] = (sessions || []).map((s: Record<string, unknown>) => ({
    ...s,
    comments: (comments || []).filter((c: { session_id: string }) => c.session_id === s.id),
  })) as TrainingSession[]

  // Fetch latest activities
  const { data: activities } = await supabase
    .from('activities')
    .select('*')
    .eq('client_id', user.id)
    .order('start_time', { ascending: false })
    .limit(3)

  // Fetch latest sleep
  const { data: sleepLogs } = await supabase
    .from('sleep_logs')
    .select('*')
    .eq('client_id', user.id)
    .order('date', { ascending: false })
    .limit(7)

  const { data: providerConnections } = await supabase
    .from('provider_connections')
    .select('provider, last_sync_at, expires_at, scope')
    .eq('user_id', user.id)
    .in('provider', ['strava', 'whoop'])

  const latestSleep = sleepLogs?.[0]
  const avgSleep = sleepLogs?.length
    ? Math.round((sleepLogs.reduce((sum: number, s: { total_minutes: number | null }) => sum + (s.total_minutes || 0), 0)) / sleepLogs.length)
    : null

  // Calculate weekly distance from activities this week
  const weekActivities = (activities || []).filter((a: { start_time: string }) => {
    const d = a.start_time?.split('T')[0]
    return d >= weekStart && d <= weekEnd
  })
  const weeklyDistance = weekActivities.reduce((sum: number, a: { distance_km: number | null }) => sum + (a.distance_km || 0), 0)

  const doneCount = sessionsWithComments.filter(s => s.status === 'done').length
  const totalCount = sessionsWithComments.length

  return (
    <div className="min-h-screen bg-white">
      {/* Top nav */}
      <nav className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded flex items-center justify-center"
              style={{ background: '#FC4C02' }}
            >
              <Zap className="w-4 h-4 text-white" strokeWidth={2.5} fill="white" />
            </div>
            <span className="font-bold text-sm tracking-tight">COACHBOARD</span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6">
            <span className="text-xs font-bold tracking-wider uppercase text-gray-400 hidden sm:inline">
              {role === 'coach' ? 'Coach' : 'Training'}
            </span>
            <form action={logout}>
              <button
                type="submit"
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Editorial hero */}
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-2 gap-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {getGreeting()}, {firstName}.
          </h1>
          <span className="text-xs text-gray-400 font-medium">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
        </div>
        {totalCount > 0 && (
          <p className="text-xs font-bold tracking-wider uppercase text-gray-400 mb-10">
            WEEK PROGRESS &middot; {doneCount} OF {totalCount} SESSIONS DONE
          </p>
        )}

        {/* Metric bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border border-gray-100 rounded mb-8 sm:mb-10">
          <MetricCard
            label="WEEKLY DISTANCE"
            value={weeklyDistance > 0 ? weeklyDistance.toFixed(1) : '—'}
            unit={weeklyDistance > 0 ? 'km' : ''}
            href="/portal/history/distance"
          />
          <MetricCard
            label="RECOVERY"
            value="—"
            unit=""
            border
            href="/portal/history/recovery"
          />
          <MetricCard
            label="SLEEP AVG"
            value={avgSleep ? `${Math.floor(avgSleep / 60)}h ${avgSleep % 60}m` : '—'}
            unit=""
            border
            href="/portal/history/sleep"
          />
          <MetricCard
            label="RESTING HR"
            value={latestSleep?.resting_hr || '—'}
            unit={latestSleep?.resting_hr ? 'bpm' : ''}
            border
            href="/portal/history/resting-hr"
          />
        </div>

        {/* Main content: sessions + sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Sessions (2/3) */}
          <div className="lg:col-span-2">
            <h2 className="text-xs font-bold tracking-wider uppercase text-gray-400 mb-4">
              THIS WEEK
            </h2>

            {sessionsWithComments.length === 0 ? (
              <div className="py-16 text-center text-gray-400 text-sm border border-gray-100 rounded">
                No sessions scheduled this week.
                {role === 'client' && ' Your coach will add your plan here.'}
              </div>
            ) : (
              <div className="space-y-0">
                {sessionsWithComments.map((session) => (
                  <SessionRow key={session.id} session={session} userId={user.id} />
                ))}
              </div>
            )}
          </div>

          {/* Sidebar (1/3) */}
          <div className="space-y-6">
            <DataConnections
              connections={(providerConnections || []) as ProviderConnection[]}
              connected={query.connected}
              oauthError={query.oauth_error}
            />

            {/* Sleep card */}
            <div className="border border-gray-100 rounded p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold tracking-wider uppercase text-gray-400">
                  <Moon className="w-3 h-3 inline mr-1" /> SLEEP
                </h3>
                <Link href="/portal/history/sleep" className="text-[10px] font-bold tracking-wider uppercase text-[#FC4C02]">
                  History
                </Link>
              </div>
              {latestSleep ? (
                <div>
                  <div className="text-3xl font-bold tracking-tight">
                    {Math.floor((latestSleep.total_minutes || 0) / 60)}h {(latestSleep.total_minutes || 0) % 60}m
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Last night</p>
                  <div className="mt-4 space-y-2">
                    <SleepBar label="Deep" value={latestSleep.deep_minutes} total={latestSleep.total_minutes} color="#3C3489" />
                    <SleepBar label="REM" value={latestSleep.rem_minutes} total={latestSleep.total_minutes} color="#FC4C02" />
                    <SleepBar label="Light" value={latestSleep.light_minutes} total={latestSleep.total_minutes} color="#FFB088" />
                    <SleepBar label="Awake" value={latestSleep.awake_minutes} total={latestSleep.total_minutes} color="#E5E5E5" />
                  </div>
                  {latestSleep.hrv_ms && (
                    <div className="flex gap-4 mt-4 pt-3 border-t border-gray-100">
                      <div>
                        <span className="text-lg font-bold">{latestSleep.hrv_ms}</span>
                        <span className="text-xs text-gray-400 ml-1">ms HRV</span>
                      </div>
                      {latestSleep.resting_hr && (
                        <div>
                          <span className="text-lg font-bold">{latestSleep.resting_hr}</span>
                          <span className="text-xs text-gray-400 ml-1">bpm</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No sleep data yet</p>
              )}
            </div>

            {/* Weekly goals */}
            <div className="border border-gray-100 rounded p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold tracking-wider uppercase text-gray-400">
                  <TrendingUp className="w-3 h-3 inline mr-1" /> WEEKLY GOALS
                </h3>
                <Link href="/portal/history/sessions" className="text-[10px] font-bold tracking-wider uppercase text-[#FC4C02]">
                  History
                </Link>
              </div>
              <GoalBar label="Sessions" current={doneCount} target={totalCount || 1} />
              <GoalBar label="Distance" current={weeklyDistance} target={30} unit="km" />
            </div>
          </div>
        </div>

        {/* Recent activities */}
        {(activities?.length ?? 0) > 0 && (
          <div className="mt-10">
            <Link
              href="/portal/history/activities"
              className="inline-flex items-center gap-1 text-xs font-bold tracking-wider uppercase text-gray-400 hover:text-[#FC4C02] mb-4 transition-colors"
            >
              RECENT ACTIVITIES <ChevronRight className="w-3 h-3" />
            </Link>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activities!.map((a: Record<string, unknown>) => (
                <ActivityCard key={a.id as string} activity={a} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function MetricCard({
  label,
  value,
  unit,
  border,
  href,
}: {
  label: string
  value: string | number
  unit: string
  border?: boolean
  href?: string
}) {
  const content = (
    <>
      <div className="text-xs font-bold tracking-wider uppercase text-gray-400 mb-2">{label}</div>
      <div className="text-2xl font-bold tracking-tight">
        {value}
        {unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}
      </div>
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className={`p-4 sm:p-5 block hover:bg-orange-50/30 transition-colors ${border ? 'sm:border-l border-gray-100' : ''}`}
      >
        {content}
      </Link>
    )
  }

  return (
    <div className={`p-4 sm:p-5 ${border ? 'sm:border-l border-gray-100' : ''}`}>
      {content}
    </div>
  )
}

function DataConnections({
  connections,
  connected,
  oauthError,
}: {
  connections: ProviderConnection[]
  connected?: string
  oauthError?: string
}) {
  const byProvider = new Map(connections.map((connection) => [connection.provider, connection]))
  const providers: ProviderConnection['provider'][] = ['strava', 'whoop']

  return (
    <div className="border border-gray-100 rounded p-5">
      <h3 className="text-xs font-bold tracking-wider uppercase text-gray-400 mb-4">
        <Activity className="w-3 h-3 inline mr-1" /> DATA CONNECTIONS
      </h3>

      {connected && PROVIDER_LABELS[connected as ProviderConnection['provider']] && (
        <div className="mb-3 text-xs font-medium text-[#0F6E56]">
          {PROVIDER_LABELS[connected as ProviderConnection['provider']]} connected.
        </div>
      )}
      {oauthError && (
        <div className="mb-3 text-xs font-medium text-[#FC4C02]">
          Could not connect provider. Check credentials and callback URLs.
        </div>
      )}

      <div className="space-y-3">
        {providers.map((provider) => {
          const connection = byProvider.get(provider)

          return (
            <div key={provider} className="flex items-center justify-between gap-3 border-b border-gray-50 last:border-0 pb-3 last:pb-0">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold">{PROVIDER_LABELS[provider]}</span>
                  {connection && <CheckCircle2 className="w-3.5 h-3.5 text-[#0F6E56]" />}
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {connection?.last_sync_at
                    ? `Synced ${new Date(connection.last_sync_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    : provider === 'strava'
                      ? 'Runs and workout activities'
                      : 'Sleep, recovery, and workouts'}
                </p>
              </div>

              {connection ? (
                <form action={syncProvider}>
                  <input type="hidden" name="provider" value={provider} />
                  <button
                    type="submit"
                    className="w-8 h-8 rounded border border-gray-100 text-gray-500 hover:text-[#FC4C02] hover:border-[#FC4C02] flex items-center justify-center transition-colors"
                    title={`Sync ${PROVIDER_LABELS[provider]}`}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </form>
              ) : (
                <a
                  href={`/api/oauth/${provider}/start`}
                  className="text-[10px] font-bold tracking-wider uppercase px-3 py-1.5 rounded text-white"
                  style={{ background: '#FC4C02' }}
                >
                  Connect
                </a>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SessionRow({ session, userId }: { session: TrainingSession; userId: string }) {
  const style = TYPE_STYLES[session.type] || TYPE_STYLES.rest
  const today = isToday(session.scheduled_date)
  const past = isPast(session.scheduled_date)
  const done = session.status === 'done'

  return (
    <div className={`border-b border-gray-100 py-4 ${today ? 'bg-orange-50/30' : ''}`}>
      <div className="flex items-start gap-4">
        {/* Status dot + date */}
        <div className="flex flex-col items-center w-16 shrink-0 pt-0.5">
          <div
            className={`w-2.5 h-2.5 rounded-full mb-1 ${
              done
                ? 'bg-[#FC4C02]'
                : today
                  ? 'ring-2 ring-[#FC4C02] ring-offset-1'
                  : past
                    ? 'bg-gray-300'
                    : 'ring-2 ring-gray-200 ring-offset-1'
            }`}
          />
          <span className="text-[10px] font-medium text-gray-400">
            {formatDate(session.scheduled_date)}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded"
              style={{ color: style.color, background: style.bg }}
            >
              {style.label}
            </span>
            <span className="font-semibold text-sm truncate">{session.title}</span>
            {done && (
              <span className="text-[10px] font-bold tracking-wider text-[#FC4C02]">DONE</span>
            )}
          </div>
          {session.description && (
            <p className="text-sm text-gray-500 mb-2">{session.description}</p>
          )}

          {/* Target chips */}
          {session.targets && (
            <div className="flex gap-2 flex-wrap mb-2">
              {Object.entries(session.targets).map(([key, val]) => (
                <span key={key} className="text-[10px] font-medium text-gray-500 bg-gray-50 px-2 py-0.5 rounded">
                  {key.replace(/_/g, ' ')}: {String(val)}
                </span>
              ))}
            </div>
          )}

          {/* Comments */}
          {session.comments.length > 0 && (
            <div className="mt-2 space-y-1">
              {session.comments.map((c) => (
                <div
                  key={c.id}
                  className="text-sm text-gray-600 pl-3 border-l-2"
                  style={{ borderColor: c.author_id === userId ? '#FC4C02' : '#E5E5E5' }}
                >
                  {c.body}
                </div>
              ))}
            </div>
          )}

          {/* Comment input for done/today sessions */}
          {(done || today) && (
            <form action={addComment} className="mt-2 flex gap-2">
              <input type="hidden" name="session_id" value={session.id} />
              <input
                name="body"
                type="text"
                placeholder="Add a note..."
                className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-[#FC4C02]"
              />
              <button
                type="submit"
                className="text-[10px] font-bold tracking-wider uppercase px-3 py-1.5 rounded text-white"
                style={{ background: '#FC4C02' }}
              >
                Log
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function SleepBar({ label, value, total, color }: { label: string; value: number | null; total: number | null; color: string }) {
  const pct = total && value ? Math.round((value / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-medium text-gray-400 w-10">{label}</span>
      <div className="flex-1 h-2 bg-gray-50 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] text-gray-400 w-8 text-right">{value ?? 0}m</span>
    </div>
  )
}

function GoalBar({ label, current, target, unit }: { label: string; current: number; target: number; unit?: string }) {
  const pct = Math.min(Math.round((current / target) * 100), 100)
  return (
    <div className="mb-3">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <span className="text-xs text-gray-400">
          {typeof current === 'number' && current % 1 !== 0 ? current.toFixed(1) : current}
          {unit ? ` ${unit}` : ''} / {target}{unit ? ` ${unit}` : ''}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: '#FC4C02' }}
        />
      </div>
    </div>
  )
}

function ActivityCard({ activity }: { activity: Record<string, unknown> }) {
  const distance = activity.distance_km as number | null
  const duration = activity.duration_sec as number | null
  const avgHr = activity.avg_hr as number | null
  const pace = activity.avg_pace_sec_per_km as number | null
  const name = (activity.name as string) || 'Activity'
  const provider = activity.provider as string

  return (
    <Link href="/portal/history/activities" className="block border border-gray-100 rounded p-4 hover:border-[#FC4C02] transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-sm truncate">{name}</span>
        <ChevronRight className="w-3 h-3 text-gray-300" />
      </div>
      <div className="grid grid-cols-2 gap-y-2 text-sm">
        {distance != null && (
          <div>
            <div className="text-xs font-bold tracking-wider uppercase text-gray-400">Distance</div>
            <div className="font-semibold">{distance.toFixed(1)} <span className="text-xs font-normal text-gray-400">km</span></div>
          </div>
        )}
        {pace != null && (
          <div>
            <div className="text-xs font-bold tracking-wider uppercase text-gray-400">Pace</div>
            <div className="font-semibold">{Math.floor(pace / 60)}:{String(Math.round(pace % 60)).padStart(2, '0')} <span className="text-xs font-normal text-gray-400">/km</span></div>
          </div>
        )}
        {avgHr != null && (
          <div>
            <div className="text-xs font-bold tracking-wider uppercase text-gray-400">Avg HR</div>
            <div className="font-semibold">{avgHr} <span className="text-xs font-normal text-gray-400">bpm</span></div>
          </div>
        )}
        {duration != null && (
          <div>
            <div className="text-xs font-bold tracking-wider uppercase text-gray-400">Duration</div>
            <div className="font-semibold">{Math.floor(duration / 60)} <span className="text-xs font-normal text-gray-400">min</span></div>
          </div>
        )}
      </div>
      <div className="mt-3 pt-2 border-t border-gray-100 flex items-center gap-1">
        <Activity className="w-3 h-3 text-gray-300" />
        <span className="text-[10px] text-gray-400 capitalize">{provider}</span>
      </div>
    </Link>
  )
}
