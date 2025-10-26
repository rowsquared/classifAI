import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sentenceId: string }> }
) {
  try {
    // Get authenticated session
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sentenceId } = await params
    const sentence = await prisma.sentence.findUnique({
      where: { id: sentenceId },
      include: {
        annotations: {
          include: {
            taxonomy: {
              select: { key: true }
            }
          }
        },
        assignments: {
          select: {
            userId: true
          }
        },
        _count: {
          select: { comments: true }
        }
      }
    })

    if (!sentence) {
      return NextResponse.json({ error: 'Sentence not found' }, { status: 404 })
    }

    // Fetch labels for annotations (including handling unknown/-99)
    const annotationsWithLabels = await Promise.all(
      sentence.annotations.map(async (ann) => {
        if (ann.nodeCode === -99) {
          return {
            ...ann,
            nodeLabel: 'Unknown'
          }
        }
        
        const node = await prisma.taxonomyNode.findFirst({
          where: {
            taxonomyId: ann.taxonomyId,
            code: ann.nodeCode
          },
          select: {
            label: true,
            isLeaf: true
          }
        })
        
        return {
          ...ann,
          nodeLabel: node?.label || '',
          isLeaf: node?.isLeaf || false
        }
      })
    )

    // Replace annotations with enriched version
    const enrichedSentence = {
      ...sentence,
      annotations: annotationsWithLabels
    }

    // Check visibility permissions
    if (session.user.role === 'labeller') {
      // Labellers can only see their assigned sentences
      const isAssigned = enrichedSentence.assignments.some(a => a.userId === session.user.id)
      if (!isAssigned) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else if (session.user.role === 'supervisor') {
      // Supervisors can see sentences assigned to them or their supervised users
      const supervisor = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: {
          labellers: {
            include: {
              labellers: true
            }
          }
        }
      })

      if (supervisor) {
        const visibleUserIds = new Set<string>([session.user.id])
        supervisor.labellers.forEach(labeller => {
          visibleUserIds.add(labeller.id)
          labeller.labellers.forEach(nestedLabeller => {
            visibleUserIds.add(nestedLabeller.id)
          })
        })

        const isVisible = enrichedSentence.assignments.some(a => visibleUserIds.has(a.userId))
        if (!isVisible) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
      }
    }
    // Admins can see all sentences

    return NextResponse.json(enrichedSentence)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
