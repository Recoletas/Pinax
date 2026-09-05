/* eslint-disable no-console */
// F1-5 real-page Gate: selected direction -> same frozen session -> one prose
// run -> editable segmented Ghost preview. Uses deterministic provider routes.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { installDeterministicProviderMock } from './provider-mock.mjs'

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const FIXTURE_DIR = path.resolve('tmp/authoring-context-closure')
const OUT_DIR = path.resolve('/tmp/pinax-authoring-f1')
const REPORT_DIR = path.resolve('tmp/authoring-rollout/f1')
const state = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-state.json'), 'utf8'))
const storage = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-localstorage.json'), 'utf8'))
const results = []
const screenshots = {
  desktop: path.join(OUT_DIR, 'f1-5-segmented-ghost-1440.png'),
  mobile: path.join(OUT_DIR, 'f1-5-segmented-ghost-390.png'),
  adoptionImpact: path.join(OUT_DIR, 'f1-6-adoption-impact-1440.png')
}
const selectedTitle = '让他共同验证'
const rejectedActions = ['让艾德加离开档案架', '故意说错暗格编号']
const generatedProse = [
  ':::action',
  '莉娜把缺页摊在窗下，让艾德加辨认装订线上的新伤。',
  ':::dialogue|艾德加',
  '“这不是撕痕，是拆线后又缝回去的。”',
  ':::thought|莉娜',
  '她意识到对方比预想中更熟悉这本总册，也更难从这场调查中排除。'
].join('\n')

fs.mkdirSync(OUT_DIR, { recursive: true })
fs.mkdirSync(REPORT_DIR, { recursive: true })

function check(label, pass, detail = '') {
  results.push({ label, pass: Boolean(pass), detail: String(detail).slice(0, 1000) })
}

function formalStorage(snapshot) {
  return Object.fromEntries(Object.entries(snapshot).filter(([key]) => (
    key === 'writing_books'
    || key.startsWith('worldbook_')
    || key.includes('memory')
    || key.includes('outline')
  )))
}

function sceneDirections({ pressure }) {
  const evidenceRef = pressure.allowedEvidenceRefs?.find(Boolean)
  const entityRef = pressure.allowedEntityRefs?.find((ref) => String(ref).includes(state.edgarEntryId || ''))
    || pressure.allowedEntityRefs?.find(Boolean)
  return {
    pressure: {
      statement: '艾德加被带入本次推演后，莉娜必须决定是否让他接触税务所的秘密。',
      evidenceRefs: [evidenceRef]
    },
    directions: [
      { id: 'conceal', title: '先隐瞒异象', action: rejectedActions[0], immediateGain: '保住调查主动权', cost: '艾德加会察觉回避', evidenceRefs: [evidenceRef], entityRefs: entityRef ? [entityRef] : [] },
      { id: 'verify', title: selectedTitle, action: '当面指出缺页，请艾德加辨认装订痕迹。', immediateGain: '更快确认失窃线索', cost: '秘密与判断权交到他手里', evidenceRefs: [evidenceRef], entityRefs: entityRef ? [entityRef] : [] },
      { id: 'probe', title: '借异象试探他', action: rejectedActions[1], immediateGain: '判断他知道多少', cost: '误判会暴露怀疑', evidenceRefs: [evidenceRef], entityRefs: entityRef ? [entityRef] : [] }
    ]
  }
}

async function seedContext(browser, viewport, { storageFault = false } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await context.addInitScript(({ snapshot, installFault }) => {
    localStorage.clear()
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
    if (!installFault) return
    const nativeSetItem = Storage.prototype.setItem
    const control = { enabled: false, remaining: 0, attempted: 0 }
    Object.defineProperty(window, '__f1StorageFault', { value: control, configurable: false })
    Storage.prototype.setItem = function patchedSetItem(key, value) {
      if (String(key) === 'writing_books') {
        control.attempted += 1
        if (control.enabled && control.remaining > 0) {
          control.remaining -= 1
          throw new DOMException('F1 deterministic writing_books failure', 'QuotaExceededError')
        }
      }
      return nativeSetItem.call(this, key, value)
    }
  }, { snapshot: storage, installFault: storageFault })
  return context
}

