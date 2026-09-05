import { execFileSync } from 'node:child_process'
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT_PATH = resolve(MODULE_DIR, '..', '..')
const ARTIFACT_ROOT_PARTS = ['tmp', 'authoring-journeys']
const FAILURE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const RUNNING_RETENTION_MS = 24 * 60 * 60 * 1000
const MAX_FAILURE_RUNS = 3
const MAX_JOURNEY_BYTES = 30 * 1024 * 1024
const MAX_RUN_BYTES = 200 * 1024 * 1024
const MAX_SCREENSHOT_BYTES = 24 * 1024 * 1024
const MAX_EVENT_BYTES = 2 * 1024 * 1024
const MAX_STATE_BYTES = 1024 * 1024
const MAX_REPORT_BYTES = 4 * 1024 * 1024
const MAX_MANIFEST_BYTES = 1024 * 1024
const MAX_DIAGNOSTIC_ARRAY_ITEMS = 512
const MAX_DIAGNOSTIC_OBJECT_KEYS = 80

function compactTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function shortGitSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], {
      cwd: PROJECT_ROOT_PATH,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || 'nogit'
  } catch {
    return 'nogit'
  }
}

function sanitizeText(value, maxLength = 600) {
  return String(value ?? '')
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/((?:api[-_ ]?key|token|secret|password)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .slice(0, maxLength)
}

function sanitizeUrl(value) {
  try {
    const url = new URL(String(value))
    return `${url.origin}${url.pathname}`.slice(0, 300)
  } catch {
    return sanitizeText(value, 300).replace(/[?#].*$/, '')
  }
}

function sanitizeDiagnostic(value, depth = 0) {
  if (depth > 5) return '[TRUNCATED]'
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return sanitizeText(value)
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_DIAGNOSTIC_ARRAY_ITEMS)
      .map((item) => sanitizeDiagnostic(item, depth + 1))
    if (value.length > MAX_DIAGNOSTIC_ARRAY_ITEMS) {
      items.push({
        truncated: true,
        kept: MAX_DIAGNOSTIC_ARRAY_ITEMS,
        dropped: value.length - MAX_DIAGNOSTIC_ARRAY_ITEMS,
      })
    }
    return items
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value)
    const sanitized = Object.fromEntries(entries.slice(0, MAX_DIAGNOSTIC_OBJECT_KEYS).map(([key, item]) => {
      const normalizedKey = String(key).toLowerCase()
      if (/(api.?key|authorization|token|secret|password)/.test(normalizedKey)) return [key, '[REDACTED]']
      if (normalizedKey === 'url') return [key, sanitizeUrl(item)]
      return [key, sanitizeDiagnostic(item, depth + 1)]
    }))
    if (entries.length > MAX_DIAGNOSTIC_OBJECT_KEYS) {
      sanitized.__truncatedKeys = entries.length - MAX_DIAGNOSTIC_OBJECT_KEYS
    }
    return sanitized
  }
  return sanitizeText(value)
}

function serializedBytes(value) {
  return Buffer.byteLength(String(value || ''), 'utf8')
}

async function writeBoundedJson(path, payload, maxBytes, fallbackPayload) {
  let serialized = `${JSON.stringify(payload, null, 2)}\n`
  let truncated = false
  if (serializedBytes(serialized) > maxBytes) {
    truncated = true
    serialized = `${JSON.stringify(fallbackPayload, null, 2)}\n`
  }
  if (serializedBytes(serialized) > maxBytes) {
    throw new Error(`Bounded JSON fallback exceeded ${maxBytes} bytes: ${path}`)
  }
  await writeFile(path, serialized)
  return { bytes: serializedBytes(serialized), truncated }
}

