import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { hostname } from 'node:os'

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
const activeOwners = new Set()

// The journal directory becomes visible atomically with its owner record.
function acquireJournal(dir, journal) {
  const owner = { pid: process.pid, host: hostname(), id: randomUUID() }
  const claim = journal + '.' + owner.id
  fs.mkdirSync(claim)
  try {
    durable(path.join(claim, 'owner.json'), JSON.stringify(owner))
    flushDirectory(claim)
    fs.renameSync(claim, journal)
    flushDirectory(path.dirname(dir))
  } finally {
    fs.rmSync(claim, { recursive: true, force: true })
  }
  activeOwners.add(owner.id)
  return owner
}

function publishPhase(journal, name, value) {
  const temp = path.join(journal, name + '.tmp')
  durable(temp, JSON.stringify(value))
  fs.renameSync(temp, path.join(journal, name))
  flushDirectory(journal)
}

function projectFile(root, relative) {
  if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).some(p => !p || p === '.' || p === '..')) throw fail('ERR_SYNC_RECOVERY', '无效的事务文件路径')
  let target = root
  for (const part of ['', ...relative.split(/[\\/]/)]) {
    target = path.join(target, part)
    const stat = fs.lstatSync(target, { throwIfNoEntry: false })
    if (stat?.isSymbolicLink()) throw fail('ERR_LOCAL_SYMLINK', '项目文件路径包含符号链接')
  }
  return target
}

const fileHash = target => fs.existsSync(target) ? hash(fs.readFileSync(target)) : null

function ensureInactive(owner) {
  if (owner.host !== hostname()) throw fail('ERR_SYNC_RECOVERY', '项目事务由另一台电脑持有')
  if (owner.pid === process.pid && !activeOwners.has(owner.id)) return
  try { process.kill(owner.pid, 0) }
  catch (error) { if (error.code === 'ESRCH') return; throw error }
  throw fail('ERR_SYNC_BUSY', '项目同步进行中')
}

// Only one process may roll back a dead writer. Each dead recovery claimant
// has its own successor slot, so competing recoveries never unlink a live lock.
function claimRecovery(journal, original) {
  let prior = original
  const me = { id: randomUUID(), host: hostname(), pid: process.pid }
  const claim = path.join(journal, 'claim-' + me.id)
  fs.mkdirSync(claim)
  try {
    durable(path.join(claim, 'owner.json'), JSON.stringify(me))
    flushDirectory(claim)
    while (true) {
      ensureInactive(prior)
      const successor = path.join(journal, 'recovery-' + prior.id)
      try { fs.renameSync(claim, successor); flushDirectory(journal); activeOwners.add(me.id); return me }
      catch (error) {
        if (!fs.existsSync(successor)) throw error
        prior = JSON.parse(fs.readFileSync(path.join(successor, 'owner.json'), 'utf8'))
      }
    }
  } finally {
    fs.rmSync(claim, { recursive: true, force: true })
  }
}

function recoverFiles(dir, journal, currentOwner) {
  const owner = JSON.parse(fs.readFileSync(path.join(journal, 'owner.json'), 'utf8'))
  let claimant
  if (currentOwner?.id !== owner.id) {
    ensureInactive(owner)
    claimant = claimRecovery(journal, owner)
    if (JSON.parse(fs.readFileSync(path.join(journal, 'owner.json'), 'utf8')).id !== owner.id) throw fail('ERR_SYNC_BUSY', '事务已由其他进程恢复')
  }
  try { finishRecovery(dir, journal, owner) }
  finally { activeOwners.delete(claimant?.id || owner.id) }
}

function finishRecovery(dir, journal, owner) {
  const intent = path.join(journal, 'install.json')
  if (fs.existsSync(intent) && !fs.existsSync(path.join(journal, 'committed'))) {
    const changes = JSON.parse(fs.readFileSync(intent, 'utf8'))
    for (let index = changes.length - 1; index >= 0; index--) {
      const change = changes[index]
      const file = projectFile(dir, change.relative)
      const before = path.join(journal, 'before-' + index)
      const next = path.join(journal, 'next-' + index)
      // A before-image exists only after the original was moved. A vanished
      // next-image proves we installed a newly created file.
      if (!fs.existsSync(before) && (change.old !== null || fs.existsSync(next))) continue
      const current = fileHash(file)
      if (current !== null && current !== change.next) throw fail('ERR_SYNC_RECOVERY', '恢复前文件已被外部修改，已保留现场：' + change.relative)
      if (fs.existsSync(before)) fs.renameSync(before, file)
      else if (current !== null) fs.unlinkSync(file)
      flushDirectory(path.dirname(file))
    }
  }
  // A single rename retires the journal. A crash during recursive cleanup can
  // leave an inert directory but never a half-deleted active journal.
  const retired = journal + '.' + owner.id + '.done'
  fs.renameSync(journal, retired)
  flushDirectory(path.dirname(dir))
  fs.rmSync(retired, { recursive: true, force: true })
}
const locations = dir => ({ journal: `${dir}.pinax-sync.json`, backup: `${dir}.pinax-before-sync`, staging: `${dir}.pinax-next-sync`, generated: `${dir}.pinax-generated-sync` })

