#!/usr/bin/env node
/**
 * C6 · 完整工作区备份生产浏览器 Gate。
 *
 * 真实 Chromium 内完成：播种书稿/人物/世界书/来源归档/媒体二进制 → 设置页导出 ZIP
 * → 记录原 ID → 清空 Pinax 数据 → 导入 ZIP 预览 → 确认恢复 → 刷新核对 → 幂等二次恢复
 * → 注入 IndexedDB 写失败验证恢复失败时旧数据不被半覆盖。
 *
 * 自起本 job 的前后端进程；网络守卫拦截一切外发请求；结束清理自己启动的进程。
 * 环境变量：BACKUP_CHECK_FRONTEND_PORT(默认5230) BACKUP_CHECK_BACKEND_PORT(默认30230)
 *           BACKUP_CHECK_OUT_DIR(默认 tmp/workspace-backup-check)
 */
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import net from 'node:net'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { chromium } from 'playwright'
import JSZip from 'jszip'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FRONT_PORT = Number(process.env.BACKUP_CHECK_FRONTEND_PORT || 5230)
const BACK_PORT = Number(process.env.BACKUP_CHECK_BACKEND_PORT || 30230)
const OUT_DIR = resolve(process.env.BACKUP_CHECK_OUT_DIR || join(root, 'tmp', 'workspace-backup-check'))
const BASE_URL = `http://127.0.0.1:${FRONT_PORT}`
const nodeBin = process.execPath

const children = []
const processDiagnostics = []
let failed = false

function log(message) {
  console.log(`[workspace-backup-check] ${message}`)
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
  const record = (stream, data) => {
    processDiagnostics.push(`[${name}:${stream}] ${data}`)
    if (processDiagnostics.length > 200) processDiagnostics.shift()
    process[stream].write(`[${name}] ${data}`)
  }
  child.stdout.on('data', (d) => record('stdout', d))
  child.stderr.on('data', (d) => record('stderr', d))
  child.on('error', (error) => processDiagnostics.push(`[${name}:error] ${error.message}`))
  log(`${name} started pid=${child.pid}`)
}

async function stopAll() {
  for (const { name, child } of children.reverse()) {
    if (child.exitCode !== null) continue
    try { process.kill(-child.pid, 'SIGTERM') } catch { /* 已退出 */ }
    const exited = new Promise((r) => child.once('exit', r))
    await Promise.race([exited, new Promise((r) => setTimeout(r, 1500))])
    try { if (child.exitCode === null) process.kill(-child.pid, 'SIGKILL') } catch { /* 同上 */ }
    log(`stopped ${name}`)
  }
}

