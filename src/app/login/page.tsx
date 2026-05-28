import { login, signup } from './actions'
import { Zap } from 'lucide-react'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-12">
          <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: '#FC4C02' }}>
            <Zap className="w-5 h-5 text-white" strokeWidth={2.5} fill="white" />
          </div>
          <span className="font-bold text-base tracking-tight text-gray-900">COACHBOARD</span>
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-2">
          Sign in
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          Coach or client — same login.
        </p>

        {params.error && (
          <div className="mb-6 px-4 py-3 text-sm rounded border border-red-200 bg-red-50 text-red-800">
            {params.error}
          </div>
        )}

        <form className="space-y-4">
          <div>
            <label htmlFor="full_name" className="block text-xs font-bold tracking-wider uppercase text-gray-500 mb-2">
              Name <span className="font-normal text-gray-400">(signup only)</span>
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              className="w-full px-3 py-2.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-xs font-bold tracking-wider uppercase text-gray-500 mb-2">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full px-3 py-2.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-bold tracking-wider uppercase text-gray-500 mb-2">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              className="w-full px-3 py-2.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label htmlFor="role" className="block text-xs font-bold tracking-wider uppercase text-gray-500 mb-2">
              I am a <span className="font-normal text-gray-400">(signup only)</span>
            </label>
            <select
              id="role"
              name="role"
              defaultValue="client"
              className="w-full px-3 py-2.5 border border-gray-200 rounded text-sm focus:outline-none focus:border-orange-500 bg-white"
            >
              <option value="client">Client (athlete)</option>
              <option value="coach">Coach</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-4">
            <button
              formAction={login}
              className="text-xs font-bold tracking-wider uppercase py-3 rounded text-white hover:opacity-90 transition-opacity"
              style={{ background: '#FC4C02' }}
            >
              Sign in
            </button>
            <button
              formAction={signup}
              className="text-xs font-bold tracking-wider uppercase py-3 rounded border border-gray-900 text-gray-900 hover:bg-gray-50 transition-colors"
            >
              Sign up
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
