import { getResolvedApiSettings, sendStructuredGeneration } from './api'
import {
  getPlaceOverviewText,
  hashPlaceSource,
  normalizePlacePayload
} from '../../shared/placeEntryContract.js'
import { normalizeStructuredPlaceGenerationPayload } from '../../shared/structuredPlaceGenerationContract.js'
import { listPlaceEntries } from './worldbookPlaceCatalog'

const PLACE_NAME_RE = /(?=(?:^|[、，,：:\s]|除了|包括|例如|诸如|以及|另有|还有|有|位于|坐落于|连接|通往|隶属|属于|地处|包含于|与|和|及|从|至)([\u4e00-\u9fffA-Za-z][\u4e00-\u9fffA-Za-z0-9·]{0,18}?(?:城|镇|村|港|关|寨|都|京|郡|县|岛|要塞|堡|学院|基地|前哨|营地|遗迹|废墟|盆地|山|岭|峰|谷|湖|河|江|溪|川)))/g
const QUOTED_NAME_RE = /[‘'“"「『]([^’'”"」』\n]{2,24})[’'”"」』]/g
const QUOTED_SUFFIX_RE = /(?:山脉|盆地|平原|高原|荒原|森林|沙漠|群岛|半岛|海峡|海湾|城|镇|村|港|关|寨|都|京|郡|县|岛|要塞|堡|学院|基地|前哨|营地|遗迹|废墟|山|岭|峰|谷|湖|河|江|溪|川)$/i
const VAGUE_NAME_RE = /^(?:某个?|一个|一座|一处|这个|那个|附近|当地|周边|村庄|村落|城镇|城市|港口|遗迹|废墟|地下城|地牢|洞穴|小村|小镇|大城|古城)$/i
const FRAGMENT_RE = /总而言之|总之|这个世界|最著名|传说|至今|这片|那片|每一|一寸|各处|到处|这里|那里|其中|常被|被迫|被|的|许多|大小|这样|各自|散落|大都会|城镇/
const PREFIX_RE = /^(?:东侧有|西侧有|南侧有|北侧有|东部有|西部有|南部有|北部有|东侧为|西侧为|南侧为|北侧为|东侧连接|西侧连接|南侧连接|北侧连接|南方连接|北方连接|位于|坐落于|连接|通往|附近的|这里的|其中的|包含|主要包括)/
const ROUTE_RE = /连接|通往|联通|商道|道路|航线/
const PARENT_RE = /位于|坐落于|隶属|属于|地处|包含于/
const ADJACENT_RE = /相邻|毗邻|接壤|附近|近旁|以东|以西|以南|以北|东侧|西侧|南侧|北侧/

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function key(value) {
  return text(value).toLocaleLowerCase('zh-Hans-CN').replace(/[\s·・_-]+/g, '')
}

function cleanName(value, { quoted = false } = {}) {
  let name = text(value).replace(PREFIX_RE, '')
  name = name.replace(/^(?:并)?(?:在|从|至|向|由|与|和|及)+/, '').trim()
  name = name.replace(/^(?:东|西|南|北|中)(?:境|域|部|方)·(?=.{2,})/, '').trim()
  const prefixCut = name.match(/^(?:.{1,12}?)(?:发现|通往|连接|位于|坐落于|隶属|属于|地处|包含于|在|有|为|至|从|与|和|及)(.+)$/)
  if (prefixCut) name = prefixCut[1].trim()
  if (name.length < 2 || name.length > 20 || VAGUE_NAME_RE.test(name)) return ''
  if (/^(?:某个?|一个|一座|一处|这个|那个|附近|当地|周边)/.test(name)) return ''
  if (!quoted && FRAGMENT_RE.test(name)) return ''
  if (/^[\u4e00-\u9fff]+$/.test(name) && name.length > 12) return ''
  if (name.endsWith('都') && name.length > 6) return ''
  return name
}

