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
  product_type: string | null;
  reimbursement_rate: number | null;
  rate_type: 'product_type' | 'cpt' | 'rev_code' | null;
  cpt_code: string | null;
  rev_code: string | null;
  description: string | null;
  base_rate: number | null;
  percentage_of_charges: number | null;
  carve_out: string | null;
  stop_loss: number | null;
  created_at: string;
}

interface ContractsManagerClientProps {
  initialClients: ClientItem[];
}

export function ContractsManagerClient({ initialClients }: ContractsManagerClientProps) {
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [contracts, setContracts] = useState<PlanContractData[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [activeTab, setActiveTab] = useState<'product' | 'cpt' | 'rev'>('product')
  const [selectedPlan, setSelectedPlan] = useState<string>('Anthem')
  
  // Tab 1 (Product Type Fallback) Form State
  const [planName, setPlanName] = useState<string>('Anthem')
  const [stateCode, setStateCode] = useState<string>('CA')
  const [productType, setProductType] = useState<string>('PPO')
  const [reimbursementRate, setReimbursementRate] = useState<string>('')
  
  // Tab 2 (CPT) Form State
  const [cptCode, setCptCode] = useState<string>('')
  const [cptDescription, setCptDescription] = useState<string>('')
  const [cptRateBasis, setCptRateBasis] = useState<'flat' | 'percentage'>('flat')
  const [cptAmount, setCptAmount] = useState<string>('')
  const [cptProductType, setCptProductType] = useState<string>('All')
  const [cptCarveOut, setCptCarveOut] = useState<string>('')
  const [cptStopLoss, setCptStopLoss] = useState<string>('')
  const [showAddCptForm, setShowAddCptForm] = useState<boolean>(false)

  // Tab 3 (Rev Code) Form State
  const [revCode, setRevCode] = useState<string>('')
  const [revDescription, setRevDescription] = useState<string>('')
  const [revRateBasis, setRevRateBasis] = useState<'flat' | 'percentage'>('flat')
  const [revAmount, setRevAmount] = useState<string>('')
  const [revProductType, setRevProductType] = useState<string>('All')
  const [revCarveOut, setRevCarveOut] = useState<string>('')
  const [revStopLoss, setRevStopLoss] = useState<string>('')
  const [showAddRevForm, setShowAddRevForm] = useState<boolean>(false)

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
        .order('created_at', { ascending: false })

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
  }, [selectedClientId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tab 1 Add Contract Handler
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

      // Check if duplicate contract exists for same plan_name + state + product_type + client_id (under fallback product_type rates)
      const duplicate = contracts.find(
        c => (!c.rate_type || c.rate_type === 'product_type') &&
             c.plan_name === planName && 
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
          reimbursement_rate: rateDecimal,
          rate_type: 'product_type'
        })

      if (error) throw error

      setSuccessMessage('Contract rate added successfully!')
      setReimbursementRate('')
      await fetchContracts(selectedClientId)
    } catch {
      setErrorMessage('Failed to add contract rate.')
    }
  }

  // Tab 2 Add CPT Contract Handler
  const handleAddCptContract = async (e: React.FormEvent) => {
    e.preventDefault()
    setSuccessMessage(null)
    setErrorMessage(null)

    if (!selectedClientId) {
      setErrorMessage('Please select a client first.')
      return
    }

    if (!cptCode.trim()) {
      setErrorMessage('Please enter a CPT Code.')
      return
    }

    const amtNum = parseFloat(cptAmount)
    if (isNaN(amtNum) || amtNum < 0) {
      setErrorMessage('Please enter a valid amount.')
      return
    }

    try {
      const prodVal = cptProductType === 'All' ? null : cptProductType
      const duplicate = contracts.find(
        c => c.rate_type === 'cpt' &&
             c.plan_name === selectedPlan &&
             c.cpt_code === cptCode.trim() &&
             c.product_type === prodVal
      )

      if (duplicate) {
        setErrorMessage(`A CPT rate for CPT Code ${cptCode} (${cptProductType}) already exists for ${selectedPlan}.`)
        return
      }

      const { error } = await supabase
        .from('plan_contracts')
        .insert({
          client_id: selectedClientId,
          plan_name: selectedPlan,
          state: 'CA',
          rate_type: 'cpt',
          cpt_code: cptCode.trim(),
          description: cptDescription.trim() || null,
          product_type: prodVal,
          base_rate: cptRateBasis === 'flat' ? amtNum : null,
          percentage_of_charges: cptRateBasis === 'percentage' ? amtNum : null,
          carve_out: cptCarveOut.trim() || null,
          stop_loss: cptStopLoss ? parseFloat(cptStopLoss) || null : null
        })

      if (error) throw error

      setSuccessMessage('CPT contract rate added successfully!')
      setCptCode('')
      setCptDescription('')
      setCptAmount('')
      setCptCarveOut('')
      setCptStopLoss('')
      setShowAddCptForm(false)
      await fetchContracts(selectedClientId)
    } catch {
      setErrorMessage('Failed to add CPT rate.')
    }
  }

  // Tab 3 Add Rev Code Contract Handler
  const handleAddRevContract = async (e: React.FormEvent) => {
    e.preventDefault()
    setSuccessMessage(null)
    setErrorMessage(null)

    if (!selectedClientId) {
      setErrorMessage('Please select a client first.')
      return
    }

    if (!revCode.trim()) {
      setErrorMessage('Please enter a Rev Code.')
      return
    }

    const amtNum = parseFloat(revAmount)
    if (isNaN(amtNum) || amtNum < 0) {
      setErrorMessage('Please enter a valid amount.')
      return
    }

    try {
      const prodVal = revProductType === 'All' ? null : revProductType
      const duplicate = contracts.find(
        c => c.rate_type === 'rev_code' &&
             c.plan_name === selectedPlan &&
             c.rev_code === revCode.trim() &&
             c.product_type === prodVal
      )

      if (duplicate) {
        setErrorMessage(`A Rev Code rate for Rev Code ${revCode} (${revProductType}) already exists for ${selectedPlan}.`)
        return
      }

      const { error } = await supabase
        .from('plan_contracts')
        .insert({
          client_id: selectedClientId,
          plan_name: selectedPlan,
          state: 'CA',
          rate_type: 'rev_code',
          rev_code: revCode.trim(),
          description: revDescription.trim() || null,
          product_type: prodVal,
          base_rate: revRateBasis === 'flat' ? amtNum : null,
          percentage_of_charges: revRateBasis === 'percentage' ? amtNum : null,
          carve_out: revCarveOut.trim() || null,
          stop_loss: revStopLoss ? parseFloat(revStopLoss) || null : null
        })

      if (error) throw error

      setSuccessMessage('Rev Code contract rate added successfully!')
      setRevCode('')
      setRevDescription('')
      setRevAmount('')
      setRevCarveOut('')
      setRevStopLoss('')
      setShowAddRevForm(false)
      await fetchContracts(selectedClientId)
    } catch {
      setErrorMessage('Failed to add Rev Code rate.')
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
    if (contract.rate_type === 'cpt' || contract.rate_type === 'rev_code') {
      const val = contract.base_rate !== null ? contract.base_rate : (contract.percentage_of_charges !== null ? contract.percentage_of_charges : 0)
      setEditingRate(val.toString())
    } else {
      setEditingRate(((contract.reimbursement_rate || 0) * 100).toFixed(1).replace(/\.0$/, ''))
    }
  }

  const handleSaveEdit = async (contract: PlanContractData) => {
    setSuccessMessage(null)
    setErrorMessage(null)

    const rateNum = parseFloat(editingRate)
    if (isNaN(rateNum) || rateNum < 0) {
      setErrorMessage('Please enter a valid rate amount.')
      return
    }

    try {
      let updatePayload: Record<string, unknown> = {}

      if (contract.rate_type === 'cpt' || contract.rate_type === 'rev_code') {
        const isPercentage = contract.percentage_of_charges !== null
        updatePayload = {
          base_rate: !isPercentage ? rateNum : null,
          percentage_of_charges: isPercentage ? rateNum : null
        }
      } else {
        const rateDecimal = rateNum / 100
        updatePayload = {
          reimbursement_rate: rateDecimal
        }
      }

      const { error } = await supabase
        .from('plan_contracts')
        .update(updatePayload)
        .eq('id', contract.id)

      if (error) throw error

      setSuccessMessage('Rate updated successfully')
      setEditingContractId(null)
      await fetchContracts(selectedClientId)

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

  const formatCurrency = (val: number | null) => {
    if (val === null) return '-'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)
  }

  // Filter lists in memory
  const productContracts = contracts.filter(c => !c.rate_type || c.rate_type === 'product_type')
  const cptContracts = contracts.filter(c => c.rate_type === 'cpt' && c.plan_name === selectedPlan)
  const revContracts = contracts.filter(c => c.rate_type === 'rev_code' && c.plan_name === selectedPlan)

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h2 className="text-xl font-bold text-gray-900 font-display">Manage Hospital Contracts</h2>
        <p className="text-sm text-gray-500 mt-1">Set reimbursement rates for Anthem and Blue Shield across different CPTs, Rev Codes, and product types.</p>
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

      {selectedClientId && (
        <div className="space-y-6">
          {/* TAB BAR */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8" aria-label="Contract Tabs">
              <button
                onClick={() => { setActiveTab('product'); setEditingContractId(null); }}
                className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-semibold transition-colors ${
                  activeTab === 'product'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                Product Type Rates (Fallback)
              </button>
              <button
                onClick={() => { setActiveTab('cpt'); setEditingContractId(null); }}
                className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-semibold transition-colors ${
                  activeTab === 'cpt'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                CPT Code Rates
              </button>
              <button
                onClick={() => { setActiveTab('rev'); setEditingContractId(null); }}
                className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-semibold transition-colors ${
                  activeTab === 'rev'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                Rev Code Rates
              </button>
            </nav>
          </div>

          {/* TAB 1: PRODUCT TYPE RATES */}
          {activeTab === 'product' && (
            <div className="space-y-6">
              <div className="bg-white shadow sm:rounded-lg border border-gray-100 overflow-hidden">
                <div className="px-4 py-5 sm:px-6 border-b border-gray-200 bg-gray-50/50">
                  <h3 className="text-base font-semibold leading-6 text-gray-900 font-display">Product Fallback Rates</h3>
                </div>

                {loading ? (
                  <div className="py-12 text-center text-sm text-gray-500 animate-pulse">Loading contract rates...</div>
                ) : productContracts.length === 0 ? (
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
                        {productContracts.map((contract) => {
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
                                    {`${((contract.reimbursement_rate || 0) * 100).toFixed(1).replace(/\.0$/, '')}%`}
                                  </span>
                                )}
                              </td>
                              <td className="whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6 space-x-2">
                                {isEditing ? (
                                  <>
                                    <button
                                      onClick={() => handleSaveEdit(contract)}
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

              {/* ADD CONTRACT RATE FORM */}
              <div className="bg-white shadow sm:rounded-lg border border-gray-100 overflow-hidden">
                <div className="px-4 py-5 sm:px-6 border-b border-gray-200 bg-gray-50/50">
                  <h3 className="text-base font-semibold leading-6 text-gray-900 font-display">Add Fallback Rate</h3>
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
                      Save Fallback Rate
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB 2: CPT CODE RATES */}
          {activeTab === 'cpt' && (
            <div className="space-y-6">
              {/* PLAN SELECTOR BAR */}
              <div className="bg-white p-6 shadow sm:rounded-lg border border-gray-100 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <label htmlFor="planSelector" className="block text-sm font-semibold text-gray-900">Plan</label>
                  <select
                    id="planSelector"
                    value={selectedPlan}
                    onChange={(e) => { setSelectedPlan(e.target.value); setEditingContractId(null); }}
                    className="block w-48 border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="Anthem">Anthem</option>
                    <option value="Blue Shield">Blue Shield</option>
                  </select>
                </div>

                <button
                  onClick={() => setShowAddCptForm(!showAddCptForm)}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 shadow-sm transition-colors"
                >
                  {showAddCptForm ? 'Hide Form' : 'Add CPT Rate'}
                </button>
              </div>

              {/* ADD CPT RATE FORM (COLLAPSIBLE) */}
              {showAddCptForm && (
                <div className="bg-white shadow sm:rounded-lg border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200">
                  <div className="px-4 py-5 sm:px-6 border-b border-gray-200 bg-gray-50/50">
                    <h3 className="text-base font-semibold leading-6 text-gray-900 font-display">Configure CPT Rate for {selectedPlan}</h3>
                  </div>
                  <form onSubmit={handleAddCptContract} className="p-6 space-y-6">
                    <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-3">
                      <div>
                        <label htmlFor="cptCode" className="block text-sm font-medium text-gray-700">CPT Code *</label>
                        <input
                          id="cptCode"
                          type="text"
                          required
                          placeholder="e.g. 99213"
                          value={cptCode}
                          onChange={(e) => setCptCode(e.target.value)}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        />
                      </div>

                      <div>
                        <label htmlFor="cptDescription" className="block text-sm font-medium text-gray-700">Description</label>
                        <input
                          id="cptDescription"
                          type="text"
                          placeholder="e.g. Outpatient visit"
                          value={cptDescription}
                          onChange={(e) => setCptDescription(e.target.value)}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        />
                      </div>

                      <div>
                        <label htmlFor="cptProductType" className="block text-sm font-medium text-gray-700">Product Type</label>
                        <select
                          id="cptProductType"
                          value={cptProductType}
                          onChange={(e) => setCptProductType(e.target.value)}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        >
                          <option value="All">All</option>
                          <option value="PPO">PPO</option>
                          <option value="HMO">HMO</option>
                          <option value="EPO">EPO</option>
                          <option value="POS">POS</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="cptRateBasis" className="block text-sm font-medium text-gray-700">Rate Type *</label>
                        <select
                          id="cptRateBasis"
                          value={cptRateBasis}
                          onChange={(e) => setCptRateBasis(e.target.value as 'flat' | 'percentage')}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        >
                          <option value="flat">Flat Fee</option>
                          <option value="percentage">Percentage of Charges</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="cptAmount" className="block text-sm font-medium text-gray-700">
                          {cptRateBasis === 'flat' ? 'Amount ($) *' : 'Percentage (%) *'}
                        </label>
                        <input
                          id="cptAmount"
                          type="number"
                          step="0.01"
                          required
                          placeholder={cptRateBasis === 'flat' ? 'e.g. 150.00' : 'e.g. 85.0'}
                          value={cptAmount}
                          onChange={(e) => setCptAmount(e.target.value)}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        />
                      </div>

                      <div>
                        <label htmlFor="cptStopLoss" className="block text-sm font-medium text-gray-700">Stop Loss Threshold ($)</label>
                        <input
                          id="cptStopLoss"
                          type="number"
                          step="0.01"
                          placeholder="e.g. 5000"
                          value={cptStopLoss}
                          onChange={(e) => setCptStopLoss(e.target.value)}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label htmlFor="cptCarveOut" className="block text-sm font-medium text-gray-700">Carve Out Notes</label>
                        <textarea
                          id="cptCarveOut"
                          rows={2}
                          placeholder="Enter any specific carve out conditions..."
                          value={cptCarveOut}
                          onChange={(e) => setCptCarveOut(e.target.value)}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
                      >
                        Save CPT Rate
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* CPT RATES TABLE */}
              <div className="bg-white shadow sm:rounded-lg border border-gray-100 overflow-hidden">
                <div className="px-4 py-5 sm:px-6 border-b border-gray-200 bg-gray-50/50">
                  <h3 className="text-base font-semibold leading-6 text-gray-900 font-display">CPT Rates configured for {selectedPlan}</h3>
                </div>

                {loading ? (
                  <div className="py-12 text-center text-sm text-gray-500 animate-pulse">Loading CPT rates...</div>
                ) : cptContracts.length === 0 ? (
                  <div className="py-12 text-center text-sm text-gray-500">No CPT rates configured. Add your first rate above.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-300">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">CPT Code</th>
                          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Rate Type</th>
                          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Rate Amount</th>
                          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Product Type</th>
                          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Carve Out</th>
                          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Stop Loss</th>
                          <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6 w-[200px]">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {cptContracts.map((contract) => {
                          const isEditing = editingContractId === contract.id
                          const isPercentage = contract.percentage_of_charges !== null

                          return (
                            <tr key={contract.id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-semibold text-gray-900 sm:pl-6">
                                <div>{contract.cpt_code}</div>
                                {contract.description && (
                                  <div className="text-xs text-gray-400 font-normal">{contract.description}</div>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                {isPercentage ? 'Percentage' : 'Flat Fee'}
                              </td>
                              <td className="whitespace-nowrap px-3 py-4 text-sm font-medium">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editingRate}
                                    onChange={(e) => setEditingRate(e.target.value)}
                                    className="w-24 px-2 py-1 border border-gray-300 rounded-md focus:border-blue-700"
                                  />
                                ) : (
                                  <span className="text-indigo-600">
                                    {isPercentage ? `${contract.percentage_of_charges}%` : formatCurrency(contract.base_rate)}
                                  </span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                {contract.product_type || 'All'}
                              </td>
                              <td className="px-3 py-4 text-sm text-gray-500 max-w-[200px] truncate" title={contract.carve_out || ''}>
                                {contract.carve_out || '-'}
                              </td>
                              <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                {contract.stop_loss ? formatCurrency(contract.stop_loss) : '-'}
                              </td>
                              <td className="whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6 space-x-2">
                                {isEditing ? (
                                  <>
                                    <button
                                      onClick={() => handleSaveEdit(contract)}
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
            </div>
          )}

          {/* TAB 3: REV CODE RATES */}
          {activeTab === 'rev' && (
            <div className="space-y-6">
              {/* PLAN SELECTOR BAR */}
              <div className="bg-white p-6 shadow sm:rounded-lg border border-gray-100 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <label htmlFor="planSelectorRev" className="block text-sm font-semibold text-gray-900">Plan</label>
                  <select
                    id="planSelectorRev"
                    value={selectedPlan}
                    onChange={(e) => { setSelectedPlan(e.target.value); setEditingContractId(null); }}
                    className="block w-48 border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="Anthem">Anthem</option>
                    <option value="Blue Shield">Blue Shield</option>
                  </select>
                </div>

                <button
                  onClick={() => setShowAddRevForm(!showAddRevForm)}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 shadow-sm transition-colors"
                >
                  {showAddRevForm ? 'Hide Form' : 'Add Rev Code Rate'}
                </button>
              </div>

              {/* ADD REV CODE RATE FORM (COLLAPSIBLE) */}
              {showAddRevForm && (
                <div className="bg-white shadow sm:rounded-lg border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200">
                  <div className="px-4 py-5 sm:px-6 border-b border-gray-200 bg-gray-50/50">
                    <h3 className="text-base font-semibold leading-6 text-gray-900 font-display">Configure Rev Code Rate for {selectedPlan}</h3>
                  </div>
                  <form onSubmit={handleAddRevContract} className="p-6 space-y-6">
                    <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-3">
                      <div>
                        <label htmlFor="revCode" className="block text-sm font-medium text-gray-700">Rev Code *</label>
                        <input
                          id="revCode"
                          type="text"
                          required
                          placeholder="e.g. 0120"
                          value={revCode}
                          onChange={(e) => setRevCode(e.target.value)}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        />
                      </div>

                      <div>
                        <label htmlFor="revDescription" className="block text-sm font-medium text-gray-700">Description</label>
                        <input
                          id="revDescription"
                          type="text"
                          placeholder="e.g. Room & Board"
                          value={revDescription}
                          onChange={(e) => setRevDescription(e.target.value)}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        />
                      </div>

                      <div>
                        <label htmlFor="revProductType" className="block text-sm font-medium text-gray-700">Product Type</label>
                        <select
                          id="revProductType"
                          value={revProductType}
                          onChange={(e) => setRevProductType(e.target.value)}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        >
                          <option value="All">All</option>
                          <option value="PPO">PPO</option>
                          <option value="HMO">HMO</option>
                          <option value="EPO">EPO</option>
                          <option value="POS">POS</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="revRateBasis" className="block text-sm font-medium text-gray-700">Rate Type *</label>
                        <select
                          id="revRateBasis"
                          value={revRateBasis}
                          onChange={(e) => setRevRateBasis(e.target.value as 'flat' | 'percentage')}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        >
                          <option value="flat">Flat Fee</option>
                          <option value="percentage">Percentage of Charges</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="revAmount" className="block text-sm font-medium text-gray-700">
                          {revRateBasis === 'flat' ? 'Amount ($) *' : 'Percentage (%) *'}
                        </label>
                        <input
                          id="revAmount"
                          type="number"
                          step="0.01"
                          required
                          placeholder={revRateBasis === 'flat' ? 'e.g. 250.00' : 'e.g. 80.0'}
                          value={revAmount}
                          onChange={(e) => setRevAmount(e.target.value)}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        />
                      </div>

                      <div>
                        <label htmlFor="revStopLoss" className="block text-sm font-medium text-gray-700">Stop Loss Threshold ($)</label>
                        <input
                          id="revStopLoss"
                          type="number"
                          step="0.01"
                          placeholder="e.g. 10000"
                          value={revStopLoss}
                          onChange={(e) => setRevStopLoss(e.target.value)}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label htmlFor="revCarveOut" className="block text-sm font-medium text-gray-700">Carve Out Notes</label>
                        <textarea
                          id="revCarveOut"
                          rows={2}
                          placeholder="Enter any specific carve out conditions..."
                          value={revCarveOut}
                          onChange={(e) => setRevCarveOut(e.target.value)}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
                      >
                        Save Rev Code Rate
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* REV CODE RATES TABLE */}
              <div className="bg-white shadow sm:rounded-lg border border-gray-100 overflow-hidden">
                <div className="px-4 py-5 sm:px-6 border-b border-gray-200 bg-gray-50/50">
                  <h3 className="text-base font-semibold leading-6 text-gray-900 font-display">Rev Code Rates configured for {selectedPlan}</h3>
                </div>

                {loading ? (
                  <div className="py-12 text-center text-sm text-gray-500 animate-pulse">Loading Rev Code rates...</div>
                ) : revContracts.length === 0 ? (
                  <div className="py-12 text-center text-sm text-gray-500">No Rev Code rates configured. Add your first rate above.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-300">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Rev Code</th>
                          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Rate Type</th>
                          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Rate Amount</th>
                          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Product Type</th>
                          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Carve Out</th>
                          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Stop Loss</th>
                          <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6 w-[200px]">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {revContracts.map((contract) => {
                          const isEditing = editingContractId === contract.id
                          const isPercentage = contract.percentage_of_charges !== null

                          return (
                            <tr key={contract.id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-semibold text-gray-900 sm:pl-6">
                                <div>{contract.rev_code}</div>
                                {contract.description && (
                                  <div className="text-xs text-gray-400 font-normal">{contract.description}</div>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                {isPercentage ? 'Percentage' : 'Flat Fee'}
                              </td>
                              <td className="whitespace-nowrap px-3 py-4 text-sm font-medium">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editingRate}
                                    onChange={(e) => setEditingRate(e.target.value)}
                                    className="w-24 px-2 py-1 border border-gray-300 rounded-md focus:border-blue-700"
                                  />
                                ) : (
                                  <span className="text-indigo-600">
                                    {isPercentage ? `${contract.percentage_of_charges}%` : formatCurrency(contract.base_rate)}
                                  </span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                {contract.product_type || 'All'}
                              </td>
                              <td className="px-3 py-4 text-sm text-gray-500 max-w-[200px] truncate" title={contract.carve_out || ''}>
                                {contract.carve_out || '-'}
                              </td>
                              <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                {contract.stop_loss ? formatCurrency(contract.stop_loss) : '-'}
                              </td>
                              <td className="whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6 space-x-2">
                                {isEditing ? (
                                  <>
                                    <button
                                      onClick={() => handleSaveEdit(contract)}
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
            </div>
          )}
        </div>
      )}
    </div>
  )
}
