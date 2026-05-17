import { createClient } from '@/lib/supabase/server'
import { PrefixManagerClient, AlphaPrefixReference } from '@/components/PrefixManagerClient'

export default async function PrefixesPage() {
  const supabase = createClient()
  const { data: prefixesData } = await supabase
    .from('alpha_prefix_reference')
    .select('*')
    .order('prefix', { ascending: true })

  const prefixes = (prefixesData || []) as AlphaPrefixReference[]

  return <PrefixManagerClient initialPrefixes={prefixes} />
}
