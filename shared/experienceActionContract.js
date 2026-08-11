/**
 * 体验页输入动作契约（酒馆对齐计划 R6）。
 *
 * 定义 typed ExperienceAction —— 所有按钮、快捷键和文本命令调用同一 action dispatcher
 * （gameStore.executeExperienceAction），避免命令语义散落各处。
 *
 * 首批动作（R6，复用现有 store 方法，不新增 UI）：
 *   stop           停止当前生成
 *   retry          重试当前回合
 *   continue       继续上一回复
 *   branch         从当前回合建立分支
 *   director-note  设置仅下一轮导演注
 *   speaker        手动点名角色（仅当前回合）
 *   compress       压缩当前上下文
 *   export         导出当前会话
 */

export const EXPERIENCE_ACTION_TYPES = Object.freeze([
  'stop',
  'retry',
  'continue',
  'branch',
  'director-note',
  'speaker',
  'compress',
  'export'
])

export function normalizeExperienceAction(input) {
  if (!input || typeof input !== 'object') return null
  const type = String(input.type || '').trim()
  if (!EXPERIENCE_ACTION_TYPES.includes(type)) return null
  return {
    type,
    // payload 透传（各动作自定义），不在此校验具体字段
    payload: input.payload && typeof input.payload === 'object' ? input.payload : {},
    // 动作来源（按钮/快捷键/命令），仅审计用
    source: String(input.source || 'manual'),
  }
}

export function isExperienceActionType(value) {
  return EXPERIENCE_ACTION_TYPES.includes(String(value || ''))
}
