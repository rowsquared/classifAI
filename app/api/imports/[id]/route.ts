import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  req: NextRequest, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Check if import exists
    const importRecord = await prisma.sentenceImport.findUnique({
      where: { id },
      include: {
        _count: { select: { sentences: true } }
      }
    })

    if (!importRecord) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Import not found' 
      }, { status: 404 })
    }

    // Delete import (cascade will remove sentences)
    await prisma.sentenceImport.delete({
      where: { id }
    })

    return NextResponse.json({ 
      ok: true, 
      deletedSentences: importRecord._count.sentences 
    })

  } catch (e: any) {
    console.error('Failed to delete import:', e)
    return NextResponse.json({ 
      ok: false, 
      error: e?.message || String(e) 
    }, { status: 500 })
  }
}

