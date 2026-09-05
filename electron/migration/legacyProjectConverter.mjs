import { createHash } from 'node:crypto'
import { MIGRATION_RECORD_STATUSES, validateLegacyMigrationBundle } from '../../shared/legacyMigrationContract.js'
import { classifyLegacyStorageKey, canonicalizeMigrationInventory } from '../../src/services/migration/legacyMigrationBundle.js'
import { getChapterPlainText, validateWritingDocument } from '../../src/services/writing/writingDocumentSchema.js'

export function stableMigrationId(kind, sourceRecordId, nestedId = '') {
  const digest = sha256(`${kind}\0${sourceRecordId}\0${nestedId}`).slice(0, 24)
  return `${String(kind || 'legacy').replace(/[^a-z0-9-]/giu, '-').toLowerCase()}-${digest}`
}

export async function normalizeLegacyBundle(input) {
  const validation = validateLegacyMigrationBundle(input)
  if (!validation.valid) throw migrationError('DESKTOP_INVALID_INPUT', validation.error.message)
  if (validation.value.format === 'migration-v3') {
    return { ...input, sourceSchemaVersion: 3 }
  }

  const records = []
  for (const [sourceRecordId, raw] of Object.entries(input.keys).sort(([a], [b]) => compareCodeUnits(a, b))) {
    const classification = classifyLegacyStorageKey(sourceRecordId)
    if (classification?.storageClass !== 'project') continue
    records.push({
      sourceRecordId,
      recordType: classification.recordType,
      raw,
      byteLength: Buffer.byteLength(raw, 'utf8'),
      sha256: sha256(raw)
    })
  }
  const sourceInventory = records.map(({ sourceRecordId, recordType, byteLength, sha256: sourceSha }) => ({
    sourceRecordId, recordType, byteLength, sha256: sourceSha
  }))
  return {
    app: 'Pinax',
    kind: 'desktop-project-migration',
    schemaVersion: 3,
    sourceSchemaVersion: Number(input.schemaVersion ?? input.version),
    bundleId: sha256(canonicalizeMigrationInventory(sourceInventory)),
    exportedAt: input.exportedAt || '1970-01-01T00:00:00.000Z',
    recordCount: records.length,
    sourceInventory,
    records
  }
}

export async function verifyLegacyBundle(input) {
  const bundle = input?.sourceSchemaVersion ? input : await normalizeLegacyBundle(input)
  const validation = validateLegacyMigrationBundle(bundle)
  if (!validation.valid) throw migrationError('DESKTOP_INVALID_INPUT', validation.error.message)
  for (const record of bundle.records) {
    const classification = classifyLegacyStorageKey(record.sourceRecordId)
    if (classification?.storageClass !== 'project' || classification.recordType !== record.recordType) {
      throw migrationError('DESKTOP_INVALID_INPUT', 'Migration record is not classified as project data', {
        sourceRecordId: record.sourceRecordId
      })
    }
    if (Buffer.byteLength(record.raw, 'utf8') !== record.byteLength || sha256(record.raw) !== record.sha256) {
      throw migrationError('DESKTOP_INTEGRITY_FAILED', 'Migration source record hash does not match inventory', {
        sourceRecordId: record.sourceRecordId
      })
    }
  }
  const expectedBundleId = sha256(canonicalizeMigrationInventory(bundle.sourceInventory))
  if (expectedBundleId !== bundle.bundleId) {
    throw migrationError('DESKTOP_INTEGRITY_FAILED', 'Migration bundle identity does not match inventory')
  }
  return bundle
}

