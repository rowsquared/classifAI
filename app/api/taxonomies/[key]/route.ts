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
      // Use cast: false to preserve leading zeros in id and parent_id columns
      const records = parse(csv, { columns: true, skip_empty_lines: true, bom: true, cast: false }) as any[]

      if (records.length === 0) {
        return NextResponse.json({ 
          ok: false, 
          error: 'CSV file is empty' 
        }, { status: 400 })
      }

      // Validate CSV headers
      if (!records || records.length === 0) {
        return NextResponse.json({ 
          ok: false, 
          error: 'CSV file is empty or contains no data rows' 
        }, { status: 400 })
      }

      const headers = Object.keys(records[0] || {})
      const requiredHeaders = ['id', 'label', 'parent_id', 'level']
      const allowedOptionalHeaders = ['definition', 'examples', 'synonyms']
      const allAllowedHeaders = [...requiredHeaders, ...allowedOptionalHeaders]
      
      // Check for missing required columns
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h))
      if (missingHeaders.length > 0) {
        return NextResponse.json({ 
          ok: false, 
          error: `Missing required columns: ${missingHeaders.join(', ')}. The CSV must contain: id, label, parent_id, and level.`,
          errors: [{ row: 0, message: `Missing required columns: ${missingHeaders.join(', ')}` }]
        }, { status: 400 })
      }
      
      // Check for disallowed columns
      const disallowedHeaders = headers.filter(h => !allAllowedHeaders.includes(h))
      if (disallowedHeaders.length > 0) {
        return NextResponse.json({ 
          ok: false, 
          error: `Disallowed columns found: ${disallowedHeaders.join(', ')}. Only the following columns are allowed: ${allAllowedHeaders.join(', ')}.`,
          errors: [{ row: 0, message: `Disallowed columns: ${disallowedHeaders.join(', ')}` }]
        }, { status: 400 })
      }

      // Validate data: check for duplicate ids and invalid parent_ids
      const validationErrors: Array<{ row: number; message: string }> = []
      const idRowMap = new Map<string, number[]>() // Track all row numbers for each id (preserve leading zeros)
      const allIds = new Set<string>() // All id values for parent_id validation
      
      // First pass: collect all ids and check for duplicates
      records.forEach((record, idx) => {
        const rowNum = idx + 2 // +2 because CSV has header and 0-indexed
        const id = String(record.id).trim()
        
        // Validate that id is not -99 (reserved for UNKNOWN)
        if (isUnknownNodeCode(id)) {
          validationErrors.push({
            row: rowNum,
            message: 'Code -99 is reserved for UNKNOWN labels and cannot be used'
          })
          return
        }
        
        // Track id occurrences for duplicate detection (preserve leading zeros with string comparison)
        if (idRowMap.has(id)) {
          idRowMap.get(id)!.push(rowNum)
        } else {
          idRowMap.set(id, [rowNum])
          allIds.add(id)
        }
      })
      
      // Report duplicate ids
      for (const [id, rowNumbers] of idRowMap.entries()) {
        if (rowNumbers.length > 1) {
          const rowsList = rowNumbers.join(', ')
          validationErrors.push({
            row: rowNumbers[0],
            message: `Duplicate id "${id}" found in rows: ${rowsList}`
          })
          // Also add errors for subsequent occurrences
          for (let i = 1; i < rowNumbers.length; i++) {
            validationErrors.push({
              row: rowNumbers[i],
              message: `Duplicate id "${id}" (also appears in row ${rowNumbers[0]})`
            })
          }
        }
      }
      
      // Second pass: validate parent_id values exist in id column
      records.forEach((record, idx) => {
        const rowNum = idx + 2
        const parentId = record.parent_id ? String(record.parent_id).trim() : ''
        
        // Validate that parent_id is not -99 (reserved for UNKNOWN)
        if (parentId && isUnknownNodeCode(parentId)) {
          validationErrors.push({
            row: rowNum,
            message: 'Code -99 is reserved for UNKNOWN labels and cannot be used as parent_id'
          })
          return
        }
        
        // Check if parent_id exists in id column (only if parent_id is provided and not empty)
        if (parentId && !allIds.has(parentId)) {
          validationErrors.push({
            row: rowNum,
            message: `parent_id "${parentId}" does not match any id value in the file`
          })
        }
      })
      
      // Return all validation errors if any found
      if (validationErrors.length > 0) {
        const errorMessages = validationErrors.map(e => `Row ${e.row}: ${e.message}`).join('\n')
        return NextResponse.json({ 
          ok: false, 
          error: `Validation failed:\n${errorMessages}`,
          errors: validationErrors
        }, { status: 400 })
      }

      // All validation passed, use records as-is
      const finalRecords = records

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
          const definition = String(record.definition || '').trim() || null
          const examples = String(record.examples || '').trim() || null
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
            definition: definition,
            examples: examples,
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


