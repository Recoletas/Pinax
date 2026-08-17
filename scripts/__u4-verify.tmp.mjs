import { chromium } from 'playwright'
const BASE = 'http://127.0.0.1:5173'
const session = { id: 'u4', title: 'U4 对白', createdAt: Date.now(), updatedAt: Date.now(),
  messages: [
    { id: 'u', role: 'user', content: '我向掌柜打听西边的路。', timestamp: 1 },
    { id: 'a', role: 'assistant', name: '旁白', content: ':::narration\n掌柜放下手里的算盘，抬眼打量了他一番。\n:::dialogue|掌柜\n「西边的路不好走，客官要去哪儿？」\n:::action|掌柜\n他用抹布擦了擦柜台。\n:::dialogue|掌柜\n「货栈那边或许有人肯带路。」\n:::dialogue|阿贵\n「我陪柳公子去！」\n:::dialogue|掌柜\n「你这小子，码头还没卸完货呢。」\n:::thought|柳洵\n西边……纸条上只有两个字。\n:::narration\n柳洵把纸条收回袖口，没有再问。', timestamp: 2 }
  ],
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
const m = await page.evaluate(() => {
  const blocks = [...document.querySelectorAll('.narrative-block')]
  const summary = blocks.map((b) => {
    const speaker = b.querySelector('.narrative-block__speaker')?.textContent || ''
    return {
      kind: [...b.classList].find((c) => c.startsWith('narrative-block--'))?.replace('narrative-block--', ''),
      tone: [...b.classList].find((c) => c.startsWith('narrative-tone--'))?.replace('narrative-tone--', ''),
      groupStart: b.classList.contains('narrative-block--group-start'),
      speaker: speaker.trim().slice(0, 4)
    }
  })
  const closed = (el) => { const s = getComputedStyle(el); return ['Top','Right','Bottom','Left'].some((w) => parseFloat(s[`border${w}Width`]) > 0 && s.borderStyle !== 'none') }
  return {
    summary,
    bubbleBoxes: blocks.filter((b) => { const s = getComputedStyle(b); return s.borderRadius !== '0px' && parseFloat(s.borderRadius) > 4 || closed(b) }).length,
    actionStyle: (() => { const el = document.querySelector('.narrative-block--action'); if (!el) return null; const s = getComputedStyle(el); return { fontStyle: s.fontStyle, color: s.color } })(),
    thoughtStyle: (() => { const el = document.querySelector('.narrative-block--thought'); if (!el) return null; const s = getComputedStyle(el); return { fontStyle: s.fontStyle } })()
  }
})
await page.screenshot({ path: '/tmp/u4-dialogue-1440.png' })
console.log(JSON.stringify({ m, errs: errs.length }, null, 2))
await browser.close()
