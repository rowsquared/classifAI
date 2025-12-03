import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const taxonomies = await prisma.taxonomy.findMany({
      where: {},
      select: {
        id: true,
        key: true,
        maxDepth: true,
        levelNames: true,
        lastAISyncStatus: true
      },
      orderBy: { createdAt: 'asc' }
    })
    
    return NextResponse.json({ ok: true, taxonomies })
  } catch (error: any) {
    console.error('Failed to fetch active taxonomies:', error)
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack
    })
    return NextResponse.json({ 
      ok: false, 
      error: error?.message || String(error),
      details: process.env.NODE_ENV === 'development' ? {
        code: error?.code,
        meta: error?.meta
      } : undefined
    }, { status: 500 })
  }
}