export async function createLegacyMigrationPlan(input, deps = {}) {
  const bundle = await verifyLegacyBundle(await normalizeLegacyBundle(input))
  const createdAt = bundle.exportedAt
  const projectItems = []
  const textItems = []
  const legacyRecords = []
  const reportRecords = []
  const chapterIds = collectChapterIds(bundle.records)
  let suggestedProjectName = ''

  for (const record of bundle.records) {
    let parsed
    try {
      parsed = JSON.parse(record.raw)
    } catch {
      reportRecords.push(reportRecord(record, 'rejected', { reason: 'invalid-json' }))
      continue
    }

    if (record.recordType === 'writing-books') {
      suggestedProjectName ||= projectNameCandidate(parsed?.[0]?.title)
      const result = convertBooks(record, parsed, createdAt)
      projectItems.push(...result.projectItems)
      textItems.push(...result.textItems)
      legacyRecords.push(result.metadata)
      reportRecords.push(reportRecord(record, result.textItems.length ? 'converted' : 'rejected', {
        targetIds: result.projectItems.map(item => item.id),
        reason: result.textItems.length ? undefined : 'no-chapters'
      }))
      continue
    }

    if (record.recordType === 'worldbook') {
      suggestedProjectName ||= projectNameCandidate(parsed?.name)
      const result = convertWorldbook(record, parsed, createdAt)
      projectItems.push(...result.projectItems)
      textItems.push(...result.textItems)
      legacyRecords.push(result.metadata)
      reportRecords.push(reportRecord(record, 'converted', {
        targetIds: [...result.projectItems.map(item => item.id), result.metadata.id]
      }))
      continue
    }

    const status = compatibilityStatus(record.recordType, parsed, chapterIds)
    const compatibility = createCompatibilityRecord(record, parsed, createdAt)
    legacyRecords.push(compatibility)
    reportRecords.push(reportRecord(record, status, { targetIds: [compatibility.id] }))
  }

  reportRecords.sort((a, b) => compareCodeUnits(a.sourceRecordId, b.sourceRecordId))
  const counts = Object.fromEntries(MIGRATION_RECORD_STATUSES.map(status => [
    status,
    reportRecords.filter(record => record.status === status).length
  ]))
  const report = {
    bundleId: bundle.bundleId,
    sourceSchemaVersion: bundle.sourceSchemaVersion || 3,
    suggestedProjectName: suggestedProjectName || '迁移项目',
    total: reportRecords.length,
    counts,
    records: reportRecords
  }
  const targetMappings = [
    ...projectItems.map(item => ({
      bundleId: bundle.bundleId,
      sourceRecordId: item.sourceRecordId,
      sourceNestedId: item.sourceNestedId,
      targetKind: item.kind,
      targetId: item.id
    })),
    ...legacyRecords.map(record => ({
      bundleId: bundle.bundleId,
      sourceRecordId: record.sourceRecordId,
      sourceNestedId: `legacy:${record.recordType}`,
      targetKind: 'legacy-record',
      targetId: record.id
    }))
  ].sort((a, b) => compareCodeUnits(
    `${a.sourceRecordId}\0${a.sourceNestedId}\0${a.targetId}`,
    `${b.sourceRecordId}\0${b.sourceNestedId}\0${b.targetId}`
  ))

  return {
    bundle,
    projectItems: projectItems.sort(compareItems),
    textItems: textItems.sort(compareItems),
    legacyRecords: legacyRecords.sort((a, b) => compareCodeUnits(a.id, b.id)),
    targetMappings,
    journalRecords: reportRecords.map(record => ({
      bundleId: bundle.bundleId,
      sourceRecordId: record.sourceRecordId,
      sourceType: record.recordType,
      sourceSha256: bundle.records.find(source => source.sourceRecordId === record.sourceRecordId)?.sha256 || '',
      status: record.status,
      targetKind: record.targetIds?.length ? 'migration-target' : null,
      targetId: record.targetIds?.[0] || null
    })),
    report
  }
}

function projectNameCandidate(value) {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[. ]+$/gu, '')
  const candidate = cleaned.slice(0, 120)
  return /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/iu.test(candidate)
    ? `${candidate} 项目`.slice(0, 120)
    : candidate
}

