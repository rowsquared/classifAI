import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { callAILabelingEndpoint, ensureAIConfig } from '@/lib/ai-labeling'
import { z } from 'zod'
import { AI_LEARNING_BATCH_SIZE, AI_LEARNING_MIN_NEW_ANNOTATIONS } from '@/lib/constants'
import { buildFieldMap } from '@/lib/ai-utils'

const learnSchema = z.object({
  taxonomyKey: z.string(),
  sentenceIds: z.array(z.string()).optional(),
  importIds: z.array(z.string()).optional(),
  onlyUnsubmitted: z.boolean().optional()
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    ensureAIConfig()

    const body = await req.json()
    const { taxonomyKey, sentenceIds, importIds, onlyUnsubmitted } = learnSchema.parse(body)

    const taxonomy = await prisma.taxonomy.findFirst({
      where: { key: taxonomyKey, isActive: true },
      select: {
        id: true,
        key: true,
        lastLearningAt: true,
        newAnnotationsSinceLastLearning: true
      }
    })

    if (!taxonomy) {
      return NextResponse.json({ error: 'Taxonomy not found' }, { status: 404 })
    }

    if (!sentenceIds && taxonomy.newAnnotationsSinceLastLearning < AI_LEARNING_MIN_NEW_ANNOTATIONS) {
      return NextResponse.json({
        error: `At least ${AI_LEARNING_MIN_NEW_ANNOTATIONS} new annotations are required before sending for learning`
      }, { status: 400 })
    }

    const annotationsWhere: any = {
      taxonomyId: taxonomy.id,
      source: 'user' as const
    }

    if (taxonomy.lastLearningAt) {
      annotationsWhere.updatedAt = { gt: taxonomy.lastLearningAt }
    }
    if (sentenceIds?.length) {
      annotationsWhere.sentenceId = { in: sentenceIds }
    }
    if (importIds?.length || onlyUnsubmitted) {
      annotationsWhere.sentence = {}
      if (importIds?.length) {
        annotationsWhere.sentence.importId = { in: importIds }
      }
      if (onlyUnsubmitted) {
        annotationsWhere.sentence.status = 'pending'
      }
    }

    const annotations = await prisma.sentenceAnnotation.findMany({
      where: annotationsWhere,
      include: {
        sentence: {
          select: {
            id: true,
            field1: true,
            field2: true,
            field3: true,
            field4: true,
            field5: true,
            fieldMapping: true,
            status: true
          }
        }
      }
    })

    if (annotations.length === 0) {
      return NextResponse.json({ error: 'No new annotations found for learning' }, { status: 400 })
    }

    const sentencesMap = new Map<string, {
      sentenceId: string
      fields: Record<string, string>
      annotations: Array<{ level: number, nodeCode: string }>
      source: 'user'
    }>()

    for (const ann of annotations) {
      const sentenceId = ann.sentenceId
      if (!sentencesMap.has(sentenceId)) {
        sentencesMap.set(sentenceId, {
          sentenceId,
          fields: buildFieldMap(ann.sentence),
          annotations: [],
          source: 'user'
        })
      }
      sentencesMap.get(sentenceId)!.annotations.push({
        level: ann.level,
        nodeCode: ann.nodeCode
      })
    }

    const sentencesPayload = Array.from(sentencesMap.values())
    const batchSize = AI_LEARNING_BATCH_SIZE
    let batchesSent = 0

    for (let i = 0; i < sentencesPayload.length; i += batchSize) {
      const batch = sentencesPayload.slice(i, i + batchSize)
      await callAILabelingEndpoint('/learn', {
        taxonomyKey: taxonomy.key,
        sentences: batch
      })
      batchesSent++
    }

    await prisma.taxonomy.update({
      where: { id: taxonomy.id },
      data: {
        lastLearningAt: new Date(),
        newAnnotationsSinceLastLearning: 0
      }
    })

    return NextResponse.json({
      ok: true,
      sent: sentencesPayload.length,
      batches: batchesSent
    })
  } catch (error: any) {
    console.error('AI learning error:', error)
    if (error?.message && error.message.includes('AI labeling service is not configured')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: error?.message || 'Failed to send annotations for learning' }, { status: 500 })
  }
}

