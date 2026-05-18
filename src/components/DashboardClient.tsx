'use client'

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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

interface DashboardClientProps {
  userEmail: string;
  clientId: string;
  initialBatches: BatchData[];
  role?: string;
}

export function DashboardClient({ userEmail, clientId, initialBatches, role }: DashboardClientProps) {
  const [tab, setTab] = useState<'active' | 'completed'>('active')
  const [batchesList, setBatchesList] = useState<BatchData[]>(initialBatches)
  const [completedCount, setCompletedCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null)
  const [editingBatchName, setEditingBatchName] = useState<string>('')
  
  const router = useRouter()
  const supabase = createClient()
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

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
              const { data, error } = await supabase
                .from('batches')
                .select('*')
                .eq('id', batch.id)
                .single()
              if (!error && data) {
                const updatedBatch = data as unknown as BatchData
                if (updatedBatch.status !== 'processing' || updatedBatch.processing_error) {
                  hasChanges = true
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
  }, [batchesList, supabase]) // eslint-disable-line react-hooks/exhaustive-deps

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
            status: 'pending'
          }
        })

        // Insert Claims
        const { error: insertError } = await supabase
          .from('claims')
          .insert(claimsToInsert)

        if (insertError) throw new Error()

        // Call Edge Function (fire-and-forget)
        try {
          supabase.auth.getSession().then(({ data: { session } }) => {
            fetch('https://jpnqtxkioymainjxlysm.supabase.co/functions/v1/process-batch', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.access_token}`
              },
              body: JSON.stringify({ batch_id: batch.id, client_id: clientId })
            }).catch(() => {})
          }).catch(() => {})
        } catch { }

        setShowUpload(false)
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
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* HEADER */}
      <header className="bg-[#0a1628] shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <Link href="/dashboard" className="text-xl font-bold text-white font-display hover:opacity-90">
              BlueCard Platform
            </Link>
            {role === 'admin' && (
              <Link href="/admin" className="ml-4 text-sm font-semibold text-[#2563eb] hover:text-blue-400 transition-colors">
                Admin Dashboard
              </Link>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-400 font-medium">{userEmail}</span>
            <button 
              onClick={handleSignOut} 
              className="text-sm text-white font-semibold border border-white/20 hover:bg-white/10 px-3 py-1.5 rounded-md transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
        
        {/* TABS & NEW UPLOAD */}
        <div className="flex justify-between items-end border-b border-gray-200 pb-5">
          <div className="flex flex-col space-y-2">
            <h2 className="text-2xl font-bold text-[#0a1628] font-display">Batches</h2>
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
          
          {tab === 'active' && (
            <button
              onClick={() => setShowUpload(true)}
              className="rounded-md bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              New Upload
            </button>
          )}
        </div>

        {/* UPLOAD MODAL */}
        {showUpload && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 relative animate-in fade-in zoom-in-95 duration-200">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-[#0a1628]">
                <h3 className="text-lg font-bold text-white font-display">Upload Claims</h3>
                <button 
                  onClick={() => { setShowUpload(false); setError(null); }}
                  className="text-gray-400 hover:text-white transition-colors p-1"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-500">
                  Drag and drop a CSV file containing claims data. The BlueCard Platform will process it instantly using our custom rules engine.
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
                      <input type="file" className="sr-only" accept=".csv" onChange={handleFileChange} disabled={uploading} />
                    </label>
                    <p className="text-xs text-gray-500">or drag and drop CSV files here</p>
                  </div>
                </div>

                {error && (
                  <div className="rounded-md bg-red-50 p-4 border border-red-200">
                    <div className="text-sm font-semibold text-red-800">{error}</div>
                  </div>
                )}
                
                {uploading && (
                  <div className="flex justify-center items-center space-x-2 text-sm text-[#2563eb] font-semibold animate-pulse">
                    <span className="h-2 w-2 rounded-full bg-[#2563eb] animate-bounce"></span>
                    <span>Processing claims in chunks...</span>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3 border-t border-gray-100">
                <button
                  onClick={() => { setShowUpload(false); setError(null); }}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BATCH CARDS GRID */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <div className="col-span-full py-24 text-center text-sm text-gray-500 bg-white shadow rounded-lg animate-pulse border border-gray-100">
              Loading batches...
            </div>
          ) : batchesList.length === 0 ? (
            <div className="col-span-full py-24 text-center text-sm text-gray-500 bg-white shadow rounded-lg border border-gray-100">
              {tab === 'active' ? 'No active batches found. Click "New Upload" to get started.' : 'No completed batches found.'}
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
                        href={`/dashboard/batch/${batch.id}`} 
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

      </main>
    </div>
  )
}
