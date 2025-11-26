import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { serverFetchJSON } from '@/lib/server-fetch'
import TaxonomyAdminClient, { type Taxonomy } from './TaxonomyAdminClient'

export default async function TaxonomyAdminPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    redirect('/queue')
  }

  const data = await serverFetchJSON<{ ok: boolean; taxonomies: Taxonomy[]; learningThreshold?: number }>(
    '/api/taxonomies?includeDeleted=true'
  )

  return (
    <TaxonomyAdminClient
      initialTaxonomies={data?.taxonomies ?? []}
      initialLearningThreshold={data?.learningThreshold ?? 500}
    />
  )
}
