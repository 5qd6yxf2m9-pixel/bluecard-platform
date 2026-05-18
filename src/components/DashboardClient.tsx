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
  
  const router = useRouter()
  const supabase = createClient()

  const fetchBatches = async () => {
    setLoading(true)
    try {
      const statusFilter = tab === 'active' ? 'open' : 'completed'
      const { data, error: fetchErr } = await supabase
        .from('batches')
        .select('*')
        .eq('client_id', clientId)
        .eq('status', statusFilter)
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

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const processFile = async (file: File) => {
    setUploading(true)
    setError(null)

    const reader = new FileReader()
    reader.onload = async (e) => {
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

        // 1. Create Batch
        const batchName = `Upload - ${new Date().toLocaleString()}`
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

        // Query to check existing patient_id + dos for this client_id
        const patientIds = Array.from(new Set(rows.map(r => r.patient_id)))
        const { data: existingClaims, error: checkError } = await supabase
          .from('claims')
          .select('patient_id, dos')
          .eq('client_id', clientId)
          .in('patient_id', patientIds)

        if (checkError) throw new Error()

        const claimsToInsert = rows.map(row => {
          const isDuplicate = (existingClaims || []).some(
            ec => ec.patient_id === row.patient_id && ec.dos === row.dos
          )

          return {
            batch_id: batch.id,
            patient_id: row.patient_id,
            alpha_prefix: row.alpha_prefix,
            dos: row.dos,
            product_type: row.product_type,
            payer_name: row.payer_name,
            charge_amount: parseFloat(row.charge_amount) || 0,
            client_id: clientId,
            status: isDuplicate ? 'duplicate' : 'pending'
          }
        })

        // Insert Claims
        const { error: insertError } = await supabase
          .from('claims')
          .insert(claimsToInsert)

        if (insertError) throw new Error()

        // Call API
        const response = await fetch('/api/process-claims', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch_id: batch.id })
        })

        if (!response.ok) throw new Error()

        setShowUpload(false)
        await fetchBatches()
        await fetchCompletedCount()
      } catch {
        setError('An error occurred during upload or processing. Please check the file format.')
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <h1 className="text-xl font-bold text-blue-800">BlueCard Platform</h1>
            {role === 'admin' && (
              <a href="/admin" className="ml-4 text-sm font-medium text-indigo-600 hover:text-indigo-900">
                Admin Dashboard
              </a>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">{userEmail}</span>
            <button onClick={handleSignOut} className="text-sm text-indigo-600 hover:text-indigo-900 font-medium">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
        
        <div className="flex justify-between items-center border-b border-gray-200 pb-5">
          <div className="flex flex-col space-y-2">
            <h2 className="text-2xl font-bold text-gray-900">Batches</h2>
            <nav className="flex space-x-8" aria-label="Tabs">
              <button
                onClick={() => setTab('active')}
                className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
                  tab === 'active'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setTab('completed')}
                className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                  tab === 'completed'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span>Completed</span>
                {completedCount > 0 && (
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    tab === 'completed' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-900'
                  }`}>
                    {completedCount}
                  </span>
                )}
              </button>
            </nav>
          </div>
          
          {tab === 'active' && (
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              {showUpload ? 'Cancel' : 'New Upload'}
            </button>
          )}
        </div>

        {tab === 'active' && showUpload && (
          <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-base font-semibold leading-6 text-gray-900">Upload Claims</h3>
              <div className="mt-2 max-w-xl text-sm text-gray-500">
                <p>Drag and drop a CSV file here, or click to browse. Processing starts automatically.</p>
              </div>
              <div 
                onDrop={onDrop}
                onDragOver={onDragOver}
                className={`mt-4 flex justify-center rounded-lg border border-dashed border-gray-900/25 px-6 py-10 ${uploading ? 'opacity-50' : 'hover:bg-gray-50 transition-colors'}`}
              >
                <div className="text-center">
                  <label className="relative cursor-pointer rounded-md bg-white font-semibold text-indigo-600 focus-within:outline-none hover:text-indigo-500">
                    <span>Upload a file</span>
                    <input type="file" className="sr-only" accept=".csv" onChange={handleFileChange} disabled={uploading} />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                  <p className="text-xs leading-5 text-gray-600">CSV files only</p>
                </div>
              </div>
              
              {error && (
                <div className="mt-4 rounded-md bg-red-50 p-4">
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              )}
              
              {uploading && (
                <div className="mt-4 flex justify-center items-center text-sm text-indigo-600 font-medium">
                  Processing claims in chunks...
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <div className="col-span-full py-12 text-center text-sm text-gray-500 bg-white shadow rounded-lg animate-pulse">
              Loading batches...
            </div>
          ) : batchesList.length === 0 ? (
            <div className="col-span-full py-12 text-center text-sm text-gray-500 bg-white shadow rounded-lg">
              {tab === 'active' ? 'No active batches found. Click "New Upload" to get started.' : 'No completed batches found.'}
            </div>
          ) : (
            batchesList.map(batch => (
              <div key={batch.id} className="bg-white overflow-hidden shadow rounded-lg divide-y divide-gray-200">
                <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
                  <h3 className="text-lg font-medium text-gray-900 truncate" title={batch.name}>{batch.name}</h3>
                  <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                    batch.status === 'completed' ? 'bg-green-50 text-green-700 ring-green-600/20' : 
                    batch.status === 'open' ? 'bg-blue-50 text-blue-700 ring-blue-600/20' :
                    'bg-yellow-50 text-yellow-800 ring-yellow-600/20'
                  }`}>
                    {batch.status}
                  </span>
                </div>

                <div className="px-4 py-5 sm:p-6 text-sm text-gray-500 space-y-2">
                  <p>Created: {new Date(batch.created_at).toLocaleString()}</p>
                  <p>Total Claims: <span className="font-medium text-gray-900">{batch.total_claims}</span></p>
                  <p>Approved: <span className="font-medium text-green-600">{batch.approved_count}</span></p>
                  <p>Manual Review: <span className="font-medium text-yellow-600">{batch.manual_review_count}</span></p>
                  <p>Total Uplift: <span className="font-medium text-blue-600">{formatCurrency(batch.total_uplift)}</span></p>
                </div>
                <div className="px-4 py-4 sm:px-6">
                  <Link href={`/dashboard/batch/${batch.id}`} className="text-indigo-600 hover:text-indigo-900 font-medium text-sm">
                    View Details &rarr;
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>

      </main>
    </div>
  )
}
