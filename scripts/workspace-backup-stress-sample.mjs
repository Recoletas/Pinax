#!/usr/bin/env node
/**
 * C8 · 固定体量的备份压力样本（真实写入浏览器 IndexedDB/localStorage 后走生产 API）。
 *
 * 体量：来源归档 ≈64MB（128 个 512KB 文本 chunk）+ 20MB 媒体 Blob + 100 章书稿 + 20 世界书条目。
 * 流程：播种 → 生产 API 导出 ZIP → 清空 → 恢复 → 刷新核对。
 * 记录：ZIP 大小、导出/检查/恢复耗时、各域计数、核对结果；不提交任何大产物。
 *
 * 环境变量：STRESS_FRONTEND_PORT(默认5231) STRESS_BACKEND_PORT(默认30231) STRESS_OUT_DIR
 */
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import net from 'node:net'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const FRONT_PORT = Number(process.env.STRESS_FRONTEND_PORT || 5231)
const BACK_PORT = Number(process.env.STRESS_BACKEND_PORT || 30231)
const OUT_DIR = resolve(process.env.STRESS_OUT_DIR || join(root, 'tmp', 'workspace-stress'))
const BASE_URL = `http://127.0.0.1:${FRONT_PORT}`
const nodeBin = process.execPath

const children = []

function log(message) {
  console.log(`[stress-sample] ${message}`)
}

async function waitUntil(fn, label, timeoutMs = 60_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await fn()) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`ready 超时：${label}`)
}

function probePort(port) {
  return new Promise((resolveProbe) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const done = (v) => { socket.destroy(); resolveProbe(v) }
    socket.setTimeout(500)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

async function httpReachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
    return response.status < 600
  } catch {
    return false
  }
}

