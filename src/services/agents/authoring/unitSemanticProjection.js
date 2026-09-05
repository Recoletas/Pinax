// F1-4: ephemeral semantic/boundary projection for one editable Ghost draft.
// It never persists classifications and never calls a provider. writingUnit is
// kept as a stable edit/transaction container; scene and beat remain the
// semantic owners above it.

export const UNIT_SEMANTIC_PROJECTION_VERSION = 1

const FUNCTION_AXES = Object.freeze(['transition', 'dialogue', 'action', 'reflection', 'exposition'])
const SUBJECT_AXES = Object.freeze(['character', 'environment', 'location', 'object', 'event'])
const EFFECT_AXES = Object.freeze(['depicts', 'reveals', 'relates', 'changes'])

function text(value) {
  return String(value ?? '')
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
}

function fingerprint(prefix, value) {
  const source = JSON.stringify(stableValue(value))
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const child of Object.values(value)) deepFreeze(child, seen)
  return Object.isFrozen(value) ? value : Object.freeze(value)
}

function paragraphsFromText(value) {
  const source = text(value)
  const matches = [...source.matchAll(/\S[\s\S]*?(?=\n[ \t]*\n|$)/g)]
  return matches.map((match, index) => {
    const raw = match[0].replace(/[ \t]+$/g, '')
    const start = match.index || 0
    return {
      id: fingerprint('paragraph', { index, raw }),
      index,
      text: raw,
      start,
      end: start + raw.length
    }
  })
}

function has(pattern, value) {
  return pattern.test(value)
}

function paragraphAxes(paragraph) {
  const value = paragraph.text.trim()
  const functions = []
  const subjects = []
  const effects = []

  const transition = has(/^(?:次日|翌日|第二天|与此同时|片刻后|不久后|几日后|后来|转眼|回到|抵达|离开后|清晨|黎明|黄昏|夜深|入夜|当.+(?:来到|抵达|回到))/u, value)
  const dialogue = has(/^[“「『]/u, value)
    || ((value.match(/[“”「」『』]/gu) || []).length >= 2 && value.length <= 220)
  const reflection = has(/(?:想到|想起|意识到|明白|怀疑|觉得|记得|心想|不由得|仿佛)/u, value)
  const action = has(/(?:走进|走出|推开|关上|拿起|放下|冲向|转身|抬手|抓住|拔出|躲开|追上|停下|敲响|点燃|熄灭|倒下|坍塌|破裂|打开|锁住|移开|按下|击中|进入|离开|拉起|封锁|翻遍|塞给)/u, value)
  if (transition) functions.push('transition')
  if (dialogue) functions.push('dialogue')
  if (action) functions.push('action')
  if (reflection) functions.push('reflection')
  if (!functions.length || has(/(?:是|有|显得|像|仿佛|弥漫|笼罩|映着|排列|坐落|悬着|铺着)/u, value)) functions.push('exposition')

  if (dialogue || has(/(?:他|她|他们|她们|男人|女人|少年|少女|老人|同伴|守卫|调查员|名字)/u, value)) subjects.push('character')
  if (has(/(?:雨|雪|风|雾|光|影|潮|天空|夜色|空气|气味|声响|温度|灰尘|穹顶|墙面|地面|书架)/u, value)) subjects.push('environment')
  if (transition || has(/(?:房间|大厅|街道|港口|税务所|档案室|门外|楼上|楼下|城内|广场|走廊|庭院|码头)/u, value)) subjects.push('location')
  if (has(/(?:门|钥匙|总册|书|纸|信|刀|剑|枪|灯|石柱|暗格|箱|杯|桌|椅|绳)/u, value)) subjects.push('object')
  if (transition || has(/(?:事件|爆炸|失窃|追捕|袭击|钟声|异动|争执|事故|死亡|坍塌)/u, value)) subjects.push('event')
  if (!subjects.length) subjects.push('character')

  const explicitChange = has(/(?:被推开|被关上|被点燃|被熄灭|被打破|被摧毁|被移开|被锁住|倒塌|坍塌|碎裂|破裂|熄灭|亮起|死亡|失踪|没有来|退(?:出|到)|露出|拉起|封锁|离开了|进入了|打开了|关闭了|烧毁|淹没|改变了|成为了)/u, value)
  const revelation = has(/(?:发现|看见|认出|意识到|明白|得知|承认|说出|揭开|暴露|证明|确认)/u, value)
  const relation = dialogue || has(/(?:问|答|回应|看向|望着|递给|拒绝|命令|请求|威胁|拥抱|握住.+的手)/u, value)
  if (revelation) effects.push('reveals')
  if (relation) effects.push('relates')
  if (explicitChange) effects.push('changes')
  if (!explicitChange || subjects.includes('environment')) effects.unshift('depicts')

  return {
    functions: unique(functions).filter((axis) => FUNCTION_AXES.includes(axis)),
    subjects: unique(subjects).filter((axis) => SUBJECT_AXES.includes(axis)),
    effects: unique(effects).filter((axis) => EFFECT_AXES.includes(axis))
  }
}

