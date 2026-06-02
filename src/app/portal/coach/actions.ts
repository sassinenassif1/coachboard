'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// ── Plan CRUD ──────────────────────────────────────────────────

export async function createPlan(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const clientId = formData.get('client_id') as string
  const name = formData.get('name') as string
  const goal = formData.get('goal') as string
  const startDate = formData.get('start_date') as string
  const endDate = formData.get('end_date') as string

  if (!name?.trim() || !clientId) return

  const { data: plan, error } = await supabase
    .from('training_plans')
    .insert({
      client_id: clientId,
      coach_id: user.id,
      name: name.trim(),
      goal: goal?.trim() || null,
      start_date: startDate || null,
      end_date: endDate || null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('createPlan error:', error)
    return
  }

  revalidatePath(`/portal/coach/${clientId}`)
  redirect(`/portal/coach/${clientId}/plan?planId=${plan.id}`)
}

export async function updatePlan(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const planId = formData.get('plan_id') as string
  const clientId = formData.get('client_id') as string
  const name = formData.get('name') as string
  const goal = formData.get('goal') as string
  const startDate = formData.get('start_date') as string
  const endDate = formData.get('end_date') as string

  if (!planId || !name?.trim()) return

  await supabase
    .from('training_plans')
    .update({
      name: name.trim(),
      goal: goal?.trim() || null,
      start_date: startDate || null,
      end_date: endDate || null,
    })
    .eq('id', planId)
    .eq('coach_id', user.id)

  revalidatePath(`/portal/coach/${clientId}`)
  revalidatePath(`/portal/coach/${clientId}/plan`)
}

// ── Session CRUD ───────────────────────────────────────────────

export async function addSession(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const planId = formData.get('plan_id') as string
  const clientId = formData.get('client_id') as string
  const scheduledDate = formData.get('scheduled_date') as string
  const type = formData.get('type') as string
  const title = formData.get('title') as string
  const description = formData.get('description') as string

  if (!planId || !scheduledDate || !type || !title?.trim()) return

  // Build targets from optional fields
  const targets: Record<string, unknown> = {}
  const distanceKm = formData.get('target_distance_km')
  const pace = formData.get('target_pace')
  const hrZone = formData.get('target_hr_zone')
  const durationMin = formData.get('target_duration_min')
  const sets = formData.get('target_sets')

  if (distanceKm) targets.distance_km = distanceKm
  if (pace) targets.pace = pace
  if (hrZone) targets.hr_zone = hrZone
  if (durationMin) targets.duration_min = durationMin
  if (sets) targets.sets = sets

  await supabase.from('sessions').insert({
    plan_id: planId,
    client_id: clientId,
    scheduled_date: scheduledDate,
    type,
    title: title.trim(),
    description: description?.trim() || null,
    targets: Object.keys(targets).length > 0 ? targets : null,
    status: 'planned',
  })

  revalidatePath(`/portal/coach/${clientId}/plan`)
  revalidatePath(`/portal/coach/${clientId}`)
}

export async function updateSession(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sessionId = formData.get('session_id') as string
  const clientId = formData.get('client_id') as string
  const scheduledDate = formData.get('scheduled_date') as string
  const type = formData.get('type') as string
  const title = formData.get('title') as string
  const description = formData.get('description') as string
  const status = formData.get('status') as string

  if (!sessionId || !title?.trim()) return

  const targets: Record<string, unknown> = {}
  const distanceKm = formData.get('target_distance_km')
  const pace = formData.get('target_pace')
  const hrZone = formData.get('target_hr_zone')
  const durationMin = formData.get('target_duration_min')
  const sets = formData.get('target_sets')

  if (distanceKm) targets.distance_km = distanceKm
  if (pace) targets.pace = pace
  if (hrZone) targets.hr_zone = hrZone
  if (durationMin) targets.duration_min = durationMin
  if (sets) targets.sets = sets

  await supabase
    .from('sessions')
    .update({
      scheduled_date: scheduledDate,
      type,
      title: title.trim(),
      description: description?.trim() || null,
      targets: Object.keys(targets).length > 0 ? targets : null,
      status: status || 'planned',
    })
    .eq('id', sessionId)

  revalidatePath(`/portal/coach/${clientId}/plan`)
  revalidatePath(`/portal/coach/${clientId}`)
}

export async function deleteSession(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sessionId = formData.get('session_id') as string
  const clientId = formData.get('client_id') as string

  if (!sessionId) return

  // Delete comments first (FK constraint)
  await supabase.from('session_comments').delete().eq('session_id', sessionId)
  await supabase.from('sessions').delete().eq('id', sessionId)

  revalidatePath(`/portal/coach/${clientId}/plan`)
  revalidatePath(`/portal/coach/${clientId}`)
}
