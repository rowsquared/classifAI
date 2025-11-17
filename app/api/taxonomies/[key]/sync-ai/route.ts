import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { callAILabelingEndpoint, ensureAIConfig } from '@/lib/ai-labeling'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    ensureAIConfig()

    const { key } = await params
    const taxonomy = await prisma.taxonomy.findUnique({
      where: { key },
      select: { id: true, key: true, displayName: true, description: true, maxDepth: true, levelNames: true }
    })

    if (!taxonomy) {
      return NextResponse.json({ error: 'Taxonomy not found' }, { status: 404 })
    }

    const nodes = await prisma.taxonomyNode.findMany({
      where: { taxonomyId: taxonomy.id },
      select: {
        code: true,
        level: true,
        label: true,
        definition: true,
        parentCode: true,
        isLeaf: true
      },
      orderBy: [{ level: 'asc' }, { code: 'asc' }]
    })

    const synonyms = await prisma.taxonomySynonym.findMany({
      where: { taxonomyId: taxonomy.id },
      select: {
        synonym: true,
        node: {
          select: {
            code: true
          }
        }
      }
    })

    const payload = {
      action: 'update',
      taxonomy: {
        key: taxonomy.key,
        displayName: taxonomy.displayName,
        description: taxonomy.description,
        maxDepth: taxonomy.maxDepth,
        levelNames: taxonomy.levelNames,
        nodes: nodes.map(node => ({
          code: node.code,
          level: node.level,
          label: node.label,
          definition: node.definition,
          parentCode: node.parentCode,
          isLeaf: node.isLeaf ?? undefined
        })),
        synonyms: synonyms.map(s => ({
          nodeCode: s.node.code,
          synonym: s.synonym
        }))
      }
    }

    await callAILabelingEndpoint('/taxonomies', payload)

    await prisma.taxonomy.update({
      where: { id: taxonomy.id },
      data: {
        lastAISyncAt: new Date(),
        lastAISyncStatus: 'success',
        lastAISyncError: null
      }
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Failed to sync taxonomy with AI:', error)
    if (error?.message && error.message.includes('AI labeling service is not configured')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (error?.message && error.message.includes('AI labeling API error')) {
      // Best effort: update taxonomy status
      const { key } = await params
      const taxonomy = await prisma.taxonomy.findUnique({ where: { key }, select: { id: true } })
      if (taxonomy) {
        await prisma.taxonomy.update({
          where: { id: taxonomy.id },
          data: {
            lastAISyncAt: new Date(),
            lastAISyncStatus: 'failed',
            lastAISyncError: error.message
          }
        })
      }
    }

    return NextResponse.json({ error: error?.message || 'Failed to sync taxonomy' }, { status: 500 })
  }
}

