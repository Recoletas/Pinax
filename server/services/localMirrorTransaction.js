import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const hash = data => createHash('sha256').update(data).digest('hex')
const fail = (code, message) => Object.assign(new Error(message), { code })
function files(root, prefix = '') {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const relative = path.join(prefix, entry.name)
    if (entry.isSymbolicLink()) throw fail('ERR_LOCAL_SYMLINK', '项目包含符号链接，未执行同步。')
    return entry.isDirectory() ? files(path.join(root, entry.name), relative) : [relative]
  })
}
function durable(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const descriptor = fs.openSync(file, 'w')
  try { fs.writeFileSync(descriptor, data); fs.fsyncSync(descriptor) } finally { fs.closeSync(descriptor) }
}
function flushDirectory(directory) {
  if (process.platform === 'win32') return
  const descriptor = fs.openSync(directory, 'r')
  try { fs.fsyncSync(descriptor) } finally { fs.closeSync(descriptor) }
}
const locations = dir => ({ journal: `${dir}.pinax-sync.json`, backup: `${dir}.pinax-before-sync`, staging: `${dir}.pinax-next-sync`, generated: `${dir}.pinax-generated-sync` })

// The journal records whether the new tree was durably installed. An interrupted
// pre-commit operation restores the previous tree; a committed one completes cleanup.
export function recoverMirrorTransaction(dir) {
  const { journal, backup, staging, generated } = locations(dir)
  if (!fs.existsSync(journal)) return
  const transaction = JSON.parse(fs.readFileSync(journal, 'utf8'))
  if (transaction.committed !== true && fs.existsSync(backup)) {
    fs.rmSync(dir, { recursive: true, force: true })
    fs.renameSync(backup, dir)
  } else if (transaction.committed !== true && !transaction.hadOriginal) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  for (const temporary of [backup, staging, generated]) fs.rmSync(temporary, { recursive: true, force: true })
  fs.rmSync(journal, { force: true })
  flushDirectory(path.dirname(dir))
}

export function mirrorDomainFingerprint(directory) {
  const digest = createHash('sha256')
  for (const relative of files(directory).sort()) {
    digest.update(JSON.stringify([relative, hash(fs.readFileSync(path.join(directory, relative)))]))
  }
  return digest.digest('hex')
}

