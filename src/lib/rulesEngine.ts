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
}

export function getFinancialTier(uplift: number): string {
  if (uplift < 500) return "Tier 1 - Low"
  if (uplift <= 5000) return "Tier 2 - Moderate"
  if (uplift <= 25000) return "Tier 3 - High"
  return "Tier 4 - Critical"
}

export async function processClain(
  claim: Claim, 
  supabase: SupabaseClient,
  prefixMap?: Map<string, Record<string, unknown>>,
  contractMap?: Map<string, Record<string, unknown>>
): Promise<RoutingDecision> {
  const { client_id, product_type, charge_amount } = claim

  let anthemContract: { plan_name: string; reimbursement_rate: number } | undefined
  let bsContract: { plan_name: string; reimbursement_rate: number } | undefined

  if (contractMap) {
    const anthemRaw = contractMap.get(`Anthem+${product_type}`)
    const bsRaw = contractMap.get(`Blue Shield+${product_type}`)
    if (anthemRaw) {
      anthemContract = {
        plan_name: String(anthemRaw.plan_name || 'Anthem'),
        reimbursement_rate: Number(anthemRaw.reimbursement_rate || 0)
      }
    }
    if (bsRaw) {
      bsContract = {
        plan_name: String(bsRaw.plan_name || 'Blue Shield'),
        reimbursement_rate: Number(bsRaw.reimbursement_rate || 0)
      }
    }
  } else {
    // Fetch contracts fallback
    const { data: fallbackContracts } = await supabase
      .from('plan_contracts')
      .select('plan_name, reimbursement_rate')
      .eq('client_id', client_id)
      .eq('product_type', product_type)

    const aC = fallbackContracts?.find(c => c.plan_name === 'Anthem')
    const bC = fallbackContracts?.find(c => c.plan_name === 'Blue Shield')
    if (aC) {
      anthemContract = {
        plan_name: String(aC.plan_name || 'Anthem'),
        reimbursement_rate: Number(aC.reimbursement_rate || 0)
      }
    }
    if (bC) {
      bsContract = {
        plan_name: String(bC.plan_name || 'Blue Shield'),
        reimbursement_rate: Number(bC.reimbursement_rate || 0)
      }
    }
  }

  const contracts: { plan_name: string; reimbursement_rate: number }[] = []
  if (anthemContract) contracts.push(anthemContract)
  if (bsContract) contracts.push(bsContract)

  const anthemExpected = anthemContract ? Number((charge_amount * anthemContract.reimbursement_rate).toFixed(2)) : null
  const blueshieldExpected = bsContract ? Number((charge_amount * bsContract.reimbursement_rate).toFixed(2)) : null

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
  const hasNoContracts = contracts.length === 0

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

  if (contracts.length === 2) {
    dosContractScore += 10
  } else if (contracts.length === 1) {
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

  if (contracts.length === 2) {
    if (upliftAmount > 500) {
      reimbursementScore += 25
    } else if (upliftAmount >= 100) {
      reimbursementScore += 15
    } else {
      reimbursementScore += 5
    }
  } else if (contracts.length === 1) {
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
    if (contracts.length === 2) {
      const sortedContracts = contracts.sort((a, b) => b.reimbursement_rate - a.reimbursement_rate)
      reasonParts.push(`Routed to ${sortedContracts[0].plan_name} for highest reimbursement`)
    } else {
      reasonParts.push(`Only one contracted plan found: ${contracts[0].plan_name}`)
    }
  }

  // Add age warning to reason if over 1 year
  if (hasDosWarning) {
    reasonParts.push('Warning: Date of service is over 1 year old - prefix may have changed')
  }

  const finalReason = reasonParts.join('|')
  const financialTier = getFinancialTier(upliftAmount)

  // Recommended and alternate plan setups
  let recommendedPlan: string | undefined = undefined
  let alternatePlan: string | undefined = undefined

  if (contracts.length === 2) {
    const sorted = [...contracts].sort((a, b) => b.reimbursement_rate - a.reimbursement_rate)
    recommendedPlan = sorted[0].plan_name
    alternatePlan = sorted[1].plan_name
  } else if (contracts.length === 1) {
    recommendedPlan = contracts[0].plan_name
  }

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
    manual_review_code: manualReviewCode
  }
}

