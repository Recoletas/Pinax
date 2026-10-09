#!/usr/bin/env node
/**
 * 世界书文件格式契约冒烟（W1·A1）——零依赖，`node scripts/worldbook-file-contract-smoke.mjs` 直跑。
 *
 * 覆盖（工单 §3.1 验收）：
 *   1. 全字段 entry 往返无损（relations/profile/injection/extra/未知键保留）
 *   2. 中文值 / 值内冒号·方括号·单引号·前后空格 / 空串 / 多行 summary 的往返
 *   3. kit 解析器兼容：内嵌 kit tools/worldbook_index.py parse_frontmatter 的 JS 忠实移植，
 *      断言它读 Pinax 产出的 frontmatter 得到一致的 id/title/status/version/tags/links，
 *      且 relations/profile 缩进块对它不可见
 *   4. buildWorldbookGraphFile 与 kit build_index 的 JS 忠实移植产物 deepStrictEqual（同构），
 *      含 stats.byCat / isolated / src '+ ' 拼接语义
 *   5. buildWorldbookIndexFile 指针账本形状；buildWorldbookAuxFiles 四件关键行
 *
 * kit 移植基准：D:\storyflow-kit tools/worldbook_index.py（基线 e1a942c1）。逐行翻译，
 * 独立于 shared/worldbookFileContract.js 的实现——两边互为交叉验证。
 */
import assert from 'node:assert/strict'
import {
  WORLDBOOK_FILE_SCHEMA_VERSION,
  serializeWorldbookEntryFile,
  parseWorldbookEntryFile,
  buildWorldbookIndexFile,
  buildWorldbookGraphFile,
  parseWorldbookGraphFile,
  buildWorldbookAuxFiles
} from '../shared/worldbookFileContract.js'

/* ============ kit parse_frontmatter 忠实移植（worldbook_index.py:33-59） ============ */
// Python3 \w 匹配 unicode 词字符，JS 用 \p{L}\p{N}_ 等价；splitlines 以 /\r?\n/ 近似
// （emitter 不产 \v \f 等行界符）。

function kitParseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return [{}, text]
  const raw = m[1]
  const fm = {}
  for (const line of raw.split(/\r?\n/)) {
    const lm = /^([\p{L}\p{N}_][\p{L}\p{N}_-]*):\s*(.*)$/u.exec(line)
    if (lm) {
      const k = lm[1]
      const v = lm[2].trim()
      if (v.startsWith('[') && v.endsWith(']')) {
        fm[k] = v.slice(1, -1).split(',').map(x => x.trim().replace(/^['"]+|['"]+$/g, '')).filter(x => x.length > 0)
      } else {
        fm[k] = v.replace(/^['"]+|['"]+$/g, '')
      }
    }
  }
  let cur = null
  for (const line of raw.split(/\r?\n/)) {
    const lm = line.startsWith('- ') ? /^- (.+)$/.exec(line.trim()) : null
    if (lm && cur) {
      if (!Array.isArray(fm[cur])) fm[cur] = []
      fm[cur].push(lm[1].trim().replace(/^['"]+|['"]+$/g, ''))
    } else {
      const km = /^([\p{L}\p{N}_][\p{L}\p{N}_-]*):\s*$/u.exec(line)
      cur = km ? km[1] : (cur !== null && Array.isArray(fm[cur]) ? cur : null)
    }
  }
  return [fm, text.slice(m[0].length)]
}

/* ============ kit first_para 忠实移植（worldbook_index.py:62-67） ============ */

function kitFirstPara(body, limit = 120) {
  for (const para of String(body).split('\n\n')) {
    const t = Array.from(para.replace(/[#*`>[\]]/g, '')).join('').trim()
    if (t.length >= 8) {
      const cut = Array.from(t).slice(0, limit).join('')
      return cut + (t.length > limit ? '…' : '')
    }
  }
  return ''
}

/* ============ kit build_index 忠实移植（worldbook_index.py:70-161，虚文件版） ============ */
// 与 python 版差异仅两处（均为测试确定性服务）：mtime 恒 ''；built_at 恒 ''。

function kitBuildIndex(files, projectName) {
  const rels = Object.keys(files).filter(p => p.endsWith('.md')).sort()
  const entries = []
  const byId = {}
  for (const rel of rels) {
    const stem = rel.slice(rel.lastIndexOf('/') + 1).replace(/\.md$/, '')
    const withoutWb = rel.startsWith('世界书/') ? rel.slice('世界书/'.length) : rel
    const slash = withoutWb.lastIndexOf('/')
    const cat = slash === -1 ? '总览' : withoutWb.slice(0, slash) // 子目录名即分类；根下散件=总览
    const [fm, body] = kitParseFrontmatter(files[rel])
    const title = fm.title || stem
    const eid = fm.id || stem
    const tags = Array.isArray(fm.tags) ? fm.tags : (fm.tags ? [fm.tags] : [])
    const links = Array.isArray(fm.links) ? fm.links : (fm.links ? [fm.links] : [])
    const e = {
      id: eid, cat, title,
      status: fm.status || 'active',
      version: fm.version || '',
      tags, links,
      summary: kitFirstPara(body),
      path: rel, mtime: ''
    }
    entries.push(e)
    byId[eid] = e
    byId[title] = e // 标题也能当键（mention 归并）
  }

  const edges = {}
  const addEdge = (a, b, src, weight) => {
    if (a === b || !a || !b) return
    const pair = a < b ? [a, b] : [b, a]
    const key = pair.join('\u0000')
    const rec = edges[key] || (edges[key] = { a: pair[0], b: pair[1], src: new Set(), weight: 0 })
    rec.src.add(src)
    rec.weight += weight
  }

  for (const e of entries) {
    for (const lk of e.links) {
      const tgt = byId[lk]
      if (tgt) addEdge(e.id, tgt.id, 'link', 2) // ① 声明边
    }
    const bodyText = files[e.path] || ''
    for (const other of entries) { // ② 标题互涉（跳过自身；标题长度≥2）
      if (other.id === e.id || other.title.length < 2) continue
      const n = bodyText.split(other.title).length - 1
      if (n) addEdge(e.id, other.id, 'mention', Math.min(n, 3))
    }
    for (const t of e.tags) { // ③ tag 交叉：tag 恰是别的词条 id/标题
      const hit = byId[t]
      if (hit && hit.id !== e.id) addEdge(e.id, hit.id, 'tag', 1)
    }
  }

  const relations = Object.values(edges)
    .map(rec => ({ a: rec.a, b: rec.b, src: Array.from(rec.src).sort().join('+'), weight: rec.weight }))
    .sort((x, y) => (y.weight - x.weight) || (x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : x.b > y.b ? 1 : 0))

  const deg = {}
  for (const r of relations) {
    deg[r.a] = (deg[r.a] || 0) + 1
    deg[r.b] = (deg[r.b] || 0) + 1
  }
  const byCat = {}
  for (const e of entries) byCat[e.cat] = (byCat[e.cat] || 0) + 1

  return {
    format: 'worldbook-graph@1',
    project: projectName,
    built_at: '',
    entries,
    relations,
    stats: {
      entries: entries.length,
      edges: relations.length,
      isolated: entries.filter(e => !deg[e.id]).length,
      byCat: Object.fromEntries(Object.keys(byCat).sort().map(k => [k, byCat[k]]))
    }
  }
}

/* ============ 冒烟夹具 ============ */

// 冻结 spec 的 type→cat 与文件名规则（smoke 侧独立维护，交叉核对 impl 产物路径）
const CAT_OF = { character: '人物', location: '地理', organization: '势力', event: '编年', source: '资料' }
const catOf = type => CAT_OF[type] || '设定'
const safeName = name => String(name).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'untitled'
const pathOf = e => `世界书/${catOf(e.type)}/${safeName(e.name)}.md`

const ENTRY_A = {
  id: 'char-001',
  name: '沈青梧',
  type: 'character',
  status: 'active',
  version: '1.20',
  tags: [],
  links: ['src-001'],
  cat: ['主角团'],
  keys: ['青梧', '临安城主'],
  keysSecondary: ['青儿'],
  summary: '',
  sourceRefs: ['chapter:1'],
  updatedAt: '2026-10-01 12:00',
  relations: [
    { to: 'loc-001', type: 'residence', stance: '定居', covert: false, weight: 3, src: 'declared' },
    { to: 'char-002', type: 'rival', stance: '敌意', covert: true, weight: 2, src: 'ai' }
  ],
  injection: { mode: 'keyword', probability: 1, cooldown: 0, depth: 2, group: '主线' },
  profile: {
    template: '主角',
    core: { want: '查清大火真相', fear: '怕水', block: '身世之锁' },
    vocabulary: { use: ['剑诀'], banned: [] },
    samples: ['第一句。', "沈's 台词"]
  },
  extra: { legacyFlag: true, 备注: '备注值' },
  metadata: { wordCount: 120 }, // 未知运行时字段 → 应落 extra 回写
  avatar: 'img-001',
  content: '# 沈青梧\n\n沈青梧站在临安城头，望向沈宅方向。参见 [[loc-001]]。\n\n## 当前状态\n\n- 伤势：轻伤\n'
}

// 图谱夹具（六词条：声明边/mention/tag 三来源 + 孤立节点 + byCat 四分类）
const FIXTURES = [
  {
    id: 'char-001', name: '沈青梧', type: 'character', version: '1.0', updatedAt: '',
    links: ['src-001'],
    relations: [
      { to: 'loc-001', type: 'residence', weight: 3, src: 'declared' },
      { to: 'char-002', type: 'rival', weight: 2, src: 'ai' }
    ],
    keys: ['青梧', '临安城主'],
    content: '# 沈青梧\n\n沈青梧站在临安城头，望向沈宅方向。参见 [[loc-001]]。\n'
  },
  {
    id: 'char-002', name: '陆昭', type: 'character', version: '1.0', updatedAt: '',
    tags: ['沈青梧'],
    relations: [{ to: 'char-001', type: 'rival', weight: 2, src: 'ai' }],
    content: '# 陆昭\n\n陆昭暗中盯梢沈青梧。\n'
  },
  {
    id: 'loc-001', name: '沈宅', type: 'location', version: '1.0', updatedAt: '',
    links: ['char-001'],
    content: '# 沈宅\n\n沈宅是临安城的旧宅。\n'
  },
  {
    id: 'loc-002', name: '临安城', type: 'location', version: '1.0', updatedAt: '',
    content: '# 临安城\n\n临安城临安城。\n'
  },
  {
    id: 'item-001', name: '青铜灯', type: 'item', version: '1.0', updatedAt: '',
    content: '# 青铜灯\n\n一盏灯。\n' // 首段 <8 字 → summary ''；无任何边 → 孤立
  },
  {
    id: 'src-001', name: '神秘手记', type: 'source', version: '1.0', updatedAt: '',
    content: '# 神秘手记\n\n残卷。\n'
  }
]

/* ============ 用例 ============ */

let passed = 0
const failures = []
function section(title) { console.log(`\n== ${title}`) }
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok   ${name}`) } catch (err) {
    failures.push(name)
    console.error(`  FAIL ${name}`)
    console.error('       ' + String(err && err.message ? err.message : err).split('\n').join('\n       '))
  }
}

section('0. 契约版本')
check('WORLDBOOK_FILE_SCHEMA_VERSION === 1', () => {
  assert.equal(WORLDBOOK_FILE_SCHEMA_VERSION, 1)
})

section('1. 全字段 entry 往返无损')
check('全字段（含 relations/profile/injection/extra/未知键）deepStrictEqual', () => {
  const text = serializeWorldbookEntryFile(ENTRY_A, { worldbookName: '主线' })
  const result = parseWorldbookEntryFile(text)
  assert.equal(result.ok, true, `parse 失败: ${JSON.stringify(result.error)}`)
  assert.deepEqual(result.entry, {
    id: 'char-001',
    name: '沈青梧',
    title: '沈青梧',
    kind: 'character',
    type: 'character',
    status: 'active',
    version: '1.20',
    tags: [],
    links: ['src-001'], // links 层 = 纯 id（不含已被富关系表达的 to）
    cat: ['主角团'],
    keys: ['青梧', '临安城主'],
    keysSecondary: ['青儿'],
    summary: '',
    sourceRefs: ['chapter:1'],
    updatedAt: '2026-10-01 12:00',
    relations: [
      { to: 'loc-001', type: 'residence', stance: '定居', covert: false, weight: 3, src: 'declared' },
      { to: 'char-002', type: 'rival', stance: '敌意', covert: true, weight: 2, src: 'ai' }
    ],
    injection: { mode: 'keyword', probability: 1, cooldown: 0, depth: 2, group: '主线' },
    profile: {
      template: '主角',
      core: { want: '查清大火真相', fear: '怕水', block: '身世之锁' },
      vocabulary: { use: ['剑诀'], banned: [] },
      samples: ['第一句。', "沈's 台词"]
    },
    extra: {
      worldbook: '主线',
      legacyFlag: true,
      备注: '备注值',
      metadata: { wordCount: 120 },
      avatar: 'img-001'
    },
    content: ENTRY_A.content
  })
})
check('富关系块每行都有缩进（kit 解析器不可见的前提）', () => {
  const text = serializeWorldbookEntryFile(ENTRY_A)
  assert.ok(text.includes('\n  - to: loc-001'), 'relation 首字段应缩进')
  assert.ok(text.includes('\n    type: residence'), 'relation 续字段应缩进')
  assert.ok(text.includes('\n  template: 主角'), 'profile 块应缩进')
})
check('序列化幂等：parse → serialize 字节一致', () => {
  const once = serializeWorldbookEntryFile(ENTRY_A, { worldbookName: '主线' })
  const back = parseWorldbookEntryFile(once)
  assert.equal(back.ok, true)
  const twice = serializeWorldbookEntryFile(back.entry, { worldbookName: '主线' })
  assert.equal(twice, once)
})

section('2. 边界标量值往返')
check('中文/冒号/方括号/单引号/前后空格/空串/多行 summary 往返', () => {
  const weird = {
    id: 'weird-001',
    name: "沈's 酒馆：[试炼] 之地",
    type: 'location',
    status: 'draft',
    version: 2,
    keys: ['设定：核心', '[试炼]', '  padded  ', ''],
    summary: '第一行\n第二行\n\n第三行\n',
    tags: ['a b', 'c,d', ''],
    cat: ['带:冒号'],
    sourceRefs: ['source:doc1#chunk2'],
    profile: {
      flags: { open: true, closed: false },
      empty: {},
      list: [{ a: 1 }, { b: 'x' }], // 对象数组 → JSON 转义舱
      note: 'JSON: 不是转义舱'
    },
    extra: { num: '00123', boolStr: 'true', payload: 'line1\n---\nline2', empty2: '' },
    content: '# 标题\n\n正文：含 [[weird-001]]。\n'
  }
  const result = parseWorldbookEntryFile(serializeWorldbookEntryFile(weird))
  assert.equal(result.ok, true, `parse 失败: ${JSON.stringify(result.error)}`)
  assert.deepEqual(result.entry, {
    id: 'weird-001',
    name: "沈's 酒馆：[试炼] 之地",
    title: "沈's 酒馆：[试炼] 之地",
    kind: 'location',
    type: 'location',
    status: 'draft',
    version: 2,
    tags: ['a b', 'c,d', ''],
    links: [],
    cat: ['带:冒号'],
    keys: ['设定：核心', '[试炼]', '  padded  ', ''],
    keysSecondary: [],
    summary: '第一行\n第二行\n\n第三行\n',
    sourceRefs: ['source:doc1#chunk2'],
    updatedAt: '',
    relations: [],
    injection: {},
    profile: weird.profile,
    extra: weird.extra,
    content: weird.content
  })
})
check('空正文与单尾随换行 summary 往返', () => {
  const entry = { id: 'e2', name: '空正文', type: 'general', summary: '多行\n', content: '' }
  const result = parseWorldbookEntryFile(serializeWorldbookEntryFile(entry))
  assert.equal(result.ok, true)
  assert.equal(result.entry.summary, '多行\n')
  assert.equal(result.entry.content, '')
  assert.equal(result.entry.name, '空正文')
})
check('正文含 --- 分隔线不受 frontmatter 截断', () => {
  const entry = { id: 'e3', name: '横线', type: 'general', content: '# 顶\n\n---\n\n底\n' }
  const result = parseWorldbookEntryFile(serializeWorldbookEntryFile(entry))
  assert.equal(result.ok, true)
  assert.equal(result.entry.content, '# 顶\n\n---\n\n底\n')
})

section('3. kit 解析器兼容（parse_frontmatter JS 忠实移植）')
check('kit 读 Pinax frontmatter：id/title/status/version 一致', () => {
  const [fm] = kitParseFrontmatter(serializeWorldbookEntryFile(ENTRY_A))
  assert.equal(fm.id, ENTRY_A.id)
  assert.equal(fm.title, ENTRY_A.name)
  assert.equal(fm.status, ENTRY_A.status)
  assert.equal(fm.version, ENTRY_A.version)
  assert.equal(typeof fm.id, 'string')
  assert.equal(typeof fm.version, 'string')
})
check('kit 读 links：字符串数组，且含富关系 to（声明边全集）', () => {
  const text = serializeWorldbookEntryFile(ENTRY_A)
  const [fm] = kitParseFrontmatter(text)
  assert.ok(Array.isArray(fm.links), 'links 必须是数组')
  assert.ok(fm.links.every(x => typeof x === 'string'), 'links 必须是字符串数组')
  assert.deepEqual(fm.links, ['src-001', 'loc-001', 'char-002'])
  assert.deepEqual(fm.tags, [])
})
check('kit 读非空 tags 数组', () => {
  const [fm] = kitParseFrontmatter(serializeWorldbookEntryFile({ id: 't1', name: '词条', type: 'lore', tags: ['沈家', '家主'] }))
  assert.deepEqual(fm.tags, ['沈家', '家主'])
})
check('relations/profile/injection 缩进块对 kit 不可见', () => {
  const [fm] = kitParseFrontmatter(serializeWorldbookEntryFile(ENTRY_A))
  assert.equal(fm.relations, '', 'kit 把空值键读成空串，富关系对象列表不可见')
  assert.equal(fm.injection, '')
  assert.equal(fm.profile, '')
  const flat = JSON.stringify(fm)
  assert.ok(!flat.includes('敌意') && !flat.includes('定居') && !flat.includes('residence'), '富关系字段不得泄漏进 kit 视图')
  assert.ok(!flat.includes('查清大火真相') && !flat.includes('怕水'), 'profile 不得泄漏进 kit 视图')
})
check('多行 summary 块标量对 kit 只剩 marker，不泄漏内容', () => {
  const weird = { id: 'w', name: '块标量', type: 'general', summary: '第一行\n第二行\n' }
  const [fm] = kitParseFrontmatter(serializeWorldbookEntryFile(weird))
  assert.equal(fm.summary, '|')
  assert.ok(!JSON.stringify(fm).includes('第二行'))
})
check('kit 的 body 与 Pinax content 一致', () => {
  const [, body] = kitParseFrontmatter(serializeWorldbookEntryFile(ENTRY_A))
  assert.equal(body.replace(/^\r?\n/, ''), ENTRY_A.content)
})

section('4. buildWorldbookGraphFile 与 kit build_index 同构')
const files = {}
for (const e of FIXTURES) files[pathOf(e)] = serializeWorldbookEntryFile(e)
const kitGraph = kitBuildIndex(files, '测试世界书')
const pinaxGraph = buildWorldbookGraphFile({ name: '测试世界书', entries: FIXTURES, builtAt: '' })
check('产物 deepStrictEqual（entries/relations/stats 全量）', () => {
  assert.deepEqual(pinaxGraph, kitGraph)
})
check('三来源边语义：src + 拼接与权重', () => {
  assert.deepEqual(pinaxGraph.relations, [
    { a: 'char-001', b: 'char-002', src: 'link+mention+tag', weight: 7 }, // 双向声明 link2+2 + mention2(tags行+正文) + tag1
    { a: 'char-001', b: 'loc-001', src: 'link+mention', weight: 5 }, // 双向 link2+2 + e1 正文提及沈宅 1
    { a: 'char-001', b: 'loc-002', src: 'mention', weight: 2 }, // keys「临安城主」+正文共 2 次
    { a: 'char-001', b: 'src-001', src: 'link', weight: 2 },
    { a: 'loc-001', b: 'loc-002', src: 'mention', weight: 1 }
  ])
})
check('stats 语义：entries/edges/isolated/byCat', () => {
  assert.deepEqual(pinaxGraph.stats, {
    entries: 6,
    edges: 5,
    isolated: 1, // 青铜灯
    byCat: { 人物: 2, 地理: 2, 设定: 1, 资料: 1 }
  })
})
check('entries 字段形状（id/cat/title/status/version/tags/links/summary/path/mtime）', () => {
  const char1 = pinaxGraph.entries.find(e => e.id === 'char-001')
  assert.deepEqual(char1, {
    id: 'char-001',
    cat: '人物',
    title: '沈青梧',
    status: 'active',
    version: '1.0',
    tags: [],
    links: ['src-001', 'loc-001', 'char-002'],
    summary: '沈青梧站在临安城头，望向沈宅方向。参见 loc-001。',
    path: '世界书/人物/沈青梧.md',
    mtime: ''
  })
  const lamp = pinaxGraph.entries.find(e => e.id === 'item-001')
  assert.equal(lamp.summary, '', '首段 <8 字 → summary 空串（kit first_para 语义）')
  assert.equal(lamp.path, '世界书/设定/青铜灯.md')
})
check('kit index.json 指针账本形状', () => {
  const idx = buildWorldbookIndexFile({ name: '测试世界书', entries: FIXTURES })
  const listSections = idx.sections.filter(s => s.format === 'list')
  assert.deepEqual(listSections.map(s => s.id), ['设定', '人物', '势力', '地理', '编年', '资料'])
  assert.deepEqual(listSections.map(s => s.file), ['世界书/设定/', '世界书/人物/', '世界书/势力/', '世界书/地理/', '世界书/编年/', '世界书/资料/'])
  const ren = idx.sections.find(s => s.id === '人物').entries
  assert.deepEqual(ren.map(e => e.id), ['char-001', 'char-002'])
  assert.deepEqual(ren[0], {
    id: 'char-001',
    title: '沈青梧',
    tags: [],
    links: ['src-001', 'loc-001', 'char-002'],
    status: 'active',
    version: '1.0',
    updated: '',
    file: '世界书/人物/沈青梧.md'
  })
  const text = idx.sections.filter(s => s.format === 'text')
  assert.deepEqual(text.map(s => s.file), ['世界书/伏笔/台账.md', '世界书/底牌/暗线底牌.md'])
  assert.equal(idx.状态机, 'draft → active → retired')
  // kit check 语义：状态机合法
  for (const s of listSections) for (const e of s.entries) assert.ok(['draft', 'active', 'retired'].includes(e.status))
})
check('文件名安全化落入 index/graph 路径', () => {
  const idx = buildWorldbookIndexFile({ entries: [{ id: 'h-1', name: '沈/青:梧*卷?一"版', type: 'character' }] })
  const entry = idx.sections.find(s => s.id === '人物').entries[0]
  assert.equal(entry.file, '世界书/人物/沈青梧卷一版.md')
  const graph = buildWorldbookGraphFile({ entries: [{ id: 'h-1', name: '沈/青:梧*卷?一"版', type: 'character' }] })
  assert.equal(graph.entries[0].path, '世界书/人物/沈青梧卷一版.md')
})

section('5. parseWorldbookGraphFile')
check('合法 graph.json 读回', () => {
  const result = parseWorldbookGraphFile(JSON.stringify(pinaxGraph))
  assert.equal(result.ok, true)
  assert.equal(result.graph.format, 'worldbook-graph@1')
  assert.deepEqual(result.graph, pinaxGraph)
})
check('非法输入的三个错误码', () => {
  assert.deepEqual(parseWorldbookGraphFile('{not json').ok, false)
  assert.equal(parseWorldbookGraphFile('{not json').error.code, 'BAD_JSON')
  assert.equal(parseWorldbookGraphFile('{"format":"other"}').error.code, 'BAD_FORMAT')
  assert.equal(parseWorldbookGraphFile('{"format":"worldbook-graph@1"}').error.code, 'BAD_SHAPE')
})

section('6. buildWorldbookAuxFiles 四件骨架')
check('键集合固定为四件（相对 世界书/）', () => {
  const aux = buildWorldbookAuxFiles()
  assert.deepEqual(Object.keys(aux), ['纪律.md', '伏笔/台账.md', '底牌/暗线底牌.md', '编年/章账.md'])
  assert.equal(aux['纪律.md'], buildWorldbookAuxFiles({ variant: 'novel' })['纪律.md'], '默认 novel')
})
check('纪律.md 含结算五件/状态机/章账路径（kit DISCIPLINE 文案）', () => {
  const disc = buildWorldbookAuxFiles()['纪律.md']
  assert.ok(disc.includes('# 世界书纪律（小说变体）'))
  assert.ok(disc.includes('结算单位：**章**'))
  assert.ok(disc.includes('## 章回结算五件（每章交稿后、下一章派发前）'))
  assert.ok(disc.includes('状态机：draft → active → retired（不删档）'))
  assert.ok(disc.includes('3. 交接（下一章写手必知的 3-5 条）→ 编年/章账.md 末节'))
  assert.ok(disc.includes('4. 底牌按节点号取段，禁止整读'))
})
check('台账.md 含机器可读表头行（kit 台账表头）', () => {
  const ledger = buildWorldbookAuxFiles()['伏笔/台账.md']
  assert.ok(ledger.startsWith('# 伏笔台账'))
  assert.ok(ledger.includes('| fid | 内容 | 埋点 | 预定回收 | 状态 |'))
  assert.ok(ledger.includes('| --- | --- | --- | --- | --- |'))
})
check('章账.md 含 handoff 说明（末节=交接）', () => {
  const ledger = buildWorldbookAuxFiles()['编年/章账.md']
  assert.ok(ledger.includes('# 章账（逐章结算 = handoff）'))
  assert.ok(ledger.includes('下一章写手只读末节'))
  assert.ok(ledger.includes('## 交接（开局状态 · 第 1 章前）'))
})
check('底牌 status: draft 且永不入正文', () => {
  const covert = buildWorldbookAuxFiles()['底牌/暗线底牌.md']
  assert.ok(covert.includes('status: draft'))
  assert.ok(covert.includes('永不入正文'))
  const parsed = parseWorldbookEntryFile(covert)
  assert.equal(parsed.ok, true, '底牌卡也应可被契约 parser 读取')
  assert.equal(parsed.entry.status, 'draft')
})
check('drama 变体：结算单位集、集账文案、键集合不变', () => {
  const aux = buildWorldbookAuxFiles({ variant: 'drama' })
  assert.deepEqual(Object.keys(aux), ['纪律.md', '伏笔/台账.md', '底牌/暗线底牌.md', '编年/章账.md'])
  assert.ok(aux['纪律.md'].includes('结算单位：**集**'))
  assert.ok(aux['纪律.md'].includes('分集账/集账.md'))
  assert.ok(aux['编年/章账.md'].includes('# 集账（逐集结算 = handoff）'))
})

section('7. 错误路径与兼容归一')
check('无 frontmatter / 缺 id / 错 schemaVersion 三个错误码', () => {
  assert.equal(parseWorldbookEntryFile('没有 frontmatter').error.code, 'MISSING_FRONTMATTER')
  assert.equal(parseWorldbookEntryFile('---\nname: x\n---\n正文').error.code, 'MISSING_ID')
  assert.equal(parseWorldbookEntryFile('---\nschemaVersion: 2\nid: a\n---\n').error.code, 'UNSUPPORTED_SCHEMA_VERSION')
  assert.deepEqual(parseWorldbookEntryFile('---\nid: ok\n---\n').entry.id, 'ok')
})
check('旧版 relations 对象分组形状归一为富关系边', () => {
  const legacy = {
    id: 'legacy-1', name: '旧形状', type: 'character',
    relations: { tags: ['结构化设定', '酒馆'], locations: ['loc-9'], characters: ['char-9'] }
  }
  const result = parseWorldbookEntryFile(serializeWorldbookEntryFile(legacy))
  assert.equal(result.ok, true)
  assert.deepEqual(result.entry.tags, ['结构化设定', '酒馆'])
  assert.equal(result.entry.relations.length, 2)
  assert.deepEqual(result.entry.relations[0], { to: 'loc-9', type: 'location', weight: 2, src: 'declared' })
  assert.deepEqual(result.entry.relations[1], { to: 'char-9', type: 'character', weight: 2, src: 'declared' })
})
check('手写未知 frontmatter 键无损保留并回写', () => {
  const handText = '---\nid: hand-1\ntitle: 手写词条\nlegacyFlag: true\n备注: 手写\n---\n# 手写词条\n'
  const result = parseWorldbookEntryFile(handText)
  assert.equal(result.ok, true)
  assert.equal(result.entry.extra.legacyFlag, true)
  assert.equal(result.entry.extra.备注, '手写')
  const reserialized = serializeWorldbookEntryFile(result.entry)
  assert.ok(reserialized.includes('legacyFlag: true'))
  assert.ok(reserialized.includes('备注: 手写'))
  const again = parseWorldbookEntryFile(reserialized)
  assert.deepEqual(again.entry.extra, { legacyFlag: true, 备注: '手写' })
})
check('worldbook 归属键随 options 写入并在 extra 读回', () => {
  const result = parseWorldbookEntryFile(serializeWorldbookEntryFile({ id: 'wb1', name: '归属', type: 'lore' }, { worldbookName: '主线' }))
  assert.equal(result.ok, true)
  assert.equal(result.entry.extra.worldbook, '主线')
})

/* ============ 汇总 ============ */

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
  console.error('失败用例:\n  - ' + failures.join('\n  - '))
  process.exit(1)
}
process.exit(0)
