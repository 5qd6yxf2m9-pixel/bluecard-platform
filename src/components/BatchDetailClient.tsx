// REMINDER: Run the following SQL migrations in Supabase console:
// ALTER TABLE routing_decisions ADD COLUMN IF NOT EXISTS anthem_expected numeric;
// ALTER TABLE routing_decisions ADD COLUMN IF NOT EXISTS blueshield_expected numeric;

'use client'

import { useState, useEffect, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { ClaimWithDecision, PlanContract, BatchData } from '@/components/DashboardClient'

interface BatchDetailClientProps {
  batch: BatchData;
  contracts: PlanContract[];
}

export function BatchDetailClient({ batch, contracts }: BatchDetailClientProps) {
  const [tab, setTab] = useState<'routing_decisions' | 'manual_review'>('routing_decisions')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [claims, setClaims] = useState<ClaimWithDecision[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null)
  
  const [stats, setStats] = useState({
    totalClaims: batch.total_claims || 0,
    approved: batch.approved_count || 0,
    manualReview: batch.manual_review_count || 0,
    totalUplift: batch.total_uplift || 0
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
      let query = supabase
        .from('claims')
        .select(`
          *,
          routing_decisions!inner(*)
        `, { count: 'exact' })
        .eq('batch_id', batch.id)

      if (tab === 'routing_decisions') {
        query = query.eq('routing_decisions.decision', 'approved')
      } else {
        query = query.eq('routing_decisions.decision', 'manual_review')
      }

      if (search) {
        query = query.or(`patient_id.ilike.%${search}%,alpha_prefix.ilike.%${search}%`)
      }

      query = query
        .order('created_at', { ascending: false })
        .range(start, end)

      const { data, count, error } = await query

      if (error) throw error

      setClaims((data || []) as unknown as ClaimWithDecision[])
      setTotalCount(count || 0)
    } catch { }
    finally {
      setLoading(false)
    }
  }

  // Trigger claim fetching when dependencies change
  useEffect(() => {
    fetchClaims()
  }, [tab, page, search])

  // Sync Stats periodically or on initialization
  useEffect(() => {
    fetchStats()
  }, [])

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
      setExpandedClaimId(null)
    } catch {
      alert('Failed to update routing decision.')
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
      const { data } = await supabase
        .from('claims')
        .select(`
          *,
          routing_decisions!inner(*)
        `)
        .eq('batch_id', batch.id)
        .eq('routing_decisions.decision', 'approved')

      const exportData = (data || []) as unknown as ClaimWithDecision[]

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

  const toggleExpand = (claimId: string) => {
    setExpandedClaimId(expandedClaimId === claimId ? null : claimId)
  }

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

  const renderConfidenceBadge = (claim: ClaimWithDecision) => {
    const decision = claim.routing_decisions?.[0]
    if (!decision) {
      return (
        <span className="inline-flex items-center rounded-md bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600 ring-1 ring-inset ring-gray-500/10">
          N/A
        </span>
      )
    }

    const isMAorFEP = claim.product_type === 'MA' || claim.product_type === 'FEP' || decision.reason.includes('Medicare Advantage') || decision.reason.includes('FEP');

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

    if (isMAorFEP) {
      return (
        <span className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500 ring-1 ring-inset ring-gray-500/10">
          N/A
        </span>
      )
    }

    const score = decision.confidence_score
    if (score !== null && score !== undefined) {
      if (score >= 85) {
        return (
          <span className="inline-flex items-center rounded-md bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-600/20">
            High ({score})
          </span>
        )
      } else if (score >= 60) {
        return (
          <span className="inline-flex items-center rounded-md bg-yellow-50 px-2.5 py-1 text-xs font-semibold text-yellow-800 ring-1 ring-inset ring-yellow-600/20">
            Medium ({score})
          </span>
        )
      } else {
        return (
          <span className="inline-flex items-center rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
            Low ({score})
          </span>
        )
      }
    }

    return (
      <span className="inline-flex items-center rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
        Low (0)
      </span>
    )
  }

  const totalPages = Math.ceil(totalCount / itemsPerPage)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard" className="text-gray-500 hover:text-gray-900">
              &larr; Back
            </Link>
            <h1 className="text-xl font-bold text-gray-900">{batch.name}</h1>
            <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
              batch.status === 'completed' ? 'bg-green-50 text-green-700 ring-green-600/20' : 
              batch.status === 'open' ? 'bg-blue-50 text-blue-700 ring-blue-600/20' :
              'bg-yellow-50 text-yellow-800 ring-yellow-600/20'
            }`}>
              {batch.status}
            </span>
          </div>
          <div className="space-x-3">
            <button onClick={exportResults} className="text-sm font-medium text-gray-700 hover:text-gray-900 px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white">
              Export Results
            </button>
            {batch.status !== 'completed' && (
              <button onClick={markComplete} className="text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-2 border border-transparent rounded-md shadow-sm">
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
          </nav>
        </div>

        {/* MAIN PANEL CONTENT */}
        <div className="bg-white shadow sm:rounded-lg overflow-hidden">
          <div className="px-4 py-5 sm:px-6 flex justify-between items-center border-b border-gray-200">
            <h3 className="text-base font-semibold leading-6 text-gray-900">
              {tab === 'routing_decisions' ? 'Approved Claims' : 'Manual Review Queue'}
            </h3>
            <input 
              type="text" 
              placeholder="Search ID or prefix..." 
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="block w-64 rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 px-3"
            />
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="px-4 py-24 text-center text-sm text-gray-500">
                <span className="animate-pulse">Loading claims...</span>
              </div>
            ) : claims.length === 0 ? (
              <div className="px-4 py-24 text-center text-sm text-gray-500">
                {tab === 'routing_decisions' ? 'No approved claims found.' : 'No claims require manual review.'}
              </div>
            ) : (
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
                    {tab === 'routing_decisions' ? (
                      <>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Recommended</th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Uplift</th>
                      </>
                    ) : (
                      <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900" colSpan={2}>Actions</th>
                    )}
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Confidence</th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                      <span className="sr-only">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {claims.map((claim) => {
                    const decision = claim.routing_decisions?.[0]
                    
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
                              onClick={() => toggleExpand(claim.id)}
                              className="inline-flex items-center justify-center rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                            >
                              {isExpanded ? 'Hide' : 'Details'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-gray-50/50">
                            <td colSpan={11} className="px-6 py-4 text-sm text-gray-700">
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
                                {tab === 'manual_review' && (
                                  <div className="pt-2 border-t border-gray-100 mt-2 space-y-2">
                                    {isPrefixIssue && <p className="text-xs text-red-600 font-semibold bg-red-50 border border-red-100 rounded px-2.5 py-1.5 inline-block">Note: Prefix not recognized. Verify member eligibility and select the correct local plan.</p>}
                                    {isMAorFEP && <p className="text-xs text-yellow-600 font-semibold bg-yellow-50 border border-yellow-100 rounded px-2.5 py-1.5 inline-block">Note: Medicare Advantage or FEP products are billed outside standard BlueCard routing.</p>}
                                  </div>
                                )}
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
    </div>
  )
}
