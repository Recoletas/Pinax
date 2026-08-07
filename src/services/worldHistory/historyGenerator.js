// 地理驱动历史节点生成器 (geo-history generator)
//
// 纯函数：输入 worldbook (条目) + mapSemantics (地图语义站点)，输出可 JSON 序列化的
// geoHistory，适合存入 `worldbook.geoHistory`。不调用 AI，同 seed 稳定。
//
// 设计取向：把 Dwarf Fortress 式「地理约束历史」压成 Pinax V1 —— 8-12 个历史节点、
// ≥3 个可玩入口，绑定世界书 entryIds，而不是做完整文明/人口/家谱模拟。
//
// 输入契约（mapSemantics，本任务定义；窗口 1 产出）：
//   {
//     mapId?: string,
//     seed?: string | number,
//     sites: [
//       {
//         siteId: string,
//         name?: string,
//         semanticType: 'tradeHub' | 'frontierZone' | 'isolatedSite'
//                     | 'hostileRegion' | 'fertileRegion' | 'strategicRoute',
//         cellIds?: number[],
//         markerIds?: string[],
//         routeIds?: string[],
//         factionHint?: string
//       }
//     ]
//   }
// mapSemantics 也可以直接传站点数组。semanticType 接受别名（frontier / hostile /
// isolated / trade / route ...），见 SEMANTIC_ALIASES。

// ---------------------------------------------------------------------------
// 确定性随机 (deterministic RNG) —— 仓库此前没有可复用的 seeded RNG，这里自带。
// ---------------------------------------------------------------------------

function xmur3(str) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return h >>> 0
  }
}

// 由 seed 派生一个稳定的 32-bit 无符号整数，用来给各类挑选做旋转偏移。
function seedToInt(seed) {
  return xmur3(String(seed ?? 'pinax'))()
}

// ---------------------------------------------------------------------------
// 语义类型归一化
// ---------------------------------------------------------------------------

const SEMANTIC_ALIASES = {
  tradehub: 'tradeHub',
  trade: 'tradeHub',
  hub: 'tradeHub',
  market: 'tradeHub',
  port: 'tradeHub',
  frontier: 'frontierZone',
  frontierzone: 'frontierZone',
  border: 'frontierZone',
  borderland: 'frontierZone',
  bordercrossing: 'frontierZone',
  march: 'frontierZone',
  rivermouth: 'tradeHub',
  mountainpass: 'strategicRoute',
  isolated: 'isolatedSite',
  isolatedsite: 'isolatedSite',
  remote: 'isolatedSite',
  ruinsite: 'ruinSite',
  ruin: 'ruinSite',
  hostile: 'hostileRegion',
  hostileregion: 'hostileRegion',
  wasteland: 'hostileRegion',
  badlands: 'hostileRegion',
  fertile: 'fertileRegion',
  fertileregion: 'fertileRegion',
  farmland: 'fertileRegion',
  breadbasket: 'fertileRegion',
  strategicroute: 'strategicRoute',
  route: 'strategicRoute',
  road: 'strategicRoute',
  pass: 'strategicRoute',
  corridor: 'strategicRoute'
}

const SEMANTIC_TYPES = [
  'tradeHub',
  'frontierZone',
  'isolatedSite',
  'ruinSite',
  'hostileRegion',
  'fertileRegion',
  'strategicRoute'
]

function normalizeSemanticType(raw, fallbackIndex = 0) {
  const key = String(raw ?? '').toLowerCase().replace(/[\s_-]/g, '')
  if (SEMANTIC_ALIASES[key]) return SEMANTIC_ALIASES[key]
  if (SEMANTIC_TYPES.includes(raw)) return raw
  // 未知语义类型：按稳定的 fallbackIndex 轮换，保证不同站点仍会落到不同模板。
  return SEMANTIC_TYPES[fallbackIndex % SEMANTIC_TYPES.length]
}

// ---------------------------------------------------------------------------
// 世界书条目索引
// ---------------------------------------------------------------------------

const ENTRY_TYPE_ALIASES = {
  org: 'organization',
  faction: 'organization',
  setting: 'lore'
}

