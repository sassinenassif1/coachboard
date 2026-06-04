import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Zap, LogOut, ChevronRight, Moon, Activity, Users } from 'lucide-react'
import { logout } from '../actions'
import Link from 'next/link'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export default async function CoachDashboard() {
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

  if (profile?.role !== 'coach') {
    redirect('/portal')
  }

  const firstName = profile?.full_name?.split(' ')[0] || 'Coach'

  // Fetch active clients
  const { data: links } = await supabase
    .from('coach_client')
    .select('client_id, status, started_at')
    .eq('coach_id', user.id)
    .eq('status', 'active')

  const clientIds = (links || []).map((l: { client_id: string }) => l.client_id)

  // Fetch client profiles
  const { data: clients } = clientIds.length > 0
    ? await supabase
        .from('profiles')
        .select('*')
        .in('id', clientIds)
    : { data: [] }

  // Fetch this week's date range
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const weekStart = monday.toISOString().split('T')[0]
  const weekEnd = sunday.toISOString().split('T')[0]

  // Fetch all sessions for all clients this week
  const { data: allSessions } = clientIds.length > 0
    ? await supabase
        .from('sessions')
        .select('*')
        .in('client_id', clientIds)
        .gte('scheduled_date', weekStart)
        .lte('scheduled_date', weekEnd)
        .order('scheduled_date', { ascending: true })
    : { data: [] }

  // Fetch latest activities for all clients
  const { data: allActivities } = clientIds.length > 0
    ? await supabase
        .from('activities')
        .select('*')
        .in('client_id', clientIds)
        .order('start_time', { ascending: false })
        .limit(10)
    : { data: [] }

  // Fetch latest sleep for all clients
  const { data: allSleep } = clientIds.length > 0
    ? await supabase
        .from('sleep_logs')
        .select('*')
        .in('client_id', clientIds)
        .order('date', { ascending: false })
        .limit(20)
    : { data: [] }

  // Build client summaries
  const clientSummaries = (clients || []).map((client: Record<string, unknown>) => {
    const cid = client.id as string
    const sessions = (allSessions || []).filter((s: { client_id: string }) => s.client_id === cid)
    const done = sessions.filter((s: { status: string }) => s.status === 'done').length
    const total = sessions.length
    const activities = (allActivities || []).filter((a: { client_id: string }) => a.client_id === cid)
    const latestActivity = activities[0]
    const sleepLogs = (allSleep || []).filter((s: { client_id: string }) => s.client_id === cid)
    const latestSleep = sleepLogs[0] as Record<string, unknown> | undefined

    const weekDistance = activities
      .filter((a: { start_time: string }) => {
        const d = (a.start_time as string)?.split('T')[0]
        return d >= weekStart && d <= weekEnd
      })
      .reduce((sum: number, a: { distance_km: number | null }) => sum + ((a.distance_km as number) || 0), 0)

    return {
      id: cid,
      name: client.full_name as string,
      email: client.email as string,
      sessionsTotal: total,
      sessionsDone: done,
      weekDistance,
      latestActivity: latestActivity as Record<string, unknown> | undefined,
      latestSleep,
      restingHr: (latestSleep?.resting_hr as number) || null,
      hrv: (latestSleep?.hrv_ms as number) || null,
      sleepScore: (latestSleep?.sleep_score as number) || null,
    }
  })

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
            <span className="text-xs font-bold tracking-wider uppercase text-gray-400 hidden sm:inline">COACH</span>
            <form action={logout}>
              <button type="submit" className="text-gray-400 hover:text-gray-600 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Hero */}
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-2 gap-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {getGreeting()}, {firstName}.
          </h1>
          <span className="text-xs text-gray-400 font-medium">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
        </div>
        <p className="text-xs font-bold tracking-wider uppercase text-gray-400 mb-10">
          <Users className="w-3 h-3 inline mr-1" />
          {clientSummaries.length} ACTIVE {clientSummaries.length === 1 ? 'ATHLETE' : 'ATHLETES'}
        </p>

        {/* Client cards */}
        {clientSummaries.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm border border-gray-100 rounded">
            No clients linked yet. Add a client from the Supabase dashboard.
          </div>
        ) : (
          <div className="space-y-6">
            {clientSummaries.map((client) => (
              <ClientCard key={client.id} client={client} weekStart={weekStart} weekEnd={weekEnd} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

interface ClientSummary {
  id: string
  name: string
  email: string
  sessionsTotal: number
  sessionsDone: number
  weekDistance: number
  latestActivity: Record<string, unknown> | undefined
  latestSleep: Record<string, unknown> | undefined
  restingHr: number | null
  hrv: number | null
  sleepScore: number | null
}

function ClientCard({ client }: { client: ClientSummary; weekStart: string; weekEnd: string }) {
  const pct = client.sessionsTotal > 0
    ? Math.round((client.sessionsDone / client.sessionsTotal) * 100)
    : 0

  return (
    <div className="border border-gray-100 rounded p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <Link
            href={`/portal/coach/${client.id}`}
            className="font-bold text-lg tracking-tight hover:text-[#FC4C02] transition-colors"
          >
            {client.name}
            <ChevronRight className="w-4 h-4 inline ml-1 text-gray-300" />
          </Link>
          <p className="text-xs text-gray-400 mt-0.5">{client.email}</p>
        </div>
        <div className="text-right">
          <div className="text-xs font-bold tracking-wider uppercase text-gray-400">WEEK</div>
          <div className="text-sm font-semibold">
            {client.sessionsDone}/{client.sessionsTotal} sessions
          </div>
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 pt-4 border-t border-gray-100">
        <div>
          <div className="text-[10px] font-bold tracking-wider uppercase text-gray-400 mb-1">DISTANCE</div>
          <div className="text-lg font-bold">
            {client.weekDistance > 0 ? client.weekDistance.toFixed(1) : '—'}
            {client.weekDistance > 0 && <span className="text-xs font-normal text-gray-400 ml-0.5">km</span>}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold tracking-wider uppercase text-gray-400 mb-1">COMPLIANCE</div>
          <div className="text-lg font-bold">
            {client.sessionsTotal > 0 ? `${pct}%` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold tracking-wider uppercase text-gray-400 mb-1">RESTING HR</div>
          <div className="text-lg font-bold">
            {client.restingHr || '—'}
            {client.restingHr && <span className="text-xs font-normal text-gray-400 ml-0.5">bpm</span>}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold tracking-wider uppercase text-gray-400 mb-1">HRV</div>
          <div className="text-lg font-bold">
            {client.hrv || '—'}
            {client.hrv && <span className="text-xs font-normal text-gray-400 ml-0.5">ms</span>}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold tracking-wider uppercase text-gray-400 mb-1">SLEEP</div>
          <div className="text-lg font-bold">
            {client.sleepScore || '—'}
            {client.sleepScore && <span className="text-xs font-normal text-gray-400 ml-0.5">/100</span>}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {client.sessionsTotal > 0 && (
        <div className="mt-4">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: '#FC4C02' }}
            />
          </div>
        </div>
      )}

      {/* Latest activity */}
      {client.latestActivity && (
        <div className="mt-4 pt-3 border-t border-gray-50 flex items-center gap-3 text-xs text-gray-400">
          <Activity className="w-3 h-3" />
          <span className="font-medium text-gray-600">{client.latestActivity.name as string}</span>
          <span>&middot;</span>
          <span>{(client.latestActivity.distance_km as number)?.toFixed(1)} km</span>
          <span>&middot;</span>
          <span>{new Date(client.latestActivity.start_time as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        </div>
      )}
    </div>
  )
}
