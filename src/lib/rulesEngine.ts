// REMINDER: Run the following SQL migrations in Supabase console:
// ALTER TABLE routing_decisions ADD COLUMN IF NOT EXISTS financial_tier text;
// ALTER TABLE routing_decisions ADD COLUMN IF NOT EXISTS manual_review_code text;

import { SupabaseClient } from '@supabase/supabase-js'

export interface Claim {
  id: string;
  client_id: string;
  alpha_prefix: string;
  dos: string;
  product_type: string;
  payer_name: string;
  charge_amount: number;
  cpt_code?: string | null;
  rev_code?: string | null;
}

export interface RoutingDecision {
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

export function getFinancialTier(uplift: number): string {
  if (uplift < 500) return "Tier 1 - Low"
  if (uplift <= 5000) return "Tier 2 - Moderate"
  if (uplift <= 25000) return "Tier 3 - High"
  return "Tier 4 - Critical"
}

interface MatchedContract {
  rateBasis: string;
  expectedAmount: number;
  reimbursementRate: number;
}

async function resolvePlanContract(
  planName: string,
  claim: Claim,
  supabase: SupabaseClient,
  contractMap?: Map<string, Record<string, unknown>>
): Promise<MatchedContract | undefined> {
  const { client_id, product_type, charge_amount, cpt_code, rev_code } = claim

  // Priority 1 — CPT-level rate
  if (cpt_code) {
    let contract: Record<string, unknown> | null = null
    if (contractMap) {
      contract = (contractMap.get(`cpt+${planName}+${cpt_code}`) as Record<string, unknown>) || null
    } else {
      const { data } = await supabase
        .from('plan_contracts')
        .select('*')
        .eq('client_id', client_id)
        .eq('plan_name', planName)
        .eq('cpt_code', cpt_code)
        .eq('rate_type', 'cpt')
        .limit(1)
        .maybeSingle()
      if (data) {
        contract = data as unknown as Record<string, unknown>
      }
    }

    if (contract) {
      const isPercentage = contract.rate_basis === 'percentage' || contract.rate_type === 'percentage' || (Number(contract.percentage_of_charges || 0) > 0 && !contract.base_rate)
      const expectedAmount = isPercentage
        ? Number(charge_amount) * (Number(contract.percentage_of_charges || 0) / 100)
        : Number(contract.base_rate || 0)
      return {
        rateBasis: 'CPT',
        expectedAmount,
        reimbursementRate: isPercentage ? (Number(contract.percentage_of_charges || 0) / 100) : 0
      }
    }
  }

  // Priority 2 — Rev code rate
  if (rev_code) {
    let contract: Record<string, unknown> | null = null
    if (contractMap) {
      contract = (contractMap.get(`rev+${planName}+${rev_code}`) as Record<string, unknown>) || null
    } else {
      const { data } = await supabase
        .from('plan_contracts')
        .select('*')
        .eq('client_id', client_id)
        .eq('plan_name', planName)
        .eq('rev_code', rev_code)
        .eq('rate_type', 'rev_code')
        .limit(1)
        .maybeSingle()
      if (data) {
        contract = data as unknown as Record<string, unknown>
      }
    }

    if (contract) {
      const isPercentage = contract.rate_basis === 'percentage' || contract.rate_type === 'percentage' || (Number(contract.percentage_of_charges || 0) > 0 && !contract.base_rate)
      const expectedAmount = isPercentage
        ? Number(charge_amount) * (Number(contract.percentage_of_charges || 0) / 100)
        : Number(contract.base_rate || 0)
      return {
        rateBasis: 'Rev Code',
        expectedAmount,
        reimbursementRate: isPercentage ? (Number(contract.percentage_of_charges || 0) / 100) : 0
      }
    }
  }

  // Priority 3 — DRG rate (placeholder/skip)

  // Priority 4 — Product type rate
  let fallback: Record<string, unknown> | null = null
  if (contractMap) {
    fallback = (contractMap.get(`product+${planName}+${product_type}`) as Record<string, unknown>) || null
  } else {
    const { data } = await supabase
      .from('plan_contracts')
      .select('*')
      .eq('client_id', client_id)
      .eq('plan_name', planName)
      .eq('product_type', product_type)
      .is('cpt_code', null)
      .is('rev_code', null)
      .limit(1)
      .maybeSingle()
    if (data) {
      fallback = data as unknown as Record<string, unknown>
    }
  }

  if (fallback) {
    const rate = Number(fallback.reimbursement_rate || 0)
    const expectedAmount = Number(charge_amount) * rate
    return {
      rateBasis: 'Product Type',
      expectedAmount,
      reimbursementRate: rate
    }
  }

  return undefined
}

export async function processClain(
  claim: Claim, 
  supabase: SupabaseClient,
  prefixMap?: Map<string, Record<string, unknown>>,
  contractMap?: Map<string, Record<string, unknown>>
): Promise<RoutingDecision> {
  const { product_type } = claim

  const anthemResolved = await resolvePlanContract('Anthem', claim, supabase, contractMap)
  const bsResolved = await resolvePlanContract('Blue Shield', claim, supabase, contractMap)

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

  // 1. Look up the alpha prefix in alpha_prefix_reference
  let prefixData: Record<string, unknown> | undefined

  if (prefixMap) {
    prefixData = prefixMap.get(claim.alpha_prefix)
  } else {
    const { data: fallbackPrefixData } = await supabase
      .from('alpha_prefix_reference')
      .select('*')
      .eq('prefix', claim.alpha_prefix)
      .eq('is_active', true)
      .single()
    if (fallbackPrefixData) {
      prefixData = fallbackPrefixData as unknown as Record<string, unknown>
    }
  }

  // DOS Validation setup
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

  // 1. ELIGIBILITY CONFIDENCE (max 30 points)
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

  eligibilityScore = Math.min(30, eligibilityScore)

  // 2. DOS/CONTRACT CONFIDENCE (max 25 points)
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

  // 3. REIMBURSEMENT CONFIDENCE (max 25 points)
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

  // 4. OPERATIONAL RISK (max 20 points)
  let operationalRiskScore = 0
  const hasDosWarning = diffDays > 365

  if (!hasNoContracts && !hasDosWarning) {
    operationalRiskScore += 20
  } else {
    if (hasNoContracts) operationalRiskScore -= 10
    if (hasDosWarning) operationalRiskScore -= 10
  }

  operationalRiskScore = Math.min(20, operationalRiskScore)

  // CAPPED TOTAL SCORE
  let totalScore = eligibilityScore + dosContractScore + reimbursementScore + operationalRiskScore
  totalScore = Math.max(0, Math.min(100, totalScore))

  // Determine standard reason parts
  const reasonParts: string[] = []

  // Assign decision
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
    // Approved Decision reasons
    if (anthemExpected !== null && blueshieldExpected !== null) {
      const chosenPlan = anthemExpected >= blueshieldExpected ? 'Anthem' : 'Blue Shield'
      reasonParts.push(`Routed to ${chosenPlan} for highest reimbursement`)
    } else if (anthemExpected !== null) {
      reasonParts.push(`Only one contracted plan found: Anthem`)
    } else if (blueshieldExpected !== null) {
      reasonParts.push(`Only one contracted plan found: Blue Shield`)
    }
  }

