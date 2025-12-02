import { prisma } from '../lib/prisma'

async function main() {
  try {
    // Count all AI labeling jobs
    const totalCount = await prisma.aILabelingJob.count()
    console.log(`✅ Total AILabelingJob records: ${totalCount}`)
    
    // Count by status
    const statusCounts = await prisma.aILabelingJob.groupBy({
      by: ['status'],
      _count: {
        id: true
      }
    })
    
    console.log(`\n📊 Jobs by status:`)
    statusCounts.forEach(({ status, _count }) => {
      console.log(`   ${status}: ${_count.id}`)
    })
    
    // Get all jobs with details (no filter to see everything)
    const allJobs = await prisma.aILabelingJob.findMany({
      orderBy: { startedAt: 'desc' },
      include: {
        taxonomy: { select: { key: true } },
        createdBy: { select: { name: true, email: true } }
      },
      take: 100 // Show last 100 jobs
    })
    
    console.log(`\n🔍 Total jobs found (no filter): ${allJobs.length}`)
    console.log(`\n📋 Recent jobs (showing last ${Math.min(allJobs.length, 20)}):`)
    allJobs.forEach((job, index) => {
      console.log(`\n   ${index + 1}. Job ID: ${job.id}`)
      console.log(`      Taxonomy: ${job.taxonomy.key}`)
      console.log(`      Status: ${job.status}`)
      console.log(`      Started: ${job.startedAt.toISOString()}`)
      console.log(`      Total Sentences: ${job.totalSentences}`)
      console.log(`      Processed: ${job.processedSentences}`)
      console.log(`      Created By: ${job.createdBy.name || job.createdBy.email}`)
      if (job.completedAt) {
        console.log(`      Completed: ${job.completedAt.toISOString()}`)
      }
      if (job.errorMessage) {
        console.log(`      Error: ${job.errorMessage}`)
      }
    })
    
  } catch (error: any) {
    console.error(`❌ Error accessing AILabelingJob table:`)
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
