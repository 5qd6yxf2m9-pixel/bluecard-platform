'use client'

import { useState } from 'react'

export interface LeadData {
  id: string;
  name: string;
  hospital_name: string;
  email: string;
  phone: string | null;
  message: string | null;
  created_at: string;
}

interface LeadsManagerClientProps {
  initialLeads: LeadData[];
}

export function LeadsManagerClient({ initialLeads }: LeadsManagerClientProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopy = (id: string, email: string) => {
    void navigator.clipboard.writeText(email)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const formatSubmittedDate = (dateString: string) => {
    const d = new Date(dateString)
    if (isNaN(d.getTime())) return dateString
    
    const pad = (n: number) => String(n).padStart(2, '0')
    const month = pad(d.getMonth() + 1)
    const day = pad(d.getDate())
    const year = String(d.getFullYear()).slice(-2)
    
    let hours = d.getHours()
    const ampm = hours >= 12 ? 'PM' : 'AM'
    hours = hours % 12
    hours = hours ? hours : 12
    const minutes = pad(d.getMinutes())
    
    return `${month}/${day}/${year} ${hours}:${minutes} ${ampm}`
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-gray-900 font-display">Contact Submissions</h2>
          <p className="text-sm text-gray-500 mt-1">
            {initialLeads.length} {initialLeads.length === 1 ? 'demo request' : 'demo requests'}
          </p>
        </div>
      </div>

      <div className="bg-white shadow sm:rounded-lg overflow-hidden border border-gray-100">
        {initialLeads.length === 0 ? (
          <div className="py-24 text-center text-sm text-gray-500">
            No demo requests found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-300">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Name</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Hospital</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Email</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Phone</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Message</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Submitted</th>
                  <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {initialLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">{lead.name}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{lead.hospital_name}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-indigo-600 font-medium">
                      <a href={`mailto:${lead.email}`} className="hover:underline">{lead.email}</a>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{lead.phone || '-'}</td>
                    <td className="px-3 py-4 text-sm text-gray-700 max-w-xs truncate" title={lead.message || ''}>
                      {lead.message || '-'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {formatSubmittedDate(lead.created_at)}
                    </td>
                    <td className="whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                      <button
                        onClick={() => handleCopy(lead.id, lead.email)}
                        className={`inline-flex items-center rounded px-2.5 py-1.5 text-xs font-semibold shadow-sm ring-1 ring-inset transition-all ${
                          copiedId === lead.id
                            ? 'bg-green-50 text-green-700 ring-green-600/20'
                            : 'bg-white text-gray-900 ring-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {copiedId === lead.id ? 'Copied!' : 'Copy Email'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
