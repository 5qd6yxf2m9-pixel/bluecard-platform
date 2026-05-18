import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardClient, ClaimWithDecision, DashboardStats, PlanContract } from '@/components/DashboardClient'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch client ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.client_id) {
    // Handle edge case where profile doesn't exist
    return <div className="p-8 text-red-500">Error: Profile or client_id not found.</div>
  }

  // Fetch claims and their routing decisions
  const { data: claimsData } = await supabase
    .from('claims')
    .select('*, routing_decisions(*)')
    .eq('client_id', profile.client_id)
    .order('created_at', { ascending: false })

  const tableData = (claimsData || []) as unknown as ClaimWithDecision[]

  // Fetch plan contracts for the client
  const { data: contractsData } = await supabase
    .from('plan_contracts')
    .select('*')
    .eq('client_id', profile.client_id)

  const contracts = (contractsData || []) as unknown as PlanContract[]

  // Calculate Stats
  const stats: DashboardStats = {
    totalProcessed: 0,
    approvedCount: 0,
    manualReviewCount: 0,
    totalUplift: 0,
  }

  tableData.forEach((claim) => {
    if (claim.routing_decisions && claim.routing_decisions.length > 0) {
      stats.totalProcessed++
      const decision = claim.routing_decisions[0]
      if (decision.decision === 'approved') {
        stats.approvedCount++
      } else if (decision.decision === 'manual_review') {
        stats.manualReviewCount++
      }
      if (decision.uplift_amount) {
        stats.totalUplift += decision.uplift_amount
      }
    }
  })

  return (
    <DashboardClient 
      userEmail={user.email || ''} 
      clientId={profile.client_id}
      stats={stats}
      tableData={tableData}
      role={profile.role}
      contracts={contracts}
    />
  )
}
