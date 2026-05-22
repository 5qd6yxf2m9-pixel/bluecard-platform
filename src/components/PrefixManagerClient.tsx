'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export interface AlphaPrefixReference {
  id?: string;
  prefix: string;
  plan_name: string | null;
  state: string | null;
  program: string | null;
  mail_address: string | null;
  claims_phone: string | null;
  eligibility_phone: string | null;
  is_active: boolean;
  license_status?: 'licensed' | 'unlicensed' | 'unknown' | null;
  contracted_provider?: boolean | null;
  effective_start_date?: string | null;
  effective_end_date?: string | null;
}

export function PrefixManagerClient({ initialPrefixes }: { initialPrefixes: AlphaPrefixReference[] }) {
  const [search, setSearch] = useState('')
  const [licenseFilter, setLicenseFilter] = useState<'all' | 'licensed' | 'unlicensed' | 'unknown'>('all')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // License upload states
  const [licenseUploading, setLicenseUploading] = useState(false)
  const [licenseError, setLicenseError] = useState<string | null>(null)
  const [licenseSuccess, setLicenseSuccess] = useState<string | null>(null)

  // Inline editing states
  const [editingPrefix, setEditingPrefix] = useState<string | null>(null)
  const [editStatus, setEditStatus] = useState<'licensed' | 'unlicensed' | 'unknown'>('unknown')
  const [editContracted, setEditContracted] = useState(false)
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [savingPrefix, setSavingPrefix] = useState<string | null>(null)
  const [inlineSuccess, setInlineSuccess] = useState<string | null>(null)
  const [inlineError, setInlineError] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createClient()

  // Filter prefixes
  const filteredPrefixes = initialPrefixes.filter(p => {
    const matchesSearch = 
      p.prefix.toLowerCase().includes(search.toLowerCase()) || 
      (p.plan_name && p.plan_name.toLowerCase().includes(search.toLowerCase())) ||
      (p.state && p.state.toLowerCase().includes(search.toLowerCase()))

    const status = p.license_status || 'unknown'
    const matchesLicense = licenseFilter === 'all' || status === licenseFilter

    return matchesSearch && matchesLicense
  })

  // Normal CSV prefix upload
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

  // License CSV upload processing
  const processLicenseFile = async (file: File) => {
    setLicenseUploading(true)
    setLicenseError(null)
    setLicenseSuccess(null)

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string
        if (!text) throw new Error('Empty file')

        const lines = text.split('\n').filter(line => line.trim() !== '')
        if (lines.length < 2) throw new Error('No data rows found in CSV')

        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))

        const getColVal = (rowVals: string[], colName: string): string => {
          const idx = headers.findIndex(h => h.toLowerCase() === colName.toLowerCase())
          if (idx === -1) return ''
          return rowVals[idx]?.trim().replace(/^"|"$/g, '') || ''
        }

        const rows = lines.slice(1).map(line => {
          return line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
        })

        const { data: existingData, error: fetchError } = await supabase
          .from('alpha_prefix_reference')
          .select('prefix, id')
        
        if (fetchError) throw new Error('Failed to query existing prefixes')

        const existingMap = new Map((existingData || []).map(p => [p.prefix.toUpperCase(), p]))

        let updatedCount = 0
        let skippedCount = 0

        const chunks = []
        for (let i = 0; i < rows.length; i += 20) {
          chunks.push(rows.slice(i, i + 20))
        }

        for (const chunk of chunks) {
          await Promise.all(chunk.map(async (rowVals) => {
            const rawPrefix = getColVal(rowVals, 'AlphaPrefix')
            if (!rawPrefix) return

            const prefixKey = rawPrefix.toUpperCase()
            const match = existingMap.get(prefixKey)

            if (!match) {
              skippedCount++
              return
            }

            const rawStatus = getColVal(rowVals, 'LicenseStatus').toLowerCase()
            let status: 'licensed' | 'unlicensed' | 'unknown' = 'unknown'
            if (rawStatus === 'licensed') status = 'licensed'
            else if (rawStatus === 'unlicensed') status = 'unlicensed'

            const rawContracted = getColVal(rowVals, 'ContractedProvider').toLowerCase()
            const isContracted = rawContracted === 'yes' || rawContracted === 'true' || rawContracted === '1'

            const rawStart = getColVal(rowVals, 'EffectiveStartDate')
            const rawEnd = getColVal(rowVals, 'EffectiveEndDate')

            const updateData: Record<string, string | boolean | null> = {
              license_status: status,
              contracted_provider: isContracted,
              effective_start_date: rawStart || null,
              effective_end_date: rawEnd || null
            }

            const matchKey = match.id ? { id: match.id } : { prefix: match.prefix }

            const { error: updateErr } = await supabase
              .from('alpha_prefix_reference')
              .update(updateData)
              .match(matchKey)

            if (!updateErr) {
              updatedCount++
            } else {
              skippedCount++
            }
          }))
        }

        setLicenseSuccess(`${updatedCount} prefixes updated, ${skippedCount} prefixes not found and skipped.`)
        router.refresh()
      } catch {
        setLicenseError('An error occurred during file parsing.')
      } finally {
        setLicenseUploading(false)
      }
    }
    reader.onerror = () => {
      setLicenseError('Failed to read file.')
      setLicenseUploading(false)
    }
    reader.readAsText(file)
  }

  const onLicenseDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (licenseUploading) return
    const file = e.dataTransfer.files?.[0]
    if (file && file.name.endsWith('.csv')) {
      void processLicenseFile(file)
    } else {
      setLicenseError('Please upload a valid .csv file.')
    }
  }, [licenseUploading]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLicenseFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) void processLicenseFile(e.target.files[0])
  }

  // Handle click on edit license
  const handleEditClick = (p: AlphaPrefixReference) => {
    setEditingPrefix(p.prefix)
    setEditStatus((p.license_status as 'licensed' | 'unlicensed' | 'unknown') || 'unknown')
    setEditContracted(!!p.contracted_provider)
    setEditStartDate(p.effective_start_date || '')
    setEditEndDate(p.effective_end_date || '')
    setInlineSuccess(null)
    setInlineError(null)
  }

  // Save inline edit
  const handleSaveLicense = async (p: AlphaPrefixReference) => {
    setSavingPrefix(p.prefix)
    setInlineSuccess(null)
    setInlineError(null)

    // Validate Effective Start Date & Effective End Date
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (editStartDate && !dateRegex.test(editStartDate)) {
      setInlineError('Invalid date format. Use YYYY-MM-DD')
      setSavingPrefix(null)
      return
    }
    if (editEndDate && !dateRegex.test(editEndDate)) {
      setInlineError('Invalid date format. Use YYYY-MM-DD')
      setSavingPrefix(null)
      return
    }

    try {
      const { error: updateErr } = await supabase
        .from('alpha_prefix_reference')
        .update({
          license_status: editStatus.toLowerCase() as 'licensed' | 'unlicensed' | 'unknown',
          contracted_provider: Boolean(editContracted),
          effective_start_date: editStartDate || null,
          effective_end_date: editEndDate || null
        })
        .eq('prefix', p.prefix)

      console.log('Saving prefix:', p.prefix, 'with values:', { editStatus, editContracted, editStartDate, editEndDate })
      console.log('Update result:', updateErr)

      if (updateErr) throw new Error(updateErr.message)

      setInlineSuccess('License details updated successfully!')
      router.refresh()
      setTimeout(() => {
        setEditingPrefix(null)
      }, 1000)
    } catch {
      console.error('Failed to update license details in database for prefix:', p.prefix)
      setInlineError('Failed to update license details in database. See console for details.')
    } finally {
      setSavingPrefix(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Normal CSV Upload Section */}
        <div className="bg-white shadow sm:rounded-lg p-6">
          <h3 className="text-base font-semibold text-gray-900">Upload Prefix CSV</h3>
          <p className="text-xs text-gray-500 mt-1">Updates basic prefix metadata, phones, and active status.</p>
          <div 
            onDrop={onDrop}
            onDragOver={onDragOver}
            className={`mt-4 flex justify-center rounded-lg border border-dashed border-gray-300 px-6 py-8 ${uploading ? 'opacity-50' : 'hover:bg-gray-50'}`}
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

        {/* License CSV Upload Section */}
        <div className="bg-white shadow sm:rounded-lg p-6">
          <h3 className="text-base font-semibold text-gray-900">Upload License Data</h3>
          <p className="text-xs text-gray-500 mt-1">Updates state license statuses and contract provider checks.</p>
          <div 
            onDrop={onLicenseDrop}
            onDragOver={onDragOver}
            className={`mt-4 flex justify-center rounded-lg border border-dashed border-gray-300 px-6 py-8 ${licenseUploading ? 'opacity-50' : 'hover:bg-gray-50'}`}
          >
            <div className="text-center">
              <label className="relative cursor-pointer rounded-md font-semibold text-indigo-600 focus-within:outline-none hover:text-indigo-500">
                <span>Upload License CSV</span>
                <input type="file" className="sr-only" accept=".csv" onChange={handleLicenseFileChange} disabled={licenseUploading} />
              </label>
              <p className="text-xs text-gray-500 mt-2">or drag and drop</p>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 mt-2">
            Accepted columns: AlphaPrefix, State, LocalPlan, ProductType, LicenseStatus, ContractedProvider, EffectiveStartDate, EffectiveEndDate, Notes
          </p>
          {licenseError && <p className="mt-2 text-sm text-red-600">{licenseError}</p>}
          {licenseSuccess && <p className="mt-2 text-sm text-green-600">{licenseSuccess}</p>}
          {licenseUploading && <p className="mt-2 text-sm text-indigo-600">Uploading License Data...</p>}
        </div>
      </div>

      <div className="bg-white shadow sm:rounded-lg p-6">
        {/* Filters */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Prefixes Reference Directory</h3>
          
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">License Status Filter</label>
              <select
                value={licenseFilter}
                onChange={e => setLicenseFilter(e.target.value as 'all' | 'licensed' | 'unlicensed' | 'unknown')}
                className="block w-40 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">All Licenses</option>
                <option value="licensed">Licensed</option>
                <option value="unlicensed">Unlicensed</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Search Directory</label>
              <input 
                type="text" 
                placeholder="Prefix, plan name, or state..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="block w-64 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Directory Table */}
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Prefix</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Plan Name</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">State</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">License Status</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Contracted</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Effective Dates</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Claims Phone</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Active</th>
                <th className="relative px-4 py-3.5 text-right text-xs font-semibold text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredPrefixes.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                    No prefixes matched the active filters.
                  </td>
                </tr>
              ) : (
                filteredPrefixes.map(p => {
                  const status = p.license_status || 'unknown'
                  return (
                    <React.Fragment key={p.prefix}>
                      <tr className={editingPrefix === p.prefix ? 'bg-indigo-50/30' : undefined}>
                        <td className="px-4 py-4 text-sm font-semibold text-gray-900">{p.prefix}</td>
                        <td className="px-4 py-4 text-sm text-gray-500 truncate max-w-[200px]" title={p.plan_name || ''}>
                          {p.plan_name || '-'}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500">{p.state || '-'}</td>
                        <td className="px-4 py-4 text-sm">
                          {status === 'licensed' && (
                            <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                              Licensed
                            </span>
                          )}
                          {status === 'unlicensed' && (
                            <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">
                              Unlicensed
                            </span>
                          )}
                          {status === 'unknown' && (
                            <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
                              Unknown
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500 text-center md:text-left">
                          {p.contracted_provider ? (
                            <span className="text-green-600 font-bold text-base" title="Contracted Provider">✓</span>
                          ) : (
                            <span className="text-gray-300 font-medium">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500">
                          {p.effective_start_date || p.effective_end_date ? (
                            <span>
                              {p.effective_start_date || '—'} to {p.effective_end_date || '—'}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500">{p.claims_phone || '-'}</td>
                        <td className="px-4 py-4 text-sm text-gray-500">
                          {p.is_active ? (
                            <span className="text-xs text-green-600 font-medium">Active</span>
                          ) : (
                            <span className="text-xs text-gray-400">Inactive</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right text-sm font-medium">
                          <button
                            type="button"
                            onClick={() => handleEditClick(p)}
                            className="text-indigo-600 hover:text-indigo-900 font-semibold"
                          >
                            Edit License
                          </button>
                        </td>
                      </tr>

                      {/* Inline Form */}
                      {editingPrefix === p.prefix && (
                        <tr>
                          <td colSpan={9} className="bg-gray-50/50 px-6 py-4">
                            <div className="border border-indigo-100 rounded-lg p-4 bg-white shadow-sm space-y-4 max-w-3xl mx-auto">
                              <h4 className="text-sm font-bold text-gray-900">
                                Edit License & Contract: <span className="text-indigo-600">{p.prefix}</span>
                              </h4>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-semibold text-gray-600 uppercase">License Status</label>
                                  <select
                                    value={editStatus}
                                    onChange={e => setEditStatus(e.target.value as 'licensed' | 'unlicensed' | 'unknown')}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-1.5"
                                  >
                                    <option value="unknown">Unknown</option>
                                    <option value="licensed">Licensed</option>
                                    <option value="unlicensed">Unlicensed</option>
                                  </select>
                                </div>

                                <div className="flex items-center pt-5">
                                  <label className="inline-flex items-center cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={editContracted}
                                      onChange={e => setEditContracted(e.target.checked)}
                                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                    />
                                    <span className="ml-2 text-sm font-medium text-gray-700">Provider is contracted with this plan</span>
                                  </label>
                                </div>

                                <div>
                                  <label className="block text-xs font-semibold text-gray-600 uppercase">Effective Start Date</label>
                                  <input
                                    type="text"
                                    placeholder="YYYY-MM-DD"
                                    value={editStartDate}
                                    onChange={e => setEditStartDate(e.target.value)}
                                    className="mt-1 block w-full focus:border-indigo-500 focus:ring-indigo-500"
                                    style={{
                                      color: '#0a1628',
                                      backgroundColor: '#ffffff',
                                      borderColor: '#e2e8f0',
                                      borderWidth: '1px',
                                      borderStyle: 'solid',
                                      padding: '10px 14px',
                                      fontSize: '14px',
                                      borderRadius: '8px'
                                    }}
                                  />
                                  <p className="mt-1 text-[10px] text-gray-400">Format: YYYY-MM-DD (e.g. 2026-01-01)</p>
                                </div>

                                <div>
                                  <label className="block text-xs font-semibold text-gray-600 uppercase">Effective End Date</label>
                                  <input
                                    type="text"
                                    placeholder="YYYY-MM-DD"
                                    value={editEndDate}
                                    onChange={e => setEditEndDate(e.target.value)}
                                    className="mt-1 block w-full focus:border-indigo-500 focus:ring-indigo-500"
                                    style={{
                                      color: '#0a1628',
                                      backgroundColor: '#ffffff',
                                      borderColor: '#e2e8f0',
                                      borderWidth: '1px',
                                      borderStyle: 'solid',
                                      padding: '10px 14px',
                                      fontSize: '14px',
                                      borderRadius: '8px'
                                    }}
                                  />
                                  <p className="mt-1 text-[10px] text-gray-400">Format: YYYY-MM-DD (e.g. 2026-01-01)</p>
                                </div>
                              </div>

                              <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                                <div>
                                  {inlineSuccess && <p className="text-xs text-green-600 font-semibold">{inlineSuccess}</p>}
                                  {inlineError && <p className="text-xs text-red-600 font-semibold">{inlineError}</p>}
                                </div>
                                <div className="flex space-x-3">
                                  <button
                                    type="button"
                                    onClick={() => setEditingPrefix(null)}
                                    className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    disabled={savingPrefix === p.prefix}
                                    onClick={() => handleSaveLicense(p)}
                                    className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                                  >
                                    {savingPrefix === p.prefix ? 'Saving...' : 'Save Changes'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Small Gray Note */}
        <p className="mt-4 text-xs text-gray-500 italic">
          Licensed prefixes with contracted_provider = true receive a +5 confidence score bonus in the BlueCard routing engine.
        </p>
      </div>
    </div>
  )
}

import React from 'react'
