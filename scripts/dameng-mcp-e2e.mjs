/* eslint-disable no-console */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { parseWorldbookEntryFile } from '../server/services/localMirrorService.js'
import { MCP_SERVER_VERSION, tools as MCP_TOOLS } from '../server/mcp/createMcpServer.js'

// 《大梦》真稿 MCP 端到端测试：
// 源目录只读；MCP 只写隔离测试项目与临时应用数据。不会改动作者原稿。
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// 原稿目录不写死：这台机器上没有「作者的默认路径」这种东西，缺入参就显式失败，不猜、不建空目录假装能跑。
const sourceRoot = String(process.env.DAMENG_SOURCE || '').trim()
if (!sourceRoot) {
  console.error('缺少 DAMENG_SOURCE：请用《大梦》原稿目录的绝对路径指定（本脚本只读它，绝不写入）。\n例如：DAMENG_SOURCE="/path/to/大梦" npm run mcp:dameng')
  process.exit(2)
}
if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
  console.error(`DAMENG_SOURCE 不是一个存在的目录：${sourceRoot}`)
  process.exit(2)
}
if (!fs.existsSync(path.join(sourceRoot, '故事主体', '卷一'))) {
  console.error(`目录结构不符：${sourceRoot} 下没有 故事主体/卷一/（章目录）。本脚本按 kit 式布局取稿，换目录前先确认。`)
  process.exit(2)
}
const runRoot = path.join(process.env.PINAX_E2E_ROOT || path.join(os.tmpdir(), 'pinax-dameng-e2e'), `run-${Date.now()}`)
const projectRoot = path.join(runRoot, '大梦-mcp')
const fullRoot = path.join(runRoot, '大梦-全量')
const appData = path.join(runRoot, 'appdata')
const mirrorRoot = path.join(runRoot, 'mirror')
const knowledgeCacheRoot = path.join(runRoot, 'knowledge-cache')
const runtimeRoot = process.env.PINAX_KNOWLEDGE_RUNTIME || path.join(repoRoot, '.runtime', 'knowledge')
const runtimeReady = fs.existsSync(path.join(runtimeRoot, 'core', 'dist', 'verbs.js'))
fs.mkdirSync(runRoot, { recursive: true })

/** 索引编译要 Python（PINAX_PYTHON 只能是单个可执行文件路径）：Windows 上 `python3` 常是商店存根，逐个探针取第一个真能报 3.x 的。 */
function detectPython() {
  for (const candidate of [process.env.PINAX_PYTHON, 'python3', 'python', 'py'].filter(Boolean)) {
    try {
      const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8', timeout: 8000 })
      if (/Python 3\./u.test(`${probe.stdout || ''}${probe.stderr || ''}`)) return candidate
    } catch { /* 换下一个 */ }
  }
  return null
}
const python = detectPython()
/** 两侧（MCP 子进程与临时服务）必须看到同一份缓存根与 runtime，否则 status 永远读不到服务写的 coverage。 */
const knowledgeEnv = Object.freeze({
  PINAX_KNOWLEDGE_RUNTIME: runtimeRoot,
  PINAX_KNOWLEDGE_CACHE_ROOT: knowledgeCacheRoot,
  ...(python ? { PINAX_PYTHON: python } : {})
})

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 500) })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${String(detail).slice(0, 240)}` : ''}`)
}
function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex')
}
/** 整棵源目录树的指纹：用来证明「只新增不动原稿」不是口头承诺。 */
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
function normalize(text) {
  return String(text || '').replace(/\r\n?/g, '\n').trim()
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
}
function close(server) {
  return new Promise((resolve) => server.close(resolve))
}

function createAdvisorStub() {
  const state = { requests: [], lastBody: null }
  const server = http.createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    let body = {}
    try { body = JSON.parse(raw) } catch { body = {} }
    if (req.method === 'POST' && String(req.url || '').startsWith('/api/advisor/task')) {
      state.lastBody = body
      state.requests.push(body)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        taskType: body?.taskType,
        advice: 'stub advice：这是用《大梦》真稿组装的上下文，模型端未参与。',
        result: { answer: 'stub', claims: [] },
        meta: { requestId: 'req_dameng_stub', provider: 'stub', targetRevision: body?.envelope?.target?.revision || null }
      }))
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  })
  return { server, state }
}

