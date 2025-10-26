import { prisma } from '../lib/prisma'

async function main() {
  const session = { user: { id: 'cmh5cfcqu0001x60j93dwrlpd' } } // Andreas
  
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true }
  })

  console.log('User:', user)

  let visibleUserIds: string[] = []

  if (user?.role === 'admin') {
    console.log('User is admin')
    visibleUserIds = []
  } else if (user?.role === 'supervisor') {
    console.log('User is supervisor')
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
    
    visibleUserIds = await getSupervisedUserIds(session.user.id)
    visibleUserIds.push(session.user.id)
  } else {
    visibleUserIds = [session.user.id]
  }

  console.log('Visible user IDs:', visibleUserIds)

  const sentenceWhere: any = {}
  if (user?.role !== 'admin') {
    if (visibleUserIds.length > 0) {
      sentenceWhere.assignments = {
        some: {
          userId: { in: visibleUserIds }
        }
      }
    } else {
      sentenceWhere.id = 'impossible-id-no-results'
    }
  }

  console.log('Sentence where:', JSON.stringify(sentenceWhere, null, 2))

  const totalSentences = await prisma.sentence.count({
    where: sentenceWhere
  })

  console.log('Total sentences:', totalSentences)

  // Test date range
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 6)
  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)

  console.log('Date range:', start.toISOString(), 'to', end.toISOString())

  const completedCurrent = await prisma.sentence.count({
    where: {
      ...sentenceWhere,
      status: 'submitted',
      lastEditedAt: {
        gte: start,
        lte: end
      }
    }
  })

  console.log('Completed current:', completedCurrent)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })

