import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const assignSchema = z.object({
  sentenceIds: z.array(z.string()).min(1),
  userId: z.string().nullable() // Single userId or null to unassign
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins and supervisors can assign sentences
    if (session.user.role !== 'admin' && session.user.role !== 'supervisor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const validation = assignSchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json({ 
        error: 'Invalid request data'
      }, { status: 400 })
    }

    const { sentenceIds, userId } = validation.data

    // If userId is provided, verify permissions
    if (userId !== null) {
      // For supervisors, verify they can only assign to users they supervise
      if (session.user.role === 'supervisor') {
        // Get all users this supervisor can assign to (direct labellers + supervised supervisors' labellers)
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

        if (!supervisor) {
          return NextResponse.json({ error: 'Supervisor not found' }, { status: 404 })
        }

        // Build list of assignable user IDs
        const assignableUserIds = new Set<string>([session.user.id]) // Can assign to self
        supervisor.labellers.forEach(labeller => {
          assignableUserIds.add(labeller.id)
          // Add nested labellers (if this labeller is also a supervisor)
          labeller.labellers.forEach(nestedLabeller => {
            assignableUserIds.add(nestedLabeller.id)
          })
        })

        // Check if the requested userId is assignable
        if (!assignableUserIds.has(userId)) {
          return NextResponse.json({ 
            error: 'Cannot assign to users you do not supervise' 
          }, { status: 403 })
        }
      }

      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true }
      })

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }
    }

    // Use transaction to:
    // 1. Remove all existing assignments for these sentences (backwards compatible cleanup)
    // 2. Create new single assignment if userId provided
    await prisma.$transaction(async (tx) => {
      // Step 1: Remove all existing assignments for these sentences
      await tx.sentenceAssignment.deleteMany({
        where: {
          sentenceId: { in: sentenceIds }
        }
      })

      // Step 2: If userId provided, create new single assignment
      if (userId !== null) {
        await tx.sentenceAssignment.createMany({
          data: sentenceIds.map(sentenceId => ({
            sentenceId,
            userId,
            assignedBy: session.user.id
          })),
          skipDuplicates: true
        })
      }
    })

    return NextResponse.json({ 
      ok: true, 
      assigned: userId !== null ? sentenceIds.length : 0,
      unassigned: userId === null ? sentenceIds.length : 0,
      sentences: sentenceIds.length
    })
  } catch (error) {
    console.error('Error assigning sentences:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Unassign sentences
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins and supervisors can unassign
    if (session.user.role !== 'admin' && session.user.role !== 'supervisor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { sentenceIds, userIds } = body as { sentenceIds: string[], userIds?: string[] }

    if (!sentenceIds || sentenceIds.length === 0) {
      return NextResponse.json({ error: 'No sentences provided' }, { status: 400 })
    }

    // If userIds provided, only unassign from those users
    // Otherwise, unassign from all users
    const where: any = {
      sentenceId: { in: sentenceIds }
    }

    if (userIds && userIds.length > 0) {
      where.userId = { in: userIds }
    }

    const deleted = await prisma.sentenceAssignment.deleteMany({ where })

    return NextResponse.json({ 
      ok: true, 
      unassigned: deleted.count 
    })
  } catch (error) {
    console.error('Error unassigning sentences:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

