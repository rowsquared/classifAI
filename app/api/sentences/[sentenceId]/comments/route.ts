import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sentenceId: string }> }
) {
  try {
    const { sentenceId } = await params
    const { body } = await req.json()

    if (!body || body.trim() === '') {
      return NextResponse.json(
        { ok: false, error: 'Comment body is required' },
        { status: 400 }
      )
    }

    // For now, we need to get a default user since auth isn't implemented yet
    // Get the first user to use as the author
    const defaultUser = await prisma.user.findFirst()
    
    if (!defaultUser) {
      return NextResponse.json(
        { ok: false, error: 'No users found in system' },
        { status: 500 }
      )
    }

    // Create the comment
    const comment = await prisma.comment.create({
      data: {
        body: body.trim(),
        sentence: {
          connect: { id: sentenceId }
        },
        author: {
          connect: { id: defaultUser.id }
        }
      },
      include: {
        author: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json({ ok: true, comment })
  } catch (error) {
    console.error('Failed to create comment:', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to create comment' },
      { status: 500 }
    )
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sentenceId: string }> }
) {
  try {
    const { sentenceId } = await params
    const { searchParams } = new URL(req.url)
    const includeResolved = searchParams.get('includeResolved') === 'true'

    const [comments, resolvedCount] = await Promise.all([
      prisma.comment.findMany({
        where: {
          sentenceId,
          ...(includeResolved ? {} : { resolved: false })
        },
        include: {
          author: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.comment.count({
        where: {
          sentenceId,
          resolved: true
        }
      })
    ])

    return NextResponse.json({ ok: true, comments, hasResolved: resolvedCount > 0 })
  } catch (error) {
    console.error('Failed to fetch comments:', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch comments' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sentenceId: string }> }
) {
  try {
    const { sentenceId } = await params
    const { commentId, resolved } = await req.json()

    if (!commentId || typeof resolved !== 'boolean') {
      return NextResponse.json(
        { ok: false, error: 'commentId and resolved flag are required' },
        { status: 400 }
      )
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { sentenceId: true }
    })

    if (!comment || comment.sentenceId !== sentenceId) {
      return NextResponse.json(
        { ok: false, error: 'Comment not found for this sentence' },
        { status: 404 }
      )
    }

    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: {
        resolved,
        resolvedAt: resolved ? new Date() : null
      },
      include: {
        author: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json({ ok: true, comment: updated })
  } catch (error) {
    console.error('Failed to update comment:', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to update comment' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sentenceId: string }> }
) {
  try {
    const { sentenceId } = await params
    const { commentId } = await req.json()

    if (!commentId) {
      return NextResponse.json(
        { ok: false, error: 'commentId is required' },
        { status: 400 }
      )
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { sentenceId: true }
    })

    if (!comment || comment.sentenceId !== sentenceId) {
      return NextResponse.json(
        { ok: false, error: 'Comment not found for this sentence' },
        { status: 404 }
      )
    }

    await prisma.comment.delete({
      where: { id: commentId }
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Failed to delete comment:', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to delete comment' },
      { status: 500 }
    )
  }
}