export function commitMirrorTransaction({ dir, payload, render }) {
  recoverMirrorTransaction(dir)
  const { journal, backup, staging, generated } = locations(dir)
  const manifestName = path.join('.pinax', 'sync-manifest.json')
  let previous = { revision: 0, files: {} }
  if (fs.existsSync(path.join(dir, manifestName))) previous = JSON.parse(fs.readFileSync(path.join(dir, manifestName), 'utf8'))
  const worldbookFingerprint = mirrorDomainFingerprint(path.join(dir, '世界书'))
  const fingerprint = hash(JSON.stringify(payload))
  if (payload.requestId && previous.requestId === payload.requestId) {
    if (previous.fingerprint !== fingerprint) throw fail('ERR_REQUEST_REUSED', '同步请求编号已用于其他内容。')
    return { ...previous.result, revision: previous.revision }
  }
  if (payload.expectedWorldbookFingerprint !== undefined && payload.expectedWorldbookFingerprint !== worldbookFingerprint) throw fail('ERR_SYNC_CONFLICT', '世界书文件已更新，请重新读取后再保存。')
  if (payload.baseRevision !== undefined && payload.baseRevision !== previous.revision) throw fail('ERR_SYNC_CONFLICT', '项目文件已更新，请重新读取后保存。')
  const selected = relative => {
    const top = relative.split(path.sep)[0]
    if (Array.isArray(payload.domains)) {
      const domain = ({ '正文': 'book', '大纲': 'book', '构思': 'book', 'meta.json': 'book', '世界书': 'worldbook', '日志': 'logs', '资料': 'materials', '媒体清单.json': 'media' })[top]
      if (!payload.domains.includes(domain)) return false
    }
    if (['正文', '大纲', '构思', 'meta.json'].includes(top)) return true
    if (top === '世界书') return Object.hasOwn(payload, 'worldbook')
    if (top === '日志') return path.basename(relative).startsWith('会话-') ? Object.hasOwn(payload, 'sessions') : Object.hasOwn(payload, 'logs')
    if (relative.startsWith(`资料${path.sep}归档${path.sep}`)) return Object.hasOwn(payload, 'sourceArchive')
    if (top === '资料') return Object.hasOwn(payload, 'materials')
    return top === '媒体清单.json' && Object.hasOwn(payload, 'media')
  }
  const hadOriginal = fs.existsSync(dir)
  fs.mkdirSync(path.dirname(dir), { recursive: true })
  for (const temporary of [backup, staging, generated]) if (fs.existsSync(temporary)) throw fail('ERR_SYNC_RECOVERY', '项目存在未识别的同步恢复目录，未覆盖。')
  try {
    const result = render(generated)
    const emitted = files(generated).filter(selected)
    const old = Object.keys(previous.files).filter(selected)
    // Check every owned file, including files being removed. Never overwrite
    // manual edits or collide with an unowned user file.
    for (const relative of new Set([...old, ...emitted])) {
      const destination = path.join(dir, relative)
      if (!fs.existsSync(destination)) {
        if (previous.files[relative]) throw fail('ERR_LOCAL_EDIT', `项目文件已被删除：${relative}`)
        continue
      }
      const actual = hash(fs.readFileSync(destination))
      const acceptedWorldbook = relative.startsWith(`世界书${path.sep}`) && payload.expectedWorldbookFingerprint === worldbookFingerprint
      if (previous.files[relative] && actual !== previous.files[relative] && !acceptedWorldbook) throw fail('ERR_LOCAL_EDIT', `项目文件已被修改：${relative}`)
      if (!previous.files[relative] && emitted.includes(relative) && actual !== hash(fs.readFileSync(path.join(generated, relative))) && !acceptedWorldbook) throw fail('ERR_LOCAL_EDIT', `已有文件尚未确认接管：${relative}`)
    }
    if (hadOriginal) { files(dir); fs.cpSync(dir, staging, { recursive: true }) } else fs.mkdirSync(staging)
    const owned = { ...previous.files }
    for (const relative of old) { fs.rmSync(path.join(staging, relative), { force: true }); delete owned[relative] }
    for (const relative of emitted) {
      const content = fs.readFileSync(path.join(generated, relative))
      durable(path.join(staging, relative), content)
      owned[relative] = hash(content)
    }
    const revision = previous.revision + 1
    durable(path.join(staging, manifestName), JSON.stringify({ revision, files: owned, requestId: payload.requestId || null, fingerprint, result }, null, 2))
    for (const relative of files(staging)) {
      // 'r+' 而非 'r'：win32 对只读句柄 fsync 一律 EPERM（目录侧已在 flushDirectory 豁免，
      // 文件侧用写句柄则三平台皆通；staging 文件刚由 durable 写出，句柄仅用于落盘校验）。
      const descriptor = fs.openSync(path.join(staging, relative), 'r+')
      try { fs.fsyncSync(descriptor) } finally { fs.closeSync(descriptor) }
      flushDirectory(path.dirname(path.join(staging, relative)))
    }
    flushDirectory(staging)
    const transaction = { hadOriginal, committed: false }
    durable(journal, JSON.stringify(transaction)); flushDirectory(path.dirname(dir))
    if (hadOriginal) fs.renameSync(dir, backup)
    fs.renameSync(staging, dir); flushDirectory(path.dirname(dir))
    durable(journal, JSON.stringify({ ...transaction, committed: true })); flushDirectory(path.dirname(dir))
    recoverMirrorTransaction(dir)
    return { ...result, revision }
  } catch (error) {
    if (fs.existsSync(journal)) recoverMirrorTransaction(dir)
    else for (const temporary of [staging, generated]) fs.rmSync(temporary, { recursive: true, force: true })
    throw error
  }
}
