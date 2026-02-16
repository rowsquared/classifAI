/**
 * AI Job Monitor — fire-and-poll architecture.
 *
 * Each job is sent to the external AI API and then polled independently.
 * Multiple jobs can run concurrently (the external API handles its own queue).
 *
 * Supports both labeling jobs (AILabelingJob) and learning jobs (AILearningJob).
 */

import { prisma } from '@/lib/prisma'
import { startAIJob, fetchAIJobStatus } from './ai-labeling'
import { AI_JOB_POLL_INTERVAL_MS, AI_JOB_POLL_TIMEOUT_MS } from './constants'
import { buildFieldMap } from './ai-utils'

// ---------------------------------------------------------------------------
// Global state for tracking active monitors
// ---------------------------------------------------------------------------

const globalAny = globalThis as typeof globalThis & {
  __activeJobMonitors?: Set<string>
  __lastRecoveryCheck?: number
}

function getActiveMonitors(): Set<string> {
  if (!globalAny.__activeJobMonitors) {
    globalAny.__activeJobMonitors = new Set()
  }
  return globalAny.__activeJobMonitors
}

const RECOVERY_CHECK_INTERVAL_MS = 30_000

// ---------------------------------------------------------------------------
// Generic helpers for DB operations on labeling vs learning jobs
// ---------------------------------------------------------------------------

type JobKind = 'labeling' | 'learning'

async function loadJobRecord(jobId: string, kind: JobKind) {
  if (kind === 'learning') {
    return prisma.aILearningJob.findUnique({
      where: { id: jobId },
      include: { taxonomy: { select: { id: true, key: true } } }
    })
  }
  return prisma.aILabelingJob.findUnique({
    where: { id: jobId },
    include: { taxonomy: { select: { id: true, key: true } } }
  })
}

async function updateJobRecord(jobId: string, kind: JobKind, data: Record<string, unknown>) {
  if (kind === 'learning') {
    return prisma.aILearningJob.update({ where: { id: jobId }, data })
  }
  return prisma.aILabelingJob.update({ where: { id: jobId }, data })
}

async function getJobStatus(jobId: string, kind: JobKind) {
  if (kind === 'learning') {
    return prisma.aILearningJob.findUnique({ where: { id: jobId }, select: { status: true } })
  }
  return prisma.aILabelingJob.findUnique({ where: { id: jobId }, select: { status: true } })
}

// ---------------------------------------------------------------------------
// Public API — Labeling jobs
// ---------------------------------------------------------------------------

/**
 * Launch a labeling job: build payload, POST /label, poll for result.
 */
export function launchJob(jobId: string) {
  const monitors = getActiveMonitors()
  if (monitors.has(jobId)) return
  monitors.add(jobId)

  runMonitor(jobId, 'labeling', '/label', async (job) => {
    const criteria = (job.filterCriteria || {}) as { sentenceIds?: string[] }
    const sentenceIds = criteria.sentenceIds || []

    if (sentenceIds.length === 0) throw new Error('No sentences to process')

    const sentences = await prisma.sentence.findMany({
      where: { id: { in: sentenceIds } },
      select: {
        id: true,
        field1: true, field2: true, field3: true, field4: true, field5: true,
        fieldMapping: true
      }
    })

    const sentenceMap = new Map(sentences.map(s => [s.id, s]))
    const payloadSentences = sentenceIds
      .map(id => {
        const sentence = sentenceMap.get(id)
        if (!sentence) return null
        const fields = buildFieldMap(sentence)
        if (Object.keys(fields).length === 0) return null
        return { sentence_id: id, fields }
      })
      .filter(Boolean) as Array<{ sentence_id: string; fields: Record<string, string> }>

    if (payloadSentences.length === 0) throw new Error('No valid sentences to process')

    const externalJobId = await startAIJob('/label', {
      taxonomyKey: job.taxonomy.key,
      batchId: job.id,
      sentences: payloadSentences
    })

    await updateJobRecord(job.id, 'labeling', {
      externalJobId, status: 'processing', startedAt: new Date(), errorMessage: null
    })

    return externalJobId
  })
}

// ---------------------------------------------------------------------------
// Public API — Learning jobs
// ---------------------------------------------------------------------------

/**
 * Launch a learning job: build payload with annotations, POST /learn, poll.
 */
