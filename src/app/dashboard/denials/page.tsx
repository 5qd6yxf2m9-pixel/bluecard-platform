import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DenialsClient, DenialClaim } from '@/components/DenialsClient'

export const dynamic = 'force-dynamic'

export default async function DenialsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch client ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.client_id) {
    return (
      <div className="p-8 text-red-500 font-bold bg-white text-center rounded-xl border border-red-200 max-w-lg mx-auto my-20 shadow-sm">
        Error: Profile or client_id not found. Please contact administration.
      </div>
    )
  }

  // Fetch all denial claims for this client
  const { data: claimsData } = await supabase
    .from('denial_claims')
    .select('*')
    .eq('client_id', profile.client_id)
    .order('created_at', { ascending: false })

  const claims = (claimsData || []) as unknown as DenialClaim[]

  return (
    <DenialsClient 
      clientId={profile.client_id}
      userEmail={user.email || ''}
      initialClaims={claims}
    />
  )
}
