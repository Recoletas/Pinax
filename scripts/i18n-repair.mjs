// 并行会话反复写入坏 JSON——跑 `node scripts/i18n-repair.mjs` 即修复。文件正被并发写入时自动重试到稳定。
import fs from 'node:fs'
const f = 'src/i18n/en.json'
let raw = fs.readFileSync(f, 'utf8')

function objectBounds(text) {
  let start = -1, depth = 0, inString = false, escape = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{') { if (depth === 0) start = i; depth++ }
    if (ch === '}') { depth--; if (depth === 0) return { start, end: i + 1 } }
  }
  return null
}

function attempt(text) {
  const bounds = objectBounds(text)
  if (!bounds) return null
  let fixed = text.slice(bounds.start, bounds.end)
  const lines = fixed.split('\n')
  for (let i = 0; i < lines.length - 1; i++) {
    const cur = lines[i].trimEnd(), next = lines[i + 1]
    if (/^".*:.*".*$/.test(cur) && cur.endsWith('"') && /^\s*"/.test(next)) lines[i] = cur + ','
  }
  fixed = lines.join('\n')
  return JSON.parse(fixed)
}

let obj = null
for (let round = 0; round < 8; round += 1) {
  raw = fs.readFileSync(f, 'utf8')
  try {
    obj = JSON.parse(raw)
    console.log('en.json 本来就合法——无修复需要')
    break
  } catch { /* 继续修复 */ }
  try {
    obj = attempt(raw)
    if (obj) {
      // 并发守护：写回前确认文件自读取后未被改写；被改写则重读重来
      if (fs.readFileSync(f, 'utf8') !== raw) { console.log(`[round ${round}] 文件在修复期间又被并发改写——重读`); continue }
      fs.writeFileSync(f, JSON.stringify(obj, null, 2) + '\n')
      console.log('已修复（配平截断 + 补逗号）')
      break
    }
  } catch (e) {
    console.log(`[round ${round}] 仍非法（${e.message.slice(0, 60)}）——文件在并发写入，重读`)
  }
  await new Promise((resolve) => setTimeout(resolve, 300))
}
if (!obj) { console.error('多次尝试后仍未稳定——等并行会话写完再跑'); process.exit(1) }
