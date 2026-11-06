import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const errors = []
try {
  const page = await browser.newPage()
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.route('**/api/localmirror/capabilities', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'ISOLATED_OFFLINE_FIXTURE' }) }))
  await page.goto(process.env.PINAX_MEDIA_SMOKE_URL || 'http://127.0.0.1:5307')
  // Warm lazy dependencies before creating fixtures: Vite may reload once while optimizing them.
  await page.evaluate(() => import('/src/services/media/mediaAssetStore.js'))
  const result = await page.evaluate(async () => {
    const media = await import('/src/services/media/mediaAssetStore.js')
    const { STORAGE_KEYS } = await import('/src/composables/useStorage.js')
    const check = (value, label) => { if (!value) throw new Error(label) }
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
    const image = await media.saveMediaAsset({ id: 'browser-asset', projectId: 'isolated-project', kind: 'image' }, { binary: png })
    check(image.width === 1 && image.height === 1, 'real image decode dimensions')
    check((await media.getMediaAssetDataUrl(image.id)).startsWith('data:image/png;base64,'), 'real IndexedDB/FileReader roundtrip')
    const child = await media.saveMediaAsset({ id: 'browser-child', parentAssetId: image.id, projectId: 'isolated-project' }, { binary: png })
    localStorage.setItem(STORAGE_KEYS.COMIC_PAGES, JSON.stringify([{ imageTakeIds: [child.id] }]))
    let blocked = false
    try { await media.deleteMediaAsset(child.id) } catch { blocked = true }
    check(blocked, 'referenced image must survive deletion')
    localStorage.removeItem(STORAGE_KEYS.COMIC_PAGES)
    const ids = await media.listMediaBinaryIds()
    check(ids.includes(image.id) && ids.includes(child.id), 'backup binary enumeration')
    const bytes = await media.getMediaBinaryById(child.id)
    await media.putMediaBinaryById('restored-binary', bytes)
    check((await media.getMediaBinaryById('restored-binary')).size === bytes.size, 'binary backup restore')
    check(media.listMediaAssets({ projectId: 'other-project' }).length === 0, 'project isolation')
    return { schema: image.schemaVersion, mime: image.mimeType, ids: ids.length }
  })
  await page.reload()
  const retained = await page.evaluate(async () => {
    const media = await import('/src/services/media/mediaAssetStore.js')
    const kept = await media.getMediaAsset('browser-asset')
    if (!kept?.blob || kept.asset.projectId !== 'isolated-project') throw new Error('reload persistence')
    await media.deleteMediaAsset('browser-child')
    await media.deleteMediaAsset('browser-asset')
    await media.deleteMediaBinaryById('restored-binary')
    return (await media.listMediaBinaryIds()).length
  })
  assert.equal(retained, 0)
  assert.deepEqual(errors, [])
  console.log('PASS real media Host: IndexedDB/PNG decode/FileReader, references, project scope, backup restore, reload and cleanup', result)
} finally { await browser.close() }
