/* global process */
/* eslint-disable no-console */
// C07 行为验证:设置弹窗 Tab 圈/初始焦点/焦点返回;嵌套模型弹层 Esc 只关内层;
// tablist 方向键;IME 组合态 Esc 不误关。
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:5213'
const OUT_DIR = path.resolve('docs/agent-runs/nightly-20260913/c-ux-20260914/screenshots')
const results = []
const check = (name, ok, note = '') => {
  results.push({ name, ok, note })
  console.log(`[c07-check] ${ok ? 'PASS' : 'FAIL'} ${name}${note ? ` — ${note}` : ''}`)
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

try {
  // 1) Welcome 入口打开设置:初始焦点=关闭钮;Tab 循环不漏背景
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: '备份' }).click()
  await page.waitForTimeout(500)
  const focusedAtOpen = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName)
  check('initial focus lands on a control inside dialog', focusedAtOpen === '关闭', focusedAtOpen)

  // 连续 Tab 20 次后焦点仍在弹窗内
  for (let i = 0; i < 20; i += 1) await page.keyboard.press('Tab')
  const stillInside = await page.evaluate(() => Boolean(document.activeElement?.closest('.settings-modal')))
  check('Tab cycles stay inside settings dialog', stillInside)

  // 2) Esc 关闭 → 焦点回到"备份"触发器
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const settingsGone = !(await page.locator('.settings-modal').isVisible().catch(() => false))
  const focusReturned = await page.evaluate(() => document.activeElement?.textContent?.trim())
  check('Esc closes settings and restores trigger focus', settingsGone && focusReturned === '备份', `focus=${focusReturned}`)

  // 3) 嵌套:AI 配置 → 模型选择弹层 → Esc 只关内层
  await page.getByRole('button', { name: '备份' }).click()
  await page.waitForTimeout(400)
  await page.locator('[data-test="settings-tab-ai"]').click()
  await page.waitForTimeout(300)
  await page.locator('[data-testid="text-model-config-trigger"]').click()
  await page.waitForTimeout(500)
  const pickerOpen = await page.locator('.text-model-dialog').isVisible().catch(() => false)
  check('nested model picker opens above settings', pickerOpen)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const pickerClosed = !(await page.locator('.text-model-dialog').isVisible().catch(() => false))
  const settingsStillOpen = await page.locator('.settings-modal').isVisible().catch(() => false)
  check('Esc closes only inner picker, settings stays', pickerClosed && settingsStillOpen)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const settingsClosedNow = !(await page.locator('.settings-modal').isVisible().catch(() => false))
  check('second Esc closes settings', settingsClosedNow)
  const focusBackAfterNest = await page.evaluate(() => document.activeElement?.textContent?.trim())
  check('focus returns to welcome trigger after nested flow', focusBackAfterNest === '备份', `focus=${focusBackAfterNest}`)

  // 4) tablist 方向键切换分区
  await page.getByRole('button', { name: '备份' }).click()
  await page.waitForTimeout(400)
  await page.locator('[data-test="settings-tab-storage"]').focus()
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(300)
  const wrapToFirst = await page.evaluate(() => document.getElementById('settings-tab-storage')?.getAttribute('aria-selected'))
  const activeTab = await page.evaluate(() => document.activeElement?.id)
  check('arrow key moves tab selection (storage→ai wrap)', activeTab === 'settings-tab-ai', `active=${activeTab}`)
  void wrapToFirst

  // 5) IME 组合态 Esc 不关闭弹窗
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '备份' }).click()
  await page.waitForTimeout(300)
  await page.keyboard.press('ControlOrMeta+e') // 无实际作用,确保焦点序列稳定
  await page.evaluate(() => {
    const target = document.activeElement
    const composingEvent = new KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, cancelable: true
    })
    Object.defineProperty(composingEvent, 'isComposing', { value: true })
    target?.dispatchEvent(composingEvent)
  })
  await page.waitForTimeout(300)
  const stillOpenDuringIme = await page.locator('.settings-modal').isVisible().catch(() => false)
  check('Esc during IME composition does not close dialog', stillOpenDuringIme)
  await page.screenshot({ path: path.join(OUT_DIR, 'c07-settings-focus.png') })

  // 6) 390 触控关闭 ≥44px
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const mobilePage = await mobile.newPage()
  await mobilePage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await mobilePage.evaluate(() => localStorage.clear())
  await mobilePage.reload({ waitUntil: 'domcontentloaded' })
  await mobilePage.getByRole('button', { name: '备份' }).click()
  await mobilePage.waitForTimeout(400)
  const closeSize = await mobilePage.locator('.settings-modal__close').boundingBox()
  check('mobile close control meets 44px touch target', Boolean(closeSize && closeSize.height >= 43 && closeSize.width >= 43), JSON.stringify(closeSize))
  await mobile.close()

  // 7) 导入对话框 IME 守卫存在(源码级,组合 Esc 分派不关闭)
  await page.goto(`${BASE}/authoring?start=import`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  await page.evaluate(() => {
    const target = document.activeElement
    const composingEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    Object.defineProperty(composingEvent, 'isComposing', { value: true })
    target?.dispatchEvent(composingEvent)
  })
  await page.waitForTimeout(300)
  const importStillOpen = await page.locator('.manuscript-import').isVisible().catch(() => false)
  check('import dialog ignores composing Escape', importStillOpen)
} catch (error) {
  check('runtime', false, String(error?.message || error).slice(0, 200))
} finally {
  fs.writeFileSync('docs/agent-runs/nightly-20260913/c-ux-20260914/c07-browser-check.json', JSON.stringify({
    schemaVersion: 1, base: BASE, results,
    passed: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length
  }, null, 2))
  await browser.close()
  process.exitCode = results.some((item) => !item.ok) ? 2 : 0
}
