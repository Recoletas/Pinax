/* global process */

// B 线 store 公开表面统计（统一口径）：解析 defineStore 的顶层 state 键与
// actions，比较两个 git 引用。唯一统计方法：state 键 = state: () => ({ 块内
// 缩进 4 的 `key:` 行；actions = actions: { 块内缩进 4 的函数定义行。
// 运行：node scripts/experience-store-api-surface.mjs [refA] [refB]
// 默认比较工作树与基线 37e0679。

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REF_A = process.argv[2] || '37e0679'
const REF_B = process.argv[3] || 'WORKTREE'
const FILE = 'src/stores/gameStore.js'

// 不经 shell：git ref/路径走参数数组，工作树直接读文件（O 复审 §6）
function loadSource(ref) {
  if (ref === 'WORKTREE') return readFileSync(join(ROOT, FILE), 'utf8')
  return execFileSync('git', ['-C', ROOT, 'show', `${ref}:${FILE}`], { encoding: 'utf8' })
}

function parseSurface(src) {
  const stateStart = src.indexOf('state: () => ({')
  const actionsMarker = src.indexOf('actions: {', stateStart)
  const stateBlock = src.slice(stateStart, actionsMarker)
  const stateKeys = [...stateBlock.matchAll(/^    ([a-zA-Z_][A-Za-z0-9_]*):/gm)].map((m) => m[1])
  const actionsBlock = src.slice(actionsMarker)
  const actions = [...actionsBlock.matchAll(/^    (?:async )?([a-zA-Z_][A-Za-z0-9_]*)\(/gm)].map((m) => m[1])
  return { stateKeys: [...new Set(stateKeys)], actions: [...new Set(actions)] }
}

const a = parseSurface(loadSource(REF_A))
const b = parseSurface(loadSource(REF_B))
const diff = (setA, setB) => [...setB.filter((x) => !setA.includes(x))]
// removed = A 有 B 无；added = B 有 A 无（方向以比较目标 WORKTREE 为准）
const removed = diff(b.stateKeys, a.stateKeys)
const added = diff(a.stateKeys, b.stateKeys)
const actionsRemoved = diff(b.actions, a.actions)
const actionsAdded = diff(a.actions, b.actions)

console.log(`comparing ${REF_A} -> ${REF_B}`)
console.log(`state keys: ${a.stateKeys.length} -> ${b.stateKeys.length} (removed: ${removed.length ? removed.join(',') : 'none'}, added: ${added.length ? added.join(',') : 'none'})`)
console.log(`actions: ${a.actions.length} -> ${b.actions.length} (removed: ${actionsRemoved.length ? actionsRemoved.join(',') : 'none'}, added: ${actionsAdded.length ? actionsAdded.join(',') : 'none'})`)
if (removed.length || added.length || actionsRemoved.length || actionsAdded.length) process.exitCode = 1
