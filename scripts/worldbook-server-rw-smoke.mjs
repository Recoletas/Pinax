#!/usr/bin/env node
// A2 世界书 server 读写全链冒烟（零 npm 依赖，node 直跑；退出码 0=过）。
// 链路：临时目录 payload → createLocalMirrorService().mirrorBook（契约 v2 落盘）→
// cat 目录 / kit 可解析 frontmatter（内嵌 kit 子集解析器 JS 移植校验）→ index/graph/manifest/
// 骨架件存在且幂等 → readWorldbookFolder 读回逐字段相等 → 损坏容错 → 路由 service 级直测
// （express 可导入时追加公网门 403 用例，否则 SKIP）。
// 运行：node scripts/worldbook-server-rw-smoke.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  WORLDBOOK_FILE_SCHEMA_VERSION,
  serializeWorldbookEntryFile,
  parseWorldbookEntryFile,
  buildWorldbookIndexFile,
  buildWorldbookGraphFile,
  parseWorldbookGraphFile,
  buildWorldbookAuxFiles,
  createLocalMirrorService
} from '../server/services/localMirrorService.js'

let passed = 0
const failures = []
const check = (name, condition) => {
  if (condition) { passed += 1; console.log(`  ✓ ${name}`) } else { failures.push(name); console.error(`  ✗ ${name}`) }
}

function deepEqual(a, b) {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]))
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined)
    const kb = Object.keys(b).filter((k) => b[k] !== undefined)
    return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]))
  }
  return false
}

