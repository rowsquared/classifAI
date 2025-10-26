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

    const comments = await prisma.comment.findMany({
      where: { sentenceId },
      include: {
        author: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ ok: true, comments })
  } catch (error) {
    console.error('Failed to fetch comments:', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch comments' },
      { status: 500 }
    )
  }
}