const PARTICIPANT_TYPES = [
  'organization',
  'location',
  'character',
  'event',
  'quest',
  'item',
  'lore'
]

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeEntryType(type) {
  const key = normalizeText(type).toLowerCase()
  return ENTRY_TYPE_ALIASES[key] || key
}

function entryDisplayName(entry) {
  return normalizeText(entry?.name || entry?.keys?.[0] || '')
}

// 把世界书条目按识别出的 type 分桶。识别 organization / location / character /
// event / quest / item / lore；无法识别的落到 'general'（不参与主线挑选）。
function indexEntries(worldbook) {
  const entries = Array.isArray(worldbook)
    ? worldbook
    : Array.isArray(worldbook?.entries)
      ? worldbook.entries
      : []

  const byType = {}
  for (const type of PARTICIPANT_TYPES) byType[type] = []
  byType.general = []

  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue
    const id = normalizeText(raw.id)
    const name = entryDisplayName(raw)
    if (!id && !name) continue
    const type = normalizeEntryType(raw.type)
    const bucket = byType[type] ? type : 'general'
    byType[bucket].push({ id: id || null, name: name || id, type: bucket })
  }

  return byType
}

// 按旋转偏移从某一类条目里确定性地取一个；空则返回 fallback 名（无 id）。
function pickEntry(byType, type, rotation, fallbackName) {
  const list = byType[type] || []
  if (!list.length) return { name: fallbackName, id: null }
  const chosen = list[((rotation % list.length) + list.length) % list.length]
  return { name: chosen.name || fallbackName, id: chosen.id || null }
}

// ---------------------------------------------------------------------------
// 历史模板表：每个语义类型 4 个模板，node.type 全局唯一（跨语义类型必然不同）。
// ---------------------------------------------------------------------------

