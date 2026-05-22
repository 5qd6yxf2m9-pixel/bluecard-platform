// REMINDER: Run the following SQL migrations in Supabase console:
// ALTER TABLE routing_decisions ADD COLUMN IF NOT EXISTS anthem_expected numeric;
// ALTER TABLE routing_decisions ADD COLUMN IF NOT EXISTS blueshield_expected numeric;
// ALTER TABLE routing_decisions ADD COLUMN IF NOT EXISTS financial_tier text;
// ALTER TABLE routing_decisions ADD COLUMN IF NOT EXISTS manual_review_code text;

'use client'

import { useState, useEffect, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { ClaimWithDecision, PlanContract, BatchData } from '@/components/DashboardClient'

interface BatchDetailClientProps {
  batch: BatchData;
  contracts: PlanContract[];
}

interface AuthConflictClaim {
  id: string;
  claim_id: string;
  reason: string;
  manual_review_code: string;
  anthem_expected: number;
  blueshield_expected: number;
  uplift_amount: number;
  patient_id?: string;
  alpha_prefix?: string;
  dos?: string;
  product_type?: string;
  auth_status?: string | null;
  auth_payer?: string | null;
}

interface ModalClaimData {
  id: string;
  patient_id: string;
  alpha_prefix: string;
  dos: string;
  product_type: string;
  payer_name: string;
  charge_amount: number;
  cpt_code?: string | null;
  rev_code?: string | null;
  auth_status?: string | null;
  auth_payer?: string | null;
  auth_dos_start?: string | null;
  auth_dos_end?: string | null;
}

interface ModalDecisionData {
  id: string;
  decision: string;
  reason: string;
  recommended_plan: string | null;
  alternate_plan: string | null;
  uplift_amount: number | null;
  anthem_expected: number | null;
  blueshield_expected: number | null;
  confidence_score: number | null;
  financial_tier?: string | null;
  manual_review_code?: string | null;
}

interface ModalPrefixData {
  plan_name: string;
  state: string;
  is_active: boolean;
  program: string;
  license_status: string;
  contracted_provider: boolean;
  effective_start_date?: string | null;
  effective_end_date?: string | null;
}

export function BatchDetailClient({ batch, contracts }: BatchDetailClientProps) {
  const [tab, setTab] = useState<'routing_decisions' | 'manual_review' | 'duplicates'>('routing_decisions')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [claims, setClaims] = useState<ClaimWithDecision[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [editingName, setEditingName] = useState(false)
  const [batchName, setBatchName] = useState(batch.name)
  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null)
  const [authConflictClaims, setAuthConflictClaims] = useState<AuthConflictClaim[]>([])
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null)

  const handleSaveBatchName = async () => {
    if (!batchName.trim()) return
    try {
      const { error: renameError } = await supabase
        .from('batches')
        .update({ name: batchName.trim() })
        .eq('id', batch.id)

      if (renameError) throw renameError
      setEditingName(false)
    } catch {
      alert('Failed to rename batch.')
    }
  }

  const handleCancelRename = () => {
    setEditingName(false)
    setBatchName(batch.name)
  }
  
  const [stats, setStats] = useState({
    totalClaims: 0,
    approved: 0,
    manualReview: 0,
    duplicates: 0,
    totalUplift: 0
  })

  const supabase = createClient()
  const itemsPerPage = 50

  // 1. Debounced Search Input
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
      setExpandedClaimId(null)
    }, 300)
    return () => clearTimeout(handler)
  }, [searchInput])

  // Reset page and expanded row when tab changes
  useEffect(() => {
    setPage(1)
    setExpandedClaimId(null)
  }, [tab])

  // 2. Fetch Stats using exact counts (Never fetch all rows)
  const fetchStats = async () => {
    try {
      const { count: totalClaimsCount } = await supabase
        .from('claims')
        .select('*', { count: 'exact', head: true })
        .eq('batch_id', batch.id)

      const { count: approvedCount } = await supabase
        .from('routing_decisions')
        .select('*', { count: 'exact', head: true })
        .eq('batch_id', batch.id)
        .eq('decision', 'approved')

      const { count: manualReviewCount } = await supabase
        .from('routing_decisions')
        .select('*', { count: 'exact', head: true })
        .eq('batch_id', batch.id)
        .eq('decision', 'manual_review')

      const { count: duplicatesCount } = await supabase
        .from('claims')
        .select('*', { count: 'exact', head: true })
        .eq('batch_id', batch.id)
        .eq('status', 'duplicate')

      const { data: upliftData } = await supabase
        .from('routing_decisions')
        .select('uplift_amount')
        .eq('batch_id', batch.id)
        .eq('decision', 'approved')

      const totalUplift = (upliftData || []).reduce((sum, item) => sum + (item.uplift_amount || 0), 0)

      setStats({
        totalClaims: totalClaimsCount || 0,
        approved: approvedCount || 0,
        manualReview: manualReviewCount || 0,
        duplicates: duplicatesCount || 0,
        totalUplift
      })
    } catch { }
  }

  // 3. Fetch Claims server-side with .range() and exact count
  const fetchClaims = async () => {
    setLoading(true)
    try {
      const start = (page - 1) * itemsPerPage
      const end = start + itemsPerPage - 1

      // Search filters
      if (tab === 'duplicates') {
        let query = supabase
          .from('claims')
          .select('id, patient_id, alpha_prefix, dos, charge_amount, status', { count: 'exact' })
          .eq('batch_id', batch.id)
          .eq('status', 'duplicate')

        if (search) {
          query = query.or(`patient_id.ilike.%${search}%,alpha_prefix.ilike.%${search}%`)
        }

        query = query
          .order('created_at', { ascending: false })
          .range(start, end)

        const { data, count, error } = await query

        if (error) throw error

        const mappedClaims = (data || []).map(claim => ({
          ...claim,
          routing_decisions: []
        }))
        setClaims(mappedClaims as unknown as ClaimWithDecision[])
        setTotalCount(count || 0)
      } else {
        const targetDecision = tab === 'routing_decisions' ? 'approved' : 'manual_review'
        
        let decisionQuery = supabase
          .from('routing_decisions')
          .select('*', { count: 'exact' })
          .eq('batch_id', batch.id)
          .eq('decision', targetDecision)

        decisionQuery = decisionQuery
          .order('created_at', { ascending: false })
          .range(start, end)

        const { data: decisions, count: decisionCount, error: decisionError } = await decisionQuery

        if (decisionError) throw decisionError

        if (!decisions || decisions.length === 0) {
          setClaims([])
          setTotalCount(0)
          return
        }

        const claimIds = decisions.map(d => d.claim_id)
        
        let claimsQuery = supabase
          .from('claims')
          .select('*')
          .in('id', claimIds)

        if (search) {
          claimsQuery = claimsQuery.or(`patient_id.ilike.%${search}%,alpha_prefix.ilike.%${search}%`)
        }

        const { data: claimsData, error: claimsError } = await claimsQuery

        if (claimsError) throw claimsError

        const mappedClaims = (claimsData || []).map(claim => {
          const matchedDecision = decisions.find(d => d.claim_id === claim.id)
          return {
            ...claim,
            routing_decisions: matchedDecision ? [matchedDecision] : []
          }
        })

        const sortedClaims = decisions
          .map(d => mappedClaims.find(c => c.id === d.claim_id))
          .filter(Boolean) as ClaimWithDecision[]

        setClaims(sortedClaims)
        setTotalCount(decisionCount || 0)
      }
    } catch { }
    finally {
      setLoading(false)
    }
  }

  const fetchAuthConflictClaims = async () => {
    try {
      const { data: decisions, error: decError } = await supabase
        .from('routing_decisions')
        .select('id, claim_id, reason, manual_review_code, anthem_expected, blueshield_expected, uplift_amount')
        .eq('batch_id', batch.id)
        .eq('manual_review_code', 'MR-006')

      if (decError) throw decError

      if (!decisions || decisions.length === 0) {
        setAuthConflictClaims([])
        return
      }

      const claimIds = decisions.map(d => d.claim_id)
      const { data: claimsData, error: claimsError } = await supabase
        .from('claims')
        .select('id, patient_id, alpha_prefix, dos, product_type, auth_status, auth_payer')
        .in('id', claimIds)

      if (claimsError) throw claimsError

      const joined: AuthConflictClaim[] = decisions.map(d => {
        const claim = (claimsData || []).find(c => c.id === d.claim_id)
        return {
          ...d,
          patient_id: claim?.patient_id || '',
          alpha_prefix: claim?.alpha_prefix || '',
          dos: claim?.dos || '',
          product_type: claim?.product_type || '',
          auth_status: claim?.auth_status || '',
          auth_payer: claim?.auth_payer || ''
        }
      })

      setAuthConflictClaims(joined)
    } catch { }
  }

  // Trigger claim fetching and stats syncing when dependencies change
  useEffect(() => {
    void fetchClaims()
    void fetchStats()
    void fetchAuthConflictClaims()
  }, [tab, page, search]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleManualRoute = async (decisionId: string, plan: string, overrideReason?: string) => {
    try {
      const { error: updateError } = await supabase
        .from('routing_decisions')
        .update({ 
          decision: 'approved', 
          recommended_plan: plan, 
          reason: overrideReason || 'Manually routed by billing staff',
          confidence_score: null
        })
        .eq('id', decisionId)
      
      if (updateError) throw new Error()
      
      // Refresh only the active tab's claims data and global stats count!
      await fetchClaims()
      await fetchStats()
      await fetchAuthConflictClaims()
      setExpandedClaimId(null)
    } catch {
      alert('Failed to update routing decision.')
    }
  }

  const handleProcessAnyway = async (claimId: string) => {
    try {
      const res = await fetch('/api/process-claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim_id: claimId })
      })

      const data = await res.json() as Record<string, unknown>
      if (!res.ok) throw new Error(String(data.error || 'Failed to process claim'))

      await fetchClaims()
      await fetchStats()

      const decision = String(data.decision || '')
      if (decision === 'manual_review') {
        setTab('manual_review')
      } else {
        setTab('routing_decisions')
      }
    } catch {
      alert('Failed to process claim.')
    }
  }

  const handleDismissClaim = async (claimId: string) => {
    try {
      const { error } = await supabase
        .from('claims')
        .update({ status: 'dismissed' })
        .eq('id', claimId)

      if (error) throw error

      await fetchClaims()
      await fetchStats()
    } catch {
      alert('Failed to dismiss claim.')
    }
  }

  const markComplete = async () => {
    try {
      const { error } = await supabase
        .from('batches')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', batch.id)
      
      if (error) throw new Error()
      window.location.reload()
    } catch {
      alert('Failed to mark batch as complete.')
    }
  }

  const exportResults = async () => {
    try {
      const { data: decisions, error: decisionError } = await supabase
        .from('routing_decisions')
        .select('*')
        .eq('batch_id', batch.id)
        .eq('decision', 'approved')

      if (decisionError) throw decisionError

      if (!decisions || decisions.length === 0) {
        alert('No approved claims to export.')
        return
      }

      const claimIds = decisions.map(d => d.claim_id)

      const { data: claimsData, error: claimsError } = await supabase
        .from('claims')
        .select('*')
        .in('id', claimIds)

      if (claimsError) throw claimsError

      const exportData = (claimsData || []).map(claim => {
        const matchedDecision = decisions.find(d => d.claim_id === claim.id)
        return {
          ...claim,
          routing_decisions: matchedDecision ? [matchedDecision] : []
        }
      }) as unknown as ClaimWithDecision[]

      const headers = ['Patient ID', 'Prefix', 'Product Type', 'Charge Amount', 'Recommended Plan', 'Alternate Plan', 'Uplift Amount', 'Decision', 'Reason']
      const rows = exportData.map(claim => {
        const d = claim.routing_decisions[0]
        return [
          claim.patient_id,
          claim.alpha_prefix,
          claim.product_type,
          claim.charge_amount,
          d?.recommended_plan || '',
          d?.alternate_plan || '',
          d?.uplift_amount || '',
          d?.decision || claim.status,
          d?.reason || ''
        ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')
      })
      
      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n')
      const encodedUri = encodeURI(csvContent)
      const link = document.createElement("a")
      link.setAttribute("href", encodedUri)
      link.setAttribute("download", `batch_results_${batch.id}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch { }
  }

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)


  const getReasonLines = (reason: string) => {
    if (!reason) return []
    
    let lines: string[] = []
    if (reason.includes('|')) {
      lines = reason.split('|').map(line => line.trim()).filter(Boolean)
    } else {
      // Fallback splitting logic for older records
      let parsed = reason
      parsed = parsed.replace(/- Medium confidence/g, '|Medium confidence')
      parsed = parsed.replace(/Warning:/g, '|Warning:')
      parsed = parsed.split('. ').join('.|')
      lines = parsed.split('|').map(line => line.trim()).filter(Boolean)
    }

    // Always sort lines that start with "Warning:" to the very end
    const warnings = lines.filter(line => line.startsWith('Warning:'))
    const nonWarnings = lines.filter(line => !line.startsWith('Warning:'))
    return [...nonWarnings, ...warnings]
  }

  const renderPriorityBadge = (claim: ClaimWithDecision) => {
    const decision = claim.routing_decisions?.[0]
    const tier = decision?.financial_tier || 'Tier 1 - Low'
    
    if (tier.includes('Tier 4') || tier.includes('Critical')) {
      return (
        <span className="inline-flex items-center rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
          Critical
        </span>
      )
    } else if (tier.includes('Tier 3') || tier.includes('High')) {
      return (
        <span className="inline-flex items-center rounded-md bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-800 ring-1 ring-inset ring-orange-600/20">
          High
        </span>
      )
    } else if (tier.includes('Tier 2') || tier.includes('Moderate')) {
      return (
        <span className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20">
          Moderate
        </span>
      )
    } else {
      return (
        <span className="inline-flex items-center rounded-md bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-500/10">
          Low
        </span>
      )
    }
  }

  const renderConfidenceBadge = (claim: ClaimWithDecision) => {
    const decision = claim.routing_decisions?.[0]
    if (!decision) {
      return (
        <span className="inline-flex items-center rounded-md bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600 ring-1 ring-inset ring-gray-500/10">
          N/A
        </span>
      )
    }

    const isReviewed = decision.decision === 'approved' && (
      decision.reason === 'Manually routed by billing staff' || 
      decision.reason === 'MA/FEP claim billed separately outside BlueCard routing'
    );

    if (isReviewed) {
      return (
        <span className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-500/20">
          Reviewed
        </span>
      )
    }

    const score = decision.confidence_score
    if (score !== null && score !== undefined) {
      if (score >= 95) {
        return (
          <span className="inline-flex items-center rounded-md bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-600/20">
            Extremely High ({score})
          </span>
        )
      } else if (score >= 85) {
        return (
          <span className="inline-flex items-center rounded-md bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-600/20">
            High ({score})
          </span>
        )
      } else if (score >= 70) {
        return (
          <span className="inline-flex items-center rounded-md bg-yellow-50 px-2.5 py-1 text-xs font-semibold text-yellow-800 ring-1 ring-inset ring-yellow-600/20">
            Moderate ({score})
          </span>
        )
      } else if (score >= 50) {
        return (
          <span className="inline-flex items-center rounded-md bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-800 ring-1 ring-inset ring-orange-600/20">
            Uncertain ({score})
          </span>
        )
      } else {
        return (
          <span className="inline-flex items-center rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
            Unsafe ({score})
          </span>
        )
      }
    }

    return (
      <span className="inline-flex items-center rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
        Unsafe (0)
      </span>
    )
  }

  const invalidPrefixClaims = claims.filter(claim => {
    const decision = claim.routing_decisions?.[0]
    if (!decision) return false
    return decision.reason?.includes('Invalid or inactive alpha prefix') || 
           decision.reason?.includes('Invalid date of service') ||
           decision.manual_review_code === 'MR-001' || 
           decision.manual_review_code === 'MR-002'
  })

  const excludedProductsClaims = claims.filter(claim => {
    const decision = claim.routing_decisions?.[0]
    if (!decision) return false
    return decision.reason?.includes('Medicare Advantage or FEP') || 
           decision.manual_review_code === 'MR-008' || 
           decision.manual_review_code === 'MR-009'
  })

  const missingContractClaims = claims.filter(claim => {
    const decision = claim.routing_decisions?.[0]
    if (!decision) return false
    return decision.reason?.includes('No contracts found') || 
           decision.reason?.includes('Only one') ||
           decision.reason?.includes('Uncertain') ||
           decision.manual_review_code === 'MR-004'
  })

  const totalPages = Math.ceil(totalCount / itemsPerPage)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-[#0a1628] shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <Link href="/dashboard/bluecard" className="text-white hover:text-gray-300 flex items-center space-x-2 text-sm font-semibold transition-colors">
              <span>&larr;</span> <span>Back</span>
            </Link>

            <div className="flex items-center space-x-3">
              {editingName ? (
                <div className="flex items-center space-x-1">
                  <input
                    type="text"
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    className="px-2 py-1 border border-gray-600 rounded text-sm font-bold text-white bg-slate-800"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveBatchName}
                    className="text-green-400 hover:text-green-300 p-1 flex-shrink-0"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <button
                    onClick={handleCancelRename}
                    className="text-red-400 hover:text-red-300 p-1 flex-shrink-0"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <h1 className="text-xl font-bold text-white font-display">{batchName}</h1>
                  <button
                    onClick={() => setEditingName(true)}
                    className="text-gray-400 hover:text-white p-1 transition-colors flex-shrink-0"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
              )}
              <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${
                batch.status === 'completed' 
                  ? 'bg-green-500/10 text-green-400 ring-green-500/20' 
                  : 'bg-blue-500/10 text-blue-400 ring-blue-500/20'
              }`}>
                {batch.status}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button 
              onClick={exportResults} 
              className="text-sm text-white font-semibold border border-white/20 hover:bg-white/10 px-3 py-1.5 rounded-md transition-colors"
            >
              Export Results
            </button>
            {batch.status !== 'completed' && (
              <button 
                onClick={markComplete} 
                className="text-sm text-white font-semibold bg-[#2563eb] hover:bg-blue-700 px-3 py-1.5 rounded-md transition-colors shadow-sm"
              >
                Mark Batch Complete
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
        
        {/* STATS */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
          <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
            <dt className="truncate text-sm font-medium text-gray-500">Total Claims</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">{stats.totalClaims}</dd>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
            <dt className="truncate text-sm font-medium text-gray-500">Approved Routings</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-green-600">{stats.approved}</dd>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
            <dt className="truncate text-sm font-medium text-gray-500">Manual Review</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-yellow-600">{stats.manualReview}</dd>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
            <dt className="truncate text-sm font-medium text-gray-500">Total Estimated Uplift</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-blue-600">{formatCurrency(stats.totalUplift)}</dd>
          </div>
        </div>

        {/* TAB BUTTONS */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => { setTab('routing_decisions'); }}
              className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-semibold ${
                tab === 'routing_decisions'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              Approved
            </button>
            <button
              onClick={() => { setTab('manual_review'); }}
              className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-semibold flex items-center space-x-2 ${
                tab === 'manual_review'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              <span>Manual Review</span>
              {stats.manualReview > 0 && (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  tab === 'manual_review' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-900'
                }`}>
                  {stats.manualReview}
                </span>
              )}
            </button>
            <button
              onClick={() => { setTab('duplicates'); }}
              className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-semibold flex items-center space-x-2 ${
                tab === 'duplicates'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              <span>Duplicates</span>
              {stats.duplicates > 0 && (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  tab === 'duplicates' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-900'
                }`}>
                  {stats.duplicates}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* MAIN PANEL CONTENT */}
        <div className="bg-white shadow sm:rounded-lg overflow-hidden">
          <div className="px-4 py-5 sm:px-6 flex justify-between items-center border-b border-gray-200">
            <h3 className="text-base font-semibold leading-6 text-gray-900 font-display">
              {tab === 'routing_decisions' ? 'Approved Claims' : 
               tab === 'manual_review' ? 'Manual Review Queue' : 'Duplicate Claims'}
            </h3>
            <input 
              type="text" 
              placeholder="Search ID or prefix..." 
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="block w-64 border border-gray-300 rounded-md px-3 py-2"
            />
          </div>

          {/* DUPLICATE WARNING NOTE */}
          {tab === 'duplicates' && (
            <div className="bg-yellow-50 border-b border-yellow-100 px-6 py-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-semibold text-yellow-800">
                    These claims match a patient ID and date of service already processed in a previous batch. Review before processing.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            {loading ? (
              <div className="px-4 py-24 text-center text-sm text-gray-500">
                <span className="animate-pulse">Loading claims...</span>
              </div>
            ) : claims.length === 0 ? (
              <div className="px-4 py-24 text-center text-sm text-gray-500">
                {tab === 'routing_decisions' ? 'No approved claims found.' : 
                 tab === 'manual_review' ? 'No claims require manual review.' : 
                 'No duplicate claims detected.'}
              </div>
            ) : tab === 'manual_review' ? (
              <div className="space-y-12 py-6">
                {/* SECTION 1: Invalid Prefix */}
                {invalidPrefixClaims.length > 0 && (
                  <div className="px-6">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="text-base font-bold text-[#0a1628] font-display">
                        Invalid Prefix
                      </h4>
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/10">
                        {invalidPrefixClaims.length}
                      </span>
                      <span className="text-xs text-gray-500 font-medium font-sans">
                        · MR-001
                      </span>
                    </div>
                    <p className="text-sm text-red-700 bg-red-50/50 border border-red-100 rounded-md px-4 py-2 mb-4">
                      Prefix not recognized. Verify member eligibility before routing.
                    </p>
                    <div className="overflow-hidden border border-gray-200 rounded-lg">
                      <table className="min-w-full divide-y divide-gray-300">
                        <thead className="bg-gray-50">
                          <tr>
                            <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Patient ID</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Prefix</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Product</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Date of Service</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Charge</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Anthem Expected</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Blue Shield Expected</th>
                            <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900 w-[300px]">Actions</th>
                            <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                              <span className="sr-only">Details</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {invalidPrefixClaims.map(claim => {
                            const decision = claim.routing_decisions?.[0]
                            const isExpanded = expandedClaimId === claim.id

                            let anthemExpectedVal = decision?.anthem_expected ?? null;
                            let bsExpectedVal = decision?.blueshield_expected ?? null;
                            const anthemContract = contracts.find(c => c.product_type === claim.product_type && c.plan_name === 'Anthem')
                            const bsContract = contracts.find(c => c.product_type === claim.product_type && c.plan_name === 'Blue Shield')
                            if (anthemContract) anthemExpectedVal = claim.charge_amount * anthemContract.reimbursement_rate
                            if (bsContract) bsExpectedVal = claim.charge_amount * bsContract.reimbursement_rate

                            return (
                              <Fragment key={claim.id}>
                                <tr className={isExpanded ? 'bg-indigo-50/20' : undefined}>
                                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">{claim.patient_id}</td>
                                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{claim.alpha_prefix}</td>
                                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{claim.product_type}</td>
                                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{claim.dos}</td>
                                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{formatCurrency(claim.charge_amount)}</td>
                                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{anthemExpectedVal !== null ? formatCurrency(anthemExpectedVal) : '-'}</td>
                                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{bsExpectedVal !== null ? formatCurrency(bsExpectedVal) : '-'}</td>
                                  <td className="whitespace-nowrap py-4 px-3 text-center text-sm font-medium space-x-2">
                                    <button
                                      onClick={() => handleManualRoute(decision.id, 'Anthem')}
                                      className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 shadow-sm hover:bg-blue-100"
                                    >
                                      Route to Anthem {anthemExpectedVal !== null ? `(${formatCurrency(anthemExpectedVal)})` : ''}
                                    </button>
                                    <button
                                      onClick={() => handleManualRoute(decision.id, 'Blue Shield')}
                                      className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm hover:bg-indigo-100"
                                    >
                                      Route to Blue Shield {bsExpectedVal !== null ? `(${formatCurrency(bsExpectedVal)})` : ''}
                                    </button>
                                  </td>
                                  <td className="whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                                    <button
                                      onClick={() => setSelectedClaimId(claim.id)}
                                      className="inline-flex items-center justify-center rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                                    >
                                      Details
                                    </button>
                                  </td>
                                </tr>
                                {isExpanded && (
                                  <tr className="bg-gray-50/50">
                                    <td colSpan={9} className="px-6 py-4 text-sm text-gray-700">
                                      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm max-w-4xl space-y-2">
                                        <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase tracking-wider text-gray-500">Routing Decision Details</h4>
                                        {getReasonLines(decision?.reason || '').map((line, idx) => (
                                          <p key={idx} className="text-sm leading-relaxed text-gray-700 font-medium">
                                            {line}
                                          </p>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* SECTION 2: Excluded Products */}
                {excludedProductsClaims.length > 0 && (
                  <div className="px-6">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="text-base font-bold text-[#0a1628] font-display">
                        Excluded Products
                      </h4>
                      <span className="inline-flex items-center rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-semibold text-yellow-700 ring-1 ring-inset ring-yellow-600/10">
                        {excludedProductsClaims.length}
                      </span>
                      <span className="text-xs text-gray-500 font-medium font-sans">
                        · MR-008, MR-009
                      </span>
                    </div>
                    <p className="text-sm text-yellow-700 bg-yellow-50/50 border border-yellow-100 rounded-md px-4 py-2 mb-4">
                      MA and FEP products are typically billed outside BlueCard. Verify before routing.
                    </p>
                    <div className="overflow-hidden border border-gray-200 rounded-lg">
                      <table className="min-w-full divide-y divide-gray-300">
                        <thead className="bg-gray-50">
                          <tr>
                            <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Patient ID</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Prefix</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Product</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Date of Service</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Charge</th>
                            <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900 w-[420px]">Actions</th>
                            <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                              <span className="sr-only">Details</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {excludedProductsClaims.map(claim => {
                            const decision = claim.routing_decisions?.[0]
                            const isExpanded = expandedClaimId === claim.id

                            return (
                              <Fragment key={claim.id}>
                                <tr className={isExpanded ? 'bg-indigo-50/20' : undefined}>
                                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">{claim.patient_id}</td>
                                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{claim.alpha_prefix}</td>
                                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{claim.product_type}</td>
                                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{claim.dos}</td>
                                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{formatCurrency(claim.charge_amount)}</td>
                                  <td className="whitespace-nowrap py-4 px-3 text-center text-sm font-medium space-x-2">
                                    <button
                                      onClick={() => handleManualRoute(decision.id, '-', 'MA/FEP claim billed separately outside BlueCard routing')}
                                      className="inline-flex items-center rounded-md bg-gray-50 px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-100 ring-1 ring-inset ring-gray-300"
                                    >
                                      Bill Separately
                                    </button>
                                    <button
                                      onClick={() => handleManualRoute(decision.id, 'Anthem')}
                                      className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 shadow-sm hover:bg-blue-100"
                                    >
                                      Route to Anthem
                                    </button>
                                    <button
                                      onClick={() => handleManualRoute(decision.id, 'Blue Shield')}
                                      className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm hover:bg-indigo-100"
                                    >
                                      Route to Blue Shield
                                    </button>
                                  </td>
                                  <td className="whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                                    <button
                                      onClick={() => setSelectedClaimId(claim.id)}
                                      className="inline-flex items-center justify-center rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                                    >
                                      Details
                                    </button>
                                  </td>
                                </tr>
                                {isExpanded && (
                                  <tr className="bg-gray-50/50">
                                    <td colSpan={7} className="px-6 py-4 text-sm text-gray-700">
                                      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm max-w-4xl space-y-2">
                                        <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase tracking-wider text-gray-500">Routing Decision Details</h4>
                                        {getReasonLines(decision?.reason || '').map((line, idx) => (
                                          <p key={idx} className="text-sm leading-relaxed text-gray-700 font-medium">
                                            {line}
                                          </p>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* SECTION 3: Missing Contract */}
                {missingContractClaims.length > 0 && (
                  <div className="px-6">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="text-base font-bold text-[#0a1628] font-display">
                        Missing Contract
                      </h4>
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/10">
                        {missingContractClaims.length}
                      </span>
                      <span className="text-xs text-gray-500 font-medium font-sans">
                        · MR-004
                      </span>
                    </div>
                    <p className="text-sm text-red-700 bg-red-50/50 border border-red-100 rounded-md px-4 py-2 mb-4">
                      No contract rate on file for this product type. Add the contract rate in Admin &gt; Contracts then reprocess.
                    </p>
                    <div className="overflow-hidden border border-gray-200 rounded-lg">
                      <table className="min-w-full divide-y divide-gray-300">
                        <thead className="bg-gray-50">
                          <tr>
                            <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Patient ID</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Prefix</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Product</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Date of Service</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Charge</th>
                            <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900 w-[120px]">Actions</th>
                            <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                              <span className="sr-only">Details</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {missingContractClaims.map(claim => {
                            const decision = claim.routing_decisions?.[0]
                            const isExpanded = expandedClaimId === claim.id

                            return (
                              <Fragment key={claim.id}>
                                <tr className={isExpanded ? 'bg-indigo-50/20' : undefined}>
                                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">{claim.patient_id}</td>
                                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{claim.alpha_prefix}</td>
                                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{claim.product_type}</td>
                                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{claim.dos}</td>
                                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{formatCurrency(claim.charge_amount)}</td>
                                  <td className="whitespace-nowrap py-4 px-3 text-center text-sm font-medium">
                                    <button
                                      onClick={() => handleDismissClaim(claim.id)}
                                      className="inline-flex items-center rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 shadow-sm ring-1 ring-inset ring-red-300 hover:bg-red-50"
                                    >
                                      Dismiss
                                    </button>
                                  </td>
                                  <td className="whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                                    <button
                                      onClick={() => setSelectedClaimId(claim.id)}
                                      className="inline-flex items-center justify-center rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                                    >
                                      Details
                                    </button>
                                  </td>
                                </tr>
                                {isExpanded && (
                                  <tr className="bg-gray-50/50">
                                    <td colSpan={7} className="px-6 py-4 text-sm text-gray-700">
                                      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm max-w-4xl space-y-2">
                                        <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase tracking-wider text-gray-500">Routing Decision Details</h4>
                                        {getReasonLines(decision?.reason || '').map((line, idx) => (
                                          <p key={idx} className="text-sm leading-relaxed text-gray-700 font-medium">
                                            {line}
                                          </p>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* SECTION 4: Auth Conflict */}
                {authConflictClaims.length > 0 && (
                  <div className="px-6">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="text-base font-bold text-[#0a1628] font-display">
                        Auth Conflict
                      </h4>
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/10">
                        {authConflictClaims.length}
                      </span>
                      <span className="text-xs text-gray-500 font-medium font-sans">
                        · MR-006
                      </span>
                    </div>
                    <p className="text-sm text-amber-700 bg-amber-50/50 border border-amber-100 rounded-md px-4 py-2 mb-4">
                      Prior authorization conflict or mismatch detected. Review status and recommended payer details.
                    </p>
                    <div className="overflow-hidden border border-gray-200 rounded-lg">
                      <table className="min-w-full divide-y divide-gray-300">
                        <thead className="bg-gray-50">
                          <tr>
                            <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Patient ID</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Prefix</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">DOS</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Product Type</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Auth Status</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Auth Payer</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {authConflictClaims.map(claim => {
                            return (
                              <tr key={claim.id}>
                                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">{claim.patient_id}</td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{claim.alpha_prefix}</td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{claim.dos}</td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{claim.product_type}</td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                  <span className="capitalize">{claim.auth_status ? claim.auth_status.replace('_', ' ') : '-'}</span>
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{claim.auth_payer || '-'}</td>
                                <td className="px-3 py-4 text-sm text-gray-500 max-w-xs break-words">{claim.reason}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Patient ID</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Prefix</th>
                    {tab === 'duplicates' ? (
                      <>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">DOS</th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Charge</th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Note</th>
                        <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6 w-[220px]">
                          <span className="sr-only">Actions</span>
                        </th>
                      </>
                    ) : (
                      <>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Product</th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Date of Service</th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Charge</th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Anthem Expected</th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Blue Shield Expected</th>
                        {tab === 'routing_decisions' ? (
                          <>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Recommended</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Uplift</th>
                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Priority</th>
                          </>
                        ) : (
                          <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900" colSpan={2}>Actions</th>
                        )}
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Confidence</th>
                        <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                          <span className="sr-only">Details</span>
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {claims.map((claim) => {
                    const decision = claim.routing_decisions?.[0]
                    
                    if (tab === 'duplicates') {
                      let formattedDos = '-';
                      if (claim.dos) {
                        const parts = claim.dos.split('-');
                        if (parts.length === 3) {
                          formattedDos = `${parts[1]}/${parts[2]}/${parts[0].slice(-2)}`;
                        } else {
                          formattedDos = claim.dos;
                        }
                      }
                      return (
                        <tr key={claim.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">{claim.patient_id}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{claim.alpha_prefix}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{formattedDos}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{formatCurrency(claim.charge_amount)}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm font-semibold text-amber-600">
                            Previously processed in another batch
                          </td>
                          <td className="whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6 space-x-2">
                            <button
                              onClick={() => handleProcessAnyway(claim.id)}
                              className="inline-flex items-center rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-600 shadow-sm ring-1 ring-inset ring-indigo-300 hover:bg-indigo-50"
                            >
                              Process Anyway
                            </button>
                            <button
                              onClick={() => handleDismissClaim(claim.id)}
                              className="inline-flex items-center rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 shadow-sm ring-1 ring-inset ring-red-300 hover:bg-red-50"
                            >
                              Dismiss
                            </button>
                          </td>
                        </tr>
                      )
                    }
                    
                    let anthemExpectedVal = decision?.anthem_expected ?? null;
                    let bsExpectedVal = decision?.blueshield_expected ?? null;

                    const isMAorFEP = claim.product_type === 'MA' || claim.product_type === 'FEP' || decision?.reason.includes('Medicare Advantage') || decision?.reason.includes('FEP');
                    const isPrefixIssue = decision?.reason.toLowerCase().includes('prefix');

                    if (isMAorFEP) {
                      anthemExpectedVal = null;
                      bsExpectedVal = null;
                    } else if (isPrefixIssue || (decision && anthemExpectedVal === null && bsExpectedVal === null)) {
                      const anthemContract = contracts.find(c => c.product_type === claim.product_type && c.plan_name === 'Anthem')
                      const bsContract = contracts.find(c => c.product_type === claim.product_type && c.plan_name === 'Blue Shield')
                      if (anthemContract) anthemExpectedVal = claim.charge_amount * anthemContract.reimbursement_rate
                      if (bsContract) bsExpectedVal = claim.charge_amount * bsContract.reimbursement_rate
                    }

                    let anthemClass = "text-gray-500";
                    let bsClass = "text-gray-500";
                    if (anthemExpectedVal !== null && bsExpectedVal !== null) {
                      if (anthemExpectedVal > bsExpectedVal) {
                        anthemClass = "font-bold text-navy";
                      } else if (bsExpectedVal > anthemExpectedVal) {
                        bsClass = "font-bold text-navy";
                      } else {
                        anthemClass = "font-bold text-navy";
                        bsClass = "font-bold text-navy";
                      }
                    } else if (anthemExpectedVal !== null) {
                      anthemClass = "font-bold text-navy";
                    } else if (bsExpectedVal !== null) {
                      bsClass = "font-bold text-navy";
                    }

                    let upliftVal = decision?.uplift_amount ?? null;
                    if (upliftVal === null && anthemExpectedVal !== null && bsExpectedVal !== null) {
                      upliftVal = Math.abs(anthemExpectedVal - bsExpectedVal);
                    }

                    const isExpanded = expandedClaimId === claim.id

                    return (
                      <Fragment key={claim.id}>
                        <tr className={isExpanded ? 'bg-indigo-50/20' : undefined}>
                          <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">{claim.patient_id}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{claim.alpha_prefix}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{claim.product_type}</td>
                          {(() => {
                            let formattedDos = '-';
                            let dosClass = 'text-gray-500';
                            if (claim.dos) {
                              const parts = claim.dos.split('-');
                              if (parts.length === 3) {
                                const shortYear = parts[0].slice(-2);
                                formattedDos = `${parts[1]}/${parts[2]}/${shortYear}`;
                              } else {
                                formattedDos = claim.dos;
                              }

                              const parsedDos = new Date(claim.dos);
                              if (!isNaN(parsedDos.getTime())) {
                                const today = new Date();
                                const msPerDay = 24 * 60 * 60 * 1000;
                                const diffDays = (today.getTime() - parsedDos.getTime()) / msPerDay;
                                if (diffDays > 365) {
                                  dosClass = 'text-yellow-600 font-semibold';
                                }
                              }
                            }
                            return (
                              <td className={`whitespace-nowrap px-3 py-4 text-sm ${dosClass}`}>
                                {formattedDos}
                              </td>
                            );
                          })()}
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{formatCurrency(claim.charge_amount)}</td>
                          <td className={`whitespace-nowrap px-3 py-4 text-sm ${anthemClass}`}>{anthemExpectedVal !== null ? formatCurrency(anthemExpectedVal) : '-'}</td>
                          <td className={`whitespace-nowrap px-3 py-4 text-sm ${bsClass}`}>{bsExpectedVal !== null ? formatCurrency(bsExpectedVal) : '-'}</td>
                          
                          {tab === 'routing_decisions' ? (
                            <>
                              <td className="whitespace-nowrap px-3 py-4 text-sm">
                                {decision?.recommended_plan && decision.recommended_plan !== '-' ? (
                                  <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-600/20">
                                    {decision.recommended_plan}
                                  </span>
                                ) : (
                                  '-'
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{upliftVal !== null && upliftVal > 0 ? formatCurrency(upliftVal) : '-'}</td>
                              <td className="whitespace-nowrap px-3 py-4 text-sm">
                                {renderPriorityBadge(claim)}
                              </td>
                            </>
                          ) : (
                            <td className="whitespace-nowrap py-4 px-3 text-center text-sm font-medium space-x-2" colSpan={2}>
                              {isMAorFEP ? (
                                <button
                                  onClick={() => handleManualRoute(decision.id, '-', 'MA/FEP claim billed separately outside BlueCard routing')}
                                  className="inline-flex items-center rounded-md bg-gray-50 px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-100 ring-1 ring-inset ring-gray-300"
                                >
                                  Mark as Billed Separately
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleManualRoute(decision.id, 'Anthem')}
                                    className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 shadow-sm hover:bg-blue-100"
                                  >
                                    Route to Anthem {anthemExpectedVal !== null ? `(${formatCurrency(anthemExpectedVal)})` : ''}
                                  </button>
                                  <button
                                    onClick={() => handleManualRoute(decision.id, 'Blue Shield')}
                                    className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm hover:bg-indigo-100"
                                  >
                                    Route to Blue Shield {bsExpectedVal !== null ? `(${formatCurrency(bsExpectedVal)})` : ''}
                                  </button>
                                </>
                              )}
                            </td>
                          )}

                          <td className="whitespace-nowrap px-3 py-4 text-sm">
                            {renderConfidenceBadge(claim)}
                          </td>
                          <td className="whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                            <button
                              onClick={() => setSelectedClaimId(claim.id)}
                              className="inline-flex items-center justify-center rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                            >
                              Details
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-gray-50/50">
                            <td colSpan={12} className="px-6 py-4 text-sm text-gray-700">
                              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm max-w-4xl space-y-2">
                                <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase tracking-wider text-gray-500">Routing Decision Details</h4>
                                {getReasonLines(decision?.reason || '').map((line, idx) => {
                                  const isWarning = line.startsWith('Warning:')
                                  return (
                                    <p 
                                      key={idx} 
                                      className={`text-sm leading-relaxed ${
                                        isWarning 
                                          ? 'text-amber-600 font-semibold bg-amber-50 border border-amber-100 rounded px-3 py-1.5 inline-block w-full' 
                                          : 'text-gray-700 font-medium'
                                      }`}
                                    >
                                      {line}
                                    </p>
                                  )
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
              <div className="flex flex-1 justify-between sm:hidden">
                <button 
                  onClick={() => setPage(p => Math.max(1, p - 1))} 
                  disabled={page === 1} 
                  className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button 
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
                  disabled={page === totalPages} 
                  className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Showing <span className="font-medium">{((page - 1) * itemsPerPage) + 1}</span> to <span className="font-medium">{Math.min(page * itemsPerPage, totalCount)}</span> of <span className="font-medium">{totalCount}</span> results
                  </p>
                </div>
                <div>
                  <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                    <button 
                      onClick={() => setPage(p => Math.max(1, p - 1))} 
                      disabled={page === 1} 
                      className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                    >
                      <span className="sr-only">Previous</span>
                      &larr;
                    </button>
                    <span className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 focus:outline-offset-0">
                      Page {page} of {totalPages}
                    </span>
                    <button 
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
                      disabled={page === totalPages} 
                      className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                    >
                      <span className="sr-only">Next</span>
                      &rarr;
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>

      </main>

      {selectedClaimId !== null && (
        <ClaimDrilldownDrawer
          claimId={selectedClaimId}
          batchId={batch.id}
          isOpen={selectedClaimId !== null}
          onClose={() => setSelectedClaimId(null)}
          onActionTriggered={async () => {
            await fetchClaims()
            await fetchStats()
            await fetchAuthConflictClaims()
          }}
        />
      )}
    </div>
  )
}

interface ClaimDrilldownDrawerProps {
  claimId: string;
  batchId: string;
  isOpen: boolean;
  onClose: () => void;
  onActionTriggered: () => void;
}

function ClaimDrilldownDrawer({
  claimId,
  isOpen,
  onClose,
  onActionTriggered
}: ClaimDrilldownDrawerProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [claimData, setClaimData] = useState<ModalClaimData | null>(null)
  const [decisionData, setDecisionData] = useState<ModalDecisionData | null>(null)
  const [prefixData, setPrefixData] = useState<ModalPrefixData | null>(null)

  useEffect(() => {
    if (!isOpen || !claimId) return

    const fetchData = async () => {
      setLoading(true)
      try {
        const { data: claim, error: claimErr } = await supabase
          .from('claims')
          .select('id, patient_id, alpha_prefix, dos, product_type, payer_name, charge_amount, cpt_code, rev_code, auth_status, auth_payer, auth_dos_start, auth_dos_end')
          .eq('id', claimId)
          .single()

        if (claimErr) throw claimErr

        const { data: decision } = await supabase
          .from('routing_decisions')
          .select('id, decision, reason, recommended_plan, alternate_plan, uplift_amount, anthem_expected, blueshield_expected, confidence_score, financial_tier, manual_review_code')
          .eq('claim_id', claimId)
          .maybeSingle()

        setClaimData(claim as ModalClaimData)
        setDecisionData(decision as ModalDecisionData)

        if (claim.alpha_prefix) {
          const { data: prefix } = await supabase
            .from('alpha_prefix_reference')
            .select('plan_name, state, is_active, program, license_status, contracted_provider, effective_start_date, effective_end_date')
            .eq('alpha_prefix', claim.alpha_prefix)
            .maybeSingle()

          setPrefixData(prefix as ModalPrefixData)
        } else {
          setPrefixData(null)
        }
      } catch { }
      finally {
        setLoading(false)
      }
    }

    void fetchData()
  }, [claimId, isOpen, supabase])

  if (!isOpen) return null

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)

  const formatAuthStatus = (status: string | null | undefined) => {
    if (!status) return '—'
    return status
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const extractRateBasis = (reason: string | null | undefined) => {
    if (!reason) return 'Product Type'
    const parts = reason.split('|')
    const basisPart = parts.find(p => p.toLowerCase().includes('rate basis:'))
    if (basisPart) {
      return basisPart.replace(/rate basis:\s*/i, '').trim()
    }
    return 'Product Type'
  }

  const handleApproveRoute = async () => {
    if (!claimId) return
    try {
      const { error: claimErr } = await supabase
        .from('claims')
        .update({ status: 'approved' })
        .eq('id', claimId)
      if (claimErr) throw claimErr

      await supabase
        .from('routing_decisions')
        .update({ decision: 'approved' })
        .eq('claim_id', claimId)

      onActionTriggered()
      onClose()
    } catch {
      alert('Failed to approve route.')
    }
  }

  const handleSendToManual = async () => {
    if (!claimId) return
    try {
      const { error: rdErr } = await supabase
        .from('routing_decisions')
        .update({ decision: 'manual_review', manual_review_code: 'MR-006' })
        .eq('claim_id', claimId)
      if (rdErr) throw rdErr

      onActionTriggered()
      onClose()
    } catch {
      alert('Failed to send to manual review.')
    }
  }

  const handleExportToEpic = () => {
    if (!claimData || !decisionData) return
    
    const headers = [
      'Patient ID', 'Prefix', 'DOS', 'Product Type', 'Payer Name', 'Charge Amount',
      'CPT Code', 'Rev Code', 'Auth Status', 'Auth Payer', 'Auth DOS Start', 'Auth DOS End',
      'Decision', 'Reason', 'Recommended Plan', 'Alternate Plan', 'Uplift Amount',
      'Anthem Expected', 'Blue Shield Expected', 'Confidence Score', 'Financial Tier', 'Manual Review Code'
    ]
    
    const values = [
      claimData.patient_id, claimData.alpha_prefix, claimData.dos, claimData.product_type, claimData.payer_name, claimData.charge_amount,
      claimData.cpt_code || '', claimData.rev_code || '', claimData.auth_status || '', claimData.auth_payer || '', claimData.auth_dos_start || '', claimData.auth_dos_end || '',
      decisionData.decision, decisionData.reason, decisionData.recommended_plan || '', decisionData.alternate_plan || '', decisionData.uplift_amount || 0,
      decisionData.anthem_expected || 0, decisionData.blueshield_expected || 0, decisionData.confidence_score || 0, decisionData.financial_tier || '', decisionData.manual_review_code || ''
    ]
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), values.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')].join('\n')
    
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `epic_export_claim_${claimId}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const getReasonLines = (reason: string) => {
    if (!reason) return []
    return reason.split('|').map(line => line.trim()).filter(Boolean)
  }

  const anthemRec = decisionData?.recommended_plan === 'Anthem'
  const bsRec = decisionData?.recommended_plan === 'Blue Shield'
  const anthemUplift = anthemRec ? decisionData?.uplift_amount : null
  const bsUplift = bsRec ? decisionData?.uplift_amount : null

  const score = decisionData?.confidence_score || 0
  let barColor = 'bg-red-500'
  let tierName = 'Unsafe'

  if (score >= 95) {
    barColor = 'bg-green-600'
    tierName = 'Extremely High'
  } else if (score >= 85) {
    barColor = 'bg-green-500'
    tierName = 'High'
  } else if (score >= 70) {
    barColor = 'bg-yellow-500'
    tierName = 'Moderate'
  } else if (score >= 50) {
    barColor = 'bg-orange-500'
    tierName = 'Uncertain'
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
      <div className="absolute inset-0 overflow-hidden">
        {/* Dark backdrop overlay */}
        <div 
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/50 transition-opacity duration-300 ease-in-out" 
          aria-hidden="true"
        ></div>

        <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
          <div className="pointer-events-auto w-screen max-w-2xl transform transition-transform duration-300 ease-in-out">
            <div className="flex h-full flex-col overflow-y-scroll bg-white shadow-2xl border-l border-[#e2e8f0]">
              
              {loading ? (
                <div className="flex flex-1 items-center justify-center p-6 bg-white">
                  <div className="flex flex-col items-center space-y-4">
                    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#0a1628]"></div>
                    <p className="text-sm font-medium text-gray-500 font-sans">Loading claim details...</p>
                  </div>
                </div>
              ) : !claimData ? (
                <div className="flex flex-1 items-center justify-center p-6 bg-white">
                  <p className="text-sm font-medium text-red-500 font-sans">Claim details could not be loaded.</p>
                </div>
              ) : (
                <>
                  {/* SECTION 1 — HEADER SUMMARY */}
                  <div className="bg-[#0a1628] text-white px-6 py-5 flex items-center justify-between border-b border-gray-800 sticky top-0 z-10">
                    <div>
                      <h2 className="text-xl font-bold font-display tracking-tight">Patient: {claimData.patient_id}</h2>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {/* Recommended Route Badge */}
                        {decisionData?.decision === 'approved' ? (
                          <span className="inline-flex items-center rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-semibold text-green-400 ring-1 ring-inset ring-green-500/20">
                            Approved Route
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-400 ring-1 ring-inset ring-amber-500/20">
                            Manual Review
                          </span>
                        )}

                        {/* Confidence Score Badge */}
                        {(() => {
                          const score = decisionData?.confidence_score
                          if (score === null || score === undefined) {
                            return (
                              <span className="inline-flex items-center rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-400 ring-1 ring-inset ring-red-500/20">
                                Unsafe (0)
                              </span>
                            )
                          }
                          if (score >= 95) {
                            return (
                              <span className="inline-flex items-center rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-semibold text-green-400 ring-1 ring-inset ring-green-500/20">
                                Extremely High ({score})
                              </span>
                            )
                          } else if (score >= 85) {
                            return (
                              <span className="inline-flex items-center rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-semibold text-green-400 ring-1 ring-inset ring-green-500/20">
                                High ({score})
                              </span>
                            )
                          } else if (score >= 70) {
                            return (
                              <span className="inline-flex items-center rounded-full bg-yellow-500/10 px-2.5 py-0.5 text-xs font-semibold text-yellow-400 ring-1 ring-inset ring-yellow-500/20">
                                Moderate ({score})
                              </span>
                            )
                          } else if (score >= 50) {
                            return (
                              <span className="inline-flex items-center rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs font-semibold text-orange-400 ring-1 ring-inset ring-orange-500/20">
                                Uncertain ({score})
                              </span>
                            )
                          } else {
                            return (
                              <span className="inline-flex items-center rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-400 ring-1 ring-inset ring-red-500/20">
                                Unsafe ({score})
                              </span>
                            )
                          }
                        })()}

                        {/* Financial Tier Badge */}
                        <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-400 ring-1 ring-inset ring-blue-500/20">
                          {decisionData?.financial_tier || 'Tier 1 - Low'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <div className="text-xs uppercase text-gray-400 font-semibold tracking-wider">Uplift Amount</div>
                        <div className="text-2xl font-bold text-green-400 font-sans mt-0.5">
                          {decisionData?.uplift_amount !== null && decisionData?.uplift_amount !== undefined
                            ? formatCurrency(decisionData.uplift_amount)
                            : '$0.00'}
                        </div>
                      </div>
                      
                      <button 
                        onClick={onClose}
                        className="rounded-md text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-white p-1 hover:bg-slate-800"
                      >
                        <span className="sr-only">Close panel</span>
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* MODAL MAIN CONTENT SCROLL AREA */}
                  <div className="flex-1 p-6 space-y-6 bg-slate-50 font-sans">
                    
                    {/* SECTION 2 — PREFIX VALIDATION */}
                    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
                      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2">Prefix Validation</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-xs text-gray-500 uppercase font-semibold">Alpha Prefix</span>
                          <p className="mt-1 font-bold text-gray-900">{claimData.alpha_prefix}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 uppercase font-semibold">Home Plan</span>
                          <p className="mt-1 font-medium text-gray-900">{prefixData?.plan_name || '—'}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 uppercase font-semibold">State</span>
                          <p className="mt-1 font-medium text-gray-900">{prefixData?.state || '—'}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 uppercase font-semibold">Program</span>
                          <p className="mt-1 font-medium text-gray-900">{prefixData?.program || '—'}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 uppercase font-semibold">Prefix Status</span>
                          <div className="mt-1">
                            {prefixData?.is_active ? (
                              <span className="inline-flex items-center rounded bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-600/10">Active</span>
                            ) : (
                              <span className="inline-flex items-center rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/10">Inactive</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 uppercase font-semibold">License Status</span>
                          <div className="mt-1">
                            {(() => {
                              const status = prefixData?.license_status || 'unknown'
                              if (status === 'licensed') {
                                return <span className="inline-flex items-center rounded bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-600/10">Licensed</span>
                              } else if (status === 'unlicensed') {
                                return <span className="inline-flex items-center rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/10">Unlicensed</span>
                              } else {
                                return <span className="inline-flex items-center rounded bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-600/10">Unknown</span>
                              }
                            })()}
                          </div>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 uppercase font-semibold">Contracted Provider</span>
                          <div className="mt-1">
                            {prefixData?.contracted_provider ? (
                              <span className="inline-flex items-center rounded bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-600/10">Yes</span>
                            ) : (
                              <span className="inline-flex items-center rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/10">No</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 uppercase font-semibold">Effective Dates</span>
                          <p className="mt-1 font-medium text-gray-900">
                            {prefixData?.effective_start_date && prefixData?.effective_end_date
                              ? `${prefixData.effective_start_date} to ${prefixData.effective_end_date}`
                              : 'Not set'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* SECTION 3 — AUTHORIZATION */}
                    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
                      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2">Authorization</h3>
                      {claimData.auth_status ? (
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-xs text-gray-500 uppercase font-semibold">Auth Status</span>
                            <div className="mt-1">
                              {(() => {
                                const status = claimData.auth_status || ''
                                const formatted = formatAuthStatus(status)
                                if (status === 'valid' || status === 'not_required') {
                                  return <span className="inline-flex items-center rounded bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-600/10">{formatted}</span>
                                } else if (status === 'missing') {
                                  return <span className="inline-flex items-center rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/10">{formatted}</span>
                                } else {
                                  return <span className="inline-flex items-center rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/10">{formatted}</span>
                                }
                              })()}
                            </div>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 uppercase font-semibold">Auth Payer</span>
                            <p className="mt-1 font-medium text-gray-900">{claimData.auth_payer || '—'}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 uppercase font-semibold">Auth DOS Start</span>
                            <p className="mt-1 font-medium text-gray-900">{claimData.auth_dos_start || '—'}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 uppercase font-semibold">Auth DOS End</span>
                            <p className="mt-1 font-medium text-gray-900">{claimData.auth_dos_end || '—'}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm font-medium text-gray-500 italic bg-gray-50 border border-gray-100 rounded px-4 py-2">
                          No authorization data provided in upload.
                        </p>
                      )}
                    </div>

                    {/* SECTION 4 — CONTRACT COMPARISON */}
                    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
                      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2">Contract Comparison</h3>
                      <div className="overflow-hidden border border-gray-200 rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"></th>
                              <th className={`px-4 py-2 text-center text-xs font-semibold text-gray-900 uppercase tracking-wider ${anthemRec ? 'bg-blue-50/50' : ''}`}>Anthem</th>
                              <th className={`px-4 py-2 text-center text-xs font-semibold text-gray-900 uppercase tracking-wider ${bsRec ? 'bg-blue-50/50' : ''}`}>Blue Shield</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 bg-white text-sm">
                            <tr>
                              <td className="px-4 py-3 font-medium text-gray-900">Expected Reimbursement</td>
                              <td className={`px-4 py-3 text-center text-gray-700 font-semibold ${anthemRec ? 'bg-blue-50/50' : ''}`}>
                                {decisionData?.anthem_expected !== null && decisionData?.anthem_expected !== undefined ? formatCurrency(decisionData.anthem_expected) : '$0.00'}
                              </td>
                              <td className={`px-4 py-3 text-center text-gray-700 font-semibold ${bsRec ? 'bg-blue-50/50' : ''}`}>
                                {decisionData?.blueshield_expected !== null && decisionData?.blueshield_expected !== undefined ? formatCurrency(decisionData.blueshield_expected) : '$0.00'}
                              </td>
                            </tr>
                            <tr>
                              <td className="px-4 py-3 font-medium text-gray-900">Recommended</td>
                              <td className={`px-4 py-3 text-center font-bold text-blue-600 ${anthemRec ? 'bg-blue-50/50' : ''}`}>
                                {anthemRec ? '✓' : '—'}
                              </td>
                              <td className={`px-4 py-3 text-center font-bold text-blue-600 ${bsRec ? 'bg-blue-50/50' : ''}`}>
                                {bsRec ? '✓' : '—'}
                              </td>
                            </tr>
                            <tr>
                              <td className="px-4 py-3 font-medium text-gray-900">Uplift vs Alternate</td>
                              <td className={`px-4 py-3 text-center text-green-600 font-bold ${anthemRec ? 'bg-blue-50/50' : ''}`}>
                                {anthemUplift && anthemUplift > 0 ? formatCurrency(anthemUplift) : '—'}
                              </td>
                              <td className={`px-4 py-3 text-center text-green-600 font-bold ${bsRec ? 'bg-blue-50/50' : ''}`}>
                                {bsUplift && bsUplift > 0 ? formatCurrency(bsUplift) : '—'}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm pt-2">
                        <div>
                          <span className="text-xs text-gray-500 uppercase font-semibold">Rate Basis</span>
                          <p className="mt-1 font-bold text-gray-900">{extractRateBasis(decisionData?.reason)}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 uppercase font-semibold">Charge Amount</span>
                          <p className="mt-1 font-bold text-gray-900">{formatCurrency(claimData.charge_amount)}</p>
                        </div>
                      </div>
                    </div>

                    {/* SECTION 5 — RISK AND AUDIT */}
                    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
                      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2">Risk and Audit</h3>
                      <div className="space-y-2">
                        <span className="text-xs text-gray-500 uppercase font-semibold">Routing Analysis</span>
                        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-700 font-medium">
                          {getReasonLines(decisionData?.reason || '').map((line, idx) => (
                            <li key={idx} className="leading-relaxed">{line}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="space-y-2 pt-2">
                        <div className="flex justify-between items-center text-sm font-medium text-gray-700">
                          <span>Confidence Score</span>
                          <span className="font-bold text-gray-900">{score}/100 ({tierName})</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div className={`h-3 rounded-full ${barColor}`} style={{ width: `${score}%` }}></div>
                        </div>
                      </div>
                    </div>

                    {/* SECTION 6 — WORKFLOW ACTIONS */}
                    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
                      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2">Actions</h3>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          onClick={handleApproveRoute}
                          className="flex-1 inline-flex justify-center items-center rounded-md bg-[#0a1628] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#162a45] focus:outline-none"
                        >
                          Approve Route
                        </button>
                        
                        <button
                          onClick={handleSendToManual}
                          className="flex-1 inline-flex justify-center items-center rounded-md border border-amber-300 bg-white px-4 py-2.5 text-sm font-bold text-amber-700 shadow-sm hover:bg-amber-50 focus:outline-none"
                        >
                          Send to Manual Review
                        </button>
                        
                        <button
                          onClick={handleExportToEpic}
                          className="flex-1 inline-flex justify-center items-center rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none"
                        >
                          Export to Epic
                        </button>
                      </div>
                    </div>

                  </div>
                </>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
