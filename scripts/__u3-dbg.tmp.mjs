import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:5173'
const browser = await chromium.launch()
const page = await browser.newPage()
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 150)) })
page.on('pageerror', (e) => errs.push('PAGEERR ' + String(e).slice(0, 150)))
await page.goto(`${BASE}/experience`)
await page.waitForLoadState('domcontentloaded')
await page.waitForTimeout(2500)
const found = await page.evaluate(() => ({
  inputArea: !!document.querySelector('.input-area'),
  quickActions: !!document.querySelector('.quick-actions'),
  sendBtn: !!document.querySelector('.send-btn'),
  bodyStart: document.body.innerText.slice(0, 60)
}))
console.log(JSON.stringify({ found, errs: errs.slice(0, 4) }, null, 2))
await browser.close()
