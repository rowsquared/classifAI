import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const statusSchema = z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled'])

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = req.nextUrl.searchParams
    const statusParams = searchParams.getAll('status')
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 100)

    // Build where clauses for each job type
    // Always ensure statusFilter has valid values
    let statusFilter: { in: string[] } | {} = {}
    if (statusParams.length > 0) {
      const validStatuses = statusParams.filter(s => statusSchema.safeParse(s).success)
      if (validStatuses.length > 0) {
        statusFilter = { in: validStatuses }
      } else {
        // If all status params are invalid, default to all statuses
        statusFilter = { in: ['pending', 'processing', 'completed', 'failed', 'cancelled'] }
      }
    } else {
      // Default: show all statuses (empty filter means all)
      statusFilter = { in: ['pending', 'processing', 'completed', 'failed', 'cancelled'] }
    }

    // Fetch all job types
    const [labelingJobs, trainingJobs, learningTaxonomies, syncTaxonomies] = await Promise.all([
      // Labeling jobs - always use status filter (it's always set to valid values)
      prisma.aILabelingJob.findMany({
        where: { status: statusFilter },
        orderBy: { startedAt: 'desc' },
        include: {
          taxonomy: { select: { key: true } },
          createdBy: { select: { id: true, name: true, email: true } }
        }
      }),
      // External training jobs (handle case where table might not exist yet)
      prisma.aIExternalTrainingJob.findMany({
        where: { status: statusFilter },
        orderBy: { startedAt: 'desc' },
        include: {
          taxonomy: { select: { key: true } },
          createdBy: { select: { id: true, name: true, email: true } }
        }
      }).catch((error: any) => {
        console.error('Failed to fetch external training jobs (table may not exist):', error?.message || error)
        return [] // Return empty array if table doesn't exist
      }),
      // Learning jobs (from Taxonomy)
      prisma.taxonomy.findMany({
        where: {
          lastLearningStatus: statusParams.length > 0 ? { in: statusParams } : { not: null }
        },
        select: {
          id: true,
          key: true,
          lastLearningJobId: true,
          lastLearningStatus: true,
          lastLearningAt: true,
          lastLearningError: true,
          updatedAt: true
        },
        orderBy: { updatedAt: 'desc' }
      }),
      // Taxonomy sync jobs (from Taxonomy)
      prisma.taxonomy.findMany({
        where: {
          lastAISyncStatus: statusParams.length > 0 ? { in: statusParams } : { not: null }
        },
        select: {
          id: true,
          key: true,
          lastAISyncJobId: true,
          lastAISyncStatus: true,
          lastAISyncAt: true,
          lastAISyncError: true,
          updatedAt: true
        },
        orderBy: { updatedAt: 'desc' }
      })
    ])

    // Log job counts for debugging
    console.log(`[AI Jobs API] Found ${labelingJobs.length} labeling jobs, ${trainingJobs.length} training jobs, ${learningTaxonomies.length} learning jobs, ${syncTaxonomies.length} sync jobs`)

    // Combine and format all jobs
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
        completedAt: job.completedAt?.toISOString() || null,
        errorMessage: job.errorMessage,
        createdBy: job.createdBy,
        _sortKey: `${job.startedAt.toISOString()}-${job.id}` // Add sort key to ensure stable ordering
      })),
      ...trainingJobs.map(job => ({
        id: job.id,
        type: 'external_training' as const,
        status: job.status,
        taxonomy: job.taxonomy.key,
        recordCount: job.recordCount,
        fileName: job.fileName,
        startedAt: job.startedAt.toISOString(),
        completedAt: job.completedAt?.toISOString() || null,
        errorMessage: job.errorMessage,
        createdBy: job.createdBy,
        _sortKey: `${job.startedAt.toISOString()}-${job.id}` // Add sort key to ensure stable ordering
      })),
      ...learningTaxonomies.map(taxonomy => ({
        id: taxonomy.lastLearningJobId || `learning-${taxonomy.id}`,
        type: 'learning' as const,
        status: taxonomy.lastLearningStatus === 'success' ? 'completed' : (taxonomy.lastLearningStatus || 'pending'),
        taxonomy: taxonomy.key,
        startedAt: taxonomy.lastLearningAt?.toISOString() || taxonomy.updatedAt.toISOString(),
        completedAt: taxonomy.lastLearningStatus === 'completed' || taxonomy.lastLearningStatus === 'success' || taxonomy.lastLearningStatus === 'failed' || taxonomy.lastLearningStatus === 'cancelled' ? (taxonomy.lastLearningAt?.toISOString() || taxonomy.updatedAt.toISOString()) : null,
        errorMessage: taxonomy.lastLearningError,
        createdBy: null,
        _sortKey: `${taxonomy.lastLearningAt?.toISOString() || taxonomy.updatedAt.toISOString()}-${taxonomy.lastLearningJobId || taxonomy.id}` // Add sort key to ensure stable ordering
      })),
      ...syncTaxonomies.map(taxonomy => ({
        id: taxonomy.lastAISyncJobId || `sync-${taxonomy.id}`,
        type: 'taxonomy_sync' as const,
        status: taxonomy.lastAISyncStatus === 'success' ? 'completed' : (taxonomy.lastAISyncStatus || 'pending'),
        taxonomy: taxonomy.key,
        startedAt: taxonomy.lastAISyncAt?.toISOString() || taxonomy.updatedAt.toISOString(),
        completedAt: taxonomy.lastAISyncStatus === 'completed' || taxonomy.lastAISyncStatus === 'success' || taxonomy.lastAISyncStatus === 'failed' || taxonomy.lastAISyncStatus === 'cancelled' ? (taxonomy.lastAISyncAt?.toISOString() || taxonomy.updatedAt.toISOString()) : null,
        errorMessage: taxonomy.lastAISyncError,
        createdBy: null,
        _sortKey: `${taxonomy.lastAISyncAt?.toISOString() || taxonomy.updatedAt.toISOString()}-${taxonomy.lastAISyncJobId || taxonomy.id}` // Add sort key to ensure stable ordering
      }))
    ]

    // Sort by startedAt descending, then by id descending for stable ordering
    // This ensures all jobs are shown even if they have the same startedAt timestamp
    allJobs.sort((a, b) => {
      const timeA = new Date(a.startedAt).getTime()
      const timeB = new Date(b.startedAt).getTime()
      if (timeB !== timeA) {
        return timeB - timeA // Different timestamps: sort by time descending
      }
      // Same timestamp: sort by id descending (newer IDs come first)
      return b.id.localeCompare(a.id)
    })
    
    // Remove the temporary _sortKey before returning (handle jobs that might not have it)
    const cleanedJobs = allJobs.map((job: any) => {
      const { _sortKey, ...rest } = job
      return rest
    })

    // Apply pagination
    const total = cleanedJobs.length
    const paginatedJobs = cleanedJobs.slice((page - 1) * limit, page * limit)

    return NextResponse.json({
      ok: true,
      jobs: paginatedJobs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error: any) {
    console.error('Failed to fetch AI jobs:', error)
    return NextResponse.json({ 
      error: error?.message || 'Failed to fetch jobs',
      details: process.env.NODE_ENV === 'development' ? {
        code: error?.code,
        meta: error?.meta
      } : undefined
    }, { status: 500 })
  }
}

