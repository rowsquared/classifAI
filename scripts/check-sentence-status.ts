import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkSentenceStatus(sentenceId: string) {
  console.log(`\nChecking sentence: ${sentenceId}\n`)
  
  // Get sentence
  const sentence = await prisma.sentence.findUnique({
    where: { id: sentenceId },
    include: {
      annotations: {
        include: {
          taxonomy: {
            select: { key: true, id: true }
          }
        }
      }
    }
  })
  
  if (!sentence) {
    console.log('Sentence not found')
    return
  }
  
  console.log(`Current status: ${sentence.status}`)
  console.log(`\nAnnotations (${sentence.annotations.length}):`)
  sentence.annotations.forEach(ann => {
    console.log(`  - Taxonomy: ${ann.taxonomy.key}, Level: ${ann.level}, Code: ${ann.nodeCode}`)
  })
  
  // Get active taxonomies
  const activeTaxonomies = await prisma.taxonomy.findMany({
    where: { isActive: true },
    select: { id: true, key: true, maxDepth: true }
  })
  
  console.log(`\nActive taxonomies (${activeTaxonomies.length}):`)
  activeTaxonomies.forEach(tax => {
    console.log(`  - ${tax.key} (${tax.id})`)
  })
  
  // Check completion
  console.log(`\nChecking completion:`)
  let allCompleted = true
  
  for (const activeTax of activeTaxonomies) {
    const taxAnnotations = sentence.annotations.filter(a => a.taxonomyId === activeTax.id)
    console.log(`\n  ${activeTax.key}:`)
    console.log(`    Annotations: ${taxAnnotations.length}`)
    
    if (taxAnnotations.length === 0) {
      console.log(`    ❌ No annotations`)
      allCompleted = false
      continue
    }
    
    // Check for unknown
    const hasUnknown = taxAnnotations.some(ann => ann.nodeCode === -99)
    if (hasUnknown) {
      console.log(`    ✓ Has unknown (-99)`)
      continue
    }
    
    // Find deepest annotation
    const deepestAnnotation = taxAnnotations.reduce((deepest, ann) => 
      ann.level > deepest.level ? ann : deepest
    , taxAnnotations[0])
    
    console.log(`    Deepest: Level ${deepestAnnotation.level}, Code ${deepestAnnotation.nodeCode}`)
    
    // Check if deepest is a leaf (either isLeaf=true OR at max depth)
    const node = await prisma.taxonomyNode.findFirst({
      where: {
        taxonomyId: activeTax.id,
        code: deepestAnnotation.nodeCode,
        level: deepestAnnotation.level
      },
      select: { isLeaf: true, label: true }
    })
    
    const isLeaf = node?.isLeaf || false
    const isAtMaxDepth = deepestAnnotation.level >= (activeTax.maxDepth || 5)
    const hasCompletePath = isLeaf || isAtMaxDepth
    
    console.log(`    isLeaf=${isLeaf}, isAtMaxDepth=${isAtMaxDepth} (maxDepth=${activeTax.maxDepth || 5}), hasCompletePath=${hasCompletePath}`)
    
    if (!hasCompletePath) {
      console.log(`    ❌ No complete path found`)
      allCompleted = false
    } else {
      console.log(`    ✓ Complete path found`)
    }
  }
  
  console.log(`\n\nAll taxonomies completed: ${allCompleted}`)
  console.log(`Should be status: ${allCompleted ? 'submitted' : 'pending'}`)
  
  await prisma.$disconnect()
}

const sentenceId = process.argv[2]
if (!sentenceId) {
  console.error('Usage: npx tsx scripts/check-sentence-status.ts <sentenceId>')
  process.exit(1)
}

checkSentenceStatus(sentenceId).catch(console.error)

