#!/usr/bin/env node
// 全局导入管线确定性 smoke：合成 entries 测 walk/分类/组装（不碰 DOM/FS Access/IndexedDB）。
// 运行：node scripts/local-import-check.mjs
import assert from 'node:assert/strict'
import { classifyImportEntries, isBookFile, isMaterialFile } from '../src/services/import/importPipeline.js'

let passed = 0
const check = (name, condition) => { assert.ok(condition, name); passed += 1; console.log(`  ✓ ${name}`) }

const entry = (path, depth, size = 100) => ({ path, name: path.split('/').at(-1), depth, size, file: async () => ({ arrayBuffer: async () => new ArrayBuffer(0) }) })

console.log('[1] 分类：一书+资料语义')
const entries = [
  entry('第一章 潮声.md', 0),
  entry('第二章 罗盘.md', 0),
  entry('设定集.pdf', 0),
  entry('资料/世界设定.txt', 1),
  entry('资料/人物小传.md', 1),
  entry('参考/资料.docx', 1)
]
const { bookEntries, materialEntries } = classifyImportEntries(entries)
check('根目录 txt/md 是书稿（2 个，按路径排序）', bookEntries.length === 2 && bookEntries[0].path === '第一章 潮声.md')
check('子目录全部归为资料（4 个）', materialEntries.length === 4)
check('根目录 pdf 归为资料', materialEntries.some((item) => item.path === '设定集.pdf'))

console.log('[2] 扩展名判定')
check('根目录 .txt 是书稿', isBookFile('序章.txt', 0))
check('根目录 .docx 不是书稿', !isBookFile('设定.docx', 0))
check('子目录 .txt 不是书稿（归资料）', !isBookFile('a.txt', 1) && isMaterialFile('a.txt', 1))
check('根目录 .epub 是资料', isMaterialFile('原书.epub', 0))

console.log('[3] 空书稿场景')
const onlyMaterials = classifyImportEntries([entry('资料/a.txt', 1)])
check('只有资料时书稿为空', onlyMaterials.bookEntries.length === 0 && onlyMaterials.materialEntries.length === 1)

console.log('[4] 本地项目设置面与绑定（fetch mock + localStorage shim）')
const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key)
}
const calls = []
globalThis.fetch = async (url, options) => {
  calls.push({ url, body: options?.body ? JSON.parse(options.body) : null })
  return { ok: true, json: async () => ({ ok: true, entry: { projectId: 'p1', rootPath: 'D:/Projects/新书', bookId: 'book_xyz' } }) }
}
const { bindLocalProject, getLocalMirrorSettings, removeLocalProject, setLocalMirrorSettings } = await import('../src/services/localMirrorSettings.js')
const { getItem } = await import('../src/composables/useStorage.js')
setLocalMirrorSettings({ defaultCreateRoot: 'D:/Projects', defaultReadRoot: 'D:/Old', enabled: false })
check('设置面只留活字段（读取位置作为死字段已撤）', getLocalMirrorSettings().defaultCreateRoot === 'D:/Projects' && !('defaultReadRoot' in getLocalMirrorSettings()))
const persisted = getItem('local_mirror_settings_v1', null)
check('落盘形状归一（enabled/customRoot/defaultCreateRoot 三键）', persisted && JSON.stringify(Object.keys(persisted).sort()) === JSON.stringify(['customRoot', 'defaultCreateRoot', 'enabled']))
setLocalMirrorSettings({ defaultCreateRoot: '' })
check('默认目录可清空（留空回落文档目录）', getLocalMirrorSettings().defaultCreateRoot === '')
await bindLocalProject('p1', null)
check('解绑走 /projects/bind 且 bookId=null', calls.at(-1)?.url === '/api/localmirror/projects/bind' && calls.at(-1)?.body?.projectId === 'p1' && calls.at(-1)?.body?.bookId === null)
await removeLocalProject('p1')
check('移除走 /projects/remove', calls.at(-1)?.url === '/api/localmirror/projects/remove' && calls.at(-1)?.body?.projectId === 'p1')


console.log('[5] browse / import-content 服务端端点（真实临时目录）')
const { createLocalMirrorService } = await import('../server/services/localMirrorService.js')
const fsMod = await import('node:fs')
const osMod = await import('node:os')
const pathMod = await import('node:path')
const projRoot = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'pinax-imp-live-'))
fsMod.mkdirSync(pathMod.join(projRoot, '正文'), { recursive: true })
fsMod.mkdirSync(pathMod.join(projRoot, '.pinax'), { recursive: true })
fsMod.writeFileSync(pathMod.join(projRoot, '.pinax', 'project.json'), '{}')
fsMod.writeFileSync(pathMod.join(projRoot, '正文', '001-第一章.md'), '回读的章节内容。')
fsMod.writeFileSync(pathMod.join(projRoot, '正文', '002-第二章.txt'), '第二章。')
const svc = createLocalMirrorService({ rootPath: projRoot })
const browse = svc.browseDirectories(osMod.tmpdir())
check('browse 列出子目录', Array.isArray(browse.directories) && browse.directories.length >= 0)
const projectBrowse = svc.browseDirectories(projRoot)
check('browse isProject 探测（.pinax 在场）', projectBrowse.isProject === true)
const content = svc.readProjectChapters(projRoot)
check('readProjectChapters 回读 2 章（文件名=章节名，序号剥除）', content.chapters.length === 2 && content.chapters[0].title === '第一章' && content.chapters[0].content === '回读的章节内容。')
let browseErr = ''
try { svc.browseDirectories('relative/path') } catch (e) { browseErr = e.code }
check('相对路径 → ERR_INVALID_INPUT', browseErr === 'ERR_INVALID_INPUT')
fsMod.rmSync(projRoot, { recursive: true, force: true })

console.log(`local-import-check: ${passed} 项全部通过`)
