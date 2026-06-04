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
    <div className="min-h-screen">
      {/* Top nav */}
      <nav className="border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
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

  // Compliance color
  const complianceColor = pct >= 80 ? '#0F6E56' : pct >= 50 ? '#FC4C02' : pct > 0 ? '#E54304' : '#D1D5DB'
  const initials = client.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'

  // SVG compliance ring
  const ringSize = 44
  const ringStroke = 3
  const ringRadius = (ringSize - ringStroke) / 2
  const ringCircumference = 2 * Math.PI * ringRadius
  const ringOffset = ringCircumference - (pct / 100) * ringCircumference

  return (
    <Link
      href={`/portal/coach/${client.id}`}
      className="block glass rounded-xl hover:shadow-md transition-all group"
    >
      <div className="p-5 sm:p-6">
        {/* Header: avatar + name + compliance ring */}
        <div className="flex items-center gap-4 mb-5">
          {/* Avatar with initials */}
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold tracking-tight shrink-0"
            style={{ background: '#FC4C02', color: 'white' }}>
            {initials}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base tracking-tight group-hover:text-[#FC4C02] transition-colors truncate">
                {client.name}
              </span>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#FC4C02] transition-colors shrink-0" />
            </div>
            <p className="text-xs text-gray-400 truncate">{client.email}</p>
          </div>

          {/* Compliance ring */}
          <div className="relative shrink-0">
            <svg width={ringSize} height={ringSize} className="-rotate-90">
              <circle cx={ringSize/2} cy={ringSize/2} r={ringRadius}
                fill="none" stroke="#F3F4F6" strokeWidth={ringStroke} />
              {client.sessionsTotal > 0 && (
                <circle cx={ringSize/2} cy={ringSize/2} r={ringRadius}
                  fill="none" stroke={complianceColor} strokeWidth={ringStroke}
                  strokeDasharray={ringCircumference} strokeDashoffset={ringOffset}
                  strokeLinecap="round" className="transition-all" />
              )}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-bold" style={{ color: complianceColor }}>
                {client.sessionsTotal > 0 ? `${pct}%` : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
          <MetricPill label="Distance" value={client.weekDistance > 0 ? client.weekDistance.toFixed(1) : '—'} unit={client.weekDistance > 0 ? 'km' : ''} />
          <MetricPill label="Resting HR" value={client.restingHr || '—'} unit={client.restingHr ? 'bpm' : ''} />
          <MetricPill label="HRV" value={client.hrv || '—'} unit={client.hrv ? 'ms' : ''} />
          <MetricPill label="Sleep" value={client.sleepScore || '—'} unit={client.sleepScore ? '/100' : ''} />
        </div>

        {/* Progress bar */}
        {client.sessionsTotal > 0 && (
          <div className="mt-4">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[10px] font-bold tracking-wider uppercase text-gray-400">
                WEEK PROGRESS
              </span>
              <span className="text-[10px] font-medium text-gray-500">
                {client.sessionsDone} of {client.sessionsTotal} sessions
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: complianceColor }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Latest activity footer */}
      {client.latestActivity && (
        <div className="px-5 sm:px-6 py-3 border-t border-white/30 bg-white/20 rounded-b-xl flex items-center gap-3 text-xs text-gray-400">
          <Activity className="w-3.5 h-3.5 text-gray-300" />
          <span className="font-medium text-gray-600">{client.latestActivity.name as string}</span>
          <span className="text-gray-300">&middot;</span>
          <span>{(client.latestActivity.distance_km as number)?.toFixed(1)} km</span>
          <span className="text-gray-300">&middot;</span>
          <span>{new Date(client.latestActivity.start_time as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        </div>
      )}
    </Link>
  )
}

function MetricPill({ label, value, unit }: { label: string; value: string | number; unit: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold tracking-wider uppercase text-gray-400 mb-0.5">{label}</div>
      <div className="text-base font-bold tracking-tight">
        {value}
        {unit && <span className="text-[10px] font-normal text-gray-400 ml-0.5">{unit}</span>}
      </div>
    </div>
  )
}
