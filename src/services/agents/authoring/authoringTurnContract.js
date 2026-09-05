// 回合意图契约（plan Task 2.1 / spec §6.2、§16）。
// 下一拍输入区只发出这里定义的标准 turn request，不拼 prompt；
// 对话必须有说话人与对象，心理限定视角可知人物，
// 用户键入的控制文本一律标记 control-intent，绝不允许逐字进入正文输出。

export const AUTHORING_TURN_KINDS = Object.freeze(['action', 'dialogue', 'thought', 'scene'])
export const AUTHORING_TURN_OPERATIONS = Object.freeze(['next-passage', 'rewrite-unit'])

export const CONTROL_INTENT_MARKER = 'control-intent'

// 控制协议 token 门禁（§16）：生成正文里出现内部协议标记即视为泄漏——
// 小节标题（【正文】【旁白】【回应】等）、
// BeatPlan 规划工具名与只读资料工具名。与 narrativePresentation 的
// sanitizeNarrativeSectionTitles 标题集合保持一致。
export const CONTROL_PROTOCOL_TOKEN_PATTERN = new RegExp(
  [
    '[【\\[](?:正文|旁白|回应|叙述|对白|正文开始|正文完|完)[】\\]]',
    '\\bsubmit_narrative_beat_plan\\b',
    '\\bbeatplan\\b',
    '\\b(?:world_lookup|history_lookup|politics_lookup)\\b'
  ].join('|'),
  'i'
)

function containsExperienceMetaEnding(prose) {
  return String(prose || '').split(/\r?\n/).some((line) => (
    /^(?:故事|叙事)(?:在这里|到这里)?(?:自然)?(?:停下|结束)[，,。 ]*(?:等待|等候)(?:着)?[^，。]{0,12}(?:的)?下一步(?:行动)?[。.]?$/.test(line.trim())
  ))
}

// turn kind → canonical narrative task id。
// dispatcher 按 task.id 分组到 narrative 工作流，
// narrativeSceneWorkflow 再把 task.id 映射为 NarrativeKernel intentMode。
export const AUTHORING_TURN_TASK_IDS = Object.freeze({
  continue: 'authoring.continue',
  action: 'authoring.advance',
  dialogue: 'authoring.advance',
  thought: 'authoring.simulate.character',
  scene: 'authoring.simulate.scene'
})

const TURN_KIND_SET = new Set(AUTHORING_TURN_KINDS)
const TURN_OPERATION_SET = new Set(AUTHORING_TURN_OPERATIONS)

function cleanText(value) {
  return String(value ?? '').trim()
}

function cleanSourceRefs(value) {
  if (!Array.isArray(value) || value.some((ref) => typeof ref !== 'string')) return null
  return value.map((ref) => cleanText(ref)).filter(Boolean)
}

function validateSelectedDirection(value) {
  if (value == null) return { valid: true, reason: '' }
  if (value?.kind !== 'authoring-scene-direction-selection' || Number(value?.version) !== 1) {
    return { valid: false, reason: 'turn-selected-direction-invalid' }
  }
  for (const field of ['id', 'title', 'action', 'immediateGain', 'cost', 'sessionFingerprint', 'directionSetFingerprint', 'fingerprint']) {
    if (!cleanText(value[field])) return { valid: false, reason: `turn-selected-direction-${field}-missing` }
  }
  if (cleanSourceRefs(value.evidenceRefs) === null || !value.evidenceRefs.length) {
    return { valid: false, reason: 'turn-selected-direction-evidence-invalid' }
  }
  if (cleanSourceRefs(value.entityRefs) === null) {
    return { valid: false, reason: 'turn-selected-direction-entities-invalid' }
  }
  return { valid: true, reason: '' }
}

