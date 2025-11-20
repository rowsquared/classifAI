import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { serverFetchJSON } from '@/lib/server-fetch'
import TeamPageClient, { type User } from './TeamPageClient'

export default async function TeamPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    redirect('/queue')
  }

  const data = await serverFetchJSON<{ users: User[] }>('/api/users')

  return <TeamPageClient initialUsers={data?.users ?? []} />
}

