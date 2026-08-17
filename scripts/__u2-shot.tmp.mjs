import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:5173'
const session = { id: 'u2s', title: 'U2', createdAt: Date.now(), updatedAt: Date.now(),
  messages: [{ id: 'u', role: 'user', content: '我向掌柜打听西边的路。', timestamp: 1 },
    { id: 'a', role: 'assistant', name: '旁白', content: ':::narration\n掌柜放下算盘。\n:::dialogue|掌柜\n「西边的路不好走。」', timestamp: 2 }],
  chatHistory: [], runtimeState: {}, worldState: {} }
const browser = await chromium.launch()
for (const [w, h, m] of [[1440, 900, false], [390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: m, hasTouch: m })
  const page = await ctx.newPage()
  await page.goto(BASE)
  await page.evaluate((s) => localStorage.setItem('writing_sessions', JSON.stringify([s])), session)
  await page.goto(`${BASE}/experience`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(2200)
  await page.screenshot({ path: `/tmp/u2-top-${w}.png` })
  await ctx.close()
}
console.log('shots ok')
await browser.close()