const HISTORY_TEMPLATES = {
  tradeHub: [
    { type: 'tax-rights', label: '税权之争', playable: true, primary: 'organization', roleHint: '受雇核账的外来人', hookVerb: '因谁握有征税之权而僵持', actLabel: '公布真实账目', actCommand: '公开我掌握的账目，逼当权者在税权归属上表态' },
    { type: 'port-closure', label: '封港令', playable: true, primary: 'organization', roleHint: '被困港内的信使', hookVerb: '一纸封港令切断了往来', actLabel: '强行放行一批货', actCommand: '设法让一批被扣的货物离港，承担触怒当局的后果' },
    { type: 'smuggling-ring', label: '走私暗网', playable: true, primary: 'character', roleHint: '摸线索的调查者', hookVerb: '在码头下滋生出一张走私暗网', actLabel: '端掉一个中转点', actCommand: '突袭一个走私中转点，取走货单并留下我介入的痕迹' },
    { type: 'guild-schism', label: '行会分裂', playable: false, primary: 'organization', roleHint: '两会之间的中人', hookVerb: '因利益分配而分裂成对立两派', actLabel: '在两会间选边', actCommand: '在分裂的两派行会之间公开选边，把裂痕推向明处' }
  ],
  frontierZone: [
    { type: 'refugee-tide', label: '难民潮', playable: true, primary: 'location', roleHint: '接收站的临时管事', hookVerb: '涌入了远超承载的难民', actLabel: '决定谁能进城', actCommand: '在城门前决定放行与拒收的名单，为此负责' },
    { type: 'ranger-vanish', label: '巡骑失踪', playable: true, primary: 'character', roleHint: '奉命追查的人', hookVerb: '一队巡骑在边线上消失', actLabel: '循踪深入边外', actCommand: '沿失踪巡骑的踪迹深入边线之外，追出他们遭遇了什么' },
    { type: 'border-war', label: '边境战争', playable: false, primary: 'organization', roleHint: '被卷入的边民', hookVerb: '在争议地带燃起边境战争', actLabel: '在战线上传一份信', actCommand: '穿过战线送出一封可能改变走向的信' },
    { type: 'watchline-fall', label: '哨线失守', playable: true, primary: 'location', roleHint: '最后撤离的守望者', hookVerb: '一段哨线在夜里失守', actLabel: '守住或点燃烽火', actCommand: '决定死守残哨还是点燃烽火示警，并承担代价' }
  ],
  isolatedSite: [
    { type: 'supply-cut', label: '补给中断', playable: true, primary: 'location', roleHint: '负责维持联络的外来人', hookVerb: '与外界的固定往来突然中断', actLabel: '重新打通联络', actCommand: '沿原有道路查明中断原因，决定是恢复旧路还是寻找新的联络方式' },
    { type: 'messenger-overdue', label: '信使逾期', playable: true, primary: 'character', roleHint: '受托查明消息中断的人', hookVerb: '连续数次没有等到应到的信使', actLabel: '沿途查访信使', actCommand: '从最后一个有记录的停靠点开始，查清信使为何没有抵达' },
    { type: 'relocation-dispute', label: '迁居争议', playable: true, primary: 'organization', roleHint: '被请来评估去留的人', hookVerb: '因资源与道路恶化而爆发迁居争议', actLabel: '确认去留的代价', actCommand: '核对水源、粮食、道路和可安置人口，再对是否迁居作出明确判断' },
    { type: 'local-rule-strain', label: '乡约失衡', playable: false, primary: 'lore', roleHint: '刚到此地的见证者', hookVerb: '因长期封闭而让旧有乡约逐渐失衡', actLabel: '调停新旧规矩', actCommand: '先弄清旧规矩保护了谁、限制了谁，再决定是修订还是继续维持' }
  ],
  ruinSite: [
    { type: 'ruin-unsealed', label: '遗迹开启', playable: true, primary: 'location', roleHint: '第一批进入者', hookVerb: '一座封存的遗迹被重新打开', actLabel: '深入遗迹核心', actCommand: '独自深入遗迹核心，带回或惊动其中封存之物' },
    { type: 'taboo-broken', label: '禁忌被破', playable: true, primary: 'lore', roleHint: '知情的外来者', hookVerb: '一条古老禁忌被人打破', actLabel: '揭穿或掩盖禁忌', actCommand: '决定揭穿还是替其掩盖被打破的禁忌，并留下我的立场' },
    { type: 'disappearance-probe', label: '失踪调查', playable: true, primary: 'character', roleHint: '受托的调查者', hookVerb: '接连有人在此无声失踪', actLabel: '重演一次失踪路线', actCommand: '按失踪者的最后路线独自走一遍，逼出真相' },
    { type: 'forbidden-cult', label: '禁教滋长', playable: false, primary: 'organization', roleHint: '半途撞见的旅人', hookVerb: '在偏远处滋长出一个禁教', actLabel: '混入一次集会', actCommand: '混入禁教的一次集会，记下他们真正图谋的东西' }
  ],
  hostileRegion: [
    { type: 'great-disaster', label: '天灾', playable: true, primary: 'location', roleHint: '灾中幸存者', hookVerb: '被一场天灾反复摧折', actLabel: '带人撤向高地', actCommand: '带着一批人撤向可能安全的高地，为途中损失负责' },
    { type: 'forced-migration', label: '被迫迁徙', playable: false, primary: 'organization', roleHint: '迁徙队的向导', hookVerb: '迫使整族人离开故土迁徙', actLabel: '选一条迁徙路线', actCommand: '在几条迁徙路线里替队伍拍板一条，赌上所有人的性命' },
    { type: 'resource-crisis', label: '资源危机', playable: true, primary: 'item', roleHint: '分配物资的人', hookVerb: '因一种关键资源枯竭而濒临崩溃', actLabel: '分配最后的存量', actCommand: '决定最后一批关键资源分给谁，把矛盾摆到明处' },
    { type: 'creeping-plague', label: '蔓延瘟疫', playable: true, primary: 'character', roleHint: '追查源头的人', hookVerb: '被一场蔓延的瘟疫笼罩', actLabel: '封锁或救治一处', actCommand: '在封锁疫源与抢救病患之间做出取舍，并承担后果' }
  ],
  fertileRegion: [
    { type: 'sovereignty-founding', label: '王权奠基', playable: true, primary: 'organization', roleHint: '奠基时在场的人', hookVerb: '因其丰饶而被立为王权根基', actLabel: '拥立或阻止称王', actCommand: '在称王一事上公开表态拥立或阻止，并留下我的名字' },
    { type: 'granary-control', label: '粮仓之柄', playable: true, primary: 'location', roleHint: '看守粮仓的人', hookVerb: '因谁掌握粮仓而暗流涌动', actLabel: '开仓或封仓', actCommand: '在饥年决定开仓放粮还是封仓自守，为此负责' },
    { type: 'inheritance-feud', label: '继承之争', playable: false, primary: 'character', roleHint: '被拉入的见证者', hookVerb: '因继承权而分裂为敌对亲族', actLabel: '为一方作证', actCommand: '在继承争端里替其中一方作证，改变天平的倾向' },
    { type: 'taxation-revolt', label: '抗税', playable: true, primary: 'organization', roleHint: '夹在中间的人', hookVerb: '因苛税而濒临民变', actLabel: '带头抗税或压下去', actCommand: '决定带头抗税还是替当局压下民变，承担随之而来的清算' }
  ],
  strategicRoute: [
    { type: 'ambush-set', label: '设伏', playable: true, primary: 'location', roleHint: '识破埋伏的人', hookVerb: '成为一次精心设伏的地点', actLabel: '识破或引发伏击', actCommand: '选择当场识破埋伏还是将计就计引爆伏击，赌一次胜负' },
    { type: 'blockade', label: '封锁', playable: true, primary: 'organization', roleHint: '被卡住的行商', hookVerb: '被一道封锁彻底掐断', actLabel: '突破或维持封锁', actCommand: '设法突破封锁线，或替设卡者维持它，并承担代价' },
    { type: 'secret-order', label: '密令', playable: true, primary: 'item', roleHint: '携带密令的信使', hookVerb: '一道密令沿此路悄悄传递', actLabel: '传递或截下密令', actCommand: '决定如实传递还是中途截下这道密令，改变它抵达的结果' },
    { type: 'escort-run', label: '护送', playable: false, primary: 'character', roleHint: '受雇的护卫', hookVerb: '成为一次高风险护送的必经之路', actLabel: '护到底或弃护', actCommand: '在遇袭时选择护送到底还是弃护自保，为选择负责' }
  ]
}

