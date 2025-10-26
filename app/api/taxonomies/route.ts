import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parse } from 'csv-parse/sync'

const MAX_ACTIVE_TAXONOMIES = 3

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const includeDeleted = searchParams.get('includeDeleted') === 'true'

    const where = includeDeleted ? {} : { isActive: true }

    const taxonomies = await prisma.taxonomy.findMany({
      where,
      include: {
        _count: {
          select: { 
            nodes: true,
            annotations: true
          }
        }
      },
      orderBy: [
        { isActive: 'desc' },
        { createdAt: 'desc' }
      ]
    })

    // Add computed statistics
    const taxonomiesWithStats = await Promise.all(
      taxonomies.map(async (taxonomy) => {
        // Get actual max level from nodes
        const maxLevelNode = await prisma.taxonomyNode.findFirst({
          where: { taxonomyId: taxonomy.id },
          orderBy: { level: 'desc' },
          select: { level: true }
        })

        // Get node count per level
        const nodeCounts = await prisma.taxonomyNode.groupBy({
          by: ['level'],
          where: { taxonomyId: taxonomy.id },
          _count: true,
          orderBy: { level: 'asc' }
        })

        const levelCounts = nodeCounts.map(lc => ({
          level: lc.level,
          count: lc._count,
          name: taxonomy.levelNames 
            ? (taxonomy.levelNames as Record<string, string>)[lc.level.toString()] || `Level ${lc.level}`
            : `Level ${lc.level}`
        }))

        return {
          ...taxonomy,
          nodeCount: taxonomy._count.nodes,
          annotationCount: taxonomy._count.annotations,
          actualMaxLevel: maxLevelNode?.level || 0,
          levelCounts,
          _count: undefined
        }
      })
    )

    return NextResponse.json({ 
      ok: true, 
      taxonomies: taxonomiesWithStats 
    })
  } catch (error) {
    console.error('Taxonomies API error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: String(error) 
    }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    
    const key = formData.get('key') as string
    const displayName = formData.get('displayName') as string
    const description = formData.get('description') as string | null
    const maxDepth = parseInt(formData.get('maxDepth') as string)
    const levelNamesStr = formData.get('levelNames') as string | null
    const file = formData.get('file') as File

    // Validation
    if (!key || !displayName || !maxDepth || !file) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Missing required fields: key, displayName, maxDepth, file' 
      }, { status: 400 })
    }

    // Check active taxonomy limit
    const activeTaxonomiesCount = await prisma.taxonomy.count({
      where: { isActive: true }
    })

    if (activeTaxonomiesCount >= MAX_ACTIVE_TAXONOMIES) {
      return NextResponse.json({ 
        ok: false, 
        error: `Maximum ${MAX_ACTIVE_TAXONOMIES} active taxonomies allowed. Please delete one before adding a new one.` 
      }, { status: 400 })
    }

    // Check key uniqueness
    const existingTaxonomy = await prisma.taxonomy.findUnique({
      where: { key }
    })

    if (existingTaxonomy) {
      return NextResponse.json({ 
        ok: false, 
        error: `Taxonomy with key "${key}" already exists` 
      }, { status: 400 })
    }

    // Parse level names if provided
    let levelNames = null
    if (levelNamesStr) {
      try {
        levelNames = JSON.parse(levelNamesStr)
      } catch (e) {
        return NextResponse.json({ 
          ok: false, 
          error: 'Invalid levelNames JSON' 
        }, { status: 400 })
      }
    }

    // Parse CSV
    const buffer = Buffer.from(await file.arrayBuffer())
    const csv = buffer.toString('utf-8')
    const records = parse(csv, { columns: true, skip_empty_lines: true, bom: true }) as any[]

    if (records.length === 0) {
      return NextResponse.json({ 
        ok: false, 
        error: 'CSV file is empty' 
      }, { status: 400 })
    }

    // Validate CSV headers
    const headers = Object.keys(records[0] || {})
    const requiredHeaders = ['id', 'label', 'parent_id', 'level']
    const optionalHeaders = ['definition', 'synonyms']
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h))
    
    if (missingHeaders.length > 0) {
      return NextResponse.json({ 
        ok: false, 
        error: `Missing required columns: ${missingHeaders.join(', ')}` 
      }, { status: 400 })
    }

    // Validate that no code is -99 (reserved for UNKNOWN)
    for (const record of records) {
      const code = parseInt(String(record.id).trim())
      if (code === -99) {
        return NextResponse.json({ 
          ok: false, 
          error: 'Code -99 is reserved for UNKNOWN labels and cannot be used in taxonomy imports' 
        }, { status: 400 })
      }
      
      // Also check parent_id
      if (record.parent_id && String(record.parent_id).trim()) {
        const parentCode = parseInt(String(record.parent_id).trim())
        if (parentCode === -99) {
          return NextResponse.json({ 
            ok: false, 
            error: 'Code -99 is reserved for UNKNOWN labels and cannot be used as a parent_id' 
          }, { status: 400 })
        }
      }
    }

    // Auto-clean CSV data (same logic as existing import)
    const idSet = new Set<string>()
    const seenIds = new Map<string, number>()
    const levelMap = new Map<number, Set<string>>()
    
    const cleanedRecords = records.filter((record, idx) => {
      const rowId = String(record.id).trim()
      const level = parseInt(String(record.level).trim())
      const label = String(record.label || '').trim()

      // Drop duplicate IDs (keep first occurrence)
      if (seenIds.has(rowId)) {
        return false
      }
      seenIds.set(rowId, idx)

      // Clear parent_id for level 1
      if (level === 1) {
        record.parent_id = ''
      }

      // Deduplicate labels per level
      if (!levelMap.has(level)) {
        levelMap.set(level, new Set())
      }
      const levelLabels = levelMap.get(level)!
      if (levelLabels.has(label)) {
        return false
      }
      levelLabels.add(label)

      idSet.add(rowId)
      return true
    })

    // Drop rows with missing parents
    const finalRecords = cleanedRecords.filter((record) => {
      const level = parseInt(String(record.level).trim())
      if (level === 1) return true
      
      const parentId = String(record.parent_id || '').trim()
      if (!parentId || !idSet.has(parentId)) {
        return false
      }
      return true
    })

    if (finalRecords.length === 0) {
      return NextResponse.json({ 
        ok: false, 
        error: 'No valid rows after cleaning' 
      }, { status: 400 })
    }

    // Create taxonomy and import nodes in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create taxonomy
      const taxonomy = await tx.taxonomy.create({
        data: {
          key,
          displayName,
          description: description || null,
          maxDepth,
          levelNames: levelNames || undefined,
          isActive: true
        }
      })

      // Create nodes
      const nodes = finalRecords.map((record) => ({
        taxonomyId: taxonomy.id,
        code: parseInt(String(record.id).trim()),
        level: parseInt(String(record.level).trim()),
        label: String(record.label || '').trim(),
        definition: String(record.definition || '').trim(),
        parentCode: record.parent_id && String(record.parent_id).trim() ? parseInt(String(record.parent_id).trim()) : null
      }))

      await tx.taxonomyNode.createMany({ data: nodes })

      // Create synonyms
      const synonymsToCreate: any[] = []
      finalRecords.forEach((record) => {
        const synonymsStr = String(record.synonyms || '').trim()
        if (synonymsStr) {
          const synonymsList = synonymsStr.split(',').map(s => s.trim()).filter(s => s)
            synonymsList.forEach(synonym => {
              synonymsToCreate.push({
                taxonomyId: taxonomy.id,
                nodeCode: parseInt(String(record.id).trim()),
                synonym
              })
            })
        }
      })

      if (synonymsToCreate.length > 0) {
        await tx.taxonomySynonym.createMany({ data: synonymsToCreate })
      }

      return taxonomy
    })

    return NextResponse.json({ 
      ok: true, 
      taxonomy: result,
      importedNodes: finalRecords.length
    })

  } catch (error: any) {
    console.error('Create taxonomy error:', error)
    
    // Extract clean error message
    let errorMessage = error?.message || String(error)
    
    // Truncate extremely long error messages (e.g., Prisma validation errors with full data)
    if (errorMessage.length > 1000) {
      // Find the actual error message in the multi-line output
      const lines = errorMessage.split('\n')
      
      // Look for the "Argument ... is missing" or similar error
      const errorLine = lines.find(line => 
        line.trim().startsWith('Argument') || 
        line.includes('is missing') ||
        line.includes('is required')
      )
      
      if (errorLine) {
        // Get the line before "Argument" which usually has "Invalid ..." 
        const errorIndex = lines.indexOf(errorLine)
        const contextLine = errorIndex > 0 ? lines[errorIndex - 1] : ''
        
        if (contextLine && contextLine.includes('Invalid')) {
          errorMessage = `${contextLine.trim()} ${errorLine.trim()}`
        } else {
          errorMessage = errorLine.trim()
        }
      } else {
        // Fallback: just get first 500 chars
        errorMessage = errorMessage.substring(0, 500) + '...'
      }
    }
    
    return NextResponse.json({ 
      ok: false, 
      error: errorMessage
    }, { status: 500 })
  }
}
