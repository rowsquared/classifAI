import SentenceAdminClient, { type SentenceImport } from './SentenceAdminClient'
import { serverFetchJSON } from '@/lib/server-fetch'

export default async function SentenceAdminPage() {
  const importsData = await serverFetchJSON<{ ok: boolean; imports: SentenceImport[] }>('/api/imports')
  const initialImports = importsData?.imports ?? []
  return <SentenceAdminClient initialImports={initialImports} />
}

