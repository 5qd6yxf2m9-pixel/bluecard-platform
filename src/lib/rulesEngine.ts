// REMINDER: Run the following SQL migrations in Supabase console:
// ALTER TABLE routing_decisions ADD COLUMN IF NOT EXISTS confidence_score integer;
// ALTER TABLE alpha_prefix_reference ADD COLUMN IF NOT EXISTS validated_date date;

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
}

export async function processClain(claim: Claim, supabase: SupabaseClient): Promise<RoutingDecision> {
  const { client_id, product_type, charge_amount } = claim

  // Fetch contracts first to have expected amounts available for all prefix scenarios
  const { data: contracts } = await supabase
    .from('plan_contracts')
    .select('plan_name, reimbursement_rate')
    .eq('client_id', client_id)
    .eq('product_type', product_type)

  const anthemContract = contracts?.find(c => c.plan_name === 'Anthem')
  const bsContract = contracts?.find(c => c.plan_name === 'Blue Shield')

  const anthemExpected = anthemContract ? Number((charge_amount * anthemContract.reimbursement_rate).toFixed(2)) : null
  const blueshieldExpected = bsContract ? Number((charge_amount * bsContract.reimbursement_rate).toFixed(2)) : null

  // Start confidence score at 100
  let score = 100

  // 1. Look up the alpha prefix in alpha_prefix_reference
  const { data: prefixData } = await supabase
    .from('alpha_prefix_reference')
    .select('*')
    .eq('prefix', claim.alpha_prefix)
    .eq('is_active', true)
    .single()

  if (!prefixData) {
    return {
      decision: 'manual_review',
      reason: 'Invalid or inactive alpha prefix',
      anthem_expected: anthemExpected || undefined,
      blueshield_expected: blueshieldExpected || undefined,
      confidence_score: 0
    }
  }

  // DOS Validation Step
  const claimDate = new Date(claim.dos)
  const today = new Date()

  // If DOS is in the future
  if (claimDate > today) {
    return {
      decision: 'manual_review',
      reason: 'Invalid date of service - future date detected',
      anthem_expected: anthemExpected || undefined,
      blueshield_expected: blueshieldExpected || undefined,
      confidence_score: 0
    }
  }

  const msPerDay = 24 * 60 * 60 * 1000
  const diffDays = (today.getTime() - claimDate.getTime()) / msPerDay
  let ageWarning = ''

  // If DOS is more than 365 days before today
  if (diffDays > 365) {
    score -= 10
    ageWarning = 'Warning: Date of service is over 1 year old - prefix may have changed'
  }

  // 2. If found and is a BlueCard Program prefix, the claim is valid and eligible for comparison

  // 3. Check if product_type is 'MA' or 'FEP'
  if (product_type === 'MA' || product_type === 'FEP') {
    return {
      decision: 'manual_review',
      reason: 'Medicare Advantage or FEP product excluded from BlueCard routing',
      confidence_score: 0
    }
  }

  // 5. If neither plan has a contract
  if (!contracts || contracts.length === 0) {
    return {
      decision: 'manual_review',
      reason: 'No contracts found for this product type',
      confidence_score: 0
    }
  }

  // 6. If only one plan has a contract, route to that plan
  if (contracts.length === 1) {
    score -= 20
    score -= 15 // Only 1 contract means comparison difference is effectively $0 (< $50)

    if (charge_amount < 500) {
      score -= 10
    }

    score = Math.max(0, score)
    const finalDecision = score >= 60 ? 'approved' : 'manual_review'
    
    const reasonParts: string[] = []
    
    // 1. Decision reason (always first)
    reasonParts.push(`Only one contracted plan found: ${contracts[0].plan_name}`)
    
    // 2. Confidence note (always second)
    if (score < 60) {
      reasonParts.push(`Low confidence (${score}/100)`)
    } else if (score >= 60 && score <= 84) {
      reasonParts.push(`Medium confidence verify before billing`)
    }

    // 3. Warning messages (always last)
    if (ageWarning) {
      reasonParts.push(ageWarning)
    }

    const finalReason = reasonParts.join('|')

    return {
      decision: finalDecision,
      reason: finalReason,
      recommended_plan: contracts[0].plan_name,
      uplift_amount: 0,
      anthem_expected: anthemExpected || undefined,
      blueshield_expected: blueshieldExpected || undefined,
      confidence_score: score
    }
  }

  // 7. If both plans have contracts, compare expected reimbursement
  const sortedContracts = contracts.sort((a, b) => b.reimbursement_rate - a.reimbursement_rate)
  const bestPlan = sortedContracts[0]
  const alternatePlan = sortedContracts[1]

  const bestReimbursement = charge_amount * bestPlan.reimbursement_rate
  const alternateReimbursement = charge_amount * alternatePlan.reimbursement_rate

  // 8. Set uplift_amount as the difference between the two expected reimbursements
  const upliftAmount = bestReimbursement - alternateReimbursement

  // Calculate deductions
  if (upliftAmount < 50) {
    score -= 15
  } else if (upliftAmount >= 50 && upliftAmount <= 100) {
    score -= 5
  }

  if (charge_amount < 500) {
    score -= 10
  }

  score = Math.max(0, score)
  const finalDecision = score >= 60 ? 'approved' : 'manual_review'
  
  const reasonParts: string[] = []
  
  // 1. Decision reason (always first)
  reasonParts.push(`Routed to ${bestPlan.plan_name} for highest reimbursement`)
  
  // 2. Confidence note (always second)
  if (score < 60) {
    reasonParts.push(`Low confidence (${score}/100)`)
  } else if (score >= 60 && score <= 84) {
    reasonParts.push(`Medium confidence verify before billing`)
  }

  // 3. Warning messages (always last)
  if (ageWarning) {
    reasonParts.push(ageWarning)
  }

  const finalReason = reasonParts.join('|')

  // 9. Return approved decision or manual review depending on score
  return {
    decision: finalDecision,
    reason: finalReason,
    recommended_plan: bestPlan.plan_name,
    alternate_plan: alternatePlan.plan_name,
    uplift_amount: Number(upliftAmount.toFixed(2)),
    anthem_expected: anthemExpected || undefined,
    blueshield_expected: blueshieldExpected || undefined,
    confidence_score: score
  }
}
