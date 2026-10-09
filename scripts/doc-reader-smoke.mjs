#!/usr/bin/env node
// W1-B 文档阅读器 v1 冒烟（纯 node、零新依赖、零写入用户数据）：
//   [1] fixture 完整性（kit 逐字提取 + LF；kit 仓在场时回抽等价校验）
//   [2] 剧本渲染器：script-forge 格式逐特征行级识别
//   [3] 剧本渲染器：scene-breakdown 分镜格式识别
//   [4] 大纲渲染器：outline.json 节点/边/状态映射
//   [5] 容错：空文件 / 无关 md / 损坏 JSON 不抛异常、走兜底
//   [6] 渲染函数纯净性（不发任何 fetch 请求）
//   [7] 隔离样例项目（%LOCALAPPDATA%\pinax-probe\doc-reader-fixture\，供截图）
// 运行：node scripts/doc-reader-smoke.mjs（全过 exit 0 / 有败 exit 1）
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { analyzeScriptDocument, detectScriptFormat, measureScriptFeatures } from '../src/services/documents/scriptFormat.js'
import { buildOutlineView, parseOutlineJsonText, OUTLINE_STATUS_KEYS, OUTLINE_EDGE_KINDS } from '../src/services/documents/outlineView.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const fixtureDir = path.join(root, 'scripts', 'fixtures', 'documents')

let passed = 0
let failed = 0
const check = (name, condition) => {
  try {
    assert.ok(condition, name)
    passed += 1
    console.log(`  ✓ ${name}`)
  } catch (error) {
    failed += 1
    console.error(`  ✗ ${name}${error?.message ? ` — ${error.message}` : ''}`)
  }
}

// 渲染路径纯净性闸门：先钉死 fetch，任何渲染中的网络请求都会抛错。
const fetchProbe = { calls: 0 }
globalThis.fetch = async (...args) => {
  fetchProbe.calls += 1
  throw new Error(`render path must not fetch: ${args[0]}`)
}

function firstOfKind(lines, kind) {
  return lines.find((line) => line.kind === kind)
}

function readFixture(name) {
  return fs.readFileSync(path.join(fixtureDir, name), 'utf8')
}

console.log('[1] fixture 完整性（kit 逐字 + LF）')
const scriptFixturePath = path.join(fixtureDir, 'script-forge-sample.md')
const breakdownFixturePath = path.join(fixtureDir, 'scene-breakdown-sample.md')
const scriptFixture = readFixture('script-forge-sample.md')
const breakdownFixture = readFixture('scene-breakdown-sample.md')
check('剧本 fixture 存在且非空', scriptFixture.trim().length > 100)
check('分镜 fixture 存在且非空', breakdownFixture.trim().length > 30)
check('两个 fixture 均为 LF 行尾（无 CR）', !scriptFixture.includes('\r') && !breakdownFixture.includes('\r'))
check('剧本 fixture 含 kit 特征原文', scriptFixture.includes('# 剧本 · 《书名》（N 集试稿）')
  && scriptFixture.includes('## 第1集《集名》')
  && scriptFixture.includes('场景：县水利局会议室 · 日 · 内')
  && scriptFixture.includes('卡点：代价——'))
check('分镜 fixture 含 kit 特征原文', breakdownFixture.startsWith('第X集 · 分镜 N') && breakdownFixture.includes('备注：'))
const kitScriptForge = 'D:/storyflow-kit/skills/script-forge.md'
const kitSceneBreakdown = 'D:/storyflow-kit/skills/scene-breakdown.md'
if (fs.existsSync(kitScriptForge) && fs.existsSync(kitSceneBreakdown)) {
  const reExtractScript = fs.readFileSync(kitScriptForge, 'utf8').split(/\r?\n/).slice(29, 46).join('\n') + '\n'
  const reExtractBreakdown = fs.readFileSync(kitSceneBreakdown, 'utf8').split(/\r?\n/).slice(17, 24).join('\n') + '\n'
  check('剧本 fixture 与 kit 仓 30-46 行逐字等价', reExtractScript === scriptFixture)
  check('分镜 fixture 与 kit 仓 18-24 行逐字等价', reExtractBreakdown === breakdownFixture)
} else {
  console.log('  - kit 仓不在场，跳过回抽等价校验')
}

