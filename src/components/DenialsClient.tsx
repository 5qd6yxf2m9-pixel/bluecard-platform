'use client'

import React, { useState, useRef, useEffect, Fragment } from 'react'
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
  status: 'open' | 'appealed' | 'resolved' | 'dismissed' | 'in_appeal';
  appeal_date?: string | null;
  appeal_reason?: string | null;
  appeal_outcome?: string | null;
  recovered_amount?: number | null;
  resolution_date?: string | null;
  assigned_to?: string | null;
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

export const formatDOS = (dosStr: string | null | undefined): string => {
  if (!dosStr) return 'N/A'
  try {
    const parts = dosStr.split('-')
    if (parts.length === 3) {
      // Handles YYYY-MM-DD
      const y = parts[0].slice(-2)
      const m = parts[1]
      const d = parts[2]
      return `${m}/${d}/${y}`
    }
    const date = new Date(dosStr)
    if (isNaN(date.getTime())) {
      return dosStr
    }
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    const yy = String(date.getFullYear()).slice(-2)
    return `${mm}/${dd}/${yy}`
  } catch {
    return dosStr
  }
}

export interface AppealAnalyticsProps {
  hasAppeals: boolean;
  successRate: number;
  totalAppeals: number;
  successfulAppeals: number;
  avgDays: number;
  hasAvgDays: boolean;
  totalRecoveredVal: number;
  preSum: number;
  postSum: number;
}

interface DenialsClientProps {
  clientId: string;
  userEmail: string;
  initialClaims: DenialClaim[];
  appealAnalytics?: AppealAnalyticsProps;
}

export interface DenialBatch {
  id: string;
  name: string;
  status: 'processing' | 'completed' | 'error';
  total_claims: number;
  total_denied_dollars: number;
  recoverable_amount: number;
  created_at: string;
}

