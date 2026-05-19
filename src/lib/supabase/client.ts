import { createBrowserClient } from '@supabase/ssr'

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
  return createBrowserClient(getSupabaseUrl(), getSupabaseKey())
}
