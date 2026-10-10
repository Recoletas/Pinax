/**
 * 人物多维表格（W3-A）的纯逻辑——行=人物条目，列=七模板字段并集 + 固定轴列。
 *
 * 单源纪律（不解析第二套正文格式）：
 * - 字段值、投影、必填缺项一律走 entryProfileTemplates（profileFromEntry /
 *   getProfileTemplate / missingRequiredLabels / parseLabeledBlocks）；改名触发词沿用
 *   renameEntryKeys（P0.2 口径）。解析只有一套，表格只在「已存字段 vs 正文」谁先显示上
 *   与编辑台不同（见 profileOf 注释），不另立字段格式。
 * - 档位委托注入端 entryTierOf、状态委托 entryBrowserModel.entryStatusOf——与只读浏览器同轴，
 *   表格不自定第二套档位或状态规则。
 * - 列按字段「标签」归并：功能位在配角线是 functionPosition、NPC 线是 roleSlot，同一列
 *   写回时按各行自己的模板解析回该行的键（fieldOf）。
 * 零 Vue / store / 路由依赖，node 冒烟直跑（scripts/worldbook-browser-smoke.mjs）。
 */

import {
  ENTRY_PROFILE_TEMPLATES,
  getProfileTemplate,
  missingRequiredLabels,
  parseLabeledBlocks,
  profileFromEntry
} from './entryProfileTemplates.js'
import { entryStatusOf } from './entryBrowserModel.js'
import { entryTierOf } from './worldbookContextBuilder.js'
import { isChapterLedgerEntry, isCovertCardEntry, isForeshadowLedgerEntry } from './settlementService.js'

/** 条目没有 profile.template 时的模板显示值：表格不替作者猜模板，缺项列也不谎报 */
export const UNBOUND_TEMPLATE_ID = '__unbound__'

/**
 * 结算机器台账与底牌件：内容由结算链行级维护，不进混排表（既不被当普通词条改，
 * 也就不可能在这里被误删）。判定沿用 settlementService 的按名＋auxRole 双通道，不另立第二套。
 */
export function isMachineLedgerEntry(entry) {
  return isChapterLedgerEntry(entry) || isForeshadowLedgerEntry(entry) || isCovertCardEntry(entry)
}

export function isCharacterEntry(entry) {
  return String(entry?.kind ?? entry?.type ?? '').trim().toLowerCase() === 'character'
}

export function characterEntries(worldbook) {
  const entries = Array.isArray(worldbook?.entries) ? worldbook.entries : []
  return entries.filter(isCharacterEntry)
}

/**
 * 表选择器（scope）→ 行集。
 * - 'characters'：人物表（七模板字段并集，可整格编辑）；
 * - 'all'：全部词条混排（除机器台账外的所有条目；未建档行的格按正文【标签】块写回，见 setLabeledBlock）。
 * 台账不在这里，它有独立一张表（ForeshadowLedgerTable），因为它的行是「伏笔」而不是世界书条目。
 */
export function tableEntries(worldbook, scope = 'characters') {
  const entries = Array.isArray(worldbook?.entries) ? worldbook.entries : []
  if (scope === 'all') return entries.filter((entry) => !isMachineLedgerEntry(entry))
  return entries.filter((entry) => isCharacterEntry(entry) && !isMachineLedgerEntry(entry))
}

/** 作者是否已为该行建档（选了模板）；未建档行的字段列仍可读写，但模板/缺项不假装有值 */
export function hasProfile(entry) {
  return Boolean(String(entry?.profile?.template ?? '').trim())
}

/**
 * 该行档案（表格显示口径）：正文【标签】反解打底，已存 profile.values 里存在的键一律优先
 * （空串也算作者清过一次这一格）。
 *
 * 与编辑台的差异在这里，且只在这里：EntryProfileEditor 的草稿态天然显示作者刚敲的值，
 * 表格没有常驻草稿，若按 profileFromEntry 的「正文优先」直接渲染，作者改完一格会被
 * 正文里的旧值顶回去，看着像没保存。表格因此把「已存字段」摆在正文之前，并用
 * cellOutOfSync 把「这一格与正文不一致」显式标出来——注入读的仍是 content，未被改写，
 * 作者切换到「覆盖条目正文」后标记自然消失。
 */
