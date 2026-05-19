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

interface OpenDenialQueueItem {
  id: string;
  account: string;
  payer: string;
  billed_amount: number;
  category: string;
}

interface UnifiedQueueItem {
  id: string;
  type: 'BlueCard' | 'Denial';
  label: string;
  subtext: string;
  amount: number;
  actionLabel: 'Route' | 'Review';
  link: string;
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

  // Fetch client denial batches first
  const { data: denialBatchesRaw } = await supabase
    .from('denial_batches')
    .select('id, name, status, total_claims, recoverable_amount, created_at')
    .eq('client_id', profile.client_id)

  const denialBatches = denialBatchesRaw || []

  // Completed denial batches for recoverable sum
  const completedDenialBatches = denialBatches.filter(b => b.status === 'completed')
  const totalDenialRecoverable = completedDenialBatches.reduce((sum, b) => sum + (Number(b.recoverable_amount) || 0), 0)

  let estimatedUplift = 0
  let manualReviewCount = 0
  let totalClaimsCount = 0
  let approvedQueue: ApprovedQueueItem[] = []
  let openDenialsQueue: OpenDenialQueueItem[] = []

  let openDenialsCount = 0
  let totalDenialsCount = 0

  const [
    upliftRes,
    manualReviewRes,
    totalClaimsRes,
    approvedDecisionsRes,
    openDenialsCountRes,
    openDenialsRes,
    totalDenialsCountRes
  ] = await Promise.all([
    // BlueCard sum of uplift_amount (approved)
    batchIds.length > 0 
      ? supabase.from('routing_decisions').select('uplift_amount').in('batch_id', batchIds).eq('decision', 'approved')
      : Promise.resolve({ data: null }),
    // BlueCard manual review count
    batchIds.length > 0
      ? supabase.from('routing_decisions').select('*', { count: 'exact', head: true }).in('batch_id', batchIds).eq('decision', 'manual_review')
      : Promise.resolve({ count: 0 }),
    // BlueCard total claims count
    batchIds.length > 0
      ? supabase.from('claims').select('*', { count: 'exact', head: true }).in('batch_id', batchIds)
      : Promise.resolve({ count: 0 }),
    // BlueCard approved routing decisions top 15
    batchIds.length > 0
      ? supabase.from('routing_decisions').select('id, recommended_plan, uplift_amount, claim_id').eq('decision', 'approved').in('batch_id', batchIds).order('uplift_amount', { ascending: false }).limit(15)
      : Promise.resolve({ data: null }),
    // DenialLogic open denials count
    supabase.from('denial_claims').select('*', { count: 'exact', head: true }).eq('client_id', profile.client_id).eq('status', 'open'),
    // DenialLogic open denials top 15
    supabase.from('denial_claims').select('id, account, payer, billed_amount, category').eq('client_id', profile.client_id).eq('status', 'open').order('billed_amount', { ascending: false }).limit(15),
    // DenialLogic total denials count
    supabase.from('denial_claims').select('*', { count: 'exact', head: true }).eq('client_id', profile.client_id)
  ])

  estimatedUplift = (upliftRes?.data || []).reduce((sum, d) => sum + (Number(d.uplift_amount) || 0), 0)
  manualReviewCount = manualReviewRes?.count || 0
  totalClaimsCount = totalClaimsRes?.count || 0

  openDenialsCount = openDenialsCountRes?.count || 0
  totalDenialsCount = totalDenialsCountRes?.count || 0

  openDenialsQueue = (openDenialsRes?.data || []).map(d => ({
    id: d.id,
    account: d.account || 'Unknown',
    payer: d.payer || 'Unknown',
    billed_amount: Number(d.billed_amount) || 0,
    category: d.category || 'Other'
  }))

