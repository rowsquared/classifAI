import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  try {
    // Get authenticated session
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)

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

    // Build additional filters from query params
    const additionalFilters: Prisma.SentenceWhereInput = {}
    const AND: Prisma.SentenceWhereInput[] = []

    // Search query
    const q = searchParams.get('q')
    if (q) {
      const searchFilter: any = {
        OR: [
          { field1: { contains: q, mode: 'insensitive' } },
          { field2: { contains: q, mode: 'insensitive' } },
          { field3: { contains: q, mode: 'insensitive' } },
          { field4: { contains: q, mode: 'insensitive' } },
          { field5: { contains: q, mode: 'insensitive' } }
        ]
      }
      AND.push(searchFilter)
    }

    // Status filter (from filter panel, not tab)
    const statuses = searchParams.getAll('status')
    if (statuses.length > 0) {
      AND.push({ status: { in: statuses } })
    }

    // User filter
    const userId = searchParams.get('userId')
    if (userId) {
      AND.push({ lastEditedBy: userId })
    }

    // Assigned to filter
    const assignedToUserId = searchParams.get('assignedToUserId')
    if (assignedToUserId) {
      AND.push({
        assignments: {
          some: { userId: assignedToUserId }
        }
      })
    }

    // Date range filter
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    if (dateFrom || dateTo) {
      const dateFilter: any = {}
      if (dateFrom) dateFilter.gte = new Date(dateFrom)
      if (dateTo) {
        const endDate = new Date(dateTo)
        endDate.setHours(23, 59, 59, 999)
        dateFilter.lte = endDate
      }
      AND.push({ lastEditedAt: dateFilter })
    }

    // Taxonomy/Label filters
    const taxonomyKey = searchParams.get('taxonomyKey')
    const level = searchParams.get('level')
    const code = searchParams.get('code')
    const source = searchParams.get('source')

    if (taxonomyKey || level || code || source) {
      const annotationFilter: any = {
        annotations: {
          some: {}
        }
      }
      if (taxonomyKey) {
        const taxonomy = await prisma.taxonomy.findUnique({
          where: { key: taxonomyKey },
          select: { id: true }
        })
        if (taxonomy) {
          annotationFilter.annotations.some.taxonomyId = taxonomy.id
        }
      }
      if (level) annotationFilter.annotations.some.level = parseInt(level)
      if (code) annotationFilter.annotations.some.nodeCode = code
      if (source) annotationFilter.annotations.some.source = source

      AND.push(annotationFilter)
    }

    // Flagged filter
    const flagged = searchParams.get('flagged')
    if (flagged !== null) {
      AND.push({ flagged: flagged === 'true' })
    }

    // Has comments filter
    const hasComments = searchParams.get('hasComments')
    if (hasComments !== null) {
      if (hasComments === 'true') {
        AND.push({
          comments: {
            some: {}
          }
        })
      }
    }

    // Support column filters (dynamic)
    for (let i = 1; i <= 5; i++) {
      const supportValue = searchParams.get(`support${i}`)
      if (supportValue) {
        AND.push({
          [`support${i}`]: { contains: supportValue, mode: 'insensitive' }
        } as any)
      }
    }

    // Combine visibility filter with additional filters
    const where: Prisma.SentenceWhereInput = {
      ...visibilityFilter,
      ...(AND.length > 0 ? { AND } : {})
    }
    
    // Get counts by status with all filters applied
    const [total, pending, submitted, skipped, flaggedCount] = await Promise.all([
      prisma.sentence.count({ where }),
      prisma.sentence.count({ where: { ...where, status: 'pending' } }),
      prisma.sentence.count({ where: { ...where, status: 'submitted' } }),
      prisma.sentence.count({ where: { ...where, status: 'skipped' } }),
      prisma.sentence.count({ where: { ...where, flagged: true } })
    ])
    
    return NextResponse.json({
      ok: true,
      stats: {
        total,
        pending,
        submitted,
        skipped,
        flagged: flaggedCount,
        progress: total > 0 ? Math.round((submitted / total) * 100) : 0
      }
    })
  } catch (error) {
    console.error('Failed to fetch sentence stats:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}

