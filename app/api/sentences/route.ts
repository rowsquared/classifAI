import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export async function GET(request: Request) {
  try {
    // Get authenticated session
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    
    // Parse query parameters
    const q = searchParams.get('q') || ''
    const statusParam = searchParams.get('status') || ''
    const userId = searchParams.get('userId') || ''
    const userScope = searchParams.get('userScope') || '' // 'me' for current user
    const assignedToUserId = searchParams.get('assignedToUserId') || ''
    const lastEditedFrom = searchParams.get('lastEditedFrom') || ''
    const lastEditedTo = searchParams.get('lastEditedTo') || ''
    const taxonomyKey = searchParams.get('taxonomyKey') || ''
    const level = searchParams.get('level') || ''
    const code = searchParams.get('code') || ''
    const source = searchParams.get('source') || '' // 'ai' or 'user'
    const flagged = searchParams.get('flagged') || ''
    const hasComments = searchParams.get('hasComments') || ''
    const sort = searchParams.get('sort') || 'createdAt'
    const order = searchParams.get('order') || 'asc'
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    // Build where clause
    const where: Prisma.SentenceWhereInput = {
      AND: []
    }
    
    // Search across all field columns
    if (q) {
      where.AND!.push({
        OR: [
          { field1: { contains: q, mode: 'insensitive' } },
          { field2: { contains: q, mode: 'insensitive' } },
          { field3: { contains: q, mode: 'insensitive' } },
          { field4: { contains: q, mode: 'insensitive' } },
          { field5: { contains: q, mode: 'insensitive' } }
        ]
      })
    }
    
    // Multiple status filters (comma-separated)
    if (statusParam) {
      const statuses = statusParam.split(',').map(s => s.trim())
      if (statuses.length === 1) {
        where.AND!.push({ status: statuses[0] as any })
      } else {
        where.AND!.push({
          OR: statuses.map(s => ({ status: s as any }))
        })
      }
    }
    
    // Visibility filtering based on role and assignments
    if (session.user.role === 'labeller') {
      // Labellers can only see sentences assigned to them
      where.AND!.push({
        assignments: {
          some: {
            userId: session.user.id
          }
        }
      })
    } else if (session.user.role === 'supervisor') {
      // Supervisors can see:
      // 1. Sentences assigned to themselves
      // 2. Sentences assigned to users they supervise (including nested)
      
      // Get all users this supervisor can see
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

        // Filter to sentences assigned to visible users
        where.AND!.push({
          assignments: {
            some: {
              userId: { in: Array.from(visibleUserIds) }
            }
          }
        })
      }
    }
    // Admins see all sentences (no filter)

    // Additional user filter (for admins/supervisors to filter by specific user)
    if (userId) {
      where.AND!.push({ lastEditorId: userId })
    }
    
    // Assigned to user filter
    if (assignedToUserId) {
      where.AND!.push({
        assignments: {
          some: {
            userId: assignedToUserId
          }
        }
      })
    }
    
    // Date range filter
    if (lastEditedFrom || lastEditedTo) {
      const dateFilter: any = {}
      if (lastEditedFrom) {
        // Start of the day (00:00:00.000)
        const fromDate = new Date(lastEditedFrom)
        fromDate.setHours(0, 0, 0, 0)
        dateFilter.gte = fromDate
      }
      if (lastEditedTo) {
        // End of the day (23:59:59.999)
        const toDate = new Date(lastEditedTo)
        toDate.setHours(23, 59, 59, 999)
        dateFilter.lte = toDate
      }
      where.AND!.push({ lastEditedAt: dateFilter })
    }
    
    // Taxonomy/annotation filters
    if (taxonomyKey || level || code || source) {
      const annotationFilter: any = {
        some: {}
      }
      
      if (taxonomyKey) {
        annotationFilter.some.taxonomy = { key: taxonomyKey }
      }
      if (level) {
        annotationFilter.some.level = parseInt(level, 10)
      }
      if (code) {
        annotationFilter.some.nodeCode = code
      }
      if (source) {
        annotationFilter.some.source = source as any
      }
      
      where.AND!.push({ annotations: annotationFilter })
    }
    
    // Flagged filter
    if (flagged === 'true') {
      where.AND!.push({ flagged: true })
    } else if (flagged === 'false') {
      where.AND!.push({ flagged: false })
    }
    
    // Has comments filter
    if (hasComments === 'true') {
      where.AND!.push({ 
        comments: { 
          some: {} 
        } 
      })
    } else if (hasComments === 'false') {
      where.AND!.push({ 
        comments: { 
          none: {} 
        } 
      })
    }
    
    // Support column filters (dynamic)
    for (let i = 1; i <= 5; i++) {
      const supportValue = searchParams.get(`support${i}`)
      if (supportValue) {
        where.AND!.push({
          [`support${i}`]: { contains: supportValue, mode: 'insensitive' }
        } as any)
      }
    }
    
    // Clean up empty AND array
    if (where.AND!.length === 0) {
      delete where.AND
    }

    // Build orderBy clause with secondary sort by importOrder for stable ordering
    let orderBy: Prisma.SentenceOrderByWithRelationInput[]
    if (sort === 'lastEditedAt') {
      orderBy = [
        { lastEditedAt: order as 'asc' | 'desc' },
        { importOrder: 'asc' } // Secondary sort by import order
      ]
    } else if (sort === 'createdAt') {
      orderBy = [
        { createdAt: order as 'asc' | 'desc' },
        { importOrder: 'asc' } // Secondary sort by import order
      ]
    } else if (sort === 'status') {
      orderBy = [
        { status: order as 'asc' | 'desc' },
        { importOrder: 'asc' } // Secondary sort by import order
      ]
    } else {
      orderBy = [{ id: order as 'asc' | 'desc' }]
    }

    // Fetch sentences with pagination
    const sentences = await prisma.sentence.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        annotations: {
          include: {
            taxonomy: {
              select: { key: true, displayName: true }
            }
          }
        },
        comments: {
          select: {
            id: true,
            body: true,
            createdAt: true,
            author: {
              select: { name: true }
            }
          }
        },
        lastEditor: {
          select: {
            name: true,
            email: true
          }
        },
        assignments: {
          select: {
            user: {
              select: {
                id: true,
                username: true,
                name: true
              }
            }
          }
        },
        _count: {
          select: { comments: true }
        }
      }
    })
    
    // Fetch node labels for all annotations
    const allNodeCodes = sentences.flatMap(s => 
      s.annotations.map(a => ({ taxonomyId: a.taxonomyId, code: a.nodeCode }))
    )
    
    const uniqueNodes = Array.from(
      new Map(allNodeCodes.map(n => [`${n.taxonomyId}-${n.code}`, n])).values()
    )
    
    const nodes = await prisma.taxonomyNode.findMany({
      where: {
        OR: uniqueNodes.map(n => ({
          taxonomyId: n.taxonomyId,
          code: n.code
        }))
      },
      select: {
        taxonomyId: true,
        code: true,
        label: true
      }
    })
    
    // Create lookup map
    const nodeLabels = new Map(
      nodes.map(n => [`${n.taxonomyId}-${n.code}`, n.label])
    )
    
    // Attach labels to annotations
    const sentencesWithLabels = sentences.map(s => ({
      ...s,
      annotations: s.annotations.map(a => ({
        ...a,
        nodeLabel: nodeLabels.get(`${a.taxonomyId}-${a.nodeCode}`) || null
      }))
    }))
    
    const total = await prisma.sentence.count({ where })

    return NextResponse.json({
      sentences: sentencesWithLabels,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Sentences API error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
