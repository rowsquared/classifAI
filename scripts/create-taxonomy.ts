import { prisma } from '../lib/prisma'

async function main() {
  // Create ISCO taxonomy
  const taxonomy = await prisma.taxonomy.upsert({
    where: { key: 'ISCO' },
    update: {},
    create: {
      key: 'ISCO',
      maxDepth: 5
    }
  })

  console.log('Created taxonomy:', taxonomy)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

