import { login } from './actions'
import { Zap } from 'lucide-react'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="glass rounded-2xl shadow-lg p-8">
          <div className="flex items-center gap-2 mb-10">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#FC4C02' }}>
              <Zap className="w-5 h-5 text-white" strokeWidth={2.5} fill="white" />
            </div>
            <span className="font-bold text-base tracking-tight text-gray-900">COACHBOARD</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-1">
            Welcome back
          </h1>
          <p className="text-sm text-gray-400 mb-8">
            Sign in to your account.
          </p>

          {params.error && (
            <div className="mb-6 px-4 py-3 text-sm rounded-lg border border-red-200 bg-red-50 text-red-700">
              {params.error}
            </div>
          )}

          <form className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-[10px] font-bold tracking-wider uppercase text-gray-400 mb-1.5">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#FC4C02] focus:ring-1 focus:ring-[#FC4C02]/20 transition-colors"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-[10px] font-bold tracking-wider uppercase text-gray-400 mb-1.5">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                placeholder="Enter your password"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#FC4C02] focus:ring-1 focus:ring-[#FC4C02]/20 transition-colors"
              />
            </div>

            <div className="pt-2">
              <button
                formAction={login}
                className="w-full text-xs font-bold tracking-wider uppercase py-3 rounded-lg text-white hover:opacity-90 transition-opacity"
                style={{ background: '#FC4C02' }}
              >
                Sign in
              </button>
            </div>
          </form>
        </div>

        <p className="text-center text-[10px] text-gray-400 mt-6">
          Training plans, live metrics, and feedback — all in one place.
        </p>
      </div>
    </div>
  )
}
