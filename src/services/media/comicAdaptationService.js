import { getResolvedApiSettings } from '../api'
import { mergeSourceRefs, normalizeSourceRefs } from '../narrativeAssets'
import { buildPlaceEntityIndex } from '../worldHistory/placeEntity'
import { runGenerationTask } from '../generationService'
import { createComicPage } from './comicPageStore'

const VALID_FORMATS = new Set(['page-ltr', 'page-rtl', 'webtoon'])
const VALID_COLOR_MODES = new Set(['color', 'monochrome'])
const VALID_REFERENCE_KINDS = new Set(['character', 'location', 'prop', 'style'])
const MAX_SOURCE_CHARS = 18000

export function buildComicReferenceCatalog({ worldbook = null, assets = [] } = {}) {
  const projectId = text(worldbook?.id) || null
  const narrativeAssets = Array.isArray(assets) ? assets : []
  const imageAssets = narrativeAssets.filter((asset) => asset?.image?.mediaAssetId || asset?.image?.id)
  const catalog = []
  const seen = new Set()

  function add(item = {}) {
    const sourceRef = normalizeSourceRefs([item.sourceRef], { projectId: item.projectId ?? projectId })[0]
    if (!sourceRef) return
    const kind = VALID_REFERENCE_KINDS.has(item.kind) ? item.kind : 'style'
    const id = `${kind}:${sourceRef.refType}:${sourceRef.refId}`
    if (seen.has(id)) return
    seen.add(id)
    catalog.push({
      id,
      kind,
      label: text(item.label) || sourceRef.refId,
      summary: compact(item.summary, 220),
      sourceRef,
      assetIds: linkedImageAssetIds(sourceRef, imageAssets)
    })
  }

  for (const entry of Array.isArray(worldbook?.entries) ? worldbook.entries : []) {
    const kind = classifyWorldbookEntry(entry)
    if (!kind || !entry?.id) continue
    add({
      kind,
      label: entry.name || entry.title || entry.id,
      summary: entry.content || entry.description,
      sourceRef: { refType: 'worldbook-entry', refId: entry.id, projectId }
    })
  }

  const placeIndex = buildPlaceEntityIndex(worldbook || {})
  for (const entity of placeIndex.entities || []) {
    add({
      kind: 'location',
      label: entity.name || entity.placeId,
      summary: [
        entity.semanticType,
        entity.latestHistoryNode?.title,
        entity.latestHistoryNode?.summary
      ].filter(Boolean).join('；'),
      sourceRef: { refType: 'map-site', refId: entity.placeId, projectId }
    })
  }

  for (const asset of narrativeAssets) {
    if (!asset?.id) continue
    const kind = classifyNarrativeAsset(asset)
    if (!kind) continue
    add({
      kind,
      label: asset.title || asset.id,
      summary: asset.content,
      projectId: asset.projectId ?? projectId,
      sourceRef: {
        refType: 'narrative-asset',
        refId: asset.id,
        projectId: asset.projectId ?? projectId
      }
    })
  }

  return catalog.slice(0, 60)
}

