import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { type } = body as { type: 'labeling' | 'learning' | 'taxonomy_sync' | 'external_training' }
    const { jobId } = await params

    // Handle different job types
    if (type === 'labeling') {
      const job = await prisma.aILabelingJob.findUnique({
        where: { id: jobId },
        select: { status: true }
      })

      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }

      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        return NextResponse.json({ ok: true, status: job.status })
      }

      await prisma.aILabelingJob.update({
        where: { id: jobId },
        data: {
          status: 'cancelled',
          completedAt: new Date()
        }
      })

      return NextResponse.json({ ok: true, status: 'cancelled' })
    }

    if (type === 'external_training') {
      const job = await prisma.aIExternalTrainingJob.findUnique({
        where: { id: jobId },
        select: { status: true }
      })

      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }

      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        return NextResponse.json({ ok: true, status: job.status })
      }

      await prisma.aIExternalTrainingJob.update({
        where: { id: jobId },
        data: {
          status: 'cancelled',
          completedAt: new Date()
        }
      })

      return NextResponse.json({ ok: true, status: 'cancelled' })
    }

    if (type === 'learning') {
      // Find taxonomy by lastLearningJobId
      const taxonomy = await prisma.taxonomy.findFirst({
        where: {
          lastLearningJobId: jobId,
          lastLearningStatus: { in: ['pending', 'processing'] }
        },
        select: { id: true }
      })

      if (!taxonomy) {
        return NextResponse.json({ error: 'Job not found or already completed' }, { status: 404 })
      }

      await prisma.taxonomy.update({
        where: { id: taxonomy.id },
        data: {
          lastLearningStatus: 'cancelled',
          lastLearningError: 'Cancelled by user'
        }
      })

      return NextResponse.json({ ok: true, status: 'cancelled' })
    }

    if (type === 'taxonomy_sync') {
      // Find taxonomy by lastAISyncJobId
      const taxonomy = await prisma.taxonomy.findFirst({
        where: {
          lastAISyncJobId: jobId,
          lastAISyncStatus: { in: ['pending', 'processing'] }
        },
        select: { id: true }
      })

      if (!taxonomy) {
        return NextResponse.json({ error: 'Job not found or already completed' }, { status: 404 })
      }

      await prisma.taxonomy.update({
        where: { id: taxonomy.id },
        data: {
          lastAISyncStatus: 'cancelled',
          lastAISyncError: 'Cancelled by user'
        }
      })

      return NextResponse.json({ ok: true, status: 'cancelled' })
    }

    return NextResponse.json({ error: 'Invalid job type' }, { status: 400 })
  } catch (error: any) {
    console.error('Failed to cancel AI job:', error)
    return NextResponse.json({ error: error?.message || 'Failed to cancel job' }, { status: 500 })
  }
}

