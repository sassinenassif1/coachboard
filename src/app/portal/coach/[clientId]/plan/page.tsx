import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Zap, LogOut, ArrowLeft, Plus, Trash2, Calendar, Target } from 'lucide-react'
import { logout } from '../../../actions'
import { createPlan, updatePlan, addSession, updateSession, deleteSession } from '../../actions'

type SessionType = 'run' | 'strength' | 'rest' | 'mobility' | 'cross_training'

const TYPE_STYLES: Record<SessionType, { label: string; color: string; bg: string }> = {
  run: { label: 'RUN', color: '#0F6E56', bg: '#E1F5EE' },
  strength: { label: 'STRENGTH', color: '#3C3489', bg: '#EEEDFE' },
  rest: { label: 'REST', color: '#5F5E5A', bg: '#F1EFE8' },
  mobility: { label: 'MOBILITY', color: '#5F5E5A', bg: '#F1EFE8' },
  cross_training: { label: 'CROSS', color: '#3C3489', bg: '#EEEDFE' },
}

const SESSION_TYPES: { value: SessionType; label: string }[] = [
  { value: 'run', label: 'Run' },
  { value: 'strength', label: 'Strength' },
  { value: 'rest', label: 'Rest' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'cross_training', label: 'Cross Training' },
]

interface PlanSession {
  id: string
  scheduled_date: string
  type: SessionType
  title: string
  description: string | null
  targets: Record<string, unknown> | null
  status: string
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function getWeekDates(offsetWeeks: number = 0) {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + (offsetWeeks * 7))
  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    dates.push(d.toISOString().split('T')[0])
  }
  return dates
}

