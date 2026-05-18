import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LeadsManagerClient, LeadData } from '@/components/LeadsManagerClient'

export default async function LeadsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    redirect('/dashboard')
  }

  // Fetch leads sorted by most recent first
  const { data: leadsData } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })

  const leads = (leadsData || []) as LeadData[]

  return <LeadsManagerClient initialLeads={leads} />
}
