import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Zap } from 'lucide-react'
import Link from 'next/link'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/portal')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      <div className="flex items-center gap-3 mb-8">
        <div
          className="w-10 h-10 rounded-md flex items-center justify-center"
          style={{ background: '#FC4C02' }}
        >
          <Zap className="w-6 h-6 text-white" strokeWidth={2.5} fill="white" />
        </div>
        <span className="font-bold text-xl tracking-tight">COACHBOARD</span>
      </div>
      <p className="text-gray-500 text-sm mb-8 max-w-xs text-center">
        Training plans, live metrics, and feedback — all in one place.
      </p>
      <Link
        href="/login"
        className="text-xs font-bold tracking-wider uppercase px-8 py-3 rounded text-white hover:opacity-90 transition-opacity"
        style={{ background: '#FC4C02' }}
      >
        Get started
      </Link>
    </div>
  )
}