export function DenialsClient({ clientId, userEmail, initialClaims, appealAnalytics }: DenialsClientProps) {
  const router = useRouter()
  const supabase = createClient()

  const [activeTopTab, setActiveTopTab] = useState<'workqueue' | 'analytics' | 'upload'>('workqueue')
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
  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'open' | 'appealed' | 'resolved' | 'dismissed'>('open')
  const [denialSubTab, setDenialSubTab] = useState<'upload' | 'previous_uploads'>('upload')
  const [claims, setClaims] = useState<DenialClaim[]>(initialClaims)
  const [batches, setBatches] = useState<DenialBatch[]>([])

  const [appealingClaimId, setAppealingClaimId] = useState<string | null>(null)
  const [selectedAppealReason, setSelectedAppealReason] = useState<string>('')
  const [appealNotes, setAppealNotes] = useState<string>('')
  const [appealError, setAppealError] = useState<string | null>(null)

  const [resolvingClaimId, setResolvingClaimId] = useState<string | null>(null)
  const [appealOutcome, setAppealOutcome] = useState<string>('approved')
  const [recoveredAmount, setRecoveredAmount] = useState<number>(0)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchDenialBatches = async () => {
    const { data, error: fetchErr } = await supabase
      .from('denial_batches')
      .select('id, name, status, total_claims, total_denied_dollars, recoverable_amount, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (!fetchErr && data) {
      setBatches(data as DenialBatch[])
    }
  }

  useEffect(() => {
    setMounted(true)
    fetchDenialBatches()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setClaims(initialClaims)
  }, [initialClaims])

  const fetchDenialClaims = async () => {
    const { data, error: fetchErr } = await supabase
      .from('denial_claims')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (!fetchErr && data) {
      setClaims(data as DenialClaim[])
    }
  }

  // Dynamic statistics calculations
  const totalBilled = claims.reduce((sum, c) => sum + (Number(c.billed_amount) || 0), 0)
  const totalPaid = claims.reduce((sum, c) => sum + (Number(c.paid_amount) || 0), 0)
  const totalDeniedDollars = totalBilled - totalPaid

  const openCount = claims.filter(c => c.status === 'open' || !c.status).length
  const appealedCount = claims.filter(c => c.status === 'appealed' || c.status === 'in_appeal').length
  const resolvedCount = claims.filter(c => c.status === 'resolved').length
  const dismissedCount = claims.filter(c => c.status === 'dismissed').length

  const totalRecovered = claims.reduce((sum, c) => sum + (c.recovered_amount && Number(c.recovered_amount) > 0 ? Number(c.recovered_amount) : 0), 0)

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

    const parseDosDate = (dosStr: string | null | undefined): Date | null => {
      if (!dosStr) return null
      const cleaned = dosStr.trim()
      const d = new Date(cleaned)
      if (!isNaN(d.getTime())) return d
      const parts = cleaned.split('/')
      if (parts.length === 3) {
        const m = parseInt(parts[0], 10) - 1
        const d = parseInt(parts[1], 10)
        let y = parseInt(parts[2], 10)
        if (y < 100) {
          y += y >= 50 ? 1900 : 2000
        }
        const customD = new Date(y, m, d)
        if (!isNaN(customD.getTime())) return customD
      }
      return null
    }

    const reader = new FileReader()
    reader.onload = async (e) => {
      let createdBatchId: string | null = null
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

        // Generate batch name from min and max DOS
        const dosDates = rawRecords
          .map(r => parseDosDate(r.dos))
          .filter((d): d is Date => d !== null)
          .sort((a, b) => a.getTime() - b.getTime())

        let batchName = ''
        if (dosDates.length > 0) {
          const formatDate = (date: Date) => {
            const mm = String(date.getMonth() + 1).padStart(2, '0')
            const dd = String(date.getDate()).padStart(2, '0')
            const yy = String(date.getFullYear()).slice(-2)
            return `${mm}/${dd}/${yy}`
          }
          batchName = `Denials: ${formatDate(dosDates[0])} - ${formatDate(dosDates[dosDates.length - 1])}`
        } else {
          const now = new Date()
          const mm = String(now.getMonth() + 1).padStart(2, '0')
          const dd = String(now.getDate()).padStart(2, '0')
          const yy = String(now.getFullYear()).slice(-2)
          batchName = `Denial Upload ${mm}/${dd}/${yy}`
        }

        // Create the Denial Batch record
        const { data: batchData, error: batchError } = await supabase
          .from('denial_batches')
          .insert({
            client_id: clientId,
            name: batchName,
            status: 'processing',
            total_claims: rawRecords.length,
            total_denied_dollars: rawRecords.reduce((sum, r) => sum + (r.billed_amount || 0), 0),
            recoverable_amount: rawRecords.reduce((sum, r) => sum + ((r.billed_amount || 0) - (r.paid_amount || 0)), 0),
            created_at: new Date().toISOString()
          })
          .select('id')
          .single()

        if (batchError || !batchData) {
          throw new Error("Failed to initialize denial batch: " + (batchError?.message || "Unknown error"))
        }

        createdBatchId = batchData.id
        await fetchDenialBatches()

        // Fetch matching rules and mappings for resolving CARC Codes
        const { data: carcData } = await supabase.from('carc_rarc_mapping').select('carc_code, category, subcategory, carc_description')
        const carcMap = new Map((carcData || []).map(c => [String(c.carc_code).trim(), c]))

        const { data: xrData } = await supabase.from('xr_rules').select('denial_code, root_cause, recommended_action')
        const xrMap = new Map((xrData || []).map(x => [String(x.denial_code).trim(), x]))

        // Map resolved data and setup insert payloads
        const claimsToInsert = rawRecords.map(r => {
          const carcKey = String(r.carc_code).trim()
          const carcInfo = carcMap.get(carcKey)
          const xrInfo = xrMap.get(carcKey)

          const rawCategory = carcInfo?.category ?? 'Other'
          const category = standardizeCategory(rawCategory)
          const rootCause = xrInfo?.root_cause ?? carcInfo?.carc_description ?? 'See action plan'
          const recommendedAction = xrInfo?.recommended_action || null

          return {
            ...r,
            client_id: clientId,
            batch_id: createdBatchId,
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

        // Update batch status to completed
        await supabase
          .from('denial_batches')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', createdBatchId)

        setSuccess(`Successfully imported and processed ${claimsToInsert.length} denial claims.`)
        await fetchDenialClaims()
        await fetchDenialBatches()
      } catch {
        if (createdBatchId) {
          await supabase
            .from('denial_batches')
            .update({ status: 'error' })
            .eq('id', createdBatchId)
          await fetchDenialBatches()
        }
        setError("Failed to import CSV remit records.")
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
      const { error: updateError } = await supabase
        .from('denial_claims')
        .update({ status: newStatus })
        .eq('id', claimId)
      if (updateError) throw updateError
      
      await fetchDenialClaims()
    } catch {
      setError("Failed to update claim status.")
    } finally {
      setUpdatingId(null)
    }
  }

  const handleSubmitAppeal = async () => {
    if (!appealingClaimId) return
    if (!selectedAppealReason) {
      setAppealError("Please select an appeal reason")
      return
    }
    if (selectedAppealReason === 'Other - See Notes' && !appealNotes.trim()) {
      setAppealError("Notes are required when 'Other - See Notes' is selected")
      return
    }
    setUpdatingId(appealingClaimId)
    try {
      const todayStr = new Date().toISOString().split('T')[0]
      const reasonToSave = appealNotes.trim()
        ? `${selectedAppealReason} | Note: ${appealNotes.trim()}`
        : selectedAppealReason

      const { error: updateError } = await supabase
        .from('denial_claims')
        .update({
          status: 'in_appeal',
          appeal_date: todayStr,
          appeal_reason: reasonToSave
        })
        .eq('id', appealingClaimId)
      if (updateError) throw updateError

      setAppealingClaimId(null)
      setSelectedAppealReason('')
      setAppealNotes('')
      setAppealError(null)
      await fetchDenialClaims()
    } catch {
      setAppealError("Failed to submit appeal.")
    } finally {
      setUpdatingId(null)
    }
  }

  const handleSubmitResolve = async () => {
    if (!resolvingClaimId) return
    setUpdatingId(resolvingClaimId)
    try {
      const todayStr = new Date().toISOString().split('T')[0]
      const { error: updateError } = await supabase
        .from('denial_claims')
        .update({
          status: 'resolved',
          appeal_outcome: appealOutcome,
          recovered_amount: recoveredAmount,
          resolution_date: todayStr
        })
        .eq('id', resolvingClaimId)
      if (updateError) throw updateError

      setResolvingClaimId(null)
      setAppealOutcome('approved')
      setRecoveredAmount(0)
      await fetchDenialClaims()
    } catch {
      setError("Failed to resolve claim.")
    } finally {
      setUpdatingId(null)
    }
  }

  const formatAppealDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return 'N/A'
    try {
      const parts = dateStr.split('-')
      if (parts.length === 3) {
        const y = parts[0].slice(-2)
        const m = parts[1]
        const d = parts[2]
        return `${m}/${d}/${y}`
      }
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) {
        return dateStr
      }
      const mm = String(date.getMonth() + 1).padStart(2, '0')
      const dd = String(date.getDate()).padStart(2, '0')
      const yy = String(date.getFullYear()).slice(-2)
      return `${mm}/${dd}/${yy}`
    } catch {
      return dateStr
    }
  }

  const renderOutcomeBadge = (outcome: string | null | undefined) => {
    if (!outcome) return null
    const outLower = outcome.toLowerCase().trim()
    if (outLower === 'approved') {
      return (
        <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-xs font-bold text-green-700 ring-1 ring-inset ring-green-600/20">
          Approved
        </span>
      )
    }
    if (outLower === 'partially_approved') {
      return (
        <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-600/20">
          Partially Approved
        </span>
      )
    }
    if (outLower === 'denied') {
      return (
        <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700 ring-1 ring-inset ring-red-600/20">
          Denied
        </span>
      )
    }
    return (
      <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-0.5 text-xs font-bold text-gray-700 ring-1 ring-inset ring-gray-600/20">
        {outcome}
      </span>
    )
  }

  const renderAging = (denialDateStr: string | null | undefined) => {
    if (!denialDateStr) return <span className="text-gray-400">N/A</span>
    try {
      const days = Math.floor((Date.now() - new Date(denialDateStr).getTime()) / (1000 * 60 * 60 * 24))
      if (isNaN(days)) return <span className="text-gray-400">N/A</span>
      
      if (days <= 30) {
        return <span className="text-green-600 font-semibold">0-30d</span>
      } else if (days <= 60) {
        return <span className="text-amber-600 font-semibold">31-60d</span>
      } else if (days <= 90) {
        return <span className="text-orange-600 font-semibold">61-90d</span>
      } else {
        return <span className="text-red-600 font-semibold">90+d</span>
      }
    } catch {
      return <span className="text-gray-400">N/A</span>
    }
  }

  // Work Queue Local Filter & Pagination
  const filteredClaims = claims.filter(c => {
    // Tab status filter
    const matchesStatus =
      (activeTab === 'open' && (c.status === 'open' || !c.status)) ||
      (activeTab === 'appealed' && (c.status === 'appealed' || c.status === 'in_appeal')) ||
      (activeTab === 'resolved' && c.status === 'resolved') ||
      (activeTab === 'dismissed' && c.status === 'dismissed')

    // Search filter
    const matchesSearch =
      c.account?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.claim_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.payer?.toLowerCase().includes(searchTerm.toLowerCase())

    // Category filter
    const matchesCategory =
      categoryFilter === 'All' ||
      standardizeCategory(c.category).toLowerCase() === categoryFilter.toLowerCase()

    return matchesStatus && matchesSearch && matchesCategory
  })

  const limit = 50
  const totalPages = Math.ceil(filteredClaims.length / limit)
  const paginatedClaims = filteredClaims.slice((currentPage - 1) * limit, currentPage * limit)

  // Chart aggregation processing
  const getTopCarcData = () => {
    const counts: Record<string, number> = {}
    claims.forEach(c => {
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
    claims.forEach(c => {
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
    claims.forEach(c => {
      const cat = standardizeCategory(c.category)
      counts[cat] = (counts[cat] || 0) + 1
    })
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }

  const getProductTypeData = () => {
    const counts: Record<string, number> = {}
    claims.forEach(c => {
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

        {/* Top-Level Tabs */}
        <div className="bg-white border-b border-gray-200 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 -mt-10 mb-6">
          <nav className="-mb-px flex space-x-8" aria-label="Top Tabs">
            <button
              onClick={() => setActiveTopTab('workqueue')}
              className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-semibold transition-colors ${
                activeTopTab === 'workqueue'
                  ? 'border-[#0a1628] text-[#0a1628]'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              Work Queue
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


        {"/* TAB 1: WORK QUEUE */"}
        <div style={{ display: activeTopTab === 'workqueue' ? 'block' : 'none' }} className="space-y-6">
          {/* Compact Stat Bar */}
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 md:px-6 md:py-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1 text-center md:text-left">
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Denied</div>
              <div className="mt-1 text-lg font-bold text-[#dc2626] font-display">{formatCurrency(totalDeniedDollars)}</div>
            </div>
            <div className="hidden md:block h-8 w-px bg-gray-200" />
            <div className="flex-1 text-center md:text-left">
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Open Claims</div>
              <div className="mt-1 text-lg font-bold text-[#d97706] font-display">{openCount}</div>
            </div>
            <div className="hidden md:block h-8 w-px bg-gray-200" />
            <div className="flex-1 text-center md:text-left">
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">In Appeal</div>
              <div className="mt-1 text-lg font-bold text-[#2563eb] font-display">{appealedCount}</div>
            </div>
            <div className="hidden md:block h-8 w-px bg-gray-200" />
            <div className="flex-1 text-center md:text-left">
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Resolved</div>
              <div className="mt-1 text-lg font-bold text-[#16a34a] font-display">{resolvedCount}</div>
            </div>
            <div className="hidden md:block h-8 w-px bg-gray-200" />
            <div className="flex-1 text-center md:text-left">
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Recovered</div>
              <div className="mt-1 text-lg font-bold text-[#16a34a] font-display">{formatCurrency(totalRecovered)}</div>
            </div>
          </div>
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

          {/* Status Tabs */}
          <div className="border-b border-gray-200 pb-px">
            <nav className="-mb-px flex space-x-8 overflow-x-auto no-scrollbar" aria-label="Tabs">
              {[
                { id: 'open', label: 'Open', count: openCount },
                { id: 'appealed', label: 'In Appeal', count: appealedCount },
                { id: 'resolved', label: 'Resolved', count: resolvedCount },
                { id: 'dismissed', label: 'Dismissed', count: dismissedCount }
              ].map((tab) => {
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id as 'open' | 'appealed' | 'resolved' | 'dismissed')
                      setCurrentPage(1)
                      setExpandedClaimId(null)
                    }}
                    className={`
                      group inline-flex items-center py-4 px-1 border-b-2 font-bold text-sm transition-all focus:outline-none whitespace-nowrap
                      ${isActive
                        ? 'border-[#2563eb] text-[#2563eb]'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                    `}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`
                        ml-3 py-0.5 px-2 rounded-full text-xs font-bold transition-all
                        ${isActive
                          ? 'bg-blue-100 text-[#2563eb]'
                          : 'bg-gray-100 text-gray-900 group-hover:bg-gray-200'}
                      `}
                    >
                      {tab.count}
                    </span>
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Table list */}
          <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-sm overflow-hidden">
            <div>
              <table className={`min-w-full divide-y divide-gray-200 ${activeTab !== 'open' ? 'table-fixed' : ''}`}>
                <thead className="bg-[#0a1628]/5">
                  <tr>
                    {(activeTab === 'open' || activeTab === 'resolved') && (
                      <th className="w-8 p-0 py-4 text-center"></th>
                    )}
                    <th className={`${activeTab !== 'open' ? 'w-[15%]' : ''} px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider`}>Account</th>
                    <th className={`${activeTab !== 'open' ? 'w-[10%]' : ''} px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider`}>Payer</th>
                    <th className={`${activeTab !== 'open' ? 'w-[9%]' : ''} px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider`}>DOS</th>
                    <th className={`${activeTab !== 'open' ? 'w-[7%]' : ''} px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider`}>Aging</th>
                    <th className={`${activeTab !== 'open' ? 'w-[9%]' : ''} px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider`}>Denied</th>
                    <th className={`${activeTab !== 'open' ? 'w-[10%]' : ''} px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider`}>CARC</th>

                    {activeTab === 'resolved' && (
                      <>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Outcome</th>
                        <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Recovered</th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Resolution Date</th>
                      </>
                    )}

                    {activeTab !== 'resolved' && (
                      <th className={`${activeTab !== 'open' ? 'w-[15%]' : ''} px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider`}>Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedClaims.length === 0 ? (
                    <tr>
                      <td colSpan={activeTab === 'resolved' ? 10 : (activeTab === 'appealed' || activeTab === 'dismissed' ? 7 : 8)} className="px-6 py-12 text-center text-sm text-gray-500 font-semibold">
                        No denial claims in the current queue matching filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedClaims.map(c => {
                      const denied = (Number(c.billed_amount) || 0) - (Number(c.paid_amount) || 0)
                      return (
                        <Fragment key={c.id}>
                          <tr className="hover:bg-gray-50/50 transition-colors text-xs md:text-sm">
                            {(activeTab === 'open' || activeTab === 'resolved') && (
                              <td className="w-8 p-0 py-4 text-center">
                                <button
                                  onClick={() => setExpandedClaimId(expandedClaimId === c.id ? null : c.id)}
                                  className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none inline-flex items-center justify-center"
                                >
                                  <svg
                                    className={`w-4 h-4 transform transition-transform duration-200 ${expandedClaimId === c.id ? 'rotate-90' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>
                              </td>
                            )}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                {(activeTab === 'appealed' || activeTab === 'dismissed') && (
                                  <button
                                    onClick={() => setExpandedClaimId(expandedClaimId === c.id ? null : c.id)}
                                    className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none inline-flex items-center justify-center mr-1"
                                  >
                                    <svg
                                      className={`w-4 h-4 transform transition-transform duration-200 ${expandedClaimId === c.id ? 'rotate-90' : ''}`}
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                      strokeWidth="2.5"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                    </svg>
                                  </button>
                                )}
                                <div>
                                  <div className="font-bold text-gray-900">{c.account}</div>
                                  <div className="text-xs text-gray-400 font-medium">{c.claim_id}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-semibold text-gray-900">{c.payer}</div>
                              <div className="text-xs text-gray-400 font-medium">{c.product_type}</div>
                            </td>
                            <td className="px-6 py-4 text-gray-500 whitespace-nowrap">{formatDOS(c.dos)}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{renderAging(c.denial_date)}</td>
                            <td className="px-6 py-4 text-right font-bold text-[#dc2626]">{formatCurrency(denied)}</td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-inset ring-amber-600/20">
                                {c.carc_code}
                              </span>
                              {c.category && c.category.toLowerCase() !== 'other' && c.category.toLowerCase() !== 'unknown' && (
                                <div className="text-xs text-gray-500 mt-1 font-medium">{c.category}</div>
                              )}
                            </td>
                            
                            {activeTab === 'resolved' && (
                              <>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  {renderOutcomeBadge(c.appeal_outcome)}
                                </td>
                                <td className="px-6 py-4 text-right font-bold text-green-600 whitespace-nowrap">
                                  {c.recovered_amount && Number(c.recovered_amount) > 0 
                                    ? formatCurrency(Number(c.recovered_amount)) 
                                    : ''}
                                </td>
                                <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                                  {c.resolution_date ? formatAppealDate(c.resolution_date) : ''}
                                </td>
                              </>
                            )}

                            {activeTab !== 'resolved' && (
                              <td className="px-6 py-4 text-right whitespace-nowrap">
                                <div className="flex justify-end items-center gap-1.5">
                                  {activeTab === 'open' && (
                                    <>
                                      <button
                                        onClick={() => {
                                          setAppealingClaimId(c.id)
                                          setSelectedAppealReason('')
                                          setAppealNotes('')
                                          setAppealError(null)
                                        }}
                                        disabled={updatingId === c.id}
                                        className="bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100/80 disabled:opacity-40 rounded px-2 py-1 text-xs font-semibold transition-all duration-200 shadow-sm"
                                      >
                                        Appeal
                                      </button>
                                      <button
                                        onClick={() => {
                                          setResolvingClaimId(c.id)
                                          setAppealOutcome('approved')
                                          setRecoveredAmount(0)
                                        }}
                                        disabled={updatingId === c.id}
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
                                    </>
                                  )}
                                  {activeTab === 'appealed' && (
                                    <>
                                      <button
                                        onClick={() => {
                                          setResolvingClaimId(c.id)
                                          setAppealOutcome('approved')
                                          setRecoveredAmount(0)
                                        }}
                                        disabled={updatingId === c.id}
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
                                    </>
                                  )}
                                  {activeTab === 'dismissed' && (
                                    <button
                                      onClick={() => handleUpdateStatus(c.id, 'open')}
                                      disabled={updatingId === c.id}
                                      className="bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100/80 disabled:opacity-40 rounded px-2 py-1 text-xs font-semibold transition-all duration-200 shadow-sm"
                                    >
                                      Reopen
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                          
                          {/* Expanded Row */}
                          {expandedClaimId === c.id && (
                            <tr className="bg-gray-50/50">
                              <td colSpan={activeTab === 'resolved' ? 10 : (activeTab === 'appealed' || activeTab === 'dismissed' ? 7 : 8)} className="px-6 py-5 border-b border-gray-200">
                                {activeTab === 'appealed' && c.appeal_reason && (
                                  <div className="mb-5 w-full bg-[#eff6ff] text-[#0a1628] p-[12px_16px] rounded-[12px] text-[14px]">
                                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">
                                      Appeal Reason:
                                    </div>
                                    <div className="text-[#0a1628] font-normal">
                                      {c.appeal_reason}
                                    </div>
                                  </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-xs md:text-sm">
                                  
                                  {/* Section 1: Financials */}
                                  <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm space-y-2">
                                    <div className="font-bold text-gray-700 border-b pb-1 mb-2">Financial Breakdown</div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500 font-medium">Billed Amount:</span>
                                      <span className="font-semibold text-gray-900">{formatCurrency(c.billed_amount)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500 font-medium">Allowed Amount:</span>
                                      <span className="font-semibold text-gray-900">{formatCurrency(c.allowed_amount)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500 font-medium">Paid Amount:</span>
                                      <span className="font-semibold text-gray-900">{formatCurrency(c.paid_amount)}</span>
                                    </div>
                                    <div className="flex justify-between border-t pt-1 mt-1">
                                      <span className="text-gray-700 font-bold">Total Denied:</span>
                                      <span className="font-extrabold text-[#dc2626]">{formatCurrency(denied)}</span>
                                    </div>
                                  </div>

                                  {/* Section 2: Codes */}
                                  <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm space-y-2">
                                    <div className="font-bold text-gray-700 border-b pb-1 mb-2">Code Details</div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500 font-medium">CPT Code:</span>
                                      <span className="font-semibold text-gray-900">{c.cpt_code || 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500 font-medium">Rev Code:</span>
                                      <span className="font-semibold text-gray-900">{c.rev_code || 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500 font-medium">DRG:</span>
                                      <span className="font-semibold text-gray-900">{c.drg || 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500 font-medium">Denial Date:</span>
                                      <span className="font-semibold text-gray-900">{c.denial_date || 'N/A'}</span>
                                    </div>
                                  </div>

                                  {/* Section 3: Adjudication */}
                                  <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm space-y-2">
                                    <div className="font-bold text-gray-700 border-b pb-1 mb-2">Adjudication & Auth</div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500 font-medium">Auth Present:</span>
                                      <span className={`font-semibold ${c.auth_present ? 'text-green-600' : 'text-red-500'}`}>
                                        {c.auth_present ? 'Yes' : 'No'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500 font-medium">Eligibility:</span>
                                      <span className="font-semibold text-gray-900">{c.eligibility || 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-500 font-medium">Group Code:</span>
                                      <span className="font-semibold text-gray-900">{c.group_code || 'N/A'}</span>
                                    </div>
                                  </div>

                                  {/* Section 4: Resolution details */}
                                  <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm space-y-2">
                                    <div className="font-bold text-gray-700 border-b pb-1 mb-2">Root Cause & Plan</div>
                                    <div>
                                      <span className="text-gray-500 font-semibold block text-[10px] uppercase tracking-wider">Root Cause:</span>
                                      {!c.root_cause || c.root_cause.trim() === '' || c.root_cause.toLowerCase() === 'other / unknown' ? (
                                        <span className="text-gray-400 italic block">Pending CARC mapping</span>
                                      ) : (
                                        <span className="text-gray-900 font-bold block">{c.root_cause}</span>
                                      )}
                                    </div>
                                    <div className="mt-2">
                                      <span className="text-gray-500 font-semibold block text-[10px] uppercase tracking-wider">Action Plan:</span>
                                      <span className="text-gray-700 font-medium block leading-relaxed">{c.recommended_action}</span>
                                    </div>
                                  </div>

                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
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

        </div>

        {"/* TAB 2: ANALYTICS */"}
        <div style={{ display: activeTopTab === 'analytics' ? 'block' : 'none' }} className="space-y-10">
        {/* Appeal Analytics Section */}
        {appealAnalytics?.hasAppeals && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm space-y-6">
            <div>
              <h2 className="text-[18px] font-bold text-[#0a1628] font-display">Appeal Analytics</h2>
              <p className="text-xs text-gray-500 mt-1">Based on submitted appeals</p>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
              {/* Card 1 — Appeal Success Rate */}
              <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm flex flex-col justify-between min-h-[110px]">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Appeal Success Rate</div>
                <div 
                  className="mt-2 text-2xl md:text-3xl font-extrabold font-display"
                  style={{ color: appealAnalytics.successRate >= 50 ? '#16a34a' : '#dc2626' }}
                >
                  {appealAnalytics.successRate.toFixed(1)}%
                </div>
                <div className="text-[10px] text-gray-400 font-semibold mt-1">
                  {appealAnalytics.successfulAppeals} of {appealAnalytics.totalAppeals} appeals successful
                </div>
              </div>

              {/* Card 2 — Avg Days to Resolution */}
              <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm flex flex-col justify-between min-h-[110px]">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg Days to Resolution</div>
                <div 
                  className="mt-2 text-2xl md:text-3xl font-extrabold font-display"
                  style={{ 
                    color: !appealAnalytics.hasAvgDays 
                      ? '#0a1628' 
                      : appealAnalytics.avgDays <= 30 
                        ? '#16a34a' 
                        : appealAnalytics.avgDays <= 60 
                          ? '#d97706' 
                          : '#dc2626' 
                  }}
                >
                  {appealAnalytics.hasAvgDays ? `${appealAnalytics.avgDays} days` : 'N/A'}
                </div>
                <div className="text-[10px] text-gray-400 font-semibold mt-1">From appeal to resolution</div>
              </div>

              {/* Card 3 — Total Recovered */}
              <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm flex flex-col justify-between min-h-[110px]">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Recovered</div>
                <div className="mt-2 text-2xl md:text-3xl font-extrabold text-[#16a34a] font-display">
                  {formatCurrency(appealAnalytics.totalRecoveredVal)}
                </div>
                <div className="text-[10px] text-gray-400 font-semibold mt-1">From appealed claims</div>
              </div>

              {/* Card 4 — Pre vs Post Appeal */}
              <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm flex flex-col justify-between min-h-[110px]">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pre vs Post Appeal</div>
                <div className="mt-2 flex flex-col text-sm font-semibold text-[#0a1628] leading-tight">
                  <span>Before: {formatCurrency(appealAnalytics.preSum)}</span>
                  <span>After: {formatCurrency(appealAnalytics.postSum)}</span>
                </div>
                <div className="text-[10px] text-gray-400 font-semibold mt-1">Denied amount vs recovered</div>
              </div>
            </div>
          </div>
        )}


        {/* Analytics charts section */}
        {mounted && claims.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-[#0a1628] font-display">
              Denial Analytics
            </h2>
            {/* 2x2 Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Top 5 CARCs */}
              <div className="bg-white p-4 rounded-xl border border-[#e2e8f0] shadow-sm">
                <h3 className="font-bold text-xs text-gray-900 mb-3">Top 5 Denial Reasons by CARC Code</h3>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={getTopCarcData()}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="code" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0a1628', border: 'none', borderRadius: '6px', color: '#ffffff', fontSize: '11px' }}
                        labelStyle={{ color: '#ffffff', fontWeight: 'bold' }}
                        itemStyle={{ color: '#93c5fd' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} iconSize={8} />
                      <Bar dataKey="value" name="Claims" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top 5 Payers */}
              <div className="bg-white p-4 rounded-xl border border-[#e2e8f0] shadow-sm">
                <h3 className="font-bold text-xs text-gray-900 mb-3">Top 5 Payers by Denied Dollars</h3>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={getTopPayersData()} margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v: number) => formatCurrency(v)} tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(v: unknown) => formatCurrency(Number(v))}
                        contentStyle={{ backgroundColor: '#0a1628', border: 'none', borderRadius: '6px', color: '#ffffff', fontSize: '11px' }}
                        labelStyle={{ color: '#ffffff', fontWeight: 'bold' }}
                        itemStyle={{ color: '#93c5fd' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} iconSize={8} />
                      <Bar dataKey="value" name="Denied Amount" fill="#0a1628" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Category Pie */}
              <div className="bg-white p-4 rounded-xl border border-[#e2e8f0] shadow-sm">
                <h3 className="font-bold text-xs text-gray-900 mb-3">Denial Categories Breakdown</h3>
                <div className="h-[220px] flex items-center justify-center">
                  <div className="w-[50%] h-full">
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={getCategoryPieData()}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={70}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {getCategoryPieData().map((_entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0a1628', border: 'none', borderRadius: '6px', color: '#ffffff', fontSize: '11px' }}
                          labelStyle={{ color: '#ffffff', fontWeight: 'bold' }}
                          itemStyle={{ color: '#93c5fd' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-[50%] text-[10px] space-y-1.5 font-medium max-h-[200px] overflow-y-auto pr-1">
                    {getCategoryPieData().map((entry, index) => (
                      <div key={entry.name} className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                        <span className="text-gray-600 truncate">{entry.name}</span>
                        <span className="text-gray-900 font-bold ml-auto">{entry.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Product breakdown */}
              <div className="bg-white p-4 rounded-xl border border-[#e2e8f0] shadow-sm">
                <h3 className="font-bold text-xs text-gray-900 mb-3">Product Type Breakdown</h3>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={getProductTypeData()}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0a1628', border: 'none', borderRadius: '6px', color: '#ffffff', fontSize: '11px' }}
                        labelStyle={{ color: '#ffffff', fontWeight: 'bold' }}
                        itemStyle={{ color: '#93c5fd' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} iconSize={8} />
                      <Bar dataKey="value" name="Claims" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          </div>
        )}

        </div>

        {"/* TAB 3: UPLOAD */"}
        <div style={{ display: activeTopTab === 'upload' ? 'block' : 'none' }} className="space-y-10">
        {/* Denial Upload / History Tabs */}
        <div className="bg-white border-b border-gray-200 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setDenialSubTab('upload')}
              className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-semibold transition-colors ${
                denialSubTab === 'upload'
                  ? 'border-[#0a1628] text-[#0a1628]'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              Upload
            </button>
            <button
              onClick={() => setDenialSubTab('previous_uploads')}
              className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-semibold transition-colors ${
                denialSubTab === 'previous_uploads'
                  ? 'border-[#0a1628] text-[#0a1628]'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              Previous Uploads
            </button>
          </nav>
        </div>

        {denialSubTab === 'upload' ? (
          /* Upload card */
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
        ) : (
          /* Previous Uploads Table */
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm overflow-hidden">
            <h2 className="text-lg font-bold text-[#0a1628] font-display mb-4">
              Previous Uploads
            </h2>
            {batches.length === 0 ? (
              <div className="text-sm text-gray-500 py-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                No uploads yet
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6 -mb-6">
                <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                  <thead>
                    <tr className="text-gray-500 font-semibold text-xs uppercase tracking-wider bg-gray-50">
                      <th className="px-6 py-3">Name</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Total Claims</th>
                      <th className="px-6 py-3 text-right">Denied Dollars</th>
                      <th className="px-6 py-3 text-right">Recoverable</th>
                      <th className="px-6 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {batches.map(batch => (
                      <tr key={batch.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-semibold text-[#0a1628]">{batch.name}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold ${
                            batch.status === 'completed'
                              ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20'
                              : batch.status === 'processing'
                              ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20'
                              : 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20'
                          }`}>
                            {batch.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right text-gray-600">{batch.total_claims}</td>
                        <td className="px-6 py-4 text-right text-gray-900 font-medium">{formatCurrency(batch.total_denied_dollars || 0)}</td>
                        <td className="px-6 py-4 text-right text-[#16a34a] font-semibold">{formatCurrency(batch.recoverable_amount || 0)}</td>
                        <td className="px-6 py-4 text-gray-500">{new Date(batch.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        </div>
      </main>

      {/* Appeal Modal */}
      {appealingClaimId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="font-display font-bold text-base text-[#0a1628]">Appeal Claim</h3>
            {appealError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
                {appealError}
              </div>
            )}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Appeal Reason</label>
                <select
                  value={selectedAppealReason}
                  onChange={(e) => {
                    setSelectedAppealReason(e.target.value)
                    setAppealError(null)
                  }}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2.5 outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] bg-white text-gray-900"
                >
                  <option value="" disabled>Select a reason...</option>
                  <option value="Authorization Obtained - Missing from Original Claim">Authorization Obtained - Missing from Original Claim</option>
                  <option value="Authorization Obtained - Submitted Retroactively">Authorization Obtained - Submitted Retroactively</option>
                  <option value="Medical Necessity - Clinical Documentation Attached">Medical Necessity - Clinical Documentation Attached</option>
                  <option value="Medical Necessity - Peer-to-Peer Review Requested">Medical Necessity - Peer-to-Peer Review Requested</option>
                  <option value="Eligibility - Coverage Was Active on DOS">Eligibility - Coverage Was Active on DOS</option>
                  <option value="Timely Filing - Proof of Original Submission Attached">Timely Filing - Proof of Original Submission Attached</option>
                  <option value="Duplicate - Claim is Unique, Not a Duplicate">Duplicate - Claim is Unique, Not a Duplicate</option>
                  <option value="Billing Error - Corrected Claim Being Resubmitted">Billing Error - Corrected Claim Being Resubmitted</option>
                  <option value="Coding Error - Corrected CPT or Diagnosis Code">Coding Error - Corrected CPT or Diagnosis Code</option>
                  <option value="COB - Primary EOB Attached">COB - Primary EOB Attached</option>
                  <option value="Contract Rate - Payment Below Contracted Rate">Contract Rate - Payment Below Contracted Rate</option>
                  <option value="Other - See Notes">Other - See Notes</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Notes</label>
                <textarea
                  value={appealNotes}
                  onChange={(e) => {
                    setAppealNotes(e.target.value)
                    setAppealError(null)
                  }}
                  placeholder="Additional context or documentation details..."
                  rows={3}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2.5 outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setAppealingClaimId(null)
                  setSelectedAppealReason('')
                  setAppealNotes('')
                  setAppealError(null)
                }}
                className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitAppeal}
                disabled={updatingId !== null}
                className="bg-[#2563eb] hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center"
              >
                {updatingId ? 'Submitting...' : 'Submit Appeal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {resolvingClaimId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="font-display font-bold text-base text-[#0a1628]">Resolve Appeal</h3>
            
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Appeal Outcome</label>
              <select
                value={appealOutcome}
                onChange={(e) => setAppealOutcome(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg p-2.5 outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] bg-white"
              >
                <option value="approved">Approved</option>
                <option value="partially_approved">Partially Approved</option>
                <option value="denied">Denied</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Recovered Amount ($)</label>
              <input
                type="number"
                value={recoveredAmount === 0 ? '' : recoveredAmount}
                onChange={(e) => setRecoveredAmount(Math.max(0, Number(e.target.value) || 0))}
                placeholder="0"
                className="w-full text-sm border border-gray-300 rounded-lg p-2.5 outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setResolvingClaimId(null)
                  setAppealOutcome('approved')
                  setRecoveredAmount(0)
                }}
                className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitResolve}
                disabled={updatingId !== null}
                className="bg-[#16a34a] hover:bg-green-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center"
              >
                {updatingId ? 'Marking Resolved...' : 'Mark Resolved'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
