<script setup>
/**
 * 本地化中心（W6·C 全量本地化）：浏览器状态湮灭与文件恢复的总览面。
 *
 * - 键裁定总览：LOCALIZATION_KEY_PLAN 三类逐键裁定（file-source / cache-droppable / browser-only）；
 * - 快照与恢复计划：collectBrowserState + buildRestorePlan（A3 口径：文件优先 + revision 仲裁）；
 * - 「从文件恢复」：书（GET /api/localmirror/book → writingBooksRepository）与资料归档
 *   （GET /api/localmirror/sources → restoreSourceArchiveRecords）；世界书域由 worldStore
 *   A3 文件优先自动接管，此处只展示；
 * - 「湮灭浏览器缓存」：两步确认（第二步输入书名），只清计划批准的键——安全敏感项
 *   （模型 key / provider 配置）永不沾；
 * - 「补推到文件」：浏览器有而文件无的域，组装 sync 载荷（含会话与归档）推送。
 */
import { computed, onMounted, ref } from 'vue'
import { tr } from '../../i18n/index.js'
import {
  annihilateBrowserCache,
  buildArchivePushPayload,
  buildRestorePlan,
  buildSessionsPushPayload,
  collectBrowserState,
  summarizeKeyPlan
} from '../../services/localization/localizationService.js'
import { loadWritingBooks, saveWritingBooksDurable } from '../../services/writing/writingBooksRepository.js'
import { getItem, STORAGE_KEYS } from '../../composables/useStorage.js'
import {
  loadAllSourceArchiveRecords,
  replaceAllSourceArchiveRecords,
  restoreSourceArchiveRecords
} from '../../services/worldbook/worldbookSourceArchive.js'

const keyPlan = summarizeKeyPlan()
const projects = ref([])
const mirrorRoot = ref('')
const scanning = ref(false)
const restoring = ref(false)
const pushing = ref(false)
const snapshot = ref(null)
const plan = ref(null)
const serverNote = ref('')
const resultNote = ref('')
const annihilateArmed = ref(false)
const annihilateConfirmText = ref('')
const annihilateResult = ref(null)

const boundProject = computed(() => projects.value.find((project) => project?.bookId && project?.rootPath) || null)
const confirmTitle = computed(() => {
  const books = (() => { try { return loadWritingBooks() } catch { return [] } })()
  const title = boundProject.value?.name || books.find((book) => book?.title)?.title || ''
  return String(title || 'PINAX').trim()
})
const annihilateInputOk = computed(() => annihilateConfirmText.value.trim() === confirmTitle.value)
const fileDomainActions = computed(() => (plan.value?.actions || []).filter((action) => action.domain !== 'cache' && action.domain !== 'browser-only' && action.domain !== 'unknown'))

async function fetchJson(url, options) {
  const response = await fetch(url, options)
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.ok !== true) {
    throw Object.assign(new Error(body?.message || `HTTP ${response.status}`), { status: response.status })
  }
  return body
}

async function buildServerState() {
  const state = { books: { available: false, book: null }, worldbook: { available: false, worldbook: null }, sourceArchive: { available: false, sources: [] } }
  if (!boundProject.value) {
    serverNote.value = tr('还没有绑定书的项目文件夹——先在首页书卡绑定本地项目，才能从文件恢复。')
    return state
  }
  serverNote.value = ''
  const root = boundProject.value.rootPath
  try {
    const body = await fetchJson(`/api/localmirror/book?path=${encodeURIComponent(root)}`)
    state.books = { available: true, book: body.book }
  } catch (error) {
    serverNote.value = tr('书读回失败：{message}', { message: error.message })
  }
  try {
    const body = await fetchJson(`/api/localmirror/worldbook?path=${encodeURIComponent(root)}`)
    const count = Array.isArray(body.worldbook?.entries) ? body.worldbook.entries.length : 0
    state.worldbook = { available: count > 0, worldbook: body.worldbook, warnings: body.warnings || [] }
  } catch { /* 世界书文件缺失按不可用处理 */ }
  try {
    const body = await fetchJson(`/api/localmirror/sources?path=${encodeURIComponent(root)}`)
    state.sourceArchive = { available: Array.isArray(body.sources) && body.sources.length > 0, sources: body.sources || [] }
  } catch { /* 归档缺失按不可用处理 */ }
  return state
}