  // Fetch claims in batch for Column 1
  if (approvedDecisionsRes?.data && approvedDecisionsRes.data.length > 0) {
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

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val)
  }

  const lastUpdated = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  })

  // Combine and sort priority queue
  const combinedList: UnifiedQueueItem[] = [
    ...approvedQueue.map(item => ({
      id: item.id,
      type: 'BlueCard' as const,
      label: item.patient_id,
      subtext: item.recommended_plan,
      amount: item.uplift_amount,
      actionLabel: 'Route' as const,
      link: '/dashboard/bluecard'
    })),
    ...openDenialsQueue.map(item => ({
      id: item.id,
      type: 'Denial' as const,
      label: item.account,
      subtext: `${item.payer} • ${item.category}`,
      amount: item.billed_amount,
      actionLabel: 'Review' as const,
      link: '/dashboard/denials'
    }))
  ]
  .sort((a, b) => b.amount - a.amount)
  .slice(0, 15)

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
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  BlueCard Uplift Available
                </div>
                <div className="mt-2 text-3xl font-extrabold text-[#2563eb] font-display">
                  {formatCurrency(estimatedUplift)}
                </div>
              </div>
              <div className="text-[11px] text-gray-400 mt-2 font-medium">
                Ready to route
              </div>
            </div>

            {/* Stat Card 2 */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm flex flex-col justify-between min-h-[110px]">
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Denial Recoverable
                </div>
                <div className="mt-2 text-3xl font-extrabold text-[#16a34a] font-display">
                  {formatCurrency(totalDenialRecoverable)}
                </div>
              </div>
              <div className="text-[11px] text-gray-400 mt-2 font-medium">
                Across all denial batches
              </div>
            </div>

            {/* Stat Card 3 */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm flex flex-col justify-between min-h-[110px]">
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Items Needing Attention
                </div>
                <div className="mt-2 text-3xl font-extrabold text-[#d97706] font-display">
                  {manualReviewCount + openDenialsCount}
                </div>
              </div>
              <div className="text-[11px] text-gray-400 mt-2 font-medium">
                Across all modules
              </div>
            </div>

            {/* Stat Card 4 */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm flex flex-col justify-between min-h-[110px]">
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Total Claims Analyzed
                </div>
                <div className="mt-2 text-3xl font-extrabold text-[#0a1628] font-display">
                  {totalClaimsCount + totalDenialsCount}
                </div>
              </div>
              <div className="text-[11px] text-gray-400 mt-2 font-medium">
                BlueCard + Denial
              </div>
            </div>
          </div>
        </div>

        {/* Priority Work Queue */}
        <div className="space-y-4">
          <div className="flex justify-between items-baseline">
            <h2 className="text-xl font-bold text-[#0a1628] font-display">
              Priority Work Queue
            </h2>
            <span className="text-xs text-gray-400 font-medium">
              Last updated: {lastUpdated}
            </span>
          </div>

          {combinedList.length === 0 ? (
            <div className="text-sm text-gray-500 py-8 text-center bg-white rounded-xl border border-[#e2e8f0]">
              No priority work queue items pending.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-sm divide-y divide-gray-100 overflow-hidden">
              {combinedList.map(item => (
                <div key={item.id + '-' + item.type} className="py-4 px-6 flex justify-between items-center hover:bg-gray-50 transition-colors">
                  <div className="flex items-center space-x-4 min-w-0 flex-1">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold shrink-0 ${
                      item.type === 'BlueCard'
                        ? 'bg-blue-50 text-[#2563eb] ring-1 ring-inset ring-blue-700/10'
                        : 'bg-amber-50 text-[#d97706] ring-1 ring-inset ring-amber-700/10'
                    }`}>
                      {item.type}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-[#0a1628] truncate">{item.label}</div>
                      <div className="text-xs text-gray-500 truncate mt-0.5">{item.subtext}</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-6 shrink-0">
                    <span className={`text-sm font-bold ${
                      item.type === 'BlueCard' ? 'text-[#2563eb]' : 'text-[#0a1628]'
                    }`}>
                      {item.type === 'BlueCard' ? '+' : ''}{formatCurrency(item.amount)}
                    </span>
                    <Link
                      href={item.link}
                      className="inline-flex items-center rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors"
                    >
                      {item.actionLabel}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-center items-center space-x-6 pt-4 text-xs font-semibold text-gray-500">
            <Link href="/dashboard/bluecard" className="hover:text-[#2563eb] transition-colors">
              View all in BlueCard
            </Link>
            <span className="text-gray-300">|</span>
            <Link href="/dashboard/denials" className="hover:text-[#d97706] transition-colors">
              View all in Denials
            </Link>
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