export default async function PlanBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>
  searchParams: Promise<{ planId?: string; week?: string }>
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

  const { data: link } = await supabase
    .from('coach_client')
    .select('*')
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

  // Get all plans for this client from this coach
  const { data: plans } = await supabase
    .from('training_plans')
    .select('*')
    .eq('client_id', clientId)
    .eq('coach_id', user.id)
    .order('created_at', { ascending: false })

  // Determine active plan
  const activePlan = query.planId
    ? (plans || []).find((p: { id: string }) => p.id === query.planId)
    : (plans || [])[0]

  // Week navigation
  const weekOffset = query.week ? parseInt(query.week) : 0
  const weekDates = getWeekDates(weekOffset)
  const weekStart = weekDates[0]
  const weekEnd = weekDates[6]

  // Get sessions for this plan in the current week view
  const { data: sessions } = activePlan
    ? await supabase
        .from('sessions')
        .select('*')
        .eq('plan_id', (activePlan as { id: string }).id)
        .eq('client_id', clientId)
        .gte('scheduled_date', weekStart)
        .lte('scheduled_date', weekEnd)
        .order('scheduled_date', { ascending: true })
    : { data: [] }

  const planSessions = (sessions || []) as PlanSession[]
  const clientName = (client?.full_name as string) || 'Athlete'

  // Group sessions by date
  const sessionsByDate = new Map<string, PlanSession[]>()
  for (const date of weekDates) {
    sessionsByDate.set(date, planSessions.filter(s => s.scheduled_date === date))
  }

  const weekLabel = new Date(weekStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    + ' — ' + new Date(weekEnd + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div className="min-h-screen">
      <nav className="border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: '#FC4C02' }}>
              <Zap className="w-4 h-4 text-white" strokeWidth={2.5} fill="white" />
            </div>
            <span className="font-bold text-sm tracking-tight">COACHBOARD</span>
          </div>
          <div className="flex items-center gap-6">
            <span className="text-xs font-bold tracking-wider uppercase text-gray-400">PLAN BUILDER</span>
            <form action={logout}>
              <button type="submit" className="text-gray-400 hover:text-gray-600 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <Link href={`/portal/coach/${clientId}`} className="text-xs font-bold tracking-wider uppercase text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-6">
          <ArrowLeft className="w-3 h-3" /> {clientName}
        </Link>

        <div className="flex items-baseline justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1">
              <Calendar className="w-6 h-6 inline mr-2 text-gray-300" />
              Plan Builder
            </h1>
            <p className="text-sm text-gray-400">Create and manage training plans for {clientName}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main: plan + week view */}
          <div className="lg:col-span-2">
            {/* Plan selector / creator */}
            {!activePlan ? (
              <div className="glass rounded-xl p-6 mb-8">
                <h2 className="text-xs font-bold tracking-wider uppercase text-gray-400 mb-4">
                  <Target className="w-3 h-3 inline mr-1" /> CREATE PLAN
                </h2>
                <form action={createPlan} className="space-y-4">
                  <input type="hidden" name="client_id" value={clientId} />
                  <div>
                    <label className="text-xs font-bold tracking-wider uppercase text-gray-400 block mb-1">Plan Name</label>
                    <input name="name" type="text" required placeholder="e.g. Marathon Build Phase 1"
                      className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:outline-none focus:border-[#FC4C02]" />
                  </div>
                  <div>
                    <label className="text-xs font-bold tracking-wider uppercase text-gray-400 block mb-1">Goal</label>
                    <input name="goal" type="text" placeholder="e.g. Build to 60km/week by end of block"
                      className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:outline-none focus:border-[#FC4C02]" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold tracking-wider uppercase text-gray-400 block mb-1">Start Date</label>
                      <input name="start_date" type="date"
                        className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:outline-none focus:border-[#FC4C02]" />
                    </div>
                    <div>
                      <label className="text-xs font-bold tracking-wider uppercase text-gray-400 block mb-1">End Date</label>
                      <input name="end_date" type="date"
                        className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:outline-none focus:border-[#FC4C02]" />
                    </div>
                  </div>
                  <button type="submit" className="text-xs font-bold tracking-wider uppercase px-4 py-2 rounded text-white"
                    style={{ background: '#FC4C02' }}>
                    Create Plan
                  </button>
                </form>
              </div>
            ) : (
              <>
                {/* Active plan header */}
                <div className="glass rounded-xl p-5 mb-6">
                  <form action={updatePlan}>
                    <input type="hidden" name="plan_id" value={(activePlan as { id: string }).id} />
                    <input type="hidden" name="client_id" value={clientId} />
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-3">
                        <div>
                          <label className="text-[10px] font-bold tracking-wider uppercase text-gray-400 block mb-1">PLAN NAME</label>
                          <input name="name" type="text" defaultValue={(activePlan as { name: string }).name}
                            className="w-full text-lg font-bold px-2 py-1 border border-transparent hover:border-gray-200 rounded focus:outline-none focus:border-[#FC4C02] -ml-2" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold tracking-wider uppercase text-gray-400 block mb-1">GOAL</label>
                          <input name="goal" type="text" defaultValue={(activePlan as { goal?: string }).goal || ''}
                            placeholder="Add a goal..."
                            className="w-full text-sm text-gray-500 px-2 py-1 border border-transparent hover:border-gray-200 rounded focus:outline-none focus:border-[#FC4C02] -ml-2" />
                        </div>
                        <div className="flex gap-4">
                          <div>
                            <label className="text-[10px] font-bold tracking-wider uppercase text-gray-400 block mb-1">START</label>
                            <input name="start_date" type="date" defaultValue={(activePlan as { start_date?: string }).start_date || ''}
                              className="text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-[#FC4C02]" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold tracking-wider uppercase text-gray-400 block mb-1">END</label>
                            <input name="end_date" type="date" defaultValue={(activePlan as { end_date?: string }).end_date || ''}
                              className="text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-[#FC4C02]" />
                          </div>
                        </div>
                      </div>
                      <button type="submit" className="text-[10px] font-bold tracking-wider uppercase px-3 py-1.5 rounded border border-gray-200 text-gray-500 hover:border-[#FC4C02] hover:text-[#FC4C02] transition-colors shrink-0">
                        Save
                      </button>
                    </div>
                  </form>
                </div>

                {/* Week navigation */}
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-gray-400">
                    WEEK &middot; {weekLabel}
                  </h2>
                  <div className="flex gap-2">
                    <Link
                      href={`/portal/coach/${clientId}/plan?planId=${(activePlan as { id: string }).id}&week=${weekOffset - 1}`}
                      className="text-[10px] font-bold tracking-wider uppercase px-3 py-1.5 rounded border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
                    >
                      ← Prev
                    </Link>
                    {weekOffset !== 0 && (
                      <Link
                        href={`/portal/coach/${clientId}/plan?planId=${(activePlan as { id: string }).id}`}
                        className="text-[10px] font-bold tracking-wider uppercase px-3 py-1.5 rounded border border-[#FC4C02] text-[#FC4C02] transition-colors"
                      >
                        Today
                      </Link>
                    )}
                    <Link
                      href={`/portal/coach/${clientId}/plan?planId=${(activePlan as { id: string }).id}&week=${weekOffset + 1}`}
                      className="text-[10px] font-bold tracking-wider uppercase px-3 py-1.5 rounded border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
                    >
                      Next →
                    </Link>
                  </div>
                </div>

                {/* Week grid */}
                <div className="space-y-1">
                  {weekDates.map((date) => {
                    const daySessions = sessionsByDate.get(date) || []
                    const isToday = date === new Date().toISOString().split('T')[0]
                    const dayName = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })

                    return (
                      <div key={date} className={`glass rounded-xl ${isToday ? 'ring-1 ring-[#FC4C02]/20' : ''}`}>
                        {/* Day header */}
                        <div className={`px-4 py-2 flex items-center justify-between ${isToday ? 'bg-orange-50/30' : 'bg-gray-50/50'}`}>
                          <div className="flex items-center gap-2">
                            {isToday && <div className="w-1.5 h-1.5 rounded-full bg-[#FC4C02]" />}
                            <span className="text-xs font-bold tracking-wider uppercase text-gray-500">
                              {dayName}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {formatDate(date)}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-400">
                            {daySessions.length > 0 ? `${daySessions.length} session${daySessions.length > 1 ? 's' : ''}` : ''}
                          </span>
                        </div>

                        {/* Sessions for this day */}
                        <div className="px-4 py-2">
                          {daySessions.map((session) => {
                            const style = TYPE_STYLES[session.type] || TYPE_STYLES.rest
                            return (
                              <div key={session.id} className="flex items-start justify-between py-2 border-b border-gray-50 last:border-0">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded"
                                      style={{ color: style.color, background: style.bg }}>
                                      {style.label}
                                    </span>
                                    <span className="text-sm font-semibold truncate">{session.title}</span>
                                    {session.status === 'done' && (
                                      <span className="text-[10px] font-bold tracking-wider text-[#FC4C02]">DONE</span>
                                    )}
                                  </div>
                                  {session.description && (
                                    <p className="text-xs text-gray-500 mt-0.5">{session.description}</p>
                                  )}
                                  {session.targets && (
                                    <div className="flex gap-1.5 flex-wrap mt-1">
                                      {Object.entries(session.targets).map(([key, val]) => (
                                        <span key={key} className="text-[10px] font-medium text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">
                                          {key.replace(/_/g, ' ')}: {String(val)}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <form action={deleteSession}>
                                  <input type="hidden" name="session_id" value={session.id} />
                                  <input type="hidden" name="client_id" value={clientId} />
                                  <button type="submit" className="text-gray-300 hover:text-red-500 transition-colors p-1 ml-2" title="Delete session">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </form>
                              </div>
                            )
                          })}

                          {/* Add session form for this day */}
                          <div className={`${daySessions.length > 0 ? 'mt-2 pt-2 border-t border-gray-100' : ''}`}>
                            <div className="flex items-center gap-1 mb-2">
                              <Plus className="w-3 h-3 text-[#FC4C02]" />
                              <span className="text-[10px] font-bold tracking-wider uppercase text-[#FC4C02]">
                                ADD {daySessions.length > 0 ? 'ANOTHER ' : ''}SESSION
                              </span>
                            </div>
                            <form action={addSession}>
                              <input type="hidden" name="plan_id" value={(activePlan as { id: string }).id} />
                              <input type="hidden" name="client_id" value={clientId} />
                              <input type="hidden" name="scheduled_date" value={date} />
                              <div className="flex flex-wrap gap-2 items-start">
                                <select name="type" defaultValue="run"
                                  className="text-[10px] font-bold tracking-wider uppercase px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-[#FC4C02] bg-white">
                                  {SESSION_TYPES.map(t => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                  ))}
                                </select>
                                <input name="title" type="text" required placeholder="Session title..."
                                  className="flex-1 min-w-[120px] text-sm px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-[#FC4C02]" />
                                <input name="description" type="text" placeholder="Notes..."
                                  className="flex-1 min-w-[100px] text-sm px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-[#FC4C02] hidden sm:block" />
                                <button type="submit" className="shrink-0 w-7 h-7 rounded flex items-center justify-center text-white"
                                  style={{ background: '#FC4C02' }} title="Add session">
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              {/* Optional targets row */}
                              <div className="flex flex-wrap gap-2 mt-1">
                                <input name="target_distance_km" type="text" placeholder="Dist (km)"
                                  className="w-20 text-[10px] px-2 py-1 border border-gray-100 rounded focus:outline-none focus:border-[#FC4C02]" />
                                <input name="target_pace" type="text" placeholder="Pace"
                                  className="w-20 text-[10px] px-2 py-1 border border-gray-100 rounded focus:outline-none focus:border-[#FC4C02]" />
                                <input name="target_hr_zone" type="text" placeholder="HR zone"
                                  className="w-20 text-[10px] px-2 py-1 border border-gray-100 rounded focus:outline-none focus:border-[#FC4C02]" />
                                <input name="target_duration_min" type="text" placeholder="Dur (min)"
                                  className="w-20 text-[10px] px-2 py-1 border border-gray-100 rounded focus:outline-none focus:border-[#FC4C02]" />
                                <input name="target_sets" type="text" placeholder="Sets"
                                  className="w-20 text-[10px] px-2 py-1 border border-gray-100 rounded focus:outline-none focus:border-[#FC4C02]" />
                              </div>
                            </form>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* Sidebar: plan list + stats */}
          <div className="space-y-6">
            {/* All plans */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold tracking-wider uppercase text-gray-400">
                  <Target className="w-3 h-3 inline mr-1" /> PLANS
                </h3>
                {activePlan && (
                  <Link
                    href={`/portal/coach/${clientId}/plan`}
                    className="text-[10px] font-bold tracking-wider uppercase text-[#FC4C02]"
                  >
                    + New
                  </Link>
                )}
              </div>
              {(plans || []).length === 0 ? (
                <p className="text-sm text-gray-400">No plans yet. Create one to get started.</p>
              ) : (
                <div className="space-y-2">
                  {(plans || []).map((p: Record<string, unknown>) => {
                    const isActive = activePlan && (activePlan as { id: string }).id === (p.id as string)
                    return (
                      <Link
                        key={p.id as string}
                        href={`/portal/coach/${clientId}/plan?planId=${p.id as string}`}
                        className={`block px-3 py-2 rounded border transition-colors ${
                          isActive
                            ? 'border-[#FC4C02] bg-orange-50/30'
                            : 'border-gray-100 hover:border-gray-200'
                        }`}
                      >
                        <div className="text-sm font-semibold">{p.name as string}</div>
                        {Boolean(p.goal) && <div className="text-[10px] text-gray-400 mt-0.5 truncate">{String(p.goal)}</div>}
                        {Boolean(p.start_date) && (
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            {formatDate(p.start_date as string)}
                            {Boolean(p.end_date) && ` — ${formatDate(p.end_date as string)}`}
                          </div>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Week summary */}
            {activePlan && (
              <div className="glass rounded-xl p-5">
                <h3 className="text-xs font-bold tracking-wider uppercase text-gray-400 mb-4">
                  WEEK SUMMARY
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Sessions</span>
                    <span className="text-sm font-bold">{planSessions.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Completed</span>
                    <span className="text-sm font-bold">{planSessions.filter(s => s.status === 'done').length}</span>
                  </div>
                  {/* Type breakdown */}
                  <div className="pt-3 border-t border-gray-100 space-y-2">
                    {SESSION_TYPES.map(t => {
                      const count = planSessions.filter(s => s.type === t.value).length
                      if (count === 0) return null
                      const style = TYPE_STYLES[t.value]
                      return (
                        <div key={t.value} className="flex items-center justify-between">
                          <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded"
                            style={{ color: style.color, background: style.bg }}>
                            {style.label}
                          </span>
                          <span className="text-sm font-medium text-gray-500">{count}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Quick tips */}
            <div className="glass rounded-xl p-5">
              <h3 className="text-xs font-bold tracking-wider uppercase text-gray-400 mb-3">TIPS</h3>
              <ul className="space-y-2 text-xs text-gray-500">
                <li>Add sessions to each day of the week</li>
                <li>Set optional targets: distance, pace, HR zone</li>
                <li>Navigate weeks with the Prev/Next buttons</li>
                <li>Sessions appear on the athlete&apos;s portal automatically</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
