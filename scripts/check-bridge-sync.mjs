#!/usr/bin/env node
// 双副本/跨仓同步门禁：断言 pinax-adapter 与 kit、Pinax shared 之间所有「单源+副本」面保持一致。
// 副本纪律：改动任一侧必须同步另一份；确需新增差异时先改本脚本的契约说明。
// 对 pair 类型：
//   anchor   — 锚点行之上允许各自头部（import/shim），之下逐字节一致
//   bytes    — 整文件逐字节一致
//   optional — 跨仓对（storyflow-kit）：kit 仓不在场时显式提示并跳过（环境性豁免，非静默通过）；在场漂移即 fail
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const kitRoot = path.resolve(root, '..', 'storyflow-kit')
const ANCHOR = '// === bridge-sync：此行之下两副本必须逐字节一致（scripts/check-bridge-sync.mjs）==='
const llmAnchor = null // llm.ts 无锚点——整文件逐字节

const pairs = [
  {
    name: 'bridge.js（锚点后逐字节）',
    mode: 'anchor',
    optional: false,
    files: [
      'src/services/agents/storyagent/piNarrativeAgentBridge.js',
      'adapters/pinax-adapter/pinax-side/pinaxNarrativeAgentBridge.js',
    ],
  },
  {
    name: 'bridge.d.ts（整文件逐字节）',
    mode: 'bytes',
    optional: false,
    files: [
      'src/services/agents/storyagent/piNarrativeAgentBridge.d.ts',
      'adapters/pinax-adapter/pinax-side/pinaxNarrativeAgentBridge.d.ts',
    ],
  },
  {
    name: 'llm.ts provider 注册表（kit 单源 ⇄ adapter vendor）',
    mode: 'bytes',
    optional: true,
    files: [
      'storyharness/src/llm.ts',
      'adapters/pinax-adapter/src/llm.ts',
    ],
  },
  {
    name: 'capability-manifest@1 契约（kit 单源 ⇄ adapter fixture）',
    mode: 'bytes',
    optional: true,
    files: [
      'contracts/capability-manifest.schema.json',
      'adapters/pinax-adapter/test/fixtures/capability-manifest.schema.json',
    ],
  },
  {
    name: 'beat-plan@1 契约（kit 单源 ⇄ adapter fixture）',
    mode: 'bytes',
    optional: true,
    files: [
      'contracts/beat-plan.schema.json',
      'adapters/pinax-adapter/test/fixtures/beat-plan.schema.json',
    ],
  },
]

let failed = false
let skipped = 0
for (const pair of pairs) {
  const [aPath, bPath] = pair.files
  const apath = pair.optional ? path.join(kitRoot, aPath) : path.join(root, aPath)
  const bpath = path.join(root, bPath)
  if (pair.optional && !existsSync(apath)) {
    console.error(`[sync] ${pair.name}: kit 仓不在场（${kitRoot}）——跳过（环境性豁免）`)
    skipped += 1
    continue
  }
  const load = p => readFileSync(p, 'utf-8').replace(/\r\n/g, '\n').split('\n')
  let a, b
  try {
    a = load(apath)
    b = load(bpath)
  } catch (e) {
    console.error(`[sync] ${pair.name}: 读取失败——${e.message}`)
    failed = true
    continue
  }
  if (pair.mode === 'anchor') {
    const ai = a.indexOf(ANCHOR)
    const bi = b.indexOf(ANCHOR)
    if (ai < 0 || bi < 0) {
      if (ai < 0) console.error(`[sync] ${pair.name}: ${aPath} 缺少同步锚点行`)
      if (bi < 0) console.error(`[sync] ${pair.name}: ${bPath} 缺少同步锚点行`)
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
      console.error(`  ${aPath}: ${JSON.stringify(a[i] ?? '<文件结束>')}`)
      console.error(`  ${bPath}: ${JSON.stringify(b[i] ?? '<文件结束>')}`)
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
