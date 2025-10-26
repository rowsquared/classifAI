import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

/**
 * GET /api/export?status=...&dateRange=...
 * 
 * Exports labeled sentences with annotations
 * Handles -99 as UNKNOWN in the export
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins can export
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    })

    if (user?.role !== 'admin') {
      return NextResponse.json({ 
        error: 'Only admins can export data' 
      }, { status: 403 })
    }

    const searchParams = req.nextUrl.searchParams
    const statusFilter = searchParams.get('status') || 'all'
    const dateRange = searchParams.get('dateRange') || 'all'

    // Build where clause
    const where: any = {}

    if (statusFilter !== 'all') {
      where.status = statusFilter
    }

    if (dateRange !== 'all') {
      const end = new Date()
      let start = new Date()

      switch (dateRange) {
        case 'today':
          start.setHours(0, 0, 0, 0)
          break
        case 'week':
          start.setDate(start.getDate() - 7)
          break
        case 'month':
          start.setDate(start.getDate() - 30)
          break
      }

      where.lastEditedAt = {
        gte: start,
        lte: end
      }
    }

    // Fetch sentences with annotations
    const sentences = await prisma.sentence.findMany({
      where,
      include: {
        annotations: {
          include: {
            taxonomy: {
              select: {
                key: true,
                maxDepth: true
              }
            }
          }
        },
        comments: {
          select: {
            body: true,
            createdAt: true,
            author: {
              select: { name: true }
            }
          }
        },
        lastEditor: {
          select: { name: true }
        }
      },
      orderBy: [
        { importId: 'asc' },
        { importOrder: 'asc' }
      ]
    })

    // Group taxonomies to determine max depth for each
    const taxonomies: Record<string, number> = {}
    for (const sentence of sentences) {
      for (const ann of sentence.annotations) {
        if (!taxonomies[ann.taxonomy.key]) {
          taxonomies[ann.taxonomy.key] = ann.taxonomy.maxDepth || 5
        }
      }
    }

    // Build CSV header
    const headers: string[] = ['id']
    
    // Add field columns dynamically (check first sentence to see what's populated)
    const fieldColumns: string[] = []
    const supportColumns: string[] = []
    
    if (sentences.length > 0) {
      const firstSentence = sentences[0]
      const fieldMapping = firstSentence.fieldMapping as Record<string, string>
      const supportMapping = (firstSentence.supportMapping as Record<string, string>) || {}
      
      // Field columns (1-5)
      for (let i = 1; i <= 5; i++) {
        const field = `field${i}` as keyof typeof firstSentence
        if (firstSentence[field]) {
          const columnName = fieldMapping[`field${i}`] || `field${i}`
          fieldColumns.push(columnName)
          headers.push(columnName)
        }
      }
      
      // Support columns (1-5)
      for (let i = 1; i <= 5; i++) {
        const support = `support${i}` as keyof typeof firstSentence
        if (firstSentence[support]) {
          const columnName = supportMapping[`support${i}`] || `support${i}`
          supportColumns.push(columnName)
          headers.push(columnName)
        }
      }
    }

    // Add annotation columns for each taxonomy (one column per level)
    for (const [taxonomyKey, maxDepth] of Object.entries(taxonomies)) {
      for (let level = 1; level <= maxDepth; level++) {
        headers.push(`${taxonomyKey}_L${level}`)
      }
    }

    // Add metadata columns
    headers.push('status', 'flagged', 'lastEditor', 'lastEditedAt', 'comments')

    // Build CSV rows
    const rows: string[][] = [headers]

    for (const sentence of sentences) {
      const row: string[] = [sentence.id]

      // Add field values
      const fieldMapping = sentence.fieldMapping as Record<string, string>
      for (let i = 1; i <= 5; i++) {
        const field = `field${i}` as keyof typeof sentence
        const columnName = fieldMapping[`field${i}`]
        if (columnName && fieldColumns.includes(columnName)) {
          const value = sentence[field]
          row.push(value ? String(value).replace(/"/g, '""') : '')
        }
      }

      // Add support values
      const supportMapping = (sentence.supportMapping as Record<string, string>) || {}
      for (let i = 1; i <= 5; i++) {
        const support = `support${i}` as keyof typeof sentence
        const columnName = supportMapping[`support${i}`]
        if (columnName && supportColumns.includes(columnName)) {
          const value = sentence[support]
          row.push(value ? String(value).replace(/"/g, '""') : '')
        }
      }

      // Add annotations (grouped by taxonomy and level)
      for (const [taxonomyKey, maxDepth] of Object.entries(taxonomies)) {
        for (let level = 1; level <= maxDepth; level++) {
          const annotation = sentence.annotations.find(
            a => a.taxonomy.key === taxonomyKey && a.level === level
          )
          
          if (annotation) {
            // Handle -99 as UNKNOWN
            const code = annotation.nodeCode === -99 ? 'UNKNOWN' : String(annotation.nodeCode)
            row.push(code)
          } else {
            row.push('') // No annotation for this level
          }
        }
      }

      // Add metadata
      row.push(sentence.status)
      row.push(sentence.flagged ? 'true' : 'false')
      row.push(sentence.lastEditor?.name || '')
      row.push(sentence.lastEditedAt ? new Date(sentence.lastEditedAt).toISOString() : '')
      
      // Add comments (concatenated)
      const commentText = sentence.comments.map(c => 
        `[${c.author.name || 'Unknown'}]: ${c.body}`
      ).join(' | ')
      row.push(commentText.replace(/"/g, '""'))

      rows.push(row)
    }

    // Convert to CSV string
    const csv = rows.map(row => 
      row.map(cell => `"${cell}"`).join(',')
    ).join('\n')

    // Return as downloadable CSV
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="export-${new Date().toISOString()}.csv"`
      }
    })

  } catch (error) {
    console.error('Export error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

