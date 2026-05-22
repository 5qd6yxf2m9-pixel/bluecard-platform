import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Claim {
  id: string;
  client_id: string;
  alpha_prefix: string;
  dos: string;
  product_type: string;
  payer_name: string;
  charge_amount: number;
  cpt_code?: string | null;
  rev_code?: string | null;
  auth_status?: string | null;
  auth_payer?: string | null;
  auth_dos_start?: string | null;
  auth_dos_end?: string | null;
}

interface RoutingDecision {
  claim_id?: string;
  decision: 'manual_review' | 'approved';
  reason: string;
  recommended_plan?: string;
  alternate_plan?: string;
  uplift_amount?: number;
  anthem_expected?: number;
  blueshield_expected?: number;
  confidence_score?: number;
  financial_tier?: string;
  manual_review_code?: string;
  rate_basis?: string;
}

interface MatchedContract {
  rateBasis: string;
  expectedAmount: number;
  reimbursementRate: number;
}

function getFinancialTier(uplift: number): string {
  if (uplift < 500) return "Tier 1 - Low"
  if (uplift <= 5000) return "Tier 2 - Moderate"
  if (uplift <= 25000) return "Tier 3 - High"
  return "Tier 4 - Critical"
}

function resolvePlanContract(
  planName: string,
  claim: Claim,
  contractMap: Map<string, Record<string, unknown>>
): MatchedContract | undefined {
  const { product_type, charge_amount, cpt_code, rev_code } = claim

  // Step 1 — CPT lookup
  try {
    if (cpt_code && cpt_code.trim() !== '') {
      const contract = contractMap.get(`cpt+${planName}+${cpt_code}`)
      if (contract) {
        if (contract.base_rate !== null && contract.base_rate !== undefined) {
          return {
            rateBasis: `CPT ${cpt_code}`,
            expectedAmount: Number(contract.base_rate),
            reimbursementRate: 0
          }
        } else if (contract.percentage_of_charges !== null && contract.percentage_of_charges !== undefined) {
          const pct = Number(contract.percentage_of_charges)
          const factor = pct > 1 ? pct / 100 : pct
          return {
            rateBasis: `CPT ${cpt_code}`,
            expectedAmount: Number(charge_amount) * factor,
            reimbursementRate: factor
          }
        }
      }
    }
  } catch {
    // Graceful fallback to next tier
  }

  // Step 2 — Rev code lookup
  try {
    if (rev_code && rev_code.trim() !== '') {
      const contract = contractMap.get(`rev+${planName}+${rev_code}`)
      if (contract) {
        if (contract.base_rate !== null && contract.base_rate !== undefined) {
          return {
            rateBasis: `Rev Code ${rev_code}`,
            expectedAmount: Number(contract.base_rate),
            reimbursementRate: 0
          }
        } else if (contract.percentage_of_charges !== null && contract.percentage_of_charges !== undefined) {
          const pct = Number(contract.percentage_of_charges)
          const factor = pct > 1 ? pct / 100 : pct
          return {
            rateBasis: `Rev Code ${rev_code}`,
            expectedAmount: Number(charge_amount) * factor,
            reimbursementRate: factor
          }
        }
      }
    }
  } catch {
    // Graceful fallback to next tier
  }

  // Step 3 — Product type fallback
  try {
    const fallback = contractMap.get(`product+${planName}+${product_type}`)
    if (fallback) {
      const rate = Number(fallback.reimbursement_rate || 0)
      const expectedAmount = Number(charge_amount) * rate
      return {
        rateBasis: 'Product Type',
        expectedAmount,
        reimbursementRate: rate
      }
    }
  } catch {
    // Graceful fallback
  }

  return undefined
}

