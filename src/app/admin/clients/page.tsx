import { createClient } from '@/lib/supabase/server'
import { ClientManagerClient, ClientData } from '@/components/ClientManagerClient'

export default async function ClientsPage() {
  const supabase = createClient()
  const { data: clientsData } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  const clients = (clientsData || []) as ClientData[]

  return <ClientManagerClient initialClients={clients} />
}
