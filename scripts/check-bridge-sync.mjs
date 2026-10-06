#!/usr/bin/env node
// 断言 pi 桥双副本同步：src 浏览器桥 ⇄ adapter/pinax-side 独立编译副本。
// JS 对：锚点行之上允许各自的 import/shim 头，之下必须逐字节一致；d.ts 对：整文件逐字节一致。
// 漂移即 exit 1——改动任一副本必须同步另一份；确需新增差异时先改本脚本的契约说明。
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ANCHOR = '// === bridge-sync：此行之下两副本必须逐字节一致（scripts/check-bridge-sync.mjs）==='

const pairs = [
  {
    name: 'bridge.js（锚点后逐字节）',
    anchor: true,
    files: [
      'src/services/agents/storyagent/piNarrativeAgentBridge.js',
      'adapters/pinax-adapter/pinax-side/pinaxNarrativeAgentBridge.js',
    ],
  },
  {
    name: 'bridge.d.ts（整文件逐字节）',
    anchor: false,
    files: [
      'src/services/agents/storyagent/piNarrativeAgentBridge.d.ts',
      'adapters/pinax-adapter/pinax-side/pinaxNarrativeAgentBridge.d.ts',
    ],
  },
]

let failed = false
for (const pair of pairs) {
  const [aPath, bPath] = pair.files
  const load = p => readFileSync(path.join(root, p), 'utf-8').split('\n')
  let a, b
  try {
    a = load(aPath)
    b = load(bPath)
  } catch (e) {
    console.error(`[bridge-sync] ${pair.name}: 读取失败——${e.message}`)
    failed = true
    continue
  }
  if (pair.anchor) {
    const ai = a.indexOf(ANCHOR)
    const bi = b.indexOf(ANCHOR)
    if (ai < 0 || bi < 0) {
      if (ai < 0) console.error(`[bridge-sync] ${pair.name}: ${aPath} 缺少同步锚点行`)
      if (bi < 0) console.error(`[bridge-sync] ${pair.name}: ${bPath} 缺少同步锚点行`)
      failed = true
      continue
    }
    a = a.slice(ai + 1)
    b = b.slice(bi + 1)
  }
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    if (a[i] !== b[i]) {
      console.error(`[bridge-sync] ${pair.name}: 第 ${i + 1} 行起不一致`)
      console.error(`  ${aPath}: ${JSON.stringify(a[i] ?? '<文件结束>')}`)
      console.error(`  ${bPath}: ${JSON.stringify(b[i] ?? '<文件结束>')}`)
      failed = true
      break
    }
  }
}

if (failed) {
  console.error('[bridge-sync] 双副本已漂移——同步两份后再提交')
  process.exit(1)
}
console.error('[bridge-sync] 双副本一致')
