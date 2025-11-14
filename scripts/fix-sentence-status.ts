import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function fixSentenceStatus(sentenceId: string) {
  console.log(`\nFixing sentence status: ${sentenceId}\n`)
  
  const result = await prisma.$transaction(async (tx) => {
    // Get sentence
    const sentence = await tx.sentence.findUnique({
      where: { id: sentenceId },
      include: {
        annotations: true
      }
    })
    
    if (!sentence) {
      console.log('Sentence not found')
      return null
    }
    
    // Get active taxonomies with maxDepth
    const activeTaxonomies = await tx.taxonomy.findMany({
      where: { isActive: true },
      select: { id: true, key: true, maxDepth: true }
    })
    
    // Get all annotations
    const allAnnotations = await tx.sentenceAnnotation.findMany({
      where: { sentenceId: sentenceId }
    })
    
    // Check if each active taxonomy has at least one annotation
    // If annotations exist, they must be complete (leaf or unknown) because
    // the frontend submit button only enables in those cases
    const allTaxonomiesCompleted = activeTaxonomies.every(activeTax => {
      const taxAnnotations = allAnnotations.filter(a => a.taxonomyId === activeTax.id)
      return taxAnnotations.length > 0
    })
    
    // Update status
    const newStatus = allTaxonomiesCompleted ? 'submitted' : 'pending'
    
    if (sentence.status !== newStatus) {
      await tx.sentence.update({
        where: { id: sentenceId },
        data: {
          status: newStatus,
          lastEditedAt: new Date()
        }
      })
      console.log(`Status updated: ${sentence.status} → ${newStatus}`)
    } else {
      console.log(`Status already correct: ${newStatus}`)
    }
    
    return { oldStatus: sentence.status, newStatus, allTaxonomiesCompleted }
  })
  
  await prisma.$disconnect()
  return result
}

const sentenceId = process.argv[2]
if (!sentenceId) {
  console.error('Usage: npx tsx scripts/fix-sentence-status.ts <sentenceId>')
  process.exit(1)
}

fixSentenceStatus(sentenceId).catch(console.error)

