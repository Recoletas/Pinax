/* eslint-disable no-console */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pinax-mcp-smoke-'))
const projectRoot = path.join(temp, '项目')
const appData = path.join(temp, 'appdata')
let failed = 0

// 对外契约：工具清单写死在这里，新增/删除工具必须同时改这里并记入 docs/STATUS.md。
const EXPECTED_TOOLS = [
  'pinax_project_list',
  'pinax_project_open',
  'pinax_project_context',
  'pinax_chapter_list',
  'pinax_chapter_read',
  'pinax_worldbook_list',
  'pinax_worldbook_read',
  'pinax_outline_read',
  'pinax_agent_ask',
  'pinax_expert_list',
  'pinax_expert_invoke',
  'pinax_chapter_write',
  'pinax_project_init',
  'pinax_rule_write',
  'pinax_worldbook_write',
  'pinax_chapter_import',
  'pinax_project_import',
  'pinax_project_index',
  'pinax_knowledge_search'
]

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`ok   ${name}`)
  } else {
    failed += 1
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content, 'utf-8')
}

function buildFixture() {
  write(path.join(projectRoot, '.pinax', 'project.json'), JSON.stringify({
    schemaVersion: 1,
    spec: 'pinax-project@1',
    projectId: 'proj_smoke',
    name: '烟雾项目',
    kind: 'novel',
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z'
  }, null, 2))
  write(path.join(projectRoot, '正文', '01-开篇.md'), '开篇正文：雨落在旧城。\n\n林晚推门进来。')
  write(path.join(projectRoot, '正文', '02-转折.md'), '第二章正文：她看见了那封信。')
  write(path.join(projectRoot, '世界书', '人物', '林晚.md'), [
    '---',
    'id: char_linwan',
    'name: 林晚',
    'type: character',
    'tags:',
    '  - 主角',
    'keys:',
    '  - 晚晚',
    '---',
    '林晚，二十七岁，旧城档案馆临时工。'
  ].join('\n'))
  write(path.join(projectRoot, '大纲', 'outline.json'), JSON.stringify({
    nodes: [{ id: 'n1', title: '开篇', summary: '旧城雨夜' }],
    edges: []
  }, null, 2))
  write(path.join(projectRoot, '约束', '基调.md'), '叙述保持克制，不用感叹号堆情绪。')
  write(path.join(appData, 'projects.registry.json'), JSON.stringify({
    schema: 'pinax-project@1',
    projects: [{
      projectId: 'proj_smoke',
      bookId: 'book_smoke',
      name: '烟雾项目',
      kind: 'novel',
      rootPath: projectRoot,
      lastOpenedAt: '2026-10-26T00:00:00.000Z',
      lastSyncAt: null
    }]
  }, null, 2))
}

// 批次8 素材夹具：作者真实稿子的三种形态各来一份（每章一目录、kit 式 JSON frontmatter 世界书、衍生品），
// 用来钉住分类契约：认得出的进标准目录，认不出的必须记账。
function buildSourceFixture(sourceRoot) {
  write(path.join(sourceRoot, '故事主体', '卷一', '第001章-延迟', '小说.md'), '第001章-延迟\n\n她迟到了三年。\n')
  write(path.join(sourceRoot, '故事主体', '卷一', '第001章-延迟', '剧本.md'), '第001章 剧本\n\n内景 旧城 夜\n')
  write(path.join(sourceRoot, '正文', '第002章-倒带.md'), '第002章-倒带\n\n磁带倒回起点。\n')
  write(path.join(sourceRoot, '规则', '文风.md'), '一拍一段，少用成语。\n')
  write(path.join(sourceRoot, '约束', '文风.md'), '一拍一段，少用成语。\n')
  write(path.join(sourceRoot, '世界书', '人物-柯秒.md'), ['---', '{', '  "id": "pj/wb/人物-柯秒",', '  "title": "人物·柯秒",', '  "tags": ["柯秒", "冷穿越"]', '}', '---', '', '# 人物·柯秒', '', '她在火锅局里醒来，只记得片段。'].join('\n'))
  write(path.join(sourceRoot, '世界书', '00-索引.md'), '# 世界书索引\n\n- 人物-柯秒\n')
  write(path.join(sourceRoot, '世界书', 'graph.json'), JSON.stringify({ entries: [{ id: 'pj/wb/人物-柯秒', title: '人物·柯秒' }] }, null, 2))
  write(path.join(sourceRoot, '资料', '归档', '访谈.json'), JSON.stringify({ docId: 'interview-1', meta: { title: '作者访谈' }, chunks: [{ id: 'c1', text: '第一问：为什么改名叫大梦。' }] }, null, 2))
  write(path.join(sourceRoot, '大纲', 'outline.json'), JSON.stringify({ nodes: [{ id: 'o1', title: '开篇', summary: '火锅局醒来' }, { id: 'o2', title: '倒带', summary: '磁带回起点' }], edges: [] }, null, 2))
  write(path.join(sourceRoot, '大纲', '001-004.md'), '# 第一卷大纲\n\n四章收口。\n')
  write(path.join(sourceRoot, '构思', '项目总览.md'), '# 大梦构思\n\n梦界之主。\n')
  write(path.join(sourceRoot, '素材', '开篇参考-哪吒讲古.md'), '# 开篇参考\n\n讲古的节奏。\n')
  write(path.join(sourceRoot, '日志', '2026-10-26.md'), '# 2026-10-26\n\n定了名字。\n')
  write(path.join(sourceRoot, '素材', '图片.jpg'), '不是真图片，只是占位文本')
  write(path.join(sourceRoot, '乱七八糟', '说明.md'), '这文件没有固定类别，必须记账。\n')
}

function treeDigest(dir) {
  const hash = createHash('sha256')
  const walk = (current) => {
    for (const dirent of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(current, dirent.name)
      if (dirent.isDirectory()) {
        hash.update(`d\0${path.relative(dir, file)}\0`)
        walk(file)
        continue
      }
      hash.update(`f\0${path.relative(dir, file)}\0`).update(fs.readFileSync(file))
    }
  }
  walk(dir)
  return hash.digest('hex')
}

