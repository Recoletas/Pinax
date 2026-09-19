// 写作 Skills 执行判定（验收返工，阻断问题 1）：只在方法组合器/检查器
// 真实进入该次模型链时才允许回带 enforcement='applied' 的协商回执；仅通过
// 校验时是 'validated-only'，杜绝「已确认执行、实际没有执行」的静默降级。
// 当前真实接入的能力：goal-review × canonical 章级审稿任务——组合后的方法
// 指令并入问题文本，退化检查按请求携带的审查目标块真实执行并附在结果上。
import {
  WRITING_SKILL_ENFORCEMENT_STATES,
  writingSkillAck
} from '../../shared/writingSkillMethodContract.js'
import { composeWritingSkillReviewPrompt } from '../../src/services/agents/authoring/writingSkillMethods/writingSkillMethods.js'
import { scanDegenerationFindings } from '../../src/services/agents/authoring/writingSkillChecks/checkDegeneration.js'

// 组合器与退化检查都是纯函数且只依赖 shared/纯 src 模块，可以在服务端
// 无浏览器环境真实执行；本地引号/标点检查是 session 域职责（客户端
// merge 时执行），这里不重复实现。
const ENFORCEABLE_TASK_TYPES = new Set(['authoring.review.chapter'])

export function canEnforceWritingSkill({ taskType, invocation }) {
  return Boolean(invocation)
    && invocation.taskKind === 'goal-review'
    && ENFORCEABLE_TASK_TYPES.has(String(taskType || ''))
}

/**
 * 依据冻结输入真实执行方法组合与检查器。
 * @returns {{ enforcement: 'applied'|'validated-only'|null, ack: object|null,
 *   question: string, reason: string,
 *   writingSkillChecks: {checker: string, findings: Array}|null }}
 */
export function applyWritingSkillEnforcement({ taskType, question, invocation, reviewBlocks = null } = {}) {
  if (!invocation) {
    return { enforcement: null, ack: null, question: String(question || ''), reason: '', writingSkillChecks: null }
  }
  if (!canEnforceWritingSkill({ taskType, invocation })) {
    return {
      enforcement: WRITING_SKILL_ENFORCEMENT_STATES.VALIDATED_ONLY,
      ack: writingSkillAck(invocation),
      question: String(question || ''),
      reason: 'task-kind-not-enforced-for-task-type',
      writingSkillChecks: null
    }
  }
  const composed = composeWritingSkillReviewPrompt({
    skillId: invocation.skillId,
    skillVersion: invocation.skillVersion,
    goal: invocation.goal,
    scopeKind: invocation.scope?.kind || 'chapter'
  })
  if (!composed.ok) {
    return {
      enforcement: WRITING_SKILL_ENFORCEMENT_STATES.VALIDATED_ONLY,
      ack: writingSkillAck(invocation),
      question: String(question || ''),
      reason: `composition-failed:${composed.reason}`,
      writingSkillChecks: null
    }
  }
  const findings = []
  for (const block of (Array.isArray(reviewBlocks) ? reviewBlocks : [])) {
    if (!block?.nodeId || typeof block.text !== 'string' || !block.text.trim()) continue
    for (const finding of scanDegenerationFindings(block.text).slice(0, 4)) {
      findings.push({
        nodeId: block.nodeId,
        type: finding.type,
        severity: finding.severity,
        message: finding.message,
        excerpt: finding.excerpt,
        locator: { ...finding.locator }
      })
    }
  }
  return {
    enforcement: WRITING_SKILL_ENFORCEMENT_STATES.APPLIED,
    ack: writingSkillAck(invocation, WRITING_SKILL_ENFORCEMENT_STATES.APPLIED),
    question: `${String(question || '').trim()}\n\n${composed.prompt}`,
    reason: '',
    writingSkillChecks: findings.length ? { checker: 'writingSkillChecks.degeneration', findings } : null
  }
}