async function seedWorkspaceData(page) {
  // 两章书稿 + 人物/地点 + 世界书（localStorage 合同键）
  await page.evaluate(() => {
    const books = [{
      id: 'bk-alpha-1',
      title: '备份核验书',
      manuscriptLanguage: 'mixed',
      worldbookId: 'wb-alpha-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chapters: [
        { id: 'ch-1', title: '第一章 雾港', content: '<p>雾港的钟声在凌晨响起。</p>', sceneAnchors: [] },
        { id: 'ch-2', title: '第二章 灯塔', content: '<p>灯塔看守人记录下最后一批船。</p>', sceneAnchors: [] }
      ]
    }]
    localStorage.setItem('writing_books', JSON.stringify(books))
    localStorage.setItem('writing_characters', JSON.stringify([
      { id: 'char-1', name: '守塔人', role: '主角', projectId: null }
    ]))
    localStorage.setItem('writing_time', JSON.stringify({ era: '蒸汽时代', projectId: null }))
    localStorage.setItem('worldbook_wb-alpha-1', JSON.stringify({
      id: 'wb-alpha-1', name: '核验世界书', entries: [
        { id: 'we-1', title: '雾港', type: '地点', content: '北方港口城市。' }
      ]
    }))
    localStorage.setItem('active_worldbook_id', 'wb-alpha-1')
  })

  // 来源归档（pinax-source-archive：artifacts/chunks/workspaces，keyPath id）
  await page.evaluate(async () => {
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
          id: 'sa-alpha-1', schemaVersion: 1, title: '雾港设定集',
          contentHash: 'alpha-hash-1', chunkIds: ['sc-alpha-1']
        })
        tx.objectStore('chunks').put({
          id: 'sc-alpha-1', schemaVersion: 1, artifactId: 'sa-alpha-1',
          text: '雾港设定来源正文：钟楼建于三百年前。'
        })
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => { db.close(); reject(tx.error) }
      }
      request.onerror = () => reject(request.error)
    })
  })

  // 媒体：真实 1x1 PNG Blob 写入 pinax-media/assets + 元数据进 localStorage
  const PNG_1PX_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  await page.evaluate(async (base64) => {
    const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const blob = new Blob([binary], { type: 'image/png' })
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('pinax-media')
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets')
      }
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction(['assets'], 'readwrite')
        tx.objectStore('assets').put(blob, 'media-alpha-1')
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => { db.close(); reject(tx.error) }
      }
      request.onerror = () => reject(request.error)
    })
    const assets = JSON.parse(localStorage.getItem('media_assets_v1') || '[]')
    assets.push({
      id: 'media-alpha-1',
      schemaVersion: 1,
      kind: 'image',
      purpose: 'illustration',
      mimeType: 'image/png',
      storageRef: 'pinax-media://media-alpha-1',
      title: '核验图',
      width: 1,
      height: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    localStorage.setItem('media_assets_v1', JSON.stringify(assets))
  }, PNG_1PX_BASE64)
}

async function openSettingsBackup(page) {
  await page.getByRole('button', { name: '打开工作区导航', exact: true }).click()
  await page.getByRole('dialog', { name: '工作区导航', exact: true }).getByRole('button', { name: '备份与恢复', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置' })
  await settings.locator('[data-test="backup-export-workspace-button"]').waitFor({ timeout: 30_000 })
  return settings
}

async function clearAllPinaxData(page) {
  // 用 store.clear() 代替 deleteDatabase：应用残存连接会阻塞删库（onblocked 竞态），
  // 而“清空各 store 内容”对恢复校验语义等价且无连接竞态。
  await page.evaluate(async () => {
    localStorage.clear()
    const targets = [
      ['pinax-source-archive', 1, ['artifacts', 'chunks', 'workspaces'], 'id'],
      ['pinax-media', 1, ['assets'], undefined]
    ]
    for (const [name, version, stores, keyPath] of targets) {
      await new Promise((resolve) => {
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
          tx.onerror = () => { db.close(); resolve() }
          tx.onabort = () => { db.close(); resolve() }
        }
        request.onerror = () => resolve()
      })
    }
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
}

async function readPersistedState(page) {
  return page.evaluate(async () => {
    const books = JSON.parse(localStorage.getItem('writing_books') || '[]')
    const worldbook = JSON.parse(localStorage.getItem('worldbook_wb-alpha-1') || 'null')
    const mediaMetadata = JSON.parse(localStorage.getItem('media_assets_v1') || '[]')
    const sourceArtifact = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pinax-source-archive', 1)
      request.onsuccess = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('artifacts')) { db.close(); resolve(null) }
        else {
          const tx = db.transaction(['artifacts'], 'readonly')
          const read = tx.objectStore('artifacts').get('sa-alpha-1')
          read.onsuccess = () => { db.close(); resolve(read.result) }
          read.onerror = () => { db.close(); reject(read.error) }
        }
      }
      request.onerror = () => reject(request.error)
    })
    const mediaBlob = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pinax-media')
      request.onsuccess = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('assets')) { db.close(); resolve(null) }
        else {
          const tx = db.transaction(['assets'], 'readonly')
          const read = tx.objectStore('assets').get('media-alpha-1')
          read.onsuccess = () => { db.close(); resolve(read.result) }
          read.onerror = () => { db.close(); reject(read.error) }
        }
      }
      request.onerror = () => reject(request.error)
    })
    return {
      bookId: books[0]?.id || null,
      manuscriptLanguage: books[0]?.manuscriptLanguage,
      chapterTitles: (books[0]?.chapters || []).map((c) => c.title),
      characterCount: (JSON.parse(localStorage.getItem('writing_characters') || '[]')).length,
      worldbookPresent: Boolean(worldbook),
      artifactId: sourceArtifact?.id || null,
      mediaId: mediaMetadata[0]?.id || null,
      mediaByteSize: mediaBlob ? mediaBlob.size : 0
    }
  })
}