export function buildComicAdaptationMessages({
  sources = [],
  referenceCatalog = [],
  candidateCount = 2
} = {}) {
  const normalizedSources = (Array.isArray(sources) ? sources : [])
    .filter((source) => text(source?.content))
    .slice(0, 8)
  const sourceText = normalizedSources
    .map((source, index) => `【素材 ${index + 1}：${text(source.title) || '未命名'}】\n${text(source.content)}`)
    .join('\n\n')
    .slice(0, MAX_SOURCE_CHARS)
  const catalog = (Array.isArray(referenceCatalog) ? referenceCatalog : [])
    .slice(0, 40)
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      label: item.label,
      summary: compact(item.summary, 120)
    }))
  const count = Math.min(3, Math.max(2, Number(candidateCount) || 2))

  return [
    {
      role: 'system',
      content: [
        '你是漫画改编导演。先做多页叙事节奏与视觉连续性方案，不生成最终图片。',
        '只输出单个 JSON 对象，不要 Markdown，不要解释。',
        `必须输出 ${count} 个差异明显的 candidates；每个方案至少 2 页，每页按叙事需要使用 1-8 格，不得统一套用固定 4/6 格。`,
        'JSON：{"candidates":[{"id":"stable-id","title":"方案名","rationale":"节奏取舍","format":"page-ltr|page-rtl|webtoon","colorMode":"color|monochrome","pages":[{"title":"页标题","narrativeBeat":"本页剧情任务","pageTurnHook":"页尾钩子","continuityNotes":["连续性"],"panels":[{"visual":"单幅可见画面，不含文字","beat":{"action":"","emotion":"","reveal":"","transition":""},"dialogue":[{"speaker":"","text":""}],"caption":""}]}],"visualBible":{"referenceIds":["目录 ID"],"invariants":[{"referenceId":"目录 ID","notes":["不可改变的外观或空间事实"],"locked":true}],"palette":["颜色"],"lineStyle":"线条规则","renderingNotes":"渲染规则"}}]}。',
        'panel.visual 只描述画面、构图、动作与光线；对白和旁白必须放在独立字段，禁止要求模型在图片中绘制文字。',
        '每页 narrativeBeat 与 pageTurnHook 必须具体；后一页要承接前一页动作、角色位置、服装、地点、时段和关键道具。',
        '视觉圣经 referenceIds 只能使用给定引用目录 ID；无法确认的实体不要虚构 ID。'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        `请给出 ${count} 个可比较的分页方案。`,
        `引用目录：\n${JSON.stringify(catalog)}`,
        `来源素材：\n${sourceText || '（没有可用素材）'}`
      ].join('\n\n')
    }
  ]
}

export function parseComicAdaptationCandidates(content = '') {
  const source = text(content)
  const candidates = [
    source,
    source.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''),
    source.match(/\{[\s\S]*\}/)?.[0]
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      const normalized = (Array.isArray(parsed?.candidates) ? parsed.candidates : [])
        .slice(0, 3)
        .map(normalizeAdaptationCandidate)
        .filter(Boolean)
      if (normalized.length >= 2) return normalized
    } catch {
      // Try the next JSON extraction.
    }
  }
  return null
}

export async function generateComicAdaptationCandidates({
  sources = [],
  referenceCatalog = [],
  candidateCount = 2,
  settings = null
} = {}) {
  if (!(Array.isArray(sources) && sources.some((source) => text(source?.content)))) {
    throw new Error('请先选择至少一条包含正文的素材')
  }
  const apiSettings = settings || await getResolvedApiSettings()
  if (!apiSettings?.baseUrl || !apiSettings?.apiKey || !apiSettings?.model) {
    throw new Error('AI 配置不完整，请先在设置中配置文本模型')
  }
  const baseMessages = buildComicAdaptationMessages({ sources, referenceCatalog, candidateCount })
  const result = await runGenerationTask({
    taskType: 'media.comic-adaptation',
    baseMessages,
    settings: apiSettings,
    generationOptions: { max_tokens: 6200, temperature: 0.72 },
    parseContent: parseComicAdaptationCandidates,
    isValidParsed: (parsed) => Array.isArray(parsed) && parsed.length >= 2,
    attempts: [
      { name: 'comic-adaptation' },
      {
        name: 'comic-adaptation-format-retry',
        appendMessages: [{
          role: 'user',
          content: '上一条格式不合规。严格返回 candidates JSON；至少两个方案、每个至少两页、每页 1-8 格。'
        }]
      }
    ]
  })
  if (!result.success || !result.parsed) throw new Error('漫画分页方案格式校验失败，请重试')
  return { candidates: result.parsed, attempts: result.attempts || [] }
}