export function extractProvisionalPlaceCandidates(content) {
  const candidates = new Map()
  const sentences = String(content || '')
    .replace(/[\r\n]+/g, ' ')
    .split(/[。！？；;]+/)
    .map((sentence) => text(sentence))
    .filter(Boolean)

  const ensure = (item, evidence) => {
    if (!candidates.has(item.key)) candidates.set(item.key, { name: item.name, evidence: text(evidence).slice(0, 240), relations: [] })
    return candidates.get(item.key)
  }
  const connect = (from, to, type, reciprocal = false) => {
    if (!from || !to || from.key === to.key || !type) return
    const append = (owner, target) => {
      const item = candidates.get(owner.key)
      if (!item.relations.some((relation) => relation.type === type && key(relation.targetName) === target.key)) {
        item.relations.push({ type, targetName: target.name })
      }
    }
    append(from, to)
    if (reciprocal) append(to, from)
  }

  for (const sentence of sentences) {
    const segments = sentence.split(/[，,：:]/).map(text).filter(Boolean)
    let anchor = null
    for (const segment of segments) {
      const names = []
      const quotedRanges = []
      for (const match of segment.matchAll(QUOTED_NAME_RE)) {
        const quoted = cleanName(match[1], { quoted: true })
        quotedRanges.push([match.index, match.index + match[0].length])
        if (!quoted || !QUOTED_SUFFIX_RE.test(quoted)) continue
        const item = { name: quoted, key: key(quoted) }
        if (!names.some((candidate) => candidate.key === item.key)) {
          names.push(item)
          ensure(item, sentence)
        }
      }
      const unquoted = quotedRanges.reduce((source, [start, end]) => `${source.slice(0, start)}${' '.repeat(end - start)}${source.slice(end)}`, segment)
      for (const match of unquoted.matchAll(PLACE_NAME_RE)) {
        const name = cleanName(match[1])
        const item = { name, key: key(name) }
        if (!name || names.some((candidate) => candidate.key === item.key)) continue
        names.push(item)
        ensure(item, sentence)
      }
      if (!names.length) continue
      if (!anchor) anchor = names[0]
      const relation = ROUTE_RE.test(segment) ? 'route' : PARENT_RE.test(segment) ? 'parent' : ADJACENT_RE.test(segment) ? 'adjacent' : ''
      if (names.length > 1) {
        const owner = names[0]
        for (const target of names.slice(1)) connect(owner, target, relation, relation !== 'parent')
      } else if (anchor && names[0].key !== anchor.key && relation) {
        connect(anchor, names[0], relation, relation !== 'parent')
      }
    }
  }
  return [...candidates.values()].slice(0, 40)
}

export function splitGeographyOverview(content, maxChars = 2800) {
  const paragraphs = String(content || '').split(/\n\s*\n/).map(text).filter(Boolean)
  const chunks = []
  let current = ''
  const append = (part) => {
    if (!part) return
    if (!current) current = part
    else if ((current.length + part.length + 1) <= maxChars) current += `\n${part}`
    else {
      chunks.push(current)
      current = part
    }
  }
  for (const paragraph of paragraphs.length ? paragraphs : [String(content || '')]) {
    if (paragraph.length <= maxChars) {
      append(paragraph)
      continue
    }
    for (const sentence of paragraph.split(/(?<=[。！？；;])/).map(text).filter(Boolean)) {
      if (sentence.length > maxChars) {
        for (let offset = 0; offset < sentence.length; offset += maxChars) append(sentence.slice(offset, offset + maxChars))
      } else append(sentence)
    }
  }
  if (current) chunks.push(current)
  return chunks
}

