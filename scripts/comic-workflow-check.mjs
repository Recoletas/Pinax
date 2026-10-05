/* eslint-disable no-console */
// Offline comic workflow regression. Run: node scripts/comic-workflow-check.mjs
// Uses the real Vue selection and media services with isolated in-memory stores.
// Vite resolves the application's extensionless imports; it never listens on a port.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptFile = fileURLToPath(import.meta.url)
const root = path.resolve(path.dirname(scriptFile), '..')
if (process.env.PINAX_COMIC_WORKFLOW_CHILD !== '1') {
  const scratch = mkdtempSync(path.join(tmpdir(), 'pinax-comic-workflow-'))
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
      env: { ...process.env, PINAX_COMIC_WORKFLOW_CHILD: '1' },
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
  globalThis.fetch = async () => { throw new Error('Network requests are forbidden in this offline check') }
  const { reactive } = await import(path.join(root, 'node_modules/vue/index.mjs'))
  const { useComicWorkspaceSelection } = await import(path.join(root, 'src/composables/comics/useComicWorkspaceSelection.js'))
  const { createComicPage, saveComicPage, saveComicPageDraft, listComicPages, setComicPanelPendingGeneration, setComicStagePendingRequest, updateComicPageComposition, updateComicPanel, addComicPanelTake } = await import(path.join(root, 'src/services/media/comicPageStore.js'))
  const { archiveUploadedComicPanel, getComicPanelInputRevision, retryComicStagePersist } = await import(path.join(root, 'src/services/media/comicProductionService.js'))
  const { getComicPanelDisplayExportBlock } = await import(path.join(root, 'src/services/media/comicPanelDisplay.js'))
  const data = new Map()
  globalThis.localStorage = {getItem: k => data.get(k) || null, setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}
  const binary = new Map()
  const binaryStore = {put:async(k,v)=>binary.set(k,v),get:async k=>binary.get(k),delete:async k=>binary.delete(k)}
  let count = 0
  function check(name, fn) { fn(); count++; console.log('PASS',name) }
  const books=[{id:'comic-a',title:'测试书 A',chapters:[]},{id:'comic-b',title:'测试书 B',chapters:[]}]
  localStorage.setItem('writing_books',JSON.stringify(books))
  const make = (id, projectId = 'comic-a') => saveComicPage(createComicPage({id,projectId,panels:[{id:`${id}-p1`,visual:'雨夜的车站'},{id:`${id}-p2`,visual:'旅人抬头'}]}))
  const a=make('page-a'), a2=make('page-a2'), b=make('page-b','comic-b')
  const route=reactive({query:{bookId:'comic-a'}})
  const selection=useComicWorkspaceSelection({route})
  selection.refreshBooks(); selection.touchCatalog()
  check('书内目录只列本书页',()=>assert.deepEqual(new Set(selection.catalog.value.map(x=>x.page.id)), new Set([a.id,a2.id])))
  selection.selectPage(a.id)
  let calls=0
  const off=selection.registerFlush(()=>{ calls++; return true })
  selection.registerFlush(selection.flushPendingEdits)
  check('flush 不把自己注册为递归回调',()=>{assert.equal(selection.flushPendingEdits(),true);assert.equal(calls,1)})
  off()
  const stop=selection.registerFlush(()=>false)
  check('保存失败阻止切页',()=>{assert.equal(selection.selectPage(a2.id),false);assert.equal(selection.activePageId.value,a.id)})
  check('保存失败阻止切格',()=>{assert.equal(selection.selectPanel(a.panels[1].id),false);assert.equal(selection.activePanelId.value,a.panels[0].id)})
  check('保存失败阻止新页清空',()=>{assert.equal(selection.startNewPage(),false);assert.equal(selection.activePageId.value,a.id)})
  stop()
  check('解除失败后切页可继续',()=>assert.equal(selection.selectPage(a2.id),true))
  const throwing=selection.registerFlush(()=>{throw Error('storage full')})
  check('抛异常的保存失败也阻止切页',()=>assert.equal(selection.selectPage(a.id),false)); throwing()
  route.query.bookId='comic-b'; selection.touchCatalog()
  check('切书仅显示新书漫画',()=>assert.deepEqual(selection.catalog.value.map(x=>x.page.id),[b.id]))
  let stale = JSON.parse(JSON.stringify(a))
  setComicPanelPendingGeneration(a.id,a.panels[0].id,{requestId:'direct-live',sentAt:1})
  setComicStagePendingRequest(a.id,a.panels[0].id,'rough',{requestId:'rough-live',sentAt:2})
  addComicPanelTake(a.id,a.panels[1].id,'new-candidate')
  stale.title='新的页面标题'
  let saved=saveComicPageDraft(stale)
  check('旧编辑器草稿保留直接图在途请求',()=>assert.equal(saved.panels[0].pendingGeneration.requestId,'direct-live'))
  check('旧编辑器草稿保留阶段在途请求',()=>assert.equal(saved.panels[0].production.rough.pendingRequest.requestId,'rough-live'))
  check('旧编辑器草稿保留后来加入并选择的候选',()=>assert.equal(saved.panels[1].selectedTakeId,'new-candidate'))
  check('作者的标题更改仍写入',()=>assert.equal(saved.title,'新的页面标题'))
  check('跨书草稿拒绝写入',()=>assert.throws(()=>saveComicPageDraft({...stale,projectId:'comic-b'})))
  check('已删除页不会被草稿复活',()=>assert.throws(()=>saveComicPageDraft({...stale,id:'deleted'})))
  const geometry=JSON.parse(JSON.stringify(stale)); geometry.panels[0].frame={x:0.1,y:0.1,width:0.4,height:0.3}
  saved=updateComicPageComposition(a.id,geometry)
  check('旧构图快照保留后台候选',()=>assert.equal(saved.panels[1].selectedTakeId,'new-candidate'))
  check('旧构图快照保留阶段请求',()=>assert.equal(saved.panels[0].production.rough.pendingRequest.requestId,'rough-live'))
  let final=make('final')
  final.panels[0].production.effects={...final.panels[0].production.effects,artifactIds:['finished'],selectedArtifactId:'finished',status:'approved'}
  final.panels[0].displaySelection={type:'stage',stage:'effects',assetId:'finished'}
  final=saveComicPage(final)
  check('已确认最终阶段可导出',()=>assert.equal(getComicPanelDisplayExportBlock(final.panels[0],final),''))
  final.panels[0].visual='白天的车站'
  final=saveComicPageDraft(final)
  check('改画面描述使旧阶段失效',()=>assert.equal(final.panels[0].production.effects.status,'stale'))
  check('失效最终图阻止成品导出',()=>assert.notEqual(getComicPanelDisplayExportBlock(final.panels[0],final),''))
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const uploadPage=make('upload')
  async function upload(id,{fail=false,change=false}={}) {
   const page=listComicPages({}).find(x=>x.id===uploadPage.id), panel=page.panels[0]
   const inputRevision=getComicPanelInputRevision(panel)
   setComicPanelPendingGeneration(page.id,panel.id,{requestId:id,inputRevision,sentAt:Date.now()})
   if(change) updateComicPanel(page.id,panel.id,{visual:'拍摄方向改变'})
   let failed=fail
   const result=await archiveUploadedComicPanel({page,panel,requestId:id,inputRevision,data:png,width:1,height:1,storageKey:'comic-test-library',mediaOptions:{binaryStore:{...binaryStore,put:async(k,v)=>{if(failed){failed=false;throw Error('save failed')};return binaryStore.put(k,v)}}}})
   return result
  }
  let result=await upload('upload-first')
  check('本地上传无需图片模型即可归档',()=>assert.equal(result.retryable,false))
  check('上传图片归属原书',()=>assert.equal(result.page.projectId,'comic-a'))
  check('上传图片选中并允许直接成品导出',()=>{assert.equal(result.page.panels[0].selectedTakeId,result.entry.mediaAssetId);assert.equal(getComicPanelDisplayExportBlock(result.page.panels[0],result.page),'')})
  check('上传成功清除属于自己的 pending',()=>assert.equal(result.page.panels[0].pendingGeneration,null))
  const chosen=result.page.panels[0].selectedTakeId
  result=await upload('upload-stale',{change:true})
  check('上传中修改内容只加候选、不替换当前图',()=>{assert.equal(result.staleAttach,true);assert.equal(result.page.panels[0].selectedTakeId,chosen)})
  result=await upload('upload-retry',{fail:true})
  check('本地上传保存失败提供恢复',()=>assert.equal(result.retryable,true))
  result=await retryComicStagePersist('upload-retry')
  check('只重试保存可恢复上传图片',()=>{assert.equal(result.retryable,false);assert.ok(result.page.panels[0].selectedTakeId)})
  const { fitComicLetteringBoxHeight, analyzeComicLettering } = await import(path.join(root, 'src/services/media/comicLetteringService.js'))
  const { getComicPanelRect } = await import(path.join(root, 'src/services/media/comicLayout.js'))
  for (const panelCount of [4, 6]) {
    const letteringPage = createComicPage({ projectId: 'comic-a', panels: Array.from({ length: panelCount }, (_, index) => ({ id: `lettering-${panelCount}-${index}`, visual: '灯塔' })) })
    const panel = letteringPage.panels[0]
    const text = { id: 'short-dialogue', type: 'speech', text: '莉娜：灯亮了。', box: [0.52, 0.1, 0.42, 0.16], style: { fontSize: 22 } }
    const oldBox = [...text.box]
    const fitted = fitComicLetteringBoxHeight(text, getComicPanelRect(letteringPage, panel.order))
    panel.letteringObjects = [{ ...text, box: fitted }]
    check(`${panelCount}格新建短对白有足够初始空间`, () => assert.equal(analyzeComicLettering(letteringPage).blocking.length, 0))
    check(`${panelCount}格排字计算不修改原始框`, () => assert.deepEqual(text.box, oldBox))
  }
  const longPage = createComicPage({ projectId: 'comic-a', panels: [{ id: 'long-text', visual: '灯塔' }, { id: 'other', visual: '海面' }] })
  const longText = { id: 'long', type: 'speech', text: '对白'.repeat(500), box: [0.52, 0.1, 0.42, 0.16], style: { fontSize: 22 } }
  longText.box = fitComicLetteringBoxHeight(longText, getComicPanelRect(longPage, 1))
  longPage.panels[0].letteringObjects = [longText]
  check('长对白初始框占格高度有上限', () => assert.ok(longText.box[3] <= 0.6))
  check('超量文字仍由质检阻断而不缩小或截掉', () => assert.ok(analyzeComicLettering(longPage).blocking.length))
  console.log(`${count}/${count} checks passed; no network or model calls`)
}
