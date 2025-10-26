import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export async function GET() {
  try {
    // Get authenticated session
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Build base visibility filter based on role
    let visibilityFilter: Prisma.SentenceWhereInput = {}
    
    if (session.user.role === 'labeller') {
      // Labellers can only see sentences assigned to them
      visibilityFilter = {
        assignments: {
          some: {
            userId: session.user.id
          }
        }
      }
    } else if (session.user.role === 'supervisor') {
      // Supervisors can see sentences assigned to themselves and their team
      const supervisor = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: {
          labellers: {
            include: {
              labellers: true // Nested - get labellers of supervised supervisors
            }
          }
        }
      })

      if (supervisor) {
        const visibleUserIds = new Set<string>([session.user.id])
        supervisor.labellers.forEach(labeller => {
          visibleUserIds.add(labeller.id)
          // Add nested labellers
          labeller.labellers.forEach(nestedLabeller => {
            visibleUserIds.add(nestedLabeller.id)
          })
        })

        visibilityFilter = {
          assignments: {
            some: {
              userId: { in: Array.from(visibleUserIds) }
            }
          }
        }
      }
    }
    // Admins see all sentences (no filter)
    
    // Get counts by status with visibility filter applied
    const [total, pending, submitted, skipped, flagged] = await Promise.all([
      prisma.sentence.count({ where: visibilityFilter }),
      prisma.sentence.count({ where: { ...visibilityFilter, status: 'pending' } }),
      prisma.sentence.count({ where: { ...visibilityFilter, status: 'submitted' } }),
      prisma.sentence.count({ where: { ...visibilityFilter, status: 'skipped' } }),
      prisma.sentence.count({ where: { ...visibilityFilter, flagged: true } })
    ])
    
    return NextResponse.json({
      ok: true,
      stats: {
        total,
        pending,
        submitted,
        skipped,
        flagged,
        progress: total > 0 ? Math.round((submitted / total) * 100) : 0
      }
    })
  } catch (error) {
    console.error('Failed to fetch sentence stats:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}