export function launchLearningJob(jobId: string) {
  const monitors = getActiveMonitors()
  if (monitors.has(jobId)) return
  monitors.add(jobId)

  runMonitor(jobId, 'learning', '/learn', async (job) => {
    const criteria = (job.filterCriteria || {}) as { sentenceIds?: string[] }
    const sentenceIds = criteria.sentenceIds || []

    if (sentenceIds.length === 0) throw new Error('No sentences to process')

    // Load annotations for these sentences (user-submitted only)
    const annotations = await prisma.sentenceAnnotation.findMany({
      where: {
        sentenceId: { in: sentenceIds },
        taxonomyId: job.taxonomyId,
        source: 'user'
      },
      include: {
        sentence: {
          select: {
            id: true,
            field1: true, field2: true, field3: true, field4: true, field5: true,
            fieldMapping: true
          }
        }
      }
    })

    // Group annotations by sentence
    const sentencesMap = new Map<string, {
      sentenceId: string
      fields: Record<string, string>
      annotations: Array<{ level: number; nodeCode: string }>
    }>()

    for (const ann of annotations) {
      if (!sentencesMap.has(ann.sentenceId)) {
        sentencesMap.set(ann.sentenceId, {
          sentenceId: ann.sentenceId,
          fields: buildFieldMap(ann.sentence),
          annotations: []
        })
      }
      sentencesMap.get(ann.sentenceId)!.annotations.push({
        level: ann.level,
        nodeCode: ann.nodeCode
      })
    }

    const sentencesPayload = Array.from(sentencesMap.values())
    if (sentencesPayload.length === 0) throw new Error('No valid annotations to send')

    const externalJobId = await startAIJob('/learn', {
      taxonomyKey: job.taxonomy.key,
      sentences: sentencesPayload
    })

    await updateJobRecord(job.id, 'learning', {
      externalJobId, status: 'processing', startedAt: new Date(), errorMessage: null
    })

    return externalJobId
  })
}

// ---------------------------------------------------------------------------
// Public API — Recovery
// ---------------------------------------------------------------------------

/**
 * Recovery: check for processing/pending jobs without an active monitor.
 * Safe to call frequently — rate-limited internally.
 */
export async function ensureJobsMonitored() {
  const now = Date.now()
  if (now - (globalAny.__lastRecoveryCheck || 0) < RECOVERY_CHECK_INTERVAL_MS) return
  globalAny.__lastRecoveryCheck = now

  const monitors = getActiveMonitors()

  // Recover labeling jobs
  const orphanedLabeling = await prisma.aILabelingJob.findMany({
    where: { status: { in: ['pending', 'processing'] } },
    select: { id: true, externalJobId: true, status: true }
  })

  for (const job of orphanedLabeling) {
    if (monitors.has(job.id)) continue
    if (job.status === 'pending' && !job.externalJobId) {
      console.log(`[recovery] Launching orphaned labeling job ${job.id}`)
      launchJob(job.id)
    } else if (job.externalJobId) {
      console.log(`[recovery] Resuming polling for labeling job ${job.id}`)
      resumePolling(job.id, job.externalJobId, 'labeling', '/label')
    }
  }

  // Recover learning jobs
  const orphanedLearning = await prisma.aILearningJob.findMany({
    where: { status: { in: ['pending', 'processing'] } },
    select: { id: true, externalJobId: true, status: true }
  })

  for (const job of orphanedLearning) {
    if (monitors.has(job.id)) continue
    if (job.status === 'pending' && !job.externalJobId) {
      console.log(`[recovery] Launching orphaned learning job ${job.id}`)
      launchLearningJob(job.id)
    } else if (job.externalJobId) {
      console.log(`[recovery] Resuming polling for learning job ${job.id}`)
      resumePolling(job.id, job.externalJobId, 'learning', '/learn')
    }
  }
}

// ---------------------------------------------------------------------------
// Internal — generic monitor loop
// ---------------------------------------------------------------------------

function resumePolling(jobId: string, externalJobId: string, kind: JobKind, apiPath: string) {
  const monitors = getActiveMonitors()
  if (monitors.has(jobId)) return
  monitors.add(jobId)

  runMonitor(jobId, kind, apiPath, async () => externalJobId)
}

function runMonitor(
  jobId: string,
  kind: JobKind,
  apiPath: string,
  setup: (job: NonNullable<Awaited<ReturnType<typeof loadJobRecord>>>) => Promise<string>
) {
  ;(async () => {
    try {
      const job = await loadJobRecord(jobId, kind)
      if (!job) return
      if (job.status === 'cancelled' || job.status === 'completed' || job.status === 'failed') return

      const externalJobId = await setup(job)

      await pollUntilComplete(jobId, externalJobId, job.totalSentences, job.taxonomyId, job.filterCriteria, kind, apiPath)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`[monitor] ${kind} job ${jobId} failed: ${msg}`)
      try {
        await updateJobRecord(jobId, kind, { status: 'failed', errorMessage: msg, completedAt: new Date() })
      } catch { /* best effort */ }
    } finally {
      getActiveMonitors().delete(jobId)
    }
  })()
}

