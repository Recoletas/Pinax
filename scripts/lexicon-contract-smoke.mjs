#!/usr/bin/env node
// 词汇表契约冒烟（W1.5，零 npm 依赖）：pinax-lexicon@1 三段式落盘 + 注入链 + 读取端点。
//   [1] 契约 round-trip：buildLexiconFile → parseLexiconFile 字段一致；2 空格缩进 + 尾换行
//   [2] 容错：损坏 JSON / 非对象 / 缺字段 / 空串 / 脏项过滤（不抛错，空数组 + warnings）
//   [3] compileLexiconPrompt：空段省略；≤700 字预算；超限裁剪（一级全保、二级只留计数）
//   [4] 注入接线静态断言：narrativeKernel / narrativeKernelExecutor / Authoring.vue 三处
//   [5] 服务端（failopen-drill 惯例：spawn server + 隔离 PINAX_APP_DATA/PINAX_MIRROR_ROOT）：
//       /api/localmirror/lexicon 读回（bookId/path）、播种 create-if-absent（create + sync 双挂点、
//       手改不覆盖）、local-only 形制（非绝对路径 400 / 目录不存在 400）
// 运行：node scripts/lexicon-contract-smoke.mjs
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LEXICON_FORMAT, LEXICON_FILE_NAME, buildLexiconFile, parseLexiconFile, compileLexiconPrompt } from '../shared/lexiconFileContract.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_PORT = 18443
const BASE = `http://127.0.0.1:${SERVER_PORT}`

