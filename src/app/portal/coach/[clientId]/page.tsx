import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Zap, LogOut, ArrowLeft, Moon, Activity, Calendar } from 'lucide-react'
import { logout, addComment } from '../../actions'
import Link from 'next/link'

type SessionType = 'run' | 'strength' | 'rest' | 'mobility' | 'cross_training'

const TYPE_STYLES: Record<SessionType, { label: string; color: string; bg: string }> = {
  run: { label: 'RUN', color: '#0F6E56', bg: '#E1F5EE' },
  strength: { label: 'STRENGTH', color: '#3C3489', bg: '#EEEDFE' },
  rest: { label: 'REST', color: '#5F5E5A', bg: '#F1EFE8' },
  mobility: { label: 'MOBILITY', color: '#5F5E5A', bg: '#F1EFE8' },
  cross_training: { label: 'CROSS', color: '#3C3489', bg: '#EEEDFE' },
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function isToday(dateStr: string) {
  return dateStr === new Date().toISOString().split('T')[0]
}

function isPast(dateStr: string) {
  return dateStr < new Date().toISOString().split('T')[0]
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Verify coach role and active link
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'coach') redirect('/portal')

  const { data: link } = await supabase
    .from('coach_client')
    .select('*')
    .eq('coach_id', user.id)
    .eq('client_id', clientId)
    .eq('status', 'active')
    .single()

  if (!link) redirect('/portal/coach')

  // Get client profile
  const { data: client } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', clientId)
    .single()

  // Get active training plan
  const { data: plan } = await supabase
    .from('training_plans')
    .select('*')
    .eq('client_id', clientId)
    .eq('coach_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // This week
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
    .eq('client_id', clientId)
    .gte('scheduled_date', weekStart)
    .lte('scheduled_date', weekEnd)
    .order('scheduled_date', { ascending: true })

  const sessionIds = (sessions || []).map((s: { id: string }) => s.id)
  const { data: comments } = sessionIds.length > 0
    ? await supabase
        .from('session_comments')
        .select('*')
        .in('session_id', sessionIds)
        .order('created_at', { ascending: true })
    : { data: [] }

  interface SessionWithComments {
    id: string
    scheduled_date: string
    type: SessionType
    title: string
    description: string | null
    targets: Record<string, unknown> | null
    status: string
    comments: { id: string; author_id: string; body: string }[]
    [key: string]: unknown
  }

  const sessionsWithComments: SessionWithComments[] = (sessions || []).map((s: Record<string, unknown>) => ({
    ...s,
    comments: (comments || []).filter((c: { session_id: string }) => c.session_id === (s as { id: string }).id),
  })) as SessionWithComments[]

  // Activities
  const { data: activities } = await supabase
    .from('activities')
    .select('*')
    .eq('client_id', clientId)
    .order('start_time', { ascending: false })
    .limit(5)

  // Sleep
  const { data: sleepLogs } = await supabase
    .from('sleep_logs')
    .select('*')
    .eq('client_id', clientId)
    .order('date', { ascending: false })
    .limit(7)

  interface SleepLog {
    total_minutes: number | null
    deep_minutes: number | null
    rem_minutes: number | null
    light_minutes: number | null
    awake_minutes: number | null
    hrv_ms: number | null
    resting_hr: number | null
    sleep_score: number | null
    date: string
    [key: string]: unknown
  }
  const latestSleep = sleepLogs?.[0] as SleepLog | undefined
  const clientName = (client?.full_name as string) || 'Athlete'
  const doneCount = sessionsWithComments.filter((s) => s.status === 'done').length
  const totalCount = sessionsWithComments.length

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
            <span className="text-xs font-bold tracking-wider uppercase text-gray-400">COACH</span>
            <form action={logout}>
              <button type="submit" className="text-gray-400 hover:text-gray-600 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <Link href="/portal/coach" className="text-xs font-bold tracking-wider uppercase text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-6">
          <ArrowLeft className="w-3 h-3" /> ALL ATHLETES
        </Link>

        <div className="flex items-baseline justify-between mb-2">
          <h1 className="text-3xl font-bold tracking-tight">{clientName}</h1>
          <span className="text-xs text-gray-400 font-medium">{client?.email as string}</span>
        </div>

        <div className="flex items-center gap-4 mb-2">
          {plan && (
            <p className="text-xs font-bold tracking-wider uppercase text-gray-400">
              {plan.name as string}
            </p>
          )}
          <Link
            href={`/portal/coach/${clientId}/plan${plan ? `?planId=${(plan as { id: string }).id}` : ''}`}
            className="text-[10px] font-bold tracking-wider uppercase px-3 py-1 rounded border border-[#FC4C02] text-[#FC4C02] hover:bg-[#FC4C02] hover:text-white transition-colors flex items-center gap-1"
          >
            <Calendar className="w-3 h-3" />
            {plan ? 'Edit Plan' : 'Create Plan'}
          </Link>
        </div>
        {plan?.goal && (
          <p className="text-sm text-gray-500 mb-8">{plan.goal as string}</p>
        )}

        <p className="text-xs font-bold tracking-wider uppercase text-gray-400 mb-6">
          WEEK &middot; {doneCount} OF {totalCount} SESSIONS DONE
        </p>

        {/* Main content */}
        <div className="grid grid-cols-3 gap-8">
          {/* Sessions */}
          <div className="col-span-2">
            <h2 className="text-xs font-bold tracking-wider uppercase text-gray-400 mb-4">THIS WEEK</h2>
            {sessionsWithComments.length === 0 ? (
              <div className="py-16 text-center text-gray-400 text-sm border border-gray-100 rounded">
                No sessions this week.
              </div>
            ) : (
              <div>
                {sessionsWithComments.map((session) => {
                  const style = TYPE_STYLES[session.type] || TYPE_STYLES.rest
                  const done = session.status === 'done'
                  const today = isToday(session.scheduled_date)
                  const past = isPast(session.scheduled_date)

                  return (
                    <div key={session.id} className={`border-b border-gray-100 py-4 ${today ? 'bg-orange-50/30' : ''}`}>
                      <div className="flex items-start gap-4">
                        <div className="flex flex-col items-center w-16 shrink-0 pt-0.5">
                          <div className={`w-2.5 h-2.5 rounded-full mb-1 ${
                            done ? 'bg-[#FC4C02]'
                              : today ? 'ring-2 ring-[#FC4C02] ring-offset-1'
                              : past ? 'bg-gray-300'
                              : 'ring-2 ring-gray-200 ring-offset-1'
                          }`} />
                          <span className="text-[10px] font-medium text-gray-400">
                            {formatDate(session.scheduled_date)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ color: style.color, background: style.bg }}>
                              {style.label}
                            </span>
                            <span className="font-semibold text-sm">{session.title}</span>
                            {done && <span className="text-[10px] font-bold tracking-wider text-[#FC4C02]">DONE</span>}
                          </div>
                          {session.description && <p className="text-sm text-gray-500 mb-2">{session.description}</p>}

                          {session.targets && (
                            <div className="flex gap-2 flex-wrap mb-2">
                              {Object.entries(session.targets).map(([key, val]) => (
                                <span key={key} className="text-[10px] font-medium text-gray-500 bg-gray-50 px-2 py-0.5 rounded">
                                  {key.replace(/_/g, ' ')}: {String(val)}
                                </span>
                              ))}
                            </div>
                          )}

                          {session.comments.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {session.comments.map((c) => (
                                <div key={c.id} className="text-sm text-gray-600 pl-3 border-l-2"
                                  style={{ borderColor: c.author_id === user.id ? '#FC4C02' : '#E5E5E5' }}>
                                  {c.body}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Coach can always comment */}
                          <form action={addComment} className="mt-2 flex gap-2">
                            <input type="hidden" name="session_id" value={session.id} />
                            <input name="body" type="text" placeholder="Add coaching note..."
                              className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-[#FC4C02]" />
                            <button type="submit" className="text-[10px] font-bold tracking-wider uppercase px-3 py-1.5 rounded text-white"
                              style={{ background: '#FC4C02' }}>
                              Send
                            </button>
                          </form>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Sleep */}
            <div className="border border-gray-100 rounded p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold tracking-wider uppercase text-gray-400">
                  <Moon className="w-3 h-3 inline mr-1" /> SLEEP
                </h3>
                <Link href={`/portal/coach/${clientId}/history?tab=sleep`} className="text-[10px] font-bold tracking-wider uppercase text-[#FC4C02] hover:underline">
                  View All
                </Link>
              </div>
              {latestSleep ? (
                <div>
                  <div className="text-3xl font-bold tracking-tight">
                    {Math.floor(((latestSleep.total_minutes as number) || 0) / 60)}h {((latestSleep.total_minutes as number) || 0) % 60}m
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Last night &middot; Score {latestSleep.sleep_score as number}/100</p>
                  <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100">
                    {latestSleep.hrv_ms && (
                      <div>
                        <span className="text-lg font-bold">{latestSleep.hrv_ms as number}</span>
                        <span className="text-xs text-gray-400 ml-1">ms HRV</span>
                      </div>
                    )}
                    {latestSleep.resting_hr && (
                      <div>
                        <span className="text-lg font-bold">{latestSleep.resting_hr as number}</span>
                        <span className="text-xs text-gray-400 ml-1">bpm</span>
                      </div>
                    )}
                  </div>
                  {/* Sleep trend */}
                  {(sleepLogs?.length ?? 0) > 1 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="text-[10px] font-bold tracking-wider uppercase text-gray-400 mb-2">7-DAY TREND</div>
                      <div className="flex gap-1 items-end h-8">
                        {(sleepLogs || []).slice(0, 7).reverse().map((s: { total_minutes?: number | null }, i: number) => {
                          const mins = (s.total_minutes as number) || 0
                          const pct = Math.round((mins / 540) * 100) // 9h = 100%
                          return (
                            <div key={i} className="flex-1 rounded-sm" style={{ height: `${pct}%`, background: '#FC4C02', opacity: 0.3 + (i * 0.1) }} />
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No sleep data</p>
              )}
            </div>

            {/* Recent activities */}
            <div className="border border-gray-100 rounded p-5">
              <div className="flex items-center justify-between mb-4">
                <Link
                  href={`/portal/coach/${clientId}/history?tab=activities`}
                  className="text-xs font-bold tracking-wider uppercase text-gray-400 hover:text-[#FC4C02] transition-colors flex items-center gap-1"
                >
                  <Activity className="w-3 h-3 inline mr-1" /> RECENT
                </Link>
                <Link href={`/portal/coach/${clientId}/history?tab=activities`} className="text-[10px] font-bold tracking-wider uppercase text-[#FC4C02] hover:underline">
                  Recent History
                </Link>
              </div>
              {(activities?.length ?? 0) > 0 ? (
                <div className="space-y-3">
                  {activities!.slice(0, 3).map((a: Record<string, unknown>) => (
                    <Link key={a.id as string} href={`/portal/coach/${clientId}/history?tab=activities`} className="flex items-center justify-between hover:bg-gray-50 -mx-2 px-2 py-1 rounded transition-colors">
                      <div>
                        <div className="text-sm font-medium">{a.name as string}</div>
                        <div className="text-[10px] text-gray-400">
                          {(a.distance_km as number)?.toFixed(1)} km &middot; {a.avg_hr as number} bpm
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-400">
                        {new Date(a.start_time as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No activities yet</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
