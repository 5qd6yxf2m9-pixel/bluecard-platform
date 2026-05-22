import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processClain } from '@/lib/rulesEngine'

interface RoutingDecisionInsert {
  batch_id: string
  claim_id: string
  decision: string
  reason: string
  recommended_plan: string | null
  alternate_plan: string | null
  uplift_amount: number | null
  anthem_expected: number | null
  blueshield_expected: number | null
  confidence_score: number | null
  financial_tier: string | null
  manual_review_code: string | null
  rate_basis: string | null
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  let batchIdToRollback: string | null = null
  try {
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

    if (batch_id) {
      batchIdToRollback = batch_id
    }

    if (!profile.client_id) {
      return NextResponse.json({ error: 'Profile has no client_id' }, { status: 400 })
    }

    console.error('STEP 1: fetching prefixes')
    // STEP 1 - Bulk fetch all needed data upfront before processing any claims
    // Fetch all active prefixes with retry logic (up to 3 attempts total)
    let activePrefixes: Record<string, unknown>[] | null = null
    let prefixAttempts = 0
    while (prefixAttempts < 3) {
      try {
        const { data, error } = await supabase
          .from('alpha_prefix_reference')
          .select('*')
          .eq('is_active', true)

        if (error) {
          console.warn(`[prefix fetch] Attempt ${prefixAttempts + 1} failed:`, error.message)
        } else if (!data || data.length === 0) {
          console.warn(`[prefix fetch] Attempt ${prefixAttempts + 1} returned empty data`)
        } else {
          activePrefixes = data as unknown as Record<string, unknown>[]
          break
        }
      } catch {
        console.warn(`[prefix fetch] Attempt ${prefixAttempts + 1} encountered a connection/network error`)
      }

      prefixAttempts++
      if (prefixAttempts < 3) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    const prefixMap = new Map<string, Record<string, unknown>>()
    if (activePrefixes) {
      activePrefixes.forEach(p => {
        if (p.prefix) {
          prefixMap.set(p.prefix as string, p)
        }
      })
    }

    // If prefixMap is empty after all retries, return a 503 error
    if (prefixMap.size === 0) {
      console.error('[Error Step: prefix fetch] prefixMap is empty after all retries')
      return NextResponse.json(
        { error: 'Service temporarily unavailable - please try again in a moment' },
        { status: 503 }
      )
    }

    console.error('STEP 2: fetching contracts')
    // Fetch all client contracts
    const { data: clientContracts, error: contractError } = await supabase
      .from('plan_contracts')
      .select('*')
      .eq('client_id', profile.client_id)

    if (contractError) {
      console.error('[Error Step: contract fetch] Failed to fetch client contracts:', contractError.message)
      throw new Error(`Failed to fetch client contracts: ${contractError.message}`)
    }

    const contractMap = new Map<string, Record<string, unknown>>()
    if (clientContracts) {
      clientContracts.forEach(c => {
        if (c.rate_type === 'cpt' && c.cpt_code) {
          contractMap.set(`cpt+${c.plan_name}+${c.cpt_code}`, c as unknown as Record<string, unknown>)
        } else if (c.rate_type === 'rev_code' && c.rev_code) {
          contractMap.set(`rev+${c.plan_name}+${c.rev_code}`, c as unknown as Record<string, unknown>)
        } else if (c.product_type) {
          contractMap.set(`product+${c.plan_name}+${c.product_type}`, c as unknown as Record<string, unknown>)
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
          financial_tier: (decisionResult.financial_tier as string | undefined) || null,
          manual_review_code: (decisionResult.manual_review_code as string | undefined) || null,
          rate_basis: decisionResult.rate_basis || null
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

    const decisionsToInsert: RoutingDecisionInsert[] = []
    const processedClaimIds: string[] = []

    console.error('STEP 3: processing claims')
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
        financial_tier: (decisionResult.financial_tier as string | undefined) || null,
        manual_review_code: (decisionResult.manual_review_code as string | undefined) || null,
        rate_basis: decisionResult.rate_basis || null
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

    console.error('STEP 4: bulk insert decisions')
    // STEP 3 - Bulk insert routing decisions & bulk update claim statuses
    if (decisionsToInsert.length > 0) {
      const chunkSize = 100
      for (let i = 0; i < decisionsToInsert.length; i += chunkSize) {
        const chunk = decisionsToInsert.slice(i, i + chunkSize)
        if (chunk.length === 0) continue
        const { error: insertError } = await supabase
          .from('routing_decisions')
          .insert(chunk)
        if (insertError) {
          console.error('[Error Step: bulk insert] Failed to insert routing decisions chunk:', insertError.message)
          throw new Error('Failed to insert routing decisions chunk: ' + insertError.message)
        }
      }
    }

    console.error('STEP 5: updating claim statuses')
    const validIds = processedClaimIds.filter(id => id && typeof id === 'string' && id.length > 0)
    if (validIds.length > 0) {
      const chunkSize = 100
      for (let i = 0; i < validIds.length; i += chunkSize) {
        const chunk = validIds.slice(i, i + chunkSize)
        if (chunk.length === 0) continue
        const { error: updateError } = await supabase
          .from('claims')
          .update({ status: 'processed' })
          .in('id', chunk)
        if (updateError) {
          console.error('[Error Step: status update] Failed to update claims status chunk:', updateError.message)
          throw new Error('Failed to update claims status chunk: ' + updateError.message)
        }
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

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    const errorStack = err instanceof Error ? err.stack : 'no stack'

    console.error('[Error Step: processing pipeline] Processing failed. Rolling back all routing decisions...', errorMessage)
    if (batchIdToRollback) {
      // 1. Delete all routing decisions for that batch_id
      await supabase
        .from('routing_decisions')
        .delete()
        .eq('batch_id', batchIdToRollback)

      // 2. Reset all claims for that batch back to status = 'pending'
      await supabase
        .from('claims')
        .update({ status: 'pending' })
        .eq('batch_id', batchIdToRollback)

      // 3. Reset the batch record itself back to a clean state
      await supabase
        .from('batches')
        .update({
          status: 'open',
          approved_count: 0,
          manual_review_count: 0,
          total_uplift: 0
        })
        .eq('id', batchIdToRollback)
    }

    return NextResponse.json({ 
      error: errorMessage,
      stack: errorStack,
      step: 'check vercel logs for step details'
    }, { status: 500 })
  }
}
