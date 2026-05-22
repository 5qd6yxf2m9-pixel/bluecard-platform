/*
-- Run in Supabase: 
-- alter table denial_batches enable row level security; (already done)
-- create policy "users update own denial batches" on denial_batches for update using (client_id = (select client_id from profiles where id = auth.uid()));
-- Note: Make sure to run this update policy in Supabase before testing!

-- Run in Supabase: create policy "users update own denial claims" on denial_claims for update using (client_id = (select client_id from profiles where id = auth.uid()));
*/

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DenialsClient, DenialClaim, AppealAnalyticsProps } from '@/components/DenialsClient'

export const dynamic = 'force-dynamic'

export default async function DenialsPage() {
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
    return (
      <div className="p-8 text-red-500 font-bold bg-white text-center rounded-xl border border-red-200 max-w-lg mx-auto my-20 shadow-sm">
        Error: Profile or client_id not found. Please contact administration.
      </div>
    )
  }

  // Fetch all denial claims for this client
  const { data: claimsData } = await supabase
    .from('denial_claims')
    .select('*')
    .eq('client_id', profile.client_id)
    .order('created_at', { ascending: false })

  const claims = (claimsData || []) as unknown as DenialClaim[]

  // Fetch appeal analytics data
  const { data: appealData } = await supabase
    .from('denial_claims')
    .select('appeal_date, appeal_outcome, resolution_date, recovered_amount, billed_amount, paid_amount, status')
    .eq('client_id', profile.client_id)
    .not('appeal_date', 'is', null)

  // Calculate analytics
  const hasAppeals = (appealData && appealData.length > 0) || false

  // 1. Appeal Success Rate
  const outcomes = (appealData || []).filter(c => c.appeal_outcome !== null && c.appeal_outcome !== undefined && c.appeal_outcome !== '')
  const totalAppeals = outcomes.length
  const successfulAppeals = outcomes.filter(c => {
    const outcome = String(c.appeal_outcome).toLowerCase().trim()
    return outcome === 'approved' || outcome === 'partially_approved'
  }).length
  const successRate = totalAppeals > 0 ? (successfulAppeals / totalAppeals) * 100 : 0

  // 2. Avg Days to Resolution
  const resolutionClaims = (appealData || []).filter(c => c.appeal_date && c.resolution_date)
  const diffs = resolutionClaims.map(c => {
    const start = new Date(c.appeal_date)
    const end = new Date(c.resolution_date)
    const diffTime = end.getTime() - start.getTime()
    return Math.max(0, diffTime / (1000 * 60 * 60 * 24))
  })
  const avgDays = diffs.length > 0 ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length) : 0

  // 3. Total Recovered
  const totalRecoveredVal = (appealData || [])
    .filter(c => c.recovered_amount && c.recovered_amount > 0)
    .reduce((acc, c) => acc + Number(c.recovered_amount), 0)

  // 4. Pre vs Post Appeal
  const resolvedClaims = (appealData || []).filter(c => c.status === 'resolved')
  const preSum = resolvedClaims.reduce((acc, c) => acc + ((Number(c.billed_amount) || 0) - (Number(c.paid_amount) || 0)), 0)
  const postSum = resolvedClaims.reduce((acc, c) => acc + (Number(c.recovered_amount) || 0), 0)

  const appealAnalytics: AppealAnalyticsProps = {
    hasAppeals,
    successRate,
    totalAppeals,
    successfulAppeals,
    avgDays,
    hasAvgDays: diffs.length > 0,
    totalRecoveredVal,
    preSum,
    postSum
  }

  return (
    <DenialsClient 
      clientId={profile.client_id}
      userEmail={user.email || ''}
      initialClaims={claims}
      appealAnalytics={appealAnalytics}
    />
  )
}
