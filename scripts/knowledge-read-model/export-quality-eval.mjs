#!/usr/bin/env node
/**
 * D46 quality evaluation export: generates blind-labelled evaluation inputs
 * comparing normal prompts vs structured IF prompts with the same facts and
 * model configuration. Does NOT execute model calls — only exports inputs.
 *
 *   npx vite-node scripts/knowledge-read-model/export-quality-eval.mjs [--json <path>] [--outdir <dir>]
 *
 * Exports per scenario:
 * - Normal prompt (no IF, baseline)
 * - IF prompt A (belief A)
 * - IF prompt B (belief B)
 * - A/A control (same belief both sides)
 * Labels are blinded for evaluation.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(scriptDir, '..', '..', 'tmp', 'quality-eval-export')

const SCENARIOS = [
  {
    id: 'S1-secret-relationship',
    title: '保密与关系',
    facts: [
      '莉娜保管着旧港钥匙，从未告诉任何人来历。',
      '艾德加不知道莉娜的秘密。',
      '两人曾合作但关系紧张。'
    ],
    beliefA: '莉娜选择保守秘密以维持表面和平',
    beliefB: '莉娜决定告诉艾德加真相以重建信任',
    normalPrompt: '写一段：莉娜面对艾德加时的内心挣扎和外在表现。'
  },
  {
    id: 'S2-storm-constraint',
    title: '暴雨停电约束',
    facts: [
      '暴雨导致全城停电。',
      '电梯停运，手机信号中断。',
      '莉娜被困在办公楼里。'
    ],
    beliefA: '莉娜在黑暗中主动寻找出路',
    beliefB: '莉娜决定等待救援',
    normalPrompt: '写一段：停电后莉娜在办公楼里的行动。'
  },
  {
    id: 'S3-no-worldbook',
    title: '无世界书普通稿',
    facts: [
      '这是一个普通城市场景。',
      '角色在咖啡厅讨论日常。'
    ],
    beliefA: '艾德加选择换个话题化解尴尬',
    beliefB: '艾德加决定直接说出想法',
    normalPrompt: '写一段：艾德加在咖啡厅与人交谈。'
  },
  {
    id: 'S4-birthday-promise',
    title: '生日守诺',
    facts: [
      '今天是艾德加的生日。',
      '莉娜答应陪他过生日。',
      '莉娜临时接到紧急任务。'
    ],
    beliefA: '莉娜守约陪艾德加过生日',
    beliefB: '莉娜取消约定去执行任务',
    normalPrompt: '写一段：莉娜在生日约定和任务之间的选择。',
    appendReq: '生日蛋糕不要被浪费'
  },
  {
    id: 'S5-rescue-cooperation',
    title: '合作救援',
    facts: [
      '一名矿工被困在地下。',
      '救援队需要两组人轮班。',
      '天气窗口只有六小时。'
    ],
    beliefA: '莉娜主动加入第一班救援',
    beliefB: '莉娜在地面负责通讯协调',
    normalPrompt: '写一段：救援行动中莉娜的角色。'
  },
  {
    id: 'S6-same-action-two-reasons',
    title: '同一行动两种理由',
    facts: [
      '艾德加每天去同一个咖啡厅。',
      '咖啡厅即将关门。'
    ],
    beliefA: '艾德加去咖啡厅是因为喜欢那里的氛围',
    beliefB: '艾德加去咖啡厅是为了暗中观察某人',
    normalPrompt: '写一段：艾德加去咖啡厅的场景。'
  }
]

// A/A control: same belief on both sides
const AA_CONTROLS = SCENARIOS.map((sc) => ({
  ...sc,
  beliefB: sc.beliefA // A/A control: same belief both sides
}))

const EXPORTS = []

let evalIndex = 0
function blindLabel() {
  // Blind labels: shuffled so the evaluator doesn't know which is A/B/normal
  const labels = ['α', 'β', 'γ']
  return labels[evalIndex % 3]
}

for (const sc of SCENARIOS) {
  const entry = {
    scenarioId: sc.id,
    title: sc.title,
    facts: sc.facts,
    modelConfig: { providerId: 'blind-eval', model: 'same-for-all' },
    normalPrompt: sc.normalPrompt,
    ifPromptA: sc.beliefA
      ? `按这个方向写：${sc.beliefA}。${sc.appendReq ? `\n追加要求：${sc.appendReq}` : ''}`
      : null,
    ifPromptB: sc.beliefB
      ? `按这个方向写：${sc.beliefB}。${sc.appendReq ? `\n追加要求：${sc.appendReq}` : ''}`
      : null
  }
  EXPORTS.push(entry)
  evalIndex += 1
}

// A/A control entries
for (const sc of AA_CONTROLS) {
  EXPORTS.push({
    scenarioId: sc.id + '-AA-control',
    title: sc.title + '（A/A 对照）',
    facts: sc.facts,
    modelConfig: { providerId: 'blind-eval', model: 'same-for-all' },
    normalPrompt: sc.normalPrompt,
    ifPromptA: sc.beliefA
      ? `按这个方向写：${sc.beliefA}`
      : null,
    ifPromptB: sc.beliefA
      ? `按这个方向写：${sc.beliefA}`
      : null
  })
  evalIndex += 1
}

// Write files
mkdirSync(outDir, { recursive: true })

// 1. Full export with labels
const labeledPath = resolve(outDir, 'labeled-eval-inputs.json')
writeFileSync(labeledPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  purpose: '质量评测输入导出（同事实同模型配置的普通 vs IF 对照）',
  total: EXPORTS.length,
  exports: EXPORTS
}, null, 2))

// 2. Blinded export (labels stripped, randomized order)
const blinded = EXPORTS.map((entry, index) => ({
  evalId: `eval-${String(index + 1).padStart(3, '0')}`,
  scenarioTitle: entry.title,
  prompt: entry.ifPromptA ?? entry.normalPrompt,
  promptType: entry.ifPromptA ? 'if' : 'normal',
  blindLabel: `版本 ${String.fromCharCode(65 + (index % 3))}`
}))
const blindedPath = resolve(outDir, 'blinded-eval-inputs.json')
writeFileSync(blindedPath, JSON.stringify(blinded, null, 2))

console.log(`\n=== D46 质量评测导出 ===`)
console.log(`有标签导出: ${labeledPath} (${EXPORTS.length} 项)`)
console.log(`盲化导出: ${blindedPath} (${blinded.length} 项)`)
console.log(`情境: ${SCENARIOS.map((s) => s.id).join(', ')}`)
console.log(`A/A 对照: ${AA_CONTROLS.length} 项`)
