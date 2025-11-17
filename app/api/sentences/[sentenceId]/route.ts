import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UNKNOWN_NODE_CODE } from '@/lib/constants'

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
    // Optimize: fetch all nodes in one query instead of N queries
    const annotationsToLookup = sentence.annotations.filter(ann => ann.nodeCode !== UNKNOWN_NODE_CODE)
    
    // Build lookup map: (taxonomyId, code) -> node
    const nodeLookup = new Map<string, { label: string; definition: string | null; isLeaf: boolean | null }>()
    
    if (annotationsToLookup.length > 0) {
      // Get unique (taxonomyId, code) pairs
      const lookupKeys = new Set(
        annotationsToLookup.map(ann => `${ann.taxonomyId}:${ann.nodeCode}`)
      )
      
      // Fetch all nodes in one query
      const nodes = await prisma.taxonomyNode.findMany({
        where: {
          OR: Array.from(lookupKeys).map(key => {
            const [taxonomyId, code] = key.split(':')
            return {
              taxonomyId,
              code
            }
          })
        },
        select: {
          taxonomyId: true,
          code: true,
          label: true,
          definition: true,
          isLeaf: true
        }
      })
      
      // Build lookup map
      nodes.forEach(node => {
        nodeLookup.set(`${node.taxonomyId}:${node.code}`, {
          label: node.label,
          definition: node.definition,
          isLeaf: node.isLeaf
        })
      })
    }
    
    // Map annotations with labels
    const annotationsWithLabels = sentence.annotations.map((ann) => {
      if (ann.nodeCode === UNKNOWN_NODE_CODE) {
        return {
          ...ann,
          nodeLabel: 'Unknown'
        }
      }
      
      const key = `${ann.taxonomyId}:${ann.nodeCode}`
      const node = nodeLookup.get(key)
      
      return {
        ...ann,
        nodeLabel: node?.label || '',
        nodeDefinition: node?.definition || null,
        isLeaf: node?.isLeaf || false
      }
    })

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
      // Optimize: Get direct supervised users first, then their supervised users
      const directSupervised = await prisma.user.findMany({
        where: { supervisorId: session.user.id },
        select: { id: true }
      })
      
      const directSupervisedIds = directSupervised.map(u => u.id)
      
      // Get nested supervised users (users supervised by direct supervised users)
      const nestedSupervised = directSupervisedIds.length > 0
        ? await prisma.user.findMany({
            where: { supervisorId: { in: directSupervisedIds } },
            select: { id: true }
          })
        : []
      
      const visibleUserIds = new Set<string>([
        session.user.id,
        ...directSupervisedIds,
        ...nestedSupervised.map(u => u.id)
      ])
      
      const isVisible = enrichedSentence.assignments.some(a => visibleUserIds.has(a.userId))
      
      if (!isVisible) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
    // Admins can see all sentences

    return NextResponse.json(enrichedSentence)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
