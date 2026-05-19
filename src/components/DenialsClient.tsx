'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
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

export interface DenialClaim {
  id: string;
  account: string;
  claim_id: string;
  payer: string;
  dos: string;
  cpt_code: string;
  rev_code: string;
  drg: string;
  billed_amount: number;
  allowed_amount: number;
  paid_amount: number;
  carc_code: string;
  rarc_code: string;
  group_code: string;
  denial_date: string;
  auth_present: boolean | string;
  eligibility: string;
  product_type: string;
  category: string;
  root_cause: string;
  recommended_action: string;
  status: 'open' | 'appealed' | 'resolved';
}

export const standardizeCategory = (cat: string | null | undefined): string => {
  if (!cat) return 'Other'
  const catLower = cat.toLowerCase().trim()
  if (catLower.includes('eligibility')) return 'Eligibility'
  if (catLower.includes('duplicate')) return 'Duplicate'
  if (catLower.includes('timely') || catLower.includes('filing')) return 'Timely Filing'
  if (catLower.includes('necessity') || catLower.includes('medical')) return 'Medical Necessity'
  if (catLower.includes('auth') || catLower.includes('authorization') || catLower.includes('prior')) return 'Authorization'
  if (catLower.includes('patient') || catLower.includes('responsibility') || catLower.includes('deductible') || catLower.includes('coinsurance')) return 'Patient Responsibility'
  if (catLower.includes('contractual') || catLower.includes('contract')) return 'Contractual'
  if (catLower.includes('cob') || catLower.includes('coordination') || catLower.includes('benefit')) return 'COB'
  if (catLower.includes('billing') || catLower.includes('error') || catLower.includes('coding')) return 'Billing Error'
  if (catLower.includes('coverage') || catLower.includes('plan')) return 'Coverage'
  
  const valid = [
    'Eligibility', 'Duplicate', 'Timely Filing', 'Medical Necessity', 
    'Authorization', 'Patient Responsibility', 'Contractual', 'COB', 
    'Billing Error', 'Coverage', 'Other'
  ]
  return valid.find(v => v.toLowerCase() === catLower) || 'Other'
}

interface DenialsClientProps {
  clientId: string;
  userEmail: string;
  initialClaims: DenialClaim[];
}

