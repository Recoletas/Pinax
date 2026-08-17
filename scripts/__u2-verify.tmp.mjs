import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:5173'
const session = { id: 'u2', title: 'U2 验收', createdAt: Date.now(), updatedAt: Date.now(),
  messages: [{ id: 'u1', role: 'user', content: '我向掌柜打听西边的路。', timestamp: 1 },
    { id: 'a1', role: 'assistant', name: '旁白', content: ':::narration\n掌柜放下手里的算盘，抬眼打量了他一番。\n:::dialogue|掌柜\n「西边的路不好走，客官要去哪儿？」\n:::dialogue|阿贵\n「我陪柳公子去！」', timestamp: 2 }],
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
await page.waitForTimeout(2500)
const topstrip = await page.evaluate(() => {
  const ts = document.querySelector('.ws-topstrip')
  const cs = getComputedStyle(ts)
  const bordered = [...document.querySelectorAll('.game-page button, .game-page select')]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.top < innerHeight })
    .filter((el) => {
      const s = getComputedStyle(el)
      return ['Top', 'Right', 'Bottom', 'Left'].some((side) => parseFloat(s[`border${side}Width`]) > 0 && s.borderStyle !== 'none')
    })
  return {
    topstripBorders: { top: cs.borderTopWidth, bottom: cs.borderBottomWidth, left: cs.borderLeftWidth, right: cs.borderRightWidth },
    visibleButtons: [...document.querySelectorAll('.game-page button')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.top < innerHeight }).length,
    borderedButtons: bordered.map((el) => String(el.className).split(' ')[0]).slice(0, 10)
  }
})
// 桌面右栏常驻，直接量
await page.waitForTimeout(300)
const rail = await page.evaluate(() => {
  const bordered = [...document.querySelectorAll('.ws-right-rail button')]
    .filter((el) => {
      const s = getComputedStyle(el)
      return ['Top', 'Right', 'Bottom', 'Left'].some((side) => parseFloat(s[`border${side}Width`]) > 0 && s.borderStyle !== 'none')
    })
    .map((el) => String(el.className).split(' ')[0])
  return { railVisible: !!document.querySelector('.ws-right-rail.is-mobile-open, .ws-right-rail'), borderedInRail: bordered.slice(0, 8) }
})
await page.screenshot({ path: '/tmp/u2-top-1440.png' })
console.log(JSON.stringify({ topstrip, rail, errs: errs.length }, null, 2))
await browser.close()
