import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all active jobs across all types
    const [labelingJobs, trainingJobs, learningJobs, syncJobs] = await Promise.all([
      // Labeling jobs
      prisma.aILabelingJob.findMany({
        where: {
          status: {
            in: ['pending', 'processing']
          }
        },
        include: {
          taxonomy: { select: { key: true } },
          createdBy: { select: { id: true, name: true, email: true } }
        },
        orderBy: { startedAt: 'asc' }
      }),
      // External training jobs
      prisma.aIExternalTrainingJob.findMany({
        where: {
          status: {
            in: ['pending', 'processing']
          }
        },
        include: {
          taxonomy: { select: { key: true } },
          createdBy: { select: { id: true, name: true, email: true } }
        },
        orderBy: { startedAt: 'asc' }
      }),
      // Learning jobs (from Taxonomy table)
      prisma.taxonomy.findMany({
        where: {
          lastLearningStatus: {
            in: ['pending', 'processing', 'failed'] // Include failed so they show up briefly
          }
        },
        select: {
          id: true,
          key: true,
          lastLearningJobId: true,
          lastLearningStatus: true,
          lastLearningAt: true,
          lastLearningError: true
        }
      }),
      // Taxonomy sync jobs (from Taxonomy table)
      prisma.taxonomy.findMany({
        where: {
          lastAISyncStatus: {
            in: ['pending', 'processing', 'failed'] // Include failed so they show up briefly
          }
        },
        select: {
          id: true,
          key: true,
          lastAISyncJobId: true,
          lastAISyncStatus: true,
          lastAISyncAt: true,
          lastAISyncError: true
        }
      })
    ])

    // Format all jobs into a unified structure
    const allJobs = [
      ...labelingJobs.map(job => ({
        id: job.id,
        type: 'labeling' as const,
        status: job.status,
        taxonomy: job.taxonomy.key,
        totalSentences: job.totalSentences,
        processedSentences: job.processedSentences,
        failedSentences: job.failedSentences,
        startedAt: job.startedAt.toISOString(),
        createdBy: job.createdBy
      })),
      ...trainingJobs.map(job => ({
        id: job.id,
        type: 'external_training' as const,
        status: job.status,
        taxonomy: job.taxonomy.key,
        recordCount: job.recordCount,
        fileName: job.fileName,
        startedAt: job.startedAt.toISOString(),
        createdBy: job.createdBy
      })),
      ...learningJobs.map(taxonomy => ({
        id: taxonomy.lastLearningJobId || `learning-${taxonomy.id}`,
        type: 'learning' as const,
        status: taxonomy.lastLearningStatus === 'success' ? 'completed' : (taxonomy.lastLearningStatus || 'pending'),
        taxonomy: taxonomy.key,
        startedAt: taxonomy.lastLearningAt?.toISOString() || new Date().toISOString(),
        errorMessage: taxonomy.lastLearningError || null
      })),
      ...syncJobs.map(taxonomy => ({
        id: taxonomy.lastAISyncJobId || `sync-${taxonomy.id}`,
        type: 'taxonomy_sync' as const,
        status: taxonomy.lastAISyncStatus === 'success' ? 'completed' : (taxonomy.lastAISyncStatus || 'pending'),
        taxonomy: taxonomy.key,
        startedAt: taxonomy.lastAISyncAt?.toISOString() || new Date().toISOString(),
        errorMessage: taxonomy.lastAISyncError || null
      }))
    ]

    return NextResponse.json({ ok: true, jobs: allJobs })
  } catch (error: any) {
    console.error('Failed to fetch active jobs:', error)
    return NextResponse.json({ 
      error: error?.message || 'Failed to fetch active jobs' 
    }, { status: 500 })
  }
}