function convertBooks(record, parsed, createdAt) {
  const books = Array.isArray(parsed) ? parsed : []
  const projectItems = []
  const textItems = []
  const metadataBooks = []
  books.forEach((book, bookIndex) => {
    const bookSourceId = textValue(book?.id) || `book-${bookIndex + 1}`
    const volumeSourceKey = `book:${bookSourceId}:${bookIndex}`
    const volumeId = stableMigrationId('volume', record.sourceRecordId, volumeSourceKey)
    projectItems.push(itemRecord({
      id: volumeId, kind: 'volume', parentId: null, sortOrder: bookIndex,
      sourceRecordId: record.sourceRecordId, sourceNestedId: volumeSourceKey, createdAt
    }))
    const metadataChapters = []
    const chapters = Array.isArray(book?.chapters) ? book.chapters : []
    chapters.forEach((chapter, chapterIndex) => {
      const chapterSourceId = textValue(chapter?.id) || `chapter-${chapterIndex + 1}`
      const chapterSourceKey = `${volumeSourceKey}/chapter:${chapterSourceId}:${chapterIndex}`
      const id = stableMigrationId('chapter', record.sourceRecordId, chapterSourceKey)
      const title = textValue(chapter?.title) || `第 ${chapterIndex + 1} 章`
      const relativePath = `manuscript/${pathSegment(book?.title || `卷-${bookIndex + 1}`)}-${volumeId.slice(-8)}/${String(chapterIndex + 1).padStart(4, '0')}-${pathSegment(title)}-${id.slice(-8)}.txt`
      const text = normalizeText(extractChapterText(chapter))
      const item = itemRecord({
        id, kind: 'chapter', relativePath, parentId: volumeId, sortOrder: chapterIndex,
        sourceRecordId: record.sourceRecordId, sourceNestedId: chapterSourceKey, text, createdAt
      })
      projectItems.push(item)
      textItems.push(item)
      const { content: _content, editorDocument: _editorDocument, ...legacyFields } = chapter || {}
      metadataChapters.push({
        id: chapterSourceId,
        sourceNestedId: chapterSourceKey,
        title,
        sourceRecord: chapter,
        legacyFields,
        documentMetadata: projectWritingDocumentMetadata(chapter?.editorDocument)
      })
    })
    const { chapters: _chapters, ...legacyBookFields } = book || {}
    metadataBooks.push({
      ...legacyBookFields,
      id: bookSourceId,
      title: textValue(book?.title),
      description: textValue(book?.description),
      sourceRecord: book,
      chapters: metadataChapters
    })
  })
  return {
    projectItems,
    textItems,
    metadata: compatibilityRecord(record, 'writing-books-metadata', metadataBooks, createdAt)
  }
}

function convertWorldbook(record, parsed, createdAt) {
  const projectItems = []
  const textItems = []
  const entries = Array.isArray(parsed?.entries) ? parsed.entries : []
  const metadataEntries = []
  entries.forEach((entry, index) => {
    const entrySourceId = textValue(entry?.id) || `entry-${index + 1}`
    const entrySourceKey = `entry:${entrySourceId}:${index}`
    const id = stableMigrationId('reference', record.sourceRecordId, entrySourceKey)
    const name = textValue(entry?.name) || `资料-${index + 1}`
    const directory = referenceDirectory(entry?.type)
    const relativePath = `reference/${directory}/${pathSegment(name)}-${id.slice(-8)}.txt`
    const prose = referenceProse(entry)
    const text = prose.text
    const item = itemRecord({
      id, kind: 'reference', relativePath, parentId: null, sortOrder: index,
      sourceRecordId: record.sourceRecordId, sourceNestedId: entrySourceKey, text, createdAt
    })
    projectItems.push(item)
    textItems.push(item)
    const { content: _content, description: _description, ...entryMetadata } = entry || {}
    metadataEntries.push({
      ...entryMetadata,
      id: entrySourceId,
      sourceNestedId: entrySourceKey,
      name,
      sourceRecord: entry,
      proseSegments: prose.segments
    })
  })
  const metadata = compatibilityRecord(record, 'worldbook-metadata', {
    ...parsed,
    entries: metadataEntries,
    description: textValue(parsed?.description),
    sourceRecord: parsed
  }, createdAt)
  return { projectItems, textItems, metadata }
}

function compatibilityStatus(recordType, parsed, chapterIds) {
  if (recordType === 'materials' || recordType === 'media-assets') {
    const values = Array.isArray(parsed) ? parsed : []
    return values.some(item => !Array.isArray(item?.sourceRefs) || item.sourceRefs.length === 0)
      ? 'detached'
      : 'supported'
  }
  if (['writing-snapshots', 'writing-history', 'writing-recovery'].includes(recordType)) {
    const values = Array.isArray(parsed) ? parsed : []
    return values.some(item => item?.chapterId && !chapterIds.has(String(item.chapterId)))
      ? 'orphaned'
      : 'supported'
  }
  return 'supported'
}

function createCompatibilityRecord(record, parsed, createdAt) {
  return compatibilityRecord(record, record.recordType, parsed, createdAt)
}

function compatibilityRecord(record, recordType, payload, createdAt) {
  const jsonPayload = JSON.stringify(payload)
  return {
    id: stableMigrationId('legacy', record.sourceRecordId, recordType),
    recordType,
    sourceRecordId: record.sourceRecordId,
    jsonPayload,
    contentHash: sha256(jsonPayload),
    createdAt
  }
}

function itemRecord(input) {
  const text = input.text
  return {
    id: input.id,
    kind: input.kind,
    relativePath: input.relativePath || null,
    parentId: input.parentId,
    sortOrder: input.sortOrder,
    revision: 0,
    contentHash: typeof text === 'string' ? sha256(text) : null,
    byteLength: typeof text === 'string' ? Buffer.byteLength(text, 'utf8') : 0,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    sourceRecordId: input.sourceRecordId,
    sourceNestedId: input.sourceNestedId,
    ...(typeof text === 'string' ? { text, characterCount: text.length } : {})
  }
}