async function rescan() {
  scanning.value = true
  resultNote.value = ''
  annihilateResult.value = null
  try {
    let idbUsage = null
    try {
      const archive = await loadAllSourceArchiveRecords()
      idbUsage = { '@idb:pinax-source-archive': { exists: archive.artifacts.length + archive.chunks.length > 0, bytes: 0 } }
    } catch { /* IndexedDB 不可用时快照只含 localStorage */ }
    const nextSnapshot = collectBrowserState({ idbUsage })
    const serverState = await buildServerState()
    snapshot.value = nextSnapshot
    plan.value = buildRestorePlan(nextSnapshot, serverState)
  } catch (error) {
    resultNote.value = tr('扫描失败：{message}', { message: error.message })
  } finally {
    scanning.value = false
  }
}

function fileBookToWritingBook(fileBook, existing) {
  const nowIso = new Date().toISOString()
  return {
    id: String(fileBook.id),
    title: String(fileBook.title || existing?.title || fileBook.id),
    ...(existing?.manuscriptLanguage ? { manuscriptLanguage: existing.manuscriptLanguage } : {}),
    description: String(existing?.description || ''),
    worldbookId: String(existing?.worldbookId || ''),
    createdAt: existing?.createdAt || fileBook.createdAt || nowIso,
    updatedAt: nowIso,
    projectRoot: fileBook.projectRoot || existing?.projectRoot || '',
    outlineNodes: Array.isArray(fileBook.outline?.nodes) ? fileBook.outline.nodes : (Array.isArray(existing?.outlineNodes) ? existing.outlineNodes : []),
    outlineEdges: Array.isArray(fileBook.outline?.edges) ? fileBook.outline.edges : (Array.isArray(existing?.outlineEdges) ? existing.outlineEdges : []),
    explorationDocuments: (Array.isArray(fileBook.explorations) ? fileBook.explorations : []).map((doc) => ({
      id: String(doc.id || doc.title || '构思'),
      title: String(doc.title || '未命名构思'),
      content: String(doc.content || '')
    })),
    chapters: (Array.isArray(fileBook.chapters) ? fileBook.chapters : []).map((chapter, index) => ({
      id: existing?.chapters?.[index]?.id || `ch_${fileBook.id}_${index + 1}`,
      title: String(chapter.title || `章节 ${index + 1}`),
      content: String(chapter.content || ''),
      wordCount: String(chapter.content || '').length,
      updatedAt: nowIso
    }))
  }
}

async function restoreFromFiles() {
  restoring.value = true
  resultNote.value = ''
  try {
    const notes = []
    const planValue = plan.value
    if (!planValue) await rescan()
    const booksAction = (plan.value?.actions || []).find((action) => action.domain === 'books')
    if (booksAction?.type === 'restore-from-files') {
      const body = await fetchJson(`/api/localmirror/book?path=${encodeURIComponent(boundProject.value.rootPath)}`)
      if (body.book?.id) {
        const books = loadWritingBooks()
        const existing = books.find((book) => String(book.id) === String(body.book.id)) || null
        const restored = fileBookToWritingBook(body.book, existing)
        const merged = existing
          ? books.map((book) => (String(book.id) === String(restored.id) ? restored : book))
          : [...books, restored]
        const persisted = saveWritingBooksDurable(merged)
        notes.push(persisted.ok
          ? tr('书已从文件恢复（{count} 章）。', { count: restored.chapters.length })
          : tr('书恢复写入失败：{reason}', { reason: persisted.reason || 'unknown' }))
      }
    }
    const archiveAction = (plan.value?.actions || []).find((action) => action.domain === 'source-archive')
    if (archiveAction?.type === 'restore-from-files') {
      const body = await fetchJson(`/api/localmirror/sources?path=${encodeURIComponent(boundProject.value.rootPath)}`)
      const artifacts = (body.sources || []).map((source) => source.meta).filter((meta) => meta && typeof meta === 'object')
      const chunks = (body.sources || []).flatMap((source) => (Array.isArray(source.chunks) ? source.chunks : []))
      const result = await restoreSourceArchiveRecords({ artifacts, chunks })
      notes.push(tr('资料归档已还原（{artifacts} 份来源 / {chunks} 个 chunk）。', { artifacts: result.written.artifacts, chunks: result.written.chunks }))
    }
    const worldbookAction = (plan.value?.actions || []).find((action) => action.domain === 'worldbook')
    if (worldbookAction?.type === 'restore-from-files') {
      notes.push(tr('世界书由文件优先加载自动接管——重新打开设定页即见文件版。'))
    }
    resultNote.value = notes.length ? notes.join(' ') : tr('当前计划没有可从文件恢复的域。')
    await rescan()
  } catch (error) {
    resultNote.value = tr('恢复失败：{message}', { message: error.message })
  } finally {
    restoring.value = false
  }
}

