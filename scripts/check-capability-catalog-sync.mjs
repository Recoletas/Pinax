#!/usr/bin/env node
// 能力目录单源化校验（W1-2）：canonical（shared/agentCapabilityContract.js，49 项）是能力任务 id 的
// 唯一源；工具契约表（shared/capabilityToolContracts.js，20 项）是派生视图——「有 agent 提交工具的任务」
// 子集，键一律用 canonical id。派生规则：工具侧每个 taskType 必须直接命中 canonical（零豁免）。
// D7 裁定（2026-10-08）：原 experience.next-actions / experience.emergence 两把工具键为不可达死键
// （服务侧经 validateServerTaskType 先行解析 canonical 后再查表），已替换为 canonical 键；
// authoring.emergence 由此首获能力路径（与 next-actions 对等），豁免清单清零。
// kit 的 capability-manifest@1 是第三个目录（agent 工具环只读查询工具，id pattern 不允许点），不同轴，不合并。
// 运行：node scripts/check-capability-catalog-sync.mjs
import assert from 'node:assert/strict'
import { listCanonicalAgentTaskIds, resolveLegacyTaskAlias } from '../shared/agentCapabilityContract.js'
import { CAPABILITY_TOOL_SPECS } from '../shared/capabilityToolContracts.js'

let passed = 0
const check = (name, condition) => { assert.ok(condition, name); passed += 1; console.log(`  ✓ ${name}`) }

const canonicalIds = listCanonicalAgentTaskIds()
const canonicalSet = new Set(canonicalIds)
const toolIds = Object.keys(CAPABILITY_TOOL_SPECS)
const toolSet = new Set(toolIds)
const intersection = toolIds.filter((id) => canonicalSet.has(id))
const onlyTools = toolIds.filter((id) => !canonicalSet.has(id))
const onlyCanonical = canonicalIds.filter((id) => !toolSet.has(id))

console.log(`目录账：canonical=${canonicalIds.length}  tools=${toolIds.length}  交集=${intersection.length}  只在工具侧=${onlyTools.length}  只在 canonical 侧=${onlyCanonical.length}`)

console.log('[1] 派生关系：工具侧全部直接命中 canonical（D7 裁定后零豁免，逐项直查）')
for (const id of toolIds) check(`${id} ∈ canonical`, canonicalSet.has(id))

console.log('[2] 别名闭合：工具侧全部 id 经别名表解析后命中 canonical（防孤儿键）')
const unresolved = toolIds.filter((id) => !canonicalSet.has(resolveLegacyTaskAlias(id)))
check(`全部 ${toolIds.length} 项解析闭合`, unresolved.length === 0)

console.log(`capability-catalog-sync: ${passed} 项全部通过`)