console.log('[2] 剧本渲染器：script-forge 格式逐特征行级识别')
const scriptLines = analyzeScriptDocument(scriptFixture)
const episode = firstOfKind(scriptLines, 'episodeHeading')
check('## 第N集《集名》 → episodeHeading（大节标题，去 ## 前缀）', !!episode && episode.text === '第1集《集名》')
const scene = firstOfKind(scriptLines, 'sceneHead')
check('场景：… → sceneHead（场景头，剥前缀）', !!scene && scene.text === '县水利局会议室 · 日 · 内')
const action = firstOfKind(scriptLines, 'action')
check('△ 动作行 → action（剥 △ 前缀）', !!action && action.text === '全场排队签免责承诺书，笔尖声此起彼伏。')
const dialogue = scriptLines.filter((line) => line.kind === 'dialogue')
check('角色（情绪提示）：台词 → dialogue（说话人+情绪）',
  dialogue.length === 2
  && dialogue[0].speaker === '钱有德' && dialogue[0].emotion === '把承诺书拍在桌上'
  && dialogue[1].speaker === '陈默' && dialogue[1].emotion === '不抬头，在签名旁加注'
  && dialogue[0].text === '人人都签了，就你特殊？')
const hook = firstOfKind(scriptLines, 'hook')
check('卡点：… → hook（剥前缀）', !!hook && hook.text.startsWith('代价——'))
const narration = scriptLines.filter((line) => line.kind === 'narration')
check('[旁白：…] → narration（剥括号）', narration.length === 2 && narration[0].text.startsWith('清源县城三面环水'))
const h1 = firstOfKind(scriptLines, 'mdHeading')
check('# 剧本 → mdHeading level 1', !!h1 && h1.level === 1 && h1.text.startsWith('剧本 · 《书名》'))
check('> 一句话 → quote', firstOfKind(scriptLines, 'quote')?.text.startsWith('一句话：'))
check('格式说明括号行未误判 → plain', scriptLines.some((line) => line.kind === 'plain' && line.text.startsWith('（一集 2-4 个场景')))
const scriptCounts = measureScriptFeatures(scriptFixture)
check('特征计数（场景1/动作2/台词2/卡点1/旁白2）',
  scriptCounts.sceneHead === 1 && scriptCounts.action === 2 && scriptCounts.dialogue === 2
  && scriptCounts.hook === 1 && scriptCounts.narration === 2)
check('detectScriptFormat 判定为剧本', detectScriptFormat(scriptFixture).isScript)

console.log('[3] 剧本渲染器：scene-breakdown 分镜格式识别')
const breakdownLines = analyzeScriptDocument(breakdownFixture)
check('第X集 · 分镜 N → breakdownHeading（小节标题）', breakdownLines[0].kind === 'breakdownHeading' && breakdownLines[0].text === '第X集 · 分镜 N')
check('分镜 场景： → sceneHead', breakdownLines[1].kind === 'sceneHead' && breakdownLines[1].text === '地点/时间/在场人物')
const fields = breakdownLines.filter((line) => line.kind === 'breakdownField')
check('行动/台词/备注 → breakdownField（保留字段名）',
  fields.length === 3 && fields.map((field) => field.label).join(',') === '行动,台词,备注')
const indentedDialogue = breakdownLines.filter((line) => line.kind === 'dialogue')
check('缩进 角色名：台词 → dialogue（识别说话人）', indentedDialogue.length === 2 && indentedDialogue[0].speaker === '角色名' && indentedDialogue[0].text === '说什么（达意即可，口语）')
check('detectScriptFormat 判定分镜为剧本', detectScriptFormat(breakdownFixture).isScript)

