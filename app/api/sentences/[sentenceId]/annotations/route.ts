import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { UNKNOWN_NODE_CODE } from '@/lib/constants'

const annotationSchema = z.object({
  annotations: z.array(z.object({
    level: z.number(),
    nodeCode: z.union([z.string(), z.number()]),
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
    const {
      annotations: rawAnnotations,
      status,
      flagged,
      comment,
      labelingStartedAt
    } = annotationSchema.parse(body)

    const annotations = rawAnnotations.map(ann => ({
      ...ann,
      nodeCode: String(ann.nodeCode)
    }))

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

    // Get active taxonomies before transaction (needed for completion check)
    const activeTaxonomies = await prisma.taxonomy.findMany({
      where: { isActive: true },
      select: { id: true, key: true }
    })

    let allAnnotations: any[] = []
    let finalStatus: 'pending' | 'submitted' | 'skipped' | 'escalated' = status

    await prisma.$transaction(async (tx) => {
      // Delete existing annotations for THIS taxonomy only
      if (taxonomy) {
        await tx.sentenceAnnotation.deleteMany({
          where: { 
            sentenceId: sentenceId,
            taxonomyId: taxonomy.id
          }
        })
      }

      // Create new annotations (only if we have a taxonomy)
      if (taxonomy) {
        const startTime = labelingStartedAt ? new Date(labelingStartedAt) : null
        
        for (const annotation of annotations) {
          // Now we store '-99' for unknown (not -1)
          await tx.sentenceAnnotation.create({
            data: {
              sentenceId: sentenceId,
              taxonomyId: taxonomy.id,
              level: annotation.level,
              nodeCode: annotation.nodeCode, // '-99' for unknown
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

      // Get current sentence to check status
      const currentSentence = await tx.sentence.findUnique({
        where: { id: sentenceId },
        select: { status: true }
      })
      
      // Get all annotations for this sentence (after creating new ones)
      allAnnotations = await tx.sentenceAnnotation.findMany({
        where: { sentenceId: sentenceId }
      })
      
      // Check if each active taxonomy has at least one annotation
      // If annotations exist, they must be complete (leaf or unknown) because
      // the frontend submit button only enables in those cases
      const allTaxonomiesCompleted = activeTaxonomies.every(activeTax => {
        const taxAnnotations = allAnnotations.filter(a => a.taxonomyId === activeTax.id)
        return taxAnnotations.length > 0
      })
      
      // Determine final status
      // Skip always sets to skipped
      if (status === 'skipped') {
        finalStatus = 'skipped'
      } else if (allTaxonomiesCompleted) {
        // All taxonomies completed - always set to submitted
        finalStatus = 'submitted'
      } else {
        // Not all taxonomies completed - keep as pending
        finalStatus = 'pending'
      }
      
      // Update sentence status and flag
      const updateData: any = {
        status: finalStatus
      }
      
      if (flagged !== undefined) {
        updateData.flagged = flagged
      }
      
      // Only update lastEditedAt if status changed or annotations were added
      const statusChanged = currentSentence?.status !== finalStatus
      const hasAnnotations = annotations.length > 0
      
      if (statusChanged || hasAnnotations) {
        updateData.lastEditedAt = new Date()
      }
      
      await tx.sentence.update({
        where: { id: sentenceId },
        data: updateData
      })
    })

    // Return updated status and completion info to avoid reload
    // Calculate completed taxonomies from annotations we already have
    const completedTaxonomies = activeTaxonomies
      .filter(activeTax => {
        const taxAnnotations = allAnnotations.filter(
          a => a.taxonomyId === activeTax.id
        )
        return taxAnnotations.length > 0
      })
      .map(t => t.key)

    if (taxonomy && annotations.length > 0) {
      await prisma.taxonomy.update({
        where: { id: taxonomy.id },
        data: {
          newAnnotationsSinceLastLearning: {
            increment: annotations.length
          }
        }
      })
    }

    return NextResponse.json({ 
      success: true,
      status: finalStatus, // Use the status we calculated in the transaction
      completedTaxonomies,
      allCompleted: completedTaxonomies.length === activeTaxonomies.length
    })
  } catch (error) {
    console.error('Annotation submission error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
