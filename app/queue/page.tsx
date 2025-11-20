import QueuePageClient, {
  type QueueResponse,
  type Stats,
  type Taxonomy,
  type QueueUser
} from './QueuePageClient'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { serverFetchJSON } from '@/lib/server-fetch'

function defaultStats(): Stats {
  return { total: 0, pending: 0, submitted: 0, skipped: 0, flagged: 0, progress: 0 }
}

export default async function QueuePage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const queueParams = new URLSearchParams({
    page: '1',
    limit: '100',
    sort: 'createdAt',
    order: 'asc',
    status: 'pending'
  })

  const [queueData, statsData, taxonomiesData, usersData, supervisorData] = await Promise.all([
    serverFetchJSON<QueueResponse>(`/api/sentences?${queueParams.toString()}`),
    serverFetchJSON<{ ok: boolean; stats: Stats }>(`/api/sentences/stats`),
    serverFetchJSON<{ ok: boolean; taxonomies: Taxonomy[] }>(`/api/taxonomies/active`),
    session.user.role === 'admin' || session.user.role === 'supervisor'
      ? serverFetchJSON<{ users: QueueUser[] }>(`/api/users`)
      : Promise.resolve(null),
    session.user.role === 'supervisor'
      ? serverFetchJSON<{ user?: { labellers?: Array<{ id: string }> } }>(`/api/users/${session.user.id}`)
      : Promise.resolve(null)
  ])

  const statsOk = Boolean(statsData?.ok)
  const stats = statsData?.ok ? statsData.stats : defaultStats()
  const taxonomies = taxonomiesData?.ok ? taxonomiesData.taxonomies : []
  const users: QueueUser[] =
    usersData?.users?.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name ?? null
    })) ?? []

  let canAssign = session.user.role === 'admin'
  if (!canAssign && session.user.role === 'supervisor') {
    canAssign = Boolean(supervisorData?.user?.labellers?.length)
  }

  return (
    <QueuePageClient
      initialQueue={queueData}
      initialStats={stats}
      initialTaxonomies={taxonomies}
      initialUsers={users}
      initialCanAssign={canAssign}
      initialStatsPrefetched={statsOk}
      currentUser={{ id: session.user.id, role: session.user.role as 'admin' | 'supervisor' | 'labeller' }}
    />
  )
}

