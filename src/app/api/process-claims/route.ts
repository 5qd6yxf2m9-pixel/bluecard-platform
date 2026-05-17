import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processClain } from '@/lib/rulesEngine'

export async function POST(request: Request) {
  try {
    const supabase = createClient()
    
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

    // 3. Get all pending claims for the user
    const { data: claims, error: claimsError } = await supabase
      .from('claims')
      .select('*')
      .eq('client_id', profile.client_id)
      .eq('status', 'pending')

    if (claimsError) {
      return NextResponse.json({ error: 'Failed to fetch claims' }, { status: 500 })
    }

    if (!claims || claims.length === 0) {
      return NextResponse.json({ message: 'No pending claims found', processed: 0, manual_review: 0 })
    }

    let processedCount = 0
    let manualReviewCount = 0
    const routingDecisionsToInsert = []
    const claimIdsToUpdate = []

    // 4. Run each claim through processClain
    for (const claim of claims) {
      const decisionResult = await processClain(claim, supabase)
      
      routingDecisionsToInsert.push({
        claim_id: claim.id,
        decision: decisionResult.decision,
        reason: decisionResult.reason,
        recommended_plan: decisionResult.recommended_plan || null,
        alternate_plan: decisionResult.alternate_plan || null,
        uplift_amount: decisionResult.uplift_amount || null,
      })

      claimIdsToUpdate.push(claim.id)

      if (decisionResult.decision === 'manual_review') {
        manualReviewCount++
      } else {
        processedCount++
      }
    }

    // 5. Insert into routing_decisions table
    if (routingDecisionsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('routing_decisions')
        .insert(routingDecisionsToInsert)

      if (insertError) {
        throw new Error(`Failed to insert routing decisions: ${insertError.message}`)
      }
    }

    // 6. Update claim status to 'processed'
    if (claimIdsToUpdate.length > 0) {
      const { error: updateError } = await supabase
        .from('claims')
        .update({ status: 'processed' })
        .in('id', claimIdsToUpdate)

      if (updateError) {
        throw new Error(`Failed to update claims status: ${updateError.message}`)
      }
    }

    // 7. Return summary
    return NextResponse.json({
      message: 'Processing complete',
      processed: processedCount,
      manual_review: manualReviewCount,
      total: claims.length
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
