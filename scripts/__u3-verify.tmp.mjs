import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:5173'
const session = { id: 'u3', title: 'U3', createdAt: Date.now(), updatedAt: Date.now(),
  messages: [{ id: 'u', role: 'user', content: '我向掌柜打听。', timestamp: 1 },
    { id: 'a', role: 'assistant', name: '旁白', content: ':::narration\n掌柜放下算盘。', timestamp: 2 }],
  chatHistory: [], runtimeState: {}, worldState: {} }
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
await page.goto(BASE)
await page.evaluate((s) => localStorage.setItem('writing_sessions', JSON.stringify([s])), session)
await page.goto(`${BASE}/experience`)
await page.waitForLoadState('domcontentloaded')
await page.waitForTimeout(2200)
const m = await page.evaluate(() => {
  const area = document.querySelector('.input-area')
  const cs = getComputedStyle(area)
  const btns = [...area.querySelectorAll('button')]
  const closed = (el) => { const s = getComputedStyle(el); return ['Top','Right','Bottom','Left'].some((w) => parseFloat(s[`border${w}Width`]) > 0 && s.borderStyle !== 'none') }
  const filled = (el) => { const s = getComputedStyle(el); return s.backgroundColor !== 'rgba(0, 0, 0, 0)' }
  const primary = btns.filter((b) => b.classList.contains('control-primary'))
  return {
    inputAreaBorders: { top: cs.borderTopWidth, bottom: cs.borderBottomWidth, left: cs.borderLeftWidth, right: cs.borderRightWidth },
    buttonCount: btns.length,
    borderedButtons: btns.filter(closed).map((b) => String(b.className).split(' ').slice(0, 2).join('.')),
    filledPrimary: primary.length,
    primaryLabel: primary[0]?.textContent?.trim(),
    toggles: [...area.querySelectorAll('.control-toggle')].map((t) => ({ label: t.textContent?.trim().slice(0, 6), pressed: t.getAttribute('aria-pressed') }))
  }
})
await page.screenshot({ path: '/tmp/u3-input-1440.png' })
console.log(JSON.stringify({ m, errs: errs.length }, null, 2))
await browser.close()