// ---------------------------------------------------------------------------
// 年代阶梯
// ---------------------------------------------------------------------------

const AGE_LADDER = [
  { id: 'age-founding', key: 'founding', label: '开辟纪', baseYear: -480 },
  { id: 'age-expansion', key: 'expansion', label: '拓野纪', baseYear: -260 },
  { id: 'age-strife', key: 'strife', label: '争锋纪', baseYear: -90 },
  { id: 'age-present', key: 'present', label: '当世纪', baseYear: -5 }
]

function formatYear(year) {
  return year < 0 ? `纪元前 ${Math.abs(year)} 年` : `纪元 ${year} 年`
}

// ---------------------------------------------------------------------------
// 站点归一化
// ---------------------------------------------------------------------------

// W1 (mapSemantics.js) 的 extractMapSemantics 输出是「分类结果对象」，9 类各一个
// 数组 + meta。这里把它拍平成统一站点列表，同时也接住简单的 { sites: [...] } 契约
// 和裸站点数组，保证既能吃 W1 真实产物、又能独立测试。
const W1_CATEGORY_KEYS = [
  'tradeHubs',
  'borderCrossings',
  'frontierZones',
  'isolatedSites',
  'fertileRegions',
  'hostileRegions',
  'strategicRoutes',
  'riverMouths',
  'mountainPasses'
]

function collectRawSites(mapSemantics) {
  if (Array.isArray(mapSemantics)) return mapSemantics
  if (!mapSemantics || typeof mapSemantics !== 'object') return []
  if (Array.isArray(mapSemantics.sites)) return mapSemantics.sites
  // W1 分类结果：按固定顺序拍平 9 类。
  if (W1_CATEGORY_KEYS.some((key) => Array.isArray(mapSemantics[key]))) {
    const out = []
    for (const key of W1_CATEGORY_KEYS) {
      if (Array.isArray(mapSemantics[key])) out.push(...mapSemantics[key])
    }
    return out
  }
  return []
}