/**
 * Poll external AI for job status, update progress, store results on completion.
 */
async function pollUntilComplete(
  jobId: string,
  externalJobId: string,
  totalSentences: number,
  taxonomyId: string,
  filterCriteria: unknown,
  kind: JobKind,
  apiPath: string
) {
  const startedAt = Date.now()
  const sentenceIds = ((filterCriteria || {}) as { sentenceIds?: string[] }).sentenceIds || []

  while (true) {
    const current = await getJobStatus(jobId, kind)
    if (!current || current.status === 'cancelled') return

    try {
      const status = await fetchAIJobStatus(`${apiPath}/${externalJobId}/status`)
      const normalized = (status.status || '').toLowerCase()

      const progress = typeof status.progress === 'number' ? status.progress : 0
      await updateJobRecord(jobId, kind, {
        processedSentences: Math.round(progress * totalSentences)
      })

      if (normalized === 'complete' || normalized === 'completed' || normalized === 'success') {
        // Store results for labeling jobs (AI suggestions)
        if (kind === 'labeling') {
          await storeLabelingResults(jobId, taxonomyId, sentenceIds, status)
        }

        await updateJobRecord(jobId, kind, {
          status: 'completed',
          processedSentences: totalSentences,
          completedAt: new Date(),
          errorMessage: null
        })

        // For learning jobs, update taxonomy lastLearningAt
        if (kind === 'learning') {
          await updateTaxonomyLearningStatus(taxonomyId)
        }

        return
      }

      if (normalized === 'failed' || normalized === 'error') {
        await updateJobRecord(jobId, kind, {
          status: 'failed',
          errorMessage: status.error || 'External AI job failed',
          completedAt: new Date()
        })
        return
      }
    } catch (error) {
      if (Date.now() - startedAt >= AI_JOB_POLL_TIMEOUT_MS) {
        throw error
      }
    }

    if (Date.now() - startedAt >= AI_JOB_POLL_TIMEOUT_MS) {
      throw new Error(`Job polling timed out after ${Math.round(AI_JOB_POLL_TIMEOUT_MS / 60000)} minutes`)
    }

    await new Promise(r => setTimeout(r, AI_JOB_POLL_INTERVAL_MS))
  }
}

/**
 * When a learning job completes, update taxonomy's lastLearningAt timestamp.
 * Only updates if there are no other pending/processing learning jobs for this taxonomy.
 */
async function updateTaxonomyLearningStatus(taxonomyId: string) {
  const stillActive = await prisma.aILearningJob.count({
    where: { taxonomyId, status: { in: ['pending', 'processing'] } }
  })
  if (stillActive === 0) {
    await prisma.taxonomy.update({
      where: { id: taxonomyId },
      data: { lastLearningAt: new Date(), lastLearningStatus: 'completed', lastLearningError: null }
    })
  }
}

/**
 * Parse AI suggestions from the completed labeling job and store in DB.
 */
async function storeLabelingResults(
  jobId: string,
  taxonomyId: string,
  sentenceIds: string[],
  status: Record<string, unknown>
) {
  const response = (status.result || status) as {
    suggestions?: Array<{
      sentenceId?: string
      sentence_id?: string
      annotations: Array<{ level: number; nodeCode: string | number; confidence?: number }>
    }>
    errors?: Array<{ sentenceId?: string; sentence_id?: string; error?: string }>
  }

  const suggestionMap = new Map<
    string,
    { annotations: Array<{ level: number; nodeCode: string; confidence: number }> }
  >()

  for (const suggestion of response.suggestions || []) {
    const sentenceId = suggestion.sentenceId || suggestion.sentence_id
    if (!sentenceId || !Array.isArray(suggestion.annotations)) continue
    suggestionMap.set(sentenceId, {
      annotations: (suggestion.annotations || []).map(a => ({
        level: a.level,
        nodeCode: String(a.nodeCode),
        confidence: typeof a.confidence === 'number' ? a.confidence : 0
      }))
    })
  }

  await prisma.$transaction(async (tx) => {
    for (const [sentenceId, data] of suggestionMap) {
      await tx.sentenceAISuggestion.deleteMany({ where: { sentenceId, taxonomyId } })
      if (data.annotations.length === 0) continue
      await tx.sentenceAISuggestion.createMany({
        data: data.annotations.map(ann => ({
          sentenceId,
          taxonomyId,
          level: ann.level,
          nodeCode: ann.nodeCode,
          confidenceScore: ann.confidence
        }))
      })
    }
  })

  const errorCount = (response.errors || []).length
  if (errorCount > 0) {
    await updateJobRecord(jobId, 'labeling', { failedSentences: errorCount })
  }
}
