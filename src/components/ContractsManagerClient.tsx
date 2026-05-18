'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface ClientItem {
  id: string;
  name: string;
}

export interface PlanContractData {
  id: string;
  client_id: string;
  plan_name: string;
  state: string;
  product_type: string;
  reimbursement_rate: number;
  created_at: string;
}

interface ContractsManagerClientProps {
  initialClients: ClientItem[];
}

export function ContractsManagerClient({ initialClients }: ContractsManagerClientProps) {
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [contracts, setContracts] = useState<PlanContractData[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  
  // Form State
  const [planName, setPlanName] = useState<string>('Anthem')
  const [stateCode, setStateCode] = useState<string>('CA')
  const [productType, setProductType] = useState<string>('PPO')
  const [reimbursementRate, setReimbursementRate] = useState<string>('')
  
  // Inline Editing State
  const [editingContractId, setEditingContractId] = useState<string | null>(null)
  const [editingRate, setEditingRate] = useState<string>('')

  // Feedback Messages
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const supabase = createClient()

  // Fetch contracts when a client is selected
  const fetchContracts = async (clientId: string) => {
    if (!clientId) {
      setContracts([])
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('plan_contracts')
        .select('*')
        .eq('client_id', clientId)
        .order('plan_name', { ascending: true })

      if (error) throw error
      setContracts((data || []) as PlanContractData[])
    } catch {
      setErrorMessage('Failed to load contract rates.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchContracts(selectedClientId)
  }, [selectedClientId])

  const handleAddContract = async (e: React.FormEvent) => {
    e.preventDefault()
    setSuccessMessage(null)
    setErrorMessage(null)

    if (!selectedClientId) {
      setErrorMessage('Please select a client first.')
      return
    }

    const rateNum = parseFloat(reimbursementRate)
    if (isNaN(rateNum) || rateNum < 0 || rateNum > 200) {
      setErrorMessage('Please enter a valid reimbursement rate between 0% and 200%.')
      return
    }

    try {
      const rateDecimal = rateNum / 100

      // Check if duplicate contract exists for same plan_name + state + product_type + client_id
      const duplicate = contracts.find(
        c => c.plan_name === planName && 
             c.state === stateCode && 
             c.product_type === productType
      )

      if (duplicate) {
        setErrorMessage(`A contract rate for ${planName} (${stateCode}) ${productType} already exists for this client. Please delete the existing contract first.`)
        return
      }

      const { error } = await supabase
        .from('plan_contracts')
        .insert({
          client_id: selectedClientId,
          plan_name: planName,
          state: stateCode,
          product_type: productType,
          reimbursement_rate: rateDecimal
        })

      if (error) throw error

      setSuccessMessage('Contract rate added successfully!')
      setReimbursementRate('')
      await fetchContracts(selectedClientId)
    } catch {
      setErrorMessage('Failed to add contract rate. Make sure you run the state column migration if needed.')
    }
  }

  const handleDeleteContract = async (id: string) => {
    if (!confirm('Are you sure you want to delete this contract rate?')) return
    setSuccessMessage(null)
    setErrorMessage(null)

    try {
      const { error } = await supabase
        .from('plan_contracts')
        .delete()
        .eq('id', id)

      if (error) throw error

      setSuccessMessage('Contract rate deleted successfully!')
      await fetchContracts(selectedClientId)
    } catch {
      setErrorMessage('Failed to delete contract rate.')
    }
  }

  const handleStartEdit = (contract: PlanContractData) => {
    setEditingContractId(contract.id)
    setEditingRate((contract.reimbursement_rate * 100).toFixed(1).replace(/\.0$/, ''))
  }

  const handleSaveEdit = async (contractId: string) => {
    setSuccessMessage(null)
    setErrorMessage(null)

    const rateNum = parseFloat(editingRate)
    if (isNaN(rateNum) || rateNum < 0 || rateNum > 200) {
      setErrorMessage('Please enter a valid reimbursement rate between 0% and 200%.')
      return
    }

    try {
      const rateDecimal = rateNum / 100

      const { error } = await supabase
        .from('plan_contracts')
        .update({
          reimbursement_rate: rateDecimal
        })
        .eq('id', contractId)

      if (error) throw error

      setSuccessMessage('Rate updated successfully')
      setEditingContractId(null)
      await fetchContracts(selectedClientId)

      // Briefly clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage(null)
      }, 3000)
    } catch {
      setErrorMessage('Failed to update contract rate.')
    }
  }

  const handleCancelEdit = () => {
    setEditingContractId(null)
    setEditingRate('')
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h2 className="text-xl font-bold text-gray-900 font-display">Manage Hospital Contracts</h2>
        <p className="text-sm text-gray-500 mt-1">Set reimbursement rates for Anthem and Blue Shield across different product types.</p>
      </div>

      {/* SUCCESS & ERROR FEEDBACK */}
      {successMessage && (
        <div className="rounded-md bg-green-50 p-4 border border-green-200">
          <div className="text-sm font-medium text-green-800">{successMessage}</div>
        </div>
      )}
      {errorMessage && (
        <div className="rounded-md bg-red-50 p-4 border border-red-200">
          <div className="text-sm font-medium text-red-800">{errorMessage}</div>
        </div>
      )}

      {/* CLIENT SELECTOR */}
      <div className="bg-white p-6 shadow sm:rounded-lg border border-gray-100 space-y-4">
        <label htmlFor="clientSelect" className="block text-sm font-semibold text-gray-900">Select Client</label>
        <select
          id="clientSelect"
          value={selectedClientId}
          onChange={(e) => setSelectedClientId(e.target.value)}
          className="block w-full max-w-md border border-gray-300 rounded-md px-3 py-2"
        >
          <option value="">-- Choose a Client --</option>
          {initialClients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* CONTRACTS TABLE */}
      {selectedClientId && (
        <div className="bg-white shadow sm:rounded-lg border border-gray-100 overflow-hidden">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200 bg-gray-50/50">
            <h3 className="text-base font-semibold leading-6 text-gray-900 font-display">Contract Rates</h3>
          </div>
          
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-500 animate-pulse">Loading contract rates...</div>
          ) : contracts.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">No contract rates found for this client. Add one below.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Plan Name</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">State</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Product Type</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Reimbursement Rate</th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6 w-[200px]">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {contracts.map((contract) => {
                    const isEditing = editingContractId === contract.id
                    return (
                      <tr key={contract.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-semibold text-gray-900 sm:pl-6">{contract.plan_name}</td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{contract.state || 'CA'}</td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{contract.product_type}</td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm font-medium">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.1"
                              value={editingRate}
                              onChange={(e) => setEditingRate(e.target.value)}
                              className="w-24 px-2 py-1 border border-gray-300 rounded-md focus:border-blue-700"
                            />
                          ) : (
                            <span className="text-indigo-600">
                              {`${(contract.reimbursement_rate * 100).toFixed(1).replace(/\.0$/, '')}%`}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6 space-x-2">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => handleSaveEdit(contract.id)}
                                className="inline-flex items-center rounded-md bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-green-700"
                              >
                                Save
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="inline-flex items-center rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleStartEdit(contract)}
                                className="inline-flex items-center rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-600 shadow-sm ring-1 ring-inset ring-indigo-300 hover:bg-indigo-50"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteContract(contract.id)}
                                className="inline-flex items-center rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 shadow-sm ring-1 ring-inset ring-red-300 hover:bg-red-50"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ADD CONTRACT RATE FORM */}
      {selectedClientId && (
        <div className="bg-white shadow sm:rounded-lg border border-gray-100 overflow-hidden">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200 bg-gray-50/50">
            <h3 className="text-base font-semibold leading-6 text-gray-900 font-display">Add Contract Rate</h3>
          </div>
          <form onSubmit={handleAddContract} className="p-6 space-y-6">
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-4">
              
              <div>
                <label htmlFor="planName" className="block text-sm font-medium text-gray-700">Plan Name</label>
                <select
                  id="planName"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="Anthem">Anthem</option>
                  <option value="Blue Shield">Blue Shield</option>
                </select>
              </div>

              <div>
                <label htmlFor="stateCode" className="block text-sm font-medium text-gray-700">State</label>
                <select
                  id="stateCode"
                  value={stateCode}
                  onChange={(e) => setStateCode(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="CA">CA</option>
                </select>
              </div>

              <div>
                <label htmlFor="productType" className="block text-sm font-medium text-gray-700">Product Type</label>
                <select
                  id="productType"
                  value={productType}
                  onChange={(e) => setProductType(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="PPO">PPO</option>
                  <option value="HMO">HMO</option>
                  <option value="EPO">EPO</option>
                  <option value="POS">POS</option>
                </select>
              </div>

              <div>
                <label htmlFor="reimbursementRate" className="block text-sm font-medium text-gray-700">Reimbursement Rate (%)</label>
                <input
                  id="reimbursementRate"
                  type="number"
                  step="0.1"
                  required
                  placeholder="e.g. 85"
                  value={reimbursementRate}
                  onChange={(e) => setReimbursementRate(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>

            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Save Contract Rate
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