function payload(result) {  const text = result?.content?.find((item) => item.type === 'text')?.text || ''
  try { return JSON.parse(text) } catch { return { raw: text } }
}

// 假 advisor：只验证「信封组装 + HTTP 桥 + 错误映射」，不触碰真实模型。
function createAdvisorStub() {
  const state = { requests: [], lastBody: null }
  const handle = (body, res) => {
    state.lastBody = body
    state.requests.push(body)
    if (String(body?.question || '').includes('__fail__')) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ code: 'AGENT_PROVIDER_FAILED', error: 'stub advisor failed', retryable: false }))
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      taskType: body?.taskType,
      advice: 'stub advice：先收紧第二章的转折，再补一封信的来历。',
      result: { answer: '档案馆', claims: [] },
      meta: {
        requestId: 'req_stub',
        provider: 'stub-provider',
        targetRevision: body?.envelope?.target?.revision || null,
        sourceRefs: ['stub:ref'],
        budget: body?.envelope?.budget || null
      }
    }))
  }
  const server = http.createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    let body = {}
    try { body = JSON.parse(raw) } catch { body = {} }
    if (req.method === 'POST' && String(req.url || '').startsWith('/api/advisor/task')) {
      handle(body, res)
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  })
  return { server, state, handle }
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
}

function close(server) {
  return new Promise((resolve) => server.close(resolve))
}

async function closedPort() {
  const server = http.createServer()
  await listen(server)
  const port = server.address().port
  await close(server)
  return port
}

async function withStdio(envOverrides, fn) {
  const child = spawn(process.execPath, [path.join(root, 'server/mcp/index.js')], {
    cwd: root,
    env: { ...process.env, PINAX_APP_DATA: appData, PINAX_MIRROR_ROOT: path.join(temp, 'mirror'), PINAX_PUBLIC_ORIGINS: '', ...envOverrides },
    stdio: ['pipe', 'pipe', 'pipe']
  })
  let buffer = ''
  let stderr = ''
  let nextId = 1
  const pending = new Map()
  child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString()
    let index
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (!line) continue
      let message
      try { message = JSON.parse(line) } catch { continue }
      if (message.id != null && pending.has(message.id)) {
        const entry = pending.get(message.id)
        pending.delete(message.id)
        if (message.error) entry.reject(new Error(message.error.message || JSON.stringify(message.error)))
        else entry.resolve(message.result)
      }
    }
  })
  const client = {
    request: (method, params = {}) => new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
      setTimeout(() => {
        if (!pending.has(id)) return
        pending.delete(id)
        reject(new Error(`timeout: ${method}\n${stderr.slice(-800)}`))
      }, 15000)
    }),
    notify: (method, params = {}) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'),
    stderr: () => stderr
  }
  try {
    await client.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'pinax-smoke', version: '0.0.0' }
    })
    client.notify('notifications/initialized')
    return await fn(client)
  } finally {
    child.kill()
  }
}

