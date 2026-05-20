import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

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

  // Fetch denial claims for recoverable calculation
  const { data: denialRecoverableData } = await supabase
    .from('denial_claims')
    .select('billed_amount, paid_amount')
    .eq('client_id', profile.client_id)

  const denialRecoverable = (denialRecoverableData || []).reduce((sum, claim) => {
    return sum + ((Number(claim.billed_amount) || 0) - (Number(claim.paid_amount) || 0))
  }, 0)

  let estimatedUplift = 0
  let manualReviewCount = 0
  let totalClaimsCount = 0
  let totalApprovedCount = 0

  let openDenialsCount = 0
  let totalDenialsCount = 0

  const [
    upliftRes,
    manualReviewRes,
    totalClaimsRes,
    , // skip approved decisions top 15
    openDenialsCountRes,
    , // skip open denials top 15
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
    // BlueCard approved routing decisions top 15 (fetched to match previous data fetching logic)
    batchIds.length > 0
      ? supabase.from('routing_decisions').select('id, recommended_plan, uplift_amount, claim_id').eq('decision', 'approved').in('batch_id', batchIds).order('uplift_amount', { ascending: false }).limit(15)
      : Promise.resolve({ data: null }),
    // DenialLogic open denials count
    supabase.from('denial_claims').select('*', { count: 'exact', head: true }).eq('client_id', profile.client_id).eq('status', 'open'),
    // DenialLogic open denials top 15 (fetched to match previous data fetching logic)
    supabase.from('denial_claims').select('id, account, payer, billed_amount, category').eq('client_id', profile.client_id).eq('status', 'open').order('billed_amount', { ascending: false }).limit(15),
    // DenialLogic total denials count
    supabase.from('denial_claims').select('*', { count: 'exact', head: true }).eq('client_id', profile.client_id)
  ])

  estimatedUplift = (upliftRes?.data || []).reduce((sum, d) => sum + (Number(d.uplift_amount) || 0), 0)
  manualReviewCount = manualReviewRes?.count || 0
  totalClaimsCount = totalClaimsRes?.count || 0

  openDenialsCount = openDenialsCountRes?.count || 0
  totalDenialsCount = totalDenialsCountRes?.count || 0

  // Fetch total count of approved routing decisions
  if (batchIds.length > 0) {
    const { count } = await supabase
      .from('routing_decisions')
      .select('*', { count: 'exact', head: true })
      .in('batch_id', batchIds)
      .eq('decision', 'approved')
    totalApprovedCount = count || 0
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
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-8">
        
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
                  {formatCurrency(denialRecoverable)}
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

        {/* Modules Section */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-[#0a1628] font-display">
            Modules
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Card 1: BlueCardLogic */}
            <Link 
              href="/dashboard/bluecard"
              className="bg-white shadow-sm border border-[#e2e8f0] border-l-4 border-l-[#2563eb] rounded-xl p-[28px] flex flex-col justify-between hover:shadow-md transition-shadow duration-300 cursor-pointer text-left"
            >
              <div>
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold text-[#0a1628] font-display">
                    BlueCardLogic
                  </h3>
                </div>
                <p className="text-gray-500 text-sm mt-2">
                  Prebill routing + reimbursement optimization
                </p>
                
                <div className="border-t border-gray-100 my-6"></div>
                
                <div className="grid grid-cols-3 gap-4 items-center">
                  <div>
                    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Uplift Available</div>
                    <div className="text-2xl font-extrabold font-display text-[#2563eb] mt-1">{formatCurrency(estimatedUplift)}</div>
                  </div>
                  <div className="border-l border-gray-100 h-10 pl-4">
                    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Ready to Route</div>
                    <div className="text-2xl font-extrabold font-display text-[#0a1628] mt-1">{totalApprovedCount}</div>
                  </div>
                  <div className="border-l border-gray-100 h-10 pl-4">
                    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Needs Review</div>
                    <div className="text-2xl font-extrabold font-display text-[#d97706] mt-1">{manualReviewCount}</div>
                  </div>
                </div>
              </div>

              <div className="mt-6 w-full bg-[#0a1628] hover:bg-[#12253f] text-white text-center py-3 rounded-lg text-sm font-semibold transition-colors block">
                Open BlueCardLogic
              </div>
            </Link>

            {/* Card 2: DenialLogic */}
            <Link 
              href="/dashboard/denials"
              className="bg-white shadow-sm border border-[#e2e8f0] border-l-4 border-l-[#d97706] rounded-xl p-[28px] flex flex-col justify-between hover:shadow-md transition-shadow duration-300 cursor-pointer text-left"
            >
              <div>
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold text-[#0a1628] font-display">
                    DenialLogic
                  </h3>
                </div>
                <p className="text-gray-500 text-sm mt-2">
                  Denial trend analysis + pattern detection
                </p>
                
                <div className="border-t border-gray-100 my-6"></div>
                
                <div className="grid grid-cols-3 gap-4 items-center">
                  <div>
                    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Recoverable</div>
                    <div className="text-2xl font-extrabold font-display text-[#16a34a] mt-1">{formatCurrency(denialRecoverable)}</div>
                  </div>
                  <div className="border-l border-gray-100 h-10 pl-4">
                    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Open Denials</div>
                    <div className="text-2xl font-extrabold font-display text-[#d97706] mt-1">{openDenialsCount}</div>
                  </div>
                  <div className="border-l border-gray-100 h-10 pl-4">
                    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Total Analyzed</div>
                    <div className="text-2xl font-extrabold font-display text-[#0a1628] mt-1">{totalDenialsCount}</div>
                  </div>
                </div>
              </div>

              <div className="mt-6 w-full bg-[#0a1628] hover:bg-[#12253f] text-white text-center py-3 rounded-lg text-sm font-semibold transition-colors block">
                Open DenialLogic
              </div>
            </Link>

            {/* Card 3: UnderpaymentLogic */}
            <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-[28px] opacity-70 flex flex-col justify-between min-h-[220px]">
              <div>
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold text-gray-400 font-display">UnderpaymentLogic</h3>
                  <span className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500 ring-1 ring-inset ring-gray-500/10">
                    Coming Soon
                  </span>
                </div>
                <p className="text-gray-400 text-sm mt-2">
                  Expected reimbursement variance engine
                </p>
              </div>
            </div>

            {/* Card 4: ContractLogic */}
            <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-[28px] opacity-70 flex flex-col justify-between min-h-[220px]">
              <div>
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold text-gray-400 font-display">ContractLogic</h3>
                  <span className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500 ring-1 ring-inset ring-gray-500/10">
                    Coming Soon
                  </span>
                </div>
                <p className="text-gray-400 text-sm mt-2">
                  Contract reimbursement modeling
                </p>
              </div>
            </div>

            {/* Card 5: RevenueIntegrityLogic */}
            <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-[28px] opacity-70 flex flex-col justify-between min-h-[220px]">
              <div>
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold text-gray-400 font-display">RevenueIntegrityLogic</h3>
                  <span className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500 ring-1 ring-inset ring-gray-500/10">
                    Coming Soon
                  </span>
                </div>
                <p className="text-gray-400 text-sm mt-2">
                  Charge capture + coding risk detection
                </p>
              </div>
            </div>

            {/* Card 6: PayerBehaviorLogic */}
            <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-[28px] opacity-70 flex flex-col justify-between min-h-[220px]">
              <div>
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold text-gray-400 font-display">PayerBehaviorLogic</h3>
                  <span className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500 ring-1 ring-inset ring-gray-500/10">
                    Coming Soon
                  </span>
                </div>
                <p className="text-gray-400 text-sm mt-2">
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
