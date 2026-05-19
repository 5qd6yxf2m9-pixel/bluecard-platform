import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

const getSupabaseUrl = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    return url
  }
  return 'https://jpnqtxkioymainjxlysm.supabase.co'
}

const getSupabaseKey = () => {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (key && key !== 'your-supabase-anon-key') {
    return key
  }
  return 'placeholder-anon-key'
}

export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    getSupabaseUrl(),
    getSupabaseKey(),
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // The `delete` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
      global: {
        fetch: async (url, options) => {
          const timeout = 15000 // 15 seconds connection timeout
          const controller = new AbortController()
          const id = setTimeout(() => controller.abort(), timeout)
          try {
            const response = await fetch(url, {
              ...options,
              signal: controller.signal
            })
            clearTimeout(id)
            return response
          } catch {
            clearTimeout(id)
            throw new Error('Supabase fetch timed out or failed')
          }
        }
      }
    }
  )
}
