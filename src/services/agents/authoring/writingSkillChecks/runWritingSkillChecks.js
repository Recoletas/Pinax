// 写作 Skills 检查器整合（S05）：把既有本地校对（引号/标点/重复，来自
// authoringReviewSession，不重复实现）与 S02 适配的退化指纹检测组合为
// 一个批次级入口。退化 findings 保持 S02 的 locator 形态并标注来源
// checker；与审稿 finding schema 的合并在 S07 做，这里不提前混型。
import { collectLocalAuthoringProofingFindings } from '../authoringReviewSession.js'
import { scanDegenerationFindings } from './checkDegeneration.js'

export const WRITING_SKILL_CHECKER_IDS_USED = Object.freeze([
  'local.proofing',
  'writingSkillChecks.degeneration'
])

const MAX_DEGENERATION_FINDINGS_PER_BLOCK = 4

export function runWritingSkillChecks({ session, blocks = null } = {}) {
  // 现有标点/引号/重复规则原样复用：session 级、已按审稿 finding schema 归一。
  const proofingFindings = session ? collectLocalAuthoringProofingFindings(session) : []
  const degenerationFindings = []
  for (const block of (Array.isArray(blocks) ? blocks : [])) {
    if (!block?.nodeId || typeof block.text !== 'string' || !block.text.trim()) continue
    for (const finding of scanDegenerationFindings(block.text).slice(0, MAX_DEGENERATION_FINDINGS_PER_BLOCK)) {
      degenerationFindings.push({
        checker: 'writingSkillChecks.degeneration',
        type: finding.type,
        severity: finding.severity,
        message: finding.message,
        excerpt: finding.excerpt,
        nodeId: block.nodeId,
        locator: { ...finding.locator }
      })
    }
  }
  return { proofingFindings, degenerationFindings }
}