// The journal records whether the new tree was durably installed. An interrupted
// pre-commit operation restores the previous tree; a committed one completes cleanup.
export function recoverMirrorTransaction(dir) {
  const { journal, backup, staging, generated } = locations(dir)
  if (!fs.existsSync(journal)) return
  if (fs.lstatSync(journal).isDirectory()) return recoverFiles(dir, journal)
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

export function mirrorBookFingerprint(root) {
  return hash(JSON.stringify(['正文', '大纲', '构思'].map(name => [name, mirrorDomainFingerprint(path.join(root, name))]).concat([
    ['meta.json', fs.existsSync(path.join(root, 'meta.json')) ? hash(fs.readFileSync(path.join(root, 'meta.json'))) : null]
  ])))
}

export function commitMirrorTransaction({ dir, payload, render, receipt = null, scope = null }) {
  recoverMirrorTransaction(dir)
  const { journal, backup, staging, generated: legacyGenerated } = locations(dir)
  const manifestName = path.join('.pinax', 'sync-manifest.json')
  let previous = { revision: 0, files: {} }
  if (fs.existsSync(path.join(dir, manifestName))) previous = JSON.parse(fs.readFileSync(path.join(dir, manifestName), 'utf8'))
  const worldbookFingerprint = mirrorDomainFingerprint(path.join(dir, '世界书'))
  const bookFingerprint = mirrorBookFingerprint(dir)
  const fingerprint = hash(JSON.stringify(payload))
  if (payload.requestId && previous.requestId === payload.requestId) {
    if (previous.fingerprint !== fingerprint) throw fail('ERR_REQUEST_REUSED', '同步请求编号已用于其他内容。')
    return { ...previous.result, revision: previous.revision }
  }
  if (payload.expectedWorldbookFingerprint !== undefined && payload.expectedWorldbookFingerprint !== worldbookFingerprint) throw fail('ERR_SYNC_CONFLICT', '世界书文件已更新，请重新读取后再保存。')
  if (payload.expectedBookFingerprint !== undefined && payload.expectedBookFingerprint !== bookFingerprint) throw fail('ERR_SYNC_CONFLICT', '书稿文件已变化，请重新读取后再保存。')
  const browserWrite = payload.source === 'browser-mirror'
  if (browserWrite && (!Number.isSafeInteger(payload.baseRevision) || payload.baseRevision < 0 || payload.baseRevision > previous.revision)) throw fail('ERR_SYNC_CONFLICT', '浏览器中的同步基线不属于当前项目')
  if (!browserWrite && payload.baseRevision !== undefined && payload.baseRevision !== previous.revision) throw fail('ERR_SYNC_CONFLICT', '项目文件已更新，请重新读取后保存。')
  const selected = relative => {
    const top = relative.split(path.sep)[0]
    if (scope === 'chapters') return top === '正文' || top === 'meta.json'
    if (scope === 'outline') return top === '大纲'
    if (scope === 'metadata') return top === 'meta.json'
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
  fs.mkdirSync(path.dirname(dir), { recursive: true })
  for (const temporary of [backup, staging, legacyGenerated]) if (fs.existsSync(temporary)) throw fail('ERR_SYNC_RECOVERY', '项目存在未识别的同步恢复目录，未覆盖。')
  const owner = acquireJournal(dir, journal)
  const generated = path.join(journal, 'generated')
  try {
    // A second process may have committed between our preliminary reads and
    // ownership of the project. Do not rebase the caller's snapshot implicitly.
    const liveManifest = path.join(dir, manifestName)
    if ((fs.existsSync(liveManifest) ? JSON.parse(fs.readFileSync(liveManifest, 'utf8')).revision : 0) !== previous.revision) throw fail('ERR_SYNC_CONFLICT', '项目版本已变化')
    if (selected(path.join('大纲', 'outline.json'))) {
      const outline = projectFile(dir, path.join('大纲', 'outline.json'))
      if (fs.existsSync(outline)) {
        let data
        try { data = JSON.parse(fs.readFileSync(outline, 'utf8')) } catch { /* handled below */ }
        if (!Array.isArray(data?.nodes) || !Array.isArray(data?.edges)) throw fail('ERR_INCOMPLETE_READ', '大纲格式不完整，已保留原文件')
      }
    }
    const result = render(generated)
    const emitted = new Set(files(generated).filter(selected))
    const old = Object.keys(previous.files).filter(selected)
    const owned = { ...previous.files }
    const changes = []
    const fileRevisions = { ...previous.fileRevisions }
    const revision = previous.revision + 1
    function stage(relative, actual, next, bytes) {
      if (actual === next) return
      if (next !== null) durable(path.join(journal, 'next-' + changes.length), bytes)
      changes.push({ relative, old: actual, next })
    }
    for (const relative of new Set([...old, ...emitted])) {
      const target = projectFile(dir, relative)
      const actual = fileHash(target)
      const bytes = emitted.has(relative) ? fs.readFileSync(path.join(generated, relative)) : null
      let next = bytes === null ? null : hash(bytes)
      // Render timestamps are incidental: do not manufacture a metadata change
      // (or a false revision conflict) on every reconciliation.
      if (relative === 'meta.json' && actual && next && actual !== next) {
        const oldMeta = JSON.parse(fs.readFileSync(target, 'utf8'))
        const newMeta = JSON.parse(bytes.toString('utf8'))
        delete oldMeta.mirroredAt
        delete newMeta.mirroredAt
        if (JSON.stringify(oldMeta) === JSON.stringify(newMeta)) next = actual
      }
      const top = relative.split(path.sep)[0]
      const lastChange = fileRevisions[relative] ?? (previous.files[relative] ? previous.revision : 0)
      const validBookBase = Number.isSafeInteger(payload.bookBaseRevision) && payload.bookBaseRevision <= previous.revision
      const base = browserWrite && validBookBase && ['正文', '大纲', '构思', 'meta.json'].includes(top)
        ? Math.max(payload.baseRevision, payload.bookBaseRevision)
        : payload.baseRevision
      if (browserWrite && actual !== next && lastChange > base) throw fail('ERR_SYNC_CONFLICT', '项目文件有更新，已保留两个版本，请先从文件核对：' + relative)
      if (next !== actual || fileRevisions[relative] === undefined) fileRevisions[relative] = next !== actual ? revision : lastChange
      const accepted = top === '世界书' ? payload.expectedWorldbookFingerprint === worldbookFingerprint
        : ['正文', '大纲', '构思', 'meta.json'].includes(top) && payload.expectedBookFingerprint === bookFingerprint
      if (previous.files[relative] && (actual === null || (actual !== previous.files[relative] && !accepted))) throw fail('ERR_LOCAL_EDIT', '项目文件已被修改或删除：' + relative)
      if (!previous.files[relative] && actual !== null && actual !== next && !accepted) throw fail('ERR_LOCAL_EDIT', '已有文件尚未确认接管：' + relative)
      if (next === null) delete owned[relative]
      else owned[relative] = next
      stage(relative, actual, next, bytes)
    }
    function stageMetadata(relative, content) {
      stage(relative, fileHash(projectFile(dir, relative)), hash(content), content)
    }
    if (receipt) stageMetadata(path.join('.pinax', 'operations', hash(receipt.operationId) + '.json'), JSON.stringify({ ...receipt, revision }))
    stageMetadata(manifestName, JSON.stringify({ revision, files: owned, fileRevisions, requestId: payload.requestId || null, fingerprint, result }, null, 2))
    if (mirrorBookFingerprint(dir) !== bookFingerprint || mirrorDomainFingerprint(path.join(dir, '世界书')) !== worldbookFingerprint) throw fail('ERR_SYNC_CONFLICT', '准备保存期间来源已变化')
    publishPhase(journal, 'install.json', changes)
    const directories = new Set()
    for (const [index, change] of changes.entries()) {
      const file = projectFile(dir, change.relative)
      let parent = path.dirname(file)
      while (!fs.existsSync(parent)) { directories.add(path.dirname(parent)); parent = path.dirname(parent) }
      fs.mkdirSync(path.dirname(file), { recursive: true })
      if (fileHash(file) !== change.old) throw fail('ERR_SYNC_CONFLICT', '提交前文件已变化：' + change.relative)
      if (change.old !== null) {
        const before = path.join(journal, 'before-' + index)
        fs.renameSync(file, before)
        if (fileHash(before) !== change.old) throw fail('ERR_SYNC_CONFLICT', '项目文件在提交期间发生变化：' + change.relative)
        flushDirectory(journal)
      }
      if (change.next !== null) fs.renameSync(path.join(journal, 'next-' + index), file)
      directories.add(path.dirname(file))
    }
    for (const parent of directories) flushDirectory(parent)
    publishPhase(journal, 'committed', true)
    return { ...result, revision }
  } finally {
    recoverFiles(dir, journal, owner)
  }
}
