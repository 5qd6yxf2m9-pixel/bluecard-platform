import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BatchDetailClient } from '@/components/BatchDetailClient'
import { ClaimWithDecision, PlanContract } from '@/components/DashboardClient'

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

  // Fetch claims and routing decisions
  const { data: claimsData } = await supabase
    .from('claims')
    .select('*, routing_decisions(*)')
    .eq('batch_id', params.id)
    .order('created_at', { ascending: false })

  const tableData = (claimsData || []) as unknown as ClaimWithDecision[]

  // Fetch plan contracts
  const { data: contractsData } = await supabase
    .from('plan_contracts')
    .select('*')
    .eq('client_id', profile.client_id)

  const contracts = (contractsData || []) as unknown as PlanContract[]

  return (
    <BatchDetailClient 
      batch={batchData}
      tableData={tableData}
      contracts={contracts}
    />
  )
}
