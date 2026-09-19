#!/usr/bin/env node
/* eslint-disable no-console */
// S05（助手写作 Skills 接入计划 §7）完成证据 eval：
//   1. 三个目标方法有对照样本——每个注册方法都有方法文本、通过描述校验
//      （禁路径/shell/JS/网络地址），组合结果只含当前方法与公共片段；
//   2. 检查器整合——本地校对复用既有 authoringReviewSession 规则（不重复
//      造轮子），退化检测经 S02 适配模块按块扫描并保留 locator。
import { createAuthoringReviewSession } from '../src/services/agents/authoring/authoringReviewSession.js'
import {
  getWritingSkillMethodText,
  validateRegisteredWritingSkillMethods,
  composeWritingSkillReviewPrompt,
  WRITING_SKILL_COMMON_FRAGMENT_IDS
} from '../src/services/agents/authoring/writingSkillMethods/writingSkillMethods.js'
import { runWritingSkillChecks } from '../src/services/agents/authoring/writingSkillChecks/runWritingSkillChecks.js'
import { createWritingSkillFixtures } from './writing-skills/fixtures-method-samples.mjs'
import { WRITING_SKILL_METHODS } from '../shared/writingSkillMethodContract.js'

let failures = 0
function check(label, pass, detail = '') {
  if (!pass) failures += 1
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}${!pass ? ` — ${String(detail).slice(0, 300)}` : ''}`)
}

// 1) 注册方法与文本一一对应且全部通过描述校验
const registration = validateRegisteredWritingSkillMethods()
check('注册方法文本齐全且通过描述校验', registration.ok, JSON.stringify(registration.problems))
check('三个方法各有非空方法文本', WRITING_SKILL_METHODS.every((method) => {
  const record = getWritingSkillMethodText(method.methodTextId)
  return record && record.methodText.length >= 120
}))

// 2) 组合：只含当前方法 + 公共片段；其他方法文本不进入
const styleDirectives = [
  { dimension: 'pacing', directive: '本次只看对话节奏。', source: 'invocation' },
  { dimension: 'pov', directive: '别改台词。', source: 'book-rule' }
]
const composed = composeWritingSkillReviewPrompt({
  skillId: 'setup-payoff',
  skillVersion: 1,
  goal: '看本章承诺是否兑现，别改台词。',
  styleDirectives,
  scopeKind: 'selection'
})
const currentMethodText = getWritingSkillMethodText('writingSkillMethods.setupPayoff')
const otherMethodText = getWritingSkillMethodText('writingSkillMethods.pacingRedundancy')
check('组合包含目标与当前方法文本', composed.ok
  && composed.prompt.includes('看本章承诺是否兑现')
  && composed.prompt.includes(currentMethodText.title)
  && composed.prompt.includes('登记目标范围内的承诺与伏笔'))
check('其他方法文本不进入组合', !composed.prompt.includes(otherMethodText.methodText.slice(0, 24))
  && !composed.prompt.includes('逐窗读完正文'))
check('公共引用/文风/信息边界片段齐备', WRITING_SKILL_COMMON_FRAGMENT_IDS.every((id) => composed.sections.fragments[id]))
check('风格指令按来源与维度进入组合', composed.prompt.includes('[invocation][pacing] 本次只看对话节奏。')
  && composed.prompt.includes('[book-rule][pov] 别改台词。'))
check('未知方法组合失败', composeWritingSkillReviewPrompt({
  skillId: 'no-such', skillVersion: 1, goal: 'x'
}).reason === 'skill-unknown-or-version-mismatch')
check('缺目标组合失败', composeWritingSkillReviewPrompt({
  skillId: 'setup-payoff', skillVersion: 1, goal: '  '
}).reason === 'goal-missing')

// 3) 检查器整合对照样本：既有本地校对 + 退化检测
const { source, quoteBreakBlock, degenerationBlocks, cleanBlocks } = createWritingSkillFixtures()
const session = createAuthoringReviewSession({ source, maxNodesPerWindow: 3, windowOverlap: 0 })
const sampled = runWritingSkillChecks({
  session,
  blocks: [quoteBreakBlock, ...degenerationBlocks, ...cleanBlocks]
})
check('既有本地校对规则原样生效（引号/标点/重复）',
  sampled.proofingFindings.length >= 1
  && sampled.proofingFindings.every((finding) => finding.source === 'local'))
const degenerationTypes = new Set(sampled.degenerationFindings.map((finding) => finding.type))
check('退化检测对照样本命中复读/截断/占位',
  degenerationTypes.has('verbatim-repeat') && degenerationTypes.has('truncated')
  && degenerationTypes.has('placeholder-leak'),
  JSON.stringify([...degenerationTypes]))
check('退化 finding 保留 locator 且可逐字核验',
  sampled.degenerationFindings.every((finding) => {
    const node = [quoteBreakBlock, ...degenerationBlocks].find((block) => block.nodeId === finding.nodeId)
    return node && node.text.slice(finding.locator.startOffset, finding.locator.endOffset) === finding.locator.exact
  }))
check('干净样本零退化 finding', sampled.degenerationFindings.every(
  (finding) => !cleanBlocks.some((block) => block.nodeId === finding.nodeId)))
check('检查器只产出两类已注册来源',
  sampled.degenerationFindings.every((finding) => finding.checker === 'writingSkillChecks.degeneration'))

if (failures) {
  console.log(`writing-skills method composition eval: ${failures} 个失败`)
  process.exitCode = 1
} else {
  console.log('writing-skills method composition eval: 全部通过')
}
