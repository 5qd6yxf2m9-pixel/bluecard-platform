'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'

interface DenialRecord {
  account: string;
  claimId: string;
  payer: string;
  dos: string;
  cptCode: string;
  revCode: string;
  drg: string;
  billedAmount: number;
  allowedAmount: number;
  paidAmount: number;
  carcCode: string;
  rarcCode: string;
  groupCode: string;
  denialDate: string;
  authPresent: string;
  eligibility: string;
  productType: string;
}

export default function DenialsPage() {
  const [dragActive, setDragActive] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [records, setRecords] = useState<DenialRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
        if (row.length > 0 && row.some(cell => cell !== '')) {
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

  const processFile = (file: File) => {
    setError(null)
    setParsing(true)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const rows = parseCSV(text)

        if (rows.length < 2) {
          throw new Error("The CSV file appears to be empty or lacks data rows.")
        }

        const headers = rows[0].map(h => h.toLowerCase().replace(/_/g, ''))
        
        // Find indices for required columns
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

        // Validate headers (at least check core ones to assist user)
        if (colMap.account === -1 || colMap.claimId === -1 || colMap.billedAmount === -1) {
          throw new Error("Missing required headers in CSV. Please verify that columns like Account, Claim_ID, and Billed_Amount are present.")
        }

        const parsedRecords: DenialRecord[] = []

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i]
          if (row.length < headers.length) continue

          const val = (idx: number) => idx !== -1 && row[idx] ? row[idx] : ''
          const num = (idx: number) => {
            if (idx === -1 || !row[idx]) return 0
            return Number(row[idx].replace(/[^0-9.-]/g, '')) || 0
          }

          parsedRecords.push({
            account: val(colMap.account),
            claimId: val(colMap.claimId),
            payer: val(colMap.payer),
            dos: val(colMap.dos),
            cptCode: val(colMap.cptCode),
            revCode: val(colMap.revCode),
            drg: val(colMap.drg),
            billedAmount: num(colMap.billedAmount),
            allowedAmount: num(colMap.allowedAmount),
            paidAmount: num(colMap.paidAmount),
            carcCode: val(colMap.carcCode),
            rarcCode: val(colMap.rarcCode),
            groupCode: val(colMap.groupCode),
            denialDate: val(colMap.denialDate),
            authPresent: val(colMap.authPresent),
            eligibility: val(colMap.eligibility),
            productType: val(colMap.productType)
          })
        }

        setRecords(parsedRecords)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to parse CSV file."
        setError(message)
      } finally {
        setParsing(false)
      }
    }
    reader.onerror = () => {
      setError("Failed to read the file.")
      setParsing(false)
    }
    reader.readAsText(file)
  }

  // Calculate aggregates
  const totalClaims = records.length
  const totalDeniedDollars = records.reduce((sum, r) => sum + r.billedAmount, 0)
  const totalAllowedDollars = records.reduce((sum, r) => sum + r.allowedAmount, 0)

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans selection:bg-[#2563eb] selection:text-white">
      {/* Header */}
      <header className="bg-[#0a1628] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link 
              href="/dashboard" 
              className="text-white hover:text-gray-300 flex items-center space-x-2 text-sm font-semibold transition-colors"
            >
              <span>&larr;</span> <span>Back</span>
            </Link>
            <div className="flex items-center space-x-2">
              <span className="text-xl font-bold font-display tracking-tight text-white">
                DenialLogic
              </span>
              <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                Beta
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full space-y-10">
        
        {/* Module description */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#0a1628] font-display">
            Denial Intelligence & Pattern Detection
          </h2>
          <p className="text-sm text-gray-500 mt-1 max-w-3xl leading-relaxed">
            Upload your historical remit or 835 claim denial files. DenialLogic will aggregate key denial codes (CARC/RARC), detect systemic payment pattern issues, and identify your highest-opportunity recovery workflows.
          </p>
        </div>

        {/* Upload Container */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-8 shadow-sm">
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
              Supports standard 835 export columns (Account, Claim_ID, Payer, Billed_Amount, CARC_Code...)
            </span>
          </div>

          {parsing && (
            <div className="mt-4 flex items-center justify-center space-x-2 text-sm text-gray-500 font-semibold">
              <div className="w-4 h-4 border-2 border-t-transparent border-[#2563eb] rounded-full animate-spin"></div>
              <span>Processing file...</span>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200 text-sm text-red-700 font-medium">
              {error}
            </div>
          )}
        </div>

        {/* Aggregates (Show only if records exist) */}
        {records.length > 0 && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              {/* Total Claims Card */}
              <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Total Claims Uploaded
                </div>
                <div className="mt-2 text-3xl font-extrabold text-[#0a1628] font-display">
                  {totalClaims}
                </div>
              </div>

              {/* Total Denied Card */}
              <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Total Denied Dollars
                </div>
                <div className="mt-2 text-3xl font-extrabold text-[#dc2626] font-display">
                  {formatCurrency(totalDeniedDollars)}
                </div>
              </div>

              {/* Total Allowed Card */}
              <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 shadow-sm">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Total Allowed Dollars
                </div>
                <div className="mt-2 text-3xl font-extrabold text-[#16a34a] font-display">
                  {formatCurrency(totalAllowedDollars)}
                </div>
              </div>
            </div>

            {/* Denial Records Table */}
            <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 bg-[#0a1628]/5">
                <h3 className="font-bold text-gray-900 text-sm">Tabular Denial Records</h3>
              </div>
              <div className="overflow-x-auto max-h-[400px]">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Account</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">DOS</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Payer</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">CPT Code</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">CARC Code</th>
                      <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Billed Amount</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {records.map((rec, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{rec.account}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{rec.dos}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{rec.payer}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{rec.cptCode}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-amber-700 bg-amber-50 rounded px-2 py-0.5 inline-block my-2">{rec.carcCode}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-right text-[#0a1628]">{formatCurrency(rec.billedAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