let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${name}`)
  if (!ok) { failures += 1; if (detail !== undefined) console.error('  detail:', String(detail).slice(0, 500)) }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
  return { status: response.status, body: await response.json().catch(() => null) }
}
async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  })
  return { status: response.status, body: await response.json().catch(() => null) }
}

console.log('[1] 契约 round-trip：build → parse')
const fileText = buildLexiconFile({
  project: '雾港旧事',
  banned: [{ word: '赋能', level: 1, note: '' }, { word: '瞬间', level: 2 }],
  own: [{ word: '灵能', note: '本书专有，替代"魔力"' }],
  canon: [{ term: '林冲', aliases: ['豹子头', '豹子头', ' '], ref: '世界书/人物/林冲.md' }]
})
check('2 空格缩进 JSON + 尾换行', fileText.endsWith('\n') && !fileText.endsWith('\n\n') && fileText.includes('\n  "banned": ['))
const parsed = parseLexiconFile(fileText)
check('format = pinax-lexicon@1', parsed.format === LEXICON_FORMAT && LEXICON_FORMAT === 'pinax-lexicon@1', parsed.format)
check('project 原样读回', parsed.project === '雾港旧事')
check('banned 双条且级别保留（1/2）', parsed.banned.length === 2 && parsed.banned[0].level === 1 && parsed.banned[1].level === 2, JSON.stringify(parsed.banned))
check('banned 项形状 {word,level,note}', parsed.banned.every((item) => ['word', 'level', 'note'].every((key) => key in item)))
check('own 项 {word,note} 读回', parsed.own.length === 1 && parsed.own[0].word === '灵能' && parsed.own[0].note.includes('魔力'))
check('canon 别名去重 + 空串过滤', parsed.canon.length === 1 && JSON.stringify(parsed.canon[0].aliases) === JSON.stringify(['豹子头']), JSON.stringify(parsed.canon))
check('canon ref 读回', parsed.canon[0].ref === '世界书/人物/林冲.md')
check('parse 不回写 warnings（干净解析零警告）', Array.isArray(parsed.warnings) && parsed.warnings.length === 0, JSON.stringify(parsed.warnings))

console.log('\n[2] 容错：损坏 / 缺字段 / 非对象 / 空串 / 脏项')
let corrupted = null
try { corrupted = parseLexiconFile('{ not json ]') } catch (error) { corrupted = { threw: error.message } }
check('损坏 JSON 不抛错', corrupted && !corrupted.threw, corrupted?.threw)
check('损坏 JSON → exists:true + 空三段 + warning', corrupted.exists === true && corrupted.banned.length === 0 && corrupted.own.length === 0 && corrupted.canon.length === 0 && corrupted.warnings.length === 1, JSON.stringify(corrupted.warnings))
const nonObject = parseLexiconFile('[1,2,3]')
check('顶层数组 → exists:true + 空三段 + warning', nonObject.exists === true && nonObject.canon.length === 0 && nonObject.warnings.length === 1)
const blank = parseLexiconFile('   ')
check('空白文本 → exists:false（当无文件）', blank.exists === false && blank.banned.length === 0)
const missingFields = parseLexiconFile(JSON.stringify({ format: LEXICON_FORMAT, project: 'X' }))
check('缺三段字段 → 空数组（不抛错）', missingFields.banned.length === 0 && missingFields.own.length === 0 && missingFields.canon.length === 0 && missingFields.warnings.length === 0)
const foreignFormat = parseLexiconFile(JSON.stringify({ format: 'kit-lexicon@9', banned: [{ word: '赋能' }] }))
check('未知 format → warning-only，字段仍读取且 level 缺省 2', foreignFormat.warnings.length === 1 && foreignFormat.banned[0].level === 2, JSON.stringify(foreignFormat.warnings))
const dirtyParsed = parseLexiconFile(JSON.stringify({
  format: LEXICON_FORMAT,
  project: '',
  banned: ['赋能', null, { word: '   ' }, { word: '瞬间', level: 9 }, 42],
  own: [{ note: '无词' }, { word: '灵能' }],
  canon: [{ term: '林冲' }, { aliases: ['无正名'] }]
}))
check('脏项过滤：非对象/空串词丢弃、level 越界回落 2', dirtyParsed.banned.length === 1 && dirtyParsed.banned[0].word === '瞬间' && dirtyParsed.banned[0].level === 2, JSON.stringify(dirtyParsed.banned))
check('own/canon 半残项过滤', dirtyParsed.own.length === 1 && dirtyParsed.own[0].word === '灵能' && dirtyParsed.canon.length === 1 && dirtyParsed.canon[0].term === '林冲' && dirtyParsed.canon[0].aliases.length === 0)

console.log('\n[3] compileLexiconPrompt：省略 / 预算 / 裁剪')
check('空词表 → 空串（整段省略）', compileLexiconPrompt(null) === '' && compileLexiconPrompt({}) === '' && compileLexiconPrompt({ banned: [], own: [], canon: [] }) === '')
const onlyL2 = compileLexiconPrompt({ banned: [{ word: '瞬间', level: 2 }] })
check('只有二级词也有产出且含配额话术', onlyL2.includes('瞬间') && onlyL2.includes('≤3'), onlyL2)
const big = {
  banned: [
    ...Array.from({ length: 30 }, (_, i) => ({ word: `零容忍禁词${i}号`, level: 1 })),
    ...Array.from({ length: 40 }, (_, i) => ({ word: `配额禁词${i}号`, level: 2 }))
  ],
  own: Array.from({ length: 20 }, (_, i) => ({ word: `专用词${i}号`, note: `备注说明${i}` })),
  canon: Array.from({ length: 20 }, (_, i) => ({ term: `正名${i}号`, aliases: [`别名甲${i}`, `别名乙${i}`], ref: `世界书/${i}.md` }))
}
const bigPrompt = compileLexiconPrompt(big)
check('大词表编译 ≤700 字符', bigPrompt.length <= 700, `len=${bigPrompt.length}`)
check('超限裁剪：一级词全保（30 个逐个在场）', big.banned.filter((item) => item.level === 1).every((item) => bigPrompt.includes(item.word)))
check('超限裁剪：二级降为计数（词面不再逐个出现）', bigPrompt.includes('禁用二级词共 40 个') && !bigPrompt.includes('配额禁词0号'), bigPrompt.slice(0, 200))
const smallPrompt = compileLexiconPrompt(parseLexiconFile(buildLexiconFile({ project: '小', banned: [{ word: '赋能', level: 1 }], canon: [{ term: '林冲', aliases: ['豹子头'] }] })))
check('小词表全量编译含正名→禁用别名对照', smallPrompt.includes('赋能') && smallPrompt.includes('林冲→禁用别名 豹子头'), smallPrompt)

console.log('\n[4] 注入接线静态断言（kernel / executor / 页面）')
const kernelSrc = fs.readFileSync(path.join(ROOT, 'src/services/agents/narrativeKernel.js'), 'utf8')
const executorSrc = fs.readFileSync(path.join(ROOT, 'src/services/agents/authoring/narrativeKernelExecutor.js'), 'utf8')
const authoringSrc = fs.readFileSync(path.join(ROOT, 'src/pages/Authoring.vue'), 'utf8')
const settingsSrc = fs.readFileSync(path.join(ROOT, 'src/services/localMirrorSettings.js'), 'utf8')
check('kernel 引入 compileLexiconPrompt 并在 local-rules 块内拼词汇表条目', kernelSrc.includes("from '../../../shared/lexiconFileContract.js'") && kernelSrc.includes("sourceRef: 'lexicon:词汇表.json'") && kernelSrc.includes('buildLocalRulesBlock(localRules, lexicon)'))
check('kernel 不新增块类型（仍只有 local-rules 一种注入壳）', !kernelSrc.includes("kind: 'lexicon'"))
check('executor executeTurn 收 lexicon 形参并透传 buildKernel', executorSrc.includes('lexicon = null') && /localRules,\s*\n\s*lexicon\s*\n\s*\}\)/.test(executorSrc))
check('Authoring executeSession 并行取约束+词汇表并传入 executeTurn', authoringSrc.includes('readLocalRuleFilesForBook(bookId)') && authoringSrc.includes('readLocalLexiconForBook(bookId)') && /Promise\.all\(\[\s*\n\s*readLocalRuleFilesForBook\(bookId\),\s*\n\s*readLocalLexiconForBook\(bookId\)/.test(authoringSrc) && /localRules,\s*\n\s*lexicon,\s*\n\s*authoringRunSession/.test(authoringSrc))
check('客户端取数 fail-open（失败回 exists:false）', settingsSrc.includes('exists: false, lexicon: null, warnings: []'))

// ---- [5] 服务端：隔离注册表 + spawn 真 server（knowledge-proxy-smoke 惯例） ----
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pinax-lexicon-smoke-'))
const appDataDir = path.join(tmpRoot, 'appdata')
const fixtureRoot = path.join(tmpRoot, 'fixture-root')
const createRoot = path.join(tmpRoot, 'created-root')
fs.mkdirSync(appDataDir, { recursive: true })
fs.mkdirSync(fixtureRoot, { recursive: true })
fs.writeFileSync(path.join(appDataDir, 'projects.registry.json'), JSON.stringify({
  projects: [{ projectId: 'proj_lexicon', bookId: 'book_lex', name: '词表项目', kind: 'novel', rootPath: fixtureRoot, lastOpenedAt: '2026-10-09T00:00:00.000Z', lastSyncAt: null }]
}, null, 2))

let child = null
const serverLog = []

// 环境探测：与 localMirrorTransaction staging 校验同形（'r+' 句柄 fsync——win32 对 'r' 只读句柄
// fsync 一律 EPERM，事务层已改用 'r+'）。探测失败 = mirrorBook 全链本机不可用，此时 sync 挂点
// 播种断言降级为源码断言并显式记账；其余断言不受影响。
const canFsyncStaging = (() => {
  try {
    const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lex-fsync-'))
    const probe = path.join(probeDir, 'p.txt')
    fs.writeFileSync(probe, 'x')
    const descriptor = fs.openSync(probe, 'r+')
    try { fs.fsyncSync(descriptor) } finally { fs.closeSync(descriptor) }
    fs.rmSync(probeDir, { recursive: true, force: true })
    return true
  } catch { return false }
})()

async function startPinaxServer() {
  child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      PINAX_APP_DATA: appDataDir,
      PINAX_MIRROR_ROOT: path.join(tmpRoot, 'mirror'),
      PINAX_STORYAGENT_ENABLED: '0'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const collect = (stream) => stream.on('data', (data) => serverLog.push(String(data)))
  collect(child.stdout)
  collect(child.stderr)
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await fetch(`${BASE}/api/localmirror/projects`, { signal: AbortSignal.timeout(1500) }).then(() => true).catch(() => false)
    if (ready) return true
    if (child.exitCode !== null) return false
    await sleep(500)
  }
  return false
}
async function stopPinaxServer() {
  if (!child || child.exitCode !== null) return
  child.kill()
  for (let waited = 0; waited < 5000 && child.exitCode === null; waited += 200) await sleep(200)
  if (child.exitCode === null) child.kill('SIGKILL')
}

try {
  console.log('\n[5] 服务端：/lexicon 读回 + 双挂点播种（create-if-absent）')
  const serverReady = await startPinaxServer()
  check(`[boot] Pinax server 就绪 ${BASE}（隔离注册表 ${appDataDir}）`, serverReady, serverLog.join('').slice(-800))
  if (!serverReady) throw new Error('Pinax server 未就绪')

  const missingByBook = await getJson(`${BASE}/api/localmirror/lexicon?bookId=book_lex`)
  check('未播种 bookId 读回：ok + exists:false（fail-open）', missingByBook.status === 200 && missingByBook.body?.ok === true && missingByBook.body?.exists === false && missingByBook.body?.lexicon === null, JSON.stringify(missingByBook.body))
  const missingByPath = await getJson(`${BASE}/api/localmirror/lexicon?path=${encodeURIComponent(fixtureRoot)}`)
  check('未播种 path 读回：exists:false', missingByPath.status === 200 && missingByPath.body?.exists === false)

  if (canFsyncStaging) {
    const syncSeed = await postJson(`${BASE}/api/localmirror/sync`, {
      book: { id: 'book_lex', title: '雾港旧事', chapters: [{ title: '第一章', content: '正文……' }], outline: { nodes: [], edges: [] } }
    })
    check('sync 成功且落点=注册表绑定根', syncSeed.status === 200 && syncSeed.body?.ok === true && syncSeed.body?.dir === fixtureRoot, JSON.stringify(syncSeed.body))
    const seededText = fs.readFileSync(path.join(fixtureRoot, LEXICON_FILE_NAME), 'utf8')
    check('首次同步播种 词汇表.json（format + project=书名）', seededText.includes(`"format": "${LEXICON_FORMAT}"`) && seededText.includes('"project": "雾港旧事"'), seededText.slice(0, 120))

    const byBook = await getJson(`${BASE}/api/localmirror/lexicon?bookId=book_lex`)
    check('播种后 bookId 读回：exists:true + lexicon.project', byBook.status === 200 && byBook.body?.exists === true && byBook.body?.lexicon?.project === '雾港旧事', JSON.stringify(byBook.body))

    fs.writeFileSync(path.join(fixtureRoot, LEXICON_FILE_NAME), buildLexiconFile({ project: '雾港旧事', banned: [{ word: '赋能', level: 1, note: '手改' }] }), 'utf8')
    await postJson(`${BASE}/api/localmirror/sync`, {
      book: { id: 'book_lex', title: '雾港旧事', chapters: [{ title: '第一章', content: '正文……' }], outline: { nodes: [], edges: [] } }
    })
    const afterResync = parseLexiconFile(fs.readFileSync(path.join(fixtureRoot, LEXICON_FILE_NAME), 'utf8'))
    check('二次同步不覆盖手改词表（create-if-absent）', afterResync.banned.length === 1 && afterResync.banned[0].word === '赋能' && afterResync.banned[0].note === '手改', JSON.stringify(afterResync.banned))
  } else {
    console.log('⚠ 环境性跳过：事务层 staging fsync 探测失败，mirrorBook 全链本机不可用——sync 挂点播种断言降级为源码断言')
    const serviceSrc = fs.readFileSync(path.join(ROOT, 'server/services/localMirrorService.js'), 'utf8')
    check('sync 挂点播种（源码断言：mirrorBook 事务提交后落真实目录）', serviceSrc.includes("seedLexiconFile(located.dir, payload.book?.title || '')"))
    check('create 挂点播种（源码断言：createProjectAt 模板目录后）', serviceSrc.includes('seedLexiconFile(root, manifest.name)'))
    check('播种 create-if-absent（源码断言：已存在绝不覆盖）', serviceSrc.includes('if (fs.existsSync(target)) return false'))
  }

  const created = await postJson(`${BASE}/api/localmirror/projects/create`, { path: createRoot, name: '播种项目', kind: 'novel' })
  check('projects/create 成功', created.status === 200 && created.body?.ok === true, JSON.stringify(created.body))
  const createdText = fs.readFileSync(path.join(createRoot, LEXICON_FILE_NAME), 'utf8')
  check('建项目播种 词汇表.json（project=项目名）', createdText.includes(`"format": "${LEXICON_FORMAT}"`) && createdText.includes('"project": "播种项目"'), createdText.slice(0, 120))
  const createdRead = await getJson(`${BASE}/api/localmirror/lexicon?path=${encodeURIComponent(createRoot)}`)
  check('createRoot path 读回三段式 lexicon', createdRead.status === 200 && createdRead.body?.exists === true && Array.isArray(createdRead.body?.lexicon?.banned) && createdRead.body?.lexicon?.banned.length === 0, JSON.stringify(createdRead.body))
  const recreate = await postJson(`${BASE}/api/localmirror/projects/create`, { path: createRoot, name: '播种项目', kind: 'novel' })
  check('同目录二次 create 被拒（400 ERR_DIR_NOT_EMPTY）且文件未被改写', recreate.status === 400 && recreate.body?.error === 'ERR_DIR_NOT_EMPTY' && parseLexiconFile(fs.readFileSync(path.join(createRoot, LEXICON_FILE_NAME), 'utf8')).project === '播种项目')

  const badPath = await getJson(`${BASE}/api/localmirror/lexicon?path=${encodeURIComponent('relative/path')}`)
  check('相对路径 → 400 ERR_INVALID_INPUT（绝对路径形制同 /rules）', badPath.status === 400 && badPath.body?.error === 'ERR_INVALID_INPUT', JSON.stringify(badPath.body))
  const noDir = await getJson(`${BASE}/api/localmirror/lexicon?path=${encodeURIComponent(path.join(tmpRoot, 'no-such-dir'))}`)
  check('目录不存在 → 400 ERR_DIR_NOT_FOUND', noDir.status === 400 && noDir.body?.error === 'ERR_DIR_NOT_FOUND', JSON.stringify(noDir.body))
} catch (error) {
  failures += 1
  console.error('✗ 冒烟中途异常:', error)
  console.error('server 日志尾：', serverLog.join('').slice(-1200))
} finally {
  await stopPinaxServer()
  fs.rmSync(tmpRoot, { recursive: true, force: true })
}

console.log(failures ? `\n冒烟结果：${failures} 挂 → exit 1` : '\n冒烟结果：全绿 → exit 0')
process.exitCode = failures ? 1 : 0
