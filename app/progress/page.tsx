import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { serverFetchJSON } from '@/lib/server-fetch'
import ProgressPageClient, {
  type Stats,
  type Timeline,
  type TeamMember,
  type Period
} from './ProgressPageClient'

const DEFAULT_PERIOD: Period = 'week'

function getDateRange(period: Period, customStart?: string, customEnd?: string) {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const start = new Date()
  start.setHours(0, 0, 0, 0)

  switch (period) {
    case 'day':
      break
    case 'week':
      start.setDate(start.getDate() - 6)
      break
    case 'month':
      start.setDate(start.getDate() - 29)
      break
    case 'custom':
      if (customStart && customEnd) {
        return {
          startDate: new Date(customStart).toISOString(),
          endDate: new Date(customEnd).toISOString()
        }
      }
      break
  }

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString()
  }
}

type StatsResponse = Stats & { ok: boolean }

export default async function ProgressPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const { startDate, endDate } = getDateRange(DEFAULT_PERIOD)
  const userRole = session.user.role as 'admin' | 'supervisor' | 'labeller'

  const [statsData, timelineData, teamData] = await Promise.all([
    serverFetchJSON<StatsResponse>(`/api/progress/stats?startDate=${startDate}&endDate=${endDate}`),
    serverFetchJSON<{ timeline: Timeline[] }>(
      `/api/progress/timeline?startDate=${startDate}&endDate=${endDate}&granularity=day`
    ),
    userRole === 'admin' || userRole === 'supervisor'
      ? serverFetchJSON<{ team: TeamMember[] }>(`/api/progress/team?startDate=${startDate}&endDate=${endDate}`)
      : Promise.resolve(null)
  ])

  return (
    <ProgressPageClient
      initialStats={statsData?.ok ? statsData : null}
      initialTimeline={timelineData?.timeline ?? []}
      initialTeam={teamData?.team ?? []}
      userRole={userRole}
      defaultPeriod={DEFAULT_PERIOD}
    />
  )
}

