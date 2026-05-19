import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface ApprovedQueueItem {
  id: string;
  patient_id: string;
  recommended_plan: string;
  uplift_amount: number;
}

interface ReviewQueueItem {
  id: string;
  patient_id: string;
  reason_code: string;
}

interface BatchQueueItem {
  id: string;
  name: string;
  status: string;
  total_claims: number;
}

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch user profile and role
  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.client_id) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8 text-red-600 font-medium">
        Error: Profile or client ID not found. Please contact administration.
      </div>
    )
  }

  // Server Action for sign out
  const handleSignOut = async () => {
    'use server'
    const supabaseClient = createClient()
    await supabaseClient.auth.signOut()
    redirect('/login')
  }

  // Fetch client batches first
  const { data: clientBatches } = await supabase
    .from('batches')
    .select('id')
    .eq('client_id', profile.client_id)

  const batchIds = (clientBatches || []).map(b => b.id)

  let estimatedUplift = 0
  let manualReviewCount = 0
  let totalClaimsCount = 0
  let activeBatchesCount = 0
  let approvedQueue: ApprovedQueueItem[] = []
  let reviewQueue: ReviewQueueItem[] = []
  let batchQueue: BatchQueueItem[] = []

  if (batchIds.length > 0) {
    const [
      upliftRes,
      manualReviewRes,
      totalClaimsRes,
      activeBatchesRes,
      approvedDecisionsRes,
      reviewDecisionsRes,
      recentBatchesRes
    ] = await Promise.all([
      supabase
        .from('routing_decisions')
        .select('uplift_amount')
        .in('batch_id', batchIds)
        .eq('decision', 'approved'),
      supabase
        .from('routing_decisions')
        .select('*', { count: 'exact', head: true })
        .in('batch_id', batchIds)
        .eq('decision', 'manual_review'),
      supabase
        .from('claims')
        .select('*', { count: 'exact', head: true })
        .in('batch_id', batchIds),
      supabase
        .from('batches')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', profile.client_id)
        .eq('status', 'open'),
      supabase
        .from('routing_decisions')
        .select('id, recommended_plan, uplift_amount, claim_id')
        .eq('decision', 'approved')
        .in('batch_id', batchIds)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('routing_decisions')
        .select('id, manual_review_code, reason, claim_id')
        .eq('decision', 'manual_review')
        .in('batch_id', batchIds)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('batches')
        .select('id, name, status, total_claims')
        .eq('client_id', profile.client_id)
        .order('created_at', { ascending: false })
        .limit(5)
    ])

    estimatedUplift = (upliftRes.data || []).reduce((sum, d) => sum + (Number(d.uplift_amount) || 0), 0)
    manualReviewCount = manualReviewRes.count || 0
    totalClaimsCount = totalClaimsRes.count || 0
    activeBatchesCount = activeBatchesRes.count || 0

    // Fetch claims in batch for Column 1
    if (approvedDecisionsRes.data && approvedDecisionsRes.data.length > 0) {
      const claimIds = approvedDecisionsRes.data.map(d => d.claim_id)
      const { data: claimsData } = await supabase
        .from('claims')
        .select('id, patient_id')
        .in('id', claimIds)

      approvedQueue = approvedDecisionsRes.data.map(d => {
        const claim = (claimsData || []).find(c => c.id === d.claim_id)
        return {
          id: d.id,
          patient_id: claim?.patient_id || 'Unknown',
          recommended_plan: d.recommended_plan || '',
          uplift_amount: Number(d.uplift_amount) || 0
        }
      })
    }

    // Fetch claims in batch for Column 2
    if (reviewDecisionsRes.data && reviewDecisionsRes.data.length > 0) {
      const claimIds = reviewDecisionsRes.data.map(d => d.claim_id)
      const { data: claimsData } = await supabase
        .from('claims')
        .select('id, patient_id')
        .in('id', claimIds)

      reviewQueue = reviewDecisionsRes.data.map(d => {
        const claim = (claimsData || []).find(c => c.id === d.claim_id)
        return {
          id: d.id,
          patient_id: claim?.patient_id || 'Unknown',
          reason_code: d.manual_review_code || d.reason || 'Needs Review'
        }
      })
    }

    batchQueue = (recentBatchesRes.data || []).map(b => ({
      id: b.id,
      name: b.name,
      status: b.status,
      total_claims: Number(b.total_claims) || 0
    }))
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans selection:bg-[#2563eb] selection:text-white">
      {/* Navy Header */}
      <header className="bg-[#0a1628] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <span className="text-2xl font-bold font-display tracking-tight text-white">
              RevenueLogic
            </span>
            {profile.role === 'admin' && (
              <Link 
                href="/admin" 
                className="text-[#2563eb] hover:text-blue-400 text-sm font-semibold transition-colors border-l border-white/20 pl-4"
              >
                Admin Panel
              </Link>
            )}
          </div>
          <div className="flex items-center space-x-5">
            <span className="text-sm text-gray-400 font-medium">{user.email}</span>
            <form action={handleSignOut}>
              <button 
                type="submit" 
                className="text-sm font-semibold border border-white/20 hover:bg-white/10 px-4 py-2 rounded-md transition-all duration-300"
              >
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-10">
        
        {/* Financial Opportunity Summary Bar */}
        <div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
            {/* Stat Card 1 */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm flex flex-col justify-between min-h-[110px]">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Estimated Uplift Available
              </div>
              <div className="mt-2 text-3xl font-extrabold text-[#0a1628] font-display">
                {formatCurrency(estimatedUplift)}
              </div>
            </div>

            {/* Stat Card 2 */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm flex flex-col justify-between min-h-[110px]">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Claims Needing Review
              </div>
              <div className="mt-2 text-3xl font-extrabold text-[#0a1628] font-display">
                {manualReviewCount}
              </div>
            </div>

            {/* Stat Card 3 */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm flex flex-col justify-between min-h-[110px]">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Total Claims Analyzed
              </div>
              <div className="mt-2 text-3xl font-extrabold text-[#0a1628] font-display">
                {totalClaimsCount}
              </div>
            </div>

            {/* Stat Card 4 */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm flex flex-col justify-between min-h-[110px]">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Active Batches
              </div>
              <div className="mt-2 text-3xl font-extrabold text-[#0a1628] font-display">
                {activeBatchesCount}
              </div>
            </div>
          </div>
        </div>

        {/* Priority Work Queue */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-[#0a1628] font-display">
            Priority Work Queue
          </h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Column 1: Ready to Route */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-sm flex flex-col justify-between">
              <div className="p-5 border-b border-gray-100">
                <h3 className="font-bold text-gray-900 text-sm">Ready to Route</h3>
              </div>
              <div className="p-5 flex-1 divide-y divide-gray-100">
                {approvedQueue.length === 0 ? (
                  <div className="text-sm text-gray-500 py-6 text-center">
                    No approved claims pending.
                  </div>
                ) : (
                  approvedQueue.map(item => (
                    <div key={item.id} className="py-3 flex justify-between items-center text-sm">
                      <div>
                        <div className="font-semibold text-gray-900">{item.patient_id}</div>
                        <div className="text-xs text-gray-500">Route to {item.recommended_plan}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-[#2563eb]">+{formatCurrency(item.uplift_amount)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                <Link 
                  href="/dashboard/bluecard" 
                  className="bg-[#0a1628] hover:bg-[#12253f] text-white px-4 py-2 rounded-md text-xs font-bold transition-colors"
                >
                  View Module
                </Link>
              </div>
            </div>

            {/* Column 2: Needs Review */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-sm flex flex-col justify-between">
              <div className="p-5 border-b border-gray-100">
                <h3 className="font-bold text-gray-900 text-sm">Needs Review</h3>
              </div>
              <div className="p-5 flex-1 divide-y divide-gray-100">
                {reviewQueue.length === 0 ? (
                  <div className="text-sm text-gray-500 py-6 text-center">
                    No claims pending manual review.
                  </div>
                ) : (
                  reviewQueue.map(item => (
                    <div key={item.id} className="py-3 flex justify-between items-center text-sm">
                      <div>
                        <div className="font-semibold text-gray-900">{item.patient_id}</div>
                        <div className="text-xs text-gray-500 truncate max-w-[200px]">{item.reason_code}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                <Link 
                  href="/dashboard/bluecard" 
                  className="bg-[#0a1628] hover:bg-[#12253f] text-white px-4 py-2 rounded-md text-xs font-bold transition-colors"
                >
                  Review
                </Link>
              </div>
            </div>

            {/* Column 3: Recent Batches */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-sm flex flex-col justify-between">
              <div className="p-5 border-b border-gray-100">
                <h3 className="font-bold text-gray-900 text-sm">Recent Batches</h3>
              </div>
              <div className="p-5 flex-1 divide-y divide-gray-100">
                {batchQueue.length === 0 ? (
                  <div className="text-sm text-gray-500 py-6 text-center">
                    No batches uploaded yet.
                  </div>
                ) : (
                  batchQueue.map(item => (
                    <div key={item.id} className="py-3 flex justify-between items-center text-sm">
                      <div>
                        <div className="font-semibold text-gray-900">{item.name}</div>
                        <div className="text-xs text-gray-500">{item.total_claims} claims</div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${
                          item.status === 'open' 
                            ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20' 
                            : item.status === 'processing'
                            ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 animate-pulse'
                            : 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-500/10'
                        }`}>
                          {item.status}
                        </span>
                        <Link 
                          href={`/dashboard/bluecard/batch/${item.id}`}
                          className="bg-white hover:bg-gray-50 text-gray-900 border border-gray-300 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors"
                        >
                          View
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                <Link 
                  href="/dashboard/bluecard" 
                  className="bg-[#0a1628] hover:bg-[#12253f] text-white px-4 py-2 rounded-md text-xs font-bold transition-colors"
                >
                  View All
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Modules Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-[#0a1628] font-display">
            Modules
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            
            {/* Card 1: BlueCardLogic */}
            <Link 
              href="/dashboard/bluecard"
              className="bg-white hover:shadow-md transition-shadow duration-300 rounded-xl border border-[#e2e8f0] border-l-4 border-l-[#2563eb] p-6 flex justify-between items-center group cursor-pointer"
            >
              <div>
                <h3 className="text-lg font-bold text-gray-900 group-hover:text-[#2563eb] transition-colors">
                  BlueCardLogic
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Prebill routing + reimbursement optimization
                </p>
              </div>
              <div className="text-gray-400 group-hover:text-[#2563eb] transition-colors">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>

            {/* Card 2: DenialLogic */}
            <Link 
              href="/dashboard/denials"
              className="bg-white hover:shadow-md transition-shadow duration-300 rounded-xl border border-[#e2e8f0] border-l-4 border-l-[#d97706] p-6 flex justify-between items-center group cursor-pointer"
            >
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-[#d97706] transition-colors">
                    DenialLogic
                  </h3>
                  <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                    Beta
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Denial trend analysis + pattern detection
                </p>
              </div>
              <div className="text-gray-400 group-hover:text-[#d97706] transition-colors">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>

            {/* Card 3: UnderpaymentLogic */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] border-l-4 border-l-gray-300 p-6 flex justify-between items-center">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-bold text-gray-400">
                    UnderpaymentLogic
                  </h3>
                  <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-500 ring-1 ring-inset ring-gray-500/10">
                    Coming Soon
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1">
                  Expected reimbursement variance engine
                </p>
              </div>
            </div>

            {/* Card 4: ContractLogic */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] border-l-4 border-l-gray-300 p-6 flex justify-between items-center">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-bold text-gray-400">
                    ContractLogic
                  </h3>
                  <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-500 ring-1 ring-inset ring-gray-500/10">
                    Coming Soon
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1">
                  Contract reimbursement modeling
                </p>
              </div>
            </div>

            {/* Card 5: RevenueIntegrityLogic */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] border-l-4 border-l-gray-300 p-6 flex justify-between items-center">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-bold text-gray-400">
                    RevenueIntegrityLogic
                  </h3>
                  <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-500 ring-1 ring-inset ring-gray-500/10">
                    Coming Soon
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1">
                  Charge capture + coding risk detection
                </p>
              </div>
            </div>

            {/* Card 6: PayerBehaviorLogic */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] border-l-4 border-l-gray-300 p-6 flex justify-between items-center">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-bold text-gray-400">
                    PayerBehaviorLogic
                  </h3>
                  <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-500 ring-1 ring-inset ring-gray-500/10">
                    Coming Soon
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1">
                  Payer delay + denial behavior tracking
                </p>
              </div>
            </div>

          </div>
        </div>

      </main>
    </div>
  )
}
