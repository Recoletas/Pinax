// Synthetic, isolated author journey. Owns only its two temporary servers and
// browser contexts; never reads an author's localStorage or calls real models.
import { spawn } from 'node:child_process'
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { verifyEnglishToolPanels, verifyEnglishSidebarLayout } from './english-tools-smoke.mjs'
const out = '/tmp/pinax-english-support'
const base = 'http://127.0.0.1:5232'
const children = []
const errors = []
const report = []
const missingTranslations = new Set()
const text = `Prologue\nHello, world!\nChapter 1\n"Stay here," she said. Don't follow O’Neill into the café.\nCHAPTER IV: The Door\nSurely she knew the road.\nEpilogue\nThe door closed.`
await mkdir(out, { recursive: true })
function start(args, env = {}) {
 const child = spawn(process.execPath, args, { cwd: process.cwd(), env: { ...process.env, ...env }, stdio: ['ignore','pipe','pipe'] })
 children.push(child)
 let log = ''; child.stdout.on('data', b=>{log+=b});child.stderr.on('data',b=>{log+=b});child.on('exit',()=>writeFile(`${out}/${args[0].includes('vite')?'vite':'server'}.log`,log))
 return child
}
async function ready(url) {
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return}catch{}await new Promise(r=>setTimeout(r,300))}
 throw Error('Server not ready: '+url)
}
let browser
try {
 // Refuse to reuse or stop an existing listener at our test addresses.
 for(const url of [base,'http://127.0.0.1:3032']) { let occupied=false;try{await fetch(url);occupied=true}catch{}assert(!occupied,'Test port is occupied: '+url) }
 start(['server/index.js'], {PORT:'3032'})
 start(['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5232','--strictPort'],{PINAX_DEV_BACKEND_ORIGIN:'http://127.0.0.1:3032'})
 await ready(base)
 browser = await chromium.launch({headless:true})
 const context = await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US',acceptDownloads:true})
 const page = await context.newPage()
 globalThis.auditPage = page
 page.on('pageerror',error=>errors.push(error.message))
 page.on('console',message=>{if(message.text().startsWith('[i18n]'))missingTranslations.add(message.text())})
 await page.route('**/*', route=> {const url=route.request().url();if(/^https?:/.test(url)&&!url.startsWith(base))return route.abort();return route.continue()})
 // Block optional automatic memory/model tasks before the first edit as well.
 await page.route('**/api/advisor/task',route=>route.fulfill({json:{taskType:route.request().postDataJSON().taskType,result:{}}}))
 await page.goto(base,{waitUntil:'networkidle'})
 assert.equal(await page.locator('html').getAttribute('lang'),'en')
 await page.getByRole('link',{name:'Import manuscript',exact:true}).click()
 await page.locator('[data-test="manuscript-file-picker"]').waitFor()
 await page.locator('input[type=file]').first().setInputFiles({name:'The Door.txt',mimeType:'text/plain',buffer:Buffer.from(text)})
 await page.locator('[data-test="manuscript-import-confirm"]').waitFor()
 assert.equal(await page.locator('.manuscript-import__chapters li').count(),4)
 await page.locator('[data-test="manuscript-language"]').selectOption('en')
 await page.screenshot({path:`${out}/import-en.png`,fullPage:false})
 await page.locator('[data-test="manuscript-import-confirm"]').click()
 await page.locator('.ProseMirror').first().waitFor()
 await page.waitForTimeout(800)
 let book = await page.evaluate(()=>JSON.parse(localStorage.getItem('writing_books'))[0])
 assert.equal(book.manuscriptLanguage,'en'); assert.equal(book.chapters.length,4)
 assert.equal(book.chapters[1].content, text.split('Chapter 1\n')[1].split('\nCHAPTER IV')[0])
 report.push('English import: 4 chapters, optional manuscript language persisted')
 const editor=page.locator('.ProseMirror').first()
 await editor.locator('p').first().click();await page.keyboard.press('End');await page.keyboard.type(' A new sentence.')
 await page.waitForTimeout(900)
 assert((await editor.textContent()).includes('A new sentence.'))
 await page.waitForFunction(()=>localStorage.getItem('writing_books')?.includes('A new sentence.'))
 // Capture live editor identity, state and saved data before changing only UI.
 const before=await page.evaluate(async()=>{
   const el=document.querySelector('.ProseMirror');window.__englishEditor=el
   const { getChapterMarkdown }=await import('/src/services/writing/writingDocumentSchema.js')
   return {text:[...el.querySelectorAll('p')].map(p=>p.textContent).join('\n'), books:JSON.parse(localStorage.getItem('writing_books')).map(b=>({title:b.title,chapters:b.chapters.map(c=>({title:c.title,text:getChapterMarkdown(c)}))}))}
 })
 await page.evaluate(async()=>{const {setLanguagePreferences}=await import('/src/i18n/index.js');setLanguagePreferences('zh-CN')})
 await page.waitForTimeout(100)
 assert.equal((await editor.locator('p').allTextContents()).join('\n'),before.text)
 assert(await page.evaluate(()=>window.__englishEditor===document.querySelector('.ProseMirror')))
 await page.evaluate(async()=>{const {setLanguagePreferences}=await import('/src/i18n/index.js');setLanguagePreferences('en')})
 const after=await page.evaluate(async()=>{const {getChapterMarkdown}=await import('/src/services/writing/writingDocumentSchema.js');return JSON.parse(localStorage.getItem('writing_books')).map(b=>({title:b.title,chapters:b.chapters.map(c=>({title:c.title,text:getChapterMarkdown(c)}))}))})
 assert.deepEqual(after,before.books)
 await editor.locator('p').first().click()
 await page.keyboard.press('Control+z')
 await page.waitForTimeout(100)
 assert(!(await editor.locator('p').allTextContents()).join(' ').includes('A new sentence.'))
 await page.keyboard.press('Control+Shift+z')
 await page.waitForTimeout(100)
 assert((await editor.locator('p').allTextContents()).join(' ').includes('A new sentence.'))
 report.push('UI switch preserves live editor instance, text, stored manuscript and undo/redo')
 await page.keyboard.press('Escape')
 await page.screenshot({path:`${out}/editor-en.png`,fullPage:false})
 await page.getByRole('button',{name:'Open settings',exact:true}).click()
 await page.locator('[data-test="settings-tab-appearance"]').click()
 await page.locator('[data-test="ui-language"]').selectOption('zh-CN')
 assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN')
 await page.locator('[data-test="ui-language"]').selectOption('en')
 await page.keyboard.press('Escape')
 await page.locator('[data-authoring-tool=characters]').click()
 await page.getByRole('button',{name:'New character',exact:true}).click()
 await page.getByRole('textbox',{name:'Character name',exact:true}).fill('Mae O’Neill')
 await page.getByRole('textbox',{name:'Background',exact:true}).fill('A cartographer who remembers the old harbor.')
 await page.getByRole('textbox',{name:'Background',exact:true}).blur()
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('worldbook_')&&localStorage.getItem(k).includes('A cartographer')))
 await page.screenshot({path:`${out}/characters-en.png`,fullPage:false})
 report.push('Settings language selection and character profile creation/edit/persistence')
 await verifyEnglishToolPanels(page, out)
 report.push('English exploration, character AI, image workspace/model configuration and mobile panes; drafts survive language switches')
 await verifyEnglishSidebarLayout(page, out)
 report.push('Outline, rehearsal, memory history and responsive settings; 85%/100% layouts and unchanged manuscript typography')
 // Real workflows with explicitly synthetic model responses.
 const requests=[]
 await page.route('**/api/advisor/task',async route=>{
   const body=route.request().postDataJSON()
   if (!body.options.chapterReview && !body.taskType.includes('rewrite')) return route.fulfill({json:{taskType:body.taskType,result:{}}})
   requests.push(body)
   await writeFile(`${out}/mock-requests.json`,JSON.stringify(requests.map(r=>({...r,options:{...r.options,providerConfig:undefined}})),null,2))
   let result
   if(body.options.chapterReview){
     const block=body.options.reviewBlocks[0]
     result={findings:[{kind:'proofing',issueType:'grammar',severity:'low',start:{nodeId:block.nodeId,offset:0},end:{nodeId:block.nodeId,offset:block.text.length},exact:block.text,reason:'可以更具体地描写咖啡馆。'}]}
   }else{
     const target=requests[0].options.reviewBlocks[0]
     result={candidates:[{text:String(target.text || target.exact || '').replace('café','quiet café'),label:'Option 1',rationale:'保留对白，补充环境。'}]}
   }
   const skill=body.options.writingSkill
   await route.fulfill({json:{taskType:body.taskType,result,meta:{languagePolicy:body.options.languagePolicy,...(skill?{writingSkill:{schemaVersion:1,skillId:skill.skillId,skillVersion:1,outputSchema:'writing-skill-findings.v1',enforcement:'applied'}}:{})}}})
 })
 await page.locator('.authoring-chapter-row').nth(1).click()
 await page.evaluate(async()=>{const {setLanguagePreferences}=await import('/src/i18n/index.js');setLanguagePreferences('en','zh-CN')})
 await page.locator('[data-authoring-tool=ai]').click()
 await page.getByRole('button',{name:'Story review',exact:true}).click()
 await page.getByRole('textbox',{name:'Review goal',exact:true}).fill('检查人物行动是否合理')
 await page.getByRole('combobox',{name:'Review scope',exact:true}).selectOption('chapter')
 await page.getByRole('checkbox',{name:'Keep dialogue unchanged',exact:true}).check()
 await page.getByRole('button',{name:'Start review',exact:true}).click()
 await page.getByRole('button',{name:'Rewrite from suggestion',exact:true}).first().click()
 await page.getByRole('button',{name:'Replace with this version',exact:true}).first().waitFor()
 assert.equal(await page.locator('.authoring-review-finding > p').first().getAttribute('lang'),'zh-CN')
 assert.equal(requests.length,2)
 for(const request of requests)assert.deepEqual(request.options.languagePolicy,{manuscriptLanguage:'en',assistantLanguage:'zh-CN',outputLanguage:'en'})
 assert.equal(requests[1].options.lockedSegments[0].text,'"Stay here,"')
 await page.screenshot({path:`${out}/review-en.png`,fullPage:false})
 await page.getByRole('button',{name:'Replace with this version',exact:true}).first().click()
 await page.waitForFunction(()=>document.querySelector('.ProseMirror')?.textContent.includes('quiet café'))
 assert((await editor.textContent()).includes('"Stay here,"'))
 await page.waitForFunction(()=>localStorage.getItem('writing_books')?.includes('quiet café'))
 report.push('Simulated model: Chinese explanations + English replacement, exact straight-quote lock, review/rewrite/apply/save')
 await page.getByRole('button',{name:'More writing actions',exact:true}).click()
 const downloaded=page.waitForEvent('download')
 await page.getByRole('menuitem',{name:'Export manuscript',exact:true}).click()
 const download=await downloaded
 await download.saveAs(`${out}/manuscript.md`)
 const exported=await readFile(`${out}/manuscript.md`,'utf8')
 assert(exported.includes('quiet café') && exported.includes('"Stay here,"'))
 report.push('Readable Markdown export preserves Unicode and protected dialogue')
 // Real backup export, clean context, real restore API: no author data involved.
 const backup=await page.evaluate(async()=>{const {buildBackup}=await import('/src/utils/backupExport.js');return buildBackup()})
 assert(!Object.hasOwn(backup.keys,'pinax-device-language'))
 const clean=await browser.newContext({locale:'en-US',viewport:{width:390,height:844}})
 const restored=await clean.newPage();restored.on('pageerror',e=>errors.push(e.message))
 await restored.route('**/api/advisor/task',route=>route.fulfill({json:{taskType:route.request().postDataJSON().taskType,result:{}}}))
 restored.on('console',message=>{if(message.text().startsWith('[i18n]'))missingTranslations.add(message.text())})
 await restored.goto(base,{waitUntil:'networkidle'})
 await restored.getByRole('button',{name:'Open settings',exact:true}).click()
 await restored.locator('[data-test="settings-tab-storage"]').click()
 await restored.locator('[data-test="backup-import-input"]').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))})
 await restored.locator('[data-test="backup-review"]').waitFor()
 await restored.screenshot({path:`${out}/restore-preview-en.png`,fullPage:false})
 await restored.locator('[data-test="backup-restore-confirm"]').click()
 await restored.waitForFunction(()=>localStorage.getItem('writing_books')?.includes('quiet café'))
 await restored.reload({waitUntil:'networkidle'})
 assert.equal(await restored.locator('html').getAttribute('lang'),'en')
 assert.equal(await restored.evaluate(()=>JSON.parse(localStorage.getItem('writing_books'))[0].manuscriptLanguage),'en')
 report.push('JSON backup restores manuscript language in clean browser; device locale excluded')
 await restored.goto(`${base}/authoring?bookId=${book.id}`,{waitUntil:'networkidle'})
 await restored.locator('.ProseMirror').first().waitFor()
 await restored.screenshot({path:`${out}/restored-mobile-en.png`,fullPage:false})
 await page.getByRole('button',{name:'Open settings',exact:true}).click()
 await page.locator('[data-test="settings-tab-appearance"]').click()
 await page.getByLabel('Color scheme',{exact:true}).selectOption('dark')
 await page.keyboard.press('Escape')
 await page.locator('.settings-modal').waitFor({state:'hidden'})
 await page.screenshot({path:`${out}/editor-dark-en.png`,fullPage:false})
 report.push('Desktop dark mode and restored mobile manuscript rendered')
 await page.goto(base+'/docs/01-quickstart',{waitUntil:'networkidle'})
 await page.getByRole('heading',{name:'Quick start',exact:true}).waitFor()
 await page.evaluate(async()=>{const {setLanguagePreferences}=await import('/src/i18n/index.js');setLanguagePreferences('zh-CN');setTimeout(()=>setLanguagePreferences('en'),5)})
 await page.getByRole('heading',{name:'Quick start',exact:true}).waitFor()
 await page.waitForTimeout(400)
 assert.equal(await page.locator('.docs-page [lang=en]').count(),1)
 await page.screenshot({path:`${out}/help-en.png`,fullPage:false})
 report.push('English help deep link and rapid language switch')
 assert.deepEqual(errors,[])
 assert.deepEqual([...missingTranslations],[])
 await writeFile(`${out}/report.json`,JSON.stringify({report,errors,missingTranslations:[...missingTranslations]},null,2))
 await rm(`${out}/failure.json`,{force:true})
 console.log(JSON.stringify({ok:true,report,errors}))
} catch(error) {
 await globalThis.auditPage?.screenshot({path:`${out}/failure.png`,fullPage:false}).catch(()=>{})
 await writeFile(`${out}/failure.json`,JSON.stringify({error:error.stack,errors,report,missingTranslations:[...missingTranslations]},null,2));throw error
} finally {
 await browser?.close()
 for(const child of children.reverse())if(child.exitCode===null)child.kill('SIGTERM')
}
