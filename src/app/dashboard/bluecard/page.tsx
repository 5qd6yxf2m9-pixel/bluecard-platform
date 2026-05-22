import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardClient, BatchData } from '@/components/DashboardClient'

export const dynamic = 'force-dynamic'

interface DecisionChartItem {
  claim_id: string;
  recommended_plan: string | null;
  uplift_amount: number | null;
}

interface ClaimChartItem {
  id: string;
  payer_name: string;
  product_type: string;
}

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
    return <div className="p-8 text-red-500">Error: Profile or client_id not found.</div>
  }

  // Fetch initial active (open or processing) batches
  const { data: batchesData } = await supabase
    .from('batches')
    .select('*')
    .eq('client_id', profile.client_id)
    .in('status', ['open', 'processing'])
    .order('created_at', { ascending: false })

  const batches = (batchesData || []) as unknown as BatchData[]

  // Fetch client batches list for stats
  const { data: clientBatches } = await supabase
    .from('batches')
    .select('id, status')
    .eq('client_id', profile.client_id)

  const batchIds = (clientBatches || []).map(b => b.id)
  const activeBatchesCount = (clientBatches || []).filter(b => b.status === 'open').length

  let totalUpliftAvailable = 0
  let approvedRoutings = 0
  let manualReview = 0
  let totalClaims = 0

  let upliftByPayer: { payer_name: string; uplift: number }[] = []
  let upliftByProductType: { product_type: string; uplift: number }[] = []
  let routingSplit: { name: string; value: number }[] = []

  if (batchIds.length > 0) {
    const [
      upliftRes,
      manualRes,
      approvedRes,
      claimsRes,
      decisionsForChartsRes,
      claimsForChartsRes
    ] = await Promise.all([
      // Total Uplift Available (decision = 'approved')
      supabase.from('routing_decisions').select('uplift_amount').in('batch_id', batchIds).eq('decision', 'approved'),
      // Manual Review count
      supabase.from('routing_decisions').select('*', { count: 'exact', head: true }).in('batch_id', batchIds).eq('decision', 'manual_review'),
      // Approved count
      supabase.from('routing_decisions').select('*', { count: 'exact', head: true }).in('batch_id', batchIds).eq('decision', 'approved'),
      // Total claims
      supabase.from('claims').select('*', { count: 'exact', head: true }).in('batch_id', batchIds),
      // All approved decisions for charts
      supabase.from('routing_decisions').select('claim_id, recommended_plan, uplift_amount').in('batch_id', batchIds).eq('decision', 'approved'),
      // All claims for charts
      supabase.from('claims').select('id, payer_name, product_type').in('batch_id', batchIds)
    ])

    totalUpliftAvailable = (upliftRes.data || []).reduce((sum, r) => sum + (Number(r.uplift_amount) || 0), 0)
    manualReview = manualRes.count || 0
    approvedRoutings = approvedRes.count || 0
    totalClaims = claimsRes.count || 0

    // In-memory calculations for charts
    const decisions = (decisionsForChartsRes.data || []) as unknown as DecisionChartItem[]
    const claimsData = (claimsForChartsRes.data || []) as unknown as ClaimChartItem[]

    // Group by Payer
    const payerMap: Record<string, number> = {}
    // Group by Product Type
    const productMap: Record<string, number> = {}
    // Routing Split
    const splitMap: Record<string, number> = {}

    decisions.forEach(dec => {
      const claim = claimsData.find(c => c.id === dec.claim_id)
      const uplift = Number(dec.uplift_amount) || 0
      
      if (claim) {
        const payer = claim.payer_name || 'Unknown Payer'
        payerMap[payer] = (payerMap[payer] || 0) + uplift

        const product = claim.product_type || 'Unknown Product'
        productMap[product] = (productMap[product] || 0) + uplift
      }

      if (dec.recommended_plan) {
        const planRaw = String(dec.recommended_plan)
        const planName = planRaw.toLowerCase().includes('shield') ? 'Blue Shield' : 'Anthem'
        splitMap[planName] = (splitMap[planName] || 0) + 1
      }
    })

    upliftByPayer = Object.entries(payerMap).map(([payer_name, uplift]) => ({
      payer_name,
      uplift
    }))

    upliftByProductType = Object.entries(productMap).map(([product_type, uplift]) => ({
      product_type,
      uplift
    }))

    routingSplit = Object.entries(splitMap).map(([name, value]) => ({
      name,
      value
    }))
  }

  const stats = {
    totalUpliftAvailable,
    approvedRoutings,
    manualReview,
    totalClaims,
    activeBatches: activeBatchesCount
  }

  const chartData = {
    upliftByPayer,
    upliftByProductType,
    routingSplit
  }

  return (
    <DashboardClient 
      userEmail={user.email || ''} 
      clientId={profile.client_id}
      initialBatches={batches}
      stats={stats}
      chartData={chartData}
    />
  )
}