  // Add age warning to reason if over 1 year
  if (hasDosWarning) {
    reasonParts.push('Warning: Date of service is over 1 year old - prefix may have changed')
  }

  // Recommended and alternate plan setups
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

  // Determine rate basis
  let rateBasis = 'Product Type'
  if (recommendedPlan === 'Anthem' && anthemResolved) {
    rateBasis = anthemResolved.rateBasis
  } else if (recommendedPlan === 'Blue Shield' && bsResolved) {
    rateBasis = bsResolved.rateBasis
  } else {
    if (anthemResolved?.rateBasis === 'CPT' || bsResolved?.rateBasis === 'CPT') {
      rateBasis = 'CPT'
    } else if (anthemResolved?.rateBasis === 'Rev Code' || bsResolved?.rateBasis === 'Rev Code') {
      rateBasis = 'Rev Code'
    }
  }

  reasonParts.push(`Rate basis: ${rateBasis}`)
  const finalReason = reasonParts.join('|')
  const financialTier = getFinancialTier(upliftAmount)

  return {
    claim_id: claim.id,
    decision,
    reason: finalReason,
    recommended_plan: recommendedPlan,
    alternate_plan: alternatePlan,
    uplift_amount: Number(upliftAmount.toFixed(2)),
    anthem_expected: anthemExpected || undefined,
    blueshield_expected: blueshieldExpected || undefined,
    confidence_score: totalScore,
    financial_tier: financialTier,
    manual_review_code: manualReviewCode,
    rate_basis: rateBasis
  }
}