function compactExistingPlaces(worldbook, options = {}) {
  const maxEntries = Number.isFinite(options.maxEntries) ? options.maxEntries : 24
  const descriptionChars = Number.isFinite(options.descriptionChars) ? options.descriptionChars : 160
  const aliasesLimit = options.aliasesLimit === undefined ? undefined : options.aliasesLimit
  const includeKeywords = options.includeKeywords === true
  const excludeEntryId = options.excludeEntryId || ''
  const excludeName = options.excludeName || ''
  return listPlaceEntries(worldbook)
    .filter((place) => {
      if (excludeEntryId && place.entryId === excludeEntryId) return false
      if (excludeName && key(place.name) === key(excludeName)) return false
      return true
    })
    .slice(0, maxEntries)
    .map((place) => {
      const entry = {
        id: place.entryId,
        name: place.name,
        kind: place.kind,
        description: place.description.slice(0, descriptionChars)
      }
      entry.aliases = aliasesLimit === undefined
        ? place.aliases
        : place.aliases.slice(0, aliasesLimit)
      if (includeKeywords && Array.isArray(place.keywords) && place.keywords.length) {
        entry.keywords = place.keywords.slice(0, 4)
      }
      return entry
    })
}

export function buildSettingPlacesRequest({ worldbook, overviewChunk = '', userBrief = '', batchIndex = 0, batchCount = 1 } = {}) {
  const overview = text(overviewChunk || getPlaceOverviewText(worldbook))
  return {
    schemaId: 'setting-places.v1',
    target: {
      worldbookId: text(worldbook?.id),
      worldbookRevision: text(worldbook?.updatedAt || worldbook?.revision),
      sectionKey: 'world',
      fieldKeys: ['geography']
    },
    context: {
      globalConstraints: text([worldbook?.worldDescription, worldbook?.forbidden].filter(Boolean).join('\n')).slice(0, 2600),
      confirmedSettings: JSON.stringify(compactExistingPlaces(worldbook)),
      currentValues: '',
      relatedEntries: '',
      sourceExcerpts: overview,
      userBrief: text(`${userBrief}${batchCount > 1 ? `\n这是第 ${batchIndex + 1}/${batchCount} 批，只处理本批原文。` : ''}`).slice(0, 1600)
    }
  }
}

function targetForName(name, places) {
  const targetKey = key(name)
  return places.find((place) => [place.name, ...place.aliases].some((value) => key(value) === targetKey))
}

function comparablePlaceKey(place) {
  const normalized = normalizePlacePayload(place)
  return JSON.stringify({
    name: normalized.name,
    aliases: normalized.aliases,
    kind: normalized.kind,
    scale: normalized.scale,
    parentRef: normalized.parentRef,
    factionRef: normalized.factionRef,
    terrainHints: normalized.terrainHints,
    relations: normalized.relations,
    description: normalized.description,
    keywords: normalized.keywords
  })
}

export function classifyPlaceDrafts({ places = [], worldbook = {}, overview = '' } = {}) {
  const existing = listPlaceEntries(worldbook)
  return (Array.isArray(places) ? places : []).map((raw) => {
    const place = normalizePlacePayload(raw, { draft: true })
    const evidence = text(raw?.evidence || place.sourceEvidence?.[0]?.excerpt)
    const evidenceFound = Boolean(evidence && text(overview).includes(evidence))
    if (raw?.invalidReason) {
      return {
        ...place,
        evidence,
        evidenceStatus: 'low',
        lowConfidence: true,
        classification: 'invalid',
        baseClassification: 'invalid',
        invalidReason: raw.invalidReason,
        targetEntryId: '',
        targetFingerprint: '',
        sourceOverviewRevision: hashPlaceSource(overview),
        defaultSelected: false,
        reviewDecision: 'pending'
      }
    }
    const target = targetForName(place.name, existing)
    const baseClassification = target
      ? comparablePlaceKey(target) === comparablePlaceKey(place) ? 'duplicate' : 'update'
      : 'new'
    const unresolvedRelations = [place.parentRef, place.factionRef, ...place.relations]
      .filter((reference) => reference?.targetName)
      .some((reference) => !targetForName(reference.targetName, existing))
    const classification = unresolvedRelations && !target ? 'relation-pending' : baseClassification
    return {
      ...place,
      evidence,
      evidenceStatus: evidenceFound ? 'high' : 'low',
      lowConfidence: !evidenceFound,
      classification,
      baseClassification,
      targetEntryId: target?.entryId || '',
      targetFingerprint: target ? target.entryFingerprint || '' : '',
      sourceOverviewRevision: hashPlaceSource(overview),
      defaultSelected: evidenceFound && classification !== 'duplicate',
      reviewDecision: 'pending'
    }
  })
}