function collectChapterIds(records) {
  const ids = new Set()
  for (const record of records.filter(record => record.recordType === 'writing-books')) {
    try {
      const books = JSON.parse(record.raw)
      for (const book of Array.isArray(books) ? books : []) {
        for (const chapter of Array.isArray(book?.chapters) ? book.chapters : []) {
          if (chapter?.id != null) ids.add(String(chapter.id))
        }
      }
    } catch { /* rejected later */ }
  }
  return ids
}

function extractChapterText(chapter) {
  const structured = chapter?.editorDocument
  if (validateWritingDocument(structured).valid) return getChapterPlainText(chapter)
  return legacyMarkdownToPlainText(chapter?.content)
}

function nodeText(node) {
  if (typeof node?.text === 'string') return node.text
  return (Array.isArray(node?.content) ? node.content : []).map(nodeText).join('')
}

function projectWritingDocumentMetadata(document) {
  if (!document || typeof document !== 'object') return null
  const validation = validateWritingDocument(document)
  return {
    schemaVersion: Number(document.schemaVersion || 0),
    revision: Number(document.revision || 0),
    valid: validation.valid,
    errors: validation.errors,
    meta: document.meta && typeof document.meta === 'object' ? document.meta : null,
    units: (Array.isArray(document.content) ? document.content : []).map(unit => ({
      ...(unit?.attrs || {}),
      nodes: (Array.isArray(unit?.content) ? unit.content : []).map(node => ({
        ...(node?.attrs || {}),
        type: node?.type || 'paragraph',
        textLength: nodeText(node).length,
        markRanges: collectMarkRanges(node)
      }))
    }))
  }
}

function collectMarkRanges(node) {
  const ranges = []
  let offset = 0
  function visit(value) {
    if (typeof value?.text === 'string') {
      const end = offset + value.text.length
      if (Array.isArray(value.marks) && value.marks.length) ranges.push({ start: offset, end, marks: value.marks })
      offset = end
      return
    }
    for (const child of Array.isArray(value?.content) ? value.content : []) visit(child)
  }
  visit(node)
  return ranges
}

function referenceProse(entry) {
  const values = [
    ['content', proseValue(entry?.content)],
    ['description', proseValue(entry?.description)]
  ].filter(([, value]) => value.length > 0)
  let text = ''
  const segments = []
  for (const [field, value] of values) {
    if (text) text += '\n\n'
    const start = text.length
    text += value
    segments.push({ field, start, end: text.length })
  }
  return { text, segments }
}

function proseValue(value) {
  return typeof value === 'string' ? normalizeText(value) : ''
}

function normalizeText(value) {
  return String(value ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

function legacyMarkdownToPlainText(value) {
  return normalizeText(value).split('\n').map(line => line
    .replace(/^\s{0,3}#{1,6}\s+/u, '')
    .replace(/^\s{0,3}>\s?/u, '')
    .replace(/^\s*[-*+]\s+/u, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/(\*\*|__|~~|`)(.*?)\1/gu, '$2')
    .replace(/(^|[^*])\*([^*]+)\*/gu, '$1$2')
  ).filter(line => !/^\s*```/u.test(line)).join('\n')
}

function referenceDirectory(type) {
  const value = textValue(type).toLowerCase()
  if (value.includes('character') || value.includes('角色') || value.includes('人物')) return 'characters'
  if (value.includes('place') || value.includes('location') || value.includes('地点')) return 'places'
  if (value.includes('event') || value.includes('事件')) return 'events'
  return 'research'
}

function pathSegment(value) {
  const safe = String(value ?? '').normalize('NFC').trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '-')
    .replace(/[. ]+$/gu, '')
    .slice(0, 80)
  return safe || 'untitled'
}

function reportRecord(record, status, details = {}) {
  return {
    sourceRecordId: record.sourceRecordId,
    recordType: record.recordType,
    status,
    ...(details.reason ? { reason: details.reason } : {}),
    ...(details.targetIds?.length ? { targetIds: details.targetIds } : {})
  }
}

function compareItems(a, b) {
  if (Boolean(a.parentId) !== Boolean(b.parentId)) return a.parentId ? 1 : -1
  return compareCodeUnits(a.relativePath || a.id, b.relativePath || b.id)
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function textValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex')
}

function migrationError(code, message, details) {
  return Object.assign(new Error(message), { code, details })
}