// ── kit 子集解析器 JS 移植（tools/worldbook_index.py parse_frontmatter/first_para 1:1，
//    只用于验证写出的 frontmatter 可被 kit 索引器读取；不是 Pinax 解析器）──
function kitStripQuotes(value) {
  return value.replace(/^['"]+/, '').replace(/['"]+$/, '')
}
function kitParseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return [{}, text]
  const raw = m[1]
  const fm = {}
  for (const line of raw.split('\n')) {
    const lm = /^(\w[\w-]*):\s*(.*)$/.exec(line)
    if (lm) {
      const k = lm[1]
      const v = lm[2].trim()
      if (v.startsWith('[') && v.endsWith(']')) {
        fm[k] = v.slice(1, -1).split(',').map((x) => kitStripQuotes(x.trim())).filter((x) => x !== '')
      } else {
        fm[k] = kitStripQuotes(v)
      }
    }
  }
  let cur = null
  for (const line of raw.split('\n')) {
    const lm = line.startsWith('- ') ? /^- (.+)$/.exec(line.trim()) : null
    if (lm && cur) {
      if (!Array.isArray(fm[cur])) fm[cur] = []
      fm[cur].push(kitStripQuotes(lm[1].trim()))
    } else {
      const km = /^(\w[\w-]*):\s*$/.exec(line)
      cur = km ? km[1] : (Array.isArray(fm[cur]) ? cur : null)
    }
  }
  return [fm, text.slice(m[0].length)]
}
function kitFirstPara(body, limit = 120) {
  for (const para of body.split('\n\n')) {
    const t = para.replace(/[#*`>\[\]]/g, '').trim()
    if (t.length >= 8) return t.slice(0, limit) + (t.length > limit ? '…' : '')
  }
  return ''
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pinax-wb-a2-smoke-'))
try {
  // 先读 mirrorBook 的 payload 校验与 LIMITS 再造数据：book.id/title/chapters 必填、
  // worldbook.entries ≤ 2000 且每项 name/content 为字符串——以下 payload 全部满足。
  const worldbook = {
    id: 'wb_smoke_1',
    name: '冒烟世界书',
    worldDescription: '一个用于冒烟测试的世界。',
    writingStyle: '克制、白描。',
    forbidden: '禁止现代词汇。',
    groups: [],
    entries: [
      {
        id: 'char_li', name: '李逍遥', type: 'character', kind: 'character',
        keys: ['逍遥', '李大侠'], keysSecondary: ['小李'],
        content: '自幼父母双亡的少年，剑法轻灵。\n\n李逍遥与灵儿的初遇见 [[evt_chu]]。',
        injection: { mode: 'selective', probability: 80, cooldown: 0, depth: 1, excludeRecursion: false, group: '主角' },
        relations: { tags: ['主角'], locations: ['临安城'], characters: ['林月如'], events: [] },
        relationsRich: [{ to: 'evt_chu', type: 'event', stance: 'twist', covert: true, weight: 9, src: 'manual' }],
        metadata: { createdAt: '2026-10-08T00:00:00.000Z', basis: 'creative', reviewState: 'ready', nested: { a: 1 } },
        status: 'active', version: '2', tags: ['主角'], links: ['loc_linan', 'org_qingyun'],
        cat: ['人物'], summary: '自幼父母双亡的少年，剑法轻灵。', sourceRefs: ['src_1'],
        updatedAt: '2026-10-08T01:02:03.000Z', extra: { origin: 'smoke' }
      },
      {
        id: 'loc_linan', name: '临安城', type: 'location', kind: 'location',
        keys: ['临安'], keysSecondary: [],
        content: '江南名城，漕运枢纽，城中多评事。',
        injection: { mode: 'constant', probability: 100, cooldown: 0, depth: 2, excludeRecursion: false, group: '地理' },
        relations: { tags: [], locations: [], characters: [], events: [] },
        metadata: { createdAt: '2026-10-08T00:00:00.000Z' },
        status: 'active', version: '1', tags: [], links: [],
        cat: ['地理'], summary: '江南名城，漕运枢纽。', sourceRefs: [],
        updatedAt: '2026-10-08T00:00:00.000Z'
      },
      {
        id: 'org_qingyun', name: '青云阁', type: 'organization', kind: 'organization',
        keys: ['青云'], keysSecondary: [],
        content: '江湖情报组织，明面上是书肆连锁。',
        injection: { mode: 'selective', probability: 60, cooldown: 2, depth: 1, excludeRecursion: true, group: '势力' },
        relations: { tags: ['势力'], locations: [], characters: [], events: [] },
        metadata: { basis: 'creative' },
        status: 'draft', version: '1', tags: ['势力'], links: [],
        cat: ['势力'], summary: '江湖情报组织。', sourceRefs: [],
        updatedAt: '2026-10-07T23:00:00.000Z'
      },
      {
        id: 'evt_chu', name: '初遇事件', type: 'event', kind: 'event',
        keys: ['初遇'], keysSecondary: [],
        content: '山道初遇，灵儿的玉佩裂了一角。',
        injection: { mode: 'selective', probability: 50, cooldown: 0, depth: 1, excludeRecursion: false, group: '编年' },
        relations: { tags: [], locations: [], characters: [], events: [] },
        metadata: { basis: 'creative' },
        status: 'active', version: '1', tags: [], links: ['loc_linan'],
        cat: ['编年'], summary: '山道初遇。', sourceRefs: [],
        updatedAt: '2026-10-08T02:00:00.000Z'
      },
      {
        id: 'rule_spirit', name: '灵力守则', type: 'rule', kind: 'rule',
        keys: ['灵力'], keysSecondary: [],
        content: '灵力不可无中生有，必须以记忆为薪。',
        injection: { mode: 'constant', probability: 100, cooldown: 0, depth: 2, excludeRecursion: false, group: '规则' },
        relations: { tags: [], locations: [], characters: [], events: [] },
        metadata: { basis: 'premise' },
        status: 'active', version: '3', tags: [], links: [],
        cat: ['设定'], summary: '灵力以记忆为薪。', sourceRefs: [],
        updatedAt: '2026-10-08T00:30:00.000Z'
      },
      {
        id: 'src_note', name: '残卷·评事录', type: 'source', kind: 'source',
        keys: ['评事录'], keysSecondary: [],
        content: '来源资料：评事录抄本第三页。',
        injection: { mode: 'selective', probability: 40, cooldown: 1, depth: 1, excludeRecursion: false, group: '资料' },
        relations: { tags: [], locations: [], characters: [], events: [] },
        metadata: { basis: 'imported' },
        status: 'retired', version: '1', tags: [], links: [],
        cat: ['资料'], summary: '评事录抄本。', sourceRefs: [],
        updatedAt: '2026-10-06T08:00:00.000Z'
      },
      {
        id: 'ent_unknown', name: '低语集合', type: 'whisper', kind: 'whisper',
        keys: ['低语'], keysSecondary: [],
        content: '未知类型的条目回落设定目录。',
        injection: { mode: 'selective', probability: 30, cooldown: 0, depth: 1, excludeRecursion: false, group: '其他' },
        relations: { tags: [], locations: [], characters: [], events: [] },
        metadata: { basis: 'creative' },
        status: 'active', version: '1', tags: [], links: [],
        cat: ['设定'], summary: '未知类型回落设定。', sourceRefs: [],
        updatedAt: '2026-10-08T03:00:00.000Z'
      }
    ]
  }
  const payload = {
    book: { id: 'book_smoke_1', title: '冒烟书稿', chapters: [{ title: '第一章', content: '开篇。' }] },
    worldbook
  }

  console.log('[1] sync 写出：cat 目录映射（契约 v2）')
  const service = createLocalMirrorService({ rootPath: path.join(tmpRoot, 'mirror'), appDataPath: path.join(tmpRoot, 'appdata') })
  const result = service.mirrorBook(payload)
  const wbDir = path.join(result.dir, '世界书')
  check('mirrorBook 返回 counts.entries=7', result.counts.entries === 7)
  check('character→人物/李逍遥.md', fs.existsSync(path.join(wbDir, '人物', '李逍遥.md')))
  check('location→地理/临安城.md', fs.existsSync(path.join(wbDir, '地理', '临安城.md')))
  check('organization→势力/青云阁.md', fs.existsSync(path.join(wbDir, '势力', '青云阁.md')))
  check('event→编年/初遇事件.md', fs.existsSync(path.join(wbDir, '编年', '初遇事件.md')))
  check('rule→设定/灵力守则.md', fs.existsSync(path.join(wbDir, '设定', '灵力守则.md')))
  check('unknown type→设定/低语集合.md', fs.existsSync(path.join(wbDir, '设定', '低语集合.md')))
  check('source→资料/残卷·评事录.md', fs.existsSync(path.join(wbDir, '资料', '残卷·评事录.md')))
  check('旧分组目录不再出现（无 未分组/ 等 group 目录）', !fs.existsSync(path.join(wbDir, '未分组')) && !fs.existsSync(path.join(wbDir, '角色')))

  console.log('[2] kit 子集解析器可读 frontmatter（JS 移植 worldbook_index.py）')
  const liText = fs.readFileSync(path.join(wbDir, '人物', '李逍遥.md'), 'utf-8')
  const [kitFm, kitBody] = kitParseFrontmatter(liText)
  check('kit 读到 id/title/status/version', kitFm.id === 'char_li' && kitFm.title === '李逍遥' && kitFm.status === 'active' && String(kitFm.version) === '2')
  check('kit 读到 tags/links 为纯字符串数组（links=entry.links ∪ 富关系目标，契约 §3.1 双层合成）', Array.isArray(kitFm.tags) && kitFm.tags.join(',') === '主角' && Array.isArray(kitFm.links) && kitFm.links.join(',') === 'loc_linan,org_qingyun,evt_chu,临安城,林月如')
  check('kit 读到 schemaVersion=1', String(kitFm.schemaVersion) === String(WORLDBOOK_FILE_SCHEMA_VERSION))
  check('对象块（relations/injection/metadata）对 kit 不可见（不成列表）', !Array.isArray(kitFm.relations) && !Array.isArray(kitFm.injection) && !Array.isArray(kitFm.metadata))
  check('summary 与 kit first_para 规则一致', kitFm.summary === '自幼父母双亡的少年，剑法轻灵。' && kitFirstPara(kitBody) === kitFm.summary)

  console.log('[3] index.json / graph.json（kit 形状、确定性）')
  const indexText = fs.readFileSync(path.join(wbDir, 'index.json'), 'utf-8')
  const index = JSON.parse(indexText)
  let pointerCount = 0
  let pointersExist = true
  let statusesValid = true
  for (const section of index.sections) {
    for (const pointer of section.entries ?? []) {
      pointerCount += 1
      if (!fs.existsSync(path.join(result.dir, pointer.file))) pointersExist = false
      if (!['draft', 'active', 'retired'].includes(pointer.status)) statusesValid = false
    }
  }
  check('index.json 指针账本 7 条且 file 全部存在（kit check 语义）', pointerCount === 7 && pointersExist)
  check('index.json 状态机合法（draft/active/retired）', statusesValid)
  check('index.json 含人物/地理/势力/编年/设定/资料 list 节', ['人物', '地理', '势力', '编年', '设定', '资料'].every((cat) => index.sections.some((s) => s.id === cat && s.format === 'list')))
  check('index.json 含伏笔/底牌 text 节（kit init 形状）', index.sections.some((s) => s.id === '伏笔' && s.file === '世界书/伏笔/台账.md') && index.sections.some((s) => s.id === '底牌' && s.file === '世界书/底牌/暗线底牌.md'))
  const graphText = fs.readFileSync(path.join(wbDir, 'graph.json'), 'utf-8')
  const graph = JSON.parse(graphText)
  const parsedGraph = parseWorldbookGraphFile(graphText)
  check('graph.json format=worldbook-graph@1 且可解析', graph.format === 'worldbook-graph@1' && parsedGraph.ok)
  check('graph stats：entries=7 edges=4 isolated=3', graph.stats.entries === 7 && graph.stats.edges === 4 && graph.stats.isolated === 3)
  check('graph byCat 按目录计数', deepEqual(graph.stats.byCat, { 人物: 1, 地理: 1, 势力: 1, 编年: 1, 设定: 2, 资料: 1 }))
  const edgeOf = (a, b) => graph.relations.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a))
  check('links 声明边 src:link weight2（青云阁）', deepEqual(edgeOf('char_li', 'org_qingyun'), { a: 'char_li', b: 'org_qingyun', src: 'link', weight: 2 }))
  check('富关系目标并入 links 作 kit 声明边（契约语义：src:link weight2，权重留 frontmatter relations 块，kit 重建一致）', deepEqual(edgeOf('char_li', 'evt_chu'), { a: 'char_li', b: 'evt_chu', src: 'link', weight: 2 }))
  check('同对边按 kit 规则合并 src=link+mention（id link2 + 标题别名 link2 + frontmatter mention2）', deepEqual(edgeOf('char_li', 'loc_linan'), { a: 'char_li', b: 'loc_linan', src: 'link+mention', weight: 6 }))
  check('graph 词条含 cat/summary/path/mtime（kit 字段）', (() => {
    const li = graph.entries.find((e) => e.id === 'char_li')
    return li.cat === '人物' && li.summary === '自幼父母双亡的少年，剑法轻灵。' && li.path === '世界书/人物/李逍遥.md' && /^\d{2}-\d{2} \d{2}:\d{2}$/.test(li.mtime)
  })())
  check('graph 目标不存在则无边（林月如 不在词条集）', !graph.relations.some((r) => r.a === '林月如' || r.b === '林月如'))
  check('parseWorldbookGraphFile 拒绝坏 JSON', parseWorldbookGraphFile('{').ok === false && parseWorldbookGraphFile('{"format":"x"}').ok === false)

  console.log('[4] manifest.json 保留 + 骨架件幂等补齐')
  const manifest = JSON.parse(fs.readFileSync(path.join(wbDir, 'manifest.json'), 'utf-8'))
  check('manifest.json 旧消费方兼容（worldbookId/name/entryCount）', manifest.worldbookId === 'wb_smoke_1' && manifest.name === '冒烟世界书' && manifest.entryCount === 7)
  const auxExists = ['纪律.md', '伏笔/台账.md', '底牌/暗线底牌.md', '编年/章账.md'].map((rel) => path.join(wbDir, ...rel.split('/')))
  check('四个骨架件存在', auxExists.every((p) => fs.existsSync(p)))
  check('台账表头对齐 kit（fid/内容/埋点/预定回收/状态）', fs.readFileSync(auxExists[1], 'utf-8').includes('| fid | 内容 | 埋点 | 预定回收 | 状态 |'))
  check('章账 handoff 头对齐 kit', fs.readFileSync(auxExists[3], 'utf-8').startsWith('# 章账（逐章结算 = handoff）'))
  check('纪律.md 含结算五件', fs.readFileSync(auxExists[0], 'utf-8').includes('章回结算五件'))
  check('暗线底牌 status: draft', fs.readFileSync(auxExists[2], 'utf-8').includes('status: draft'))
  const auxSpec = buildWorldbookAuxFiles()
  check('buildWorldbookAuxFiles 纯函数：两调用逐键相等且恰四件', deepEqual(auxSpec, buildWorldbookAuxFiles()) && ['纪律.md', '伏笔/台账.md', '底牌/暗线底牌.md', '编年/章账.md'].every((key) => key in auxSpec) && Object.keys(auxSpec).length === 4)
  const auxDir = path.join(tmpRoot, 'aux-check', '世界书')
  fs.mkdirSync(auxDir, { recursive: true })
  fs.writeFileSync(path.join(auxDir, '纪律.md'), '# 自定义纪律（不可覆盖）')
  const fill1 = service.ensureWorldbookAuxFiles(auxDir)
  const fill2 = service.ensureWorldbookAuxFiles(auxDir)
  check('已有骨架不被覆盖', fs.readFileSync(path.join(auxDir, '纪律.md'), 'utf-8') === '# 自定义纪律（不可覆盖）')
  check('缺失骨架被补齐（3 件），二次调用零写入', fill1.written.length === 3 && fill2.written.length === 0)

  console.log('[5] 全链幂等：mirrorBook 跑两遍逐字节不变')
  const snapshotWorldbook = (root) => {
    const out = new Map()
    const walk = (dir, relBase) => {
      for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = relBase ? `${relBase}/${dirent.name}` : dirent.name
        if (dirent.isDirectory()) walk(path.join(dir, dirent.name), rel)
        else out.set(rel, fs.readFileSync(path.join(dir, dirent.name), 'utf-8'))
      }
    }
    walk(path.join(root, '世界书'), '')
    out.set('manifest.json', fs.readFileSync(path.join(root, '世界书', 'manifest.json'), 'utf-8'))
    return out
  }
  const snap1 = snapshotWorldbook(result.dir)
  service.mirrorBook(payload)
  const snap2 = snapshotWorldbook(result.dir)
  check('两遍落盘逐字节一致（无 wall-clock 泄入世界书文件）', snap1.size === snap2.size && [...snap1].every(([k, v]) => snap2.get(k) === v))

  console.log('[6] readWorldbookFolder 读回：逐字段相等')
  const clean = service.readWorldbookFolder(result.dir)
  check('ok=true 且无 warnings', clean.ok === true && clean.warnings.length === 0)
  check('worldbookId/name 读回', clean.worldbook.id === 'wb_smoke_1' && clean.worldbook.name === '冒烟世界书')
  check('worldDescription/writingStyle/forbidden/groups 快照读回', deepEqual(
    { w: clean.worldbook.worldDescription, s: clean.worldbook.writingStyle, f: clean.worldbook.forbidden, g: clean.worldbook.groups },
    { w: worldbook.worldDescription, s: worldbook.writingStyle, f: worldbook.forbidden, g: worldbook.groups }
  ))
  const byId = (list, id) => list.find((e) => e.id === id)
  check('条目数一致（7）', clean.worldbook.entries.length === worldbook.entries.length)
  check('全字段逐条相等（全形态条目：injection/relations/relationsRich/metadata/extra/version）',
    worldbook.entries.every((origin) => deepEqual(byId(clean.worldbook.entries, origin.id), origin)))
  check('[[id]] 交叉链接正文原样保留', byId(clean.worldbook.entries, 'char_li').content.includes('[[evt_chu]]'))
  check('读回条目 cat 指向落位目录（人物/资料/设定）', byId(clean.worldbook.entries, 'char_li').cat.join() === '人物' && byId(clean.worldbook.entries, 'src_note').cat.join() === '资料')

  console.log('[7] 损坏容错 + 路径安全 + 纯校验')
  fs.writeFileSync(path.join(wbDir, '人物', '李逍遥.md'), '损坏：没有 frontmatter 的正文')
  const damaged = service.readWorldbookFolder(result.dir)
  check('损坏后 ok=true 且条目少一（不整批失败）', damaged.ok === true && damaged.worldbook.entries.length === worldbook.entries.length - 1)
  check('warnings 记录损坏文件（相对路径+原因）', damaged.warnings.some((w) => w.includes('人物/李逍遥.md') && w.includes('frontmatter')))
  let threwRelative = false
  try { service.readWorldbookFolder('relative/path') } catch (error) { threwRelative = error.code === 'ERR_INVALID_INPUT' }
  const dotDotPath = `${path.join(tmpRoot, 'a')}${path.sep}..${path.sep}b` // 字面保留 ..（path.join 会规范化掉）
  let threwDotDot = false
  try { service.readWorldbookFolder(dotDotPath) } catch (error) { threwDotDot = error.code === 'ERR_INVALID_INPUT' }
  check('非绝对路径 / 含 .. 拒绝', threwRelative && threwDotDot)
  let threwMissing = false
  try { service.readWorldbookFolder(path.join(tmpRoot, '不存在目录')) } catch (error) { threwMissing = error.code === 'ERR_DIR_NOT_FOUND' }
  check('不存在目录报 ERR_DIR_NOT_FOUND', threwMissing)

  const minimal = { name: '无名剑冢', type: 'lore', keys: ['剑冢'], content: '天下剑客，皆葬于此。' }
  const minimalParsed = parseWorldbookEntryFile(serializeWorldbookEntryFile(minimal))
  check('最小条目（仅 type）序列化→解析：type 别名与 keys 保留', minimalParsed.ok && minimalParsed.entry.type === 'lore' && minimalParsed.entry.kind === 'lore' && deepEqual(minimalParsed.entry.keys, ['剑冢']) && minimalParsed.entry.content === minimal.content)
  check('最小条目派生字段（status=active、cat=设定、tags/links=[]）', minimalParsed.entry.status === 'active' && deepEqual(minimalParsed.entry.cat, ['设定']) && minimalParsed.entry.tags.length === 0 && minimalParsed.entry.links.length === 0)
  const special = { id: 'sp_1', name: '李: 白', type: 'general', keys: ['含, 逗号', 'a: b'], content: 'x' }
  const specialRound = parseWorldbookEntryFile(serializeWorldbookEntryFile(special))
  check('特殊字符往返（冒号/逗号值引号包裹、块列表）', specialRound.ok && specialRound.entry.name === '李: 白' && deepEqual(specialRound.entry.keys, ['含, 逗号', 'a: b']))
  const specialText = serializeWorldbookEntryFile(special)
  check('含逗号/冒号的列表项单引号包裹后行内数组（契约 emitter；引号内逗号是 kit 解析已记录的子集边界）', specialText.includes("keys: ['含, 逗号', 'a: b']"))
  check('缺 frontmatter 报 MISSING_FRONTMATTER', parseWorldbookEntryFile('纯文本').ok === false && parseWorldbookEntryFile('纯文本').error.code === 'MISSING_FRONTMATTER')

  const validated = service.validateWorldbookFiles({
    'good.md': serializeWorldbookEntryFile(minimal),
    'bad.md': '没有 frontmatter',
    'num.md': 42
  })
  check('validateWorldbookFiles：逐文件 ok/error', validated.length === 3 && validated[0].ok === true && validated[1].ok === false && validated[1].error.code === 'MISSING_FRONTMATTER' && validated[2].ok === false)
  let validateThrew = false
  try { service.validateWorldbookFiles(null) } catch (error) { validateThrew = error.code === 'ERR_INVALID_INPUT' }
  try { service.validateWorldbookFiles(['a.md']) } catch { validateThrew = true }
  check('validateWorldbookFiles 非 {relPath:text} 抛 ERR_INVALID_INPUT', validateThrew)
  check('buildWorldbookIndexFile / buildWorldbookGraphFile 纯函数直出', deepEqual(buildWorldbookIndexFile(worldbook), index) && deepEqual(buildWorldbookGraphFile(worldbook), graph))

  console.log('[8] 路由公网门 403（express 可导入时；worktree 无 node_modules 则 SKIP）')
  let expressMod = null
  try { expressMod = await import('express') } catch { /* 零依赖 worktree：跳过 */ }
  if (expressMod) {
    const { createLocalMirrorRouter } = await import('../server/routes/localMirror.js')
    const router = createLocalMirrorRouter({ service })
    // 伪 express 脚手架：req.query 由 express app 层填充、res.json 缺省 200 由 express 收尾——
    // 直调 router 需自备（只补脚手架，不改任何断言）。
    const fakeRes = () => ({ code: 0, body: null, status(c) { this.code = c; return this }, json(b) { if (!this.code) this.code = 200; this.body = b; return this } })
    const call = (method, url, extra = {}) => {
      const res = fakeRes()
      const query = Object.fromEntries(new URL(`http://local${url}`).searchParams)
      router({ method, url, query, headers: {}, ...extra }, res, () => {})
      return res
    }
    const prevOrigin = process.env.PINAX_PUBLIC_ORIGINS
    process.env.PINAX_PUBLIC_ORIGINS = 'https://example.com'
    const gateGet = call('GET', `/worldbook?path=${encodeURIComponent(result.dir)}`)
    const gatePost = call('POST', '/worldbook-validate', { body: { files: {} } })
    check('公网部署 GET /worldbook → 403', gateGet.code === 403 && gateGet.body.error === 'ERR_LOCAL_ONLY')
    check('公网部署 POST /worldbook-validate → 403', gatePost.code === 403)
    if (prevOrigin === undefined) delete process.env.PINAX_PUBLIC_ORIGINS
    else process.env.PINAX_PUBLIC_ORIGINS = prevOrigin
    const localGet = call('GET', `/worldbook?path=${encodeURIComponent(result.dir)}`)
    const localPost = call('POST', '/worldbook-validate', { body: { files: { 'a.md': 'no fm' } } })
    check('本机放行：GET /worldbook 200 且 worldbook 读回', localGet.code === 200 && localGet.body.ok === true && localGet.body.worldbook.name === '冒烟世界书')
    check('本机放行：POST /worldbook-validate 200 且逐文件结果', localPost.code === 200 && localPost.body.ok === true && localPost.body.results[0].ok === false)
  } else {
    console.log('  SKIP 公网门 403（worktree 无 node_modules/express；集成机 npm ci 后本组用例自动启用）')
  }

  console.log(`\n冒烟结果：${passed} 过，${failures.length} 挂${failures.length ? `：\n  - ${failures.join('\n  - ')}` : ''}`)
  process.exitCode = failures.length ? 1 : 0
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
}
