'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

/*
  SQL TO CREATE LEADS TABLE:

  CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    hospital_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Allow public insert to leads" ON leads FOR INSERT WITH CHECK (true);
*/

export default function ContactPage() {
  const [name, setName] = useState('')
  const [hospitalName, setHospitalName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()

    try {
      const { error: insertError } = await supabase
        .from('leads')
        .insert({
          name,
          hospital_name: hospitalName,
          email,
          phone: phone || null,
          message: message || null
        })

      if (insertError) {
        throw new Error('Failed to submit form')
      }

      setSubmitted(true)
    } catch {
      setError('An error occurred while submitting. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans selection:bg-electric selection:text-white">
      <div className="w-full max-w-md space-y-8">
        <div>
          <Link href="/" className="flex justify-center mb-8">
            <span className="font-display font-bold text-2xl tracking-tight text-navy">RevenueLogic</span>
          </Link>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-navy font-display">
            Request a Demo
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            See how much you could be recovering with automated revenue cycle intelligence.
          </p>
        </div>

        {submitted ? (
          <div className="bg-white px-8 py-10 shadow sm:rounded-lg text-center border-t-4 border-electric">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-4">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Thank you</h3>
            <p className="text-sm text-gray-500">
              We will be in touch within one business day to schedule your demo.
            </p>
            <div className="mt-6">
              <Link href="/" className="text-sm font-medium text-electric hover:text-navy transition-colors">
                &larr; Back to home
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-white px-8 py-10 shadow sm:rounded-lg">
            <form className="space-y-6" onSubmit={handleSubmit}>
              {error && (
                <div className="rounded-md bg-red-50 p-4">
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              )}
              
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">Full Name <span className="text-red-500">*</span></label>
                <div className="mt-1">
                  <input id="name" name="name" type="text" required value={name} onChange={e => setName(e.target.value)} className="block w-full border border-gray-300 rounded-md px-3 py-2" />
                </div>
              </div>

              <div>
                <label htmlFor="hospitalName" className="block text-sm font-medium text-gray-700">Hospital Name <span className="text-red-500">*</span></label>
                <div className="mt-1">
                  <input id="hospitalName" name="hospitalName" type="text" required value={hospitalName} onChange={e => setHospitalName(e.target.value)} className="block w-full border border-gray-300 rounded-md px-3 py-2" />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email address <span className="text-red-500">*</span></label>
                <div className="mt-1">
                  <input id="email" name="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="block w-full border border-gray-300 rounded-md px-3 py-2" />
                </div>
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Phone <span className="text-gray-400 font-normal">(optional)</span></label>
                <div className="mt-1">
                  <input id="phone" name="phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="block w-full border border-gray-300 rounded-md px-3 py-2" />
                </div>
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-medium text-gray-700">Message <span className="text-gray-400 font-normal">(optional)</span></label>
                <div className="mt-1">
                  <textarea id="message" name="message" rows={3} value={message} onChange={e => setMessage(e.target.value)} className="block w-full border border-gray-300 rounded-md px-3 py-2" />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className={`flex w-full justify-center rounded-md border border-transparent bg-navy py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-electric focus:outline-none focus:ring-2 focus:ring-electric focus:ring-offset-2 transition-colors ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {loading ? 'Submitting...' : 'Request a Demo'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
