import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { createMemoryNoteStore, createMemoryMaterialStore, createJournaledWriteStore } from '@pinax/core'
import { fail } from '@pinax/core/contracts/result'

const hash = text => createHash('sha256').update(text).digest('hex')
function flushDirectory(directory) {
  if (process.platform === 'win32') return
  const fd = fs.openSync(directory, 'r')
  try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
}
function validatePath(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) throw new TypeError('集合文件必须由Host显式指定绝对路径')
  let current = path.parse(file).root
  for (const part of file.slice(current.length).split(path.sep)) {
    current = path.join(current, part)
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('集合路径不能包含符号链接') }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
}
function atomicJson(file, value) {
  validatePath(file)
  if (value === null) { fs.rmSync(file, { force: true }); flushDirectory(path.dirname(file)); return true }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    const fd = fs.openSync(temporary, 'wx')
    try { fs.writeFileSync(fd, JSON.stringify(value, null, 2)+'\n'); fs.fsyncSync(fd) }
    finally { fs.closeSync(fd) }
    fs.renameSync(temporary, file)
    flushDirectory(path.dirname(file))
    return true
  } finally { fs.rmSync(temporary, { force: true }) }
}

// Explicit Host-owned global collection files. These are not project ideas,
// imported sources, source chunks or the chapter directory. No default path.
function createCollection(file, kind, createWorkingStore) {
  validatePath(file)
  const journalFile = `${file}.journal.json`
  const read = (key, fallback = null) => {
    validatePath(key)
    try { return JSON.parse(fs.readFileSync(key, 'utf8')) }
    catch (error) { if (error.code === 'ENOENT') return fallback; throw error }
  }
  const journal = createJournaledWriteStore({ getItem: read, setItem: atomicJson,
    removeItem: key => atomicJson(key, null), hashText: hash, journalKey: journalFile })
  return Object.fromEntries(['list', 'read', 'create', 'update', 'remove'].map(method => [method, async (...args) => {
    try {
      if (String(process.env.PINAX_PUBLIC_ORIGINS || '').trim()) return fail('IO_FAILED', '文件集合仅限本地Host使用')
      journal.recover()
      const before = read(file)
      if (before && (before.spec !== 'pinax-file-collection@1' || before.kind !== kind || !Array.isArray(before.items))) return fail('IO_FAILED', '集合文件格式或类型不符，未覆盖')
      const items = JSON.parse(JSON.stringify(before?.items || []))
      const working = createWorkingStore(items)
      const result = await working[method](...args)
      if (!result.ok || ['list', 'read'].includes(method)) return result
      const after = { ...(before || {}), spec: 'pinax-file-collection@1', kind, items: working.snapshot() }
      journal.commit([{ key: file, expected: before, after }], randomUUID())
      return result
    } catch (error) { return fail(error.code || 'IO_FAILED', error.message) }
  }]))
}
export function createFileNoteStore({ file } = {}) { return createCollection(file, 'notes', notes => createMemoryNoteStore({ notes })) }
export function createFileMaterialStore({ file } = {}) { return createCollection(file, 'materials', materials => createMemoryMaterialStore({ materials })) }