function startProcess(name, command, args, env) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  })
  children.push({ name, child })
  child.stdout.on('data', (d) => process.stdout.write(`[${name}] ${d}`))
  child.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`))
  log(`${name} started pid=${child.pid}`)
}

async function stopAll() {
  for (const { name, child } of children.reverse()) {
    if (child.exitCode !== null) continue
    try { process.kill(-child.pid, 'SIGTERM') } catch { /* 已退出 */ }
    const exited = new Promise((r) => child.once('exit', r))
    await Promise.race([exited, new Promise((r) => setTimeout(r, 1500))])
    try { if (child.exitCode === null) process.kill(-child.pid, 'SIGKILL') } catch { /* 同上 */ }
  }
  log('servers stopped')
}

async function main() {
  for (const port of [FRONT_PORT, BACK_PORT]) {
    if (await probePort(port)) throw new Error(`端口 ${port} 已被占用`)
  }
  await mkdir(OUT_DIR, { recursive: true })

  startProcess('server', nodeBin, ['server/index.js'], { PORT: String(BACK_PORT) })
  startProcess('vite', nodeBin, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(FRONT_PORT), '--strictPort'], {
    PINAX_DEV_BACKEND_ORIGIN: `http://127.0.0.1:${BACK_PORT}`
  })
  await waitUntil(() => httpReachable(BASE_URL), `frontend :${FRONT_PORT}`, 240_000)

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto(`${BASE_URL}/materials`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)

  log('播种 100 章书稿 + 20 世界书条目 + 64MB 来源归档 + 20MB 媒体')
  const seedStats = await page.evaluate(async () => {
    const now = Date.now()
    const chapter = (i) => ({
      id: `ch-${i}`, title: `第${i}章 压力校验`,
      content: `<p>${`第${i}章正文。`.repeat(120)}</p>`, sceneAnchors: []
    })
    const chapters = Array.from({ length: 100 }, (_, i) => chapter(i + 1))
    localStorage.setItem('writing_books', JSON.stringify([{
      id: 'bk-stress', title: '压力样本', worldbookId: 'wb-stress',
      createdAt: now, updatedAt: now, chapters
    }]))
    const entries = Array.from({ length: 20 }, (_, i) => ({
      id: `we-${i}`, title: `条目${i}`, type: '地点', content: `压力条目内容 ${i}。`.repeat(50)
    }))
    localStorage.setItem('worldbook_wb-stress', JSON.stringify({ id: 'wb-stress', name: '压力世界书', entries }))

    // 来源归档：128 个 chunk × 512KB 文本 ≈ 64MB
    // '压' UTF-8 占 3 字节：174000 字符 ≈ 522KB/块 × 128 块 ≈ 63MB，落在 64MB 上限附近而不超
    const bigChunk = '压'.repeat(170000)
    const CHUNK_TOTAL = 128
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('pinax-source-archive', 1)
      request.onupgradeneeded = () => {
        const db = request.result
        for (const storeName of ['artifacts', 'chunks', 'workspaces']) {
          if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction(['artifacts', 'chunks', 'workspaces'], 'readwrite')
        tx.objectStore('artifacts').put({
          id: 'sa-stress', schemaVersion: 1, title: '压力来源',
          contentHash: 'stress-hash', chunkIds: Array.from({ length: CHUNK_TOTAL }, (_, i) => `sc-${i}`)
        })
        for (let i = 0; i < CHUNK_TOTAL; i += 1) {
          tx.objectStore('chunks').put({ id: `sc-${i}`, schemaVersion: 1, artifactId: 'sa-stress', text: bigChunk })
        }
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => { db.close(); reject(tx.error) }
      }
      request.onerror = () => reject(request.error)
    })

    // 媒体：20MB Blob（PNG 头 + 伪随机体）
    const header = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))
    const body = new Uint8Array(20 * 1024 * 1024)
    for (let offset = 0; offset < body.length; offset += 65536) {
      crypto.getRandomValues(body.subarray(offset, Math.min(offset + 65536, body.length)))
    }
    body.set(header, 0)
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('pinax-media')
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets')
      }
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction(['assets'], 'readwrite')
        tx.objectStore('assets').put(new Blob([body], { type: 'image/png' }), 'media-stress')
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => { db.close(); reject(tx.error) }
      }
      request.onerror = () => reject(request.error)
    })
    localStorage.setItem('media_assets_v1', JSON.stringify([{
      id: 'media-stress', schemaVersion: 1, kind: 'image', purpose: 'illustration',
      mimeType: 'image/png', storageRef: 'pinax-media://media-stress', title: '压力图',
      width: 4096, height: 4096, createdAt: now, updatedAt: now
    }]))
    return { chapters: chapters.length, entries: entries.length, seededMs: Date.now() - now }
  })
  log(`播种完成：${JSON.stringify(seedStats)}`)

  const result = await page.evaluate(async () => {
    const mod = await import('/src/services/storage/workspaceBackupBundle.js')
    const stats = { }
    let t0 = performance.now()
    const bundle = await mod.buildWorkspaceBackupBundle({ storage: localStorage })
    stats.exportMs = Math.round(performance.now() - t0)
    stats.zipBytes = bundle.bytes.length
    stats.manifest = {
      sourceChunkCount: bundle.manifest.domains.sourceArchive.chunkCount,
      mediaBinaryCount: bundle.manifest.domains.media.binaryCount,
      localStorageKeys: bundle.manifest.domains.localStorage.keyCount
    }
    // 清空
    localStorage.clear()
    for (const [name, version, stores, keyPath] of [
      ['pinax-source-archive', 1, ['artifacts', 'chunks', 'workspaces'], 'id'],
      ['pinax-media', 1, ['assets'], undefined]
    ]) {
      await new Promise((resolve, reject) => {
        const request = indexedDB.open(name, version)
        request.onupgradeneeded = () => {
          const db = request.result
          for (const storeName of stores) {
            if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath })
          }
        }
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction(stores, 'readwrite')
          for (const storeName of stores) tx.objectStore(storeName).clear()
          tx.oncomplete = () => { db.close(); resolve() }
          tx.onerror = () => { db.close(); reject(tx.error) }
        }
        request.onerror = () => reject(request.error)
      })
    }
    // 检查 + 恢复
    t0 = performance.now()
    const inspection = await mod.inspectWorkspaceBackup(bundle.bytes, { storage: localStorage })
    stats.inspectMs = Math.round(performance.now() - t0)
    stats.inspectValid = inspection.valid
    stats.inspectCounts = inspection.counts
    t0 = performance.now()
    const restored = await mod.restoreWorkspaceBackupBundle(bundle.bytes, {
      storage: localStorage, acceptRestoreRisk: true
    })
    stats.restoreMs = Math.round(performance.now() - t0)
    stats.restoreSuccess = restored.success
    stats.restoreDomains = restored.domains
      ? Object.fromEntries(Object.entries(restored.domains).map(([k, d]) => [k, { ok: d.ok, written: d.written }]))
      : null
    return stats
  })
  log(`导出/检查/恢复：${JSON.stringify(result)}`)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)

  log('刷新核对：章节数/世界书/来源 chunk 数/媒体字节')
  const verify = await page.evaluate(async () => {
    const books = JSON.parse(localStorage.getItem('writing_books') || '[]')
    const worldbook = JSON.parse(localStorage.getItem('worldbook_wb-stress') || 'null')
    const mediaMetadata = JSON.parse(localStorage.getItem('media_assets_v1') || '[]')
    const chunkCount = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pinax-source-archive', 1)
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction(['chunks'], 'readonly')
        const read = tx.objectStore('chunks').count()
        read.onsuccess = () => { db.close(); resolve(read.result) }
        read.onerror = () => { db.close(); reject(read.error) }
      }
      request.onerror = () => reject(request.error)
    })
    const mediaBlob = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pinax-media')
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction(['assets'], 'readonly')
        const read = tx.objectStore('assets').get('media-stress')
        read.onsuccess = () => { db.close(); resolve(read.result) }
        read.onerror = () => { db.close(); reject(read.error) }
      }
      request.onerror = () => reject(request.error)
    })
    return {
      chapterCount: (books[0]?.chapters || []).length,
      worldbookEntries: (worldbook?.entries || []).length,
      sourceChunkCount: chunkCount,
      mediaByteSize: mediaBlob ? mediaBlob.size : 0
    }
  })
  log(`核对结果：${JSON.stringify(verify)}`)

  const failures = []
  if (!result.inspectValid) failures.push('inspect 不通过')
  if (!result.restoreSuccess) failures.push('恢复未成功')
  if (verify.chapterCount !== 100) failures.push(`章节数 ${verify.chapterCount} ≠ 100`)
  if (verify.worldbookEntries !== 20) failures.push(`世界书条目 ${verify.worldbookEntries} ≠ 20`)
  if (verify.sourceChunkCount !== 128) failures.push(`来源 chunk ${verify.sourceChunkCount} ≠ 128`)
  if (verify.mediaByteSize !== 20 * 1024 * 1024) failures.push(`媒体字节 ${verify.mediaByteSize} ≠ ${20 * 1024 * 1024}`)

  const stats = {
    generatedAt: new Date().toISOString(),
    seed: seedStats,
    exportMs: result.exportMs,
    zipBytes: result.zipBytes,
    zipMB: Number((result.zipBytes / 1024 / 1024).toFixed(2)),
    inspectMs: result.inspectMs,
    restoreMs: result.restoreMs,
    manifest: result.manifest,
    inspectCounts: result.inspectCounts,
    verify,
    failures,
    browser: 'chromium (playwright)'
  }
  await writeFile(join(OUT_DIR, 'stress-stats.json'), JSON.stringify(stats, null, 2))
  if (failures.length > 0) {
    console.error(`[stress-sample] FAIL: ${failures.join('; ')}`)
    process.exitCode = 1
  } else {
    log(`PASS：ZIP ${stats.zipMB}MB，导出 ${stats.exportMs}ms，检查 ${stats.inspectMs}ms，恢复 ${stats.restoreMs}ms`)
  }

  await browser.close()
}

try {
  await main()
} finally {
  await stopAll()
}
