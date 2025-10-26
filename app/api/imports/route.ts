import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const imports = await prisma.sentenceImport.findMany({
      orderBy: { uploadedAt: 'desc' },
      include: {
        _count: {
          select: { sentences: true }
        }
      }
    })

    return NextResponse.json({ 
      ok: true,
      imports: imports.map(imp => ({
        id: imp.id,
        fileName: imp.fileName,
        uploadedAt: imp.uploadedAt,
        totalRows: imp.totalRows,
        sentenceCount: imp._count.sentences
      }))
    })
  } catch (e: any) {
    console.error('Failed to fetch imports:', e)
    return NextResponse.json({ 
      ok: false, 
      error: e?.message || String(e) 
    }, { status: 500 })
  }
}

