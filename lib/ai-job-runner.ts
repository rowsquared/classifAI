import { prisma } from '@/lib/prisma'
import { startAIJob, waitForAIJobResult } from './ai-labeling'
import { AI_LABELING_BATCH_SIZE } from './constants'
import { buildFieldMap } from './ai-utils'

const MAX_BATCH_RETRIES = 3
const BATCH_RETRY_DELAY_MS = 10_000 // 10 seconds between retries

type FilterCriteria = {
  sentenceIds: string[]
  importIds?: string[]
  onlyUnsubmitted?: boolean
  requestedBy?: string
}

const globalAny = globalThis as typeof globalThis & {
  __aiJobProcessorRunning?: boolean
  __aiJobProcessorStartedAt?: number
}

// If the processor lock has been held for longer than this, consider it stale
// and allow a new processor to start. This protects against zombie processors
// from hot-reloads or unexpected hangs.
const PROCESSOR_LOCK_STALE_MS = 30 * 60 * 1000 // 30 minutes

async function processJobsLoop() {
  while (true) {
    // First, check for and recover stuck jobs (jobs in 'processing' state for > 1 hour without progress)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const stuckJobs = await prisma.aILabelingJob.findMany({
      where: {
        status: 'processing',
        startedAt: { lt: oneHourAgo }
      }
    })

    for (const stuckJob of stuckJobs) {
      console.warn(`Detected stuck job ${stuckJob.id}, resetting to pending`)
      await prisma.aILabelingJob.update({
        where: { id: stuckJob.id },
        data: {
          status: 'pending',
          errorMessage: 'Job was stuck and has been reset'
        }
      })
    }

    const job = await prisma.aILabelingJob.findFirst({
      where: {
        OR: [
          { status: 'pending' },
          { status: 'processing' }
        ]
      },
      orderBy: { startedAt: 'asc' }
    })

    if (!job) {
      break
    }

    try {
      await processSingleJob(job.id)
    } catch (error) {
      console.error(`AI job ${job.id} failed:`, error)
      await prisma.aILabelingJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : String(error),
          completedAt: new Date()
        }
      })
      // Continue processing other jobs even if one fails
    }
  }
}

export function triggerAILabelingProcessor() {
  if (globalAny.__aiJobProcessorRunning) {
    // Check if the lock is stale (e.g. from a zombie processor after hot-reload)
    const elapsed = Date.now() - (globalAny.__aiJobProcessorStartedAt || 0)
    if (elapsed < PROCESSOR_LOCK_STALE_MS) {
      // Processor is genuinely running, it will pick up new jobs in its loop
      return
    }
    console.warn(`AI job processor lock is stale (held for ${Math.round(elapsed / 1000)}s), forcing restart`)
  }
  globalAny.__aiJobProcessorRunning = true
  globalAny.__aiJobProcessorStartedAt = Date.now()

  ;(async () => {
    try {
      await processJobsLoop()
    } catch (error) {
      console.error('AI job processor encountered an error:', error)
      // On error, still try to process remaining jobs
      const remainingJobs = await prisma.aILabelingJob.findFirst({
        where: {
          OR: [
            { status: 'pending' },
            { status: 'processing' }
          ]
        }
      })
      if (remainingJobs) {
        console.log('Retrying AI job processor after error...')
        globalAny.__aiJobProcessorRunning = false
        globalAny.__aiJobProcessorStartedAt = undefined
        setTimeout(() => {
          triggerAILabelingProcessor()
        }, 1000)
        return
      }
    } finally {
      globalAny.__aiJobProcessorRunning = false
      globalAny.__aiJobProcessorStartedAt = undefined
    }
  })()
}

