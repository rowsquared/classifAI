import { prisma } from '@/lib/prisma'

/**
 * Check if any AI job is currently running (pending or processing)
 * across all job types: labeling, learning, taxonomy sync, external training
 */
export async function hasActiveAIJob(): Promise<boolean> {
  // Check labeling jobs
  const labelingJob = await prisma.aILabelingJob.findFirst({
    where: {
      status: {
        in: ['pending', 'processing']
      }
    }
  })

  if (labelingJob) {
    return true
  }

  // Check external training jobs
  const trainingJob = await prisma.aIExternalTrainingJob.findFirst({
    where: {
      status: {
        in: ['pending', 'processing']
      }
    }
  })

  if (trainingJob) {
    return true
  }

  // Check learning jobs (stored in Taxonomy table)
  const learningJob = await prisma.taxonomy.findFirst({
    where: {
      lastLearningStatus: {
        in: ['pending', 'processing']
      }
    }
  })

  if (learningJob) {
    return true
  }

  // Check taxonomy sync jobs (stored in Taxonomy table)
  const syncJob = await prisma.taxonomy.findFirst({
    where: {
      lastAISyncStatus: {
        in: ['pending', 'processing']
      }
    }
  })

  if (syncJob) {
    return true
  }

  return false
}

/**
 * Get the next pending job from any queue, prioritizing by startedAt
 * Returns the job type and ID
 */
export async function getNextPendingJob(): Promise<{
  type: 'labeling' | 'external_training' | 'learning' | 'taxonomy_sync'
  id: string
  taxonomyId?: string
} | null> {
  // Get oldest pending job from labeling queue
  const labelingJob = await prisma.aILabelingJob.findFirst({
    where: { status: 'pending' },
    orderBy: { startedAt: 'asc' }
  })

  // Get oldest pending job from external training queue
  const trainingJob = await prisma.aIExternalTrainingJob.findFirst({
    where: { status: 'pending' },
    orderBy: { startedAt: 'asc' }
  })

  // Get oldest pending learning job
  const learningTaxonomy = await prisma.taxonomy.findFirst({
    where: { lastLearningStatus: 'pending' },
    orderBy: { lastLearningAt: 'asc' },
    select: { id: true, lastLearningJobId: true }
  })

  // Get oldest pending sync job
  const syncTaxonomy = await prisma.taxonomy.findFirst({
    where: { lastAISyncStatus: 'pending' },
    orderBy: { lastAISyncAt: 'asc' },
    select: { id: true, lastAISyncJobId: true }
  })

  // Collect all pending jobs with their start times
  const pendingJobs: Array<{
    type: 'labeling' | 'external_training' | 'learning' | 'taxonomy_sync'
    id: string
    startedAt: Date
    taxonomyId?: string
  }> = []

  if (labelingJob) {
    pendingJobs.push({ type: 'labeling', id: labelingJob.id, startedAt: labelingJob.startedAt })
  }
  if (trainingJob) {
    pendingJobs.push({ type: 'external_training', id: trainingJob.id, startedAt: trainingJob.startedAt })
  }
  if (learningTaxonomy && learningTaxonomy.lastLearningJobId) {
    pendingJobs.push({ 
      type: 'learning', 
      id: learningTaxonomy.lastLearningJobId, 
      startedAt: new Date(), // Learning jobs don't have startedAt in Taxonomy
      taxonomyId: learningTaxonomy.id
    })
  }
  if (syncTaxonomy && syncTaxonomy.lastAISyncJobId) {
    pendingJobs.push({ 
      type: 'taxonomy_sync', 
      id: syncTaxonomy.lastAISyncJobId, 
      startedAt: new Date(), // Sync jobs don't have startedAt in Taxonomy
      taxonomyId: syncTaxonomy.id
    })
  }

  if (pendingJobs.length === 0) {
    return null
  }

  // Return the oldest one
  pendingJobs.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
  return {
    type: pendingJobs[0].type,
    id: pendingJobs[0].id,
    taxonomyId: pendingJobs[0].taxonomyId
  }
}

/**
 * Process the next queued job if no job is currently running
 * Note: This is a placeholder - actual job processing is handled by respective endpoints
 */
export async function processNextQueuedJob() {
  if (await hasActiveAIJob()) {
    return // Another job is running, don't start a new one
  }

  const nextJob = await getNextPendingJob()
  if (!nextJob) {
    return // No pending jobs
  }

  // For now, jobs are processed by their respective endpoints when started
  // This function can be extended in the future to automatically process queued jobs
}

