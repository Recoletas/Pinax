/* eslint-disable no-console */
// Offline comic workflow regression. Run: node scripts/comic-planning-check.mjs
// Uses the actual adaptation and page stores with isolated in-memory storage.
// Vite resolves the application's extensionless imports; it never listens on a port.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptFile = fileURLToPath(import.meta.url)
const root = path.resolve(path.dirname(scriptFile), '..')
if (process.env.PINAX_COMIC_PLANNING_CHILD !== '1') {
  const scratch = mkdtempSync(path.join(tmpdir(), 'pinax-comic-planning-'))
  try {
    const config = path.join(scratch, 'vite.config.mjs')
    writeFileSync(config, `export default ${JSON.stringify({
      root,
      cacheDir: path.join(scratch, 'cache'),
      envFile: false,
      server: { middlewareMode: true, hmr: false },
      optimizeDeps: { noDiscovery: true }
    })}`)
    const child = spawnSync(process.execPath, [
      path.join(root, 'node_modules/vite-node/vite-node.mjs'),
      '--config', config, '--root', root, scriptFile
    ], {
      cwd: scratch,
      env: { ...process.env, PINAX_COMIC_PLANNING_CHILD: '1' },
      stdio: 'inherit'
    })
    if (child.error) console.error(child.error.message)
    process.exitCode = child.status ?? 1
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
} else {
  await runChecks()
}

async function runChecks() {
  globalThis.fetch = async () => { throw new Error('Network requests are forbidden') }
  const { parseComicAdaptationCandidates, buildComicPagesFromAdaptation, buildComicAdaptationMessages, validateComicAdaptationPlan, saveComicAdaptationPage } = await import(path.join(root, 'src/services/media/comicAdaptationService.js'))
  const { saveComicPages, listComicPages, setComicPanelPendingGeneration, setComicStagePendingRequest, addComicPanelTake, saveComicPage } = await import(path.join(root, 'src/services/media/comicPageStore.js'))
  const data = new Map()
  let failWrites = false
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => { if (failWrites) throw new Error('storage full'); data.set(key, String(value)) }, removeItem: key => data.delete(key) }
  const options = { storage }
  const copy = value => JSON.parse(JSON.stringify(value))
  let count = 0
  const check = (name, fn) => { fn(); count++; console.log('PASS', name) }
  const candidate = { id: 'plan-a', title: '测试分页', format: 'page-ltr', colorMode: 'color', pages: [1, 2].map(index => ({ title: `第 ${index} 页`, narrativeBeat: `动作 ${index}`, pageTurnHook: '转场', panels: [{ visual: `画面 ${index}`, beat: { action: '推门' }, dialogue: [{ speaker: '甲', text: '灯亮了。' }] }] })), visualBible: { lineStyle: '清晰线条', palette: ['冷蓝'], references: [] } }
  const source = { id: 'source-a', content: '先开门再进屋', projectId: 'book-a' }
  check('两个有效候选可解析', () => assert.equal(parseComicAdaptationCandidates(JSON.stringify({ candidates: [candidate, { ...candidate, id: 'plan-b' }] })).length, 2))
  check('合法分页验证通过', () => assert.equal(validateComicAdaptationPlan(candidate), ''))
  check('不足两页拒绝', () => assert.match(validateComicAdaptationPlan({ pages: [candidate.pages[0]] }), /2–12/))
  check('超过十二页拒绝', () => assert.match(validateComicAdaptationPlan({ pages: Array(13).fill(candidate.pages[0]) }), /2–12/))
  const blank = copy(candidate); blank.pages[1].panels[0].visual = ' '
  check('空白画面准确指出页格', () => assert.match(validateComicAdaptationPlan(blank), /第 2 页、第 1 格/))
  check('空白画面不能被归一化静默丢弃', () => assert.throws(() => buildComicPagesFromAdaptation({ candidate: blank }), /第 2 页/))
  const crowded = copy(candidate); crowded.pages[0].panels = Array(9).fill(crowded.pages[0].panels[0])
  check('超过八格不能被静默截短', () => assert.match(validateComicAdaptationPlan(crowded), /1–8/))
  const messages = buildComicAdaptationMessages({ sources: [{ ...source, id: 'second', content: '先出现的素材' }, { ...source, content: '后出现的素材' }] })
  check('提示词按选择次序保留素材', () => assert.ok(messages[1].content.indexOf('先出现的素材') < messages[1].content.indexOf('后出现的素材')))
  const original = copy(candidate)
  const built = buildComicPagesFromAdaptation({ candidate, sources: [source], projectId: 'book-a', sequenceId: 'sequence-a' })
  check('建立页不修改候选', () => assert.deepEqual(candidate, original))
  check('作品和序列归属正确', () => assert.ok(built.every(page => page.projectId === 'book-a' && page.sequenceId === 'sequence-a')))
  check('页序稳定', () => assert.deepEqual(built.map(page => page.pageNumber), [1, 2]))
  check('来源和确认边界保留', () => assert.ok(built.every(page => page.visualBibleStatus === 'draft' && page.sourceRefs.some(ref => ref.refId === source.id))))
  saveComicPages(built, options)
  const read = () => listComicPages({}, options).find(page => page.id === built[0].id)
  const args = page => ({ projectId: 'book-a', sequenceId: 'sequence-a', pageId: page.id, expectedRevision: page.revision, draft: { ...copy(page), narrativeBeat: page.pagePurpose } })
  check('错误书不能写入', () => assert.throws(() => saveComicAdaptationPage({ ...args(read()), projectId: 'book-b' }, options), /当前作品/))
  check('错误序列不能写入', () => assert.throws(() => saveComicAdaptationPage({ ...args(read()), sequenceId: 'sequence-b' }, options), /制作序列/))
  check('已删除页不能复活', () => assert.throws(() => saveComicAdaptationPage({ ...args(read()), pageId: 'missing' }, options)))
  check('旧版本不能覆盖新保存', () => assert.throws(() => saveComicAdaptationPage({ ...args(read()), expectedRevision: 0 }, options), /其他位置更新/))
  let edit = args(read()); edit.draft.panels[0].id = 'other-panel'
  check('分格归属变化拒绝', () => assert.throws(() => saveComicAdaptationPage(edit, options), /分格已经变化/))
  edit = args(read()); edit.draft.panels[0].visual = ''
  check('持久页空白画面拒绝', () => assert.throws(() => saveComicAdaptationPage(edit, options), /第 1 格/))
  let current = read()
  current.panels[0].production.effects = { ...current.panels[0].production.effects, status: 'approved', artifactIds: ['final-image'], selectedArtifactId: 'final-image' }
  saveComicPage(current, options)
  setComicPanelPendingGeneration(current.id, current.panels[0].id, { requestId: 'direct-live', sentAt: 1 }, options)
  setComicStagePendingRequest(current.id, current.panels[0].id, 'rough', { requestId: 'rough-live', sentAt: 2 }, options)
  addComicPanelTake(current.id, current.panels[0].id, 'new-candidate', options)
  current = read(); edit = args(current); edit.draft.title = '作者的新标题'; edit.draft.narrativeBeat = '作者的新节拍'; edit.draft.panels[0].visual = '作者的新画面'; edit.draft.panels[0].dialogue = [{ speaker: '乙', text: '继续。' }]
  const frame = copy(current.panels[0].frame)
  const saved = saveComicAdaptationPage(edit, options)
  check('作者标题和节拍明确保存', () => assert.ok(saved.title === '作者的新标题' && saved.pagePurpose === '作者的新节拍'))
  check('画面对白保存', () => assert.ok(saved.panels[0].visual === '作者的新画面' && saved.panels[0].dialogue[0].text === '继续。'))
  check('构图几何不变', () => assert.deepEqual(saved.panels[0].frame, frame))
  check('直接图候选与在途请求保留', () => assert.ok(saved.panels[0].selectedTakeId === 'new-candidate' && saved.panels[0].pendingGeneration.requestId === 'direct-live'))
  check('阶段在途请求仍保留', () => assert.equal(saved.panels[0].production.rough.pendingRequest.requestId, 'rough-live'))
  check('画面变化令已确认阶段待复审', () => assert.equal(saved.panels[0].production.effects.status, 'stale'))
  check('页版本只增一次', () => assert.equal(saved.revision, current.revision + 1))
  check('未编辑页不受影响', () => assert.equal(listComicPages({}, options).find(page => page.id === built[1].id).title, built[1].title))
  const before = JSON.stringify(listComicPages({}, options)); edit = args(read()); edit.draft.title = '写入失败的草稿'; failWrites = true
  check('存储失败明确抛错', () => assert.throws(() => saveComicAdaptationPage(edit, options), /storage full/)); failWrites = false
  check('失败没有部分写入', () => assert.equal(JSON.stringify(listComicPages({}, options)), before))
  check('失败没有修改调用方草稿', () => assert.equal(edit.draft.title, '写入失败的草稿'))
  check('修复存储后可用同草稿重试', () => assert.equal(saveComicAdaptationPage(edit, options).title, '写入失败的草稿'))
  console.log(`${count}/${count} comic planning checks passed`)
}
