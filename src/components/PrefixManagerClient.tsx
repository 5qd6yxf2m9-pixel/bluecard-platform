'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export interface AlphaPrefixReference {
  prefix: string;
  plan_name: string | null;
  state: string | null;
  program: string | null;
  mail_address: string | null;
  claims_phone: string | null;
  eligibility_phone: string | null;
  is_active: boolean;
}

export function PrefixManagerClient({ initialPrefixes }: { initialPrefixes: AlphaPrefixReference[] }) {
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const filteredPrefixes = initialPrefixes.filter(p => 
    p.prefix.toLowerCase().includes(search.toLowerCase()) || 
    (p.plan_name && p.plan_name.toLowerCase().includes(search.toLowerCase()))
  )

  const processFile = async (file: File) => {
    setUploading(true)
    setError(null)
    setSuccess(null)

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string
        if (!text) throw new Error()

        const lines = text.split('\n').filter(line => line.trim() !== '')
        if (lines.length < 2) throw new Error()

        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
        
        const rows = lines.slice(1).map(line => {
          const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^"|"$/g, ''))
          const rowData: Record<string, string> = {}
          headers.forEach((header, index) => {
            rowData[header] = values[index] || ''
          })
          return rowData
        })

        const upsertData = rows.map(row => ({
          prefix: row['Prefix'] || '',
          plan_name: row['Name'] || null,
          program: row['Program'] || null,
          mail_address: row['Mail'] || null,
          claims_phone: row['Number'] || null,
          eligibility_phone: row['Eligibility'] || null,
          is_active: !!row['Name']
        })).filter(r => r.prefix !== '')

        if (upsertData.length === 0) throw new Error()

        const { error: upsertError } = await supabase
          .from('alpha_prefix_reference')
          .upsert(upsertData, { onConflict: 'prefix' })

        if (upsertError) throw new Error()

        setSuccess(`Successfully updated ${upsertData.length} prefixes.`)
        router.refresh()
      } catch {
        setError('An error occurred. Check CSV format.')
      } finally {
        setUploading(false)
      }
    }
    reader.onerror = () => {
      setError('Failed to read file.')
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

  return (
    <div className="space-y-6">
      <div className="bg-white shadow sm:rounded-lg p-6">
        <h3 className="text-base font-semibold text-gray-900">Upload Prefix CSV</h3>
        <div 
          onDrop={onDrop}
          onDragOver={onDragOver}
          className={`mt-4 flex justify-center rounded-lg border border-dashed border-gray-300 px-6 py-10 ${uploading ? 'opacity-50' : 'hover:bg-gray-50'}`}
        >
          <div className="text-center">
            <label className="relative cursor-pointer rounded-md font-semibold text-indigo-600 focus-within:outline-none hover:text-indigo-500">
              <span>Upload CSV</span>
              <input type="file" className="sr-only" accept=".csv" onChange={handleFileChange} disabled={uploading} />
            </label>
            <p className="text-xs text-gray-500 mt-2">or drag and drop</p>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {success && <p className="mt-2 text-sm text-green-600">{success}</p>}
        {uploading && <p className="mt-2 text-sm text-indigo-600">Uploading...</p>}
      </div>

      <div className="bg-white shadow sm:rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-semibold text-gray-900">Prefixes</h3>
          <input 
            type="text" 
            placeholder="Search prefix or plan name..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="block w-64 border border-gray-300 rounded-md px-3 py-2"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Prefix</th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Plan Name</th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">State</th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Program</th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Claims Phone</th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Is Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredPrefixes.map(p => (
                <tr key={p.prefix}>
                  <td className="px-3 py-4 text-sm font-medium text-gray-900">{p.prefix}</td>
                  <td className="px-3 py-4 text-sm text-gray-500">{p.plan_name || '-'}</td>
                  <td className="px-3 py-4 text-sm text-gray-500">{p.state || '-'}</td>
                  <td className="px-3 py-4 text-sm text-gray-500">{p.program || '-'}</td>
                  <td className="px-3 py-4 text-sm text-gray-500">{p.claims_phone || '-'}</td>
                  <td className="px-3 py-4 text-sm text-gray-500">{p.is_active ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