export async function generatePlacesFromOverview({
  worldbook,
  userBrief = '',
  settings = null,
  signal = null,
  sendStructuredGenerationImpl = sendStructuredGeneration
} = {}) {
  const overview = text(getPlaceOverviewText(worldbook))
  if (!overview) return { ok: false, code: 'PLACE_OVERVIEW_EMPTY', reason: '当前没有可整理的地理环境概述。', drafts: [], errors: [] }
  const chunks = splitGeographyOverview(overview)
  const resolvedSettings = settings || await getResolvedApiSettings()
  const drafts = []
  const errors = []
  for (let index = 0; index < chunks.length; index += 1) {
    if (signal?.aborted) break
    const request = buildSettingPlacesRequest({
      worldbook,
      overviewChunk: chunks[index],
      userBrief,
      batchIndex: index,
      batchCount: chunks.length
    })
    try {
      const response = await sendStructuredGenerationImpl({
        ...request,
        settings: resolvedSettings,
        options: { max_tokens: 3000, timeout_ms: 90000 },
        signal
      })
      const parsed = normalizeStructuredPlaceGenerationPayload(response)
      if (!parsed.valid) {
        errors.push({ batchIndex: index, code: parsed.error?.code || 'PLACE_RESPONSE_INVALID', message: parsed.error?.message || '地点整理结果无效' })
        continue
      }
      drafts.push(...classifyPlaceDrafts({ places: parsed.places, worldbook, overview: chunks[index] }).map((draft) => ({
        ...draft,
        batchIndex: index,
        fieldErrors: parsed.fieldErrors || {}
      })))
    } catch (error) {
      errors.push({ batchIndex: index, code: error?.code || 'PLACE_GENERATION_FAILED', message: error?.message || '地点整理失败' })
    }
  }
  return {
    ok: drafts.length > 0 || errors.length === 0,
    drafts,
    errors,
    sourceOverviewRevision: hashPlaceSource(overview),
    overview
  }
}

function escapeSeedValue(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')
}

function clipSeedField(value, cap) {
  const trimmed = text(value)
  if (!trimmed) return ''
  if (trimmed.length <= cap) return trimmed
  return `${trimmed.slice(0, cap)}（已截断 ${trimmed.length - cap} 字）`
}

function buildGlobalConstraints(worldbook, { forbiddenCap = 600, worldCap = 800, taboosCap = 600, envelope = 2500 } = {}) {
  const world = clipSeedField(worldbook?.worldDescription, worldCap)
  const forbidden = clipSeedField(worldbook?.forbidden, forbiddenCap)
  const taboos = clipSeedField(worldbook?.taboos, taboosCap)
  const blocks = []
  blocks.push(world ? `核心前提\n${world}` : '')
  blocks.push(forbidden ? `禁止内容\n${forbidden}` : '')
  blocks.push(taboos ? `文风约束\n${taboos}` : '(无)')
  const composed = blocks.filter(Boolean).join('\n\n')
  return clipSeedField(composed, envelope)
}

