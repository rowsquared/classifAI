import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { parse } from 'csv-parse/sync'
import { UNKNOWN_NODE_CODE } from '@/lib/constants'

const searchParamsSchema = z.object({ dryRun: z.coerce.boolean().default(true) })

const emptyToNull = (v: unknown) => {
  const s = String(v ?? '').trim()
  return s === '' ? null : s
}

const rowSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  definition: z.string().optional().nullable(),
  synonyms: z.string().optional().nullable(),
  parent_id: z.preprocess(emptyToNull, z.string().min(1).nullable()).optional().nullable(),
  level: z.preprocess(emptyToNull, z.coerce.number().int().min(1).max(5).nullable()).optional().nullable(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params
  const taxonomy = await prisma.taxonomy.findUnique({ where: { key } })
  if (!taxonomy) {
    return NextResponse.json({ error: 'taxonomy not found' }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const rawDry = (searchParams.get('dryRun') ?? 'true').toString().toLowerCase()
  const sp = { dryRun: ['1','true','yes'].includes(rawDry) }

  const contentType = req.headers.get('content-type') || ''
  if (!contentType.includes('text/csv')) {
    return NextResponse.json({ error: 'Content-Type must be text/csv' }, { status: 400 })
  }
  const csv = await req.text()
  const records = parse(csv, { columns: true, skip_empty_lines: true, bom: true }) as any[]

  const errors: { row: number; message: string }[] = []
  const seenIds = new Set<string>()
  const seenLabelsPerLevel = new Map<number, Set<string>>()
  const nodes: Array<z.infer<typeof rowSchema>> = []

  records.forEach((raw, idx) => {
    const parentRaw = String(raw?.parent_id ?? '').trim()
    const parentProvided = parentRaw.length > 0
    const parsed = rowSchema.safeParse(raw)
    if (!parsed.success) {
      errors.push({ row: idx + 2, message: parsed.error.message })
      return
    }
    const row = parsed.data
    
    // Validate that code is not -99 (reserved for UNKNOWN)
    if (row.id === UNKNOWN_NODE_CODE) {
      errors.push({ row: idx + 2, message: 'Code -99 is reserved for UNKNOWN labels and cannot be used' })
      return
    }
    
    // Validate that parent_id is not -99
    if (row.parent_id === UNKNOWN_NODE_CODE) {
      errors.push({ row: idx + 2, message: 'Code -99 is reserved for UNKNOWN labels and cannot be used as parent_id' })
      return
    }
    if (seenIds.has(row.id)) {
      errors.push({ row: idx + 2, message: 'duplicate id in file' })
    }
    const lvl = (row.level as any) ?? inferLevel(row, records)
    if (!seenLabelsPerLevel.has(lvl)) seenLabelsPerLevel.set(lvl, new Set<string>())
    const set = seenLabelsPerLevel.get(lvl)!
    if (set.has(row.label)) errors.push({ row: idx + 2, message: 'duplicate label in file (same level)' })
    seenIds.add(row.id)
    set.add(row.label)
    // Attach raw parent presence info for validation stage
    nodes.push({ ...row, _parentProvided: parentProvided } as any)
  })

  // parent existence & top-level checks
  const levelProvided = nodes.some(n => n.level != null)
  if (levelProvided) {
    for (const n of nodes as any[]) {
      if ((n.level as any) === 1 && n._parentProvided) {
        errors.push({ row: nodes.indexOf(n as any) + 2, message: 'level 1 must have missing parent_id' })
      }
      if ((n.level as any)! > (taxonomy.maxDepth ?? 5)) {
        errors.push({ row: nodes.indexOf(n as any) + 2, message: `level exceeds taxonomy.maxDepth` })
      }
    }
  }
  const idSet = new Set(nodes.map(n => n.id))
  for (const n of nodes) {
    if (n.parent_id != null && !idSet.has(n.parent_id)) {
      errors.push({ row: nodes.indexOf(n) + 2, message: 'parent_id not found in file' })
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 400 })
  }

  if (sp.dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, count: nodes.length })
  }

  // Commit import
  try {
    // Pre-check conflicts
    const existingCodes = await prisma.taxonomyNode.findMany({
      where: { taxonomyId: taxonomy.id, code: { in: Array.from(idSet) } },
      select: { code: true },
    })
    if (existingCodes.length > 0) {
      throw new Error('Some ids already exist in this taxonomy')
    }
    const existingLabels = await prisma.taxonomyNode.findMany({
      where: { taxonomyId: taxonomy.id, label: { in: nodes.map(n => n.label) } },
      select: { label: true, level: true },
    })
    if (existingLabels.length > 0) {
      const set = new Set(existingLabels.map(e => `${e.level}::${e.label}`))
      for (const n of nodes) {
        if (set.has(`${n.level ?? inferLevel(n, nodes)}::${n.label}`)) {
          throw new Error('Some same-level labels already exist in this taxonomy')
        }
      }
    }

    // Insert one by one (1088 rows is fine), clearer error surfacing
    for (const n of nodes) {
      const level = n.level ?? inferLevel(n, nodes)
      await prisma.taxonomyNode.create({
        data: {
          taxonomyId: taxonomy.id,
          code: n.id,
          label: n.label,
          definition: n.definition ?? undefined,
          parentCode: n.parent_id ?? undefined,
          level,
          path: buildPath(n, nodes),
          isLeaf: !nodes.some(x => x.parent_id === n.id),
        },
      })
    }

    // Insert synonyms (best-effort)
    const nodesByCode = await prisma.taxonomyNode.findMany({
      where: { taxonomyId: taxonomy.id, code: { in: Array.from(idSet) } },
      select: { id: true, code: true },
    })
    const idByCode = new Map(nodesByCode.map(n => [n.code, n.id]))
    const synonymRows: { taxonomyId: string; nodeId: string; synonym: string }[] = []
    for (const n of nodes) {
      if (!n.synonyms) continue
      const nodeId = idByCode.get(n.id)
      if (!nodeId) continue
      const syns = n.synonyms.split(/[;|,]/).map(s => s.trim()).filter(Boolean)
      for (const s of syns) synonymRows.push({ taxonomyId: taxonomy.id, nodeId, synonym: s })
    }
    if (synonymRows.length) {
      await prisma.taxonomySynonym.createMany({ data: synonymRows, skipDuplicates: true })
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }

  return NextResponse.json({ ok: true, dryRun: false, count: nodes.length })
}

function inferLevel(n: any, all: any[]) {
  let level = 1
  let cur = n
  while (cur.parent_id != null) {
    level += 1
    cur = all.find(x => x.id === cur.parent_id)
    if (!cur) break
  }
  return level
}

function buildPath(n: any, all: any[]) {
  const parts: string[] = []
  let cur = n
  while (cur) {
    parts.push(cur.id)
    if (cur.parent_id == null) break
    cur = all.find(x => x.id === cur.parent_id)
  }
  return parts.reverse().join('.')
}