function serializeBoundedJsonLines(entries, maxBytes) {
  const lines = []
  let usedBytes = 0
  let dropped = 0
  const reserveBytes = 512
  for (let index = 0; index < entries.length; index += 1) {
    const line = `${JSON.stringify(sanitizeDiagnostic(entries[index]))}\n`
    const lineBytes = serializedBytes(line)
    if (usedBytes + lineBytes > maxBytes - reserveBytes) {
      dropped = entries.length - index
      break
    }
    lines.push(line)
    usedBytes += lineBytes
  }
  if (dropped) {
    const summary = `${JSON.stringify({ kind: 'events.truncated', kept: lines.length, dropped })}\n`
    if (usedBytes + serializedBytes(summary) <= maxBytes) lines.push(summary)
  }
  const text = lines.join('')
  if (serializedBytes(text) > maxBytes) throw new Error('Bounded JSONL serialization exceeded its hard limit')
  return { text, dropped }
}

async function optionalLstat(path) {
  try {
    return await lstat(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function resolveArtifactRoot({ create = true } = {}) {
  const projectRoot = await realpath(PROJECT_ROOT_PATH)
  const filesystemRoot = resolve(projectRoot, sep)
  if (!projectRoot || projectRoot === filesystemRoot) {
    throw new Error(`Unsafe project root for Authoring artifacts: ${projectRoot || '<empty>'}`)
  }

  const tempRoot = resolve(projectRoot, ARTIFACT_ROOT_PARTS[0])
  const tempInfo = await optionalLstat(tempRoot)
  if (tempInfo?.isSymbolicLink()) throw new Error(`Refusing symlinked artifact parent: ${tempRoot}`)
  if (tempInfo && !tempInfo.isDirectory()) throw new Error(`Artifact parent is not a directory: ${tempRoot}`)
  if (!tempInfo) {
    if (!create) return { projectRoot, rootPath: resolve(tempRoot, ARTIFACT_ROOT_PARTS[1]), rootReal: null }
    await mkdir(tempRoot)
  }
  if (await realpath(tempRoot) !== tempRoot) throw new Error(`Artifact parent realpath mismatch: ${tempRoot}`)

  const rootPath = resolve(tempRoot, ARTIFACT_ROOT_PARTS[1])
  const rootInfo = await optionalLstat(rootPath)
  if (rootInfo?.isSymbolicLink()) throw new Error(`Refusing symlinked artifact root: ${rootPath}`)
  if (rootInfo && !rootInfo.isDirectory()) throw new Error(`Artifact root is not a directory: ${rootPath}`)
  if (!rootInfo) {
    if (!create) return { projectRoot, rootPath, rootReal: null }
    await mkdir(rootPath)
  }
  const rootReal = await realpath(rootPath)
  if (rootReal !== rootPath || dirname(rootReal) !== tempRoot) {
    throw new Error(`Artifact root escaped its expected realpath: ${rootReal}`)
  }
  return { projectRoot, rootPath, rootReal }
}

function assertScopedPath(rootReal, candidateReal) {
  const scoped = relative(rootReal, candidateReal)
  if (!scoped || scoped.startsWith(`..${sep}`) || scoped === '..' || isAbsolute(scoped)) {
    throw new Error(`Refusing unsafe Authoring artifact target: ${candidateReal}`)
  }
}

async function removeScopedPath(rootReal, targetPath) {
  const info = await optionalLstat(targetPath)
  if (!info) return false
  if (info.isSymbolicLink()) throw new Error(`Refusing to remove symlinked artifact target: ${targetPath}`)
  const targetReal = await realpath(targetPath)
  assertScopedPath(rootReal, targetReal)
  await rm(targetReal, { recursive: true, force: false })
  return true
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

async function listArtifactFiles(directory, rootReal, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolute = resolve(directory, entry.name)
    const info = await lstat(absolute)
    if (info.isSymbolicLink()) continue
    const real = await realpath(absolute)
    assertScopedPath(rootReal, real)
    const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...await listArtifactFiles(real, rootReal, relativeName))
    } else if (entry.isFile()) {
      files.push({ path: relativeName, bytes: info.size })
    }
  }
  return files
}

async function enforceJourneyBudget(directory, rootReal, maxBytes) {
  let files = await listArtifactFiles(directory, rootReal)
  let bytes = files.reduce((sum, file) => sum + file.bytes, 0)
  if (bytes <= maxBytes) return { files, bytes, hardPruned: false }

  const initialBytes = bytes
  const screenshots = files
    .filter((file) => /\.(?:jpe?g|png)$/i.test(file.path))
    .sort((left, right) => right.bytes - left.bytes)
  for (const file of screenshots) {
    await removeScopedPath(rootReal, resolve(directory, file.path))
    bytes -= file.bytes
    if (bytes <= maxBytes) break
  }
  files = await listArtifactFiles(directory, rootReal)
  bytes = files.reduce((sum, file) => sum + file.bytes, 0)
  if (bytes <= maxBytes) return { files, bytes, hardPruned: true, initialBytes }

  // JSON evidence is already individually bounded. If an unexpected extra file
  // still breaks the journey cap, replace the directory with one minimal marker
  // instead of retaining an oversized failure tree.
  await removeScopedPath(rootReal, directory)
  await mkdir(directory)
  await writeBoundedJson(resolve(directory, 'budget-exceeded.json'), {
    schemaVersion: 1,
    truncated: true,
    reason: 'journey-hard-budget-exceeded',
    initialBytes,
    maxBytes,
  }, MAX_STATE_BYTES, {
    truncated: true,
    reason: 'journey-hard-budget-exceeded',
  })
  files = await listArtifactFiles(directory, rootReal)
  bytes = files.reduce((sum, file) => sum + file.bytes, 0)
  if (bytes > maxBytes) throw new Error(`Authoring journey artifact budget could not be enforced: ${bytes}/${maxBytes}`)
  return { files, bytes, hardPruned: true, initialBytes, resetToMarker: true }
}

async function enforceRunBudget(runDir, rootReal, maxBytes) {
  let files = await listArtifactFiles(runDir, rootReal)
  let bytes = files.reduce((sum, file) => sum + file.bytes, 0)
  if (bytes <= maxBytes) return { files, bytes, removed: [] }

  const markerReserveBytes = 64 * 1024
  const contentTarget = Math.max(0, maxBytes - markerReserveBytes)
  const initialBytes = bytes
  const removed = []
  const screenshots = files
    .filter((file) => /\.(?:jpe?g|png)$/i.test(file.path))
    .sort((left, right) => right.bytes - left.bytes)
  for (const file of screenshots) {
    await removeScopedPath(rootReal, resolve(runDir, file.path))
    removed.push({ path: file.path, bytes: file.bytes, reason: 'run-budget-screenshot' })
    bytes -= file.bytes
    if (bytes <= contentTarget) break
  }

  if (bytes > contentTarget) {
    const directories = []
    for (const entry of await readdir(runDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const path = resolve(runDir, entry.name)
      const info = await lstat(path)
      if (info.isSymbolicLink()) continue
      const real = await realpath(path)
      assertScopedPath(rootReal, real)
      const directoryFiles = await listArtifactFiles(real, rootReal)
      directories.push({
        path: entry.name,
        absolute: real,
        bytes: directoryFiles.reduce((sum, file) => sum + file.bytes, 0),
      })
    }
    directories.sort((left, right) => right.bytes - left.bytes)
    for (const directory of directories) {
      await removeScopedPath(rootReal, directory.absolute)
      removed.push({ path: directory.path, bytes: directory.bytes, reason: 'run-budget-journey-directory' })
      bytes -= directory.bytes
      if (bytes <= contentTarget) break
    }
  }

  await writeBoundedJson(resolve(runDir, 'budget-pruned.json'), {
    schemaVersion: 1,
    truncated: true,
    reason: 'run-hard-budget-exceeded',
    initialBytes,
    maxBytes,
    removed: sanitizeDiagnostic(removed),
  }, 48 * 1024, {
    schemaVersion: 1,
    truncated: true,
    reason: 'run-hard-budget-exceeded',
    initialBytes,
    maxBytes,
    removedCount: removed.length,
  })
  files = await listArtifactFiles(runDir, rootReal)
  bytes = files.reduce((sum, file) => sum + file.bytes, 0)
  if (bytes > maxBytes) throw new Error(`Authoring run artifact budget could not be enforced: ${bytes}/${maxBytes}`)
  return { files, bytes, removed }
}

function journeyId(label) {
  const match = String(label || '').match(/[A-Za-z]+\d+/)
  if (match) return match[0].toLowerCase()
  const fallback = String(label || 'journey').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return fallback || 'journey'
}

async function capturePageState(page) {
  if (!page || page.isClosed()) return { available: false, reason: 'page-unavailable' }
  try {
    return await page.evaluate(() => {
      const summarizeElement = (element) => {
        if (!element) return null
        const box = element.getBoundingClientRect()
        return {
          tag: element.tagName?.toLowerCase() || null,
          id: element.id || null,
          className: typeof element.className === 'string' ? element.className.slice(0, 180) : null,
          role: element.getAttribute?.('role') || null,
          ariaLabel: element.getAttribute?.('aria-label') || null,
          title: element.getAttribute?.('title') || null,
          box: {
            x: Math.round(box.x * 100) / 100,
            y: Math.round(box.y * 100) / 100,
            width: Math.round(box.width * 100) / 100,
            height: Math.round(box.height * 100) / 100,
          },
        }
      }
      const visible = (element) => {
        const style = getComputedStyle(element)
        const box = element.getBoundingClientRect()
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity) !== 0
          && box.width > 0
          && box.height > 0
      }
      const hashText = (text) => {
        let hash = 2166136261
        for (let index = 0; index < text.length; index += 1) {
          hash ^= text.charCodeAt(index)
          hash = Math.imul(hash, 16777619)
        }
        return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
      }
      const editor = document.querySelector('.writing-notebook-editor__surface .ProseMirror')
      const editorText = editor?.textContent || ''
      const selection = window.getSelection()
      const overlaySelectors = [
        '.writing-inline-suggestion',
        '[data-test="block-draft"]',
        '.writing-command-menu-shell',
        '.writing-selection-actions',
        '.writing-annotation-composer',
        '.context-menu',
        '.modal',
        '[role="dialog"]',
      ]
      const overlays = [...new Set(overlaySelectors.flatMap((selector) => (
        [...document.querySelectorAll(selector)].filter(visible)
      )))].slice(0, 30).map(summarizeElement)
      let localStorageKeys = []
      try {
        localStorageKeys = Object.keys(localStorage).sort()
      } catch {
        localStorageKeys = ['[unavailable]']
      }
      return {
        available: true,
        url: location.origin === 'null' ? location.href.split(/[?#]/)[0] : `${location.origin}${location.pathname}`,
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio || 1 },
        document: {
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
        },
        editor: {
          present: Boolean(editor),
          textLength: editorText.length,
          textHash: hashText(editorText),
          box: editor ? summarizeElement(editor)?.box : null,
        },
        activeElement: summarizeElement(document.activeElement),
        selection: selection ? {
          isCollapsed: selection.isCollapsed,
          anchorOffset: selection.anchorOffset,
          focusOffset: selection.focusOffset,
          rangeCount: selection.rangeCount,
        } : null,
        overlays,
        localStorageKeys,
      }
    })
  } catch (error) {
    return { available: false, reason: 'state-capture-failed', error: sanitizeText(error?.message || error) }
  }
}

export async function pruneAuthoringArtifactRuns({ dryRun = true, excludeRunId = null, now = Date.now() } = {}) {
  const root = await resolveArtifactRoot({ create: !dryRun })
  if (!root.rootReal) return { dryRun, root: root.rootPath, removed: [], kept: [], skipped: [] }

  const candidates = []
  const skipped = []
  for (const entry of await readdir(root.rootReal, { withFileTypes: true })) {
    const entryPath = resolve(root.rootReal, entry.name)
    if (!entry.isDirectory()) {
      skipped.push({ runId: entry.name, reason: 'not-a-directory' })
      continue
    }
    const info = await lstat(entryPath)
    if (info.isSymbolicLink()) {
      skipped.push({ runId: entry.name, reason: 'symlink' })
      continue
    }
    const entryReal = await realpath(entryPath)
    assertScopedPath(root.rootReal, entryReal)
    const manifest = await readJson(resolve(entryReal, 'manifest.json'))
    if (!manifest) {
      skipped.push({ runId: entry.name, reason: 'missing-manifest' })
      continue
    }
    candidates.push({
      runId: entry.name,
      path: entryReal,
      status: manifest.status || 'unknown',
      startedAt: Date.parse(manifest.startedAt || '') || info.mtimeMs,
    })
  }

  candidates.sort((left, right) => right.startedAt - left.startedAt)
  const failedRuns = candidates.filter((entry) => ['failed', 'interrupted'].includes(entry.status))
  const kept = []
  const removed = []
  for (const entry of candidates) {
    if (entry.runId === excludeRunId) {
      kept.push({ runId: entry.runId, reason: 'active-run' })
      continue
    }
    const age = Math.max(0, now - entry.startedAt)
    let shouldRemove = false
    let reason = ''
    if (['failed', 'interrupted'].includes(entry.status)) {
      const failureRank = failedRuns.findIndex((candidate) => candidate.runId === entry.runId)
      const tooOld = age > FAILURE_RETENTION_MS
      const beyondLatest = failureRank >= MAX_FAILURE_RUNS
      shouldRemove = tooOld || beyondLatest
      reason = tooOld
        ? 'failure-older-than-7-days'
        : (beyondLatest ? 'failure-beyond-latest-3' : 'recent-failure')
    } else if (entry.status === 'passed') {
      shouldRemove = true
      reason = 'previous-success-metadata'
    } else if (entry.status === 'running') {
      shouldRemove = age > RUNNING_RETENTION_MS
      reason = shouldRemove ? 'stale-running-run' : 'recent-running-run'
    } else {
      skipped.push({ runId: entry.runId, reason: `unknown-status:${entry.status}` })
      continue
    }

    if (!shouldRemove) {
      kept.push({ runId: entry.runId, reason })
      continue
    }
    removed.push({ runId: entry.runId, reason, dryRun })
    if (!dryRun) await removeScopedPath(root.rootReal, entry.path)
  }
  return { dryRun, root: root.rootReal, removed, kept, skipped }
}

export async function createAuthoringArtifactRun({ baseUrl, selection = null } = {}) {
  const root = await resolveArtifactRoot({ create: true })
  const prune = await pruneAuthoringArtifactRuns({ dryRun: false })
  const runId = `${compactTimestamp()}_${shortGitSha()}_${process.pid}`
  const runDir = resolve(root.rootReal, runId)
  assertScopedPath(root.rootReal, runDir)
  await mkdir(runDir)

  const manifestPath = resolve(runDir, 'manifest.json')
  const manifest = {
    schemaVersion: 1,
    runId,
    status: 'running',
    mode: 'fail-only',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    gitSha: shortGitSha(),
    baseUrl: sanitizeUrl(baseUrl || ''),
    selection: sanitizeDiagnostic(selection),
    processId: process.pid,
    nodeVersion: process.version,
    budgets: { journeyBytes: MAX_JOURNEY_BYTES, runBytes: MAX_RUN_BYTES },
    prune,
    artifacts: [],
    warnings: [],
  }
  await writeBoundedJson(manifestPath, manifest, MAX_MANIFEST_BYTES, {
    schemaVersion: 1,
    runId,
    status: 'running',
    startedAt: manifest.startedAt,
    truncated: true,
  })

  async function captureFailure({ page, journey, failures = [], events = [] }) {
    const id = journeyId(journey)
    const journeyDir = resolve(runDir, id)
    assertScopedPath(root.rootReal, journeyDir)
    await mkdir(journeyDir, { recursive: true })
    const viewport = page && !page.isClosed() ? page.viewportSize() : null
    const viewportName = viewport ? `${viewport.width}x${viewport.height}-dpr1` : 'viewport-unavailable'
    const screenshotName = `${id}__${viewportName}__s99-failure.jpg`
    const screenshotPath = resolve(journeyDir, screenshotName)
    const captureWarnings = []
    let screenshotRetained = false
    try {
      if (!page || page.isClosed()) throw new Error('page unavailable')
      await page.screenshot({
        path: screenshotPath,
        type: 'jpeg',
        quality: 78,
        fullPage: false,
        animations: 'disabled',
        timeout: 12_000,
      })
      screenshotRetained = true
      const screenshotInfo = await stat(screenshotPath)
      if (screenshotInfo.size > MAX_SCREENSHOT_BYTES) {
        await removeScopedPath(root.rootReal, screenshotPath)
        screenshotRetained = false
        captureWarnings.push(`screenshot removed by hard budget: ${screenshotInfo.size}/${MAX_SCREENSHOT_BYTES}`)
        await writeBoundedJson(resolve(journeyDir, `${id}__s99-screenshot-unavailable.json`), {
          reason: 'screenshot-hard-budget-exceeded',
          bytes: screenshotInfo.size,
          maxBytes: MAX_SCREENSHOT_BYTES,
        }, MAX_STATE_BYTES, { reason: 'screenshot-hard-budget-exceeded' })
      }
    } catch (error) {
      screenshotRetained = false
      captureWarnings.push(`screenshot unavailable: ${sanitizeText(error?.message || error)}`)
      await writeBoundedJson(resolve(journeyDir, `${id}__s99-screenshot-unavailable.json`), {
        reason: sanitizeText(error?.message || error),
      }, MAX_STATE_BYTES, { reason: 'screenshot-unavailable' })
    }

    const state = await capturePageState(page)
    const eventLines = [
      { at: new Date().toISOString(), kind: 'journey-failure', journey, failures: sanitizeDiagnostic(failures) },
      ...events.map((event) => sanitizeDiagnostic(event)),
    ]
    const serializedEvents = serializeBoundedJsonLines(eventLines, MAX_EVENT_BYTES)
    if (serializedEvents.dropped) {
      captureWarnings.push(`events truncated by hard budget: dropped ${serializedEvents.dropped}`)
    }
    await writeFile(resolve(journeyDir, 'events.jsonl'), serializedEvents.text)
    const stateWrite = await writeBoundedJson(resolve(journeyDir, 'state.json'), {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      journey,
      failures: sanitizeDiagnostic(failures),
      captureWarnings,
      page: state,
    }, MAX_STATE_BYTES, {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      journey: sanitizeText(journey),
      truncated: true,
      reason: 'state-hard-budget-exceeded',
      failureCount: Array.isArray(failures) ? failures.length : 0,
      captureWarnings: sanitizeDiagnostic(captureWarnings),
      page: { available: false, reason: 'state-hard-budget-exceeded' },
    })
    if (stateWrite.truncated) captureWarnings.push('state truncated by hard budget')

    const budget = await enforceJourneyBudget(journeyDir, root.rootReal, MAX_JOURNEY_BYTES)
    if (budget.hardPruned) {
      screenshotRetained = Boolean(await optionalLstat(screenshotPath))
      captureWarnings.push(`journey evidence pruned by hard budget: ${budget.initialBytes}/${MAX_JOURNEY_BYTES}`)
    }
    return {
      directory: relative(root.projectRoot, journeyDir),
      screenshot: screenshotRetained ? relative(root.projectRoot, screenshotPath) : null,
      bytes: budget.bytes,
      warnings: captureWarnings,
    }
  }

  async function finalize({ report = [], status = 'passed', reason = null } = {}) {
    const normalizedStatus = ['passed', 'failed', 'interrupted'].includes(status) ? status : 'failed'
    if (normalizedStatus === 'passed') {
      for (const entry of await readdir(runDir, { withFileTypes: true })) {
        if (entry.isDirectory()) await removeScopedPath(root.rootReal, resolve(runDir, entry.name))
      }
    }

    const reportPayload = {
      schemaVersion: 1,
      runId,
      status: normalizedStatus,
      generatedAt: new Date().toISOString(),
      reason: reason ? sanitizeText(reason) : null,
      entries: sanitizeDiagnostic(report),
    }
    const reportWrite = await writeBoundedJson(resolve(runDir, 'report.json'), reportPayload, MAX_REPORT_BYTES, {
      schemaVersion: 1,
      runId,
      status: normalizedStatus,
      generatedAt: reportPayload.generatedAt,
      truncated: true,
      reason: 'report-hard-budget-exceeded',
      entryCount: Array.isArray(report) ? report.length : 0,
      fatalCount: (Array.isArray(report) ? report : []).filter((entry) => (
        ['FAIL', 'HARNESS-ERROR', 'HARNESS-TIMEOUT', 'TIMEOUT', 'PAGEERROR', 'CONSOLE-ERROR', 'HTTP-ERROR']
          .includes(entry?.level)
      )).length,
    })
    if (reportWrite.truncated) manifest.warnings.push('report truncated by hard budget')
    const runBudget = await enforceRunBudget(
      runDir,
      root.rootReal,
      MAX_RUN_BYTES - MAX_MANIFEST_BYTES,
    )
    if (runBudget.removed.length) {
      manifest.warnings.push(`run evidence hard-pruned: ${runBudget.removed.length} paths`)
    }
    let files = await listArtifactFiles(runDir, root.rootReal)
    let totalBytes = files.reduce((sum, file) => sum + file.bytes, 0)
    manifest.status = normalizedStatus
    manifest.finishedAt = new Date().toISOString()
    manifest.reason = reason ? sanitizeText(reason) : null
    manifest.artifacts = files
    manifest.totalBytes = totalBytes
    await writeBoundedJson(manifestPath, manifest, MAX_MANIFEST_BYTES, {
      schemaVersion: 1,
      runId,
      status: normalizedStatus,
      startedAt: manifest.startedAt,
      finishedAt: manifest.finishedAt,
      totalBytes,
      truncated: true,
      warnings: sanitizeDiagnostic(manifest.warnings),
    })
    manifest.pruneAfter = await pruneAuthoringArtifactRuns({ dryRun: false, excludeRunId: runId })
    await writeBoundedJson(manifestPath, manifest, MAX_MANIFEST_BYTES, {
      schemaVersion: 1,
      runId,
      status: normalizedStatus,
      startedAt: manifest.startedAt,
      finishedAt: manifest.finishedAt,
      totalBytes,
      truncated: true,
      warnings: sanitizeDiagnostic(manifest.warnings),
    })
    files = await listArtifactFiles(runDir, root.rootReal)
    totalBytes = files.reduce((sum, file) => sum + file.bytes, 0)
    if (totalBytes > MAX_RUN_BYTES) {
      throw new Error(`Authoring run artifact hard budget exceeded: ${totalBytes}/${MAX_RUN_BYTES}`)
    }
    return { runId, runDir, status: normalizedStatus, totalBytes, artifacts: files }
  }

  return {
    runId,
    runDir,
    rootDir: root.rootReal,
    captureFailure,
    finalize,
  }
}