export function profileOf(entry) {
  const parsed = profileFromEntry(entry, entry?.profile?.template || '')
  const stored = entry?.profile?.values && typeof entry.profile.values === 'object' ? entry.profile.values : {}
  const values = { ...parsed.values }
  for (const [key, value] of Object.entries(stored)) {
    // 键存在即优先（清空也算一次编辑）：否则作者在表里删掉一格，界面会顶回正文旧值，看着像没改
    values[key] = String(value ?? '').trim()
  }
  return { ...parsed, values }
}

/** 正文里同名【标签】当前的值（不看已存字段）——差异标记的唯一判据 */
export function contentValueOf(entry, label) {
  for (const [blockLabel, value] of parseLabeledBlocks(String(entry?.content || ''))) {
    if (blockLabel === label) return value
  }
  return ''
}

/** 这一格的已存字段与正文对不上：作者选了「只存字段」，正文还没投影 */
export function cellOutOfSync(entry, label) {
  return cellValueOf(entry, label) !== contentValueOf(entry, label)
}

/** 字段列 = 七模板字段按标签去重的并集（模板声明序） */
export function fieldColumns() {
  const out = []
  const seen = new Set()
  for (const template of ENTRY_PROFILE_TEMPLATES) {
    for (const field of template.fields) {
      if (seen.has(field.label)) continue
      seen.add(field.label)
      out.push(field.label)
    }
  }
  return out
}

/**
 * 混排表的字段列 = 七模板字段并集 ＋ 这批条目正文里实际出现、且按现有读路能取到值的【标签】
 * （首次出现序）。判据仍是 parseLabeledBlocks + cellValueOf（唯一解析与唯一读路），表不发明第二套
 * 字段发现规则；取不到值的标签（声口横切块那一类另有归属）不进列，免得混排表长出一整列空壳。
 */
export function mixedFieldColumns(entries = []) {
  const out = fieldColumns()
  const seen = new Set(out)
  for (const entry of entries) {
    for (const [label] of parseLabeledBlocks(String(entry?.content || ''))) {
      if (seen.has(label) || !cellValueOf(entry, label)) continue
      seen.add(label)
      out.push(label)
    }
  }
  return out
}

function templateOf(entry) {
  return getProfileTemplate(entry?.profile?.template || '')
}

/** 标签→该行的落点键：模板里有同名字段用它的 key，否则标签本身即自由键（正文【标签】反解同口径） */
export function fieldOf(entry, label) {
  const field = templateOf(entry).fields.find((item) => item.label === label || item.key === label)
  return field
    ? { key: field.key, multiline: Boolean(field.multiline) }
    : { key: label, multiline: true }
}

export function cellValueOf(entry, label) {
  const { key } = fieldOf(entry, label)
  return String(profileOf(entry).values[key] ?? '')
}

/** 必填缺项标签：未建档行返回空数组——没建档就无从谈缺项 */
export function missingLabelsOf(entry) {
  return hasProfile(entry) ? missingRequiredLabels(profileOf(entry)) : []
}

export function rowTemplateId(entry) {
  return hasProfile(entry) ? entry.profile.template : UNBOUND_TEMPLATE_ID
}

export const TIER_ORDER = ['core', 'support', 'background']
export const STATUS_ORDER = ['draft', 'active', 'retired']

/**
 * 纵归并：'' 不分组；template/tier/status 按各自单源判定分组。
 * 返回 [{ id, rows }]，标签留给界面层翻译（与只读浏览器的选项词同源，不在此另立词表）。
 */
export function groupEntries(entries, groupKey = '') {
  if (!groupKey) return [{ id: '', rows: entries }]
  const bucketIdOf = (entry) => {
    if (groupKey === 'template') return rowTemplateId(entry)
    if (groupKey === 'tier') return entryTierOf(entry)
    return entryStatusOf(entry)
  }
  const order = groupKey === 'template'
    ? [...ENTRY_PROFILE_TEMPLATES.map((template) => template.id), UNBOUND_TEMPLATE_ID]
    : groupKey === 'tier' ? TIER_ORDER : STATUS_ORDER
  const buckets = new Map()
  for (const entry of entries) {
    const id = bucketIdOf(entry)
    if (!buckets.has(id)) buckets.set(id, [])
    buckets.get(id).push(entry)
  }
  const ordered = [...buckets.keys()].sort((left, right) => {
    const l = order.indexOf(left)
    const r = order.indexOf(right)
    return (l < 0 ? order.length : l) - (r < 0 ? order.length : r)
  })
  return ordered.map((id) => ({ id, rows: buckets.get(id) }))
}
