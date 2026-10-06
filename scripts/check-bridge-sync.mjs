#!/usr/bin/env node
// 双副本同步门禁：Pinax 浏览器桥（canonical 用户侧）⇄ kit pinax-side 桥（kit 承载运行时的独立编译副本）。
// P2 口径统一后副本侧在 storyflow-kit 仓；kit 仓不在场时显式提示并跳过（环境性豁免），在场漂移即 exit 1。
// 纪律：改动任一侧必须同步另一份；确需新增差异时先改本脚本的契约说明。
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const kitRoot = path.resolve(root, '..', 'storyflow-kit')
const ANCHOR = '// === bridge-sync：此行之下两副本必须逐字节一致（scripts/check-bridge-sync.mjs）==='

const pairs = [
  {
    name: 'bridge.js（锚点后逐字节；Pinax 浏览器桥 ⇄ kit pinax-side）',
    mode: 'anchor',
    files: [
      'src/services/agents/storyagent/piNarrativeAgentBridge.js',
      'storyharness/src/pinax/pinax-side/pinaxNarrativeAgentBridge.js',
    ],
  },
  {
    name: 'bridge.d.ts（整文件逐字节）',
    mode: 'bytes',
    files: [
      'src/services/agents/storyagent/piNarrativeAgentBridge.d.ts',
      'storyharness/src/pinax/pinax-side/pinaxNarrativeAgentBridge.d.ts',
    ],
  },
]

let failed = false
let skipped = 0
for (const pair of pairs) {
  const [pinaxPath, kitPath] = pair.files
  const aPath = path.join(root, pinaxPath)
  const bPath = path.join(kitRoot, kitPath)
  if (!existsSync(bPath)) {
    console.error(`[sync] ${pair.name}: kit 仓不在场（${kitRoot}）——跳过（环境性豁免）`)
    skipped += 1
    continue
  }
  const load = p => readFileSync(p, 'utf-8').replace(/\r\n/g, '\n').split('\n')
  let a, b
  try {
    a = load(aPath)
    b = load(bPath)
  } catch (e) {
    console.error(`[sync] ${pair.name}: 读取失败——${e.message}`)
    failed = true
    continue
  }
  if (pair.mode === 'anchor') {
    const ai = a.indexOf(ANCHOR)
    const bi = b.indexOf(ANCHOR)
    if (ai < 0 || bi < 0) {
      if (ai < 0) console.error(`[sync] ${pair.name}: ${pinaxPath} 缺少同步锚点行`)
      if (bi < 0) console.error(`[sync] ${pair.name}: ${kitPath} 缺少同步锚点行`)
      failed = true
      continue
    }
    a = a.slice(ai + 1)
    b = b.slice(bi + 1)
  }
  const max = Math.max(a.length, b.length)
  let drifted = false
  for (let i = 0; i < max; i++) {
    if (a[i] !== b[i]) {
      console.error(`[sync] ${pair.name}: 第 ${i + 1} 行起不一致`)
      console.error(`  ${pinaxPath}: ${JSON.stringify(a[i] ?? '<文件结束>')}`)
      console.error(`  ${kitPath}: ${JSON.stringify(b[i] ?? '<文件结束>')}`)
      drifted = true
      break
    }
  }
  if (drifted) failed = true
}

if (failed) {
  console.error('[sync] 副本已漂移——同步单源与副本后再提交')
  process.exit(1)
}
console.error(`[sync] 全部一致（${pairs.length - skipped}/${pairs.length} 对检查${skipped ? `，${skipped} 对环境性跳过` : ''}）`)