function normalizeSites(mapSemantics) {
  const rawSites = collectRawSites(mapSemantics)

  const normalized = rawSites
    .filter((site) => site && typeof site === 'object')
    .map((site, index) => {
      const markerIds = Array.isArray(site.markerIds)
        ? site.markerIds.map(normalizeText).filter(Boolean)
        : []
      const explicitRoutes = Array.isArray(site.routeIds)
        ? site.routeIds.map(normalizeText).filter(Boolean)
        : []
      // W1 没有独立 routeIds；道路来源以 `road:<i>` 形式藏在 markerIds 里。
      const derivedRoutes = markerIds.filter((m) => m.startsWith('road:'))
      const score = Number.isFinite(site.score) ? site.score : null
      return {
        siteId: normalizeText(site.siteId || site.id) || `site-${index + 1}`,
        name: normalizeText(site.name || site.title) || `无名之地 ${index + 1}`,
        semanticType: normalizeSemanticType(site.semanticType || site.type, index),
        cellIds: Array.isArray(site.cellIds) ? site.cellIds.filter((c) => c != null) : [],
        markerIds,
        routeIds: explicitRoutes.length ? explicitRoutes : derivedRoutes,
        factionHint: normalizeText(site.factionHint),
        score,
        _srcIndex: index
      }
    })

  // 高分站点优先（W1 site 带 score）；无 score 时保持原序，稳定的 tie-break。
  const hasScores = normalized.some((s) => s.score != null)
  if (hasScores) {
    normalized.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a._srcIndex - b._srcIndex)
  }
  return normalized.map(({ _srcIndex, ...site }) => site)
}

// ---------------------------------------------------------------------------
// 单个节点组装
// ---------------------------------------------------------------------------

const MIN_NODES = 8
const MAX_NODES = 12
const MIN_PLAYABLE = 3

