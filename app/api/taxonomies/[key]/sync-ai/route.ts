import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startAIJob, monitorAIJob } from '@/lib/ai-labeling'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { key } = await params
    const taxonomy = await prisma.taxonomy.findUnique({
      where: { key },
      select: { id: true, key: true, description: true, maxDepth: true, levelNames: true }
    })

    if (!taxonomy) {
      return NextResponse.json({ error: 'Taxonomy not found' }, { status: 404 })
    }

    // Check if any AI job is currently running (unified queue)
    const { hasActiveAIJob } = await import('@/lib/ai-job-queue')
    const hasActive = await hasActiveAIJob()
    
    if (hasActive) {
      // Update taxonomy status to pending - job will be queued
      await prisma.taxonomy.update({
        where: { id: taxonomy.id },
        data: {
          lastAISyncStatus: 'pending',
          lastAISyncError: null
        }
      })
      return NextResponse.json({
        ok: true,
        jobId: 'queued',
        message: 'Job queued. It will start when the current job completes.'
      })
    }

    const nodes = await prisma.taxonomyNode.findMany({
      where: { taxonomyId: taxonomy.id },
      select: {
        code: true,
        level: true,
        label: true,
        definition: true,
        examples: true,
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
      action: 'create',
      taxonomy: {
        key: taxonomy.key,
        description: taxonomy.description ?? '',
        maxDepth: taxonomy.maxDepth,
        levelNames: taxonomy.levelNames ?? {},
        nodes: nodes.map(node => ({
          code: node.code,
          level: node.level,
          label: node.label,
          definition: node.definition ?? '',
          examples: node.examples ?? '',
          parentCode: node.parentCode,
          isLeaf: node.isLeaf ?? undefined
        })),
        synonyms: synonyms.map(s => ({
          nodeCode: s.node.code,
          synonym: s.synonym
        }))
      }
    }

    let jobId: string
    try {
      jobId = await startAIJob('/taxonomies', payload)
    } catch (error: any) {
      // If startAIJob fails (e.g., validation error), record it as failed
      const errorMessage = error?.message || 'Failed to start AI sync job'
      await prisma.taxonomy.update({
        where: { id: taxonomy.id },
        data: {
          lastAISyncJobId: `failed-${Date.now()}`, // Temporary ID for tracking
          lastAISyncAt: new Date(),
          lastAISyncStatus: 'failed',
          lastAISyncError: errorMessage
        }
      })
      throw error // Re-throw to be caught by outer catch block
    }

    // Job started successfully, set status to processing
    await prisma.taxonomy.update({
      where: { id: taxonomy.id },
      data: {
        lastAISyncJobId: jobId,
        lastAISyncAt: new Date(),
        lastAISyncStatus: 'processing',
        lastAISyncError: null
      }
    })

    // Monitor job asynchronously
    monitorAIJob(jobId, `/taxonomies/${jobId}/status`, async (result) => {
      // Process next queued job after completion
      const { processNextQueuedJob } = await import('@/lib/ai-job-queue')
      await processNextQueuedJob()
      
      // Check if job was cancelled
      const currentTaxonomy = await prisma.taxonomy.findUnique({
        where: { id: taxonomy.id },
        select: { lastAISyncStatus: true }
      })
      
      if (currentTaxonomy?.lastAISyncStatus === 'cancelled') {
        return // Job was cancelled, don't update status
      }
      
      const data: Record<string, any> = result.success
        ? {
            lastAISyncStatus: 'completed',
            lastAISyncAt: new Date(),
            lastAISyncError: null
          }
        : {
            lastAISyncStatus: 'failed',
            lastAISyncAt: new Date(),
            lastAISyncError: result.error || result.data?.error || 'Unknown AI sync failure'
          }
      await prisma.taxonomy.update({
        where: { id: taxonomy.id },
        data
      })
    })

    return NextResponse.json({ ok: true, jobId })
  } catch (error: any) {
    console.error('Failed to sync taxonomy with AI:', error)
    return NextResponse.json({ error: error?.message || 'Failed to sync taxonomy' }, { status: 500 })
  }
}

