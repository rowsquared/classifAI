import { prisma } from '@/lib/prisma'
import { callAILabelingEndpoint, ensureAIConfig } from './ai-labeling'
import { AI_LABELING_BATCH_SIZE } from './constants'
import { buildFieldMap } from './ai-utils'

type FilterCriteria = {
  sentenceIds: string[]
  importIds?: string[]
  onlyUnsubmitted?: boolean
  requestedBy?: string
}

const globalAny = globalThis as typeof globalThis & {
  __aiJobProcessorRunning?: boolean
}

async function processJobsLoop() {
  ensureAIConfig()

  while (true) {
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
    }
  }
}

export function triggerAILabelingProcessor() {
  if (globalAny.__aiJobProcessorRunning) {
    return
  }
  globalAny.__aiJobProcessorRunning = true

  ;(async () => {
    try {
      await processJobsLoop()
    } catch (error) {
      console.error('AI job processor encountered an error:', error)
    } finally {
      globalAny.__aiJobProcessorRunning = false
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
          sentenceId: id,
          fields
        }
      })
      .filter(Boolean) as Array<{ sentenceId: string; fields: Record<string, string> }>

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

    try {
      const response = await callAILabelingEndpoint<{
        batchId?: string
        suggestions?: Array<{
          sentenceId: string
          annotations: Array<{ level: number; nodeCode: string | number; confidence?: number }>
        }>
        errors?: Array<{ sentenceId?: string; error?: string }>
      }>('/label', {
        taxonomyKey: job.taxonomy.key,
        batchId: `${job.id}-${Math.floor(offset / AI_LABELING_BATCH_SIZE)}`,
        sentences: payloadSentences
      })

      const suggestionMap = new Map<string, { annotations: Array<{ level: number; nodeCode: string; confidence: number }> }>()
      for (const suggestion of response.suggestions || []) {
        if (!suggestion?.sentenceId || !Array.isArray(suggestion.annotations)) continue
        suggestionMap.set(
          suggestion.sentenceId,
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
          .map(e => e.sentenceId)
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
    } catch (error) {
      await prisma.aILabelingJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : String(error),
          completedAt: new Date(),
          processedSentences: processed,
          failedSentences: failed
        }
      })
      throw error
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
}

