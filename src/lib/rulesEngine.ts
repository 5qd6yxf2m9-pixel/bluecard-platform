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
}

export async function processClain(claim: Claim, supabase: SupabaseClient): Promise<RoutingDecision> {
  const { client_id, product_type, charge_amount } = claim

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
      reason: 'Invalid or inactive alpha prefix'
    }
  }

  // 2. If found and is a BlueCard Program prefix, the claim is valid and eligible for routing comparison

  // 3. Check if product_type is 'MA' or 'FEP'
  if (product_type === 'MA' || product_type === 'FEP') {
    return {
      decision: 'manual_review',
      reason: 'Medicare Advantage or FEP product excluded from BlueCard routing'
    }
  }

  // 4. Look up plan_contracts for this client_id and product_type
  const { data: contracts, error: contractsError } = await supabase
    .from('plan_contracts')
    .select('plan_name, reimbursement_rate')
    .eq('client_id', client_id)
    .eq('product_type', product_type)

  // 5. If neither plan has a contract
  if (contractsError || !contracts || contracts.length === 0) {
    return {
      decision: 'manual_review',
      reason: 'No contracts found for this product type'
    }
  }

  // 6. If only one plan has a contract, route to that plan
  if (contracts.length === 1) {
    return {
      decision: 'approved',
      reason: `Only one contracted plan found: ${contracts[0].plan_name}`,
      recommended_plan: contracts[0].plan_name,
      uplift_amount: 0
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

  // 9. Return approved decision
  return {
    decision: 'approved',
    reason: `Routed to ${bestPlan.plan_name} for highest reimbursement`,
    recommended_plan: bestPlan.plan_name,
    alternate_plan: alternatePlan.plan_name,
    uplift_amount: Number(upliftAmount.toFixed(2))
  }
}
