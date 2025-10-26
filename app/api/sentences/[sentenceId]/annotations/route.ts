import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const annotationSchema = z.object({
  annotations: z.array(z.object({
    level: z.number(),
    nodeCode: z.number(),
    taxonomyKey: z.string()
  })),
  status: z.enum(['pending', 'submitted', 'skipped', 'escalated']),
  flagged: z.boolean().optional(),
  comment: z.string().optional(),
  labelingStartedAt: z.string().optional() // ISO timestamp when labeling started
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sentenceId: string }> }
) {
  try {
    const { sentenceId } = await params
    const body = await req.json()
    const { annotations, status, flagged, comment, labelingStartedAt } = annotationSchema.parse(body)

    // Get taxonomy ID from the first annotation (all annotations should be for the same taxonomy)
    let taxonomy = null
    if (annotations.length > 0 && annotations[0].taxonomyKey) {
      taxonomy = await prisma.taxonomy.findUnique({
        where: { key: annotations[0].taxonomyKey },
        select: { id: true }
      })

      if (!taxonomy) {
        return NextResponse.json({ error: 'Taxonomy not found' }, { status: 404 })
      }
    }

    // Get default user for comments
    const defaultUser = await prisma.user.findFirst()

    await prisma.$transaction(async (tx) => {
      // Delete existing annotations
      await tx.sentenceAnnotation.deleteMany({
        where: { sentenceId: sentenceId }
      })

      // Create new annotations (only if we have a taxonomy)
      if (taxonomy) {
        const startTime = labelingStartedAt ? new Date(labelingStartedAt) : null
        
        for (const annotation of annotations) {
          // Now we store -99 for unknown (not -1)
          await tx.sentenceAnnotation.create({
            data: {
              sentenceId: sentenceId,
              taxonomyId: taxonomy.id,
              level: annotation.level,
              nodeCode: annotation.nodeCode, // -99 for unknown
              source: 'user',
              labelingStartedAt: startTime
            }
          })
        }
      }

      // Add comment if provided
      if (comment && comment.trim() && defaultUser) {
        await tx.comment.create({
          data: {
            body: comment.trim(),
            sentenceId: sentenceId,
            authorId: defaultUser.id
          }
        })
      }

      // Get current sentence to check if we're changing status or annotations
      const currentSentence = await tx.sentence.findUnique({
        where: { id: sentenceId },
        select: { status: true }
      })
      
      // Update sentence status and flag
      const updateData: any = {
        status
      }
      
      if (flagged !== undefined) {
        updateData.flagged = flagged
      }
      
      // Only update lastEditedAt if status changed or annotations were added
      const statusChanged = currentSentence?.status !== status
      const hasAnnotations = annotations.length > 0
      
      if (statusChanged || hasAnnotations) {
        updateData.lastEditedAt = new Date()
      }
      
      await tx.sentence.update({
        where: { id: sentenceId },
        data: updateData
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Annotation submission error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
