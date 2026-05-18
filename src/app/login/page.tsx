'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      
      if (authError) {
        setError("Invalid email or password.")
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    } catch {
      setError("An unexpected error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-white text-navy selection:bg-electric selection:text-white font-sans">
      
      {/* Left Column - 45% Width */}
      <div className="hidden lg:flex lg:w-[45%] bg-[#0a1628] flex-col justify-between p-12 text-white relative overflow-hidden">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.03] -z-10" />
        
        {/* Logo at the top */}
        <div>
          <Link href="/" className="font-display font-bold text-xl tracking-tight text-white hover:text-electric transition-colors">
            BlueCard Platform
          </Link>
        </div>

        {/* Center Quote/Statement */}
        <div className="my-auto max-w-md">
          <h1 className="font-display text-4xl font-bold leading-tight mb-8">
            Route every BlueCard claim to the highest-paying plan. Automatically.
          </h1>
        </div>

        {/* Bottom Stat Pills */}
        <div className="flex flex-wrap gap-3">
          <div className="px-4 py-2 bg-white/5 rounded-full text-sm font-medium text-white/90 backdrop-blur-sm border border-white/10">
            <span className="text-electric font-bold">$5.5M</span> recovered
          </div>
          <div className="px-4 py-2 bg-white/5 rounded-full text-sm font-medium text-white/90 backdrop-blur-sm border border-white/10">
            <span className="text-electric font-bold">2,744</span> prefixes
          </div>
          <div className="px-4 py-2 bg-white/5 rounded-full text-sm font-medium text-white/90 backdrop-blur-sm border border-white/10">
            <span className="text-electric font-bold">100%</span> prebill
          </div>
        </div>
      </div>

      {/* Right Column - 55% Width */}
      <div className="w-full lg:w-[55%] flex items-center justify-center p-8 sm:p-12 md:p-20">
        <div className="w-full max-w-md space-y-8">
          <div>
            <div className="flex lg:hidden mb-8">
              <Link href="/" className="font-display font-bold text-xl tracking-tight text-navy">
                BlueCard Platform
              </Link>
            </div>
            <span className="text-xs font-bold tracking-widest text-gray-400 uppercase">Welcome back</span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-navy font-display">
              Sign in to your account
            </h2>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleLogin}>
            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="text-sm text-red-700 text-center">{error}</div>
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label htmlFor="email-address" className="block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5 shadow-sm focus:border-electric focus:ring-1 focus:ring-electric sm:text-sm outline-none transition-all"
                  placeholder="you@hospital.org"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2.5 shadow-sm focus:border-electric focus:ring-1 focus:ring-electric sm:text-sm outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className={`flex w-full justify-center rounded-md border border-transparent bg-navy py-3 px-4 text-sm font-semibold text-white shadow-sm hover:bg-electric focus:outline-none focus:ring-2 focus:ring-electric focus:ring-offset-2 transition-all duration-300 ${
                  loading ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>

            <div className="text-center mt-6">
              <Link href="/contact" className="text-sm text-gray-500 hover:text-electric transition-colors">
                Not a client yet? <span className="font-semibold text-navy hover:text-electric transition-colors">Request a demo</span>
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
