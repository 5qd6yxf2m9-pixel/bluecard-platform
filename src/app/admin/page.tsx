import { createClient } from '@/lib/supabase/server'

interface ClientStats {
  id: string;
  name: string;
  created_at: string;
  claims: { count: number }[];
}

export default async function AdminPage() {
  const supabase = createClient()

  // Run stats queries
  const [
    { count: clientsCount },
    { count: claimsCount },
    { count: prefixCount },
    { count: routingCount },
    { data: clientsData }
  ] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase.from('claims').select('*', { count: 'exact', head: true }).eq('status', 'processed'),
    supabase.from('alpha_prefix_reference').select('*', { count: 'exact', head: true }),
    supabase.from('routing_decisions').select('*', { count: 'exact', head: true }),
    supabase.from('clients').select('*, claims(count)')
  ])

  const clients = (clientsData || []) as unknown as ClientStats[]

  return (
    <div className="space-y-8">
      {/* STATS BAR */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
        <div className="bg-white shadow rounded-lg px-4 py-5 sm:p-6">
          <dt className="text-sm font-medium text-gray-500">Total Clients</dt>
          <dd className="mt-1 text-3xl font-semibold text-gray-900">{clientsCount || 0}</dd>
        </div>
        <div className="bg-white shadow rounded-lg px-4 py-5 sm:p-6">
          <dt className="text-sm font-medium text-gray-500">Processed Claims</dt>
          <dd className="mt-1 text-3xl font-semibold text-gray-900">{claimsCount || 0}</dd>
        </div>
        <div className="bg-white shadow rounded-lg px-4 py-5 sm:p-6">
          <dt className="text-sm font-medium text-gray-500">Total Prefixes</dt>
          <dd className="mt-1 text-3xl font-semibold text-gray-900">{prefixCount || 0}</dd>
        </div>
        <div className="bg-white shadow rounded-lg px-4 py-5 sm:p-6">
          <dt className="text-sm font-medium text-gray-500">Routing Decisions</dt>
          <dd className="mt-1 text-3xl font-semibold text-gray-900">{routingCount || 0}</dd>
        </div>
      </div>

      {/* CLIENTS LIST */}
      <div className="bg-white shadow sm:rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-base font-semibold leading-6 text-gray-900">Clients</h3>
        </div>
        <div className="border-t border-gray-200">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
              <tr>
                <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Name</th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Created Date</th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Total Claims</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {clients.map(client => (
                <tr key={client.id}>
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">{client.name}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{new Date(client.created_at).toLocaleDateString()}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{client.claims?.[0]?.count || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
