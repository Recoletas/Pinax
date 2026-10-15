// W4 写侧合并冒烟（零依赖 node）：worldStore 含 vue/pinia 依赖不能直跑，
// 这里直测其调用的纯函数模块 src/services/worldbook/writeMergeMigration.js。
// 覆盖：structuredSettings→条目一次性迁移（幂等）、聚合角色文本 materialize、
// 墓碑不复活、userTouched 不覆盖、资料记录→source 条目（archiveRef 溯源 + 读路径兼容）。
//
// 迁移模块的依赖链上有无扩展名 import（vite 可解析、裸 node 不行），
// 这里注册一个只补 .js 的 resolve hook（node:module 内建，无第三方依赖）。
import { register } from 'node:module'

const RESOLVE_HOOK = 'data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !specifier.endsWith('.js') && !specifier.endsWith('.json') && !specifier.endsWith('.mjs')) {
    try { return await next(specifier + '.js', context) } catch { return next(specifier, context) }
  }
  return next(specifier, context)
}
`)

register(RESOLVE_HOOK)

const { migrateStructuredSettingProjections, syncStructuredCharacterFields, upsertStructuredFieldEntry, normalizeSourceDocumentRecords, reconcileSourceDocumentEntries, deriveSourceDocumentsFromEntries, isSourceDocumentEntry, structuredCharacterKeyFor, WRITE_MERGE_MIGRATION_VERSION } = await import('../src/services/worldbook/writeMergeMigration.js')
const { SETTING_SECTIONS } = await import('../src/services/worldbook/settingPanelSchema.js')

let passed = 0
const failures = []
const check = (name, condition) => {
  if (condition) { passed += 1; console.log(`  ✓ ${name}`) } else { failures.push(name); console.error(`  ✗ ${name}`) }
}
const sectionOf = (key) => SETTING_SECTIONS.find((section) => section.key === key)
const fieldOf = (sectionKey, fieldKey) => sectionOf(sectionKey)?.fields.find((field) => field.key === fieldKey)
const byId = (entries, id) => entries.find((entry) => entry.id === id)
const NOW = 1_700_000_000_000

// 聚合角色文本解析出的姓名（与 characterCard 解析器逐字一致）。
const LINA_CARD_NAME = '莉娜· Von'
const LINA_CARD_KEY = structuredCharacterKeyFor(LINA_CARD_NAME, 0)
const BELLMAN_CARD_KEY = structuredCharacterKeyFor('贝尔曼', 0)

// ---------- 旧数据夹具：structuredSettings 四分区 + 聚合角色文本 + 资料记录 ----------
const legacyEntries = [
  {
    id: 'entry_manual_style',
    name: '我的文风',
    type: 'style',
    keys: ['我的文风'],
    keysSecondary: [],
    content: '作者手工打磨过的文风条目，绝不能被迁移覆盖。',
    injection: { mode: 'selective', probability: 60, cooldown: 3, depth: 4, excludeRecursion: false, group: '自定义' },
    relations: { tags: [], locations: [], characters: [], events: [] },
    metadata: {
      importSource: 'structured-setting',
      structuredSettingRef: 'creativeRules.writingStyle',
      sourceSection: 'creativeRules',
      sourceField: 'writingStyle',
      userTouched: true,
      createdAt: 111,
      updatedAt: 222
    }
  },
  {
    id: 'entry_manual_char',
    name: LINA_CARD_NAME,
    type: 'character',
    keys: [LINA_CARD_NAME],
    keysSecondary: [],
    content: '莉娜是守塔人，用户手写内容。',
    injection: { mode: 'selective', probability: 100, cooldown: 0, depth: 1, excludeRecursion: false, group: '角色' },
    relations: { tags: [], locations: [], characters: [], events: [] },
    metadata: {
      importSource: 'structured-setting',
      structuredSettingRef: 'characters.protagonists',
      structuredCharacterKey: LINA_CARD_KEY,
      sourceSection: 'characters',
      sourceField: 'protagonists',
      userTouched: true,
      createdAt: 111,
      updatedAt: 222
    }
  }
]

const legacyStructuredSettings = {
  world: { origin: '潮汐之神在旧港留下了第一口铜钟。', powerSystem: '', geography: '雾港只画港口与北侧两公里海岸。', history: '', factions: '', rules: '' },
  story: { logline: '灯塔看守人发现潮汐账本会自己多出一行。', concept: '', theme: '', coreConflict: '', mainline: '', sublines: '' },
  characters: {
    protagonists: '姓名：莉娜· Von\n身份：守塔人\n性格：克制、较真\n背景：三代守塔，认得每一种潮声。\n姓名：贝尔曼\n身份：港务账房\n性格：精确到刻薄\n背景：三十年没记错过一笔账。',
    majorSupporting: '',
    npcs: '',
    relationshipSummary: '莉娜替贝尔曼瞒着一行账。'
  },
  creativeRules: { writingStyle: '作者手工打磨过的文风条目，绝不能被迁移覆盖。', perspective: '', tone: '', taboos: '禁止无铺垫的冲突升级。', consistency: '后续扩写必须遵循既有世界前提。', references: '' }
}

const legacySourceDocuments = [
  {
    id: 'src_archived',
    title: '潮汐志 · 导入原文',
    kind: 'novel-text',
    content: '',
    contentPreview: '潮水漫过堤岸，账房的灯亮到天明。',
    preview: '潮水漫过堤岸，账房的灯亮到天明。',
    sourceLabel: '小说文本导入',
    originalLength: 4096,
    normalizedLength: 4090,
    truncated: true,
    archiveRef: 'archive_artifact_1',
    chunkIds: ['archive_artifact_1:chunk:1:aaaa', 'archive_artifact_1:chunk:2:bbbb'],
    contentHash: 'hash-1',
    warnings: [],
    createdAt: 12345
  },
  {
    id: 'src_legacy_full',
    title: '旧资料（未归档）',
    content: '第一章 港\n旧港的正文全文还在记录里。',
    sourceLabel: '',
    createdAt: 6789
  }
]

const runFullMigration = ({ entries, structuredSettings, sourceDocuments, tombstones = [], skipCharacterSync = false }) => {
  let next = entries
  if (!skipCharacterSync) {
    next = syncStructuredCharacterFields(next, structuredSettings, NOW, tombstones)
  }
  next = migrateStructuredSettingProjections(next, structuredSettings, { now: NOW })
  const records = normalizeSourceDocumentRecords(sourceDocuments, { now: NOW })
  next = reconcileSourceDocumentEntries(next, records, { now: NOW })
  return next
}

console.log('\n[1] structuredSettings 一次性迁移：条目齐全 + content 原文')
{
  const entries = runFullMigration({ entries: legacyEntries, structuredSettings: legacyStructuredSettings, sourceDocuments: [] })

  const origin = byId(entries, 'entry_structured_world_origin')
  check('world.origin 落成正式条目', Boolean(origin))
  check('content 与字段文本逐字一致', origin?.content === '潮汐之神在旧港留下了第一口铜钟。')
  check('条目 metadata 记录 sourceSection/sourceField', origin?.metadata?.sourceSection === 'world' && origin?.metadata?.sourceField === 'origin')
  check('rule 字段落成常驻条目', byId(entries, 'entry_structured_creativeRules_consistency')?.injection?.mode === 'constant')
  check('style 字段落成选择性条目', byId(entries, 'entry_structured_story_logline')?.injection?.mode === 'selective')
  check('迁移版本门 = 1', WRITE_MERGE_MIGRATION_VERSION === 1)
}

console.log('\n[2] 墓碑 / userTouched 守卫')
{
  const entries = runFullMigration({
    entries: legacyEntries,
    structuredSettings: legacyStructuredSettings,
    sourceDocuments: [],
    tombstones: [`characters.protagonists:${BELLMAN_CARD_KEY}`]
  })

  const touched = byId(entries, 'entry_manual_style')
  check('userTouched 条目 content 不被迁移覆盖', touched?.content === '作者手工打磨过的文风条目，绝不能被迁移覆盖。')
  check('userTouched 条目 injection 保持用户形态', touched?.injection?.probability === 60 && touched?.injection?.cooldown === 3)
  check('userTouched 条目 keys 仍并入字段标签', (touched?.keys || []).includes('写作风格'))

  const lina = entries.find((entry) => entry.metadata?.structuredCharacterKey === LINA_CARD_KEY)
  check('userTouched 角色卡内容原样保留', lina?.content === '莉娜是守塔人，用户手写内容。')
  check('userTouched 角色卡不生成第二份派生条目', entries.filter((entry) => entry.metadata?.structuredCharacterKey === LINA_CARD_KEY).length === 1)
  const bellman = entries.find((entry) => entry.name === '贝尔曼')
  check('墓碑角色不复活', !bellman)
  check('墓碑名单之外的角色照常 materialize', entries.some((entry) => entry.metadata?.structuredCharacterKey === LINA_CARD_KEY))
}

console.log('\n[3] 迁移幂等：跑两遍结果不变')
{
  const tombstones = [`characters.protagonists:${BELLMAN_CARD_KEY}`]
  // store 真实路径：第一遍 v0 全量迁移，第二遍版本门已置 1（character legacy sync 跳过）。
  const once = runFullMigration({ entries: legacyEntries, structuredSettings: legacyStructuredSettings, sourceDocuments: legacySourceDocuments, tombstones })
  const twice = runFullMigration({ entries: once, structuredSettings: legacyStructuredSettings, sourceDocuments: legacySourceDocuments, tombstones, skipCharacterSync: true })
  check('版本门生效后第二遍 deep-equal', JSON.stringify(once) === JSON.stringify(twice))
  const migratedOnce = once.find((entry) => entry.id === 'entry_structured_world_origin')
  check('幂等不刷新 updatedAt', migratedOnce?.metadata?.updatedAt === NOW)
  // 更严格的值幂等：即便 character legacy sync 重跑（条目顺序可能整体后移，
  // 与退役前 sync 行为一致），按 id 排序后内容也必须逐字相同。
  const resynced = runFullMigration({ entries: once, structuredSettings: legacyStructuredSettings, sourceDocuments: legacySourceDocuments, tombstones })
  const sortById = (entries) => [...entries].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  check('character sync 重跑值幂等（按 id 排序 deep-equal）', JSON.stringify(sortById(resynced)) === JSON.stringify(sortById(once)))
}

console.log('\n[4] 资料记录 → type:source 条目（archiveRef 溯源 + 读路径兼容）')
{
  const records = normalizeSourceDocumentRecords(legacySourceDocuments, { now: NOW })
  const entries = runFullMigration({ entries: legacyEntries, structuredSettings: legacyStructuredSettings, sourceDocuments: legacySourceDocuments })

  const archived = byId(entries, 'entry_source_src_archived')
  check('归档资料升为 source 条目', archived?.type === 'source' && Boolean(isSourceDocumentEntry(archived)))
  check('archiveRef 指针保留在 metadata', archived?.metadata?.archiveRef === 'archive_artifact_1')
  check('chunkIds 指针保留在 metadata', JSON.stringify(archived?.metadata?.chunkIds) === JSON.stringify(['archive_artifact_1:chunk:1:aaaa', 'archive_artifact_1:chunk:2:bbbb']))
  check('sourceRefs 带 chunk 级溯源', (archived?.sourceRefs || []).join(',').includes('source:src_archived#archive_artifact_1:chunk:1:aaaa'))
  check('content 用预览文本（不改写原文）', archived?.content === '潮水漫过堤岸，账房的灯亮到天明。')
  check('完整旧记录保存在条目 metadata.sourceDocument', archived?.metadata?.sourceDocument?.truncated === true && archived?.metadata?.sourceDocument?.contentHash === 'hash-1')
  check('资料条目 keys 为空（注入零变化）', Array.isArray(archived?.keys) && archived.keys.length === 0 && archived.injection.mode === 'selective')

  const legacyFull = byId(entries, 'entry_source_src_legacy_full')
  check('未归档旧资料同样升条目', legacyFull?.type === 'source' && legacyFull?.metadata?.archiveRef === null)

  // 资料页读路径兼容：从条目重建旧记录形状
  const derived = deriveSourceDocumentsFromEntries(entries)
  const derivedArchived = derived.find((document) => document.id === 'src_archived')
  check('资料页读路径从条目重建旧记录', derivedArchived?.archiveRef === 'archive_artifact_1' && derivedArchived?.title === '潮汐志 · 导入原文')
  check('重建记录与归一记录逐字段相等', JSON.stringify(derivedArchived) === JSON.stringify(records[0]))
  check('记录移除 → 派生条目随之移除', deriveSourceDocumentsFromEntries(
    reconcileSourceDocumentEntries(entries, records.filter((document) => document.id !== 'src_legacy_full'), { now: NOW })
  ).every((document) => document.id !== 'src_legacy_full'))

  // 记录更新（如惰性归档补 archiveRef）：默认形态条目跟随，指针刷新
  const archivedRecords = records.map((document) => document.id === 'src_legacy_full'
    ? { ...document, archiveRef: 'archive_artifact_2', contentHash: 'hash-2' }
    : document)
  const reconciled = reconcileSourceDocumentEntries(entries, archivedRecords, { now: NOW })
  check('记录补归档后条目刷新 archiveRef', byId(reconciled, 'entry_source_src_legacy_full')?.metadata?.archiveRef === 'archive_artifact_2')
  check('再跑一遍 reconcile 不再变化', JSON.stringify(reconcileSourceDocumentEntries(reconciled, archivedRecords, { now: NOW })) === JSON.stringify(reconciled))
}

console.log('\n[5] 兼容入口单字段保存：upsert 语义与退役前一致')
{
  const section = sectionOf('world')
  const field = fieldOf('world', 'geography')

  const created = upsertStructuredFieldEntry([], section, field, '北岬灯塔位于岩岬。', { now: NOW })
  check('空字段保存建出条目', byId(created, 'entry_structured_world_geography')?.content === '北岬灯塔位于岩岬。')

  const updated = upsertStructuredFieldEntry(created, section, field, '北岬灯塔位于岩岬，雾天鸣笛两声。', { now: NOW })
  check('再次保存原位刷新 content', byId(updated, 'entry_structured_world_geography')?.content === '北岬灯塔位于岩岬，雾天鸣笛两声。')
  check('内容未变不触碰 updatedAt', byId(updated, 'entry_structured_world_geography')?.metadata?.updatedAt === NOW)

  const touchedEntry = upsertStructuredFieldEntry(created, section, field, '内容', { now: NOW })
  const touched = byId(touchedEntry, 'entry_structured_world_geography')
  const userEdited = upsertStructuredFieldEntry([{ ...touched, content: '用户改过的地理条目', metadata: { ...touched.metadata, userTouched: true } }], section, field, '旧字段文本', { now: NOW })
  check('userTouched 条目保存时只刷 keys 不覆盖 content', byId(userEdited, 'entry_structured_world_geography')?.content === '用户改过的地理条目')

  const removed = upsertStructuredFieldEntry(created, section, field, '', { now: NOW })
  check('字段清空移除派生条目', !byId(removed, 'entry_structured_world_geography'))
}

console.log(`\n结果：${passed} 过 / ${failures.length} 挂`)
if (failures.length) {
  console.error('失败项：', failures)
  process.exit(1)
}