async function runStdio() {
  await withStdio({}, async (client) => {
    const listed = await client.request('tools/list')
    const names = (listed.tools || []).map((tool) => tool.name)
    check(`tools/list 返回 ${EXPECTED_TOOLS.length} 个工具`, names.length === EXPECTED_TOOLS.length, names.join(','))
    check('工具清单与期望完全一致', EXPECTED_TOOLS.every((name) => names.includes(name)) && names.every((name) => EXPECTED_TOOLS.includes(name)), names.join(','))
    for (const name of EXPECTED_TOOLS) {
      check(`包含 ${name}`, names.includes(name))
    }

    const projects = payload(await client.request('tools/call', { name: 'pinax_project_list', arguments: {} }))
    check('project_list 读到 1 个项目', projects.count === 1, JSON.stringify(projects).slice(0, 200))

    const opened = payload(await client.request('tools/call', { name: 'pinax_project_open', arguments: { projectId: 'book_smoke' } }))
    check('project_open 按 bookId 打开', opened.ok === true && opened.project?.rootPath === path.resolve(projectRoot), JSON.stringify(opened).slice(0, 240))
    check('project_open 统计 2 章', opened.counts?.chapters === 2, JSON.stringify(opened.counts))

    const chapters = payload(await client.request('tools/call', { name: 'pinax_chapter_list', arguments: { projectPath: projectRoot } }))
    check('chapter_list 标题正确', chapters.chapters?.[0]?.title === '开篇', JSON.stringify(chapters).slice(0, 200))

    const chapter = payload(await client.request('tools/call', { name: 'pinax_chapter_read', arguments: { projectPath: projectRoot, index: 1 } }))
    check('chapter_read 读到第二章', chapter.content?.includes('那封信') === true, JSON.stringify(chapter).slice(0, 200))
    check('chapter_read 标记未截断', chapter.truncated === false)

    const wbList = payload(await client.request('tools/call', { name: 'pinax_worldbook_list', arguments: { projectPath: projectRoot } }))
    check('worldbook_list 读到林晚', wbList.entries?.some((entry) => entry.name === '林晚') === true, JSON.stringify(wbList).slice(0, 240))

    const wb = payload(await client.request('tools/call', { name: 'pinax_worldbook_read', arguments: { projectPath: projectRoot, name: '林晚' } }))
    check('worldbook_read 读到正文', wb.entry?.content?.includes('档案馆') === true, JSON.stringify(wb).slice(0, 240))

    const outline = payload(await client.request('tools/call', { name: 'pinax_outline_read', arguments: { projectPath: projectRoot } }))
    check('outline_read 读到节点', outline.nodeCount === 1 && outline.nodes?.[0]?.title === '开篇', JSON.stringify(outline).slice(0, 200))

    const context = payload(await client.request('tools/call', { name: 'pinax_project_context', arguments: { projectPath: projectRoot } }))
    check('project_context 带章节与约束', context.chapters?.length === 2 && context.rules?.length === 1, JSON.stringify(context).slice(0, 240))

    const notProject = payload(await client.request('tools/call', { name: 'pinax_project_open', arguments: { projectPath: temp } }))
    check('拒绝非项目目录', notProject.ok === false && notProject.code === 'ERR_NOT_LOCAL_PROJECT', JSON.stringify(notProject))

    const missing = payload(await client.request('tools/call', { name: 'pinax_project_open', arguments: { projectId: 'proj_missing' } }))
    check('拒绝不存在的项目', missing.ok === false && missing.code === 'ERR_PROJECT_NOT_FOUND', JSON.stringify(missing))

    const traversal = payload(await client.request('tools/call', { name: 'pinax_project_open', arguments: { projectPath: `${projectRoot}/../..` } }))
    check('拒绝 .. 路径', traversal.ok === false && traversal.code === 'ERR_PATH_INVALID', JSON.stringify(traversal))

    const manuscriptFile = path.join(projectRoot, '正文', '02-转折.md')
    const before = fs.readFileSync(manuscriptFile, 'utf-8')
    const proposal = payload(await client.request('tools/call', {
      name: 'pinax_chapter_write',
      arguments: {
        projectPath: projectRoot,
        chapterIndex: 1,
        content: '第二章正文（提案版）：她把信折好放回抽屉。',
        note: '收紧结尾'
      }
    }))
    check('chapter_write 生成提案', proposal.ok === true && proposal.reused === false && String(proposal.proposal?.relativePath || '').startsWith('.pinax/proposals/'), JSON.stringify(proposal).slice(0, 240))
    check('提案不改原稿', fs.existsSync(proposal.proposal?.path || '') && fs.readFileSync(manuscriptFile, 'utf-8') === before)
    let savedProposal = {}
    try { savedProposal = JSON.parse(fs.readFileSync(proposal.proposal?.path || '', 'utf-8')) } catch { savedProposal = {} }
    check('提案字段与溯源完整', savedProposal.schema === 'pinax-proposal@1' && savedProposal.mode === 'review' && savedProposal.origin === 'mcp' && savedProposal.target?.index === 1 && String(savedProposal.content).includes('抽屉') && savedProposal.note === '收紧结尾', JSON.stringify(savedProposal).slice(0, 240))

    const again = payload(await client.request('tools/call', {
      name: 'pinax_chapter_write',
      arguments: { projectPath: projectRoot, chapterIndex: 1, content: '第二章正文（提案版）：她把信折好放回抽屉。' }
    }))
    check('同内容提案复用', again.reused === true && again.proposal?.path === proposal.proposal?.path, JSON.stringify(again).slice(0, 200))

    const unchanged = payload(await client.request('tools/call', {
      name: 'pinax_chapter_write',
      arguments: { projectPath: projectRoot, chapterIndex: 1, content: before }
    }))
    check('与原文相同拒绝写入', unchanged.ok === false && unchanged.code === 'ERR_PROPOSAL_UNCHANGED', JSON.stringify(unchanged).slice(0, 200))

    const noChapter = payload(await client.request('tools/call', {
      name: 'pinax_chapter_write',
      arguments: { projectPath: projectRoot, content: '只给正文不给章节' }
    }))
    check('缺章节引用拒绝写入', noChapter.ok === false && noChapter.code === 'ERR_CHAPTER_REQUIRED', JSON.stringify(noChapter).slice(0, 200))

    // ── 填充工具：初始化 / 约束 / 世界书 / 正文导入 ──
    const importRoot = path.join(temp, '导入项目')
    const init = payload(await client.request('tools/call', {
      name: 'pinax_project_init',
      arguments: { projectPath: importRoot, name: '导入项目', kind: 'novel' }
    }))
    check('project_init 建项目', init.ok === true && init.created === true && fs.existsSync(path.join(importRoot, '.pinax', 'project.json')), JSON.stringify(init).slice(0, 200))
    check('project_init 建骨架目录', Array.isArray(init.dirs) && init.dirs.includes('正文') && init.dirs.includes('世界书') && init.dirs.includes('约束'), JSON.stringify(init.dirs))
    const initAgain = payload(await client.request('tools/call', {
      name: 'pinax_project_init',
      arguments: { projectPath: importRoot, name: '改名不应生效' }
    }))
    check('project_init 已有项目不改动', initAgain.created === false && initAgain.project?.name === '导入项目', JSON.stringify(initAgain).slice(0, 200))

    const rule = payload(await client.request('tools/call', {
      name: 'pinax_rule_write',
      arguments: { projectPath: importRoot, name: '文风-测试', content: '一拍一段，少用成语。' }
    }))
    check('rule_write 写约束', rule.ok === true && rule.created === true && fs.existsSync(path.join(importRoot, '约束', '文风-测试.md')), JSON.stringify(rule).slice(0, 200))
    check('rule_write 识别 kind', rule.kind === 'style', String(rule.kind))
    const ruleSame = payload(await client.request('tools/call', {
      name: 'pinax_rule_write',
      arguments: { projectPath: importRoot, name: '文风-测试', content: '一拍一段，少用成语。' }
    }))
    check('rule_write 同内容复用', ruleSame.reused === true, JSON.stringify(ruleSame).slice(0, 200))
    const ruleConflict = payload(await client.request('tools/call', {
      name: 'pinax_rule_write',
      arguments: { projectPath: importRoot, name: '文风-测试', content: '换一套规则。' }
    }))
    check('rule_write 默认不覆盖', ruleConflict.ok === false && ruleConflict.code === 'ERR_RULE_EXISTS', JSON.stringify(ruleConflict).slice(0, 200))
    const ruleOverwrite = payload(await client.request('tools/call', {
      name: 'pinax_rule_write',
      arguments: { projectPath: importRoot, name: '文风-测试', content: '换一套规则。', overwrite: true }
    }))
    check('rule_write 显式覆盖', ruleOverwrite.updated === true && fs.readFileSync(path.join(importRoot, '约束', '文风-测试.md'), 'utf-8').includes('换一套'), JSON.stringify(ruleOverwrite).slice(0, 200))

    const entry = payload(await client.request('tools/call', {
      name: 'pinax_worldbook_write',
      arguments: { projectPath: importRoot, name: '林晚', type: 'character', tags: ['主角'], keys: ['晚晚'], content: '林晚，旧城档案馆临时工。' }
    }))
    check('worldbook_write 按分类落盘', entry.ok === true && entry.created === true && entry.file === '世界书/人物/林晚.md', JSON.stringify(entry).slice(0, 200))
    const entryRead = payload(await client.request('tools/call', {
      name: 'pinax_worldbook_read',
      arguments: { projectPath: importRoot, name: '林晚' }
    }))
    check('worldbook_write 读回契约字段', entryRead.entry?.type === 'character' && entryRead.entry?.content?.includes('档案馆') === true && entryRead.entry?.keys?.includes('晚晚') === true, JSON.stringify(entryRead).slice(0, 240))
    const entryConflict = payload(await client.request('tools/call', {
      name: 'pinax_worldbook_write',
      arguments: { projectPath: importRoot, name: '林晚', type: 'character', content: '换一段人设。' }
    }))
    check('worldbook_write 同名默认拒绝', entryConflict.ok === false && entryConflict.code === 'ERR_ENTRY_EXISTS', JSON.stringify(entryConflict).slice(0, 200))
    const entryOverwrite = payload(await client.request('tools/call', {
      name: 'pinax_worldbook_write',
      arguments: { projectPath: importRoot, name: '林晚', type: 'character', content: '换一段人设。', overwrite: true }
    }))
    check('worldbook_write 显式覆盖不重复', entryOverwrite.updated === true && payload(await client.request('tools/call', { name: 'pinax_worldbook_list', arguments: { projectPath: importRoot } })).total === 1, JSON.stringify(entryOverwrite).slice(0, 200))

    const chapter1 = payload(await client.request('tools/call', {
      name: 'pinax_chapter_import',
      arguments: { projectPath: importRoot, title: '第一章', content: '第一章正文：梦开始的地方。' }
    }))
    check('chapter_import 按序号命名', chapter1.created === true && chapter1.chapter?.file === '正文/001-第一章.md', JSON.stringify(chapter1).slice(0, 200))
    const chapter2 = payload(await client.request('tools/call', {
      name: 'pinax_chapter_import',
      arguments: { projectPath: importRoot, title: '第二章', content: '第二章正文：延迟。' }
    }))
    check('chapter_import 自动续号', chapter2.chapter?.number === 2 && chapter2.chapter?.file === '正文/002-第二章.md', JSON.stringify(chapter2).slice(0, 200))
    const imported = payload(await client.request('tools/call', { name: 'pinax_chapter_read', arguments: { projectPath: importRoot, index: 0 } }))
    check('chapter_import 读回标题与正文', imported.title === '第一章' && imported.content?.includes('梦开始') === true, JSON.stringify(imported).slice(0, 200))
    const chapterConflict = payload(await client.request('tools/call', {
      name: 'pinax_chapter_import',
      arguments: { projectPath: importRoot, title: '第一章', chapterNumber: 1, content: '换了内容。' }
    }))
    check('chapter_import 默认不覆盖', chapterConflict.ok === false && chapterConflict.code === 'ERR_CHAPTER_EXISTS', JSON.stringify(chapterConflict).slice(0, 200))

    // ── 批次8：整目录导入 + 知识索引状态/检索 ──
    const sourceRoot = path.join(temp, '素材')
    buildSourceFixture(sourceRoot)
    const sourceBefore = treeDigest(sourceRoot)
    const batchRoot = path.join(temp, '批次8项目')
    payload(await client.request('tools/call', { name: 'pinax_project_init', arguments: { projectPath: batchRoot, name: '批次8项目', kind: 'novel' } }))

    const planned = payload(await client.request('tools/call', { name: 'pinax_project_import', arguments: { projectPath: batchRoot, sourcePath: sourceRoot } }))
    check('project_import 默认只出计划', planned.ok === true && planned.mode === 'plan' && !fs.existsSync(path.join(batchRoot, '正文', '001-延迟.md')), JSON.stringify(planned).slice(0, 240))
    check('project_import 计划分类齐全', ['chapter', 'material', 'rule', 'auxiliary', 'outline', 'outline-json', 'idea', 'source', 'log', 'source-json'].every((kind) => planned.decisions?.[kind]) && !planned.decisions?.worldbook, JSON.stringify(planned.decisions))
    check('project_import 记账认不出的文件', (planned.skipReasons?.['unmapped'] || 0) >= 1 && (planned.skipReasons?.['binary-not-importable'] || 0) >= 1, JSON.stringify(planned.skipReasons))
    check('project_import strict 不硬吞世界书', planned.skipReasons?.['worldbook-not-conform'] === 1, JSON.stringify(planned.skipReasons))
    check('project_import 拒绝导 author graph.json', planned.skipReasons?.['graph-owned-by-indexer'] === 1, JSON.stringify(planned.skipReasons))

    const wrappedPlan = payload(await client.request('tools/call', { name: 'pinax_project_import', arguments: { projectPath: batchRoot, sourcePath: sourceRoot, worldbookMode: 'wrap' } }))
    const wbItem = (wrappedPlan.items || []).find((item) => item.decision === 'worldbook')
    check('project_import wrap 用作者 frontmatter 命名', wbItem?.name === '人物·柯秒' && wbItem?.target === '世界书/人物/人物·柯秒.md' && wbItem?.wrapped === true, JSON.stringify(wbItem))

    const applied = payload(await client.request('tools/call', { name: 'pinax_project_import', arguments: { projectPath: batchRoot, sourcePath: sourceRoot, worldbookMode: 'wrap', dryRun: false } }))
    check('project_import 落盘零失败', applied.ok === true && applied.mode === 'apply' && applied.failedCount === 0 && applied.createdCount >= 12, JSON.stringify(applied).slice(0, 240))
    check('project_import 每章一目录认成正文', fs.existsSync(path.join(batchRoot, '正文', '001-延迟.md')) && fs.existsSync(path.join(batchRoot, '正文', '002-倒带.md')), fs.readdirSync(path.join(batchRoot, '正文')).join(','))
    check('project_import 衍生品进 资料/', fs.existsSync(path.join(batchRoot, '资料', '章节衍生', '第001章-延迟', '剧本.md')), '资料/章节衍生 缺失')
    check('project_import 世界书按契约落盘', fs.existsSync(path.join(batchRoot, '世界书', '人物', '人物·柯秒.md')), '世界书/人物 缺失')
    check('project_import 源目录只读', treeDigest(sourceRoot) === sourceBefore, `${sourceBefore.slice(0, 12)} vs ${treeDigest(sourceRoot).slice(0, 12)}`)

    const appliedAgain = payload(await client.request('tools/call', { name: 'pinax_project_import', arguments: { projectPath: batchRoot, sourcePath: sourceRoot, worldbookMode: 'wrap', dryRun: false } }))
    check('project_import 幂等（全复用零新建）', appliedAgain.createdCount === 0 && appliedAgain.failedCount === 0 && appliedAgain.reusedCount === applied.createdCount, JSON.stringify({ c: appliedAgain.createdCount, r: appliedAgain.reusedCount, f: appliedAgain.failedCount }))

    fs.writeFileSync(path.join(batchRoot, '大纲', '001-004.md'), '作者改过的大纲\n', 'utf-8')
    const clash = payload(await client.request('tools/call', { name: 'pinax_project_import', arguments: { projectPath: batchRoot, sourcePath: sourceRoot, worldbookMode: 'wrap', dryRun: false } }))
    check('project_import 内容冲突默认拒绝', clash.failedCount >= 1 && clash.writeFailures?.some((item) => item.code === 'ERR_FILE_EXISTS'), JSON.stringify(clash.writeFailures).slice(0, 240))

    const openedBatch = payload(await client.request('tools/call', { name: 'pinax_project_open', arguments: { projectPath: batchRoot } }))
    check('project_import 后项目可被读回', openedBatch.ok === true && openedBatch.counts?.chapters === 2 && openedBatch.counts?.worldbookEntries === 1, JSON.stringify(openedBatch.counts))
    const outlineBack = payload(await client.request('tools/call', { name: 'pinax_outline_read', arguments: { projectPath: batchRoot } }))
    check('project_import 带上 outline.json', outlineBack.nodeCount === 2, JSON.stringify(outlineBack).slice(0, 200))
    const ruleBack = payload(await client.request('tools/call', { name: 'pinax_project_context', arguments: { projectPath: batchRoot } }))
    check('project_import 规则/约束收敛为一个', (ruleBack.rules || []).filter((item) => item.name === '文风').length === 1, JSON.stringify((ruleBack.rules || []).map((item) => item.name)))

    const indexStatus = payload(await client.request('tools/call', { name: 'pinax_project_index', arguments: { projectPath: batchRoot, action: 'status' } }))
    check('project_index status 如实报状态', indexStatus.ok === true && ['fresh', 'stale', 'never-indexed', 'inputs-rejected', 'runtime-missing'].includes(indexStatus.verdict), JSON.stringify({ v: indexStatus.verdict, r: indexStatus.inputs?.revision?.slice(0, 12) }))
    check('project_index status 只读不写缓存', indexStatus.written === false && !fs.existsSync(path.join(root, '.runtime', 'data', 'knowledge', 'proj_smoke')), String(indexStatus.written))
    const indexSync = payload(await client.request('tools/call', { name: 'pinax_project_index', arguments: { projectPath: batchRoot, action: 'sync' } }))
    // 本冒烟把 advisor 指向 stub：没有真 Pinax 服务，sync 要么真成功（装齐环境时），要么给类型化错误——绝不能被当成成功。
    const knowledgeTypedFailure = indexSync.ok === false && ['KNOWLEDGE_RUNTIME_MISSING', 'ERR_KNOWLEDGE_UNAVAILABLE', 'ERR_KNOWLEDGE_TIMEOUT', 'ERR_KNOWLEDGE_RESPONSE_INVALID', 'ERR_PROJECT_NOT_REGISTERED', 'KNOWLEDGE_READ_FAILED'].includes(indexSync.code)
    check('project_index sync 只在装齐环境时成功，否则类型化拒绝', knowledgeTypedFailure || (indexSync.ok === true && indexSync.verdict === 'fresh'), JSON.stringify({ ok: indexSync.ok, code: indexSync.code, v: indexSync.verdict }).slice(0, 240))
    const searched = payload(await client.request('tools/call', { name: 'pinax_knowledge_search', arguments: { projectPath: batchRoot, q: '柯秒' } }))
    check('knowledge_search 不冒充空结果（无环境时必须给 code）', (searched.ok === true && Array.isArray(searched.results)) || (searched.ok === false && Boolean(searched.code)), JSON.stringify({ ok: searched.ok, code: searched.code, n: searched.resultCount }).slice(0, 240))
    let badVerb = ''
    try {
      await client.request('tools/call', { name: 'pinax_knowledge_search', arguments: { projectPath: batchRoot, verb: 'kb_write', q: 'x' } })
    } catch (error) { badVerb = String(error.message) }
    check('knowledge_search 非只读动词按 -32602 拒绝', /must be one of/i.test(badVerb), badVerb)
    const noSource = payload(await client.request('tools/call', { name: 'pinax_project_import', arguments: { projectPath: batchRoot, sourcePath: '不存在的目录' } }))
    check('project_import 相对路径拒绝', noSource.ok === false && (noSource.code === 'ERR_PATH_NOT_ABSOLUTE' || noSource.code === 'ERR_DIR_NOT_FOUND'), JSON.stringify(noSource).slice(0, 200))
    const selfImport = payload(await client.request('tools/call', { name: 'pinax_project_import', arguments: { projectPath: batchRoot, sourcePath: batchRoot } }))
    check('project_import 拒绝把项目当素材', selfImport.ok === false && selfImport.code === 'ERR_SOURCE_IS_PROJECT', JSON.stringify(selfImport).slice(0, 200))

    let invalidArgs = ''
    try {
      await client.request('tools/call', { name: 'pinax_chapter_import', arguments: { projectPath: importRoot, content: 'x', chapterNumber: '二' } })
    } catch (error) { invalidArgs = String(error.message) }
    check('入参类型错误按 -32602 拒绝', /must be integer|Invalid arguments/i.test(invalidArgs), invalidArgs)
    let unknownTool = ''
    try {
      await client.request('tools/call', { name: 'pinax_not_exists', arguments: {} })
    } catch (error) { unknownTool = String(error.message) }
    check('未知工具按 -32602 拒绝', /not found/i.test(unknownTool), unknownTool)
  })

  await withStdio({ PINAX_PUBLIC_ORIGINS: 'https://example.com' }, async (client) => {
    const blocked = payload(await client.request('tools/call', { name: 'pinax_project_list', arguments: {} }))
    check('公网环境拒绝本地读取', blocked.ok === false && blocked.code === 'ERR_MCP_LOCAL_ONLY', JSON.stringify(blocked))

    const blockedWrite = payload(await client.request('tools/call', {
      name: 'pinax_chapter_write',
      arguments: { projectPath: projectRoot, chapterIndex: 0, content: '公网环境不应写入' }
    }))
    check('公网环境拒绝写提案', blockedWrite.ok === false && blockedWrite.code === 'ERR_MCP_LOCAL_ONLY', JSON.stringify(blockedWrite).slice(0, 200))

    const blockedImport = payload(await client.request('tools/call', {
      name: 'pinax_rule_write',
      arguments: { projectPath: projectRoot, name: '公网规则', content: '公网环境不应写入' }
    }))
    check('公网环境拒绝导入填充', blockedImport.ok === false && blockedImport.code === 'ERR_MCP_LOCAL_ONLY', JSON.stringify(blockedImport).slice(0, 200))
  })
}