console.log('[4] 大纲渲染器：outline.json 节点/边/状态映射')
const outlineJson = readFixture('outline.json')
const parsed = parseOutlineJsonText(outlineJson)
check('outline.json 解析 ok', parsed.ok === true && parsed.warning === '')
const view = parsed.view
check('节点 6 / 边 7，hasStructure', view.nodes.length === 6 && view.edges.length === 7 && view.hasStructure)
check('状态覆盖五态且计数正确', JSON.stringify(view.statusCounts) === JSON.stringify({
  exploring: 1, planned: 1, drafted: 1, fulfilled: 2, parked: 1
}))
check('状态键集对齐写侧（exploring/planned/drafted/fulfilled/parked）', OUTLINE_STATUS_KEYS.join(',') === 'exploring,planned,drafted,fulfilled,parked')
check('边型键集对齐写侧（causes/foreshadows/alternative/parallel）', OUTLINE_EDGE_KINDS.join(',') === 'causes,foreshadows,alternative,parallel')
check('边按 kind 列举（因果3/伏笔2/另一种可能1/并行1）',
  view.edgesByKind.causes.length === 3 && view.edgesByKind.foreshadows.length === 2
  && view.edgesByKind.alternative.length === 1 && view.edgesByKind.parallel.length === 1)
const edge01 = view.edges.find((edge) => edge.id === 'edge-01')
check('边端点解析为节点标题', edge01?.fromTitle === '楔子：水库渗漏报告' && edge01?.toTitle === '免责承诺书签字会')
check('chapterRefs 保留（节点2 关联 2 章）', view.nodes[1].chapterRefs.length === 2 && view.nodes[1].chapterRefs[1] === 'ch-002')
check('explorationRefs 计数（节点5 有 1 条推演引用）', view.nodes[4].explorationRefs.length === 1)
check('未知 status 回落 exploring', buildOutlineView([{ id: 'x', title: 'X', status: 'bogus' }], []).nodes[0].status === 'exploring')

console.log('[5] 容错：空文件 / 无关 md / 损坏 JSON')
check('空字符串 → 空行集、非剧本', analyzeScriptDocument('').every((line) => line.kind === 'blank') && detectScriptFormat('').isScript === false)
check('null/非字符串 → 单个空行不抛、非剧本', [null, undefined, 42].every((input) => {
  const lines = analyzeScriptDocument(input)
  return lines.length === 1 && lines[0].kind === 'blank' && detectScriptFormat(input).isScript === false
}))
const grocery = '# 购物清单\n\n- 牛奶\n- 鸡蛋\n\n今天天气不错：普通的冒号行\n注意：普通说明也不误判\n'.replace(/\n/g, '\n')
const groceryDetection = detectScriptFormat(grocery)
check('无关 md 不判为剧本且行全 plain/mdHeading/list', groceryDetection.isScript === false
  && analyzeScriptDocument(grocery).every((line) => ['mdHeading', 'plain', 'blank'].includes(line.kind)))
check('孤立 场景： 行（无动作/对白）不判为剧本', detectScriptFormat('场景：客厅 · 夜 · 内\n他在沙发上坐下。').isScript === false)
const brokenJson = parseOutlineJsonText('{ nodes: [oops]')
check('损坏 JSON → ok:false + warning + 空视图', brokenJson.ok === false && brokenJson.warning.length > 0 && brokenJson.view.hasStructure === false)
check('空 JSON 文本 → 降级 warning', parseOutlineJsonText('   ').ok === false)
const dirty = buildOutlineView(
  [null, 42, { title: '无 id 节点' }, { id: 'ok', title: '好节点', status: 'drafted', chapterRefs: [{ chapterId: 'c1' }, '', 'c1'] }],
  [{ id: 'e1', kind: 'causes', fromNodeId: 'ok', toNodeId: 'node-2' }, { fromNodeId: '', toNodeId: '' }, { fromNodeId: 'ok', toNodeId: 'ok' }, null]
)
check('脏节点/脏边容错（自环与缺端点丢弃、chapterRefs 去重）', dirty.nodes.length === 2 && dirty.nodes[0].id === 'node-1' && dirty.edges.length === 1 && dirty.edges[0].toNodeId === 'node-2' && dirty.nodes[1].chapterRefs.join(',') === 'c1')
check('buildOutlineView(null,null) → 空视图不抛', buildOutlineView(null, null).hasStructure === false)
check('outline.md 走通用兜底（非剧本）', detectScriptFormat(readFixture('outline.md')).isScript === false)