async function pushPendingToFiles() {
  pushing.value = true
  resultNote.value = ''
  try {
    const books = loadWritingBooks()
    if (!books.length) {
      resultNote.value = tr('浏览器里没有书可补推。')
      return
    }
    const [{ buildBookMirrorPayload }] = await Promise.all([import('../../services/localMirrorService.js')])
    let payload = null
    for (const book of books) {
      payload = await buildBookMirrorPayload(book)
      payload.sessions = buildSessionsPushPayload(getItem(STORAGE_KEYS.WRITING_SESSIONS, []))
      payload.sourceArchive = buildArchivePushPayload(await loadAllSourceArchiveRecords())
      await fetchJson('/api/localmirror/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    }
    resultNote.value = tr('已补推到文件（含会话与资料归档）。')
    await rescan()
  } catch (error) {
    resultNote.value = tr('补推失败：{message}', { message: error.message })
  } finally {
    pushing.value = false
  }
}

function armAnnihilate() {
  annihilateArmed.value = true
  annihilateConfirmText.value = ''
  annihilateResult.value = null
}

function disarmAnnihilate() {
  annihilateArmed.value = false
  annihilateConfirmText.value = ''
}

async function runAnnihilate() {
  if (!annihilateInputOk.value || !plan.value) return
  try {
    const result = annihilateBrowserCache(plan.value, {
      clearners: { '@idb:pinax-source-archive': () => replaceAllSourceArchiveRecords({}) }
    })
    annihilateResult.value = {
      cleared: result.cleared.length + result.idbCleared.length,
      kept: result.kept.length,
      refused: result.refused.length,
      idbSkipped: result.idbSkipped.length,
      detail: tr('已清 {cleared} 键；保留 {kept}（无对应数据）；拒绝 {refused}（保留裁定）；跳过 {skipped}（无清理器）。', { cleared: result.cleared.length + result.idbCleared.length, kept: result.kept.length, refused: result.refused.length, skipped: result.idbSkipped.length })
    }
    disarmAnnihilate()
    await rescan()
  } catch (error) {
    annihilateResult.value = { detail: tr('湮灭失败：{message}', { message: error.message }) }
  }
}

onMounted(async () => {
  try {
    const location = await fetchJson('/api/localmirror/location')
    mirrorRoot.value = location.root || ''
  } catch { /* 服务未起时展示离线态 */ }
  try {
    const body = await fetchJson('/api/localmirror/projects')
    projects.value = Array.isArray(body.projects) ? body.projects : []
  } catch { /* 注册表不可达 */ }
  await rescan()
})
</script>

<template>
  <section class="localization-center" data-test="localization-center">
    <header class="localization-head">
      <div class="localization-heading">
        <h2>{{ tr('本地化中心') }}</h2>
        <p>{{ tr('数据真源在本地项目文件夹：浏览器侧只是可丢缓存。换浏览器或清空存储后，从文件即可完整恢复。') }}</p>
      </div>
      <div class="localization-actions">
        <button type="button" class="control-secondary" data-test="localization-scan" :disabled="scanning" @click="rescan">{{ scanning ? tr('扫描中…') : tr('重新扫描') }}</button>
        <button type="button" class="control-secondary" data-test="localization-restore" :disabled="restoring || !plan" @click="restoreFromFiles">{{ restoring ? tr('恢复中…') : tr('从文件恢复') }}</button>
        <button
          v-if="!annihilateArmed"
          type="button"
          class="control-danger"
          data-test="localization-annihilate-arm"
          :disabled="!plan"
          @click="armAnnihilate"
        >{{ tr('湮灭浏览器缓存') }}</button>
      </div>
    </header>

    <p v-if="mirrorRoot" class="localization-note" role="status">{{ tr('项目根目录：{root}', { root: mirrorRoot }) }}</p>
    <p v-if="serverNote" class="localization-note" role="status" data-test="localization-server-note">{{ serverNote }}</p>
    <p v-if="resultNote" class="localization-note" role="status" data-test="localization-result-note">{{ resultNote }}</p>

    <div v-if="annihilateArmed" class="localization-annihilate" data-test="localization-annihilate-confirm">
      <p class="localization-annihilate-warning">
        {{ tr('即将清除浏览器侧缓存：文件真源域会在恢复后清除，可丢缓存直接清除；安全敏感项（模型 key 等）与未文件化数据永不清除。此操作不可撤销，请先确认文件侧已是最新（必要时先「补推到文件」）。') }}
      </p>
      <div class="localization-annihilate-row">
        <label class="localization-annihilate-field">
          <span>{{ tr('输入书名「{title}」以确认', { title: confirmTitle }) }}</span>
          <input
            v-model.trim="annihilateConfirmText"
            type="text"
            :placeholder="confirmTitle"
            data-test="localization-annihilate-input"
            spellcheck="false"
          />
        </label>
        <button type="button" class="control-danger" data-test="localization-annihilate-run" :disabled="!annihilateInputOk" @click="runAnnihilate">{{ tr('确认湮灭') }}</button>
        <button type="button" class="control-quiet" @click="disarmAnnihilate">{{ tr('取消') }}</button>
      </div>
    </div>

    <p v-if="annihilateResult" class="localization-note" role="status" data-test="localization-annihilate-result">{{ annihilateResult.detail }}</p>

    <div v-if="plan" class="localization-plan" data-test="localization-plan-list">
      <h3>{{ tr('恢复计划') }}</h3>
      <ul class="localization-plan-list">
        <li v-for="action in fileDomainActions" :key="action.domain" class="localization-plan-row">
          <span class="localization-badge" :class="`localization-badge-${action.type}`">{{ action.type === 'restore-from-files' ? tr('从文件拉') : action.type === 'keep-browser' ? (action.pushPending ? tr('保留浏览器·待补推') : tr('保留浏览器')) : tr('空') }}</span>
          <span class="localization-plan-domain">{{ action.domain }}</span>
          <span class="localization-plan-note">{{ action.note }}</span>
        </li>
      </ul>
      <button
        v-if="plan.summary.pushPendingDomains.length"
        type="button"
        class="control-secondary"
        data-test="localization-push"
        :disabled="pushing"
        @click="pushPendingToFiles"
      >{{ pushing ? tr('补推中…') : tr('补推到文件') }}</button>
    </div>

    <div class="localization-keyplan" data-test="localization-keyplan">
      <h3>{{ tr('键裁定总览') }}</h3>
      <div class="localization-keyplan-groups">
        <details v-for="group in keyPlan.categories" :key="group.category" class="localization-keyplan-group">
          <summary>
            <span class="localization-badge" :class="`localization-badge-${group.category}`">{{ group.count }}</span>
            <strong>{{ group.category === 'file-source' ? tr('文件真源（可恢复）') : group.category === 'cache-droppable' ? tr('可丢缓存（湮灭清除）') : tr('浏览器保留（含敏感项）') }}</strong>
            <span v-if="group.sensitiveCount" class="localization-sensitive-count">{{ tr('安全敏感 {count} 键', { count: group.sensitiveCount }) }}</span>
          </summary>
          <ul class="localization-keyplan-list">
            <li v-for="entry in group.entries" :key="entry.key">
              <code>{{ entry.key }}</code>
              <span class="localization-keyplan-reason">{{ entry.reason }}</span>
            </li>
          </ul>
        </details>
      </div>
    </div>

    <p v-if="snapshot" class="localization-snapshot" data-test="localization-snapshot" role="status">
      {{ tr('快照：{keys} 键 / {bytes} 字节（未裁定 {unknown} 键，保守保留）', { keys: snapshot.totals.keys, bytes: snapshot.totals.bytes, unknown: snapshot.totals.unknownKeys }) }}
    </p>
  </section>
</template>

<style scoped>
.localization-center {
  display: grid;
  gap: 14px;
  padding: 24px clamp(20px, 3vw, 48px) 32px;
  background: var(--surface-workbench);
  border-top: 1px solid var(--hairline-soft, var(--border));
}

.localization-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
.localization-heading h2 { margin: 0; font-size: 18px; font-weight: 500; color: var(--text-primary); }
.localization-heading p { margin: 8px 0 0; font-size: 13px; line-height: 1.7; color: var(--text-secondary); max-width: 68ch; }
.localization-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; flex-wrap: wrap; }

.localization-note { margin: 0; font-size: 13px; line-height: 1.6; color: var(--text-secondary); }

.localization-annihilate { display: grid; gap: 12px; padding: 14px 16px; border: 1px solid color-mix(in srgb, var(--danger, #c3484d) 35%, transparent); border-radius: var(--radius-control, 12px); background: color-mix(in srgb, var(--danger, #c3484d) 6%, transparent); }
.localization-annihilate-warning { margin: 0; font-size: 13px; line-height: 1.7; color: var(--text-primary); }
.localization-annihilate-row { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.localization-annihilate-field { display: grid; gap: 6px; font-size: 13px; color: var(--text-secondary); }
.localization-annihilate-field input { box-sizing: border-box; min-height: 38px; min-width: 220px; border: 1px solid var(--hairline-soft, var(--border)); border-radius: var(--radius-control, 12px); padding: 8px 12px; color: var(--text-primary); background: var(--surface-workbench-input, var(--bg-secondary)); font: inherit; }

.localization-plan h3, .localization-keyplan h3 { margin: 6px 0 10px; font-size: 14px; font-weight: 500; color: var(--text-primary); }
.localization-plan-list { display: grid; gap: 8px; margin: 0 0 12px; padding: 0; list-style: none; }
.localization-plan-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; font-size: 13px; }
.localization-plan-domain { min-width: 96px; color: var(--text-primary); font-weight: 500; }
.localization-plan-note { color: var(--text-secondary); line-height: 1.6; }

.localization-badge { display: inline-block; min-width: 20px; padding: 2px 8px; border-radius: 999px; font-size: 12px; text-align: center; background: color-mix(in srgb, var(--archive-ink, #333) 7%, transparent); color: var(--text-secondary); }
.localization-badge-restore-from-files { background: color-mix(in srgb, var(--accent, #4a7dbe) 14%, transparent); color: var(--accent, var(--text-primary)); }
.localization-badge-clear-cache { background: color-mix(in srgb, var(--warning, #b37213) 14%, transparent); color: var(--warning, var(--text-secondary)); }
.localization-badge-keep-browser { background: color-mix(in srgb, var(--archive-ink, #333) 8%, transparent); color: var(--text-secondary); }

.localization-keyplan-groups { display: grid; gap: 8px; }
.localization-keyplan-group summary { display: flex; align-items: center; gap: 10px; padding: 8px 0; cursor: pointer; font-size: 13px; color: var(--text-primary); }
.localization-keyplan-group summary::marker { color: var(--text-muted); }
.localization-sensitive-count { font-size: 12px; color: var(--warning, var(--text-muted)); }
.localization-keyplan-list { display: grid; gap: 6px; margin: 0 0 8px; padding: 0 0 0 12px; list-style: none; }
.localization-keyplan-list li { display: grid; gap: 2px; font-size: 12.5px; }
.localization-keyplan-list code { color: var(--text-primary); font-size: 12px; }
.localization-keyplan-reason { color: var(--text-muted); line-height: 1.6; }

.localization-snapshot { margin: 0; font-size: 12.5px; color: var(--text-muted); }

@media (max-width: 760px) {
  .localization-head { flex-direction: column; }
  .localization-annihilate-row { align-items: stretch; }
  .localization-annihilate-field input { min-width: 0; width: 100%; }
}
</style>