async function runAskStdio(advisorUrl, stub) {
  await withStdio({ PINAX_SERVER_URL: advisorUrl }, async (client) => {
    const ask = payload(await client.request('tools/call', {
      name: 'pinax_agent_ask',
      arguments: { projectPath: projectRoot, question: '档案馆里那封信说明了什么？' }
    }))
    check('agent_ask 返回意见', ask.ok === true && String(ask.advice).includes('stub advice'), JSON.stringify(ask).slice(0, 240))

    const body = stub.state.lastBody
    const kinds = (body?.envelope?.blocks || []).map((block) => block.kind)
    check('agent_ask 默认任务类型', body?.taskType === 'authoring.knowledge.query', String(body?.taskType))
    check('agent_ask 信封带 surface/版本', body?.envelope?.surface === 'authoring' && body?.envelope?.version === 1, JSON.stringify(body?.envelope?.surface))
    check('agent_ask 信封含约束/大纲/世界书', ['rules', 'outline', 'worldbook'].every((kind) => kinds.includes(kind)), kinds.join(','))
    check('agent_ask 默认不带章节正文', !kinds.includes('selection'), kinds.join(','))
    check('agent_ask 世界书带档案馆正文', String((body?.envelope?.blocks || []).find((block) => block.kind === 'worldbook')?.content || '').includes('档案馆'))
    check('agent_ask 使用任务 profile 预算', body?.envelope?.budget?.maxChars === 28000, String(body?.envelope?.budget?.maxChars))
    const sum = (body?.envelope?.blocks || []).reduce((total, block) => total + String(block.content || '').length, 0)
    check('agent_ask 预算 usedChars 自洽', sum === body?.envelope?.budget?.usedChars && sum <= (body?.envelope?.budget?.maxChars || 0), `${sum} vs ${body?.envelope?.budget?.usedChars}`)
    check('agent_ask 回执带块清单与来源', ask.context?.blocks?.length >= 3 && ask.meta?.requestId === 'req_stub' && ask.meta?.provider === 'stub-provider', JSON.stringify(ask.meta).slice(0, 200))

    const review = payload(await client.request('tools/call', {
      name: 'pinax_agent_ask',
      arguments: { projectPath: projectRoot, question: '批注这一章', taskType: 'authoring.review.chapter' }
    }))
    const reviewBlocks = (stub.state.lastBody?.envelope?.blocks || [])
    check('review.chapter 默认最后一章', reviewBlocks.some((block) => block.kind === 'selection' && String(block.content).includes('那封信')), JSON.stringify(reviewBlocks.map((block) => block.kind)))
    check('review.chapter 提示默认章节', (review.context?.warnings || []).some((warning) => warning.includes('默认使用最后一章')), JSON.stringify(review.context?.warnings))

    const denied = payload(await client.request('tools/call', {
      name: 'pinax_agent_ask',
      arguments: { projectPath: projectRoot, question: '续写下一段', taskType: 'authoring.continue' }
    }))
    check('拒绝非只读任务', denied.ok === false && denied.code === 'ERR_ASK_TASK_NOT_ALLOWED', JSON.stringify(denied).slice(0, 200))

    const noQuestion = payload(await client.request('tools/call', {
      name: 'pinax_agent_ask',
      arguments: { projectPath: projectRoot }
    }))
    check('缺 question 给 typed error', noQuestion.ok === false && noQuestion.code === 'ERR_QUESTION_REQUIRED', JSON.stringify(noQuestion).slice(0, 200))

    const failed = payload(await client.request('tools/call', {
      name: 'pinax_agent_ask',
      arguments: { projectPath: projectRoot, question: '__fail__ 看看这段' }
    }))
    check('advisor 失败映射 typed error', failed.ok === false && failed.code === 'ERR_ADVISOR_FAILED', JSON.stringify(failed).slice(0, 200))

    const notProject = payload(await client.request('tools/call', {
      name: 'pinax_agent_ask',
      arguments: { projectPath: temp, question: '这本书讲什么？' }
    }))
    check('agent_ask 同样拒绝非项目目录', notProject.ok === false && notProject.code === 'ERR_NOT_LOCAL_PROJECT', JSON.stringify(notProject).slice(0, 200))

    const experts = payload(await client.request('tools/call', { name: 'pinax_expert_list', arguments: {} }))
    check('expert_list 返回 3 位内置', experts.ok === true && experts.count === 3 && ['polish-master', 'dramaturg', 'senior-reader'].every((id) => experts.experts?.some((expert) => expert.id === id)), JSON.stringify(experts).slice(0, 240))
    check('expert_list 默认不给模板', (experts.experts || []).every((expert) => expert.prompt === undefined))
    const withPrompt = payload(await client.request('tools/call', { name: 'pinax_expert_list', arguments: { includePrompt: true } }))
    check('expert_list 可选返回模板', (withPrompt.experts || []).every((expert) => typeof expert.prompt === 'string' && expert.prompt.length > 0))

    const invoked = payload(await client.request('tools/call', {
      name: 'pinax_expert_invoke',
      arguments: { projectPath: projectRoot, expertId: 'polish-master', question: '重点看对话' }
    }))
    const invokeBody = stub.state.lastBody
    check('expert_invoke 返回意见', String(invoked.advice).includes('stub advice') && invoked.expert?.id === 'polish-master', JSON.stringify(invoked).slice(0, 200))
    check('expert_invoke 模板与问题都进入提问', String(invokeBody?.question || '').includes('请以润笔编辑的身份') && String(invokeBody?.question || '').includes('重点看对话'))
    check('expert_invoke 带末章正文', (invokeBody?.envelope?.blocks || []).some((block) => block.kind === 'selection' && String(block.content).includes('那封信')))
    check('expert_invoke 预算按专家配置', invokeBody?.envelope?.budget?.maxChars === 24000, String(invokeBody?.envelope?.budget?.maxChars))

    const templateOnly = payload(await client.request('tools/call', {
      name: 'pinax_expert_invoke',
      arguments: { projectPath: projectRoot, expertId: 'senior-reader' }
    }))
    check('expert_invoke 可只用模板', templateOnly.ok === true && String(stub.state.lastBody?.question || '').includes('资深读者'))

    const missingExpert = payload(await client.request('tools/call', {
      name: 'pinax_expert_invoke',
      arguments: { projectPath: projectRoot, expertId: 'no-such-expert' }
    }))
    check('未知专家 typed error', missingExpert.ok === false && missingExpert.code === 'ERR_EXPERT_NOT_FOUND', JSON.stringify(missingExpert).slice(0, 200))
  })
}