// 校验已构建的 turn：返回 { valid, reason }，reason 为 typed 稳定标识。
export function validateAuthoringTurnIntent(turn) {
  if (!turn || !TURN_KIND_SET.has(turn.kind)) return { valid: false, reason: 'turn-kind-unknown' }
  if (!TURN_OPERATION_SET.has(turn.operation || 'next-passage')) return { valid: false, reason: 'turn-operation-unknown' }
  if (cleanSourceRefs(turn.sourceRefs) === null) return { valid: false, reason: 'turn-source-refs-invalid' }
  const directionValidation = validateSelectedDirection(turn.selectedDirection)
  if (!directionValidation.valid) return directionValidation
  if (turn.kind === 'dialogue') {
    const hasSpeaker = Boolean(cleanText(turn.actorId))
    const hasTarget = Boolean(cleanText(turn.targetId))
    if (!hasSpeaker || !hasTarget) {
      return { valid: false, reason: 'dialogue-requires-speaker-and-target' }
    }
  }
  if (turn.kind === 'thought' && !cleanText(turn.viewpointCharacterId)) {
    return { valid: false, reason: 'thought-requires-known-viewpoint' }
  }
  return { valid: true, reason: '' }
}

// 构建标准 turn request shape：
// { kind, actorId?, targetId?(对话必填), instruction, directorNote?, sourceRefs }
// 非空 instruction 标记为 control-intent（用户控制文本，禁止进入正文）。
export function buildAuthoringTurnIntent({
  operation = 'next-passage',
  kind = 'action',
  actorId = '',
  targetId = '',
  viewpointCharacterId = '',
  instruction = '',
  directorNote = '',
  sourceRefs = [],
  selectedDirection = null
} = {}) {
  if (!TURN_KIND_SET.has(kind)) return { ok: false, reason: 'turn-kind-unknown', turn: null }
  if (!TURN_OPERATION_SET.has(operation)) return { ok: false, reason: 'turn-operation-unknown', turn: null }
  const refs = cleanSourceRefs(sourceRefs)
  if (refs === null) return { ok: false, reason: 'turn-source-refs-invalid', turn: null }

  const normalizedInstruction = cleanText(instruction)
  const turn = Object.freeze({
    operation,
    kind,
    actorId: cleanText(actorId),
    targetId: cleanText(targetId),
    viewpointCharacterId: cleanText(viewpointCharacterId),
    instruction: normalizedInstruction,
    controlIntent: normalizedInstruction
      ? Object.freeze({ marker: CONTROL_INTENT_MARKER, text: normalizedInstruction, excludeFromProse: true })
      : null,
    directorNote: cleanText(directorNote),
    sourceRefs: Object.freeze(refs),
    selectedDirection: selectedDirection ? Object.freeze({
      ...selectedDirection,
      evidenceRefs: Object.freeze([...selectedDirection.evidenceRefs]),
      entityRefs: Object.freeze([...(selectedDirection.entityRefs || [])])
    }) : null
  })
  const validation = validateAuthoringTurnIntent(turn)
  if (!validation.valid) return { ok: false, reason: validation.reason, turn: null }
  return { ok: true, reason: '', turn }
}

function containsStandaloneControlText(prose, controlText) {
  const control = cleanText(controlText)
  if (!control) return false
  const text = String(prose ?? '').replace(/\r\n?/g, '\n')
  if (text.trim() === control) return true

  return text.split('\n').some((line) => {
    const normalizedLine = cleanText(line)
    if (normalizedLine === control) return true
    const labelled = normalizedLine.match(/^(?:用户(?:要求|指令)|写作指令|导演注)\s*[:：]\s*(.+)$/)
    return cleanText(labelled?.[1]) === control
  })
}

// 正文门禁（§16 错误与恢复的确定性检查）：
// 1. 控制协议 token（小节标题 / ::: marker / BeatPlan 与工具名）一律泄漏；
// 2. 用户指令或导演注作为独立控制行、元文本原样吐出时拒绝；
// 3. 指令中的事件或台词自然融入正文不算泄漏，否则正常实现用户意图也会被误杀。
export function proseContainsControlIntent(prose, turn) {
  const text = String(prose ?? '')
  if (CONTROL_PROTOCOL_TOKEN_PATTERN.test(text)) return true
  if (containsExperienceMetaEnding(text)) return true
  const controlText = turn?.controlIntent?.text
  if (turn?.controlIntent?.excludeFromProse && containsStandaloneControlText(text, controlText)) return true
  const note = cleanText(turn?.directorNote)
  if (containsStandaloneControlText(text, note)) return true
  return false
}