function uniqueStrings(list) {
  const seen = new Set()
  const out = []
  for (const value of list) {
    if (!value) continue
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function buildNode(context) {
  const { site, template, age, index, byType, seedOffset, variantIndex } = context
  const rotation = seedOffset + index

  const faction = pickEntry(byType, 'organization', rotation, site.factionHint || '当地势力')
  const character = pickEntry(byType, 'character', rotation + 1, '一位当事人')
  const location = pickEntry(byType, 'location', rotation + 2, site.name)
  const item = pickEntry(byType, 'item', rotation + 3, '一件关键之物')
  const event = pickEntry(byType, 'event', rotation + 4, template.label)
  const quest = pickEntry(byType, 'quest', rotation + 5, '')
  const lore = pickEntry(byType, 'lore', rotation + 6, '')

  const primaryLookup = {
    organization: faction,
    character,
    location,
    item,
    event,
    quest,
    lore
  }
  const primary = primaryLookup[template.primary] || location

  // entryIds：主参与体优先，其后是其余绑定条目的 id（去重、去空）。
  const entryIds = uniqueStrings([
    primary.id,
    faction.id,
    location.id,
    character.id,
    event.id,
    item.id,
    quest.id,
    lore.id
  ])

  const suffix = variantIndex > 0 ? `（第 ${variantIndex + 1} 幕）` : ''
  const year = age.baseYear + index * 6 + variantIndex * 3
  const yearLabel = `${age.label} · ${formatYear(year)}`
  const id = `hn-${site.siteId}-${template.type}${variantIndex > 0 ? `-v${variantIndex + 1}` : ''}`
  const title = `${site.name}·${template.label}${suffix}`

  const locName = location.name || site.name
  const factionName = faction.name

  const causes = uniqueStrings([
    `${site.name}的地理位置（${site.semanticType}）使其${template.hookVerb}。`,
    faction.id ? `${factionName}在此地的既得利益成为导火索。` : `此地势力盘根错节，矛盾早已积累。`,
    lore.id ? `旧事「${lore.name}」为这一切埋下伏笔。` : ''
  ])

  const consequences = uniqueStrings([
    `${template.label}改变了${locName}一带的势力格局。`,
    character.id ? `${character.name}因此被推到风口浪尖。` : '',
    item.id ? `围绕「${item.name}」的争夺自此浮上台面。` : ''
  ])

  const unresolvedHooks = uniqueStrings([
    `${template.label}的真正主使从未被指认。`,
    quest.id ? `「${quest.name}」仍悬而未决。` : `牵连其中的人各有隐情，尚未了结。`
  ])

  const summary = `${age.label}，围绕${site.name}的「${template.label}」：${factionName}` +
    `${character.id ? `与${character.name}` : ''}就此展开较量，牵动${locName}一带的局势。`

  const participants = {
    factions: uniqueStrings([faction.id ? factionName : '', site.factionHint]),
    characters: uniqueStrings([character.id ? character.name : '']),
    locations: uniqueStrings([location.id ? location.name : '', site.name]),
    items: uniqueStrings([item.id ? item.name : ''])
  }

  const openingHook = `${yearLabel}，${site.name}${template.hookVerb}。${causes[0]}` +
    `你以${template.roleHint}的身份被卷入其中，必须在事态失控前做出选择。`

  const actionHooks = [
    {
      id: `${id}-investigate`,
      label: `前往${locName}查证`,
      title: locName,
      detail: `从「${locName}」的线索入手，弄清「${template.label}」的起因。`,
      command: `我先前往${locName}，仔细勘察与「${template.label}」有关的痕迹与记录，向 GM 追问具体证据。`
    },
    {
      id: `${id}-pressure`,
      label: `施压${factionName}`,
      title: factionName,
      detail: `直接向${factionName}摊牌，逼出被隐瞒的立场。`,
      command: `我去找${factionName}当面对质，就「${template.label}」施压，要求 GM 给出对方的真实反应与代价。`
    },
    {
      id: `${id}-act`,
      label: template.actLabel,
      title,
      detail: `采取「${template.actLabel}」，承担随之而来的后果。`,
      command: `我决定${template.actCommand}，请 GM 推进「${template.label}」的后续局势与连锁反应。`
    }
  ]

  return {
    id,
    title,
    yearLabel,
    type: template.type,
    summary,
    mapBinding: {
      siteId: site.siteId,
      cellIds: [...site.cellIds],
      markerIds: [...site.markerIds],
      routeIds: [...site.routeIds]
    },
    participants,
    causes,
    consequences,
    entryIds,
    unresolvedHooks,
    playable: false, // 后面统一决定
    openingHook,
    actionHooks,
    // 内部记账字段，供 playable 判定/年代归组使用（保留在输出里，JSON 安全）。
    _templatePlayable: template.playable,
    _ageId: age.id,
    _siteId: site.siteId,
    _order: index
  }
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

/**
 * generateGeoHistory(worldbook, mapSemantics, options?)
 *
 * @param {object|Array} worldbook   - 世界书对象（含 entries）或条目数组。
 * @param {object|Array} mapSemantics - mapSemantics 对象（含 sites）或站点数组。
 * @param {object} [options]
 * @param {string|number} [options.seed] - 生成种子；缺省时回退到 mapSemantics.seed / worldbook.seed / 'pinax'。
 * @param {string} [options.mapId]        - 覆盖 mapId。
 * @returns {object} geoHistory —— { seed, mapId, ages, nodes, links, entryBindings }，可 JSON 序列化。
 */
export function generateGeoHistory(worldbook, mapSemantics, options = {}) {
  const seed = options.seed ?? mapSemantics?.seed ?? worldbook?.seed ?? 'pinax'
  const mapId = normalizeText(options.mapId || mapSemantics?.mapId || worldbook?.mapId) || 'map-unknown'
  const seedOffset = seedToInt(seed)

  const byType = indexEntries(worldbook)
  const sites = normalizeSites(mapSemantics)

  const base = {
    seed: typeof seed === 'number' ? seed : String(seed),
    mapId,
    ages: [],
    nodes: [],
    links: [],
    entryBindings: []
  }

  // 优雅降级：没有站点则无法绑定地理历史，返回结构完整但空的 geoHistory。
  if (!sites.length) return base

  // 生成计划：模板在站点间轮转（interleave），保证在 12 个节点上限内尽量覆盖更多
  // 站点，而不是被前几个站点吃满。不足 8 个时用变体补齐，最多 12 个。
  const templatesPerSite = sites.map(
    (site) => HISTORY_TEMPLATES[site.semanticType] || HISTORY_TEMPLATES.frontierZone
  )
  const maxTemplates = templatesPerSite.reduce((m, t) => Math.max(m, t.length), 0)

  const baseCombos = []
  for (let ti = 0; ti < maxTemplates; ti += 1) {
    for (let si = 0; si < sites.length; si += 1) {
      const templates = templatesPerSite[si]
      if (ti < templates.length) baseCombos.push({ site: sites[si], template: templates[ti] })
    }
  }

  const plan = []
  if (baseCombos.length >= MIN_NODES) {
    for (let i = 0; i < baseCombos.length && plan.length < MAX_NODES; i += 1) {
      plan.push({ ...baseCombos[i], variantIndex: 0 })
    }
  } else {
    // 站点/模板不足 8：循环复用，逐轮抬高 variantIndex 制造可区分的后续幕。
    let cursor = 0
    while (plan.length < MIN_NODES) {
      const combo = baseCombos[cursor % baseCombos.length]
      const variantIndex = Math.floor(cursor / baseCombos.length)
      plan.push({ ...combo, variantIndex })
      cursor += 1
    }
  }

  const total = plan.length
  const perAge = Math.max(1, Math.ceil(total / AGE_LADDER.length))
  const usedAges = new Map()

  const nodes = plan.map((step, index) => {
    const ageIndex = Math.min(Math.floor(index / perAge), AGE_LADDER.length - 1)
    const age = AGE_LADDER[ageIndex]
    if (!usedAges.has(age.id)) {
      usedAges.set(age.id, { id: age.id, label: age.label, order: usedAges.size, key: age.key })
    }
    return buildNode({
      site: step.site,
      template: step.template,
      age,
      index,
      byType,
      seedOffset,
      variantIndex: step.variantIndex
    })
  })

  // playable 判定：模板本身可玩 且 绑定了至少一个世界书 entryId。
  let playableCount = 0
  for (const node of nodes) {
    if (node._templatePlayable && node.entryIds.length > 0) {
      node.playable = true
      playableCount += 1
    }
  }

  // 兜底：若可玩节点不足 3，且还有绑定了 entryIds 的节点，提升它们直到满足下限。
  if (playableCount < MIN_PLAYABLE) {
    for (const node of nodes) {
      if (playableCount >= MIN_PLAYABLE) break
      if (!node.playable && node.entryIds.length > 0) {
        node.playable = true
        playableCount += 1
      }
    }
  }

  // links：同一站点内按发生顺序把节点串成因果链。
  const links = []
  const bySite = new Map()
  for (const node of nodes) {
    if (!bySite.has(node._siteId)) bySite.set(node._siteId, [])
    bySite.get(node._siteId).push(node)
  }
  for (const [, siteNodes] of bySite) {
    for (let i = 1; i < siteNodes.length; i += 1) {
      links.push({
        id: `link-${siteNodes[i - 1].id}-${siteNodes[i].id}`,
        from: siteNodes[i - 1].id,
        to: siteNodes[i].id,
        type: 'leads-to'
      })
    }
  }

  const entryBindings = nodes.map((node) => ({
    nodeId: node.id,
    siteId: node._siteId,
    entryIds: [...node.entryIds]
  }))

  const ages = [...usedAges.values()].sort((a, b) => a.order - b.order)

  // 清理内部记账字段，保持输出干净且 JSON 安全。
  const cleanNodes = nodes.map((node) => {
    const clean = { ...node, ageId: node._ageId }
    delete clean._templatePlayable
    delete clean._ageId
    delete clean._siteId
    delete clean._order
    return clean
  })

  return {
    ...base,
    ages,
    nodes: cleanNodes,
    links,
    entryBindings
  }
}

export { normalizeSemanticType, SEMANTIC_TYPES, HISTORY_TEMPLATES }
