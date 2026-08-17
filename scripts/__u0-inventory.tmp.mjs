// U0：按钮语义清单 + 正文计算样式 + 四宽度截图
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
const BASE = 'http://127.0.0.1:5173'
const mk = (id, messages) => ({ id, title: 'U0', createdAt: Date.now(), updatedAt: Date.now(), messages, chatHistory: [], runtimeState: {}, worldState: {} })
const dialogue = [
  { id: 'u1', role: 'user', content: '我向掌柜打听西边的路。', timestamp: 1 },
  { id: 'a1', role: 'assistant', name: '旁白', content: ':::narration\n掌柜放下手里的算盘，抬眼打量了他一番。\n:::dialogue|掌柜\n「西边的路不好走，客官要去哪儿？」\n:::action|掌柜\n他用抹布擦了擦柜台。\n:::dialogue|阿贵\n「我陪柳公子去！」\n:::dialogue|掌柜\n「你这小子，码头还没卸完货呢。」\n:::thought|柳洵\n西边……纸条上只有两个字。\n:::narration\n柳洵把纸条收回袖口，没有再问。', timestamp: 2 }
]
const longText = Array.from({ length: 12 }, (_, i) => `第${i + 1}段：猎户二人警觉地站起身，烟杆磕在鞋底。柳洵认出左边那人。`).join('\n')

const browser = await chromium.launch()
const out = { buttons: [], prose: null, counts: {} }
for (const width of [1440, 1280, 980, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, isMobile: width === 390, hasTouch: width === 390 })
  const page = await ctx.newPage()
  await page.goto(BASE)
  await page.evaluate((s) => localStorage.setItem('writing_sessions', JSON.stringify([s])), mk('u0-dlg', dialogue))
  await page.goto(`${BASE}/experience`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(2200)
  if (width === 1440) {
    // 按钮清单：可见按钮的闭合边框与语义线索
    out.buttons = await page.evaluate(() => {
      return [...document.querySelectorAll('.game-page button, .game-page select, .game-page label.ws-topstrip__reading-control')]
        .filter((el) => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight
        })
        .slice(0, 40)
        .map((el) => {
          const cs = getComputedStyle(el)
          const hasBorder = ['top', 'right', 'bottom', 'left'].some((s) => parseFloat(cs[`border${s[0].toUpperCase()}${s.slice(1)}Width`]) > 0)
          return {
            cls: String(el.className).split(' ').slice(0, 2).join('.'),
            label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 10),
            closedBorder: hasBorder && cs.borderStyle !== 'none',
            bg: cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? 'filled' : 'transparent'
          }
        })
    })
    // 正文计算样式
    out.prose = await page.evaluate(() => {
      const pick = (sel, props) => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); return Object.fromEntries(props.map((p) => [p, cs[p]])) }
      return {
        narration: pick('.narrative-block--narration', ['fontFamily', 'fontSize', 'lineHeight', 'fontWeight', 'color', 'marginBottom', 'textIndent']),
        dialogue: pick('.narrative-block--dialogue', ['fontSize', 'fontWeight', 'color', 'fontStyle', 'margin']),
        speaker: pick('.narrative-block__speaker', ['fontSize', 'fontWeight', 'color']),
        player: pick('.prose--user .prose__body', ['fontWeight', 'color', 'paddingLeft'])
      }
    })
  }
  await page.screenshot({ path: `/tmp/u0-baseline/exp-${width}.png` })
  await ctx.close()
}
out.counts = { experienceBorderDecls: 142, inputAreaBorderDecls: 86, narrativeTurnBorderDecls: 16 }
writeFileSync('/tmp/u0-baseline/inventory.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify({ buttonCount: out.buttons.length, withBorders: out.buttons.filter((b) => b.closedBorder).length, prose: out.prose }, null, 2))
await browser.close()