async function runInProcess(deadPort) {
  process.env.PINAX_APP_DATA = appData
  process.env.PINAX_MIRROR_ROOT = path.join(temp, 'mirror')
  const { askAdvisor, resolveAdvisorBaseUrl } = await import(pathToFileURL(path.join(root, 'server/mcp/agentAsk.js')).href)

  let publicTarget = null
  try { resolveAdvisorBaseUrl('http://10.0.0.5:3001') } catch (error) { publicTarget = error }
  check('拒绝非回环 advisor 地址', publicTarget?.code === 'ERR_ADVISOR_TARGET_INVALID', publicTarget?.message)

  let unavailable = null
  try {
    await askAdvisor({ projectPath: projectRoot, question: '在吗', advisorBaseUrl: `http://127.0.0.1:${deadPort}` })
  } catch (error) {
    unavailable = error
  }
  check('advisor 未启动给 ERR_ADVISOR_UNAVAILABLE', unavailable?.code === 'ERR_ADVISOR_UNAVAILABLE', unavailable?.message)
}

async function runExperts() {
  process.env.PINAX_APP_DATA = appData
  const registry = await import(pathToFileURL(path.join(root, 'server/mcp/experts/registry.js')).href)
  const { askAdvisor, resolveAskTask, ASK_TASK_TYPES } = await import(pathToFileURL(path.join(root, 'server/mcp/agentAsk.js')).href)
  const expertFile = path.join(appData, 'experts.json')

  const builtin = registry.loadExperts({ appDataPath: appData })
  check('内置专家 3 个', builtin.experts.length === 3, builtin.experts.map((expert) => expert.id).join(','))
  check('内置专家 id 齐全', ['polish-master', 'dramaturg', 'senior-reader'].every((id) => builtin.experts.some((expert) => expert.id === id)))
  check('专家只用只读任务', builtin.experts.every((expert) => ASK_TASK_TYPES.includes(expert.taskType)), builtin.experts.map((expert) => expert.taskType).join(','))
  check('专家预算不超任务上限', builtin.experts.every((expert) => expert.maxChars <= resolveAskTask(expert.taskType).profile.maxChars))
  check('无配置文件时不创建文件', builtin.file === null && !fs.existsSync(expertFile))

  write(expertFile, JSON.stringify({
    schema: 'pinax-experts@1',
    experts: [
      {
        id: 'my-editor',
        name: '我的编辑',
        role: '按作者自己的口径挑错',
        taskType: 'authoring.review.chapter',
        prompt: '按我的要求看：{question}',
        context: { chapter: 'last', includeOutline: false, worldbookLimit: 2 },
        maxChars: 8000
      },
      { id: 'bad-task', name: '坏任务', taskType: 'authoring.continue', prompt: '续写' },
      { id: 'bad-hooks', name: '坏钩子', taskType: 'authoring.review.chapter', prompt: 'x', hooks: { after: 'rm -rf' } },
      { id: 'polish-master', name: '润笔大师（本机版）', taskType: 'authoring.review.chapter', prompt: '只挑错别字与病句。', context: { chapter: 'last' }, maxChars: 6000 },
      { id: 'dramaturg', disabled: true }
    ]
  }, null, 2))

  const loaded = registry.loadExperts({ appDataPath: appData })
  check('配置文件按应用数据目录读取', loaded.file === expertFile, String(loaded.file))
  check('自定义专家被加载', loaded.experts.some((expert) => expert.id === 'my-editor'))
  check('内置专家可被覆盖', loaded.experts.find((expert) => expert.id === 'polish-master')?.name === '润笔大师（本机版）')
  check('内置专家可被停用', !loaded.experts.some((expert) => expert.id === 'dramaturg'))
  check('非只读任务被拒绝', !loaded.experts.some((expert) => expert.id === 'bad-task') && loaded.warnings.some((warning) => warning.includes('bad-task')))
  check('hooks 配置被拒绝', !loaded.experts.some((expert) => expert.id === 'bad-hooks') && loaded.warnings.some((warning) => warning.includes('hooks')))

  const tooBig = registry.validateExpert({ id: 'too-big', name: '超预算', taskType: 'authoring.next-actions', prompt: 'x', maxChars: 32000 })
  check('超预算专家被拒绝', tooBig.valid === false && tooBig.failures.some((failure) => failure.includes('预算上限')), JSON.stringify(tooBig.failures))

  const myEditor = loaded.experts.find((expert) => expert.id === 'my-editor')
  const composed = registry.composeExpertQuestion(myEditor, '第 2 章的结尾')
  check('模板占位符被替换', composed === '按我的要求看：第 2 章的结尾', composed)
  const appended = registry.composeExpertQuestion(registry.BUILTIN_EXPERTS[0], '重点看对话')
  check('无占位符时问题附在末尾', appended.includes('重点看对话') && appended.startsWith('请以润笔编辑的身份'), appended.slice(0, 60))
  check('空问题只用模板', registry.composeExpertQuestion(registry.BUILTIN_EXPERTS[0], '') === registry.BUILTIN_EXPERTS[0].prompt)

  const options = registry.expertAskOptions(myEditor)
  check('专家选项映射完整', options.taskType === 'authoring.review.chapter' && options.chapterPolicy === 'last' && options.includeOutline === false && options.maxChars === 8000, JSON.stringify(options))

  const stub = createAdvisorStub()
  await listen(stub.server)
  try {
    const advisorUrl = `http://127.0.0.1:${stub.server.address().port}`
    const ask = await askAdvisor({
      projectPath: projectRoot,
      question: registry.composeExpertQuestion(myEditor, '第 2 章的结尾'),
      options: registry.expertAskOptions(myEditor),
      advisorBaseUrl: advisorUrl
    })
    const body = stub.state.lastBody
    const kinds = (body?.envelope?.blocks || []).map((block) => block.kind)
    check('专家提问走既有 advisor', String(ask.advice).includes('stub advice') && body?.taskType === 'authoring.review.chapter', String(body?.taskType))
    check('专家模板进入问题', String(body?.question || '').includes('按我的要求看：第 2 章的结尾'), String(body?.question).slice(0, 80))
    check('专家上下文按配置附带末章', kinds.includes('selection') && !kinds.includes('outline'), kinds.join(','))
    check('专家字数上限生效', body?.envelope?.budget?.maxChars === 8000, String(body?.envelope?.budget?.maxChars))
  } finally {
    await close(stub.server)
  }
}