export function buildComicPagesFromAdaptation({
  candidate,
  sources = [],
  sourceRefs = [],
  referenceCatalog = [],
  projectId = null,
  sequenceId = ''
} = {}) {
  const normalized = normalizeAdaptationCandidate(candidate)
  if (!normalized) throw new Error('分页方案无效')
  const catalogById = new Map((Array.isArray(referenceCatalog) ? referenceCatalog : [])
    .map((item) => [item.id, item]))
  const semanticReferences = normalized.visualBible.references
    .map((reference) => {
      const catalogItem = catalogById.get(reference.referenceId)
      if (!catalogItem?.sourceRef) return null
      return {
        id: reference.referenceId,
        kind: catalogItem.kind,
        label: catalogItem.label,
        sourceRef: catalogItem.sourceRef,
        assetIds: catalogItem.assetIds || [],
        invariantNotes: reference.invariantNotes,
        locked: reference.locked
      }
    })
    .filter(Boolean)
  const bible = buildVisualBible(normalized.visualBible, semanticReferences, projectId)
  const sequence = text(sequenceId) || createSequenceId()
  const selectedSourceRefs = mergeSourceRefs(
    sourceRefs,
    (Array.isArray(sources) ? sources : []).map((source) => ({
      refType: 'narrative-asset',
      refId: source.id,
      projectId: source.projectId ?? projectId,
      excerpt: source.content
    })),
    semanticReferences.map((reference) => reference.sourceRef)
  )

  return normalized.pages.map((page, index) => createComicPage({
    projectId,
    sequenceId: sequence,
    sequenceTitle: normalized.title,
    pageNumber: index + 1,
    adaptationCandidateId: normalized.id,
    visualBibleStatus: 'draft',
    title: page.title || `${normalized.title} · ${index + 1}`,
    format: normalized.format,
    colorMode: normalized.colorMode,
    layout: chooseLayout(page.panels.length, page.layout),
    sourceRefs: selectedSourceRefs,
    pagePurpose: page.narrativeBeat,
    pageTurnHook: page.pageTurnHook,
    continuityNotes: page.continuityNotes,
    visualBible: bible,
    visualBibleRefs: semanticReferences.map((reference) => ({
      kind: reference.kind === 'style' ? 'lineStyle' : reference.kind,
      refId: reference.sourceRef.refId,
      note: reference.invariantNotes.join('；'),
      revision: 1
    })),
    panels: page.panels.map((panel, panelIndex) => ({
      order: panelIndex + 1,
      visual: panel.visual,
      beat: panel.beat,
      dialogue: panel.dialogue,
      caption: panel.caption,
      continuityRefs: selectedSourceRefs
    })),
    status: 'draft'
  }))
}

function normalizeAdaptationCandidate(candidate, index = 0) {
  if (!candidate || typeof candidate !== 'object') return null
  const pages = (Array.isArray(candidate.pages) ? candidate.pages : [])
    .slice(0, 12)
    .map(normalizeAdaptationPage)
    .filter(Boolean)
  if (pages.length < 2) return null
  const id = text(candidate.id) || `candidate-${index + 1}`
  return {
    id,
    title: text(candidate.title) || `分页方案 ${index + 1}`,
    rationale: compact(candidate.rationale, 360),
    format: VALID_FORMATS.has(candidate.format) ? candidate.format : 'page-ltr',
    colorMode: VALID_COLOR_MODES.has(candidate.colorMode) ? candidate.colorMode : 'color',
    pages,
    visualBible: normalizeCandidateVisualBible(candidate.visualBible)
  }
}

function normalizeAdaptationPage(page = {}) {
  const panels = (Array.isArray(page.panels) ? page.panels : [])
    .slice(0, 8)
    .map((panel, index) => {
      const beat = normalizeBeat(panel?.beat)
      const visual = compact(panel?.visual || beat.action, 520)
      if (!visual) return null
      return {
        order: index + 1,
        visual,
        beat,
        dialogue: normalizeDialogue(panel?.dialogue),
        caption: compact(panel?.caption, 240)
      }
    })
    .filter(Boolean)
  if (!panels.length) return null
  return {
    title: compact(page.title, 100),
    narrativeBeat: compact(page.narrativeBeat || page.pagePurpose, 320),
    pageTurnHook: compact(page.pageTurnHook, 240),
    continuityNotes: normalizeStringList(page.continuityNotes, 20),
    layout: text(page.layout),
    panels
  }
}

