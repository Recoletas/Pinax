/* eslint-disable no-console -- explicit browser smoke prints its result */
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Isolated real browser storage; no paid model, live project, or generation endpoint.
const browser = await chromium.launch({ headless: true })
const errors = []
try {
  const page = await browser.newPage()
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.route('**/api/localmirror/capabilities', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'ISOLATED_OFFLINE_FIXTURE' }) }))
  await page.goto(process.env.PINAX_COMIC_SMOKE_URL || 'http://127.0.0.1:5307')
  const warm = () => page.evaluate(() => Promise.all([
    import('/src/services/media/comicPageStore.js'),
    import('/src/services/media/storyboardStore.js'),
    import('/src/services/media/shotExporter.js')
  ]))
  await page.waitForLoadState('networkidle')
  try { await warm() } catch (error) {
    // Dev-only dependency optimization can reload once before any fixture is written.
    if (!String(error.message).includes('Execution context was destroyed')) throw error
    await page.waitForLoadState('networkidle')
    await warm()
  }
  const first = await page.evaluate(async () => {
    const c = await import('/src/services/media/comicPageStore.js')
    const m = await import('/src/services/media/mediaAssetStore.js')
    const s = await import('/src/services/media/storyboardStore.js')
    const e = await import('/src/services/media/shotExporter.js')
    const check = (value, label) => { if (!value) throw new Error(label) }
    const canvas = document.createElement('canvas')
    canvas.width = 64; canvas.height = 64
    const paint = canvas.getContext('2d')
    paint.fillStyle = '#c8bba5'; paint.fillRect(0, 0, 64, 64)
    paint.fillStyle = '#4c555a'; paint.fillRect(17, 12, 30, 52)
    const png = canvas.toDataURL('image/png')
    const image = await m.saveMediaAsset({ id: 'comic-host-stage', projectId: 'book-host' }, { binary: png })
    let comic = c.saveComicPage({ id: 'comic-host-page', projectId: 'book-host', title: '入城', panels: Array.from({ length: 4 }, (_, index) => ({ id: `panel-${index}`, visual: `镜头${index + 1}` })) })
    const snapshot = structuredClone(comic)
    comic = c.addComicPanelStageArtifact(comic.id, comic.panels[0].id, 'rough', { id: image.id, inputRevision: 'r1' })
    comic = c.saveComicPageDraft({ ...snapshot, title: '清晨入城' })
    check(comic.panels[0].production.rough.selectedArtifactId === image.id, 'editor snapshot erased stage result')
    const hydrated = await c.hydrateComicPageTakes(comic)
    check(hydrated.panels[0].displaySelection.type === 'stage', 'stage shown as direct-image take')
    check(hydrated.panels[0].displayImage.data.startsWith('data:image/png;base64,'), 'stage bytes not hydrated')
    check(hydrated.panels[0].imageTakeIds.length === 0, 'stage fabricated ordinary takes')
    let blocked = false
    try { await m.deleteMediaAsset(image.id) } catch { blocked = true }
    check(blocked && (await m.getMediaAsset(image.id))?.blob, 'referenced stage image deleted')
    let changed = 0
    const listener = () => { changed++ }
    window.addEventListener('pinax-comic-pages-changed', listener)
    let failed = false
    try { c.saveComicPage({ ...comic, title: '失败修改' }, { storage: { getItem: key => localStorage.getItem(key), setItem() { throw new Error('quota fixture') } } }) } catch { failed = true }
    window.removeEventListener('pinax-comic-pages-changed', listener)
    check(failed && changed === 0 && c.listComicPages()[0].title === '清晨入城', 'failed save published success')
    const v1 = s.saveStoryboardVersion({ projectId: 'book-host', source: { sourceType: 'chapter', sourceId: 'chapter-host' }, shots: [{ sourceText: '城门打开。', shotType: 'wide', duration: 3 }] })
    s.saveStoryboardVersion({ documentId: v1.document.id, projectId: 'book-host', shots: [{ sourceText: '守卫走出。', duration: 4 }] })
    check(s.restoreStoryboardVersion(v1.document.id, v1.version.versionId).success, 'version restore failed')
    check(s.listStoryboardDocuments({ projectId: 'other-book' }).length === 0, 'storyboard leaked to another project')
    const pack = e.buildEditingPackage(v1.version.shots, { topic: '入城' })
    const zip = e.buildEditingPackageZip(pack)
    check(zip[0] === 80 && zip[1] === 75, 'invalid ZIP export')
    return { documentId: v1.document.id, versionId: v1.version.versionId, zipBytes: zip.length }
  })
  await page.evaluate(async () => {
    const vueUrl = performance.getEntriesByType('resource').map(entry => entry.name).find(url => /\/vue\.js(?:\?|$)/.test(url))
    if (!vueUrl) throw new Error('Vue browser module was not loaded')
    const { createApp, h } = await import(vueUrl)
    const Preview = (await import('/src/components/media/ComicPagePreview.vue')).default
    const c = await import('/src/services/media/comicPageStore.js')
    const comic = await c.hydrateComicPageTakes(c.listComicPages({ projectId: 'book-host' })[0])
    const mount = document.createElement('div')
    mount.id = 'comic-browser-fixture'
    mount.style.cssText = 'width:min(calc(100vw - 32px),480px);margin:16px auto'
    document.querySelector('#app').style.display = 'none'
    document.body.appendChild(mount)
    createApp({ render: () => h(Preview, { page: comic }) }).mount(mount)
  })
  try { await page.waitForFunction(() => document.querySelector('#comic-browser-fixture img')?.naturalWidth === 64, null, { timeout: 10000 }) } catch (error) {
    throw new Error(error.message + ' ' + await page.evaluate(() => JSON.stringify({ html: document.querySelector('#comic-browser-fixture')?.innerHTML, errors: [...document.querySelectorAll('#comic-browser-fixture img')].map(image => ({ complete: image.complete, width: image.naturalWidth, src: image.src.slice(0, 80) })) })))
  }
  assert.equal(await page.locator('#comic-browser-fixture img').count(), 1)
  if (process.env.PINAX_COMIC_SHOTS) {
    for (const [width, scheme] of [[1100, 'light'], [1100, 'dark'], [390, 'light'], [390, 'dark']]) {
      await page.setViewportSize({ width, height: 850 })
      await page.evaluate(scheme => { document.documentElement.classList.remove('theme-light', 'theme-dark'); document.documentElement.classList.add('theme-' + scheme) }, scheme)
      await page.locator('#comic-browser-fixture').screenshot({ path: `${process.env.PINAX_COMIC_SHOTS}-${width}-${scheme}.png` })
    }
  }
  await page.reload()
  const reloaded = await page.evaluate(async first => {
    const c = await import('/src/services/media/comicPageStore.js')
    const m = await import('/src/services/media/mediaAssetStore.js')
    const s = await import('/src/services/media/storyboardStore.js')
    const { STORAGE_KEYS } = await import('/src/composables/useStorage.js')
    const comic = c.listComicPages({ projectId: 'book-host' })[0]
    const hydrated = await c.hydrateComicPageTakes(comic)
    if (!hydrated.panels[0].displayImage?.data || comic.title !== '清晨入城') throw new Error('comic refresh lost content')
    const document = s.getStoryboardDocument(first.documentId)
    if (document.versions.length !== 2 || document.currentVersionId !== first.versionId) throw new Error('storyboard refresh lost versions')
    localStorage.removeItem(STORAGE_KEYS.COMIC_PAGES)
    localStorage.removeItem(STORAGE_KEYS.STORYBOARD_DOCUMENTS)
    await m.deleteMediaAsset('comic-host-stage')
    return (await m.listMediaBinaryIds()).length
  }, first)
  assert.equal(reloaded, 0)
  assert.deepEqual(errors, [])
  console.log('PASS real Host: stage bytes/display/lineage, stale draft, failed-save events, storyboard versions/restore/refresh and ZIP', first)
} finally { await browser.close() }
