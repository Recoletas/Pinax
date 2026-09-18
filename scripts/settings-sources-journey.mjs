#!/usr/bin/env node
// Isolated production UI journey; no real provider or user storage.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const base = process.env.BASE || 'http://127.0.0.1:5196'
const out = process.env.OUT_DIR || '/tmp/pinax-sources-fixed'
const server = process.env.BASE ? null : spawn(path.join(root, 'node_modules/.bin/vite'), ['--host', '127.0.0.1', '--port', '5196', '--strictPort'], { cwd: root, stdio: 'pipe' })
let browser
let passed = 0
function pass(name) { passed++; console.log(`PASS ${name}`) }
try {
 for (let i = 0; i < 100; i++) {
  if (server?.exitCode != null) throw new Error('isolated Vite exited')
  try { if ((await fetch(base)).ok) break } catch { /* startup */ }
  await new Promise(resolve => setTimeout(resolve, 200))
 }
 browser = await chromium.launch()
 const page = await browser.newPage({viewport:{width:1440,height:900}})
 const errors = []
 page.on('pageerror', error => errors.push(error.message))
 await page.route('**/api/advisor**', route => { errors.push('Unexpected provider request'); return route.abort() })
 await page.addInitScript(() => {
  if(localStorage.getItem('sources-journey-seeded')) return
  for(const id of ['a','b']) {
   localStorage.setItem('worldbook_wb-'+id, JSON.stringify({id:'wb-'+id,name:'资料库'+id,entries:[],sourceDocuments:[{id:'source-'+id,title:'仅属于'+id+'的资料',kind:'pasted-text',content:'这是书'+id+'的独立资料。',contentPreview:'这是书'+id+'的独立资料。'}]}))
  }
  localStorage.setItem('worldbooks_index',JSON.stringify(['a','b'].map(id=>({id:'wb-'+id,name:'资料库'+id,entryCount:0}))))
  localStorage.setItem('active_worldbook_id','wb-b')
  localStorage.setItem('writing_books',JSON.stringify(['a','b','unbound','broken'].map(id=>({id:'book-'+id,title:'书'+id,worldbookId:id==='unbound'?'':'wb-'+id,chapters:[{id:'ch-'+id,title:'第一章',content:'测试正文'}]}))))
  localStorage.setItem('sources-journey-seeded','1')
 })
 const navigate = async query => page.evaluate(async query => {
  const router = document.querySelector('#app').__vue_app__.config.globalProperties.$router
  await router.push({name:'settings-sources',query})
 },query)
 const source = title => page.locator('.sources-panel__title').filter({hasText:title})
 const upload = async (name,text) => {
  await page.waitForURL(/action=add/)
  await page.getByLabel('导入多文件资料').setInputFiles({name,mimeType:'text/plain',buffer:Buffer.from(text)})
  await page.locator('.source-row .source-status.is-ready').first().waitFor()
  await page.locator('[data-test="append-sources-confirm"]').click()
 }
 await page.goto(`${base}/settings/sources?bookId=book-a&worldbookId=wb-b`)
 await source('仅属于a').waitFor()
 assert.equal(await source('仅属于b').count(),0)
 assert.match(await page.locator('.ws-tab.is-active').innerText(),/资料/)
 assert.equal(await page.getByRole('tab',{name:'资料',exact:true}).getAttribute('aria-selected'),'true')
 pass('bound book overrides conflicting query; independent active tab and navigation')
 await page.reload()
 await source('仅属于a').waitFor()
 pass('direct URL and refresh preserve sources')
 await page.locator('[data-test="sources-add"]').click()
 await upload('追加资料.txt','莉娜没有钥匙。北墙每晚十点上锁。这是一份新加入的参考资料。')
 await page.waitForURL(/settings\/sources\?bookId=book-a$/)
 await source('追加资料').waitFor()
 await page.reload()
 await source('追加资料').waitFor()
 pass('real TXT upload → append → return to sources → durable refresh')
 await navigate({bookId:'book-b'})
 await source('仅属于b').waitFor()
 assert.equal(await source('追加资料').count(),0)
 await navigate({bookId:'missing-book'})
 await page.getByRole('alert').filter({hasText:'这本书已不存在'}).waitFor()
 assert.equal(await page.locator('.sources-panel').count(),0)
 assert.equal(await page.locator('[data-test="sources-add"]').count(),0)
 await navigate({bookId:'book-broken'})
 await page.getByRole('alert').filter({hasText:'已不存在'}).waitFor()
 assert.equal(await page.locator('.sources-panel').count(),0)
 pass('switch book isolation; missing book/worldbook cannot expose old sources')
 await navigate({bookId:'book-unbound'})
 await page.getByRole('button',{name:'添加资料',exact:true}).click()
 await upload('新书资料.txt','新书的灯塔位于北海岸。每晚由守塔人点灯。')
 await page.waitForURL(/settings\/sources\?bookId=book-unbound$/)
 await source('新书资料').waitFor()
 assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('writing_books')).find(b=>b.id==='book-unbound').worldbookId))
 pass('unbound book can add sources and create its own library without AI')
 await page.goto(`${base}/settings/worldbook/create?mode=sources&bookId=book-a`)
 await page.waitForURL(/settings\/sources\?bookId=book-a$/)
 await source('追加资料').waitFor()
 await page.locator('[data-test="sources-add"]').click()
 await page.waitForURL(/action=add/)
 await page.goBack()
 await source('追加资料').waitFor()
 pass('legacy redirect and panel add remain distinct; browser back restores list')
 await source('追加资料').click()
 await page.waitForFunction(()=>document.querySelector('.sources-panel__preview pre')?.textContent.includes('莉娜没有钥匙'))
 pass('archived full text preview')
 await page.locator('.sources-panel__item').filter({hasText:'追加资料'}).getByRole('button',{name:/移出/}).click()
 await page.waitForFunction(()=>!document.querySelector('.sources-panel__list')?.textContent.includes('追加资料'))
 await page.reload()
 await source('仅属于a').waitFor()
 assert.equal(await source('追加资料').count(),0)
 pass('remove refreshes project-local list and persists')
 await mkdir(out,{recursive:true})
 for (const width of [1440,900,390]) {
  await page.setViewportSize({width,height:900})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await page.screenshot({path:path.join(out,`sources-${width}.png`)})
 }
 await page.getByRole('button',{name:'切换夜间模式'}).click()
 await page.waitForTimeout(200)
 await page.screenshot({path:path.join(out,'sources-dark.png')})
 assert.deepEqual(errors,[])
 pass('three viewports, dark mode, no page errors/provider calls')
 console.log(`settings-sources-journey: ${passed}/${passed} passed`)
} finally {
 await browser?.close()
 server?.kill('SIGTERM')
}
