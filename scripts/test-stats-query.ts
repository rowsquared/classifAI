import { prisma } from '../lib/prisma'

async function main() {
  // Find Andreas
  const andreas = await prisma.user.findFirst({
    where: { name: { contains: 'Andreas' } },
    select: { id: true, role: true }
  })

  if (!andreas) {
    console.log('Andreas not found')
    return
  }

  console.log('Andreas:', andreas.id, andreas.role)

  // Simulate the supervisor logic
  const getSupervisedUserIds = async (supervisorId: string): Promise<string[]> => {
    const labellers = await prisma.user.findMany({
      where: { supervisorId },
      select: { id: true, role: true }
    })
    
    let allIds = labellers.map(l => l.id)
    
    for (const labeller of labellers) {
      if (labeller.role === 'supervisor') {
        const nested = await getSupervisedUserIds(labeller.id)
        allIds = allIds.concat(nested)
      }
    }
    
    return allIds
  }

  const visibleUserIds = await getSupervisedUserIds(andreas.id)
  visibleUserIds.push(andreas.id)

  console.log('Visible user IDs:', visibleUserIds)

  // Test the query
  const totalSentences = await prisma.sentence.count({
    where: {
      assignments: {
        some: {
          userId: { in: visibleUserIds }
        }
      }
    }
  })

  console.log('Total sentences visible to Andreas:', totalSentences)

  // Get completed sentences in last week
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 6)
  weekAgo.setHours(0, 0, 0, 0)

  const completed = await prisma.sentence.count({
    where: {
      assignments: {
        some: {
          userId: { in: visibleUserIds }
        }
      },
      status: 'submitted',
      lastEditedAt: {
        gte: weekAgo,
        lte: new Date()
      }
    }
  })

  console.log('Completed in last week:', completed)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })

