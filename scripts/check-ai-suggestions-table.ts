import { prisma } from '../lib/prisma'

async function main() {
  try {
    // Try to query the table
    const count = await prisma.sentenceAISuggestion.count()
    console.log(`✅ SentenceAISuggestion table exists!`)
    console.log(`   Total records: ${count}`)
    
    // Show table structure by querying one record
    const sample = await prisma.sentenceAISuggestion.findFirst({
      include: {
        sentence: { select: { id: true } },
        taxonomy: { select: { key: true } }
      }
    })
    
    if (sample) {
      console.log(`\n📋 Sample record:`)
      console.log(`   ID: ${sample.id}`)
      console.log(`   Sentence ID: ${sample.sentenceId}`)
      console.log(`   Taxonomy: ${sample.taxonomy.key}`)
      console.log(`   Level: ${sample.level}`)
      console.log(`   Node Code: ${sample.nodeCode}`)
      console.log(`   Confidence: ${sample.confidenceScore}`)
    } else {
      console.log(`\n📋 No records found (table is empty)`)
    }
    
    // List all columns by trying to query with select
    console.log(`\n📊 Table structure verified via Prisma Client`)
  } catch (error: any) {
    console.error(`❌ Error accessing SentenceAISuggestion table:`)
    console.error(`   ${error.message}`)
    process.exit(1)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

