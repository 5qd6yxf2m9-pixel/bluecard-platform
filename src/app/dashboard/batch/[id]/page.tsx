// REMINDER: Run the following SQL migrations in Supabase console:
// ALTER TABLE routing_decisions ADD COLUMN IF NOT EXISTS anthem_expected numeric;
// ALTER TABLE routing_decisions ADD COLUMN IF NOT EXISTS blueshield_expected numeric;

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BatchDetailClient } from '@/components/BatchDetailClient'
import { PlanContract } from '@/components/DashboardClient'

export default async function BatchDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch client ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id')
    .eq('id', user.id)
    .single()

  if (!profile?.client_id) {
    redirect('/dashboard')
  }

  // Fetch batch
  const { data: batchData } = await supabase
    .from('batches')
    .select('*')
    .eq('id', params.id)
    .eq('client_id', profile.client_id)
    .single()

  if (!batchData) {
    redirect('/dashboard')
  }

  // Fetch plan contracts
  const { data: contractsData } = await supabase
    .from('plan_contracts')
    .select('*')
    .eq('client_id', profile.client_id)

  const contracts = (contractsData || []) as unknown as PlanContract[]

  return (
    <BatchDetailClient 
      batch={batchData}
      contracts={contracts}
    />
  )
}
