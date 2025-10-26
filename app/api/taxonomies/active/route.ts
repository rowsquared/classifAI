import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const taxonomies = await prisma.taxonomy.findMany({
      where: { isActive: true },
      select: {
        id: true,
        key: true,
        displayName: true,
        maxDepth: true,
        levelNames: true
      },
      orderBy: { createdAt: 'asc' }
    })
    
    return NextResponse.json({ ok: true, taxonomies })
  } catch (error) {
    console.error('Failed to fetch active taxonomies:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}

