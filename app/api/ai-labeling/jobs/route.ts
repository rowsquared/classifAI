import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { triggerAILabelingProcessor } from '@/lib/ai-job-runner'
import { z } from 'zod'

const startSchema = z.object({
  taxonomyKey: z.string(),
  sentenceIds: z.array(z.string()).optional(),
  importIds: z.array(z.string()).optional(),
  onlyUnsubmitted: z.boolean().optional()
})

const statusSchema = z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled'])

function buildSentenceFilter(input: z.infer<typeof startSchema>) {
  const where: any = {}

  if (input.sentenceIds?.length) {
    where.id = { in: input.sentenceIds }
  }
  if (input.importIds?.length) {
    where.importId = { in: input.importIds }
  }
  if (input.onlyUnsubmitted) {
    where.status = 'pending'
  }

  return where
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify the user exists in the database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true }
    })

    if (!user) {
      console.error(`User ${session.user.id} from session not found in database`)
      return NextResponse.json({ 
        error: 'User account not found. Please log out and log back in.' 
      }, { status: 401 })
    }

    const body = await req.json()
    const input = startSchema.parse(body)

    const taxonomy = await prisma.taxonomy.findFirst({
      where: { key: input.taxonomyKey, isActive: true },
      select: { id: true, key: true }
    })

    if (!taxonomy) {
      return NextResponse.json({ error: 'Taxonomy not found' }, { status: 404 })
    }

    const sentenceWhere = buildSentenceFilter(input)
    const sentences = await prisma.sentence.findMany({
      where: sentenceWhere,
      select: { id: true },
      orderBy: [{ importOrder: 'asc' }, { id: 'asc' }]
    })

    const sentenceIds = sentences.map(s => s.id)
    if (sentenceIds.length === 0) {
      return NextResponse.json({ error: 'No sentences matched the criteria' }, { status: 400 })
    }

    const job = await prisma.aILabelingJob.create({
      data: {
        createdById: session.user.id,
        taxonomyId: taxonomy.id,
        status: 'pending',
        totalSentences: sentenceIds.length,
        filterCriteria: {
          sentenceIds,
          importIds: input.importIds || [],
          onlyUnsubmitted: Boolean(input.onlyUnsubmitted)
        }
      },
      include: {
        taxonomy: { select: { key: true } },
        createdBy: { select: { id: true, name: true, email: true } }
      }
    })

    console.log(`✅ Created AI labeling job: ${job.id} for taxonomy ${taxonomy.key} with ${sentenceIds.length} sentences`)

    triggerAILabelingProcessor()

    return NextResponse.json({ ok: true, job })
  } catch (error: any) {
    console.error('Failed to start AI labeling job:', error)
    return NextResponse.json({ error: error?.message || 'Failed to start AI labeling job' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = req.nextUrl.searchParams
    const statusParams = searchParams.getAll('status')
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 100)

    const where: any = {}
    if (statusParams.length > 0) {
      const validStatuses = statusParams.filter(s => statusSchema.safeParse(s).success)
      if (validStatuses.length > 0) {
        where.status = { in: validStatuses }
      }
    }

    const [jobs, total] = await Promise.all([
      prisma.aILabelingJob.findMany({
        where,
        orderBy: [{ startedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          taxonomy: { select: { key: true } },
          createdBy: { select: { id: true, name: true, email: true } }
        }
      }),
      prisma.aILabelingJob.count({ where })
    ])

    return NextResponse.json({
      ok: true,
      jobs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error: any) {
    console.error('Failed to fetch AI labeling jobs:', error)
    return NextResponse.json({ error: error?.message || 'Failed to fetch jobs' }, { status: 500 })
  }
}