async function processSingleJob(jobId: string) {
  let job = await prisma.aILabelingJob.findUnique({
    where: { id: jobId },
    include: {
      taxonomy: {
        select: { id: true, key: true, isActive: true }
      }
    }
  })

  if (!job) {
    return
  }

  if (job.status === 'cancelled') {
    return
  }

  if (!job.taxonomy || !job.taxonomy.isActive) {
    await prisma.aILabelingJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        errorMessage: 'Taxonomy is not available',
        completedAt: new Date()
      }
    })
    return
  }

  const criteria = (job.filterCriteria || {}) as FilterCriteria
  const sentenceIds = criteria.sentenceIds || []

  if (sentenceIds.length === 0) {
    await prisma.aILabelingJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        errorMessage: 'No sentences to process',
        completedAt: new Date()
      }
    })
    return
  }

  if (job.status !== 'processing') {
    job = await prisma.aILabelingJob.update({
      where: { id: job.id },
      data: {
        status: 'processing',
        startedAt: new Date(),
        errorMessage: null
      },
      include: {
        taxonomy: {
          select: { id: true, key: true, isActive: true }
        }
      }
    })
  }

  let processed = job.processedSentences
  let failed = job.failedSentences

  for (let offset = processed; offset < sentenceIds.length; offset += AI_LABELING_BATCH_SIZE) {
    const currentStatus = await prisma.aILabelingJob.findUnique({
      where: { id: job.id },
      select: { status: true }
    })

    if (currentStatus?.status === 'cancelled') {
      await prisma.aILabelingJob.update({
        where: { id: job.id },
        data: {
          status: 'cancelled',
          completedAt: new Date()
        }
      })
      return
    }

    const batchIds = sentenceIds.slice(offset, offset + AI_LABELING_BATCH_SIZE)
    const sentences = await prisma.sentence.findMany({
      where: { id: { in: batchIds } },
      select: {
        id: true,
        field1: true,
        field2: true,
        field3: true,
        field4: true,
        field5: true,
        fieldMapping: true
      }
    })

    const sentenceMap = new Map(sentences.map(s => [s.id, s]))
    const payloadSentences = batchIds
      .map(id => {
        const sentence = sentenceMap.get(id)
        if (!sentence) return null
        const fields = buildFieldMap(sentence)
        if (Object.keys(fields).length === 0) return null
        return {
          sentence_id: id,
          fields
        }
      })
      .filter(Boolean) as Array<{ sentence_id: string; fields: Record<string, string> }>

    if (payloadSentences.length === 0) {
      processed += batchIds.length
      await prisma.aILabelingJob.update({
        where: { id: job.id },
        data: {
          processedSentences: processed,
          failedSentences: failed
        }
      })
      continue
    }

    const batchIndex = Math.floor(offset / AI_LABELING_BATCH_SIZE)
    let batchSucceeded = false

    for (let attempt = 1; attempt <= MAX_BATCH_RETRIES; attempt++) {
      try {
        const jobHandle = await startAIJob('/label', {
          taxonomyKey: job.taxonomy.key,
          batchId: `${job.id}-${batchIndex}`,
          sentences: payloadSentences
        })
        const result = await waitForAIJobResult(jobHandle, `/label/${jobHandle}/status`)
        if (!result.success) {
          throw new Error(result.error || result.data?.error || 'AI labeling job failed')
        }
        const response = (result.data?.result || result.data) as {
          suggestions?: Array<{
            sentenceId?: string
            sentence_id?: string
            annotations: Array<{ level: number; nodeCode: string | number; confidence?: number }>
          }>
          errors?: Array<{ sentenceId?: string; sentence_id?: string; error?: string }>
        }

        const suggestionMap = new Map<string, { annotations: Array<{ level: number; nodeCode: string; confidence: number }> }>()
        for (const suggestion of response.suggestions || []) {
          const sentenceId = suggestion.sentenceId || suggestion.sentence_id
          if (!sentenceId || !Array.isArray(suggestion.annotations)) continue
          suggestionMap.set(
            sentenceId,
            {
              annotations: (suggestion.annotations || []).map(a => ({
                level: a.level,
                nodeCode: String(a.nodeCode),
                confidence: typeof a.confidence === 'number' ? a.confidence : 0
              }))
            }
          )
        }

        await prisma.$transaction(async (tx) => {
          for (const [sentenceId, data] of suggestionMap) {
            await tx.sentenceAISuggestion.deleteMany({
              where: {
                sentenceId,
                taxonomyId: job!.taxonomyId
              }
            })

            if (data.annotations.length === 0) continue

            await tx.sentenceAISuggestion.createMany({
              data: data.annotations.map(ann => ({
                sentenceId,
                taxonomyId: job!.taxonomyId,
                level: ann.level,
                nodeCode: ann.nodeCode,
                confidenceScore: ann.confidence
              }))
            })
          }
        })

        const errorIds = new Set(
          (response.errors || [])
            .map(e => e.sentenceId || e.sentence_id)
            .filter((id): id is string => Boolean(id))
        )

        for (const id of batchIds) {
          if (!suggestionMap.has(id)) {
            errorIds.add(id)
          }
        }

        failed += errorIds.size
        processed += batchIds.length

        await prisma.aILabelingJob.update({
          where: { id: job.id },
          data: {
            processedSentences: processed,
            failedSentences: failed
          }
        })

        batchSucceeded = true
        // Refresh the processor lock timestamp so long-running jobs
        // don't appear stale
        globalAny.__aiJobProcessorStartedAt = Date.now()
        break // Batch succeeded, exit retry loop

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.warn(
          `Batch ${batchIndex} of job ${job.id} failed (attempt ${attempt}/${MAX_BATCH_RETRIES}): ${errorMsg}`
        )

        if (attempt < MAX_BATCH_RETRIES) {
          // Update job with a transient error note so the UI can show it
          await prisma.aILabelingJob.update({
            where: { id: job.id },
            data: {
              errorMessage: `Batch ${batchIndex} failed (attempt ${attempt}/${MAX_BATCH_RETRIES}), retrying...`
            }
          })
          await new Promise(resolve => setTimeout(resolve, BATCH_RETRY_DELAY_MS))
        } else {
          // All retries exhausted — fail the entire job
          await prisma.aILabelingJob.update({
            where: { id: job.id },
            data: {
              status: 'failed',
              errorMessage: `Batch ${batchIndex} failed after ${MAX_BATCH_RETRIES} attempts: ${errorMsg}`,
              completedAt: new Date(),
              processedSentences: processed,
              failedSentences: failed
            }
          })
          throw error
        }
      }
    }

    if (!batchSucceeded) {
      // Safety net — should not reach here due to throw above, but just in case
      throw new Error(`Batch ${batchIndex} of job ${job.id} failed after all retries`)
    }
  }

  await prisma.aILabelingJob.update({
    where: { id: job.id },
    data: {
      status: failed > 0 ? 'completed' : 'completed',
      processedSentences: sentenceIds.length,
      failedSentences: failed,
      completedAt: new Date()
    }
  })

  // After completing a job, check if there are more pending jobs and continue processing
  // This ensures queued jobs are picked up immediately
  const hasMoreJobs = await prisma.aILabelingJob.findFirst({
    where: {
      OR: [
        { status: 'pending' },
        { status: 'processing' }
      ]
    }
  })

  if (hasMoreJobs) {
    // Trigger processor again to pick up the next job
    // Use setTimeout to avoid blocking and allow the current job to fully complete
    setTimeout(() => {
      triggerAILabelingProcessor()
    }, 100)
  }
}

