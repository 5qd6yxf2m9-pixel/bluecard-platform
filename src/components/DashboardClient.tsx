'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export interface RoutingDecisionData {
  id: string;
  decision: string;
  reason: string;
  recommended_plan: string | null;
  alternate_plan: string | null;
  uplift_amount: number | null;
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

export interface DashboardStats {
  totalProcessed: number;
  approvedCount: number;
  manualReviewCount: number;
  totalUplift: number;
}

interface DashboardClientProps {
  userEmail: string;
  clientId: string;
  stats: DashboardStats;
  tableData: ClaimWithDecision[];
  role?: string;
}

export function DashboardClient({ userEmail, clientId, stats, tableData, role }: DashboardClientProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

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
        if (!text) {
          throw new Error()
        }

        const lines = text.split('\n').filter(line => line.trim() !== '')
        if (lines.length < 2) {
          throw new Error()
        }

        const headers = lines[0].split(',').map(h => h.trim())
        const expectedHeaders = ['patient_id', 'alpha_prefix', 'dos', 'product_type', 'payer_name', 'charge_amount']
        
        for (const expected of expectedHeaders) {
          if (!headers.includes(expected)) {
            throw new Error()
          }
        }

        const rows = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim())
          const rowData: Record<string, string> = {}
          headers.forEach((header, index) => {
            rowData[header] = values[index]
          })
          return rowData
        })

        const claimsToInsert = rows.map(row => ({
          patient_id: row.patient_id,
          alpha_prefix: row.alpha_prefix,
          dos: row.dos,
          product_type: row.product_type,
          payer_name: row.payer_name,
          charge_amount: parseFloat(row.charge_amount) || 0,
          client_id: clientId,
          status: 'pending'
        }))

        const { error: insertError } = await supabase
          .from('claims')
          .insert(claimsToInsert)

        if (insertError) throw new Error()

        // Process claims
        const response = await fetch('/api/process-claims', { method: 'POST' })
        if (!response.ok) {
          throw new Error()
        }

        router.refresh()
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

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void processFile(e.target.files[0])
    }
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
            <button
              onClick={handleSignOut}
              className="text-sm text-indigo-600 hover:text-indigo-900 font-medium"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
        
        {/* STATS BAR */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
          <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
            <dt className="truncate text-sm font-medium text-gray-500">Total Claims Processed</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">{stats.totalProcessed}</dd>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
            <dt className="truncate text-sm font-medium text-gray-500">Approved Routings</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-green-600">{stats.approvedCount}</dd>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
            <dt className="truncate text-sm font-medium text-gray-500">Manual Review</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-yellow-600">{stats.manualReviewCount}</dd>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
            <dt className="truncate text-sm font-medium text-gray-500">Total Estimated Uplift</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-blue-600">{formatCurrency(stats.totalUplift)}</dd>
          </div>
        </div>

        {/* UPLOAD SECTION */}
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
                <svg className="mx-auto h-12 w-12 text-gray-300" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M11.47 2.47a.75.75 0 011.06 0l4.5 4.5a.75.75 0 01-1.06 1.06l-3.22-3.22V16.5a.75.75 0 01-1.5 0V4.81L8.03 8.03a.75.75 0 01-1.06-1.06l4.5-4.5zM3 15.75a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
                </svg>
                <div className="mt-4 flex text-sm leading-6 text-gray-600 justify-center">
                  <label
                    htmlFor="file-upload"
                    className="relative cursor-pointer rounded-md bg-white font-semibold text-indigo-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-600 focus-within:ring-offset-2 hover:text-indigo-500"
                  >
                    <span>Upload a file</span>
                    <input id="file-upload" name="file-upload" type="file" className="sr-only" accept=".csv" onChange={handleFileChange} disabled={uploading} />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
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
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing claims...
              </div>
            )}
          </div>
        </div>

        {/* RESULTS TABLE */}
        <div className="bg-white shadow sm:rounded-lg overflow-hidden">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-base font-semibold leading-6 text-gray-900">Recent Routing Decisions</h3>
          </div>
          <div className="border-t border-gray-200">
            {tableData.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-gray-500">
                No claims processed yet. Upload a CSV to get started.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Patient ID</th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Prefix</th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Product</th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Charge</th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Recommended Plan</th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Uplift</th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Decision</th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {tableData.map((claim) => {
                      const decision = claim.routing_decisions?.[0]
                      return (
                        <tr key={claim.id}>
                          <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">{claim.patient_id}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{claim.alpha_prefix}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{claim.product_type}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{formatCurrency(claim.charge_amount)}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{decision?.recommended_plan || '-'}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{decision?.uplift_amount ? formatCurrency(decision.uplift_amount) : '-'}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {decision ? (
                              <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                                decision.decision === 'approved' 
                                  ? 'bg-green-50 text-green-700 ring-green-600/20' 
                                  : 'bg-yellow-50 text-yellow-800 ring-yellow-600/20'
                              }`}>
                                {decision.decision}
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-500/10">
                                {claim.status}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-4 text-sm text-gray-500 max-w-xs truncate" title={decision?.reason || ''}>{decision?.reason || '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
