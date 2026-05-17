'use client'

import { useState } from 'react'

interface ProcessResponse {
  message?: string;
  processed?: number;
  manual_review?: number;
  total?: number;
  error?: string;
}

export function ProcessClaimsButton() {
  const [loading, setLoading] = useState(false)

  const handleProcess = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/process-claims', {
        method: 'POST',
      })
      
      const data = await response.json() as ProcessResponse
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to process claims')
      }

      alert(`Success! Processed: ${data.processed}, Manual Review: ${data.manual_review}, Total: ${data.total}`)
    } catch (err) {
      const error = err as Error
      alert(`Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleProcess}
      disabled={loading}
      className="inline-flex items-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 disabled:opacity-50"
    >
      {loading ? 'Processing...' : 'Process Claims'}
    </button>
  )
}
