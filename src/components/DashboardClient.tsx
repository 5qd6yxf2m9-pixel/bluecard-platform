'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts'

export interface RoutingDecisionData {
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

export interface ClaimWithDecision {
  id: string;
  patient_id: string;
  alpha_prefix: string;
  dos: string;
  product_type: string;
  payer_name: string;
  charge_amount: number;
  status: string;
  cpt_code?: string | null;
  rev_code?: string | null;
  auth_status?: string | null;
  auth_payer?: string | null;
  auth_dos_start?: string | null;
  auth_dos_end?: string | null;
  routing_decisions: RoutingDecisionData[];
}

export interface PlanContract {
  id?: string;
  client_id: string;
  plan_name: string;
  product_type: string;
  reimbursement_rate: number;
}

export interface BatchData {
  id: string;
  client_id: string;
  name: string;
  status: string;
  total_claims: number;
  approved_count: number;
  manual_review_count: number;
  total_uplift: number;
  created_at: string;
  completed_at: string | null;
  processing_error?: string | null;
}

export interface StatData {
  totalUpliftAvailable: number;
  approvedRoutings: number;
  manualReview: number;
  totalClaims: number;
  activeBatches: number;
}

export interface ChartData {
  upliftByPayer: { payer_name: string; uplift: number }[];
  upliftByProductType: { product_type: string; uplift: number }[];
  routingSplit: { name: string; value: number }[];
}

interface DashboardClientProps {
  userEmail: string;
  clientId: string;
  initialBatches: BatchData[];
  stats: StatData;
  chartData: ChartData;
}

export function DashboardClient({ 
  userEmail, 
  clientId, 
  initialBatches, 
  stats, 
  chartData 
}: DashboardClientProps) {
  const [activeTopTab, setActiveTopTab] = useState<'batches' | 'analytics' | 'upload'>('batches')
  const [tab, setTab] = useState<'active' | 'completed'>('active')
  const [batchesList, setBatchesList] = useState<BatchData[]>(initialBatches)
  const [completedCount, setCompletedCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null)
  const [editingBatchName, setEditingBatchName] = useState<string>('')
  
  const router = useRouter()
  const supabase = createClient()
  const [isMounted, setIsMounted] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadAreaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const edgeFunctionCallsRef = useRef<Record<string, number>>({})

  const handleStartRename = (batchId: string, currentName: string) => {
    setEditingBatchId(batchId)
    setEditingBatchName(currentName)
  }

  const handleSaveRename = async (batchId: string) => {
    if (!editingBatchName.trim()) return
    try {
      const { error: renameError } = await supabase
        .from('batches')
        .update({ name: editingBatchName.trim() })
        .eq('id', batchId)

      if (renameError) throw renameError

      setEditingBatchId(null)
      await fetchBatches()
    } catch {
      alert('Failed to rename batch.')
    }
  }

  const handleCancelRename = () => {
    setEditingBatchId(null)
    setEditingBatchName('')
  }

  const fetchBatches = async () => {
    setLoading(true)
    try {
      const { data, error: fetchErr } = tab === 'active'
        ? await supabase
            .from('batches')
            .select('*')
            .eq('client_id', clientId)
            .in('status', ['open', 'processing'])
            .order('created_at', { ascending: false })
        : await supabase
            .from('batches')
            .select('*')
            .eq('client_id', clientId)
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
      
      if (fetchErr) throw fetchErr
      setBatchesList((data || []) as unknown as BatchData[])
    } catch {
    } finally {
      setLoading(false)
    }
  }

  const fetchCompletedCount = async () => {
    try {
      const { count } = await supabase
        .from('batches')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('status', 'completed')
      
      setCompletedCount(count || 0)
    } catch { }
  }

  useEffect(() => {
    fetchBatches()
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchCompletedCount()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const processingBatches = batchesList.filter(b => b.status === 'processing')
    if (processingBatches.length === 0) return

    const interval = setInterval(async () => {
      let hasChanges = false
      const updatedList = await Promise.all(
        batchesList.map(async (batch) => {
          if (batch.status === 'processing') {
            try {
              const { data, error: fetchErr } = await supabase
                .from('batches')
                .select('*')
                .eq('id', batch.id)
                .single()
              if (!fetchErr && data) {
                const updatedBatch = data as unknown as BatchData
                if (updatedBatch.status !== 'processing' || updatedBatch.processing_error) {
                  hasChanges = true
                  return updatedBatch
                }

                // If still processing, call the Edge Function again if count < 30 and no processing_error
                const currentCount = edgeFunctionCallsRef.current[batch.id] || 1
                if (currentCount < 30 && !updatedBatch.processing_error) {
                  edgeFunctionCallsRef.current[batch.id] = currentCount + 1
                  console.log(`Triggering process-batch Edge Function (Attempt ${currentCount + 1}):`, { batch_id: batch.id, client_id: clientId })
                  
                  const session = await supabase.auth.getSession()
                  const accessToken = session.data.session?.access_token
                  
                  fetch('https://jpnqtxkioymainjxlysm.supabase.co/functions/v1/process-batch', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${accessToken}`
                    },
                    body: JSON.stringify({ batch_id: batch.id, client_id: clientId })
                  }).catch(() => {})
                } else if (currentCount >= 30) {
                  console.warn(`Reached max retry count of 30 for batch: ${batch.id}`)
                }

                return updatedBatch
              }
            } catch {
              // Ignore fetch error
            }
          }
          return batch
        })
      )

      if (hasChanges) {
        setBatchesList(updatedList)
        await fetchCompletedCount()
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [batchesList, supabase, clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const processFile = async (file: File) => {
    setUploading(true)
    setError(null)

    const reader = new FileReader()
    reader.onload = async (e) => {
      let createdBatchId: string | null = null
      try {
        const text = e.target?.result as string
        if (!text) throw new Error()

        const lines = text.split('\n').filter(line => line.trim() !== '')
        if (lines.length < 2) throw new Error()

        const headers = lines[0].split(',').map(h => h.trim())
        const expectedHeaders = ['patient_id', 'alpha_prefix', 'dos', 'product_type', 'payer_name', 'charge_amount']
        
        for (const expected of expectedHeaders) {
          if (!headers.includes(expected)) throw new Error()
        }

        const rows = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim())
          const rowData: Record<string, string> = {}
          headers.forEach((header, index) => {
            rowData[header] = values[index]
          })
          return rowData
        })

        // Find earliest and latest DOS
        let earliestDate: Date | null = null
        let latestDate: Date | null = null

        rows.forEach(row => {
          if (row.dos) {
            const d = new Date(row.dos.includes('T') ? row.dos : `${row.dos}T12:00:00`)
            if (!isNaN(d.getTime())) {
              if (!earliestDate || d < earliestDate) earliestDate = d
              if (!latestDate || d > latestDate) latestDate = d
            }
          }
        })

        const formatDateShort = (d: Date) => {
          const mm = String(d.getMonth() + 1).padStart(2, '0')
          const dd = String(d.getDate()).padStart(2, '0')
          const yy = String(d.getFullYear()).slice(-2)
          return `${mm}/${dd}/${yy}`
        }

        let batchName = `Upload - ${new Date().toLocaleString()}`
        if (earliestDate && latestDate) {
          const earliestStr = formatDateShort(earliestDate)
          const latestStr = formatDateShort(latestDate)
          if (earliestStr === latestStr) {
            batchName = `Claims: ${earliestStr}`
          } else {
            batchName = `Claims: ${earliestStr} - ${latestStr}`
          }
        }

        const { data: batch, error: batchError } = await supabase
          .from('batches')
          .insert({
            client_id: clientId,
            name: batchName,
            status: 'processing',
            total_claims: rows.length
          })
          .select()
          .single()

        if (batchError || !batch) throw new Error()
        createdBatchId = batch.id

        const parseDateToISO = (dateStr: string | undefined | null) => {
          if (!dateStr || dateStr.trim() === '') return null
          const d = new Date(dateStr)
          if (isNaN(d.getTime())) return null
          return d.toISOString().split('T')[0] // YYYY-MM-DD
        }

        const claimsToInsert = rows.map(row => {
          return {
            batch_id: batch.id,
            patient_id: row.patient_id,
            alpha_prefix: row.alpha_prefix,
            dos: row.dos,
            product_type: row.product_type,
            payer_name: row.payer_name,
            charge_amount: parseFloat(row.charge_amount) || 0,
            client_id: clientId,
            status: 'pending',
            cpt_code: row.cpt_code || null,
            rev_code: row.rev_code || null,
            auth_status: row.auth_status || null,
            auth_payer: row.auth_payer || null,
            auth_dos_start: parseDateToISO(row.auth_dos_start),
            auth_dos_end: parseDateToISO(row.auth_dos_end)
          }
        })

        // Insert Claims
        const chunkSize = 100
        for (let i = 0; i < claimsToInsert.length; i += chunkSize) {
          const chunk = claimsToInsert.slice(i, i + chunkSize)
          const { error: insertError } = await supabase
            .from('claims')
            .insert(chunk)
          if (insertError) throw new Error('Failed to insert claims chunk: ' + insertError.message)
        }

        // Call Edge Function (fire-and-forget)
        const session = await supabase.auth.getSession()
        const accessToken = session.data.session?.access_token

        if (batch.id && clientId) {
          edgeFunctionCallsRef.current[batch.id] = 1
          console.log('Triggering process-batch Edge Function (Attempt 1):', { batch_id: batch.id, client_id: clientId })
          fetch('https://jpnqtxkioymainjxlysm.supabase.co/functions/v1/process-batch', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ batch_id: batch.id, client_id: clientId })
          }).catch(() => {})
        }

        setActiveTopTab('batches')
        setTab('active')
        await fetchBatches()
        await fetchCompletedCount()
      } catch {
        if (createdBatchId) {
          // Delete claims with that batch_id
          await supabase
            .from('claims')
            .delete()
            .eq('batch_id', createdBatchId)

          // Delete the batch record
          await supabase
            .from('batches')
            .delete()
            .eq('id', createdBatchId)

          await fetchBatches()
        }
        setError('Upload failed and was rolled back. Please try again.')
      } finally {
        setUploading(false)
      }
    }
    reader.onerror = () => {
      setError('Failed to read the file.')
      setUploading(false)
    }
    reader.readAsText(file)
  }

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (uploading) return
    const file = e.dataTransfer.files?.[0]
    if (file && file.name.endsWith('.csv')) {
      void processFile(file)
    } else {
      setError('Please upload a valid .csv file.')
    }
  }, [uploading]) // eslint-disable-line react-hooks/exhaustive-deps

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault()
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) void processFile(e.target.files[0])
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val)
  }

  const handleNewUploadClick = () => {
    uploadAreaRef.current?.scrollIntoView({ behavior: 'smooth' })
    fileInputRef.current?.click()
  }

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans selection:bg-[#2563eb] selection:text-white">
      {/* HEADER */}
      <header className="bg-[#0a1628] h-[72px] w-full px-8 flex justify-between items-center text-white">
        <div className="flex items-center space-x-4">
          <Link href="/dashboard" className="text-gray-400 hover:text-white flex items-center space-x-2 text-sm font-semibold transition-colors">
            <span>&larr;</span> <span>Back</span>
          </Link>
          <span className="text-[20px] font-bold text-white font-display">
            BlueCardLogic
          </span>
        </div>
        <div className="flex items-center space-x-6">
          <span className="text-sm text-gray-400 font-medium">{userEmail}</span>
          <button 
            onClick={handleSignOut} 
            className="text-sm font-semibold border border-white/20 hover:bg-white/10 px-4 py-2 rounded-md text-white transition-all duration-300"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* TOP LEVEL NAVIGATION TABS */}
      <div className="bg-white border-b border-[#e2e8f0] px-8">
        <nav className="-mb-px flex space-x-8" aria-label="Top Tabs">
          <button
            onClick={() => setActiveTopTab('batches')}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-semibold transition-colors ${
              activeTopTab === 'batches'
                ? 'border-[#0a1628] text-[#0a1628]'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Batches
          </button>
          <button
            onClick={() => setActiveTopTab('analytics')}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-semibold transition-colors ${
              activeTopTab === 'analytics'
                ? 'border-[#0a1628] text-[#0a1628]'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Analytics
          </button>
          <button
            onClick={() => setActiveTopTab('upload')}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-semibold transition-colors ${
              activeTopTab === 'upload'
                ? 'border-[#0a1628] text-[#0a1628]'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Upload
          </button>
        </nav>
      </div>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">

        {/* TAB 1: BATCHES */}
        <div style={{ display: activeTopTab === 'batches' ? 'block' : 'none' }} className="space-y-6">
          
          {/* STAT BAR */}
          <div className="bg-white rounded-xl border border-gray-200 py-3 px-6 shadow-sm flex flex-col md:flex-row justify-between items-stretch gap-4 md:gap-0">
            {/* Stat 1 */}
            <div className="flex-1 flex flex-col justify-center px-4">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Uplift Available</span>
              <span className="text-[20px] font-bold text-[#2563eb] mt-1">{formatCurrency(stats.totalUpliftAvailable)}</span>
            </div>
            <div className="hidden md:block w-px bg-gray-200"></div>
            {/* Stat 2 */}
            <div className="flex-1 flex flex-col justify-center px-4">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Approved Routings</span>
              <span className="text-[20px] font-bold text-[#16a34a] mt-1">{stats.approvedRoutings}</span>
            </div>
            <div className="hidden md:block w-px bg-gray-200"></div>
            {/* Stat 3 */}
            <div className="flex-1 flex flex-col justify-center px-4">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Manual Review</span>
              <span className="text-[20px] font-bold text-[#d97706] mt-1">{stats.manualReview}</span>
            </div>
            <div className="hidden md:block w-px bg-gray-200"></div>
            {/* Stat 4 */}
            <div className="flex-1 flex flex-col justify-center px-4">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Claims</span>
              <span className="text-[20px] font-bold text-[#0a1628] mt-1">{stats.totalClaims}</span>
            </div>
            <div className="hidden md:block w-px bg-gray-200"></div>
            {/* Stat 5 */}
            <div className="flex-1 flex flex-col justify-center px-4">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Active Batches</span>
              <span className="text-[20px] font-bold text-[#0a1628] mt-1">{stats.activeBatches}</span>
            </div>
          </div>

          {/* Sub-tabs List */}
          <div className="flex justify-between items-end border-b border-gray-200 pb-5">
            <div className="flex flex-col space-y-2">
              <nav className="flex space-x-8" aria-label="Tabs">
                <button
                  onClick={() => setTab('active')}
                  className={`whitespace-nowrap pb-4 px-1 border-b-2 font-semibold text-sm transition-colors ${
                    tab === 'active'
                      ? 'border-[#2563eb] text-[#2563eb]'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Active
                </button>
                <button
                  onClick={() => setTab('completed')}
                  className={`whitespace-nowrap pb-4 px-1 border-b-2 font-semibold text-sm flex items-center space-x-2 transition-colors ${
                    tab === 'completed'
                      ? 'border-[#2563eb] text-[#2563eb]'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span>Completed</span>
                  {completedCount > 0 && (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      tab === 'completed' ? 'bg-blue-50 text-[#2563eb]' : 'bg-gray-100 text-gray-900'
                    }`}>
                      {completedCount}
                    </span>
                  )}
                </button>
              </nav>
            </div>
          </div>

          {/* BATCH CARDS GRID */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              <div className="col-span-full py-24 text-center text-sm text-gray-500 bg-white shadow rounded-lg animate-pulse border border-gray-100">
                Loading batches...
              </div>
            ) : batchesList.length === 0 ? (
              <div className="col-span-full py-24 text-center text-sm text-gray-500 bg-white shadow rounded-lg border border-gray-100">
                {tab === 'active' ? 'No active batches found.' : 'No completed batches found.'}
              </div>
            ) : (
              batchesList.map(batch => {
                const isError = !!batch.processing_error
                const isProcessing = batch.status === 'processing'
                const isCompleted = batch.status === 'completed'

                return (
                  <div 
                    key={batch.id} 
                    className={`bg-white rounded-lg shadow-sm border border-gray-100 flex flex-col justify-between overflow-hidden transition-all hover:shadow-md ${
                      isError
                        ? 'border-l-4 border-l-red-500'
                        : isProcessing
                        ? 'border-l-4 border-l-blue-500 animate-pulse'
                        : isCompleted
                        ? 'border-l-4 border-l-green-500'
                        : 'border-l-4 border-l-[#2563eb]'
                    }`}
                  >
                    {/* Card Header */}
                    <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-start space-x-2">
                      <div className="overflow-hidden flex-1">
                        {editingBatchId === batch.id ? (
                          <div className="flex items-center space-x-1 w-full my-1">
                            <input
                              type="text"
                              value={editingBatchName}
                              onChange={(e) => setEditingBatchName(e.target.value)}
                              className="px-2 py-1 border border-gray-300 rounded text-sm w-full font-bold text-[#0a1628]"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveRename(batch.id)}
                              className="text-green-600 hover:text-green-800 p-1 flex-shrink-0"
                            >
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                            <button
                              onClick={handleCancelRename}
                              className="text-red-600 hover:text-red-800 p-1 flex-shrink-0"
                            >
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <h3 className="text-lg font-bold text-[#0a1628] truncate font-display" title={batch.name}>
                              {batch.name}
                            </h3>
                            <button
                              onClick={() => handleStartRename(batch.id, batch.name)}
                              className="text-gray-400 hover:text-[#2563eb] p-1 transition-colors flex-shrink-0"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                          </div>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {isMounted ? `${new Date(batch.created_at).toLocaleDateString()} at ${new Date(batch.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                        </p>
                        {isError && batch.processing_error && (
                          <div className="mt-2 text-xs font-semibold text-red-600 bg-red-50 p-2 rounded border border-red-100">
                            Error: {batch.processing_error}
                          </div>
                        )}
                      </div>

                      {isError ? (
                        <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
                          Error
                        </span>
                      ) : isProcessing ? (
                        <span className="inline-flex items-center space-x-1 rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-[#2563eb] ring-1 ring-inset ring-blue-600/20 animate-pulse">
                          <svg className="animate-spin h-3 w-3 text-[#2563eb]" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span>Processing...</span>
                        </span>
                      ) : isCompleted ? (
                        <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-600/20">
                          Completed
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-[#2563eb] ring-1 ring-inset ring-blue-600/20">
                          Open
                        </span>
                      )}
                    </div>

                    {/* Card Body */}
                    <div className="p-5 flex-1 flex flex-col justify-center">
                      {isProcessing ? (
                        <div className="space-y-2 py-2">
                          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-[#2563eb] h-1.5 rounded-full animate-pulse w-full"></div>
                          </div>
                          <span className="block text-center text-xs text-gray-400 font-semibold animate-pulse">
                            Running rules engine...
                          </span>
                        </div>
                      ) : isError ? (
                        <div className="text-center py-2 text-xs text-gray-500 font-medium">
                          Processing was interrupted. Please delete and re-upload.
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 gap-2">
                          <div className="text-center">
                            <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Claims</span>
                            <span className="block mt-1 font-bold text-[#0a1628] text-sm">{batch.total_claims}</span>
                          </div>
                          <div className="text-center">
                            <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Approved</span>
                            <span className="block mt-1 font-bold text-[#0a1628] text-sm">{batch.approved_count}</span>
                          </div>
                          <div className="text-center">
                            <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Manual</span>
                            <span className="block mt-1 font-bold text-[#0a1628] text-sm">{batch.manual_review_count}</span>
                          </div>
                          <div className="text-center">
                            <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Uplift</span>
                            <span className="block mt-1 font-bold text-[#2563eb] text-sm truncate" title={formatCurrency(batch.total_uplift)}>
                              {formatCurrency(batch.total_uplift)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Card Action */}
                    <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
                      {isProcessing ? (
                        <button 
                          disabled
                          className="inline-flex justify-center items-center bg-gray-100 text-gray-400 px-4 py-1.5 rounded-md text-xs font-bold cursor-not-allowed"
                        >
                          Processing...
                        </button>
                      ) : isError ? (
                        <button 
                          disabled
                          className="inline-flex justify-center items-center bg-red-50 text-red-400 px-4 py-1.5 rounded-md text-xs font-bold cursor-not-allowed"
                        >
                          Failed
                        </button>
                      ) : (
                        <Link 
                          href={`/dashboard/bluecard/batch/${batch.id}`} 
                          className="inline-flex justify-center items-center bg-[#0a1628] hover:bg-[#12253f] text-white px-4 py-1.5 rounded-md text-xs font-bold transition-colors"
                        >
                          View Details
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* TAB 2: ANALYTICS */}
        <div style={{ display: activeTopTab === 'analytics' ? 'block' : 'none' }} className="space-y-6">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-[#0a1628] font-display">Analytics</h2>
            <p className="text-xs text-gray-500 mt-1">Real-time optimization breakdown based on approved BlueCard routings.</p>
          </div>

          {!chartData.routingSplit || chartData.routingSplit.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#e2e8f0] p-16 text-center shadow-sm">
              <p className="text-gray-500 font-medium">No routing data yet. Upload a batch to see analytics.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Chart 1: Uplift by Payer */}
              <div className="bg-white rounded-xl border border-[#e2e8f0] p-5 shadow-sm">
                <h3 className="font-bold text-xs text-gray-900 mb-3">Uplift by Payer</h3>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData.upliftByPayer} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="payer_name" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v: number) => formatCurrency(v)} tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(v: unknown) => formatCurrency(Number(v))}
                        contentStyle={{ backgroundColor: '#0a1628', border: 'none', borderRadius: '6px', color: '#ffffff', fontSize: '11px' }}
                        labelStyle={{ color: '#ffffff', fontWeight: 'bold' }}
                        itemStyle={{ color: '#93c5fd' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} iconSize={8} />
                      <Bar dataKey="uplift" name="Total Uplift" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Uplift by Product Type */}
              <div className="bg-white rounded-xl border border-[#e2e8f0] p-5 shadow-sm">
                <h3 className="font-bold text-xs text-gray-900 mb-3">Uplift by Product Type</h3>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData.upliftByProductType} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="product_type" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v: number) => formatCurrency(v)} tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(v: unknown) => formatCurrency(Number(v))}
                        contentStyle={{ backgroundColor: '#0a1628', border: 'none', borderRadius: '6px', color: '#ffffff', fontSize: '11px' }}
                        labelStyle={{ color: '#ffffff', fontWeight: 'bold' }}
                        itemStyle={{ color: '#93c5fd' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} iconSize={8} />
                      <Bar dataKey="uplift" name="Total Uplift" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 3: Routing Split */}
              <div className="bg-white rounded-xl border border-[#e2e8f0] p-5 shadow-sm">
                <h3 className="font-bold text-xs text-gray-900 mb-3">Routing Split</h3>
                <div className="h-[220px] flex items-center justify-center">
                  <div className="w-full h-full">
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={chartData.routingSplit}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={70}
                          paddingAngle={3}
                          dataKey="value"
                          label={({ percent }) => percent !== undefined && percent !== null ? `${(percent * 100).toFixed(0)}%` : ''}
                        >
                          {chartData.routingSplit.map((entry, index) => {
                            const isAnthem = String(entry.name).toLowerCase().includes('anthem')
                            return <Cell key={`cell-${index}`} fill={isAnthem ? '#2563eb' : '#16a34a'} />
                          })}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0a1628', border: 'none', borderRadius: '6px', color: '#ffffff', fontSize: '11px' }}
                          labelStyle={{ color: '#ffffff', fontWeight: 'bold' }}
                          itemStyle={{ color: '#93c5fd' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px' }} iconSize={8} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* TAB 3: UPLOAD */}
        <div style={{ display: activeTopTab === 'upload' ? 'block' : 'none' }} className="space-y-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-bold text-[#0a1628] font-display">Upload Claims</h2>
              <p className="text-xs text-gray-500 mt-1">Upload CSV batches to route claims using our custom rules engine.</p>
            </div>
            <button
              onClick={handleNewUploadClick}
              className="rounded-md bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              New Upload
            </button>
          </div>

          <div 
            ref={uploadAreaRef}
            className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm max-w-xl mx-auto"
          >
            <p className="text-sm text-gray-500 mb-4">
              Drag and drop a CSV file containing claims data. RevenueLogic will process it instantly using our custom rules engine.
            </p>

            <div 
              onDrop={onDrop}
              onDragOver={onDragOver}
              className={`flex flex-col justify-center items-center rounded-lg border-2 border-dashed border-gray-300 px-6 py-10 transition-colors ${
                uploading ? 'opacity-50' : 'hover:bg-blue-50/20 hover:border-[#2563eb] cursor-pointer'
              }`}
            >
              <div className="text-center space-y-2">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                </svg>

                <label className="relative cursor-pointer rounded-md bg-white font-semibold text-[#2563eb] focus-within:outline-none hover:text-blue-500 transition-colors">
                  <span>Upload a file</span>
                  <input 
                    ref={fileInputRef}
                    type="file" 
                    className="sr-only" 
                    accept=".csv" 
                    onChange={handleFileChange} 
                    disabled={uploading} 
                  />
                </label>
                <p className="text-xs text-gray-500">or drag and drop CSV files here</p>
                <p className="text-[10px] text-gray-400 mt-2">
                  Required: patient_id, alpha_prefix, dos, product_type, payer_name, charge_amount — Optional: cpt_code, rev_code
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-md bg-red-50 p-4 border border-red-200">
                <div className="text-sm font-semibold text-red-800">{error}</div>
              </div>
            )}
            
            {uploading && (
              <div className="mt-4 flex justify-center items-center space-x-2 text-sm text-[#2563eb] font-semibold animate-pulse">
                <span className="h-2 w-2 rounded-full bg-[#2563eb] animate-bounce"></span>
                <span>Processing claims in chunks...</span>
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  )
}
