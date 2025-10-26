import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

/**
 * GET /api/progress/team?startDate=...&endDate=...
 * 
 * Returns team member performance (for supervisors and admins only)
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    })

    // Only supervisors and admins can view team stats
    if (user?.role !== 'supervisor' && user?.role !== 'admin') {
      return NextResponse.json({ 
        error: 'Only supervisors and admins can view team stats' 
      }, { status: 403 })
    }

    const searchParams = req.nextUrl.searchParams
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!startDate || !endDate) {
      return NextResponse.json({ 
        error: 'startDate and endDate are required' 
      }, { status: 400 })
    }

    const start = new Date(startDate)
    const end = new Date(endDate)

    // Get team members based on role
    let teamMemberIds: string[] = []

    if (user?.role === 'admin') {
      // Admins see all users
      const allUsers = await prisma.user.findMany({
        select: { id: true }
      })
      teamMemberIds = allUsers.map(u => u.id)
    } else {
      // Supervisors see their team
      const getSupervisedUserIds = async (supervisorId: string): Promise<string[]> => {
        const labellers = await prisma.user.findMany({
          where: { supervisorId },
          select: { id: true, role: true }
        })
        
        let allIds = labellers.map(l => l.id)
        
        // Recursively get supervised users for any supervisors
        for (const labeller of labellers) {
          if (labeller.role === 'supervisor') {
            const nested = await getSupervisedUserIds(labeller.id)
            allIds = allIds.concat(nested)
          }
        }
        
        return allIds
      }
      
      teamMemberIds = await getSupervisedUserIds(session.user.id)
      teamMemberIds.push(session.user.id) // Include supervisor themselves
    }

    // Get team member details with stats
    const teamMembers = await prisma.user.findMany({
      where: {
        id: { in: teamMemberIds }
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        assignedSentences: {
          select: {
            sentence: {
              select: {
                id: true,
                status: true,
                lastEditedAt: true
              }
            }
          }
        }
      }
    })

    // Calculate stats for each team member
    const teamStats = await Promise.all(teamMembers.map(async (member) => {
      const assignedSentenceIds = member.assignedSentences.map(a => a.sentence.id)

      // Sentences completed in period
      const completed = await prisma.sentence.count({
        where: {
          id: { in: assignedSentenceIds },
          status: 'submitted',
          lastEditedAt: {
            gte: start,
            lte: end
          }
        }
      })

      // Sentences skipped in period
      const skipped = await prisma.sentence.count({
        where: {
          id: { in: assignedSentenceIds },
          status: 'skipped',
          lastEditedAt: {
            gte: start,
            lte: end
          }
        }
      })

      // Total assigned
      const totalAssigned = assignedSentenceIds.length

      // Total completed (all time)
      const totalCompleted = await prisma.sentence.count({
        where: {
          id: { in: assignedSentenceIds },
          status: 'submitted'
        }
      })

      // Pending
      const pending = await prisma.sentence.count({
        where: {
          id: { in: assignedSentenceIds },
          status: 'pending'
        }
      })

      // Flagged in period
      const flagged = await prisma.sentence.count({
        where: {
          id: { in: assignedSentenceIds },
          flagged: true,
          lastEditedAt: {
            gte: start,
            lte: end
          }
        }
      })

      // Median time in period
      const labelingTimes = await prisma.$queryRaw<Array<{ median_seconds: number | null }>>`
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY 
          EXTRACT(EPOCH FROM ("createdAt" - "labelingStartedAt"))
        ) as median_seconds
        FROM "SentenceAnnotation"
        WHERE "labelingStartedAt" IS NOT NULL
          AND "createdAt" - "labelingStartedAt" < INTERVAL '30 minutes'
          AND "createdAt" >= ${start}
          AND "createdAt" <= ${end}
          AND "createdById" = ${member.id}
      `

      const medianTime = labelingTimes[0]?.median_seconds 
        ? Math.round(labelingTimes[0].median_seconds) 
        : null

      // AI agreement for this user in period
      const userAnnotations = await prisma.sentenceAnnotation.findMany({
        where: {
          createdById: member.id,
          createdAt: {
            gte: start,
            lte: end
          },
          source: 'user'
        },
        select: {
          sentenceId: true,
          level: true,
          nodeCode: true
        }
      })

      const aiAnnotations = await prisma.sentenceAnnotation.findMany({
        where: {
          sentenceId: { in: userAnnotations.map(a => a.sentenceId) },
          source: 'ai'
        },
        select: {
          sentenceId: true,
          level: true,
          nodeCode: true
        }
      })

      let aiAgreementMatches = 0
      let aiAgreementTotal = 0

      for (const userAnn of userAnnotations) {
        const correspondingAi = aiAnnotations.find(
          ai => ai.sentenceId === userAnn.sentenceId && ai.level === userAnn.level
        )
        if (correspondingAi) {
          aiAgreementTotal++
          if (correspondingAi.nodeCode === userAnn.nodeCode) {
            aiAgreementMatches++
          }
        }
      }

      const aiAgreementRate = aiAgreementTotal > 0
        ? Math.round((aiAgreementMatches / aiAgreementTotal) * 100)
        : null

      return {
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        stats: {
          totalAssigned,
          totalCompleted,
          pending,
          completedInPeriod: completed,
          skippedInPeriod: skipped,
          flaggedInPeriod: flagged,
          medianTime,
          aiAgreementRate,
          aiAgreementTotal
        }
      }
    }))

    return NextResponse.json({
      ok: true,
      period: {
        start: start.toISOString(),
        end: end.toISOString()
      },
      team: teamStats
    })

  } catch (error) {
    console.error('Team stats error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