console.log('[6] 渲染函数纯净性')
check('渲染路径零 fetch（钉死 fetch 下全量重跑）', (() => {
  analyzeScriptDocument(scriptFixture)
  detectScriptFormat(breakdownFixture)
  parseOutlineJsonText(outlineJson)
  buildOutlineView(view.nodes, view.edges)
  return fetchProbe.calls === 0
})())
const serviceSources = [
  fs.readFileSync(path.join(root, 'src', 'services', 'documents', 'scriptFormat.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'src', 'services', 'documents', 'outlineView.js'), 'utf8')
].join('\n')
check('渲染服务源码无 fetch/localStorage 写面', !/\bfetch\s*\(/.test(serviceSources) && !/localStorage/.test(serviceSources))

console.log('[7] 隔离样例项目（不碰用户文档库与项目索引）')
const probeRoot = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'pinax-probe', 'doc-reader-fixture')
const projectId = `proj_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const marker = {
  schemaVersion: 1,
  spec: 'pinax-project@1',
  projectId,
  name: '文档阅读器样例项目',
  kind: 'novel',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}
const outlineJsonText = readFixture('outline.json')
for (const rel of [
  '.pinax',
  '大纲',
  '正文',
  path.join('01-选题'),
  path.join('02-编剧')
]) fs.mkdirSync(path.join(probeRoot, rel), { recursive: true })
fs.writeFileSync(path.join(probeRoot, '.pinax', 'project.json'), `${JSON.stringify(marker, null, 2)}\n`)
fs.writeFileSync(path.join(probeRoot, '大纲', '大纲.md'), readFixture('outline.md'))
fs.writeFileSync(path.join(probeRoot, '大纲', 'outline.json'), outlineJsonText)
fs.writeFileSync(path.join(probeRoot, '01-选题', '选题报告.md'), '# 选题报告 · 汛期无声\n\n- 题材：现实向短剧\n- 情绪锚：小人物守规则\n- 网感钩：签字会上当众加注\n')
fs.writeFileSync(path.join(probeRoot, '02-编剧', '剧本.md'), scriptFixture)
fs.writeFileSync(path.join(probeRoot, '正文', '001-楔子.md'), '# 楔子\n\n水库的水位计三年没人校验。\n')
check('pinax-project@1 marker 就位', (() => {
  const parsedMarker = JSON.parse(fs.readFileSync(path.join(probeRoot, '.pinax', 'project.json'), 'utf8'))
  return parsedMarker.spec === 'pinax-project@1' && /^proj_[a-z0-9]+$/i.test(parsedMarker.projectId)
})())
check('大纲/（大纲.md + outline.json）+ kit 格式剧本 + 选题报告就位',
  fs.existsSync(path.join(probeRoot, '大纲', 'outline.json'))
  && fs.existsSync(path.join(probeRoot, '大纲', '大纲.md'))
  && fs.readFileSync(path.join(probeRoot, '02-编剧', '剧本.md'), 'utf8') === scriptFixture
  && fs.existsSync(path.join(probeRoot, '01-选题', '选题报告.md')))
check('写入面仅在 probe 目录内', probeRoot.includes(path.join('pinax-probe', 'doc-reader-fixture')))

console.log('')
console.log(`doc-reader-smoke: ${passed}/${passed + failed} passed`)
if (failed > 0) {
  console.error(`doc-reader-smoke: ${failed} FAILED`)
  process.exit(1)
}
console.log(`probe project: ${probeRoot}`)
process.exit(0)
