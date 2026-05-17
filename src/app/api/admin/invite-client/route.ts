import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const serverSupabase = createServerClient()
    const { data: { user } } = await serverSupabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await serverSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is missing in env' }, { status: 500 })
    }

    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    )

    const reqData = await request.json() as Record<string, unknown>
    const name = String(reqData.name || '')
    const email = String(reqData.email || '')

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
    }

    // Insert into clients table
    const { data: newClient, error: clientError } = await adminSupabase
      .from('clients')
      .insert({ name })
      .select()
      .single()

    if (clientError || !newClient) {
      throw new Error()
    }

    // Invite user via auth admin API
    const { data: authData, error: authError } = await adminSupabase.auth.admin.inviteUserByEmail(email)

    if (authError || !authData.user) {
      throw new Error()
    }

    // Create profile for new user
    const { error: profileError } = await adminSupabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        client_id: newClient.id,
        role: 'user'
      })

    if (profileError) {
      throw new Error()
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
