import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parse } from 'csv-parse/sync'
import { Prisma } from '@prisma/client'
import { isUnknownNodeCode } from '@/lib/constants'
import { startAIJob, monitorAIJob } from '@/lib/ai-labeling'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params
    const formData = await req.formData()
    
    const description = formData.get('description') as string | null
    const levelNamesStr = formData.get('levelNames') as string | null
    const file = formData.get('file') as File | null

    // Check if taxonomy exists
    const existingTaxonomy = await prisma.taxonomy.findUnique({
      where: { key }
    })

    if (!existingTaxonomy) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Taxonomy not found' 
      }, { status: 404 })
    }

    // Parse level names if provided
    let levelNames = undefined
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

    // Prepare update data
    const updateData: any = {}
    if (description !== null) updateData.description = description || null
    if (levelNames !== undefined) updateData.levelNames = levelNames

    // Track nodes imported for response
    let nodesImported = 0

    // Handle CSV file update (REPLACE mode)
    if (file) {
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

      // Auto-clean CSV data
      const idSet = new Set<string>()
      const seenIds = new Map<string, number>()
      const levelMap = new Map<number, Set<string>>()
      
      const cleanedRecords = records.filter((record, idx) => {
        const rowId = String(record.id).trim()
        const level = parseInt(String(record.level).trim())
        const label = String(record.label || '').trim()

        if (isUnknownNodeCode(rowId)) {
          throw new Error('CSV contains IDs that are reserved for unknown labels (-9, -99, ...). Please rename those rows.')
        }

        const parentRaw = record.parent_id && String(record.parent_id).trim()
        if (parentRaw && isUnknownNodeCode(parentRaw)) {
          throw new Error('CSV contains parent IDs that are reserved for unknown labels (-9, -99, ...). Please adjust the hierarchy.')
        }

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

      // Update taxonomy and REPLACE nodes in transaction
      await prisma.$transaction(async (tx) => {
        // Delete existing nodes and synonyms
        await tx.taxonomySynonym.deleteMany({
          where: { taxonomyId: existingTaxonomy.id }
        })
        await tx.taxonomyNode.deleteMany({
          where: { taxonomyId: existingTaxonomy.id }
        })

        // Create new nodes
        const parentLookup = new Map<string, string | null>()
        finalRecords.forEach((record) => {
          const code = String(record.id).trim()
          const parentCode = record.parent_id && String(record.parent_id).trim()
            ? String(record.parent_id).trim()
            : null
          parentLookup.set(code, parentCode)
        })

        const nodes = finalRecords.map((record) => {
          const code = String(record.id).trim()
          const parentCode = parentLookup.get(code) ?? null

          if (isUnknownNodeCode(code) || isUnknownNodeCode(parentCode)) {
            throw new Error('CSV contains IDs that are reserved for unknown labels (-9, -99, ...). Please rename those rows.')
          }

          const level = parseInt(String(record.level).trim())
          const definition = String(record.definition || '').trim()
          const pathParts: string[] = []
          let currentCode: string | null = code
          const guard = new Set<string>()
          while (currentCode) {
            if (guard.has(currentCode)) break
            guard.add(currentCode)
            pathParts.unshift(currentCode)
            currentCode = parentLookup.get(currentCode) ?? null
          }
          const path = pathParts.join('.')
          const hasChildren = finalRecords.some(
            (r) => String(r.parent_id || '').trim() === code
          )

          return {
            taxonomyId: existingTaxonomy.id,
            code,
            level,
            label: String(record.label || '').trim(),
            definition: definition || null,
            parentCode,
            path: path || null,
            isLeaf: hasChildren ? false : true
          }
        })

        await tx.taxonomyNode.createMany({ data: nodes as unknown as Prisma.TaxonomyNodeCreateManyInput[] })

        // Create synonyms
        const synonymsToCreate: any[] = []
        finalRecords.forEach((record) => {
          const synonymsStr = String(record.synonyms || '').trim()
          if (synonymsStr) {
            const synonymsList = synonymsStr.split(',').map(s => s.trim()).filter(s => s)
            synonymsList.forEach(synonym => {
              synonymsToCreate.push({
                taxonomyId: existingTaxonomy.id,
                nodeCode: String(record.id).trim(),
                synonym
              })
            })
          }
        })

        if (synonymsToCreate.length > 0) {
          await tx.taxonomySynonym.createMany({ data: synonymsToCreate })
        }
      })

      nodesImported = finalRecords.length
    }

    // Update taxonomy metadata
    const updatedTaxonomy = await prisma.taxonomy.update({
      where: { key },
      data: updateData
    })

    return NextResponse.json({ 
      ok: true, 
      taxonomy: updatedTaxonomy,
      nodesReplaced: nodesImported
    })

  } catch (error: any) {
    console.error('Update taxonomy error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error?.message || String(error) 
    }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params

    const existingTaxonomy = await prisma.taxonomy.findUnique({
      where: { key },
      select: {
        id: true,
        key: true,
        _count: {
          select: {
            nodes: true,
            annotations: true
          }
        }
      }
    })

    if (!existingTaxonomy) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Taxonomy not found' 
      }, { status: 404 })
    }

    // Soft delete
    const deletedTaxonomy = await prisma.taxonomy.update({
      where: { key },
      data: { isActive: false } as Prisma.TaxonomyUpdateInput
    })

    try {
      const jobId = await startAIJob('/taxonomies', {
        action: 'delete',
        taxonomy: {
          key: deletedTaxonomy.key
        }
      })

      await prisma.taxonomy.update({
        where: { id: deletedTaxonomy.id },
        data: {
          lastAISyncJobId: jobId,
          lastAISyncAt: new Date(),
          lastAISyncStatus: 'deleting',
          lastAISyncError: null
        } as Prisma.TaxonomyUpdateInput
      })

      monitorAIJob(jobId, `/taxonomies/${jobId}/status`, async (result) => {
        const data = (result.success
          ? {
              lastAISyncStatus: 'deleted',
              lastAISyncAt: new Date(),
              lastAISyncError: null
            }
          : {
              lastAISyncStatus: 'delete_failed',
              lastAISyncAt: new Date(),
              lastAISyncError: result.error || result.data?.error || 'Failed to delete taxonomy in AI service'
            }) as unknown as Prisma.TaxonomyUpdateInput
        await prisma.taxonomy.update({
          where: { id: deletedTaxonomy.id },
          data
        })
      })
    } catch (syncError) {
      console.error('Failed to start AI taxonomy delete job:', syncError)
      await prisma.taxonomy.update({
        where: { id: deletedTaxonomy.id },
        data: {
          lastAISyncAt: new Date(),
          lastAISyncStatus: 'delete_failed',
          lastAISyncError: syncError instanceof Error ? syncError.message : String(syncError)
        } as Prisma.TaxonomyUpdateInput
      })
    }

    return NextResponse.json({ 
      ok: true, 
      taxonomy: deletedTaxonomy,
      preservedNodes: existingTaxonomy._count.nodes,
      preservedAnnotations: existingTaxonomy._count.annotations
    })

  } catch (error: any) {
    console.error('Delete taxonomy error:', error)
    return NextResponse.json({ 
      ok: false, 
      error: error?.message || String(error) 
    }, { status: 500 })
  }
}