async function openTarget(page) {
  await page.goto(`${BASE}/authoring?bookId=${state.bookId}&chapterId=${state.targetChapterId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.ProseMirror', { timeout: 30000 })
  const target = page.locator(`[data-writing-unit][data-unit-id="${state.targetUnitId}"]`)
  await target.locator('p').first().click({ position: { x: 70, y: 10 } })
  await page.waitForTimeout(220)
  return target
}

async function openLaboratory(page, mobile, intent = 'run-only') {
  if (mobile) {
    await page.locator('[data-authoring-tool="scene"]').click({ force: true })
    await page.locator('.writing-inspector.is-open [data-test="scene-edit"]').click()
  } else {
    await page.locator('.wall__shelf-scene [data-test="scene-edit"]').click()
  }
  const inspector = page.locator('.writing-inspector.is-open')
  const edgar = inspector.locator('.scene-curation__people li').filter({ hasText: '艾德加' }).first()
  await edgar.getByRole('button', { name: intent === 'next-passage' ? '下一段入场' : '带入本次推演' }).click()
  const laboratory = page.locator('[data-test="scene-laboratory"]')
  await laboratory.waitFor({ state: 'visible' })
  await laboratory.locator('.authoring-scene-lab__direction').filter({ hasText: selectedTitle }).click()
  return laboratory
}

const browser = await chromium.launch()
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await seedContext(browser, viewport)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    const provider = await installDeterministicProviderMock(page, {
      passiveInline: false,
      blockText: generatedProse,
      sceneDirections,
      expectedSelectedDirection: selectedTitle,
      excludedDirectionTexts: rejectedActions
    })
    await openTarget(page)
    const before = formalStorage(await page.evaluate(() => ({ ...localStorage })))
    const laboratory = await openLaboratory(page, viewport.width === 390)
    await laboratory.getByRole('button', { name: '按此推演' }).click()
    const draft = page.locator('[data-test="block-draft"]')
    try {
      await draft.waitFor({ state: 'visible', timeout: 30000 })
    } catch (error) {
      const detail = {
        laboratory: await laboratory.innerText().catch(() => ''),
        phase: await laboratory.getAttribute('data-scene-lab-phase').catch(() => ''),
        composer: await page.locator('[data-test="block-composer"]').innerText().catch(() => ''),
        provider: provider.summary(),
        errors
      }
      throw new Error(`${error.message}\n${JSON.stringify(detail)}`)
    }
    const providerSummary = provider.summary()
    const draftText = await draft.innerText()
    check(`F1-5 ${viewport.width} 所选方向进入唯一正文请求`,
      providerSummary.selectedDirectionSeen && !providerSummary.excludedDirectionSeen,
      JSON.stringify(providerSummary))
    check(`F1-5 ${viewport.width} 方向规划只调用一次`,
      provider.count({ kind: 'advisor', taskType: 'authoring.scene.directions' }) === 1,
      JSON.stringify(providerSummary))
    check(`F1-5 ${viewport.width} Ghost 可辨认所选方向`,
      draftText.includes(`沿“${selectedTitle}”推演`) && draftText.includes('辨认装订痕迹'), draftText)
    const units = draft.locator('.authoring-block-draft__unit-plan li')
    check(`F1-5 ${viewport.width} 同一 Ghost 预览多 writingUnit`,
      await units.count() === 3 && draftText.includes('拟分为 3 个写作单元'), draftText)
    const callsBeforeBoundaryEdit = provider.count({ kind: 'narrative' })
    const firstSplit = draft.locator('.authoring-block-draft__boundary-tick.is-split').first()
    await firstSplit.click()
    await draft.getByRole('button', { name: '合并', exact: true }).click()
    check(`F1-5 ${viewport.width} 边界修正立即改变单元预览`,
      await units.count() === 2 && (await draft.innerText()).includes('拟分为 2 个写作单元'))
    check(`F1-5 ${viewport.width} 边界修正不追加 provider 调用`,
      provider.count({ kind: 'narrative' }) === callsBeforeBoundaryEdit)
    const beatDraft = await draft.evaluate((element) => ({
      text: element.querySelector('textarea')?.value || '',
      previews: [...element.querySelectorAll('.authoring-block-draft__unit-plan li p')].map((item) => item.textContent)
    }))
    check(`F1-5 ${viewport.width} 预览首句与可编辑 Ghost 同源`,
      beatDraft.previews.every((preview) => beatDraft.text.includes(preview.replace(/…$/u, ''))), JSON.stringify(beatDraft))
    const after = formalStorage(await page.evaluate(() => ({ ...localStorage })))
    check(`F1-5 ${viewport.width} 采纳前正式数据零写入`, JSON.stringify(before) === JSON.stringify(after))
    check(`F1-5 ${viewport.width} 无水平滚动`, await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth))
    check(`F1-5 ${viewport.width} 零页面错误`, errors.length === 0, errors.join(' | '))
    await draft.scrollIntoViewIfNeeded()
    await page.screenshot({ path: viewport.width === 1440 ? screenshots.desktop : screenshots.mobile, fullPage: false })
    await context.close()
  }

  // Separate stale path: edit the frozen target after directions are ready.
  const context = await seedContext(browser, { width: 1440, height: 900 })
  const page = await context.newPage()
  const provider = await installDeterministicProviderMock(page, {
    passiveInline: false,
    blockText: generatedProse,
    sceneDirections,
    expectedSelectedDirection: selectedTitle,
    excludedDirectionTexts: rejectedActions
  })
  const target = await openTarget(page)
  const laboratory = await openLaboratory(page, false)
  await target.locator('p').first().click({ position: { x: 30, y: 10 } })
  await page.keyboard.type('改')
  await page.waitForTimeout(180)
  await laboratory.getByRole('button', { name: '按此推演' }).click()
  await laboratory.locator('.authoring-scene-lab__insufficient.is-failed').waitFor({ state: 'visible' })
  check('F1-5 stale 在 provider 前拒绝正文调用',
    provider.count({ kind: 'narrative' }) === 0
      && (await laboratory.innerText()).includes('未调用正文模型'),
    JSON.stringify(provider.summary()))
  await context.close()

  // F1-6: one SceneBeatDraft writes two units in one history boundary. The
  // first storage failure retains that exact editor result; retry is persist-only.
  {
    const adoptionContext = await seedContext(browser, { width: 1440, height: 900 }, { storageFault: true })
    const adoptionPage = await adoptionContext.newPage()
    const errors = []
    adoptionPage.on('pageerror', (error) => errors.push(error.message))
    adoptionPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    const adoptionProvider = await installDeterministicProviderMock(adoptionPage, {
      passiveInline: false,
      blockText: generatedProse,
      sceneDirections,
      expectedSelectedDirection: selectedTitle,
      excludedDirectionTexts: rejectedActions
    })
    await openTarget(adoptionPage)
    const originalUnitCount = await adoptionPage.locator('[data-writing-unit]').count()
    const laboratory = await openLaboratory(adoptionPage, false, 'next-passage')
    await laboratory.getByRole('button', { name: '按此推演' }).click()
    const draft = adoptionPage.locator('[data-test="block-draft"]')
    await draft.waitFor({ state: 'visible', timeout: 30000 })
    const firstSplit = draft.locator('.authoring-block-draft__boundary-tick.is-split').first()
    await firstSplit.click()
    await draft.getByRole('button', { name: '合并', exact: true }).click()
    check('F1-6 最终 beat 冻结为两个 writingUnit',
      await draft.locator('.authoring-block-draft__unit-plan li').count() === 2
        && (await draft.innerText()).includes('2 个单元将原子纳入'))
    const narrativeCount = adoptionProvider.count({ kind: 'narrative' })
    const observerBefore = await adoptionPage.evaluate(async () => {
      const { useGameStore } = await import('/src/stores/gameStore.js')
      return useGameStore().getAuthoringObserverEvents().length
    })
    await adoptionPage.evaluate(() => {
      window.__f1StorageFault.enabled = true
      window.__f1StorageFault.remaining = 1
    })
    await draft.getByRole('button', { name: '采用编辑稿' }).click()
    await draft.getByRole('button', { name: '再次保存' }).waitFor({ state: 'visible', timeout: 10000 })
    check('F1-6 首次保存失败仍只插入完整两个单元',
      await adoptionPage.locator('[data-writing-unit]').count() === originalUnitCount + 2)
    check('F1-6 首次保存失败前 observer 零调度', await adoptionPage.evaluate(async (before) => {
      const { useGameStore } = await import('/src/stores/gameStore.js')
      return useGameStore().getAuthoringObserverEvents().length === before
    }, observerBefore))
    await draft.getByRole('button', { name: '再次保存' }).click()
    await draft.waitFor({ state: 'detached', timeout: 10000 })
    const impact = adoptionPage.locator('[data-test="adoption-impact"]')
    await impact.waitFor({ state: 'visible', timeout: 5000 })
    const impactText = await impact.innerText()
    check('F1-6 回响逐项对应正式 receipt',
      impactText.includes('新增 2 个写作单元')
        && impactText.includes('当前场加入 1 人')
        && !impactText.includes('大纲已更新'), impactText)
    const impactGeometry = await adoptionPage.evaluate(() => {
      const impactElement = document.querySelector('[data-test="adoption-impact"]')
      const lastUnit = [...document.querySelectorAll('[data-writing-unit]')].at(-1)
      const impactRect = impactElement?.getBoundingClientRect()
      const unitRect = lastUnit?.getBoundingClientRect()
      return {
        impactX: impactRect?.x || 0,
        impactWidth: impactRect?.width || 0,
        unitX: unitRect?.x || 0,
        unitWidth: unitRect?.width || 0,
        focusableCount: impactElement?.querySelectorAll('button, a, input, textarea, [tabindex]').length || 0,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      }
    })
    check('F1-6 回响与新单元同轴且不抢焦点',
      Math.abs(impactGeometry.impactX - impactGeometry.unitX) <= 4
        && Math.abs(impactGeometry.impactWidth - impactGeometry.unitWidth) <= 4
        && impactGeometry.focusableCount === 0
        && !impactGeometry.overflow,
      JSON.stringify(impactGeometry))
    await adoptionPage.screenshot({ path: screenshots.adoptionImpact, fullPage: false })
    check('F1-6 再次保存不重复插入且不重调模型',
      await adoptionPage.locator('[data-writing-unit]').count() === originalUnitCount + 2
        && adoptionProvider.count({ kind: 'narrative' }) === narrativeCount,
      JSON.stringify(adoptionProvider.summary()))
    check('F1-6 整拍只调度一次 observer', await adoptionPage.evaluate(async (before) => {
      const { useGameStore } = await import('/src/stores/gameStore.js')
      return useGameStore().getAuthoringObserverEvents().length === before + 1
    }, observerBefore))
    await adoptionPage.locator('.authoring-transient-notice__undo').click()
    await adoptionPage.waitForTimeout(250)
    check('F1-6 一次撤销移除整拍两个单元',
      await adoptionPage.locator('[data-writing-unit]').count() === originalUnitCount)
    const redo = adoptionPage.getByTitle('重做（Ctrl/Cmd+Shift+Z）')
    await redo.click()
    await adoptionPage.waitForTimeout(250)
    check('F1-6 一次重做恢复整拍两个单元',
      await adoptionPage.locator('[data-writing-unit]').count() === originalUnitCount + 2)
    const unexpectedErrors = errors.filter((message) => !message.includes('F1 deterministic writing_books failure'))
    check('F1-6 除预期持久化故障外零页面错误', unexpectedErrors.length === 0, unexpectedErrors.join(' | '))
    await adoptionContext.close()
  }
} catch (error) {
  check('F1-5 浏览器旅程执行完成', false, error?.stack || error)
} finally {
  await browser.close()
}

const failed = results.filter((item) => !item.pass)
fs.writeFileSync(path.join(REPORT_DIR, 'f1-5-report.json'), `${JSON.stringify({
  generatedAt: new Date().toISOString(), screenshots, results
}, null, 2)}\n`)
console.log(`[f1-5] pass: ${results.length - failed.length}/${results.length}`)
for (const item of failed) console.log(`[f1-5] FAIL ${item.label}: ${item.detail}`)
if (failed.length) process.exitCode = 1
