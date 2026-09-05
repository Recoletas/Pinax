/* eslint-disable no-console */
// C1-6 Gate：只在隔离浏览器 context 中注入 provider / localStorage 故障，
// 验证生产 AuthoringRunSession、Ghost 与采纳事务，不改用户浏览器数据。
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import {
  installDeterministicProviderMock,
  MOCK_BLOCK_INSTRUCTION,
} from './provider-mock.mjs'

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const FIXTURE_DIR = path.resolve('tmp/authoring-context-closure')
const state = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-state.json'), 'utf8'))
const storage = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-localstorage.json'), 'utf8'))
const browser = await chromium.launch()
const results = []

function check(label, pass, detail = '') {
  results.push({ label, pass: Boolean(pass), detail: String(detail).slice(0, 700) })
}

async function createContext({ storageFault = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await context.addInitScript(({ snapshot, installFault }) => {
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
    if (!installFault) return
    const nativeSetItem = Storage.prototype.setItem
    const control = {
      enabled: false,
      key: 'writing_books',
      remaining: 0,
      attempted: 0,
      successful: 0,
    }
    Object.defineProperty(window, '__c1StorageFault', { value: control, configurable: false })
    Storage.prototype.setItem = function patchedSetItem(key, value) {
      if (String(key) === control.key) {
        control.attempted += 1
        if (control.enabled && control.remaining > 0) {
          control.remaining -= 1
          throw new DOMException('C1 deterministic writing_books failure', 'QuotaExceededError')
        }
        control.successful += 1
      }
      return nativeSetItem.call(this, key, value)
    }
  }, { snapshot: storage, installFault: storageFault })
  return context
}

async function openFixture(page) {
  await page.goto(`${BASE}/authoring?bookId=${state.bookId}&chapterId=${state.targetChapterId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.ProseMirror', { timeout: 30000 })
  await page.waitForTimeout(700)
  const target = page.locator(`[data-writing-unit][data-unit-id="${state.targetUnitId}"]`)
  await target.locator('p').first().click({ position: { x: 90, y: 12 } })
  return target
}

async function canonicalSnapshot(page) {
  return page.evaluate(() => ({
    books: localStorage.getItem('writing_books') || '',
    memories: localStorage.getItem('memory_candidates_v1') || '',
    assets: localStorage.getItem('narrative_assets_v1') || '',
  }))
}

async function observerSnapshot(page) {
  return page.evaluate(async () => {
    const { useGameStore } = await import('/src/stores/gameStore.js')
    const store = useGameStore()
    return {
      observerEvents: store.getAuthoringObserverEvents(),
      memoryEvents: store.getAuthoringMemoryTriggerEvents(),
    }
  })
}

async function openComposer(page, operation = 'next-passage', instruction = MOCK_BLOCK_INSTRUCTION) {
  await page.getByRole('button', { name: /推演下一段/ }).click()
  const composer = page.locator('[data-test="block-composer"]')
  await composer.waitFor({ state: 'visible' })
  if (operation === 'rewrite-unit') {
    await composer.getByRole('radio', { name: '重写当前块' }).click()
  }
  await composer.locator('.authoring-block-composer__instruction textarea').fill(instruction)
  return composer
}

async function generateGhost(page, operation = 'next-passage') {
  const composer = await openComposer(page, operation)
  await composer.locator('[data-test="block-primary"]').click()
  const draft = page.locator('[data-test="block-draft"]')
  await draft.waitFor({ state: 'visible', timeout: 25000 })
  return { composer, draft }
}

async function runAbandonJourney(operation) {
  const context = await createContext()
  const page = await context.newPage()
  const provider = await installDeterministicProviderMock(page, { passiveInline: false })
  await openFixture(page)
  const before = await canonicalSnapshot(page)
  const observerBefore = await observerSnapshot(page)
  const { draft } = await generateGhost(page, operation)
  await draft.locator('textarea').fill(`作者改过但决定放弃：${operation}`)
  await draft.getByRole('button', { name: '丢弃' }).click()
  await draft.waitFor({ state: 'detached' })
  const after = await canonicalSnapshot(page)
  const observerAfter = await observerSnapshot(page)
  check(`${operation} 放弃不修改正文/现场/大纲`, after.books === before.books)
  check(`${operation} 放弃不创建或失效记忆`, after.memories === before.memories)
  check(`${operation} 放弃不改变作者素材`, after.assets === before.assets)
  check(`${operation} 放弃不调度正文观察器`,
    observerAfter.observerEvents.length === observerBefore.observerEvents.length,
    JSON.stringify({ before: observerBefore.observerEvents.length, after: observerAfter.observerEvents.length }))
  check(`${operation} 仅请求一次模型链`, provider.count({ kind: 'narrative', phase: 'plan' }) === 1)
  await context.close()
}

try {
  await runAbandonJourney('next-passage')
  await runAbandonJourney('rewrite-unit')

  // 空正文：保持 composer、作者指令与目标，不发布 Ghost。
  {
    const context = await createContext()
    const page = await context.newPage()
    await installDeterministicProviderMock(page, { passiveInline: false, blockText: '' })
    await openFixture(page)
    const before = await canonicalSnapshot(page)
    const composer = await openComposer(page, 'next-passage')
    await composer.locator('[data-test="block-primary"]').click()
    await composer.getByRole('alert').waitFor({ state: 'visible', timeout: 25000 })
    check('provider 空正文保留作者指令',
      await composer.locator('.authoring-block-composer__instruction textarea').inputValue() === MOCK_BLOCK_INSTRUCTION)
    check('provider 空正文不发布 Ghost', await page.locator('[data-test="block-draft"]').count() === 0)
    check('provider 空正文零正式写入', JSON.stringify(await canonicalSnapshot(page)) === JSON.stringify(before))
    await context.close()
  }

  // 504 + timeout code：快速模拟 provider 超时边界，不等待真实 35 秒计时器。
  {
    const context = await createContext()
    const page = await context.newPage()
    await installDeterministicProviderMock(page, {
      passiveInline: false,
      narrativeFailures: {
        plan: { status: 504, code: 'NARRATIVE_AGENT_TIMEOUT', message: 'deterministic timeout' },
      },
    })
    await openFixture(page)
    const before = await canonicalSnapshot(page)
    const composer = await openComposer(page, 'rewrite-unit')
    await composer.locator('[data-test="block-primary"]').click()
    await composer.getByRole('alert').waitFor({ state: 'visible', timeout: 15000 })
    check('provider 超时保留重写指令',
      await composer.locator('.authoring-block-composer__instruction textarea').inputValue() === MOCK_BLOCK_INSTRUCTION)
    check('provider 超时零正式写入', JSON.stringify(await canonicalSnapshot(page)) === JSON.stringify(before))
    await context.close()
  }

  // provider 迟到：章节切换会取消旧 composer，旧结果不得进入新章节。
  {
    const context = await createContext()
    const page = await context.newPage()
    const provider = await installDeterministicProviderMock(page, {
      passiveInline: false,
      narrativeDelayMs: { plan: 1400 },
    })
    await openFixture(page)
    const composer = await openComposer(page)
    await composer.locator('[data-test="block-primary"]').click()
    for (let index = 0; index < 40 && provider.count({ phase: 'plan' }) < 1; index += 1) {
      await page.waitForTimeout(25)
    }
    await page.locator('.authoring-chapter-row:not(.wt3-doc-row)').first().click()
    const afterChapterSwitch = await canonicalSnapshot(page)
    await page.waitForTimeout(1900)
    check('切换章节会关闭旧推演 session', await page.locator('[data-test="block-composer"]').count() === 0)
    check('迟到结果不会在新章节发布 Ghost', await page.locator('[data-test="block-draft"]').count() === 0)
    check('迟到结果零额外正式写入',
      JSON.stringify(await canonicalSnapshot(page)) === JSON.stringify(afterChapterSwitch))
    await context.close()
  }

  // Ghost 发布后依赖 revision 被外部写入口修改：草稿可保留，但不能采纳。
  {
    const context = await createContext()
    const page = await context.newPage()
    const provider = await installDeterministicProviderMock(page, { passiveInline: false })
    const target = await openFixture(page)
    const unitCount = await page.locator('[data-writing-unit]').count()
    const { draft } = await generateGhost(page)
    const narrativeCount = provider.summary().narrativeCount
    await target.locator('p').first().click()
    await page.keyboard.press('End')
    await page.keyboard.type('（作者已改）')
    const liveEditedText = await target.innerText()
    await draft.getByRole('button', { name: '采用编辑稿' }).click()
    await draft.getByRole('alert').waitFor({ state: 'visible', timeout: 10000 })
    check('依赖 revision 变化后 Ghost 保留且不可采纳', await draft.count() === 1)
    check('stale 采纳不插入或替换正文',
      await page.locator('[data-writing-unit]').count() === unitCount && (await target.innerText()) === liveEditedText)
    check('stale 检查不重发模型', provider.summary().narrativeCount === narrativeCount)
    await context.close()
  }

  // 首次采用写入内存后，writing_books 持久化失败；再次保存不得重发模型或重复插入。
  {
    const context = await createContext({ storageFault: true })
    const page = await context.newPage()
    const provider = await installDeterministicProviderMock(page, { passiveInline: false })
    await openFixture(page)
    const observerBefore = await observerSnapshot(page)
    const originalUnitCount = await page.locator('[data-writing-unit]').count()
    const { draft } = await generateGhost(page)
    const narrativeCount = provider.summary().narrativeCount
    await page.evaluate(() => {
      window.__c1StorageFault.enabled = true
      window.__c1StorageFault.remaining = 1
    })
    await draft.getByRole('button', { name: '采用编辑稿' }).click()
    await page.getByRole('button', { name: '再次保存' }).waitFor({ state: 'visible', timeout: 10000 })
    check('保存失败保留锁定 Ghost', (await draft.innerText()).includes('待保存'))
    check('保存失败只在编辑器插入一次', await page.locator('[data-writing-unit]').count() === originalUnitCount + 1)
    check('保存失败前不调度观察器',
      (await observerSnapshot(page)).observerEvents.length === observerBefore.observerEvents.length)
    await draft.getByRole('button', { name: '再次保存' }).click()
    await draft.waitFor({ state: 'detached', timeout: 10000 })
    const observerAfter = await observerSnapshot(page)
    const newObserverEvents = observerAfter.observerEvents.slice(observerBefore.observerEvents.length)
    check('再次保存不重复插入', await page.locator('[data-writing-unit]').count() === originalUnitCount + 1)
    check('再次保存不产生第二次模型请求', provider.summary().narrativeCount === narrativeCount,
      JSON.stringify(provider.summary()))
    check('一次采纳只调度一次观察器', newObserverEvents.length === 1, JSON.stringify(newObserverEvents))
    check('观察器来源绑定本次 Ghost 与新 unit',
      newObserverEvents.length === 1
      && newObserverEvents[0].sourceRefs.some((ref) => String(ref).startsWith('ghost-adoption:'))
      && newObserverEvents[0].sourceRefs.some((ref) => String(ref).startsWith('unit:')),
    JSON.stringify(newObserverEvents))
    const fault = await page.evaluate(() => ({ ...window.__c1StorageFault }))
    check('持久化故障仅命中首次保存，重试成功', fault.remaining === 0 && fault.attempted >= 2, JSON.stringify(fault))

    await page.locator('.authoring-transient-notice__undo').click()
    await page.waitForTimeout(200)
    const undoState = await observerSnapshot(page)
    const undoEvents = undoState.memoryEvents.filter((event) => event.type === 'invalidation')
    const lastUndo = undoEvents.at(-1)
    check('撤销只失效本次新 writingUnit',
      Array.isArray(lastUndo?.sourceRefs)
      && lastUndo.sourceRefs.length === 1
      && String(lastUndo.sourceRefs[0]).startsWith('unit:'), JSON.stringify(lastUndo))
    const activeMemoryStatus = await page.evaluate((memoryId) => {
      const rows = JSON.parse(localStorage.getItem('memory_candidates_v1') || '[]')
      return rows.find((row) => row.id === memoryId)?.status || ''
    }, state.activeMemoryId)
    check('撤销不影响推演前既有记忆', activeMemoryStatus === 'active', activeMemoryStatus)
    await context.close()
  }
} catch (error) {
  check('C1-6 旅程执行完成', false, error?.stack || error)
} finally {
  await browser.close()
}

const failed = results.filter((item) => !item.pass)
console.log(`[c1-fault] pass: ${results.length - failed.length}/${results.length}`)
for (const item of failed) console.log(`[c1-fault] FAIL ${item.label}: ${item.detail}`)
if (failed.length) process.exitCode = 1
