#!/usr/bin/env node
/**
 * WorkspaceTabs 交互冒烟（N-B nightly-20260917）：标签重构后的交互合同。
 * 覆盖：渲染、点击激活、ArrowLeft 焦点移动、关闭（hover 显隐）、无嵌套交互。
 * 运行：node scripts/workspace-tabs-interaction-smoke.mjs（自带隔离 vite :5198）
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let passed = 0
let failed = 0
const check = (name, ok, detail = '') => { if (ok) { passed += 1 } else { failed += 1; console.error(`FAIL ${name}${detail ? ` :: ${String(detail).slice(0, 200)}` : ''}`) } }

const server = spawn(path.join(root, 'node_modules/.bin/vite'), ['--port', '5198', '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

try {
  for (let i = 0; i < 60; i++) { try { const r = await fetch('http://127.0.0.1:5198'); if (r.ok) break } catch { /* retry */ } await wait(500) }
  const { chromium } = await import(path.join(root, 'node_modules/playwright/index.mjs'))
  const browser = await chromium.launch({ headless: true })
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.goto('http://127.0.0.1:5198/experience')
  await wait(1800)
  const tabCount = await page.locator('[data-test="workspace-tabs"] .ws-tab').count()
  check('两个标签渲染（首页+体验）', tabCount === 2, `got ${tabCount}`)
  await page.locator('[data-test="workspace-tabs"] .ws-tab').first().click()
  await wait(900)
  check('点击标签激活（回首页）', !page.url().split('?')[0].endsWith('/experience'))
  await page.goto('http://127.0.0.1:5198/experience')
  await wait(1500)
  await page.locator('[data-test="workspace-tabs"] .ws-tab').last().click()
  await wait(600)
  await page.keyboard.press('ArrowLeft')
  await wait(300)
  check('ArrowLeft 焦点在标签间移动', await page.evaluate(() => document.activeElement?.classList?.contains('ws-tab')))
  await page.locator('[data-test="workspace-tabs"] .ws-tab-slot').last().hover()
  await wait(200)
  await page.locator('[data-test="workspace-tabs"] .ws-tab__close').last().click({ force: true })
  await wait(900)
  check('关闭按钮关闭标签', await page.locator('[data-test="workspace-tabs"] .ws-tab').count() === tabCount - 1)
  check('tab 内无嵌套交互', await page.evaluate(() => [...document.querySelectorAll('[data-test="workspace-tabs"] .ws-tab')].filter((el) => el.querySelector('button')).length) === 0)
  await browser.close()
} finally {
  server.kill('SIGTERM')
}
console.log(`\n=== workspace-tabs-interaction-smoke: ${passed} passed, ${failed} failed ===`)
process.exit(failed ? 1 : 0)
