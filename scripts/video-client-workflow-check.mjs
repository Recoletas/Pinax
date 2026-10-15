/* eslint-disable no-console -- Explicit CLI regression report. */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
// Real Vue components and video client, with isolated browser storage and local HTTP fixtures.
// No server is started and every external request is intercepted.
const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '')
const require = createRequire(`${root}/package.json`)
const { build } = require('esbuild')
const { parse, compileScript } = require('@vue/compiler-sfc')
const { chromium } = require('playwright')
const { createVideoJobService } = await import(`${root}/src/services/media/videoJobService.js`)
const { selectStoryboardVideoHistory, getStoryboardVideoAvailability } = await import(`${root}/src/services/media/storyboardVideoHistory.js`)
// Valid 16px black MP4 fixture, generated locally; never a model result.
const videoFixture = Buffer.from('AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMtbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAAMgAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAld0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAAMgAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAADIAAAAAAABAAAAAAHPbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAyAAAACgBVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABem1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAATpzdGJsAAAArnN0c2QAAAAAAAAAAQAAAJ5hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABGUxhdmM2MC4zMS4xMDIgbGlib3BlbmgyNjQAAAAAAAAAGP//AAAAJGF2Y0MBQsAU/+EADWdCwBSMjU5gIDwiEagBAARozjyAAAAAEHBhc3AAAAABAAAAAQAAABRidHJ0AAAAAAAACsgAAArIAAAAGHN0dHMAAAAAAAAAAQAAAAUAAAIAAAAAFHN0c3MAAAAAAAAAAQAAAAEAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAUAAAABAAAAKHN0c3oAAAAAAAAAAAAAAAUAAAARAAAADQAAAA0AAAANAAAADQAAABRzdGNvAAAAAAAAAAEAAANdAAAAYnVkdGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAtaWxzdAAAACWpdG9vAAAAHWRhdGEAAAABAAAAAExhdmY2MC4xNi4xMDAAAAAIZnJlZQAAAE1tZGF0AAAADWW4AAQAAAnkxQABGfwAAAAJYeAAQACcgT1AAAAACWHgAIABHIH9QAAAAAlh4ADAAZyAr1AAAAAJYeABAAIcgN9Q', 'base64')
let checks = 0
async function check(name, run) { await run(); checks++; console.log(`OK ${name}`) }
const response = (payload, status = 200) => ({ ok: status < 400, status, text: async () => typeof payload === 'string' ? payload : JSON.stringify(payload) })
await check('poll abort cancels in-flight fetch', async () => {
 const c = new AbortController(); let seen
 const service = createVideoJobService({fetchImpl: (_url,{signal}) => new Promise((_resolve,reject) => { seen=signal; signal.addEventListener('abort',()=>reject(new Error('aborted'))) })})
 const pending=service.pollUntilDone('j',{signal:c.signal}); c.abort()
 await assert.rejects(pending,{code:'ERR_ABORTED'}); assert.equal(seen.aborted,true)
})
await check('already aborted makes no request', async () => {
 const c=new AbortController(); c.abort(); let n=0
 const service=createVideoJobService({fetchImpl:async()=>{n++;return response({status:'succeeded'})}})
 await assert.rejects(service.pollUntilDone('j',{signal:c.signal}),{code:'ERR_ABORTED'}); assert.equal(n,0)
})
await check('first terminal snapshot reaches listener', async () => {
 const updates=[]; const service=createVideoJobService({fetchImpl:async()=>response({id:'j',status:'succeeded'})})
 assert.equal((await service.pollUntilDone('j',{onUpdate:x=>updates.push(x)})).status,'succeeded'); assert.equal(updates.length,1)
})
await check('HTML success rejected', async () => {
 const service=createVideoJobService({fetchImpl:async()=>response('<html>proxy</html>')})
 await assert.rejects(service.createJob({}),{code:'ERR_INVALID_RESPONSE'})
})
await check('limited polling returns latest without submission', async () => {
 let n=0; const service=createVideoJobService({fetchImpl:async(_url,init)=>{assert.equal(init.method,'GET');n++;return response({id:'j',status:'running'})},pollIntervalMs:0,maxPolls:2})
 assert.equal((await service.pollUntilDone('j')).status,'running'); assert.equal(n,3)
})
await check('original download keeps job endpoint and returns binary', async () => {
 let calls=0
 const service=createVideoJobService({fetchImpl:async(url,init)=>{calls++;assert.ok(url.endsWith('/jobs/job%2Fspecial/output'));assert.equal(init.method,undefined);return new Response(videoFixture,{headers:{'content-type':'video/mp4'}})}})
 const blob=await service.downloadJobOutput('job/special');assert.equal(blob.type,'video/mp4');assert.equal(blob.size,videoFixture.length);assert.equal(calls,1)
})
await check('original download reports expired job without resubmitting', async () => {
 let calls=0;const service=createVideoJobService({fetchImpl:async()=>{calls++;return Response.json({code:'ERR_JOB_NOT_FOUND',message:'任务记录已失效'},{status:404})}})
 await assert.rejects(service.downloadJobOutput('missing'),{code:'ERR_JOB_NOT_FOUND',status:404});assert.equal(calls,1)
})
await check('original download rejects wrong type and size', async () => {
 for(const response of [new Response('<html>login</html>',{headers:{'content-type':'text/html'}}),new Response(videoFixture,{headers:{'content-type':'video/mp4','content-length':String(64*1024*1024+1)}}),new Response(new Uint8Array(),{headers:{'content-type':'video/mp4'}})]) {
   const service=createVideoJobService({fetchImpl:async()=>response});await assert.rejects(service.downloadJobOutput('j'))
 }
})
await check('original download aborts transport and never retries', async () => {
 const c=new AbortController();let seen,calls=0
 const service=createVideoJobService({fetchImpl:(_url,{signal})=>{calls++;seen=signal;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))))}})
 const pending=service.downloadJobOutput('j',{signal:c.signal});c.abort();await assert.rejects(pending,{code:'ERR_ABORTED'});assert.equal(seen.aborted,true);assert.equal(calls,1)
 await assert.rejects(service.downloadJobOutput('j',{signal:c.signal}),{code:'ERR_ABORTED'});assert.equal(calls,1)
})
const dir=await fs.mkdtemp(path.join(os.tmpdir(), 'pinax-video-client-'))
let browser
try {
await fs.writeFile(`${dir}/entry.js`, `import { createApp, h, reactive } from '${root}/node_modules/vue/dist/vue.esm-bundler.js';\nimport Panel from '${root}/src/components/media/StoryboardVideoPanel.vue';\nwindow.archives=[]; window.state=reactive(JSON.parse(sessionStorage.getItem('harness-context') || 'null') || {open:true, projectId:'book-a',context:{document:{id:'doc-a',source:{title:'雨夜归人'},sourceRefs:[]},version:{versionId:'v1'},shots:[{shotId:'s1',sequence:1,content:'林苏在雨中抬头。',duration:6},{shotId:'s2',sequence:2,content:'她推开书店门。',duration:6}]}});createApp({render:()=>window.state.open?h(Panel,{context:window.state.context,projectId:window.state.projectId,onClose:()=>{window.state.open=false},onArchived:a=>archives.push(a),onShotsUpdated:(shots,meta)=>{if(window.rejectShotSave){meta.onSaved(false);return}window.state.context={...window.state.context,shots};meta.onSaved(true,shots)}}):h('div','已关闭')}).mount('#app');`)
await build({entryPoints:[`${dir}/entry.js`],outfile:`${dir}/bundle.js`,bundle:true,format:'esm',platform:'browser',define:{'process.env.NODE_ENV':'"test"',__VUE_OPTIONS_API__:'true',__VUE_PROD_DEVTOOLS__:'false'},plugins:[{name:'vue',setup(b){b.onLoad({filter:/useAdvisor\.js$/},()=>({contents:`import { ref } from '${root}/node_modules/vue/dist/vue.esm-bundler.js'; export function useAdvisor(){window.adviceResults=ref([]);return {advisorResults:window.adviceResults,advisorLoading:ref(false),askAdvisor:async(input)=>{window.adviceRequest=input;window.adviceResults.value=[{id:'advice-1',taskType:input.taskType,target:input.target,status:'completed',summary:'镜头描述建议',actions:[input.taskType==='storyboard.review'?{type:'storyboard-shot-patch',payload:{shotId:input.target.allowedShotId,changes:{shotType:'close_up'}}}:{type:'generation-request',payload:{prompt:'雨水沿着伞面滑落，林苏抬头看向书店，镜头缓慢推近。'}}]}]},updateAdvisorResultStatus:(id,status,detail)=>{const result=window.adviceResults.value.find(item=>item.id===id);if(result){result.status=status;result.statusDetail=detail}},dismissResult:()=>{}}}`,loader:'js'}));b.onLoad({filter:/\.vue$/},async a=>{const source=await fs.readFile(a.path,'utf8');const {descriptor}=parse(source);return {contents:compileScript(descriptor,{id:'harness',inlineTemplate:true}).content,loader:'js',resolveDir:path.dirname(a.path)}})}}]})
browser=await chromium.launch({headless:true})
 const page=await browser.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message))
 let jobId='job-a'
 let creates=0, gets=0, resolveCreate, jobStatus='running', cancelFail=false, get404=false
 const job=()=>({id:jobId,projectId:'book-a',providerId:'minimax-video',model:'MiniMax-Hailuo-2.3',status:jobStatus,progress:25,outputs:jobStatus==='succeeded'?[{url:'https://media.example/video.mp4',expiresAt:new Date(Date.now()+3600000).toISOString()}]:[]})
 await page.route('**/*',async route=>{
 const url=new URL(route.request().url()), method=route.request().method()
 // Hold fake media responses so a decoder is never asked to parse pretend MP4 bytes.
 // Playback faults are dispatched explicitly below; no request escapes this route.
 if(url.hostname==='media.example')return
 if(url.pathname==='/bundle.js')return route.fulfill({contentType:'text/javascript',path:`${dir}/bundle.js`})
 if(url.pathname==='/api/media/providers')return route.fulfill({json:{providers:[]}})
 if(url.pathname==='/api/media/jobs'&&method==='POST'){creates++;await new Promise(r=>{resolveCreate=r});return route.fulfill({json:job()})}
 if(/^\/api\/media\/jobs\/job-[ac]\/output$/.test(url.pathname))return route.fulfill({contentType:'video/mp4',body:videoFixture})
 if(/^\/api\/media\/jobs\/job-[ac]\/cancel$/.test(url.pathname))return route.fulfill(cancelFail?{status:500,json:{message:'停止失败'}}:{json:{...job(),status:'cancelled'}})
 if(/^\/api\/media\/jobs\/job-[ac]$/.test(url.pathname)){gets++;return route.fulfill(get404?{status:404,json:{message:'任务不存在'}}:{json:job()})}
 if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<div id="app"></div><script type="module" src="/bundle.js"></script>'})
 return route.abort()
 })
 await page.goto('http://localhost:5999/')
 await page.getByRole('button',{name:'生成当前镜头',exact:true}).waitFor()
 await check('edited prompt survives shot switching',async()=>{
 await page.getByTestId('video-prompt-input').fill('我自己写的描述')
 await page.getByTestId('video-shot-select').selectOption('1')
 await page.getByTestId('video-shot-select').selectOption('0')
 assert.equal(await page.getByTestId('video-prompt-input').inputValue(),'我自己写的描述')
 })
 await check('submission is locked before server returns',async()=>{
 await page.getByRole('button',{name:'生成当前镜头',exact:true}).evaluate(e=>{e.click();e.click()})
 await page.waitForFunction(()=>document.querySelector('.video-panel__actions .is-primary')?.disabled)
 assert.equal(creates,1);assert.equal(await page.getByRole('button',{name:'关闭',exact:true}).isDisabled(),true)
 resolveCreate();await page.getByRole('button',{name:'停止等待',exact:true}).waitFor()
 })
 await check('cancel failure leaves resumable polling action',async()=>{
 cancelFail=true;await page.getByRole('button',{name:'停止等待',exact:true}).click()
 await page.getByRole('button',{name:'继续查询',exact:true}).waitFor()
 assert.equal(creates,1); assert.match(await page.locator('.video-panel__message').innerText(),/停止失败/)
 })
 await check('close and reopen resumes same task without resubmit',async()=>{
 await page.getByRole('button',{name:'关闭',exact:true}).click();const before=gets
 await page.evaluate(()=>{window.state.open=true});await page.waitForFunction(()=>document.querySelector('.video-panel__job'))
 await page.waitForTimeout(50);assert.ok(gets>before);assert.equal(creates,1)
 })
 await check('completed output saves immutable project and preview',async()=>{
 await page.getByRole('button',{name:'停止等待',exact:true}).click();await page.getByRole('button',{name:'继续查询',exact:true}).waitFor()
 jobStatus='succeeded';await page.getByRole('button',{name:'继续查询',exact:true}).click()
 await page.waitForFunction(()=>window.archives.length===1);await page.locator('video').waitFor();const archives=await page.evaluate(()=>window.archives)
 assert.equal(archives.length,1);assert.equal(archives[0].projectId,'book-a');assert.equal(archives[0].promptSnapshot,'我自己写的描述')
 assert.equal(archives[0].generationParams.shotId,'s1');assert.match(await page.locator('.video-panel__message').innerText(),/原件/)
 })
 await check('reopen completed task does not duplicate saved asset',async()=>{
 await page.getByRole('button',{name:'关闭',exact:true}).click();await page.evaluate(()=>{window.state.open=true});await page.locator('video').waitFor()
 assert.equal(await page.evaluate(()=>window.archives.length),1)
 const saved=await page.evaluate(()=>sessionStorage.getItem('pinax:storyboard-video:last:["book-a","doc-a"]'))
 assert.ok(saved&&!saved.includes('apiKey'));assert.equal(JSON.parse(saved).archived,true)
 })
 await check('already archived result is not archived again after recovering a stale task receipt',async()=>{
 const before=await page.evaluate(()=>localStorage.getItem('media_assets_v1'))
 await page.getByRole('button',{name:'关闭',exact:true}).click()
 await page.evaluate(()=>{const key='pinax:storyboard-video:last:["book-a","doc-a"]';const record=JSON.parse(sessionStorage.getItem(key));record.archived=false;record.job.status='running';sessionStorage.setItem(key,JSON.stringify(record));window.state.open=true})
 await page.getByText('视频原件已保存在当前浏览器，完整备份会包含这个视频。',{exact:true}).waitFor()
 assert.equal(await page.evaluate(()=>window.archives.length),1)
 assert.equal(await page.evaluate(()=>localStorage.getItem('media_assets_v1')),before)
 })
 await check('project switch isolates stale submit response',async()=>{
 jobStatus='running';await page.getByRole('button',{name:'生成当前镜头',exact:true}).click();await page.waitForTimeout(30)
 await page.evaluate(()=>{window.state.projectId='book-b';window.state.context={...window.state.context,document:{id:'doc-b',source:{title:'第二本书'}}}})
 resolveCreate();await page.waitForTimeout(50);assert.equal(await page.locator('.video-panel__job').count(),0);assert.equal(await page.evaluate(()=>window.archives.length),1)
 assert.ok(await page.evaluate(()=>sessionStorage.getItem('pinax:storyboard-video:last:["book-a","doc-a"]')))
 })
 await check('recovered missing server task never resubmits automatically',async()=>{
 get404=true;await page.evaluate(()=>{window.state.projectId='book-a';window.state.context={...window.state.context,document:{id:'doc-a',source:{title:'雨夜归人'}}}})
 await page.getByText(/这条任务已无法查询/).waitFor();assert.equal(creates,2)
 })
 await check('failed storage retries saving without paying for another generation',async()=>{
 get404=false;jobStatus='succeeded';jobId='job-c'
 await page.evaluate(()=>{window.state.projectId='book-c';window.state.context={...window.state.context,document:{id:'doc-c',source:{title:'存储回归'}}};window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='media_assets_v1')throw new Error('模拟存储已满');return window.originalSetItem.call(this,k,v)}})
 await page.getByRole('button',{name:'生成当前镜头',exact:true}).click();await page.waitForTimeout(30);resolveCreate()
 await page.getByRole('button',{name:'重试保存原件',exact:true}).waitFor();const before=creates
 await page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem})
 await page.getByRole('button',{name:'重试保存原件',exact:true}).click();await page.getByText('视频原件已保存在当前浏览器，完整备份会包含这个视频。',{exact:true}).waitFor()
 assert.equal(creates,before);assert.equal(await page.evaluate(()=>window.archives.at(-1).projectId),'book-c')
 })
 await check('model picker editing keeps parent panel and Esc only closes inner layer',async()=>{
 await page.getByTestId('video-model-config-trigger').click();await page.getByRole('dialog',{name:'选择视频模型',exact:true}).waitFor()
 assert.equal(await page.getByRole('dialog',{name:'生成镜头视频',exact:true}).count(),1)
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog',{name:'选择视频模型',exact:true}).count(),0)
 assert.equal(await page.getByRole('dialog',{name:'生成镜头视频',exact:true}).count(),1)
 })
 await check('manual prompt edits make a late advisor proposal stale',async()=>{
 await page.getByRole('button',{name:'完善描述',exact:true}).click();await page.getByRole('button',{name:'应用修改',exact:true}).waitFor()
 await page.getByTestId('video-prompt-input').fill('作者又修改了一次动作')
 await page.getByRole('button',{name:'应用修改',exact:true}).click()
 assert.equal(await page.getByTestId('video-prompt-input').inputValue(),'作者又修改了一次动作')
 assert.match(await page.locator('.agent-result__detail').innerText(),/已手动修改/)
 })
 await check('advisor proposal stays with the originating book',async()=>{
 await page.getByRole('button',{name:'完善描述',exact:true}).click();await page.getByRole('button',{name:'应用修改',exact:true}).waitFor()
 await page.evaluate(()=>{window.state.projectId='book-d';window.state.context={...window.state.context,document:{id:'doc-d',source:{title:'另一部作品'}}}})
 assert.equal(await page.getByRole('button',{name:'应用修改',exact:true}).count(),0)
 })
 await check('rejected shot persistence cannot mark suggestion applied or alter current shots',async()=>{
 await page.evaluate(()=>{window.rejectShotSave=true})
 const before=await page.locator('.video-panel__shot-meta').innerText(), beforeCreates=creates
 await page.getByRole('button',{name:'检查连续性',exact:true}).click();await page.getByRole('button',{name:'应用修改',exact:true}).waitFor()
 await page.getByRole('button',{name:'应用修改',exact:true}).click()
 assert.equal(await page.locator('.video-panel__shot-meta').innerText(),before)
 assert.equal(await page.evaluate(()=>window.adviceResults.value[0].status),'failed')
 assert.equal(await page.getByRole('button',{name:'撤销本次',exact:true}).count(),0);assert.equal(creates,beforeCreates)
 })
 await check('successful shot persistence allows apply and failed undo preserves applied result',async()=>{
 await page.evaluate(()=>{window.rejectShotSave=false})
 await page.getByRole('button',{name:'检查连续性',exact:true}).click();await page.getByRole('button',{name:'应用修改',exact:true}).click()
 await page.getByRole('button',{name:'撤销本次',exact:true}).waitFor();const applied=await page.locator('.video-panel__shot-meta').innerText()
 assert.equal(await page.evaluate(()=>window.state.context.shots[0].shotType),'close_up')
 await page.evaluate(()=>{window.rejectShotSave=true});await page.getByRole('button',{name:'撤销本次',exact:true}).click()
 assert.equal(await page.locator('.video-panel__shot-meta').innerText(),applied);assert.equal(await page.evaluate(()=>window.adviceResults.value[0].status),'applied')
 await page.evaluate(()=>{window.rejectShotSave=false});await page.getByRole('button',{name:'撤销本次',exact:true}).click()
 assert.equal(await page.evaluate(()=>window.state.context.shots[0].shotType),undefined)
 })
 const historyVersion = {versionId:'history-v2',shots:[{shotId:'1',nodeId:'node-blue',sequence:1,content:'蓝色列车抵达',duration:6},{shotId:'2',nodeId:'node-red',sequence:2,content:'红色列车离开',duration:6}]}
 const historyDocument = {id:'history-doc',source:{title:'列车的两个镜头'},versions:[historyVersion,{versionId:'history-v1',shots:[{shotId:'1',nodeId:'node-red',sequence:1},{shotId:'2',nodeId:'node-blue',sequence:2}]}]}
 const makeVideo = (id, extras={}) => ({id,generationJobId:id,kind:'video',purpose:'storyboard-take',projectId:'history-a',durationSeconds:6,createdAt:Date.now(),externalUrl:`https://media.example/${id}.mp4`,promptSnapshot:`${id} 的当时描述`,generationParams:{storyboardDocumentId:'history-doc',storyboardVersionId:'history-v2',nodeId:'node-blue',shotId:'1',shotSequence:1,resolution:'768P'},...extras})
 const historyAssets=[
   makeVideo('blue-current'),
   makeVideo('blue-expired',{createdAt:Date.now()-1000,generationParams:{storyboardDocumentId:'history-doc',storyboardVersionId:'history-v2',nodeId:'node-blue',shotId:'1',externalUrlExpiresAt:Date.now()-60000}}),
   makeVideo('blue-previous',{createdAt:Date.now()-2000,generationParams:{shotId:'2',shotSequence:2},sourceRefs:[{refType:'storyboard-shot',refId:'history-v1',projectId:'history-a'}]}),
   makeVideo('red-previous',{generationParams:{shotId:'1',shotSequence:1},sourceRefs:[{refType:'storyboard-shot',refId:'history-v1',projectId:'history-a'}]}),
   makeVideo('different-document',{generationParams:{storyboardDocumentId:'other-doc',storyboardVersionId:'history-v2',nodeId:'node-blue',shotId:'1'}}),
   makeVideo('different-book',{projectId:'history-b'}), makeVideo('unowned-video',{projectId:null})
 ]
 await check('history follows stable shot identity across reordered versions',async()=>{
   const selected=selectStoryboardVideoHistory(historyAssets,{projectId:'history-a',document:historyDocument,version:historyVersion,shot:historyVersion.shots[0]})
   assert.deepEqual(selected.map(item=>item.id),['blue-current','blue-expired','blue-previous'])
   assert.equal(selected.at(-1).previousVersion,true)
   const noNode=makeVideo('ambiguous',{generationParams:{shotId:'1'},sourceRefs:[{refType:'storyboard-shot',refId:'unknown-version'}]})
   assert.deepEqual(selectStoryboardVideoHistory([noNode],{projectId:'history-a',document:historyDocument,version:historyVersion,shot:historyVersion.shots[0]}),[])
   assert.equal(getStoryboardVideoAvailability(historyAssets[1]).expired,true)
   assert.equal(getStoryboardVideoAvailability(makeVideo('bad',{externalUrl:'javascript:alert(1)'})).url,'')
 })
 await check('panel browses saved results with strict book and shot filtering',async()=>{
   await page.evaluate(({historyAssets,historyDocument,historyVersion})=>{
     localStorage.setItem('media_assets_v1',JSON.stringify(historyAssets))
     window.state.projectId='history-a';window.state.context={document:historyDocument,version:historyVersion,shots:historyVersion.shots}
     sessionStorage.setItem('harness-context',JSON.stringify(window.state))
   },{historyAssets,historyDocument,historyVersion})
   await page.locator('[data-video-result-id="blue-current"]').waitFor()
   assert.equal(await page.locator('[data-video-result-id]').count(),3)
   assert.equal(await page.locator('video').getAttribute('src'),'https://media.example/blue-current.mp4')
   await page.locator('[data-video-result-id="blue-previous"]').click()
   assert.equal(await page.locator('video').getAttribute('src'),'https://media.example/blue-previous.mp4')
   assert.equal(await page.getByRole('link',{name:'打开原链接'}).getAttribute('href'),'https://media.example/blue-previous.mp4')
 })
 await check('refreshing media metadata preserves the author selected historical take',async()=>{
 await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'media_assets_v1'})))
 assert.equal(await page.locator('video').getAttribute('src'),'https://media.example/blue-previous.mp4')
 })
 await check('expired result stays selectable without auto-loading a dead link',async()=>{
   await page.locator('[data-video-result-id="blue-expired"]').click()
   await page.getByText('这个视频链接已到期',{exact:true}).waitFor()
   assert.equal(await page.locator('video').count(),0)
   await page.getByRole('button',{name:'尝试播放',exact:true}).click()
   assert.equal(await page.locator('video').getAttribute('src'),'https://media.example/blue-expired.mp4')
 })
 await check('playback errors do not create jobs or alter completed generation records',async()=>{
   const beforeCreates=creates, beforeRecords=await page.evaluate(()=>localStorage.getItem('media_assets_v1'))
   await page.locator('video').dispatchEvent('error')
   await page.getByText('暂时无法播放这个视频',{exact:true}).waitFor()
   assert.equal(creates,beforeCreates)
   assert.equal(await page.evaluate(()=>localStorage.getItem('media_assets_v1')),beforeRecords)
   await page.getByRole('button',{name:'重试播放',exact:true}).click()
   assert.equal(await page.locator('video').count(),1)
   await page.locator('[data-video-result-id="blue-current"]').click()
   assert.equal(await page.getByText('暂时无法播放这个视频',{exact:true}).count(),0)
 })
 await check('switching shots and books never keeps the previous result preview',async()=>{
   await page.getByTestId('video-shot-select').selectOption('1')
   await page.locator('[data-video-result-id="red-previous"]').waitFor()
   assert.equal(await page.locator('[data-video-result-id]').count(),1)
   assert.equal(await page.locator('video').getAttribute('src'),'https://media.example/red-previous.mp4')
   await page.getByTestId('video-shot-select').selectOption('0')
   await page.evaluate(()=>{window.state.projectId='history-b'})
   await page.locator('[data-video-result-id="different-book"]').waitFor()
   assert.equal(await page.locator('[data-video-result-id]').count(),1)
   assert.equal(await page.locator('video').getAttribute('src'),'https://media.example/different-book.mp4')
 })
 await check('refresh restores all saved history without archiving or submitting again',async()=>{
   const beforeCreates=creates
   await page.reload();await page.locator('[data-video-result-id="blue-current"]').waitFor()
   assert.equal(await page.locator('[data-video-result-id]').count(),3)
   assert.equal(creates,beforeCreates);assert.equal(await page.evaluate(()=>window.archives.length),0)
   assert.equal(await page.locator('video').getAttribute('src'),'https://media.example/blue-current.mp4')
 })
 await check('no runtime errors',async()=>assert.deepEqual(errors,[]))
 console.log(`PASSED ${checks} video client checks`)
} finally {
 try { await browser?.close() } finally { await fs.rm(dir,{recursive:true,force:true}) }
}
