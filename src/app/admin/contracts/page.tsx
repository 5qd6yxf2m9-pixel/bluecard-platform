// SQL Migration Script for Supabase Console:
// ALTER TABLE plan_contracts ADD COLUMN IF NOT EXISTS state text DEFAULT 'CA';

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ContractsManagerClient, ClientItem } from '@/components/ContractsManagerClient'

export default async function ContractsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    redirect('/dashboard')
  }

  // Fetch all clients sorted by name
  const { data: clientsData } = await supabase
    .from('clients')
    .select('id, name')
    .order('name', { ascending: true })

  const clients = (clientsData || []) as ClientItem[]

  return <ContractsManagerClient initialClients={clients} />
}
