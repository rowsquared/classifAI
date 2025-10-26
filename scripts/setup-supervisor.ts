import { prisma } from '../lib/prisma'

async function main() {
  // Find Andreas (supervisor)
  const andreas = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { contains: 'andreas' } },
        { name: { contains: 'Andreas' } }
      ]
    }
  })

  if (!andreas) {
    console.log('Andreas not found')
    return
  }

  console.log('Andreas:', andreas.id, andreas.name, andreas.role)

  // Find Berta
  const berta = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { contains: 'berta' } },
        { name: { contains: 'Berta' } }
      ]
    }
  })

  if (!berta) {
    console.log('Berta not found')
    return
  }

  console.log('Berta:', berta.id, berta.name, berta.role, 'supervisorId:', berta.supervisorId)

  // Set Andreas as Berta's supervisor if not already set
  if (berta.supervisorId !== andreas.id) {
    await prisma.user.update({
      where: { id: berta.id },
      data: { supervisorId: andreas.id }
    })
    console.log('✅ Set Andreas as Berta\'s supervisor')
  } else {
    console.log('✅ Andreas is already Berta\'s supervisor')
  }

  // Check assignments
  const bertaAssignments = await prisma.sentenceAssignment.count({
    where: { userId: berta.id }
  })

  console.log(`Berta has ${bertaAssignments} sentence assignments`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })

