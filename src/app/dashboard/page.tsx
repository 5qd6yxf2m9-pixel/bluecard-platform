import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardClient, BatchData } from '@/components/DashboardClient'

export default async function DashboardPage() {
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
    return <div className="p-8 text-red-500">Error: Profile or client_id not found.</div>
  }

  // Fetch batches
  const { data: batchesData } = await supabase
    .from('batches')
    .select('*')
    .eq('client_id', profile.client_id)
    .order('created_at', { ascending: false })

  const batches = (batchesData || []) as unknown as BatchData[]

  return (
    <DashboardClient 
      userEmail={user.email || ''} 
      clientId={profile.client_id}
      batches={batches}
      role={profile.role}
    />
  )
}
