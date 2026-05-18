import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processClain } from '@/lib/rulesEngine'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json() as Record<string, unknown>
    const batch_id = body.batch_id as string

    if (!batch_id) {
      return NextResponse.json({ error: 'batch_id is required' }, { status: 400 })
    }
    
    // 1. Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Fetch user's client_id from profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('client_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.client_id) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // 3. Get all pending claims for the batch
    const { data: claims, error: claimsError } = await supabase
      .from('claims')
      .select('*')
      .eq('client_id', profile.client_id)
      .eq('batch_id', batch_id)
      .eq('status', 'pending')

    if (claimsError) {
      return NextResponse.json({ error: 'Failed to fetch claims' }, { status: 500 })
    }

    if (!claims || claims.length === 0) {
      return NextResponse.json({ message: 'No pending claims found', processed: 0, manual_review: 0 })
    }

    let processedCount = 0
    let manualReviewCount = 0
    let totalUplift = 0

    // Process in chunks of 50
    const chunkSize = 50
    for (let i = 0; i < claims.length; i += chunkSize) {
      const chunk = claims.slice(i, i + chunkSize)
      const routingDecisionsToInsert = []
      const claimIdsToUpdate = []

      for (const claim of chunk) {
        const decisionResult = await processClain(claim, supabase)
        
        routingDecisionsToInsert.push({
          batch_id,
          claim_id: claim.id,
          decision: decisionResult.decision,
          reason: decisionResult.reason,
          recommended_plan: decisionResult.recommended_plan || null,
          alternate_plan: decisionResult.alternate_plan || null,
          uplift_amount: decisionResult.uplift_amount || null,
          anthem_expected: decisionResult.anthem_expected || null,
          blueshield_expected: decisionResult.blueshield_expected || null,
        })

        claimIdsToUpdate.push(claim.id)

        if (decisionResult.decision === 'manual_review') {
          manualReviewCount++
        } else {
          processedCount++
        }
        if (decisionResult.uplift_amount) {
          totalUplift += decisionResult.uplift_amount
        }
      }

      if (routingDecisionsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('routing_decisions')
          .insert(routingDecisionsToInsert)

        if (insertError) {
          throw new Error(`Failed to insert routing decisions: ${insertError.message}`)
        }
      }

      if (claimIdsToUpdate.length > 0) {
        const { error: updateError } = await supabase
          .from('claims')
          .update({ status: 'processed' })
          .in('id', claimIdsToUpdate)

        if (updateError) {
          throw new Error(`Failed to update claims status: ${updateError.message}`)
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

    // 7. Return summary
    return NextResponse.json({
      message: 'Processing complete',
      processed: processedCount,
      manual_review: manualReviewCount,
      total: claims.length
    })

  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