function boundaryReason(previous, current, accumulatedChars, dialogueRunLength) {
  const previousDialogue = previous.axes.functions.includes('dialogue')
  const currentDialogue = current.axes.functions.includes('dialogue')
  if (previousDialogue && currentDialogue) {
    return accumulatedChars >= 520
      ? { split: true, reason: 'readability-pressure' }
      : { split: false, reason: 'dialogue-exchange' }
  }
  if (current.axes.functions.includes('transition')) return { split: true, reason: 'scene-transition' }
  if (previousDialogue && !currentDialogue && dialogueRunLength >= 2) return { split: true, reason: 'dialogue-to-aftermath' }
  if (!previousDialogue && currentDialogue && accumulatedChars >= 100) return { split: true, reason: 'enter-dialogue' }
  const previousChanges = previous.axes.effects.includes('changes')
  const currentReflects = current.axes.functions.includes('reflection') || current.axes.effects.includes('reveals')
  if (previousChanges && currentReflects) return { split: true, reason: 'effect-to-aftermath' }
  const functionShift = previous.axes.functions.some((axis) => ['exposition', 'reflection'].includes(axis))
    && current.axes.functions.some((axis) => ['dialogue', 'action'].includes(axis))
  if (functionShift && accumulatedChars >= 260) return { split: true, reason: 'beat-function-shift' }
  if (accumulatedChars >= 520) return { split: true, reason: 'readability-pressure' }
  return { split: false, reason: 'continuous-beat' }
}

function boundaryKey(previous, current) {
  return fingerprint('boundary', { previous: previous.id, current: current.id })
}

export function buildUnitSemanticProjection({ text: source = '', revision = '' } = {}) {
  const paragraphs = paragraphsFromText(source).map((paragraph) => ({
    ...paragraph,
    axes: paragraphAxes(paragraph)
  }))
  const boundaries = []
  let accumulatedChars = paragraphs[0]?.text.length || 0
  let dialogueRunLength = paragraphs[0]?.axes.functions.includes('dialogue') ? 1 : 0
  for (let index = 1; index < paragraphs.length; index += 1) {
    const previous = paragraphs[index - 1]
    const current = paragraphs[index]
    const suggestion = boundaryReason(previous, current, accumulatedChars, dialogueRunLength)
    boundaries.push({
      key: boundaryKey(previous, current),
      offset: current.start,
      afterParagraphId: previous.id,
      beforeParagraphId: current.id,
      suggestedSplit: suggestion.split,
      reason: suggestion.reason
    })
    accumulatedChars = suggestion.split ? current.text.length : accumulatedChars + current.text.length
    dialogueRunLength = current.axes.functions.includes('dialogue')
      ? (previous.axes.functions.includes('dialogue') ? dialogueRunLength + 1 : 1)
      : 0
  }
  const documentRevision = text(revision).trim() || fingerprint('ghost-revision', source)
  const value = {
    kind: 'unit-semantic-projection',
    version: UNIT_SEMANTIC_PROJECTION_VERSION,
    revision: documentRevision,
    paragraphs,
    boundaries
  }
  value.fingerprint = fingerprint('unit-semantics', value)
  return deepFreeze(value)
}

function normalizeCorrections(corrections = []) {
  return new Map((Array.isArray(corrections) ? corrections : [])
    .filter((item) => item?.boundaryKey && typeof item.split === 'boolean')
    .map((item) => [String(item.boundaryKey), { boundaryKey: String(item.boundaryKey), split: item.split }]))
}

function normalizeBoundaryHints(hints = [], boundaries = []) {
  const boundaryByOffset = new Map(boundaries.map((boundary) => [Number(boundary.offset), boundary]))
  const normalized = []
  for (const hint of (Array.isArray(hints) ? hints : [])) {
    const boundary = hint?.boundaryKey
      ? boundaries.find((item) => item.key === String(hint.boundaryKey))
      : boundaryByOffset.get(Number(hint?.offset))
    if (!boundary || typeof hint?.split !== 'boolean') continue
    normalized.push({
      boundaryKey: boundary.key,
      split: hint.split,
      reason: ['scene-transition', 'rhetorical-shift', 'event-change', 'length-guard'].includes(hint.reason)
        ? hint.reason
        : 'rhetorical-shift',
      source: 'response-hint'
    })
    if (normalized.length >= 8) break
  }
  return normalized
}

function normalizeDirection(direction) {
  if (!['authoring-scene-direction-selection', 'authoring-selected-direction-receipt'].includes(direction?.kind)) return null
  return {
    action: text(direction.action).trim(),
    immediateGain: text(direction.immediateGain).trim(),
    cost: text(direction.cost).trim(),
    evidenceRefs: unique((direction.evidenceRefs || []).map((item) => text(item).trim()))
  }
}

