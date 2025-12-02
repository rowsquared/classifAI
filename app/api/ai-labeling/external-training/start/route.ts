import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { startAIJob, monitorAIJob } from '@/lib/ai-labeling'
import { z } from 'zod'

async function processNextQueuedJob() {
  const { getNextPendingJob } = await import('@/lib/ai-job-queue')
  const nextJob = await getNextPendingJob()
  
  if (!nextJob) {
    return
  }

  if (nextJob.type === 'external_training') {
    const job = await prisma.aIExternalTrainingJob.findUnique({
      where: { id: nextJob.id },
      include: {
        taxonomy: { select: { key: true } }
      }
    })

    if (!job || job.status !== 'pending') {
      return
    }

    // Update to processing
    await prisma.aIExternalTrainingJob.update({
      where: { id: job.id },
      data: { status: 'processing' }
    })

    try {
      const externalJobId = await startAIJob('/learn', {
        taxonomyKey: job.taxonomy.key,
        trainingDataUrl: job.trainingDataUrl,
        externalTraining: true
      })

      monitorAIJob(externalJobId, `/learn/${externalJobId}/status`, async (result) => {
        if (result.success) {
          await prisma.aIExternalTrainingJob.update({
            where: { id: job.id },
            data: {
              status: 'completed',
              completedAt: new Date()
            }
          })
        } else {
          await prisma.aIExternalTrainingJob.update({
            where: { id: job.id },
            data: {
              status: 'failed',
              errorMessage: result.error || 'Training job failed',
              completedAt: new Date()
            }
          })
        }
        // Process next queued job
        await processNextQueuedJob()
      })
    } catch (error) {
      await prisma.aIExternalTrainingJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Failed to start training job',
          completedAt: new Date()
        }
      })
      // Try next job
      await processNextQueuedJob()
    }
  }
}

const startSchema = z.object({
  taxonomyKey: z.string(),
  trainingDataUrl: z.string().url(),
  fileName: z.string(),
  recordCount: z.number().int().min(1)
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { taxonomyKey, trainingDataUrl, fileName, recordCount } = startSchema.parse(body)

    const taxonomy = await prisma.taxonomy.findFirst({
      where: { key: taxonomyKey, isActive: true },
      select: {
        id: true,
        key: true
      }
    })

    if (!taxonomy) {
      return NextResponse.json({ error: 'Taxonomy not found' }, { status: 404 })
    }

    // Check if any AI job is currently running (unified queue)
    const { hasActiveAIJob } = await import('@/lib/ai-job-queue')
    const hasActive = await hasActiveAIJob()
    
    // Create the job record
    const job = await prisma.aIExternalTrainingJob.create({
      data: {
        createdById: session.user.id,
        taxonomyId: taxonomy.id,
        status: hasActive ? 'pending' : 'processing', // Queue if another job is running
        jobType: 'external_training',
        trainingDataUrl,
        fileName,
        recordCount
      },
      include: {
        taxonomy: { select: { key: true } },
        createdBy: { select: { id: true, name: true, email: true } }
      }
    })

    // If no other job is running, start immediately
    if (!hasActive) {
      try {
        // Start the AI job with the external tool
        const externalJobId = await startAIJob('/learn', {
          taxonomyKey: taxonomy.key,
          trainingDataUrl,
          externalTraining: true
        })

        // Monitor the job asynchronously
        monitorAIJob(externalJobId, `/learn/${externalJobId}/status`, async (result) => {
          if (result.success) {
            await prisma.aIExternalTrainingJob.update({
              where: { id: job.id },
              data: {
                status: 'completed',
                completedAt: new Date()
              }
            })
            // Process next queued job
            await processNextQueuedJob()
          } else {
            await prisma.aIExternalTrainingJob.update({
              where: { id: job.id },
              data: {
                status: 'failed',
                errorMessage: result.error || 'Training job failed',
                completedAt: new Date()
              }
            })
            // Process next queued job even on failure
            await processNextQueuedJob()
          }
        })
      } catch (error) {
        // If starting fails, mark as failed
        await prisma.aIExternalTrainingJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'Failed to start training job',
            completedAt: new Date()
          }
        })
        throw error
      }
    }
    // If hasActive is true, job is queued and will be processed when current job completes

    return NextResponse.json({ ok: true, job })
  } catch (error: any) {
    console.error('Failed to start external training job:', error)
    return NextResponse.json({ 
      error: error?.message || 'Failed to start external training job' 
    }, { status: 500 })
  }
}