function buildFleshOutSeed(seed = {}) {
  const lines = []
  const name = text(seed.name)
  if (!name) return ''
  lines.push(`name = "${escapeSeedValue(name)}"`)
  if (seed.kind) lines.push(`kind = "${escapeSeedValue(seed.kind)}"`)
  if (seed.scale) lines.push(`scale = "${escapeSeedValue(seed.scale)}"`)
  const aliases = clipSeedField(seed.aliasesText, 160)
  if (aliases) lines.push(`aliases = "${escapeSeedValue(aliases)}"`)
  const terrain = clipSeedField(seed.terrainText, 160)
  if (terrain) lines.push(`terrainHints = "${escapeSeedValue(terrain)}"`)
  const keywords = clipSeedField(seed.keywordsText, 160)
  if (keywords) lines.push(`keywords = "${escapeSeedValue(keywords)}"`)
  const description = text(seed.description)
  if (description) {
    if (description.length > 1500) {
      lines.push(`description = "${escapeSeedValue(description.slice(0, 1500))}"`)
      lines.push('description_meta = "truncated: kept first 1500 chars; ask user to repeat tail in userBrief"')
    } else {
      lines.push(`description = "${escapeSeedValue(description)}"`)
    }
  }
  const relations = Array.isArray(seed.relations) ? seed.relations : []
  if (relations.length) {
    const rels = relations
      .filter((relation) => relation && text(relation.targetName))
      .slice(0, 8)
      .map((relation) => ({ type: relation.type || 'adjacent', targetName: text(relation.targetName) }))
    if (rels.length) lines.push(`relations = ${JSON.stringify(rels)}`)
  }
  if (text(seed.parentText) || text(seed.factionText)) {
    lines.push('parentText_factionText_meta = "用户已填上级/势力；本补全不会写入 parentRef/factionRef；如需修改请直接编辑"')
  }
  return lines.join('\n')
}

export function buildSettingPlaceFleshOutRequest({ worldbook, seed = {}, userBrief = '', excludeEntryId = '', excludeName = '', mode = 'expand' } = {}) {
  const overview = text(getPlaceOverviewText(worldbook))
  const confirmed = compactExistingPlaces(worldbook, {
    maxEntries: 12,
    descriptionChars: 80,
    aliasesLimit: 3,
    includeKeywords: true,
    excludeEntryId,
    excludeName
  })
  const sourceExcerptCap = mode === 'create' ? 2000 : 800
  return {
    schemaId: 'setting-place.v1',
    target: {
      worldbookId: text(worldbook?.id),
      worldbookRevision: text(worldbook?.updatedAt || worldbook?.revision),
      sectionKey: 'world',
      fieldKeys: ['geography']
    },
    context: {
      globalConstraints: buildGlobalConstraints(worldbook),
      confirmedSettings: JSON.stringify(confirmed),
      currentValues: '',
      sourceExcerpts: overview.slice(0, sourceExcerptCap),
      seed: buildFleshOutSeed(seed),
      userBrief: text(userBrief).slice(0, 300),
      mode
    }
  }
}

export async function generatePlaceFleshOut({
  worldbook,
  seed,
  userBrief = '',
  excludeEntryId = '',
  excludeName = '',
  mode = 'expand',
  settings = null,
  signal = null,
  sendStructuredGenerationImpl = sendStructuredGeneration
} = {}) {
  if (mode !== 'create' && !text(seed?.name)) {
    return { ok: false, code: 'PLACE_SEED_NAME_EMPTY', reason: '请先填写地点名称再补全。', place: null }
  }
  const resolvedSettings = settings || await getResolvedApiSettings()
  const request = buildSettingPlaceFleshOutRequest({ worldbook, seed, userBrief, excludeEntryId, excludeName, mode })
  try {
    const response = await sendStructuredGenerationImpl({
      ...request,
      settings: resolvedSettings,
      options: { max_tokens: 4000, timeout_ms: 60000 },
      signal
    })
    const place = response?.drafts?.places?.[0]
    if (!place || !text(place.name) || !text(place.description)) {
      return { ok: false, code: 'PLACE_FLESH_OUT_EMPTY', reason: '补全未返回可用地点。', place: null }
    }
    return { ok: true, place, reason: '' }
  } catch (error) {
    if (error?.code === 'STRUCTURED_GENERATION_RESPONSE_INCOMPLETE') {
      return {
        ok: false,
        code: error.code,
        reason: '生成响应被上游截断（可能上下文过长或模型输出过长），请稍后重试，或缩短地理概述后再试。',
        place: null
      }
    }
    return { ok: false, code: error?.code || 'PLACE_FLESH_OUT_FAILED', reason: error?.message || '地点补全失败。', place: null }
  }
}