function aggregateAxes(paragraphs, axis) {
  return unique(paragraphs.flatMap((paragraph) => paragraph.axes?.[axis] || []))
}

export function createSceneBeatDraft({
  text: source = '',
  revision = '',
  corrections = [],
  boundaryHints = [],
  sessionFingerprint = '',
  direction = null
} = {}) {
  const projection = buildUnitSemanticProjection({ text: source, revision })
  const correctionMap = normalizeCorrections(corrections)
  const normalizedHints = normalizeBoundaryHints(boundaryHints, projection.boundaries)
  const hintMap = new Map(normalizedHints.map((hint) => [hint.boundaryKey, hint]))
  const boundaries = projection.boundaries.map((boundary) => {
    const correction = correctionMap.get(boundary.key)
    const hint = hintMap.get(boundary.key)
    return {
      ...boundary,
      suggestedSplit: hint ? hint.split : boundary.suggestedSplit,
      reason: hint?.reason || boundary.reason,
      split: correction ? correction.split : (hint ? hint.split : boundary.suggestedSplit),
      source: correction ? 'author' : (hint ? hint.source : 'derived')
    }
  })
  const units = []
  let current = []
  projection.paragraphs.forEach((paragraph, index) => {
    if (index > 0 && boundaries[index - 1]?.split && current.length) {
      units.push(current)
      current = []
    }
    current.push(paragraph)
  })
  if (current.length) units.push(current)
  const projectedUnits = units.map((paragraphs, index) => {
    const firstParagraph = paragraphs[0]
    const lastParagraph = paragraphs.at(-1)
    const precedingBoundary = index > 0
      ? boundaries.find((boundary) => boundary.beforeParagraphId === firstParagraph?.id)
      : null
    const boundaryReason = precedingBoundary?.source === 'author'
      ? 'author-split'
      : (precedingBoundary?.reason || null)
    return {
      id: fingerprint('draft-unit', { index, paragraphs: paragraphs.map((item) => item.id) }),
      paragraphIds: paragraphs.map((item) => item.id),
      text: paragraphs.map((item) => item.text).join('\n\n'),
      preview: paragraphs[0]?.text.slice(0, 64) || '',
      paragraphRange: { from: firstParagraph?.index ?? 0, to: lastParagraph?.index ?? 0 },
      textRange: { from: firstParagraph?.start ?? 0, to: lastParagraph?.end ?? 0 },
      boundaryReason,
      axes: {
        functions: aggregateAxes(paragraphs, 'functions'),
        subjects: aggregateAxes(paragraphs, 'subjects'),
        effects: aggregateAxes(paragraphs, 'effects')
      }
    }
  })
  const appliedCorrections = boundaries
    .filter((boundary) => boundary.source === 'author')
    .map((boundary) => ({ boundaryKey: boundary.key, split: boundary.split }))
  const value = {
    kind: 'scene-beat-draft',
    version: 1,
    revision: projection.revision,
    projectionFingerprint: projection.fingerprint,
    hierarchy: { scene: 'semantic-owner', beat: 'adoption-owner', writingUnit: 'edit-owner', paragraph: 'prose-owner' },
    sessionFingerprint: text(sessionFingerprint).trim(),
    directionFingerprint: text(direction?.fingerprint).trim(),
    beat: normalizeDirection(direction),
    prose: source,
    paragraphs: projection.paragraphs,
    boundaries,
    units: projectedUnits,
    proposedUnits: projectedUnits.map((unit) => ({
      draftUnitId: unit.id,
      paragraphRange: unit.paragraphRange,
      textRange: unit.textRange,
      preview: unit.preview,
      semanticProjection: unit.axes,
      boundaryReason: unit.boundaryReason
    })),
    corrections: appliedCorrections,
    boundaryHints: normalizedHints
  }
  value.fingerprint = fingerprint('scene-beat-draft', value)
  return deepFreeze(value)
}

export function setSceneBeatBoundary(draft, boundaryKeyValue, split) {
  if (draft?.kind !== 'scene-beat-draft' || typeof split !== 'boolean') return draft
  const boundaryKeyText = text(boundaryKeyValue).trim()
  if (!draft.boundaries.some((boundary) => boundary.key === boundaryKeyText)) return draft
  const corrections = [
    ...draft.corrections.filter((item) => item.boundaryKey !== boundaryKeyText),
    { boundaryKey: boundaryKeyText, split }
  ]
  return createSceneBeatDraft({
    text: draft.paragraphs.map((paragraph) => paragraph.text).join('\n\n'),
    revision: draft.revision,
    corrections,
    boundaryHints: draft.boundaryHints,
    sessionFingerprint: draft.sessionFingerprint,
    direction: draft.directionFingerprint && draft.beat
      ? {
          kind: 'authoring-scene-direction-selection',
          fingerprint: draft.directionFingerprint,
          ...draft.beat
        }
      : null
  })
}

export default buildUnitSemanticProjection
