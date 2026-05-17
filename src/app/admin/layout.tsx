import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
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

  const handleSignOut = async () => {
    'use server'
    const supabaseClient = createClient()
    await supabaseClient.auth.signOut()
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      <div className="w-full md:w-64 bg-white shadow-md flex flex-col min-h-screen">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-blue-800">Admin Panel</h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/dashboard" className="block px-4 py-2 rounded-md text-gray-700 hover:bg-gray-100 font-medium">&larr; Back to Dashboard</Link>
          <Link href="/admin" className="block px-4 py-2 rounded-md text-gray-700 hover:bg-gray-100 font-medium">Admin Home</Link>
          <Link href="/admin/clients" className="block px-4 py-2 rounded-md text-gray-700 hover:bg-gray-100 font-medium">Clients</Link>
          <Link href="/admin/prefixes" className="block px-4 py-2 rounded-md text-gray-700 hover:bg-gray-100 font-medium">Prefix Manager</Link>
        </nav>
        <div className="p-4 border-t border-gray-200">
          <form action={handleSignOut}>
            <button type="submit" className="w-full text-left px-4 py-2 rounded-md text-red-600 hover:bg-red-50 font-medium">
              Sign Out
            </button>
          </form>
        </div>
      </div>
      <div className="flex-1 flex flex-col">
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Admin Dashboard</h2>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