function processClaim(
  claim: Claim,
  prefixMap: Map<string, Record<string, unknown>>,
  contractMap: Map<string, Record<string, unknown>>
): RoutingDecision {
  const { product_type } = claim

  const anthemResolved = resolvePlanContract('Anthem', claim, contractMap)
  const bsResolved = resolvePlanContract('Blue Shield', claim, contractMap)

  const contracts: { plan_name: string; reimbursement_rate: number }[] = []
  if (anthemResolved) {
    contracts.push({ plan_name: 'Anthem', reimbursement_rate: anthemResolved.reimbursementRate })
  }
  if (bsResolved) {
    contracts.push({ plan_name: 'Blue Shield', reimbursement_rate: bsResolved.reimbursementRate })
  }

  const anthemExpected = anthemResolved ? Number(anthemResolved.expectedAmount.toFixed(2)) : null
  const blueshieldExpected = bsResolved ? Number(bsResolved.expectedAmount.toFixed(2)) : null

  // Calculate expected uplift if both plans have contracts
  let upliftAmount = 0
  if (anthemExpected !== null && blueshieldExpected !== null) {
    upliftAmount = Math.abs(anthemExpected - blueshieldExpected)
  }

  // 1. Look up alpha prefix
  const prefixData = prefixMap.get(claim.alpha_prefix)

  // DOS Validation
  const claimDate = new Date(claim.dos)
  const today = new Date()
  const msPerDay = 24 * 60 * 60 * 1000
  const diffDays = (today.getTime() - claimDate.getTime()) / msPerDay

  // Define Force Exclusions
  const isPrefixInvalid = !prefixData
  const isFutureDos = claimDate > today
  const isMA = product_type === 'MA'
  const isFEP = product_type === 'FEP'
  const isMAorFEP = isMA || isFEP
  const hasNoContracts = !anthemResolved && !bsResolved

  // Eligibility score
  let eligibilityScore = 0
  const knownProducts = ['PPO', 'POS', 'HMO', 'EPO', 'MA', 'FEP']

  if (!claim.alpha_prefix) {
    eligibilityScore -= 30
  } else if (!isPrefixInvalid) {
    eligibilityScore += 10
  } else {
    eligibilityScore -= 25
  }

  if (!isMAorFEP) {
    eligibilityScore += 10
    eligibilityScore += 5
  } else {
    eligibilityScore -= 100
  }

  if (product_type === 'PPO' || product_type === 'POS') {
    eligibilityScore += 5
  }

  if (!knownProducts.includes(product_type)) {
    eligibilityScore -= 15
  }

  if (prefixData && prefixData.license_status === 'licensed' && prefixData.contracted_provider === true) {
    eligibilityScore += 5
  }

  eligibilityScore = Math.min(30, eligibilityScore)

  // DOS/Contract score
  let dosContractScore = 0
  if (anthemResolved && bsResolved) {
    dosContractScore += 10
  } else if (anthemResolved || bsResolved) {
    dosContractScore += 5
  } else if (hasNoContracts) {
    dosContractScore -= 25
  }

  if (isFutureDos) {
    dosContractScore -= 100
  } else if (diffDays <= 365) {
    dosContractScore += 10
  } else {
    dosContractScore -= 15
  }

  dosContractScore = Math.min(25, dosContractScore)

  // Reimbursement score
  let reimbursementScore = 0
  if (anthemResolved && bsResolved) {
    if (upliftAmount > 500) {
      reimbursementScore += 25
    } else if (upliftAmount >= 100) {
      reimbursementScore += 15
    } else {
      reimbursementScore += 5
    }
  } else if (anthemResolved || bsResolved) {
    reimbursementScore += 10
  } else {
    reimbursementScore += 0
  }

  reimbursementScore = Math.min(25, reimbursementScore)

  // Operational risk
  let operationalRiskScore = 0
  const hasDosWarning = diffDays > 365

  if (!hasNoContracts && !hasDosWarning) {
    operationalRiskScore += 20
  } else {
    if (hasNoContracts) operationalRiskScore -= 10
    if (hasDosWarning) operationalRiskScore -= 10
  }

  operationalRiskScore = Math.min(20, operationalRiskScore)

  let authAdjustment = 0
  if (claim.auth_status !== undefined && claim.auth_status !== null) {
    const authStatus = claim.auth_status.trim()
    const authPayer = (claim.auth_payer || '').trim()

    const anthemExp = anthemExpected !== null ? anthemExpected : 0
    const bsExp = blueshieldExpected !== null ? blueshieldExpected : 0
    const higherPlan = anthemExp >= bsExp ? 'Anthem' : 'Blue Shield'
    const lowerPlan = anthemExp >= bsExp ? 'Blue Shield' : 'Anthem'

    if (authStatus === 'not_required') {
      authAdjustment = 5
    } else if (authStatus === 'valid' && authPayer === 'Both') {
      authAdjustment = 8
    } else if (authStatus === 'valid' && authPayer === higherPlan) {
      authAdjustment = 10
    } else if (authStatus === 'valid' && authPayer === lowerPlan) {
      authAdjustment = -25
    } else if (authStatus === 'missing') {
      authAdjustment = -35
    } else if (authStatus === 'payer_mismatch') {
      authAdjustment = -30
    } else if (authStatus === 'dos_mismatch') {
      authAdjustment = -25
    } else if (authStatus === 'service_mismatch') {
      authAdjustment = -20
    } else if (authStatus === 'provider_mismatch') {
      authAdjustment = -20
    }
  }

  let totalScore = eligibilityScore + dosContractScore + reimbursementScore + operationalRiskScore + authAdjustment
  totalScore = Math.max(0, Math.min(100, totalScore))

  const reasonParts: string[] = []
  if (prefixData && prefixData.license_status === 'licensed' && prefixData.contracted_provider === true) {
    reasonParts.push('Provider contracted and licensed for this prefix')
  }
  let decision: 'approved' | 'manual_review' = 'approved'
  let manualReviewCode: string | undefined = undefined

  if (isFutureDos) {
    decision = 'manual_review'
    manualReviewCode = 'MR-002'
    reasonParts.push('Invalid date of service - future date detected')
  } else if (isPrefixInvalid) {
    decision = 'manual_review'
    manualReviewCode = 'MR-001'
    reasonParts.push('Invalid or inactive alpha prefix | Prefix not recognized')
  } else if (isMA) {
    decision = 'manual_review'
    manualReviewCode = 'MR-008'
    reasonParts.push('Medicare Advantage or FEP product excluded from BlueCard routing')
  } else if (isFEP) {
    decision = 'manual_review'
    manualReviewCode = 'MR-009'
    reasonParts.push('Medicare Advantage or FEP product excluded from BlueCard routing')
  } else if (hasNoContracts) {
    decision = 'manual_review'
    manualReviewCode = 'MR-004'
    reasonParts.push('No contracts found for this product type')
  } else if (totalScore < 70) {
    decision = 'manual_review'
    reasonParts.push(`Uncertain or unsafe confidence level (${totalScore}/100)`)
  } else {
    if (anthemExpected !== null && blueshieldExpected !== null) {
      const chosenPlan = anthemExpected >= blueshieldExpected ? 'Anthem' : 'Blue Shield'
      reasonParts.push(`Routed to ${chosenPlan} for highest reimbursement`)
    } else if (anthemExpected !== null) {
      reasonParts.push(`Only one contracted plan found: Anthem`)
    } else if (blueshieldExpected !== null) {
      reasonParts.push(`Only one contracted plan found: Blue Shield`)
    }
  }

  if (hasDosWarning) {
    reasonParts.push('Warning: Date of service is over 1 year old - prefix may have changed')
  }

  let recommendedPlan: string | undefined = undefined
  let alternatePlan: string | undefined = undefined

  if (anthemExpected !== null && blueshieldExpected !== null) {
    if (anthemExpected >= blueshieldExpected) {
      recommendedPlan = 'Anthem'
      alternatePlan = 'Blue Shield'
    } else {
      recommendedPlan = 'Blue Shield'
      alternatePlan = 'Anthem'
    }
  } else if (anthemExpected !== null) {
    recommendedPlan = 'Anthem'
  } else if (blueshieldExpected !== null) {
    recommendedPlan = 'Blue Shield'
  }

  let customReason: string | undefined = undefined

  if (claim.auth_status !== undefined && claim.auth_status !== null && decision !== 'manual_review') {
    const authStatus = claim.auth_status.trim()
    const authPayer = (claim.auth_payer || '').trim()
    const anthemExp = anthemExpected !== null ? anthemExpected : 0
    const bsExp = blueshieldExpected !== null ? blueshieldExpected : 0
    const higherPlan = anthemExp >= bsExp ? 'Anthem' : 'Blue Shield'
    const lowerPlan = anthemExp >= bsExp ? 'Blue Shield' : 'Anthem'

    if (authStatus === 'valid' && (authPayer === higherPlan || authPayer === 'Both')) {
      reasonParts.push('Auth validated for recommended payer.')
    } else if (authStatus === 'valid' && authPayer === lowerPlan) {
      decision = 'manual_review'
      manualReviewCode = 'MR-006'
      customReason = `Authorization is tied to ${authPayer}, which models lower reimbursement. Routing to higher-paying payer may create denial risk. Auth Conflict flagged.`
    } else if (authStatus === 'missing') {
      decision = 'manual_review'
      manualReviewCode = 'MR-006'
      customReason = 'Authorization required but not found. Claim held pending auth verification.'
    } else if (authStatus === 'not_required') {
      reasonParts.push('No auth required for this product/service.')
    } else if (authStatus === 'payer_mismatch') {
      decision = 'manual_review'
      manualReviewCode = 'MR-006'
      customReason = 'Auth payer does not match recommended routing payer. Manual review required.'
    } else if (authStatus === 'dos_mismatch') {
      decision = 'manual_review'
      manualReviewCode = 'MR-006'
      customReason = 'Authorization does not cover the date of service. DOS mismatch flagged.'
    } else if (authStatus === 'service_mismatch') {
      decision = 'manual_review'
      manualReviewCode = 'MR-006'
      customReason = 'Authorization does not match the billed service type. Service mismatch flagged.'
    } else if (authStatus === 'provider_mismatch') {
      decision = 'manual_review'
      manualReviewCode = 'MR-006'
      customReason = 'Authorization is tied to a different facility or provider. Entity mismatch flagged.'
    }
  }

  let rateBasis = 'Product Type'
  if (recommendedPlan === 'Anthem' && anthemResolved) {
    rateBasis = anthemResolved.rateBasis
  } else if (recommendedPlan === 'Blue Shield' && bsResolved) {
    rateBasis = bsResolved.rateBasis
  } else {
    if (anthemResolved) {
      rateBasis = anthemResolved.rateBasis
    } else if (bsResolved) {
      rateBasis = bsResolved.rateBasis
    }
  }

  reasonParts.push(`Rate basis: ${rateBasis}`)
  const finalReason = customReason ? customReason : reasonParts.join('|')
  const financialTier = getFinancialTier(upliftAmount)

  return {
    claim_id: claim.id,
    decision: decision || 'manual_review',
    reason: finalReason || '',
    recommended_plan: recommendedPlan || 'Anthem',
    alternate_plan: alternatePlan || undefined,
    uplift_amount: isNaN(upliftAmount) ? 0 : Number(upliftAmount.toFixed(2)),
    anthem_expected: anthemExpected !== null && !isNaN(anthemExpected) ? Number(anthemExpected.toFixed(2)) : 0,
    blueshield_expected: blueshieldExpected !== null && !isNaN(blueshieldExpected) ? Number(blueshieldExpected.toFixed(2)) : 0,
    confidence_score: totalScore !== undefined && totalScore !== null ? totalScore : 0,
    financial_tier: financialTier || 'Tier 1 - Low',
    manual_review_code: manualReviewCode,
    rate_basis: rateBasis || 'Product Type'
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ""
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ""
    const supabase = createClient(supabaseUrl, supabaseKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const { batch_id, client_id } = await req.json()
    if (!batch_id || !client_id) {
      return new Response(JSON.stringify({ error: 'batch_id and client_id are required' }), { status: 400, headers: corsHeaders })
    }

    // Fetch active prefixes
    const { data: prefixes } = await supabase
      .from('alpha_prefix_reference')
      .select('*')
      .eq('is_active', true)

    const prefixMap = new Map<string, Record<string, unknown>>()
    if (prefixes) {
      prefixes.forEach((p: Record<string, unknown>) => {
        if (p.prefix) {
          prefixMap.set(p.prefix as string, p)
        }
      })
    }

    // Fetch contracts
    const { data: contractsData } = await supabase
      .from('plan_contracts')
      .select('*')
      .eq('client_id', client_id)

    const contractMap = new Map<string, Record<string, unknown>>()
    if (contractsData) {
      contractsData.forEach((c: Record<string, unknown>) => {
        if (c.rate_type === 'cpt' && c.cpt_code) {
          contractMap.set(`cpt+${c.plan_name}+${c.cpt_code}`, c)
        } else if (c.rate_type === 'rev_code' && c.rev_code) {
          contractMap.set(`rev+${c.plan_name}+${c.rev_code}`, c)
        } else if (c.product_type) {
          contractMap.set(`product+${c.plan_name}+${c.product_type}`, c)
        }
      })
    }

    // Fetch claims
    const { data: rawClaims } = await supabase
      .from('claims')
      .select('*')
      .eq('client_id', client_id)
      .eq('batch_id', batch_id)

    if (!rawClaims || rawClaims.length === 0) {
      return new Response(JSON.stringify({ message: 'No claims found' }), { headers: corsHeaders })
    }

    // Patient duplicates matching
    const patientIds = Array.from(new Set(rawClaims.map((c: Record<string, unknown>) => c.patient_id)))
    const { data: otherClaims } = await supabase
      .from('claims')
      .select('patient_id, dos')
      .eq('client_id', client_id)
      .neq('batch_id', batch_id)
      .in('patient_id', patientIds)

    const duplicateClaimIds: string[] = []
    const pendingClaims: Claim[] = []

    for (const claim of rawClaims) {
      if (claim.status === 'duplicate') continue

      const isDuplicate = (otherClaims || []).some(
        (oc: Record<string, unknown>) => oc.patient_id === claim.patient_id && oc.dos === claim.dos
      )

      if (isDuplicate) {
        duplicateClaimIds.push(claim.id)
      } else if (claim.status === 'pending') {
        pendingClaims.push(claim as Claim)
      }
    }

    if (duplicateClaimIds.length > 0) {
      await supabase
        .from('claims')
        .update({ status: 'duplicate' })
        .in('id', duplicateClaimIds)
    }

    if (pendingClaims.length === 0) {
      await supabase
        .from('batches')
        .update({ status: 'open', approved_count: 0, manual_review_count: 0, total_uplift: 0 })
        .eq('id', batch_id)
      return new Response(JSON.stringify({ message: 'No pending claims to process' }), { headers: corsHeaders })
    }

    let processedCount = 0
    let manualReviewCount = 0
    let totalUplift = 0

    const decisionsToInsert = []
    const processedClaimIds = []

    for (const claim of pendingClaims) {
      const decisionResult = processClaim(claim, prefixMap, contractMap)

      decisionsToInsert.push({
        batch_id,
        claim_id: claim.id,
        decision: decisionResult.decision,
        reason: decisionResult.reason,
        recommended_plan: decisionResult.recommended_plan || null,
        alternate_plan: decisionResult.alternate_plan || null,
        uplift_amount: decisionResult.uplift_amount || null,
        anthem_expected: decisionResult.anthem_expected || null,
        blueshield_expected: decisionResult.blueshield_expected || null,
        confidence_score: decisionResult.confidence_score !== undefined ? decisionResult.confidence_score : null,
        financial_tier: decisionResult.financial_tier || null,
        manual_review_code: decisionResult.manual_review_code || null
      })

      processedClaimIds.push(claim.id)

      if (decisionResult.decision === 'manual_review') {
        manualReviewCount++
      } else {
        processedCount++
      }
      if (decisionResult.uplift_amount) {
        totalUplift += decisionResult.uplift_amount
      }
    }

    // Bulk insert decisions
    if (decisionsToInsert.length > 0) {
      await supabase
        .from('routing_decisions')
        .insert(decisionsToInsert)
    }

    // Bulk update claim statuses
    if (processedClaimIds.length > 0) {
      await supabase
        .from('claims')
        .update({ status: 'processed' })
        .in('id', processedClaimIds)
    }

    // Update batch record
    await supabase
      .from('batches')
      .update({
        status: 'open',
        approved_count: processedCount,
        manual_review_count: manualReviewCount,
        total_uplift: totalUplift
      })
      .eq('id', batch_id)

    return new Response(JSON.stringify({
      message: 'Processing complete',
      processed: processedCount,
      manual_review: manualReviewCount,
      total: rawClaims.length
    }), { headers: corsHeaders })

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: errorMsg }), { status: 500, headers: corsHeaders })
  }
})