async function runCheck(page) {
  log('step 1: 播种书稿/人物/世界书/来源归档/媒体二进制')
  await seedWorkspaceData(page)
  await page.reload({ waitUntil: 'domcontentloaded' })

  log('step 2: 设置页导出完整工作区 ZIP（真实下载捕获）')
  const settings = await openSettingsBackup(page)
  const downloadPromise = page.waitForEvent('download')
  await settings.locator('[data-test="backup-export-workspace-button"]').click()
  const download = await downloadPromise
  const zipPath = join(OUT_DIR, 'captured-workspace-backup.zip')
  await download.saveAs(zipPath)
  const feedback = page.locator('[data-test="backup-feedback"]')
  await feedback.filter({ hasText: '完整工作区已导出' }).waitFor({ timeout: 30_000 })
  if ((await feedback.textContent()).includes('缺少')) {
    throw new Error('导出反馈提示缺失媒体，播种应完整')
  }
  log(`step 2: ZIP 已捕获 → ${zipPath}`)

  log('step 3: 记录恢复前的原始 ID 与内容')
  const before = await readPersistedState(page)
  if (!before.bookId || before.chapterTitles.length !== 2 || !before.artifactId || before.mediaByteSize === 0) {
    throw new Error(`step 3 失败：播种不完整 ${JSON.stringify(before)}`)
  }
  log(`step 3: book=${before.bookId} chapters=${before.chapterTitles.length} artifact=${before.artifactId} media=${before.mediaByteSize}B`)
  await checkReviewedShelf(page, zipPath)

  log('step 4: 清空 Pinax 全部数据并确认空')
  await clearAllPinaxData(page)
  const emptied = await readPersistedState(page)
  if (emptied.bookId !== null || emptied.artifactId !== null || emptied.mediaByteSize !== 0) {
    throw new Error(`step 4 失败：清空后仍有数据 ${JSON.stringify(emptied)}`)
  }

  log('step 5: 导入 ZIP → 预览（新增计数与缺失=0）→ 确认恢复')
  const settingsAfterClear = await openSettingsBackup(page)
  await settingsAfterClear.locator('[data-test="backup-import-button"]').click()
  const fileInput = page.locator('[data-test="backup-import-input"]')
  await fileInput.setInputFiles(zipPath)
  const review = page.locator('[data-test="workspace-backup-review"]')
  await review.waitFor({ timeout: 30_000 }).catch(async () => {
    const feedbackText = await page.locator('[data-test="backup-feedback"]').textContent().catch(() => '(无)')
    console.log('[workspace-backup-check] review 未出现，feedback =', feedbackText.trim().slice(0, 200))
    throw new Error('workspace review 未出现')
  })
  await settingsAfterClear.locator('[data-test="workspace-backup-restore-confirm"]').click()
  // 产品在持久化确认后自动刷新页面
  await page.waitForURL(`${BASE_URL}/`, { timeout: 30_000 }).catch(async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
  })
  await page.waitForTimeout(1500)

  log('step 6: 刷新后核对书稿/人物/世界书/来源/媒体')
  const afterRestore = await readPersistedState(page)
  if (afterRestore.bookId !== before.bookId) throw new Error('step 6 失败：书稿未恢复')
  if (JSON.stringify(afterRestore.chapterTitles) !== JSON.stringify(before.chapterTitles)) {
    throw new Error('step 6 失败：章节标题不一致')
  }
  if (afterRestore.characterCount < 1) throw new Error('step 6 失败：人物未恢复')
  if (!afterRestore.worldbookPresent) throw new Error('step 6 失败：世界书未恢复')
  if (afterRestore.artifactId !== before.artifactId) throw new Error('step 6 失败：来源归档未恢复')
  if (afterRestore.mediaId !== before.mediaId || afterRestore.mediaByteSize !== before.mediaByteSize) {
    throw new Error('step 6 失败：媒体未恢复或字节不一致')
  }
  await page.screenshot({ path: join(OUT_DIR, 'after-restore.png'), fullPage: false })

  log('step 7: 幂等——同一 ZIP 再次恢复，全部 skip')
  const settingsForIdempotent = await openSettingsBackup(page)
  await settingsForIdempotent.locator('[data-test="backup-import-button"]').click()
  await fileInput.setInputFiles(zipPath)
  await review.waitFor({ timeout: 30_000 })
  const idempotentText = await review.textContent()
  if (!idempotentText.includes('新增 0 项')) throw new Error(`step 7 失败：二次恢复仍显示新增（${idempotentText.slice(0, 80)}）`)
  await settingsForIdempotent.locator('[data-test="workspace-backup-restore-confirm"]').click()
  await page.waitForTimeout(2000)
  const afterIdempotent = await readPersistedState(page)
  if (afterIdempotent.mediaByteSize !== before.mediaByteSize) throw new Error('step 7 失败：幂等恢复改变了媒体')
  log('step 7: 幂等恢复通过（新增 0 项，无重复对象）')

  log('step 8: 注入 IndexedDB 写失败 → 恢复失败且旧数据不被半覆盖')
  await page.evaluate(async () => {
    const source = await import('/src/services/worldbook/worldbookSourceArchive.js')
    const { artifacts } = await source.loadAllSourceArchiveRecords()
    await source.restoreSourceArchiveRecords({ artifacts: [{ ...artifacts[0], title: '稍后修订的来源' }] })
    // 只让第一次来源归档写失败（典型瞬时配额/锁冲突），随后恢复原实现——
    // 验证“失败 + 补偿回滚成功”路径：旧数据必须完整保留。
    const originalPut = IDBObjectStore.prototype.put
    window.__origIdbPut = originalPut
    let injected = true
    IDBObjectStore.prototype.put = function (value, key) {
      if (injected && this.transaction?.db?.name === 'pinax-source-archive' && this.transaction.mode === 'readwrite') {
        injected = false
        throw new Error('注入的来源归档写失败（一次）')
      }
      return originalPut.call(this, value, key)
    }
  })
  const settingsForFailure = await openSettingsBackup(page)
  await settingsForFailure.locator('[data-test="backup-import-button"]').click()
  await fileInput.setInputFiles(zipPath)
  await review.waitFor({ timeout: 30_000 })
  const confirmFailure = settingsForFailure.locator('[data-test="workspace-backup-restore-confirm"]')
  if (!await confirmFailure.isDisabled()) throw new Error('已有归档冲突应先确认覆盖')
  await review.getByRole('checkbox').check()
  await confirmFailure.click()
  const failureFeedback = page.locator('[data-test="backup-feedback"]')
  await failureFeedback.filter({ hasText: '恢复未完成' }).waitFor({ timeout: 30_000 })
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = window.__origIdbPut
  })
  const afterFailure = await readPersistedState(page)
  if (afterFailure.bookId !== before.bookId || afterFailure.artifactId !== before.artifactId
    || afterFailure.mediaByteSize !== before.mediaByteSize) {
    throw new Error('step 8 失败：旧数据被半覆盖 ' + JSON.stringify({ before, afterFailure }))
  }

  log('step 8: 恢复失败被拦截，旧数据完整（书稿/来源/媒体均在）')

  await page.screenshot({ path: join(OUT_DIR, 'backup-check-final.png'), fullPage: false })
  log('journey complete')
}