async function withMcp(advisorUrl, fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, 'server/mcp/index.js')],
    cwd: repoRoot,
    env: {
      ...process.env,
      PINAX_APP_DATA: appData,
      PINAX_MIRROR_ROOT: mirrorRoot,
      PINAX_PUBLIC_ORIGINS: '',
      PINAX_SERVER_URL: advisorUrl,
      ...knowledgeEnv
    },
    stderr: 'pipe'
  })
  const client = new Client({ name: 'dameng-e2e', version: '1.0.0' }, { capabilities: {} })
  await client.connect(transport)
  try {
    return await fn(client)
  } finally {
    await client.close().catch(() => {})
  }
}

async function call(client, name, args) {
  try {
    const result = await client.callTool({ name, arguments: args })
    const text = result?.content?.find((item) => item.type === 'text')?.text || ''
    let data = result?.structuredContent || null
    if (!data) { try { data = JSON.parse(text) } catch { data = { raw: text } } }
    return { ok: result?.isError ? false : true, isError: Boolean(result?.isError), data }
  } catch (error) {
    return { ok: false, protocolError: true, message: String(error?.message || error), code: error?.code ?? null }
  }
}

function readSource() {
  const rulesDir = path.join(sourceRoot, '规则')
  const rules = fs.readdirSync(rulesDir)
    .filter((name) => /\.md$/iu.test(name))
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
    .map((name) => ({ name: name.replace(/\.md$/iu, ''), content: fs.readFileSync(path.join(rulesDir, name), 'utf-8') }))

  const worldbookDir = path.join(sourceRoot, '世界书', '设定')
  const worldbook = []
  for (const name of fs.readdirSync(worldbookDir).filter((file) => /\.md$/iu.test(file)).sort((a, b) => a.localeCompare(b, 'zh-CN'))) {
    const parsed = parseWorldbookEntryFile(fs.readFileSync(path.join(worldbookDir, name), 'utf-8'))
    if (!parsed.ok) { worldbook.push({ file: name, parseError: parsed.error.message }); continue }
    worldbook.push({
      file: name,
      id: parsed.entry.id,
      name: parsed.entry.name,
      type: parsed.entry.type,
      tags: parsed.entry.tags,
      keys: parsed.entry.keys,
      content: parsed.entry.content
    })
  }

  const volumeDir = path.join(sourceRoot, '故事主体', '卷一')
  const chapters = fs.readdirSync(volumeDir)
    .filter((name) => fs.statSync(path.join(volumeDir, name)).isDirectory())
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
    .map((dir, i) => {
      const text = fs.readFileSync(path.join(volumeDir, dir, '小说.md'), 'utf-8')
      const h1 = text.split('\n').map((line) => line.trim()).find((line) => line.startsWith('# ')) || ''
      return { dir, number: i + 1, title: h1.replace(/^#\s+/, '').trim() || dir, content: text }
    })
  return { rules, worldbook, chapters }
}

async function startRealServer() {
  const port = 39100 + Math.floor(Math.random() * 80)
  const child = spawn(process.execPath, [path.join(repoRoot, 'server/index.js')], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      // 与 MCP 子进程共用注册表：索引链按 projectId 在服务侧查项目绑定，两份 appdata 会直接判「未登记」。
      PINAX_APP_DATA: appData,
      PINAX_MIRROR_ROOT: path.join(runRoot, 'server-mirror'),
      PINAX_PUBLIC_ORIGINS: '',
      ...knowledgeEnv
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let log = ''
  child.stdout.on('data', (chunk) => { log += chunk.toString() })
  child.stderr.on('data', (chunk) => { log += chunk.toString() })
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/localmirror/capabilities`)
      if (response.status < 500) return { port, baseUrl: `http://127.0.0.1:${port}`, child }
    } catch { /* 还没起 */ }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  child.kill()
  throw new Error(`临时服务未在 45s 内就绪\n${log.slice(-1200)}`)
}

const source = readSource()
console.log(`源目录：${sourceRoot}`)
console.log(`测试目录：${runRoot}`)
console.log(`读取：规则 ${source.rules.length} / 世界书 ${source.worldbook.filter((item) => !item.parseError).length} / 章节 ${source.chapters.length}`)

const stub = createAdvisorStub()
await listen(stub.server)
const stubUrl = `http://127.0.0.1:${stub.server.address().port}`
const originalHashes = new Map(source.chapters.map((chapter) => [chapter.number, sha256(fs.readFileSync(path.join(sourceRoot, '故事主体', '卷一', chapter.dir, '小说.md'), 'utf-8'))]))

let realServer = null
try {
  await withMcp(stubUrl, async (client) => {
    const serverInfo = client.getServerVersion()
    record('stdio initialize 返回 serverInfo', serverInfo?.name === 'pinax-local' && serverInfo?.version === MCP_SERVER_VERSION, JSON.stringify(serverInfo))
    record('stdio capabilities 仅 tools', Object.keys(client.getServerCapabilities() || {}).includes('tools'), JSON.stringify(client.getServerCapabilities()))

    const list = await client.listTools()
    record(`tools/list 返回 ${MCP_TOOLS.length} 个工具`, (list.tools || []).length === MCP_TOOLS.length, String((list.tools || []).length))
    const toolNames = (list.tools || []).map((tool) => tool.name)
    record('批次8 工具已上架', ['pinax_project_import', 'pinax_project_index', 'pinax_knowledge_search'].every((name) => toolNames.includes(name)), toolNames.join(','))
    record('工具全部有 annotations 与 description', (list.tools || []).every((tool) => tool.description && tool.annotations && typeof tool.annotations.readOnlyHint === 'boolean'), (list.tools || []).filter((tool) => !tool.description || !tool.annotations).map((tool) => tool.name).join(','))

    const init = await call(client, 'pinax_project_init', { projectPath: projectRoot, name: '大梦-MCP测试', kind: 'novel' })
    record('project_init 创建隔离测试项目', init.ok && init.data?.created === true, JSON.stringify(init).slice(0, 240))

    for (const rule of source.rules) {
      const result = await call(client, 'pinax_rule_write', { projectPath: projectRoot, name: rule.name, content: rule.content })
      record(`rule_write ${rule.name}`, result.ok && result.data?.created === true, JSON.stringify(result.data).slice(0, 200))
    }

    for (const entry of source.worldbook) {
      if (entry.parseError) { record(`worldbook 源解析 ${entry.file}`, false, entry.parseError); continue }
      const result = await call(client, 'pinax_worldbook_write', {
        projectPath: projectRoot,
        name: entry.name,
        type: entry.type,
        id: entry.id,
        tags: entry.tags,
        keys: entry.keys,
        content: entry.content
      })
      record(`worldbook_write ${entry.name}`, result.ok && result.data?.created === true && String(result.data?.file || '').startsWith('世界书/'), JSON.stringify(result.data).slice(0, 200))
    }

    for (const chapter of source.chapters) {
      const result = await call(client, 'pinax_chapter_import', {
        projectPath: projectRoot,
        title: chapter.title,
        chapterNumber: chapter.number,
        content: chapter.content
      })
      record(`chapter_import 第${chapter.number}章`, result.ok && result.data?.created === true, JSON.stringify(result.data?.chapter || result.data).slice(0, 200))
    }

    const opened = await call(client, 'pinax_project_open', { projectPath: projectRoot })
    record('project_open 统计', opened.ok && opened.data?.counts?.chapters === source.chapters.length && opened.data?.counts?.worldbookEntries === source.worldbook.filter((item) => !item.parseError).length, JSON.stringify(opened.data?.counts))
    record('project_open 大纲为空（源只有 001-004.md）', opened.data?.counts?.outlineNodes === 0, String(opened.data?.counts?.outlineNodes))

    const context = await call(client, 'pinax_project_context', { projectPath: projectRoot })
    record('约束读回 6 个', context.data?.rules?.length === source.rules.length, JSON.stringify(context.data?.rules?.map((item) => item.name)))
    record('上下文带大纲缺失 warning', (context.data?.outline?.warnings || []).some((item) => item.includes('outline.json')), JSON.stringify(context.data?.outline?.warnings))
    record('世界书读回 13 条', context.data?.worldbook?.total === 13, String(context.data?.worldbook?.total))

    const secretList = await call(client, 'pinax_worldbook_list', { projectPath: projectRoot, type: 'secret' })
    record('世界书 type=secret 过滤', secretList.data?.total === 5, String(secretList.data?.total))

    const readChapters = await call(client, 'pinax_chapter_list', { projectPath: projectRoot })
    record('章节标题按文件名解析', readChapters.data?.total === 3 && readChapters.data?.chapters?.every((item) => !item.title.startsWith('0')), JSON.stringify(readChapters.data?.chapters?.map((item) => item.title)))

    for (const chapter of source.chapters) {
      const read = await call(client, 'pinax_chapter_read', { projectPath: projectRoot, index: chapter.number - 1, maxChars: 200000 })
      record(`chapter_read 第${chapter.number}章内容一致`, normalize(read.data?.content) === normalize(chapter.content), `${sha256(normalize(read.data?.content)).slice(0, 12)} vs ${sha256(normalize(chapter.content)).slice(0, 12)}`)
    }

    const sampleEntry = source.worldbook.find((item) => !item.parseError && item.name.includes('柯秒'))
    const readEntry = await call(client, 'pinax_worldbook_read', { projectPath: projectRoot, name: sampleEntry.name })
    record('worldbook_read 柯秒条目内容一致', normalize(readEntry.data?.entry?.content) === normalize(sampleEntry.content), `${sha256(normalize(readEntry.data?.entry?.content)).slice(0, 12)} vs ${sha256(normalize(sampleEntry.content)).slice(0, 12)}`)

    const ask = await call(client, 'pinax_agent_ask', { projectPath: projectRoot, question: '柯秒为什么会出现在火锅局？他与十二维有什么关系？' })
    record('agent_ask 走 stub advisor 返回意见', ask.ok && String(ask.data?.advice || '').includes('stub advice'), JSON.stringify(ask.data).slice(0, 240))
    const askBody = stub.state.lastBody
    const askKinds = (askBody?.envelope?.blocks || []).map((block) => block.kind)
    record('agent_ask 信封含真规则/世界书', askKinds.includes('rules') && askKinds.includes('worldbook'), askKinds.join(','))
    record('agent_ask 世界书命中柯秒', (askBody?.envelope?.blocks || []).filter((block) => block.kind === 'worldbook').some((block) => String(block.content || '').includes('柯秒')))
    record('agent_ask 约束块带 6 个文件', (askBody?.envelope?.blocks || []).filter((block) => block.kind === 'rules').length >= 6, String((askBody?.envelope?.blocks || []).filter((block) => block.kind === 'rules').length))
    record('agent_ask 预算不超 28000', Number(askBody?.envelope?.budget?.maxChars) === 28000 && Number(askBody?.envelope?.budget?.usedChars) <= 28000, JSON.stringify(askBody?.envelope?.budget))

    const experts = await call(client, 'pinax_expert_list', {})
    record('expert_list 返回 3 位内置专家', experts.data?.experts?.length === 3, JSON.stringify(experts.data?.experts?.map((item) => item.id)))

    const expert = await call(client, 'pinax_expert_invoke', { projectPath: projectRoot, expertId: 'senior-reader', question: '柯秒这个人物的记忆碎片设定自洽吗？' })
    record('expert_invoke 走 stub advisor', expert.ok && expert.data?.expert?.id === 'senior-reader' && String(expert.data?.advice || '').includes('stub advice'), JSON.stringify(expert.data).slice(0, 240))
    const expertBody = stub.state.lastBody
    record('expert_invoke 问题带专家模板', String(expertBody?.question || '').includes('柯秒'), String(expertBody?.question || '').slice(0, 120))
    record('expert_invoke 上下文命中柯秒', (expertBody?.envelope?.blocks || []).filter((block) => block.kind === 'worldbook').some((block) => String(block.content || '').includes('柯秒')))

    const review = await call(client, 'pinax_agent_ask', { projectPath: projectRoot, question: '批注这一章的结构', taskType: 'authoring.review.chapter', chapterIndex: 2 })
    const reviewSelection = (stub.state.lastBody?.envelope?.blocks || []).find((block) => block.kind === 'selection')
    record('review.chapter 带上第三章正文', review.ok && String(reviewSelection?.content || '').length > 1000, String(reviewSelection?.content || '').slice(0, 80))

    const beforeProposal = new Map(source.chapters.map((chapter) => [chapter.number, sha256(fs.readFileSync(path.join(projectRoot, '正文', fs.readdirSync(path.join(projectRoot, '正文')).sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))[chapter.number - 1]), 'utf-8'))]))
    const targetChapter = source.chapters[1]
    const proposal = await call(client, 'pinax_chapter_write', {
      projectPath: projectRoot,
      chapterIndex: 1,
      content: `${targetChapter.content}\n\n（MCP 测试提案，不应该写进正文。）`,
      note: '大梦真稿 MCP 写回测试',
      expertId: 'polish-master'
    })
    record('chapter_write 生成审阅提案', proposal.ok && proposal.data?.manuscriptUntouched === true && String(proposal.data?.proposal?.relativePath || '').startsWith('.pinax/proposals/'), JSON.stringify(proposal.data).slice(0, 240))
    let saved = null
    try { saved = JSON.parse(fs.readFileSync(proposal.data?.proposal?.path || '', 'utf-8')) } catch { saved = null }
    record('提案 schema/溯源完整', saved?.schema === 'pinax-proposal@1' && saved?.mode === 'review' && saved?.expert?.id === 'polish-master' && saved?.target?.index === 1, JSON.stringify(saved)?.slice(0, 240))
    let manuscriptIntact = true
    for (const chapter of source.chapters) {
      const files = fs.readdirSync(path.join(projectRoot, '正文')).sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
      const current = sha256(fs.readFileSync(path.join(projectRoot, '正文', files[chapter.number - 1]), 'utf-8'))
      if (current !== beforeProposal.get(chapter.number)) manuscriptIntact = false
    }
    record('写提案后三章正文哈希不变', manuscriptIntact)

    let badType = null
    try {
      await client.callTool({ name: 'pinax_chapter_import', arguments: { projectPath: projectRoot, content: 'x', chapterNumber: '三' } })
    } catch (error) { badType = String(error?.message || error) }
    record('入参类型错误返回 -32602', /must be integer/i.test(badType || ''), badType || '')

    const parsedFiles = fs.readdirSync(path.join(projectRoot, '正文')).sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
    record('正文文件名符合 NNN-标题.md', parsedFiles.every((name) => /^\d{3}-.+\.md$/u.test(name)), parsedFiles.join(' | '))

    const sourceUntouched = source.chapters.every((chapter) => sha256(fs.readFileSync(path.join(sourceRoot, '故事主体', '卷一', chapter.dir, '小说.md'), 'utf-8')) === originalHashes.get(chapter.number))
    record('源稿三章哈希未变', sourceUntouched)

    // ── 批次8：整目录导入，一次把《大梦》灌成完整项目（原稿只读） ──
    const sourceTreeBefore = treeDigest(sourceRoot)
    await call(client, 'pinax_project_init', { projectPath: fullRoot, name: '大梦-全量', kind: 'novel' })

    const fullPlan = await call(client, 'pinax_project_import', { projectPath: fullRoot, sourcePath: sourceRoot, worldbookMode: 'wrap' })
    record('整目录导入默认只出计划', fullPlan.ok && fullPlan.data?.mode === 'plan' && fs.readdirSync(path.join(fullRoot, '正文')).length === 0, JSON.stringify({ mode: fullPlan.data?.mode, files: fs.readdirSync(path.join(fullRoot, '正文')) }))
    record('计划覆盖全部类别', ['chapter', 'worldbook', 'rule', 'outline', 'idea', 'source', 'material', 'auxiliary'].every((kind) => fullPlan.data?.decisions?.[kind]), JSON.stringify(fullPlan.data?.decisions))
    record('计划把不可导的东西记账', (fullPlan.data?.skipReasons?.['binary-not-importable'] || 0) >= 1, JSON.stringify(fullPlan.data?.skipReasons))

    const fullApply = await call(client, 'pinax_project_import', { projectPath: fullRoot, sourcePath: sourceRoot, worldbookMode: 'wrap', dryRun: false })
    record('整目录导入落盘零失败', fullApply.ok && fullApply.data?.failedCount === 0 && fullApply.data?.createdCount >= 30, JSON.stringify({ c: fullApply.data?.createdCount, f: fullApply.data?.failedCount, w: fullApply.data?.writeFailures?.slice(0, 2) }))
    const chapterNames = fs.existsSync(path.join(fullRoot, '正文')) ? fs.readdirSync(path.join(fullRoot, '正文')) : []
    record('每章一目录的稿子被认成三章', chapterNames.filter((name) => /\.md$/u.test(name)).length === 3 && chapterNames.every((name) => /^\d{3}-.+\.md$/u.test(name)), chapterNames.join(' | '))
    record('衍生品进 资料/ 而不是正文', fs.readdirSync(path.join(fullRoot, '资料', '章节衍生')).length >= 2 && !chapterNames.some((name) => /剧本|分镜|提示词/u.test(name)), fs.readdirSync(path.join(fullRoot, '资料', '章节衍生')).join(' | '))

    const fullOpen = await call(client, 'pinax_project_open', { projectPath: fullRoot })
    record('导入后 project_open 计数齐', fullOpen.ok && fullOpen.data?.counts?.chapters === 3 && fullOpen.data?.counts?.worldbookEntries === 13, JSON.stringify(fullOpen.data?.counts))
    const fullContext = await call(client, 'pinax_project_context', { projectPath: fullRoot })
    record('导入后约束读回 6 条', fullContext.ok && (fullContext.data?.rules || []).length === 6, JSON.stringify((fullContext.data?.rules || []).map((item) => item.name)))
    record('导入后世界书条目可读', (fullContext.data?.worldbook?.entries || []).some((entry) => String(entry.name || '').includes('柯秒')), JSON.stringify(fullContext.data?.worldbook?.total))

    const fullAgain = await call(client, 'pinax_project_import', { projectPath: fullRoot, sourcePath: sourceRoot, worldbookMode: 'wrap', dryRun: false })
    record('整目录导入幂等', fullAgain.ok && fullAgain.data?.createdCount === 0 && fullAgain.data?.failedCount === 0 && fullAgain.data?.reusedCount >= 30, JSON.stringify({ c: fullAgain.data?.createdCount, r: fullAgain.data?.reusedCount, f: fullAgain.data?.failedCount }))
    record('导入全程未改原稿目录树', treeDigest(sourceRoot) === sourceTreeBefore, `${sourceTreeBefore.slice(0, 12)} vs ${treeDigest(sourceRoot).slice(0, 12)}`)
  })

  // 真服务：模型边界（本副本没有任务面，预期报「未检测到可用模型」）。
  realServer = await startRealServer()
  await withMcp(realServer.baseUrl, async (client) => {
    const ask = await call(client, 'pinax_agent_ask', { projectPath: projectRoot, question: '柯秒的记忆碎片设定有没有矛盾？' })
    const message = String(ask.data?.message || ask.message || '')
    record('真 advisor 路由可达（非连接错误）', ask.ok === false && (ask.data?.code === 'ERR_ADVISOR_REJECTED' || ask.data?.code === 'ERR_ADVISOR_FAILED') && message.includes('未检测到可用模型'), `${ask.data?.code || ask.code} ${message}`.slice(0, 240))

    // ── 批次8 收口：索引与检索。只有「真服务 + 已装内核 + 同一份缓存根」才允许谈成功。 ──
    console.log(`知识内核：${runtimeReady ? `已安装 ${runtimeRoot}` : '未安装'}；Python：${python || '未检测到'}；缓存根：${knowledgeCacheRoot}`)
    const fullStatus = await call(client, 'pinax_project_index', { projectPath: fullRoot, action: 'status' })
    record('状态卡算出 RAG 输入集规模', fullStatus.ok && fullStatus.data?.inputs?.files >= 20 && Boolean(fullStatus.data?.inputs?.revision), JSON.stringify({ v: fullStatus.data?.verdict, f: fullStatus.data?.inputs?.files, r: String(fullStatus.data?.inputs?.revision || '').slice(0, 12) }))
    record('状态卡的 runtimeInstalled 与本机实况一致', fullStatus.ok && fullStatus.data?.runtimeInstalled === runtimeReady, JSON.stringify({ onDisk: runtimeReady, reported: fullStatus.data?.runtimeInstalled }))

    if (runtimeReady) {
      const fullSync = await call(client, 'pinax_project_index', { projectPath: fullRoot, action: 'sync', probe: '柯秒', timeoutMs: 150000 })
      record('装内核后 sync 建成索引并判新鲜', fullSync.ok && fullSync.data?.verdict === 'fresh' && Number(fullSync.data?.index?.cards) >= 20 && !fullSync.data?.warnings?.length, JSON.stringify({ v: fullSync.data?.verdict, c: fullSync.data?.index?.cards, k: String(fullSync.data?.index?.cacheKey || '').slice(0, 12), commit: String(fullSync.data?.index?.compilerCommit || '').slice(0, 12), w: fullSync.data?.warnings }).slice(0, 300))

      const searched = await call(client, 'pinax_knowledge_search', { projectPath: fullRoot, verb: 'kb_search', q: '柯秒', k: 3 })
      const cards = JSON.stringify(searched.data?.results || [])
      record('kb_search 命中本书卡片（非空非假成功）', searched.ok && Number(searched.data?.resultCount) >= 1 && /柯秒/u.test(cards), JSON.stringify({ n: searched.data?.resultCount, cov: searched.data?.coverage?.projectCards, first: cards.slice(0, 120) }).slice(0, 300))

      const worldbook = await call(client, 'pinax_knowledge_search', { projectPath: fullRoot, verb: 'worldbook_search', q: '柯秒' })
      record('worldbook_search 返回结构化条目', worldbook.ok && Array.isArray(worldbook.data?.results) && Number(worldbook.data?.resultCount) >= 1, JSON.stringify({ n: worldbook.data?.resultCount, first: JSON.stringify(worldbook.data?.results?.[0] || '').slice(0, 120) }).slice(0, 300))
    } else {
      const fullSync = await call(client, 'pinax_project_index', { projectPath: fullRoot, action: 'sync' })
      record('无知识内核时 sync 明确拒绝而非假成功', fullSync.ok === false && (fullSync.data?.code === 'KNOWLEDGE_RUNTIME_MISSING' || fullSync.data?.code === 'ERR_KNOWLEDGE_UNAVAILABLE'), JSON.stringify(fullSync.data).slice(0, 200))
      const fullSearch = await call(client, 'pinax_knowledge_search', { projectPath: fullRoot, q: '柯秒' })
      record('检索在无内核时不冒充空结果', fullSearch.ok === false && fullSearch.data?.code !== undefined, JSON.stringify(fullSearch.data).slice(0, 200))
    }
  })
} finally {
  if (realServer?.child) realServer.child.kill()
  await close(stub.server)
}

const failed = results.filter((item) => !item.ok)
const reportPath = path.join(runRoot, 'report.json')
fs.writeFileSync(reportPath, JSON.stringify({
  sourceRoot,
  projectRoot,
  runRoot,
  knowledge: { runtimeReady, runtimeRoot, python, cacheRoot: knowledgeCacheRoot },
  checks: results.length,
  failed: failed.length,
  results
}, null, 2) + '\n')
console.log(`\n${results.length} checks, ${failed.length} failed`)
console.log(`report: ${reportPath}`)
if (failed.length) {
  for (const item of failed) console.log(`FAIL ${item.name} — ${item.detail}`)
  process.exitCode = 1
}
