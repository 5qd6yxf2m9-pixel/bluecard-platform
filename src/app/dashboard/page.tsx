import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6 text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Welcome to BlueCard Platform
            </h1>
            <p className="text-lg text-gray-600">
              Logged in as: <span className="font-semibold text-indigo-600">{user.email}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