// Two real tabs queue an incremental chapter edit immediately before the
// reviewed restore. The root key and overwrite counts stay identical.
async function checkReviewedShelf(page, zipPath) {
  const writer = await page.context().newPage()
  try {
    await writer.goto(BASE_URL)
    const original = await writer.evaluate(() => localStorage.getItem('writing_books'))
    const json = { app: 'Pinax', version: 2, keys: { writing_books: original } }
    for (const format of ['json', 'zip']) {
      await writer.evaluate(async ({ original, format }) => {
        const { readStoredText } = await import('/src/services/storage/writingStorageCodec.js')
        const { persistWritingChapterChange, normalizeWritingBook } = await import('/src/services/writing/writingBooksRepository.js')
        const { withWritingBooksLock } = await import('/src/services/storage/writingBooksLock.js')
        const media = await import('/src/services/media/mediaAssetStore.js')
        if (format === 'zip') await media.deleteMediaBinaryById('media-alpha-1')
        window.hasTestMedia = async () => Boolean(await media.getMediaBinaryById('media-alpha-1'))
        const books = JSON.parse(original).map(normalizeWritingBook)
        books[0].chapters.push({ id: 'large-test', title: '长篇夹具', content: '墨'.repeat(540000) })
        localStorage.setItem('writing_books', JSON.stringify(books))
        window.editTestBook = title => withWritingBooksLock(() => {
          const book = JSON.parse(readStoredText(localStorage, 'writing_books'))[0]
          const chapter = book.chapters[0]
          if (!persistWritingChapterChange({ bookId: book.id, original: chapter, chapter: { ...chapter, title }, updatedAt: title })) {
            throw Error('expected an incremental chapter commit')
          }
        })
        await window.editTestBook('预览时的稿件')
        window.testHeader = localStorage.getItem('writing_books')
      }, { original, format })
      const input = page.locator('[data-test="backup-import-input"]')
      await input.setInputFiles(format === 'zip' ? zipPath : { name: 'review.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) })
      const panel = page.locator(`[data-test="${format === 'zip' ? 'workspace-backup-review' : 'backup-review'}"]`)
      await panel.waitFor()
      const consent = panel.getByRole('checkbox')
      if (await consent.count()) await consent.check()
      const confirm = panel.locator('[data-test$="restore-confirm"]')
      await writer.evaluate(() => new Promise(ready => {
        void navigator.locks.request('pinax-writing-books-save', () => new Promise(release => { window.releaseTestLock = release; ready() }))
      }))
      await writer.evaluate(() => { window.queuedTestWrite = window.editTestBook('其他标签刚保存的修订') })
      await confirm.click()
      await writer.waitForFunction(async () => (await navigator.locks.query()).pending.filter(lock => lock.name === 'pinax-writing-books-save').length >= 2)
      if (format === 'zip') await writer.waitForFunction(() => window.hasTestMedia())
      await writer.evaluate(async () => { window.releaseTestLock(); await window.queuedTestWrite })
      await page.locator('[data-test="backup-feedback"]').filter({ hasText: '预览后本机数据有改动' }).waitFor()
      const retained = await writer.evaluate(async () => {
        const { readStoredText } = await import('/src/services/storage/writingStorageCodec.js')
        return localStorage.getItem('writing_books') === window.testHeader && JSON.parse(readStoredText(localStorage, 'writing_books'))[0].chapters[0].title === '其他标签刚保存的修订'
      })
      assert.ok(retained, 'a stale confirmation overwrote the concurrent chapter')
      if (format === 'zip') assert.equal(await writer.evaluate(() => window.hasTestMedia()), false, 'late conflict must compensate the binary write')
      if (await consent.count()) { assert.equal(await consent.isChecked(), false); await consent.check() }
      await confirm.click()
      await writer.waitForFunction(original => localStorage.getItem('writing_books') === original, original)
      await panel.waitFor({ state: 'detached' })
      if (format === 'zip') await page.waitForFunction(() => !document.querySelector('[data-test="backup-feedback"]')?.textContent.includes('完整工作区已恢复'))
      log(`${format} reviewed restore: stale confirmation refused, new preview confirmed`)
    }
  } finally { await writer.close() }
}

async function checkSparseRestore(browser, zipPath) {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.route('**/__backup_fixture__', route => route.fulfill({ contentType: 'text/html', body: '<title>ZIP fixture</title>' }))
    await page.goto(BASE_URL + '/__backup_fixture__')
    const observations = await page.evaluate(async () => {
      const backup = await import('/src/services/storage/workspaceBackupBundle.js')
      const archive = await import('/src/services/worldbook/worldbookSourceArchive.js')
      const { createIndexedDbBinaryStore } = await import('/src/services/media/browserMediaBinaryStore.js')
      const media = createIndexedDbBinaryStore()
      const assets = Array.from({ length: 40 }, (_, i) => ({ id: 'sparse-' + i, schemaVersion: 1, mimeType: 'image/png', storageRef: 'sparse-' + i }))
      localStorage.setItem('media_assets_v1', JSON.stringify(assets))
      await Promise.all(assets.map((asset, i) => media.put(asset.id, new Blob([Uint8Array.of(i)], { type: asset.mimeType }))))
      await archive.restoreSourceArchiveRecords({ chunks: [{ id: 'included', text: '归档内容' }] })

      const original = { open: IDBFactory.prototype.open, getAll: IDBObjectStore.prototype.getAll, get: IDBObjectStore.prototype.get }
      const empty = () => ({ mediaOpens: 0, scans: 0, sourcePointReads: 0 })
      let calls = empty()
      IDBFactory.prototype.open = function (name, ...args) {
        if (name === 'pinax-media') calls.mediaOpens++
        return original.open.call(this, name, ...args)
      }
      for (const op of ['getAll', 'get']) {
        IDBObjectStore.prototype[op] = function (...args) {
          if (this.transaction.db.name === 'pinax-source-archive') calls[op === 'getAll' ? 'scans' : 'sourcePointReads']++
          return original[op].apply(this, args)
        }
      }
      try {
        const zip = await backup.buildWorkspaceBackupBundle()
        const exportMediaOpens = calls.mediaOpens
        await archive.restoreSourceArchiveRecords({ chunks: Array.from({ length: 1200 }, (_, i) => ({ id: 'other-' + i, text: '另一部书的资料' })) })
        calls = empty()
        const inspected = await backup.inspectWorkspaceBackup(zip.bytes)
        const previewCalls = calls
        calls = empty()
        const restored = await backup.restoreWorkspaceBackupBundle(zip.bytes, { expectedReviewRevision: inspected.reviewRevision })
        const restoreCalls = calls
        calls = empty()
        const all = [{ id: 'included' }, ...Array.from({ length: 1200 }, (_, i) => ({ id: 'other-' + i }))]
        const dense = await archive.readSourceArchiveRestoreMatches({ chunks: all })
        const denseCalls = { ...calls }
        IDBObjectStore.prototype.getAll = function (...args) {
          const request = original.getAll.apply(this, args)
          if (this.transaction.db.name === 'pinax-source-archive') this.transaction.abort()
          return request
        }
        let readAborted = false
        try { await archive.readSourceArchiveRestoreMatches({ chunks: all }) }
        catch { readAborted = true }
        const [kept] = await archive.loadSourceChunks(['included'])
        return { exportMediaOpens, previewCalls, restoreCalls, restored: restored.success, skippedMedia: inspected.media.skip.length,
          denseCalls, matched: dense.chunks.size, readAborted, kept: kept?.text }
      } finally {
        IDBFactory.prototype.open = original.open
        IDBObjectStore.prototype.getAll = original.getAll
        IDBObjectStore.prototype.get = original.get
      }
    })
    const sparse = { mediaOpens: 1, scans: 0, sourcePointReads: 1 }
    assert.deepEqual(observations, { exportMediaOpens: 1, previewCalls: sparse, restoreCalls: sparse, restored: true, skippedMedia: 40,
      denseCalls: { mediaOpens: 0, scans: 1, sourcePointReads: 0 }, matched: 1201, readAborted: true, kept: '归档内容' })
    log('40 media binaries used one read transaction; matching ZIP read just its one source row out of 1,201 in preview and restore')

    const corruptZip = await JSZip.loadAsync(await readFile(zipPath))
    const manifest = JSON.parse(await corruptZip.file('manifest.json').async('string'))
    // No metadata refers to this optional entry. Its declared checksum must
    // still be enforced before any of the other domains can be restored.
    const orphan = 'media/binaries/unreferenced.bin'
    manifest.files[orphan] = '0'.repeat(64)
    corruptZip.file('manifest.json', JSON.stringify(manifest))
    corruptZip.file(orphan, Buffer.from([42]))
    const rejected = await page.evaluate(async ({ bytes, orphan }) => {
      const backup = await import('/src/services/storage/workspaceBackupBundle.js')
      const result = await backup.restoreWorkspaceBackupBundle(Uint8Array.from(bytes), { acceptRestoreRisk: true })
      return result.reason === 'invalid-backup' && result.inspection.errors.some(message => message.includes(orphan))
        && result.domains === null && localStorage.getItem('writing_books') === null
    }, { bytes: [...await corruptZip.generateAsync({ type: 'uint8array' })], orphan })
    assert.equal(rejected, true)
  } finally { await context.close() }
}

async function main() {
  log(`root=${root} front=${FRONT_PORT} back=${BACK_PORT} out=${OUT_DIR}`)
  for (const port of [FRONT_PORT, BACK_PORT]) {
    if (await probePort(port)) throw new Error(`端口 ${port} 已被占用，请换端口或停掉占用进程`)
  }
  await mkdir(OUT_DIR, { recursive: true })

  startProcess('server', nodeBin, ['server/index.js'], { PORT: String(BACK_PORT) })
  await waitUntil(() => httpReachable(`http://127.0.0.1:${BACK_PORT}/api/rooms`), `backend :${BACK_PORT}`)
  startProcess('vite', nodeBin, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(FRONT_PORT), '--strictPort'], {
    PINAX_DEV_BACKEND_ORIGIN: `http://127.0.0.1:${BACK_PORT}`
  })
  await waitUntil(() => httpReachable(BASE_URL), `frontend :${FRONT_PORT}`)

  const browser = await chromium.launch({
    args: process.env.CI ? ['--disable-dev-shm-usage', '--no-sandbox'] : []
  })
  try {
    const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 900 }, acceptDownloads: true })
    const blocked = []
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.origin === BASE_URL || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue()
      blocked.push(url.origin + url.pathname)
      return route.abort()
    })
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)))

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.clear())
    await page.reload({ waitUntil: 'domcontentloaded' })

    try {
      await runCheck(page)
      await checkSparseRestore(browser, join(OUT_DIR, 'captured-workspace-backup.zip'))
    } catch (error) {
      failed = true
      console.error('[workspace-backup-check] FAILED:', error?.message || error)
      await writeFile(join(OUT_DIR, 'failure.log'), [String(error?.stack || error), ...processDiagnostics].join('\n'))
      await page.screenshot({ path: join(OUT_DIR, 'backup-check-failure.png'), fullPage: true }).catch(() => {})
    }
    if (pageErrors.length > 0) {
      failed = true
      console.error('[workspace-backup-check] 页面错误:', pageErrors.slice(0, 3).join(' | '))
    }
    const unexpected = blocked.filter((item) => !item.includes('/api/'))
    if (unexpected.length > 0) {
      failed = true
      console.error('[workspace-backup-check] 未预期外发请求:', [...new Set(unexpected)].slice(0, 5).join(', '))
    }
  } finally {
    await browser.close()
  }

  if (failed) {
    console.error('[workspace-backup-check] RESULT: FAIL')
    process.exitCode = 1
  } else {
    console.log(`[workspace-backup-check] RESULT: PASS（产物在 ${OUT_DIR}）`)
  }
}

try {
  await main()
} catch (error) {
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(join(OUT_DIR, 'failure.log'), [String(error?.stack || error), ...processDiagnostics].join('\n'))
  console.error('[workspace-backup-check] startup FAILED:', error?.stack || error)
  process.exitCode = 1
} finally {
  await stopAll()
}
