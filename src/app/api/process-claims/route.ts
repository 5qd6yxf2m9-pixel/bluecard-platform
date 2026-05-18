import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processClain } from '@/lib/rulesEngine'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    // 1. Get authenticated session at the very top
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Fetch user's profile to verify existence
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('client_id')
      .eq('id', session.user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'No profile found' }, { status: 401 })
    }

    // 3. Parse JSON body
    const body = await request.json() as Record<string, unknown>
    const claim_id = body.claim_id as string
    const batch_id = body.batch_id as string

    if (!profile.client_id) {
      return NextResponse.json({ error: 'Profile has no client_id' }, { status: 400 })
    }

    // STEP 1 - Bulk fetch all needed data upfront before processing any claims
    // Fetch all active prefixes
    const { data: activePrefixes } = await supabase
      .from('alpha_prefix_reference')
      .select('*')
      .eq('is_active', true)

    // Fetch all client contracts
    const { data: clientContracts } = await supabase
      .from('plan_contracts')
      .select('*')
      .eq('client_id', profile.client_id)

    const prefixMap = new Map<string, Record<string, unknown>>()
    if (activePrefixes) {
      activePrefixes.forEach(p => {
        if (p.prefix) {
          prefixMap.set(p.prefix, p as unknown as Record<string, unknown>)
        }
      })
    }

    const contractMap = new Map<string, Record<string, unknown>>()
    if (clientContracts) {
      clientContracts.forEach(c => {
        if (c.plan_name && c.product_type) {
          contractMap.set(`${c.plan_name}+${c.product_type}`, c as unknown as Record<string, unknown>)
        }
      })
    }

    if (claim_id) {
      // Fetch that single claim
      const { data: claim, error: fetchError } = await supabase
        .from('claims')
        .select('*')
        .eq('client_id', profile.client_id)
        .eq('id', claim_id)
        .single()

      if (fetchError || !claim) {
        return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
      }

      // Update status to pending
      const { error: updatePendingError } = await supabase
        .from('claims')
        .update({ status: 'pending' })
        .eq('id', claim_id)

      if (updatePendingError) {
        return NextResponse.json({ error: 'Failed to update claim status to pending' }, { status: 500 })
      }

      // Process claim
      const decisionResult = await processClain(claim, supabase, prefixMap, contractMap)

      // Delete any existing routing decision for safety
      await supabase
        .from('routing_decisions')
        .delete()
        .eq('claim_id', claim_id)

      // Insert routing decision
      const { error: insertError } = await supabase
        .from('routing_decisions')
        .insert({
          batch_id: claim.batch_id,
          claim_id: claim.id,
          decision: decisionResult.decision,
          reason: decisionResult.reason,
          recommended_plan: decisionResult.recommended_plan || null,
          alternate_plan: decisionResult.alternate_plan || null,
          uplift_amount: decisionResult.uplift_amount || null,
          anthem_expected: decisionResult.anthem_expected || null,
          blueshield_expected: decisionResult.blueshield_expected || null,
          confidence_score: decisionResult.confidence_score !== undefined ? decisionResult.confidence_score : null,
        })

      if (insertError) {
        return NextResponse.json({ error: 'Failed to insert routing decision' }, { status: 500 })
      }

      // Update status to processed
      const { error: updateProcessedError } = await supabase
        .from('claims')
        .update({ status: 'processed' })
        .eq('id', claim_id)

      if (updateProcessedError) {
        return NextResponse.json({ error: 'Failed to update claim status to processed' }, { status: 500 })
      }

      // Recalculate batch stats
      const { count: approvedCount } = await supabase
        .from('routing_decisions')
        .select('*', { count: 'exact', head: true })
        .eq('batch_id', claim.batch_id)
        .eq('decision', 'approved')

      const { count: manualReviewCount } = await supabase
        .from('routing_decisions')
        .select('*', { count: 'exact', head: true })
        .eq('batch_id', claim.batch_id)
        .eq('decision', 'manual_review')

      const { data: upliftData } = await supabase
        .from('routing_decisions')
        .select('uplift_amount')
        .eq('batch_id', claim.batch_id)
        .eq('decision', 'approved')

      const totalUplift = (upliftData || []).reduce((sum, item) => sum + (item.uplift_amount || 0), 0)

      await supabase
        .from('batches')
        .update({
          approved_count: approvedCount || 0,
          manual_review_count: manualReviewCount || 0,
          total_uplift: totalUplift || 0
        })
        .eq('id', claim.batch_id)

      return NextResponse.json({ message: 'Claim processed successfully', decision: decisionResult.decision })
    }

    if (!batch_id) {
      return NextResponse.json({ error: 'batch_id is required' }, { status: 400 })
    }

    // 4. Get all claims for the batch
    const { data: rawClaims, error: rawClaimsError } = await supabase
      .from('claims')
      .select('*')
      .eq('client_id', profile.client_id)
      .eq('batch_id', batch_id)

    if (rawClaimsError || !rawClaims) {
      return NextResponse.json({ error: 'Failed to fetch claims' }, { status: 500 })
    }

    if (rawClaims.length === 0) {
      return NextResponse.json({ message: 'No claims found in batch', processed: 0, manual_review: 0 })
    }

    // 5. Detect patient duplicates in different batches
    const patientIds = Array.from(new Set(rawClaims.map(c => c.patient_id)))
    const { data: otherClaims } = await supabase
      .from('claims')
      .select('patient_id, dos')
      .eq('client_id', profile.client_id)
      .neq('batch_id', batch_id)
      .in('patient_id', patientIds)

    const duplicateClaimIds: string[] = []
    const pendingClaims = []

    for (const claim of rawClaims) {
      if (claim.status === 'duplicate') {
        continue
      }

      const isDuplicate = (otherClaims || []).some(
        oc => oc.patient_id === claim.patient_id && oc.dos === claim.dos
      )

      if (isDuplicate) {
        duplicateClaimIds.push(claim.id)
      } else if (claim.status === 'pending') {
        pendingClaims.push(claim)
      }
    }

    // Update duplicate claims in database
    if (duplicateClaimIds.length > 0) {
      const { error: duplicateError } = await supabase
        .from('claims')
        .update({ status: 'duplicate' })
        .in('id', duplicateClaimIds)

      if (duplicateError) {
        throw new Error(`Failed to update duplicate claims: ${duplicateError.message}`)
      }
    }

    if (pendingClaims.length === 0) {
      // All claims are duplicates or already processed
      await supabase
        .from('batches')
        .update({
          status: 'open',
          approved_count: 0,
          manual_review_count: 0,
          total_uplift: 0
        })
        .eq('id', batch_id)

      return NextResponse.json({ message: 'No pending claims to process', processed: 0, manual_review: 0, total: rawClaims.length })
    }

    let processedCount = 0
    let manualReviewCount = 0
    let totalUplift = 0

    const decisionsToInsert: Record<string, unknown>[] = []
    const processedClaimIds: string[] = []

    // STEP 4 - Bulk process all claims in memory after the initial bulk fetches
    for (const claim of pendingClaims) {
      const decisionResult = await processClain(claim, supabase, prefixMap, contractMap)
      
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

    // STEP 3 - Bulk insert routing decisions & bulk update claim statuses
    if (decisionsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('routing_decisions')
        .insert(decisionsToInsert)

      if (insertError) {
        throw new Error(`Failed to insert routing decisions: ${insertError.message}`)
      }
    }

    if (processedClaimIds.length > 0) {
      const { error: updateError } = await supabase
        .from('claims')
        .update({ status: 'processed' })
        .in('id', processedClaimIds)

      if (updateError) {
        throw new Error(`Failed to update claims status: ${updateError.message}`)
      }
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

    // Return summary
    return NextResponse.json({
      message: 'Processing complete',
      processed: processedCount,
      manual_review: manualReviewCount,
      total: rawClaims.length
    })

  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