export function DenialsClient({ clientId, userEmail, initialClaims }: DenialsClientProps) {
  const router = useRouter()
  const supabase = createClient()

  const [dragActive, setDragActive] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  // Work Queue Interactive State
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [currentPage, setCurrentPage] = useState(1)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Dynamic statistics calculations
  const totalClaims = initialClaims.length
  const totalBilled = initialClaims.reduce((sum, c) => sum + (Number(c.billed_amount) || 0), 0)
  const totalPaid = initialClaims.reduce((sum, c) => sum + (Number(c.paid_amount) || 0), 0)
  const totalDeniedDollars = totalBilled - totalPaid
  const denialRate = totalBilled > 0 ? (totalDeniedDollars / totalBilled) * 100 : 0
  const recoverableOpportunities = initialClaims.filter(c => c.recommended_action && c.recommended_action.trim() !== '').length

  // CSV parsing functions
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0])
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0])
    }
  }

  const onButtonClick = () => {
    fileInputRef.current?.click()
  }

  const parseCSV = (text: string): string[][] => {
    const lines: string[][] = []
    let row: string[] = []
    let inQuotes = false
    let entry = ''

    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      const nextChar = text[i + 1]

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          entry += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        row.push(entry.trim())
        entry = ''
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        row.push(entry.trim())
        entry = ''
        if (row.length > 0 || row.some(cell => cell !== '')) {
          lines.push(row)
        }
        row = []
        if (char === '\r' && nextChar === '\n') {
          i++
        }
      } else {
        entry += char
      }
    }
    if (entry || row.length > 0) {
      row.push(entry.trim())
      if (row.some(cell => cell !== '')) {
        lines.push(row)
      }
    }
    return lines
  }

  const processFile = async (file: File) => {
    setError(null)
    setSuccess(null)
    setParsing(true)

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string
        const rows = parseCSV(text)

        if (rows.length < 2) {
          throw new Error("The CSV file is empty or lacks data rows.")
        }

        const headers = rows[0].map(h => h.toLowerCase().replace(/_/g, ''))
        const colMap = {
          account: headers.indexOf('account'),
          claimId: headers.indexOf('claimid'),
          payer: headers.indexOf('payer'),
          dos: headers.indexOf('dos'),
          cptCode: headers.indexOf('cptcode'),
          revCode: headers.indexOf('revcode'),
          drg: headers.indexOf('drg'),
          billedAmount: headers.indexOf('billedamount'),
          allowedAmount: headers.indexOf('allowedamount'),
          paidAmount: headers.indexOf('paidamount'),
          carcCode: headers.indexOf('carccode'),
          rarcCode: headers.indexOf('rarccode'),
          groupCode: headers.indexOf('groupcode'),
          denialDate: headers.indexOf('denialdate'),
          authPresent: headers.indexOf('authpresent'),
          eligibility: headers.indexOf('eligibility'),
          productType: headers.indexOf('producttype')
        }

        // Validate essential headers
        if (
          colMap.account === -1 ||
          colMap.claimId === -1 ||
          colMap.billedAmount === -1 ||
          colMap.carcCode === -1
        ) {
          throw new Error("Missing required headers in CSV. Ensure Account, Claim_ID, Billed_Amount, and CARC_Code are present.")
        }

        const rawRecords = []
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i]
          if (row.length < headers.length) continue

          const val = (idx: number) => idx !== -1 && row[idx] ? row[idx] : ''
          const num = (idx: number) => {
            if (idx === -1 || !row[idx]) return 0
            return Number(row[idx].replace(/[^0-9.-]/g, '')) || 0
          }

          rawRecords.push({
            account: val(colMap.account),
            claim_id: val(colMap.claimId),
            payer: val(colMap.payer),
            dos: val(colMap.dos),
            cpt_code: val(colMap.cptCode),
            rev_code: val(colMap.revCode),
            drg: val(colMap.drg),
            billed_amount: num(colMap.billedAmount),
            allowed_amount: num(colMap.allowedAmount),
            paid_amount: num(colMap.paidAmount),
            carc_code: val(colMap.carcCode),
            rarc_code: val(colMap.rarcCode),
            group_code: val(colMap.groupCode),
            denial_date: val(colMap.denialDate),
            auth_present: val(colMap.authPresent).toLowerCase() === 'y' || val(colMap.authPresent).toLowerCase() === 'true',
            eligibility: val(colMap.eligibility),
            product_type: val(colMap.productType)
          })
        }

        if (rawRecords.length === 0) {
          throw new Error("No valid rows could be parsed from the CSV file.")
        }

        // Batch fetch matching rules and mappings for resolving CARC Codes
        const uniqueCarcs = Array.from(new Set(rawRecords.map(r => r.carc_code))).filter(Boolean)

        const { data: mappingsData } = await supabase
          .from('carc_rarc_mapping')
          .select('denial_code, category, subcategory')
          .in('denial_code', uniqueCarcs)

        const { data: rulesData } = await supabase
          .from('xr_rules')
          .select('denial_code, recommended_action')
          .in('denial_code', uniqueCarcs)

        const mappingMap = new Map(mappingsData?.map(m => [String(m.denial_code).trim().toUpperCase(), m]) || [])
        const ruleMap = new Map(rulesData?.map(r => [String(r.denial_code).trim().toUpperCase(), r.recommended_action]) || [])

        // Map resolved data and setup insert payloads
        const claimsToInsert = rawRecords.map(r => {
          const carcLookupKey = String(r.carc_code).trim().toUpperCase()
          const mapping = mappingMap.get(carcLookupKey)
          const rawCategory = mapping?.category || 'Other'
          const category = standardizeCategory(rawCategory)
          const rootCause = mapping?.subcategory || 'Other / Unknown'
          const recommendedAction = ruleMap.get(carcLookupKey) || 'Verify timely submission parameters and re-bill.'

          return {
            ...r,
            client_id: clientId,
            category,
            root_cause: rootCause,
            recommended_action: recommendedAction,
            status: 'open'
          }
        })

        // Chunk insert 100 records at a time
        const chunkSize = 100
        for (let i = 0; i < claimsToInsert.length; i += chunkSize) {
          const chunk = claimsToInsert.slice(i, i + chunkSize)
          const { error: insertError } = await supabase
            .from('denial_claims')
            .insert(chunk)

          if (insertError) {
            throw new Error("Failed to insert chunked denial claim records: " + insertError.message)
          }
        }

        setSuccess(`Successfully imported and processed ${claimsToInsert.length} denial claims.`)
        router.refresh()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to import CSV remit records."
        setError(msg)
      } finally {
        setParsing(false)
      }
    }

    reader.onerror = () => {
      setError("Failed to read the selected file.")
      setParsing(false)
    }

    reader.readAsText(file)
  }

  // Action status changes
  const handleUpdateStatus = async (claimId: string, newStatus: 'open' | 'appealed' | 'resolved' | 'dismissed') => {
    setUpdatingId(claimId)
    try {
      if (newStatus === 'dismissed') {
        const { error: delError } = await supabase
          .from('denial_claims')
          .delete()
          .eq('id', claimId)
        if (delError) throw delError
      } else {
        const { error: updateError } = await supabase
          .from('denial_claims')
          .update({ status: newStatus })
          .eq('id', claimId)
        if (updateError) throw updateError
      }
      router.refresh()
    } catch {
      setError("Failed to update claim status.")
    } finally {
      setUpdatingId(null)
    }
  }

  // Work Queue Local Filter & Pagination
  const filteredClaims = initialClaims.filter(c => {
    const matchesSearch =
      c.account?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.claim_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.payer?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesCategory =
      categoryFilter === 'All' ||
      standardizeCategory(c.category).toLowerCase() === categoryFilter.toLowerCase()

    return matchesSearch && matchesCategory
  })

  const limit = 50
  const totalPages = Math.ceil(filteredClaims.length / limit)
  const paginatedClaims = filteredClaims.slice((currentPage - 1) * limit, currentPage * limit)

  // Chart aggregation processing
  const getTopCarcData = () => {
    const counts: Record<string, number> = {}
    initialClaims.forEach(c => {
      if (c.carc_code) {
        counts[c.carc_code] = (counts[c.carc_code] || 0) + 1
      }
    })
    return Object.entries(counts)
      .map(([code, value]) => ({ code, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
  }

  const getTopPayersData = () => {
    const dollars: Record<string, number> = {}
    initialClaims.forEach(c => {
      if (c.payer) {
        const denied = (Number(c.billed_amount) || 0) - (Number(c.paid_amount) || 0)
        dollars[c.payer] = (dollars[c.payer] || 0) + denied
      }
    })
    return Object.entries(dollars)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
  }

  const getCategoryPieData = () => {
    const counts: Record<string, number> = {}
    initialClaims.forEach(c => {
      const cat = standardizeCategory(c.category)
      counts[cat] = (counts[cat] || 0) + 1
    })
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }

  const getProductTypeData = () => {
    const counts: Record<string, number> = {}
    initialClaims.forEach(c => {
      if (c.product_type) {
        counts[c.product_type] = (counts[c.product_type] || 0) + 1
      }
    })
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Colors
  const COLORS = ['#2563eb', '#0a1628', '#16a34a', '#d97706', '#dc2626', '#8b5cf6']

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans selection:bg-[#2563eb] selection:text-white">
      
      {/* Header */}
      <header className="bg-[#0a1628] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <Link 
              href="/dashboard" 
              className="text-gray-400 hover:text-white flex items-center space-x-2 text-sm font-semibold transition-colors"
            >
              <span>&larr;</span> <span>Back</span>
            </Link>
            <div className="flex items-center space-x-2">
              <span className="text-2xl font-bold font-display tracking-tight text-white">
                DenialLogic
              </span>
              <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                Beta
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-5">
            <span className="text-sm text-gray-400 font-medium">{userEmail}</span>
            <button 
              onClick={handleSignOut}
              className="text-sm font-semibold border border-white/20 hover:bg-white/10 px-4 py-2 rounded-md transition-all duration-300"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Body content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-10">
        
        {/* Alerts */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-950 font-bold hover:opacity-75">&times;</button>
          </div>
        )}
        {success && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 font-medium flex justify-between items-center">
            <span>{success}</span>
            <button onClick={() => setSuccess(null)} className="text-green-950 font-bold hover:opacity-75">&times;</button>
          </div>
        )}

        {/* Aggregates Summary cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm flex flex-col justify-between min-h-[110px]">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Denied Dollars</div>
            <div className="mt-2 text-3xl font-extrabold text-[#dc2626] font-display">
              {formatCurrency(totalDeniedDollars)}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm flex flex-col justify-between min-h-[110px]">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Claims Count</div>
            <div className="mt-2 text-3xl font-extrabold text-[#0a1628] font-display">{totalClaims}</div>
          </div>
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm flex flex-col justify-between min-h-[110px]">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Denial Rate</div>
            <div className="mt-2 text-3xl font-extrabold text-[#0a1628] font-display">{denialRate.toFixed(1)}%</div>
          </div>
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm flex flex-col justify-between min-h-[110px]">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Recoverable Opportunities</div>
            <div className="mt-2 text-3xl font-extrabold text-[#16a34a] font-display">{recoverableOpportunities}</div>
          </div>
        </div>

        {/* Upload card */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-8 shadow-sm">
          <h2 className="text-lg font-bold text-[#0a1628] font-display mb-4">
            Upload Denial File
          </h2>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileInput}
            className="hidden" 
            accept=".csv"
          />
          <div 
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={onButtonClick}
            className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ${
              dragActive 
                ? 'border-[#2563eb] bg-blue-50/50' 
                : 'border-gray-300 hover:border-gray-400 bg-gray-50/50'
            }`}
          >
            <svg className="h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
            </svg>
            <span className="text-sm font-bold text-gray-700">
              Drag and drop your denials CSV here, or click to browse
            </span>
            <span className="text-xs text-gray-400 mt-2">
              Supports Account, Claim_ID, Payer, Billed_Amount, Paid_Amount, CARC_Code, Product_Type...
            </span>
          </div>

          {parsing && (
            <div className="mt-4 flex items-center justify-center space-x-2 text-sm text-gray-500 font-semibold">
              <div className="w-4 h-4 border-2 border-t-transparent border-[#2563eb] rounded-full animate-spin"></div>
              <span>Processing and resolving rules codes...</span>
            </div>
          )}
        </div>

        {/* Analytics charts section */}
        {mounted && initialClaims.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-[#0a1628] font-display">
              Denial Analytics
            </h2>
            
            {/* Row 1 */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Top 5 CARCs */}
              <div className="bg-white p-6 rounded-xl border border-[#e2e8f0] shadow-sm">
                <h3 className="font-bold text-sm text-gray-900 mb-4">Top 5 Denial Reasons by CARC Code</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getTopCarcData()}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="code" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="value" name="Claims" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top 5 Payers */}
              <div className="bg-white p-6 rounded-xl border border-[#e2e8f0] shadow-sm">
                <h3 className="font-bold text-sm text-gray-900 mb-4">Top 5 Payers by Denied Dollars</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getTopPayersData()}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(v: number) => formatCurrency(v)} />
                      <Tooltip formatter={(v: unknown) => formatCurrency(Number(v))} />
                      <Legend />
                      <Bar dataKey="value" name="Denied Amount" fill="#0a1628" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Row 2 */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Category Pie */}
              <div className="bg-white p-6 rounded-xl border border-[#e2e8f0] shadow-sm">
                <h3 className="font-bold text-sm text-gray-900 mb-4">Denial Categories Breakdown</h3>
                <div className="h-80 flex items-center justify-center">
                  <div className="w-[60%] h-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={getCategoryPieData()}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {getCategoryPieData().map((_entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-[40%] text-xs space-y-2 font-medium">
                    {getCategoryPieData().map((entry, index) => (
                      <div key={entry.name} className="flex items-center space-x-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                        <span className="text-gray-600 truncate">{entry.name}</span>
                        <span className="text-gray-900 font-bold ml-auto">{entry.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Product breakdown */}
              <div className="bg-white p-6 rounded-xl border border-[#e2e8f0] shadow-sm">
                <h3 className="font-bold text-sm text-gray-900 mb-4">Product Type Breakdown</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getProductTypeData()}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="value" name="Claims" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Work Queue section */}
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <h2 className="text-xl font-bold text-[#0a1628] font-display">
              Denial Work Queue
            </h2>
            <div className="flex flex-wrap gap-3">
              {/* Search box */}
              <input
                type="text"
                placeholder="Search Account, Claim ID, Payer..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setCurrentPage(1)
                }}
                className="block w-64 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] transition-all"
              />
              {/* Category selector */}
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="block rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] transition-all bg-white"
              >
                <option value="All">All Categories</option>
                <option value="Eligibility">Eligibility</option>
                <option value="Duplicate">Duplicate</option>
                <option value="Timely Filing">Timely Filing</option>
                <option value="Medical Necessity">Medical Necessity</option>
                <option value="Authorization">Authorization</option>
                <option value="Patient Responsibility">Patient Responsibility</option>
                <option value="Contractual">Contractual</option>
                <option value="COB">COB</option>
                <option value="Billing Error">Billing Error</option>
                <option value="Coverage">Coverage</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          {/* Table list */}
          <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-[#0a1628]/5">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Account / Claim ID</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Payer / Product</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">DOS</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">CPT</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Billed</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Denied</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">CARC / Category</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Action Plan</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedClaims.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-6 py-12 text-center text-sm text-gray-500 font-semibold">
                        No denial claims in the current queue matching filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedClaims.map(c => {
                      const denied = (Number(c.billed_amount) || 0) - (Number(c.paid_amount) || 0)
                      return (
                        <tr key={c.id} className="hover:bg-gray-50/50 transition-colors text-sm">
                          <td className="px-6 py-4">
                            <div className="font-bold text-gray-900">{c.account}</div>
                            <div className="text-xs text-gray-400 font-medium">{c.claim_id}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-semibold text-gray-900">{c.payer}</div>
                            <div className="text-xs text-gray-400 font-medium">{c.product_type}</div>
                          </td>
                          <td className="px-6 py-4 text-gray-500">{c.dos}</td>
                          <td className="px-6 py-4 text-gray-500">{c.cpt_code}</td>
                          <td className="px-6 py-4 text-right font-medium text-gray-900">{formatCurrency(c.billed_amount)}</td>
                          <td className="px-6 py-4 text-right font-bold text-[#dc2626]">{formatCurrency(denied)}</td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-inset ring-amber-600/20">
                              {c.carc_code}
                            </span>
                            <div className="text-xs text-gray-500 mt-1 font-medium">{c.category}</div>
                          </td>
                          <td className="px-6 py-4 max-w-xs">
                            <div className="font-bold text-xs text-gray-900">{c.root_cause}</div>
                            <div className="text-xs text-gray-500 truncate" title={c.recommended_action}>
                              {c.recommended_action}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${
                              c.status === 'resolved' 
                                ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20' 
                                : c.status === 'appealed'
                                ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20'
                                : 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20'
                            }`}>
                              {c.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right whitespace-nowrap">
                            <div className="flex justify-end items-center gap-1.5">
                              <button
                                onClick={() => handleUpdateStatus(c.id, 'appealed')}
                                disabled={updatingId === c.id || c.status === 'appealed'}
                                className="bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100/80 disabled:opacity-40 rounded px-2 py-1 text-xs font-semibold transition-all duration-200 shadow-sm"
                              >
                                Appeal
                              </button>
                              <button
                                onClick={() => handleUpdateStatus(c.id, 'resolved')}
                                disabled={updatingId === c.id || c.status === 'resolved'}
                                className="bg-green-50 text-green-700 border border-green-200 hover:bg-green-100/80 disabled:opacity-40 rounded px-2 py-1 text-xs font-semibold transition-all duration-200 shadow-sm"
                              >
                                Resolve
                              </button>
                              <button
                                onClick={() => handleUpdateStatus(c.id, 'dismissed')}
                                disabled={updatingId === c.id}
                                className="bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100/80 disabled:opacity-40 rounded px-2 py-1 text-xs font-semibold transition-all duration-200 shadow-sm"
                              >
                                Dismiss
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">
                  Showing {(currentPage - 1) * limit + 1} to {Math.min(currentPage * limit, filteredClaims.length)} of {filteredClaims.length} records
                </span>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 border border-gray-300 rounded text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 border border-gray-300 rounded text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  )
}
