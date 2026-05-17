'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function UploadClaimsPage() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0])
      setError(null)
      setSuccess(null)
    }
  }

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file to upload.')
      return
    }

    setUploading(true)
    setError(null)
    setSuccess(null)

    const reader = new FileReader()
    
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string
        if (!text) {
          throw new Error('Failed to read file content')
        }

        // Basic CSV Parsing
        const lines = text.split('\n').filter(line => line.trim() !== '')
        if (lines.length < 2) {
          throw new Error('CSV must contain a header row and at least one data row')
        }

        const headers = lines[0].split(',').map(h => h.trim())
        
        // Expected headers
        const expectedHeaders = ['patient_id', 'alpha_prefix', 'dos', 'product_type', 'payer_name', 'charge_amount']
        for (const expected of expectedHeaders) {
          if (!headers.includes(expected)) {
            throw new Error(`Missing expected header: ${expected}`)
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

        // Fetch user and profile to get client_id
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) throw new Error('User not authenticated')

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('client_id')
          .eq('id', user.id)
          .single()

        if (profileError) throw new Error('Failed to fetch user profile')
        if (!profile?.client_id) throw new Error('No client_id found for user')

        const claimsToInsert = rows.map(row => ({
          patient_id: row.patient_id,
          alpha_prefix: row.alpha_prefix,
          dos: row.dos,
          product_type: row.product_type,
          payer_name: row.payer_name,
          charge_amount: parseFloat(row.charge_amount) || 0,
          client_id: profile.client_id,
          status: 'pending'
        }))

        const { error: insertError } = await supabase
          .from('claims')
          .insert(claimsToInsert)

        if (insertError) throw new Error(`Failed to insert claims: ${insertError.message}`)

        setSuccess(`Successfully uploaded ${claimsToInsert.length} claims.`)
        setFile(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred during upload.')
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center space-x-4">
          <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-900">
            &larr; Back
          </button>
          <h1 className="text-xl font-bold text-gray-900">Upload Claims</h1>
        </div>
      </header>
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-base font-semibold leading-6 text-gray-900">Upload CSV File</h3>
            <div className="mt-2 max-w-xl text-sm text-gray-500">
              <p>Please select a CSV file containing your claims. The file must include the following headers: patient_id, alpha_prefix, dos, product_type, payer_name, charge_amount.</p>
            </div>
            <div className="mt-5 sm:flex sm:items-center">
              <div className="w-full sm:max-w-xs">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-900 border border-gray-300 rounded-md cursor-pointer bg-gray-50 focus:outline-none p-2"
                />
              </div>
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading || !file}
                className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:ml-3 sm:mt-0 sm:w-auto disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-md bg-red-50 p-4">
                <div className="text-sm text-red-700">{error}</div>
              </div>
            )}

            {success && (
              <div className="mt-4 rounded-md bg-green-50 p-4">
                <div className="text-sm text-green-700">{success}</div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
