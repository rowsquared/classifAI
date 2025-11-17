import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { jobId } = await params
    const job = await prisma.aILabelingJob.findUnique({
      where: { id: jobId },
      select: { status: true }
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return NextResponse.json({ ok: true, status: job.status })
    }

    await prisma.aILabelingJob.update({
      where: { id: jobId },
      data: {
        status: 'cancelled',
        completedAt: new Date()
      }
    })

    return NextResponse.json({ ok: true, status: 'cancelled' })
  } catch (error: any) {
    console.error('Failed to cancel AI labeling job:', error)
    return NextResponse.json({ error: error?.message || 'Failed to cancel job' }, { status: 500 })
  }
}

