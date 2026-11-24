import { randomUUID } from 'node:crypto'
import { join, posix, resolve } from 'node:path'
import { DESKTOP_ERROR_CODES } from '../../shared/desktopProjectContract.js'
import { publishNewProjectText } from './projectFiles.mjs'
import { createManagedBackup } from './projectBackup.mjs'
import { closeProjectDatabase, openProjectDatabase } from './projectDatabase.mjs'
import { closeProjectLock, openProjectLock } from './projectLock.mjs'
import { createProject as createManifestProject, readProjectManifest } from './projectManifest.mjs'
import { stableMigrationId } from '../migration/legacyProjectConverter.mjs'
import { createProjectRepository } from './projectRepository.mjs'

export function createProjectService(deps = {}) {
  let active = null

  async function activate(root, manifest, mode, creating = false) {
    if (active?.mode === mode && active.manifest.projectId === manifest.projectId && resolve(active.root) === resolve(root)) {
      if (mode === 'read-write') active.recovery = await active.repository.recoverInterruptedWrites()
      return describeActive(active)
    }
    let lockResult
    let database
    try {
      lockResult = await openProjectLock(root, manifest, { mode, ...(deps.lock || {}) })
      database = openProjectDatabase(join(root, '.pinax/project.sqlite'), { readOnly: mode === 'read-only', fileMustExist: !creating })
      const repository = createProjectRepository({ root, mode, database }, deps.repository)
      const recovery = mode === 'read-write'
        ? await repository.recoverInterruptedWrites()
        : { recovered: [], repairCases: [] }
      // A locked or damaged destination must leave the previous session usable.
      // Acquire and validate the candidate before releasing the old project.
      if (active) await close()
      active = { root, manifest, mode, lock: lockResult.lock, database, repository, recovery }
      return describeActive(active)
    } catch (error) {
      if (database) closeProjectDatabase(database)
      if (lockResult?.lock) await closeProjectLock(root, lockResult.lock.nonce)
      throw error
    }
  }

  async function close() {
    if (!active) return false
    const closing = active
    active = null
    closeProjectDatabase(closing.database)
    if (closing.lock) await closeProjectLock(closing.root, closing.lock.nonce)
    return true
  }

  function requireActive() {
    if (!active) throw desktopError(DESKTOP_ERROR_CODES.PROJECT_NOT_OPEN, 'Desktop project is not open')
    return active
  }

  // IPC invocations may overlap even in a single window. Keep the project
  // connection and its files stable across writes, backups and project changes.
  const operations = {
    async create(input) {
      const manifest = await createManifestProject(input.directory, { name: input.name }, deps.manifest)
      return activate(input.directory, manifest, 'read-write', true)
    },
    async open(input) {
      const manifest = await readProjectManifest(input.directory)
      return activate(input.directory, manifest, input.mode)
    },
    async getActive() {
      return active ? describeActive(active) : null
    },
    async listText(input) {
      return requireActive().repository.listText(input.kind, input.directory, input.view)
    },
    async manuscript(input) {
      const { action, bookId, chapterId } = input || {}
      if (!['catalog', 'read', 'write', 'create'].includes(action) || (action !== 'catalog' && (typeof bookId !== 'string' || !bookId || typeof chapterId !== 'string' || !chapterId))) {
        throw desktopError(DESKTOP_ERROR_CODES.INVALID_INPUT, 'Invalid manuscript request')
      }
      if (!active) {
        if (action === 'catalog' || action === 'read') return null
        requireActive()
      }
      const current = active
      if (!current.chapterBindings) {
        const bindings = new Map()
        const books = []
        const records = current.database.listLegacyRecords?.() || []
        for (const record of records) {
          if (record.recordType !== 'writing-books-metadata') continue
          for (const book of JSON.parse(record.jsonPayload)) {
            const { sourceRecord, chapters, ...metadata } = book
            books.push({ ...metadata, chapters: chapters.map(chapter => ({ ...chapter.legacyFields, id: chapter.id, title: chapter.title, content: '', contentFormat: 'md' })) })
            for (const chapter of book.chapters) {
              const key = JSON.stringify([book.id, chapter.id])
              const id = stableMigrationId('chapter', record.sourceRecordId, chapter.sourceNestedId)
              if (bindings.has(key)) throw desktopError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, 'Ambiguous manuscript binding')
              bindings.set(key, id)
            }
          }
        }
        for (const record of records) {
          if (record.recordType !== 'native-chapter-binding') continue
          const { bookId, chapterId, itemId, title, createdAt } = JSON.parse(record.jsonPayload)
          const book = books.find(candidate => candidate.id === bookId)
          if (!book) continue
          const key = JSON.stringify([bookId, chapterId])
          if (bindings.has(key)) throw desktopError(DESKTOP_ERROR_CODES.INTEGRITY_FAILED, 'Ambiguous manuscript binding')
          bindings.set(key, itemId)
          book.chapters.push({ id: chapterId, title, content: '', contentFormat: 'md', createdAt })
        }
        current.chapterBindings = bindings
        current.bookCatalog = books
      }
      if (action === 'catalog') return current.bookCatalog
      const key = JSON.stringify([bookId, chapterId])
      const itemId = current.chapterBindings.get(key)
      if (action === 'create') {
        const book = current.bookCatalog.find(candidate => candidate.id === bookId)
        if (!book) return null
        if (current.mode !== 'read-write') throw desktopError(DESKTOP_ERROR_CODES.PROJECT_LOCKED, '项目目录为只读')
        if (typeof input.text !== 'string' || typeof input.title !== 'string') throw desktopError(DESKTOP_ERROR_CODES.INVALID_INPUT, 'Invalid chapter content')
        if (itemId) {
          const prior = await current.repository.readText(itemId)
          if (prior.text !== input.text) throw desktopError(DESKTOP_ERROR_CODES.STALE_REVISION, '项目文件已存在')
          return { ...prior, projectId: current.manifest.projectId }
        }
        const firstId = current.chapterBindings.get(JSON.stringify([bookId, book.chapters[0]?.id]))
        const parent = current.database.getItemById(firstId)
        const id = stableMigrationId('chapter', current.manifest.projectId, key)
        const label = input.title.replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').trim().replace(/[ .]+$/, '').slice(0, 48) || '章节'
        const relativePath = posix.join(parent ? posix.dirname(parent.relativePath) : 'manuscript', `新增-${label}-${id.slice(-12)}.txt`)
        const createdAt = new Date().toISOString()
        const content = await publishNewProjectText(current.root, relativePath, `.pinax/tmp/${randomUUID()}.txt`, input.text)
        current.database.withTransaction(() => {
          current.database.insertItem({ id, kind: 'chapter', relativePath, parentId: parent?.parentId || null, sortOrder: book.chapters.length,
            revision: 0, contentHash: content.contentHash, byteLength: content.byteLength, createdAt, updatedAt: createdAt })
          current.database.insertLegacyRecord({ id: 'binding-' + id, recordType: 'native-chapter-binding', sourceRecordId: bookId,
            jsonPayload: JSON.stringify({ bookId, chapterId, itemId: id, title: input.title, createdAt }), contentHash: content.contentHash, createdAt })
        })
        current.chapterBindings.set(key, id)
        book.chapters.push({ id: chapterId, title: input.title, content: '', contentFormat: 'md', createdAt })
        return { ...content, itemId: id, relativePath, revision: 0, projectId: current.manifest.projectId }
      }
      if (!itemId && action === 'read') return null
      if (!itemId || (action === 'write' && input.projectId !== current.manifest.projectId)) {
        throw desktopError(DESKTOP_ERROR_CODES.STALE_REVISION, '当前章节文件的项目绑定已变化')
      }
      if (action === 'read') return { ...await current.repository.readText(itemId), projectId: current.manifest.projectId }
      if (typeof input.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(input.contentHash)) {
        throw desktopError(DESKTOP_ERROR_CODES.INVALID_INPUT, 'Manuscript content hash is required')
      }
      const item = current.database.getItemById(itemId)
      return current.repository.writeText({
        itemId, relativePath: item?.relativePath, expectedRevision: input.revision, text: input.text
      }, input.contentHash)
    },
    async readText(input) {
      return requireActive().repository.readText(input.itemId)
    },
    async writeText(input) {
      return requireActive().repository.writeText(input)
    },
    async checkIntegrity() {
      return requireActive().repository.checkIntegrity()
    },
    async createBackup(input) {
      const current = requireActive()
      return createManagedBackup({
        root: current.root,
        destination: input.destinationDirectory,
        database: current.database,
        name: current.manifest.name,
        projectId: current.manifest.projectId
      }, deps.backup)
    },
    close
  }
  let pending = Promise.resolve()
  return Object.freeze(Object.fromEntries(Object.entries(operations).map(([name, invoke]) => [name, (...args) => {
    const result = pending.then(() => invoke(...args))
    pending = result.catch(() => {})
    return result
  }])))
}

function describeActive(active) {
  return {
    directory: active.root,
    projectId: active.manifest.projectId,
    name: active.manifest.name,
    mode: active.mode,
    recovery: active.recovery
  }
}

function desktopError(code, message, details) {
  return Object.assign(new Error(message), { code, details })
}