function normalizeCandidateVisualBible(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const normalizedReferences = Array.isArray(source.references) ? source.references : []
  const referenceIds = normalizeStringList(
    Array.isArray(source.referenceIds)
      ? source.referenceIds
      : normalizedReferences.map((reference) => reference?.referenceId),
    40
  )
  const invariantsById = new Map(
    (Array.isArray(source.invariants) ? source.invariants : normalizedReferences)
      .map((item) => [text(item?.referenceId), item])
      .filter(([id]) => id)
  )
  return {
    references: referenceIds.map((referenceId) => ({
      referenceId,
      invariantNotes: normalizeStringList(
        invariantsById.get(referenceId)?.notes
          || invariantsById.get(referenceId)?.invariantNotes,
        16
      ),
      locked: invariantsById.get(referenceId)?.locked !== false
    })),
    palette: normalizeStringList(source.palette, 16),
    lineStyle: compact(source.lineStyle, 240),
    renderingNotes: compact(source.renderingNotes, 360)
  }
}

function buildVisualBible(candidateBible, references, projectId) {
  const group = (kind) => references
    .filter((reference) => reference.kind === kind)
    .map((reference) => ({
      entityRef: normalizeSourceRefs([reference.sourceRef], { projectId })[0],
      assetIds: reference.assetIds,
      invariantNotes: reference.invariantNotes,
      locked: reference.locked,
      label: reference.label
    }))
  return {
    references,
    characterRefs: group('character'),
    locationRefs: group('location'),
    propRefs: group('prop'),
    styleAssetIds: references.filter((reference) => reference.kind === 'style')
      .flatMap((reference) => reference.assetIds),
    palette: candidateBible.palette,
    lineStyle: candidateBible.lineStyle,
    renderingNotes: candidateBible.renderingNotes,
    invariantNotes: references.flatMap((reference) => reference.invariantNotes),
    revision: 1
  }
}

function linkedImageAssetIds(sourceRef, assets) {
  return [...new Set(assets.filter((asset) => {
    if (sourceRef.refType === 'narrative-asset' && asset.id === sourceRef.refId) return true
    return (asset.sourceRefs || []).some((ref) => (
      ref.refType === sourceRef.refType && ref.refId === sourceRef.refId
    ))
  }).map((asset) => asset.image?.mediaAssetId || asset.image?.id).filter(Boolean))].slice(0, 12)
}

function classifyWorldbookEntry(entry = {}) {
  const type = text(entry.type).toLowerCase()
  if (['character', 'person', 'npc'].includes(type)) return 'character'
  if (['location', 'place', 'geography'].includes(type)) return 'location'
  if (['item', 'prop', 'object', 'artifact'].includes(type)) return 'prop'
  return null
}

function classifyNarrativeAsset(asset = {}) {
  if (asset.kind === 'character-fact') return 'character'
  if (asset.kind === 'reference-image') return 'style'
  const haystack = `${asset.title || ''} ${asset.content || ''}`
  if (/(地点|场景|建筑|房间|街道|城市|山|河|location)/i.test(haystack)) return 'location'
  if (/(道具|武器|信物|物件|服装|prop)/i.test(haystack)) return 'prop'
  return null
}

function chooseLayout(panelCount, requested) {
  if (panelCount === 4 && ['strip-4', 'feature-4'].includes(requested)) return requested
  if (panelCount === 6 && ['page-6', 'feature-6'].includes(requested)) return requested
  if (panelCount === 4) return 'feature-4'
  if (panelCount === 6) return 'feature-6'
  return 'free'
}

function normalizeBeat(input = {}) {
  return {
    action: compact(input?.action, 240),
    emotion: compact(input?.emotion, 160),
    reveal: compact(input?.reveal, 200),
    transition: compact(input?.transition, 160)
  }
}

function normalizeDialogue(input) {
  if (!Array.isArray(input)) return []
  return input.slice(0, 6).map((line) => ({
    speaker: compact(line?.speaker, 80),
    text: compact(line?.text, 240)
  })).filter((line) => line.speaker || line.text)
}

function normalizeStringList(input, limit) {
  if (!Array.isArray(input)) return []
  return [...new Set(input.map((item) => compact(item, 240)).filter(Boolean))].slice(0, limit)
}

function compact(value, limit) {
  return text(value).replace(/\s+/g, ' ').slice(0, limit)
}

function text(value) {
  return String(value ?? '').trim()
}

function createSequenceId() {
  return `comic_sequence_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export default {
  buildComicAdaptationMessages,
  buildComicPagesFromAdaptation,
  buildComicReferenceCatalog,
  generateComicAdaptationCandidates,
  parseComicAdaptationCandidates
}