async function runHttp() {
  const { handleMcpHttp } = await import(pathToFileURL(path.join(root, 'server/mcp/http.js')).href)
  const stub = createAdvisorStub()
  const server = http.createServer(async (req, res) => {
    if (String(req.url || '').startsWith('/api/advisor/task')) {
      let raw = ''
      for await (const chunk of req) raw += chunk
      let body = {}
      try { body = JSON.parse(raw) } catch { body = {} }
      stub.handle(body, res)
      return
    }
    let body = ''
    for await (const chunk of req) body += chunk
    if (body) {
      try { req.body = JSON.parse(body) } catch { req.body = undefined }
    }
    await handleMcpHttp(req, res)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const url = `http://127.0.0.1:${port}/mcp`
  const init = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'http-smoke', version: '0.0.0' } }
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(init)
    })
    const body = await response.json()
    check('HTTP initialize 返回 serverInfo', response.ok && body.result?.serverInfo?.name === 'pinax-local', JSON.stringify(body).slice(0, 240))

    const blocked = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', origin: 'https://evil.example' },
      body: JSON.stringify(init)
    })
    check('HTTP 拒绝浏览器 Origin', blocked.status === 403, String(blocked.status))

    const expertCall = {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'pinax_expert_list', arguments: {} }
    }
    const expertResponse = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(expertCall)
    })
    const expertBody = await expertResponse.json()
    let expertPayload = {}
    try { expertPayload = JSON.parse(expertBody.result?.content?.find((item) => item.type === 'text')?.text || '{}') } catch { expertPayload = {} }
    check(
      'HTTP expert_list 读取本机配置',
      expertPayload.count === 3
        && expertPayload.experts?.some((expert) => expert.id === 'polish-master' && expert.name === '润笔大师（本机版）')
        && !expertPayload.experts?.some((expert) => expert.id === 'dramaturg'),
      JSON.stringify(expertPayload.experts?.map((expert) => expert.id))
    )

    // /mcp 轨：按监听端口回环调既有 /api/advisor，验证同一服务上的问答桥。
    const call = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'pinax_agent_ask',
        arguments: { projectPath: projectRoot, question: '档案馆那封信是谁写的？' }
      }
    }
    const asked = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(call)
    })
    const askedBody = await asked.json()
    const askedText = askedBody.result?.content?.find((item) => item.type === 'text')?.text || ''
    let askedPayload = {}
    try { askedPayload = JSON.parse(askedText) } catch { askedPayload = {} }
    check('HTTP /mcp 问答桥可用', asked.ok && askedPayload.ok === true && String(askedPayload.advice).includes('stub advice'), JSON.stringify(askedPayload).slice(0, 240))
    check('HTTP /mcp 用本机端口调 advisor', stub.state.lastBody?.envelope?.surface === 'authoring' && stub.state.lastBody?.taskType === 'authoring.knowledge.query', JSON.stringify(stub.state.lastBody?.taskType))

    const badCall = { ...call, id: 3, params: { ...call.params, arguments: { ...call.params.arguments, question: '__fail__ 看这段' } } }
    const failedResponse = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(badCall)
    })
    const failedBody = await failedResponse.json()
    const failedText = failedBody.result?.content?.find((item) => item.type === 'text')?.text || ''
    let failedPayload = {}
    try { failedPayload = JSON.parse(failedText) } catch { failedPayload = {} }
    check('HTTP /mcp 透传 typed error', failedPayload.ok === false && failedPayload.code === 'ERR_ADVISOR_FAILED', JSON.stringify(failedPayload).slice(0, 200))
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

try {
  buildFixture()
  const stub = createAdvisorStub()
  await listen(stub.server)
  const advisorUrl = `http://127.0.0.1:${stub.server.address().port}`
  try {
    await runStdio()
    await runAskStdio(advisorUrl, stub)
  } finally {
    await close(stub.server)
  }
  await runInProcess(await closedPort())
  await runExperts()
  await runHttp()
} catch (error) {
  failed += 1
  console.error(`FAIL runner — ${error.stack || error.message}`)
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}

if (failed) {
  console.error(`\nmcp smoke: ${failed} failed`)
  process.exit(1)
}
console.log('\nmcp smoke: all checks passed')
