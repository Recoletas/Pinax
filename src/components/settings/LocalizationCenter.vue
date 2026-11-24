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
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { tr } from '../../i18n/index.js'
import {
  annihilateBrowserCache,
  fileBookToWritingBook,
  readReviewedShelfForRestore,
  buildRestorePlan,
  buildSessionsPushPayload,
  collectBrowserState,
  summarizeKeyPlan
} from '../../services/localization/localizationService.js'
import { loadWritingBooks, saveWritingBooksDurable } from '../../services/writing/writingBooksRepository.js'
import { getItem, STORAGE_KEYS } from '../../composables/useStorage.js'
import {
  countSourceArchiveRecords,
  loadSourceArtifacts,
  loadSourceChunks,
  restoreSourceArchiveRecords
} from '../../services/worldbook/worldbookSourceArchive.js'

import { withWritingBooksLock } from '../../services/storage/writingBooksLock.js'
import { getMirrorReceipt, updateMirrorReceipt } from '../../services/localMirrorSettings.js'

const mirrorUpdates = ref(0)
const refreshMirrorStatus = () => { mirrorUpdates.value++ }
onMounted(() => window.addEventListener('pinax-mirror-receipt', refreshMirrorStatus))
onUnmounted(() => window.removeEventListener('pinax-mirror-receipt', refreshMirrorStatus))
const keyPlan = summarizeKeyPlan()
const projects = ref([])
const mirrorRoot = ref('')
const scanning = ref(false)
const restoring = ref(false)
const pushing = ref(false)
const snapshot = shallowRef(null)
const plan = shallowRef(null)
const armedPlan = shallowRef(null)
const cleaning = ref(false)
const serverNote = ref('')
const resultNote = ref('')
const annihilateArmed = ref(false)
const annihilateConfirmText = ref('')
const annihilateResult = ref(null)

const boundProject = computed(() => projects.value.find((project) => project?.bookId && project?.rootPath) || null)
const mirrorIssues = computed(() => {
  void mirrorUpdates.value
  return projects.value.flatMap(project => {
    const { message } = getMirrorReceipt(project.projectId, project.bookId)
    return message ? [project.name + ' · ' + project.rootPath + ' · ' + message] : []
  })
})
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

async function buildServerState({ includeSources = true } = {}) {
  const project = boundProject.value
  const state = { canLock: typeof navigator.locks?.request === 'function', bookId: project?.bookId || '', projectRoot: project?.rootPath || '', books: { available: false, book: null }, worldbook: { available: false, worldbook: null }, sourceArchive: { available: false, sources: [] } }
  if (!boundProject.value) {
    serverNote.value = tr('还没有绑定书的项目文件夹——先在首页书卡绑定本地项目，才能从文件恢复。')
    return state
  }
  serverNote.value = ''
  const root = boundProject.value.rootPath
  try {
    const body = await fetchJson(`/api/localmirror/book?path=${encodeURIComponent(root)}`)
    state.books = { available: true, book: body.book, incompleteOutline: body.incompleteOutline, warnings: body.warnings }
  } catch (error) {
    state.books.readError = true
    serverNote.value = tr('书读回失败：{message}', { message: error.localizationMessage ? tr(error.localizationMessage) : error.message })
  }
  try {
    const body = await fetchJson(`/api/localmirror/worldbook?path=${encodeURIComponent(root)}`)
    const count = Array.isArray(body.worldbook?.entries) ? body.worldbook.entries.length : 0
    state.worldbook = { available: count > 0, worldbook: body.worldbook, warnings: body.warnings || [] }
  } catch { state.worldbook.readError = true }
  if (!includeSources) return state
  try {
    const body = await fetchJson(`/api/localmirror/sources?path=${encodeURIComponent(root)}`)
    state.sourceArchive = { available: Array.isArray(body.sources) && body.sources.length > 0, sources: body.sources || [] }
  } catch { /* 归档缺失按不可用处理 */ }
  return state
}

async function rescan() {
  scanning.value = true
  disarmAnnihilate()
  try {
    let idbUsage = null
    try {
      const archive = await countSourceArchiveRecords()
      idbUsage = { '@idb:pinax-source-archive': { exists: archive.artifacts + archive.chunks + archive.workspaces > 0, bytes: 0 } }
    } catch { /* IndexedDB 不可用时快照只含 localStorage */ }
    const nextSnapshot = collectBrowserState({ idbUsage })
    const serverState = await buildServerState()
    snapshot.value = nextSnapshot
    plan.value = buildRestorePlan(nextSnapshot, serverState)
  } catch (error) {
    resultNote.value = tr('扫描失败：{message}', { message: error.localizationMessage ? tr(error.localizationMessage) : error.message })
  } finally {
    scanning.value = false
  }
}

async function restoreFromFiles() {
  restoring.value = true
  resultNote.value = ''
  try {
    const notes = []
    if (!plan.value) await rescan()
    const reviewed = plan.value
    const booksAction = (reviewed?.actions || []).find((action) => action.domain === 'books')
    if (booksAction?.type === 'restore-from-files') {
      const project = boundProject.value
      const { epoch } = getMirrorReceipt(project.projectId, project.bookId)
      const body = await fetchJson(`/api/localmirror/book?path=${encodeURIComponent(project.rootPath)}`)
      if (body.incompleteOutline || body.warnings?.length) throw new Error(tr('作品文件未完整读取，请先修复文件后恢复。'))
      if (!body.book?.id || String(body.book.id) !== String(project.bookId)) throw new Error(tr('目录绑定的作品已变化，请重新扫描。'))
      await withWritingBooksLock(() => {
        if (getMirrorReceipt(project.projectId, project.bookId).epoch !== epoch) throw new Error(tr('书架已从备份恢复，请重新读回项目文件。'))
        const books = readReviewedShelfForRestore(reviewed)
        const existing = books.find((book) => book && String(book.id) === String(body.book.id)) || null
        const restored = fileBookToWritingBook(body.book, existing)
        const merged = existing
          ? books.map((book) => (book && String(book.id) === String(restored.id) ? restored : book))
          : [...books, restored]
        const persisted = saveWritingBooksDurable(merged)
        if (persisted.ok && Number.isSafeInteger(body.mirrorRevision)) {
          updateMirrorReceipt(project.projectId, restored.id, { bookRevision: body.mirrorRevision, bookFingerprint: body.bookFingerprint }, epoch)
        }
        notes.push(persisted.ok
          ? tr('书已从文件恢复（{count} 章）。', { count: restored.chapters.length })
          : tr('书恢复写入失败：{reason}', { reason: persisted.reason || 'unknown' }))
      })
    }
    const archiveAction = (reviewed?.actions || []).find((action) => action.domain === 'source-archive')
    if (archiveAction?.type === 'restore-from-files') {
      const body = await fetchJson(`/api/localmirror/sources?path=${encodeURIComponent(boundProject.value.rootPath)}`)
      const artifacts = (body.sources || []).map((source) => source.meta).filter((meta) => meta && typeof meta === 'object')
      const chunks = (body.sources || []).flatMap((source) => (Array.isArray(source.chunks) ? source.chunks : []))
      if (body.warnings?.length) throw new Error(tr('归档文件未完整读取，请先修复文件后恢复。'))
      const expected = { artifacts: new Map(), chunks: new Map(), workspaces: new Map() }
      for (const [store, rows] of Object.entries({ artifacts, chunks })) {
        // Writing identical rows is safe. Any differing local record aborts
        // the transaction, including an edit between comparing and committing.
        for (const row of rows) {
          if (!row?.id) throw new Error(tr('归档记录缺少标识。'))
          expected[store].set(row.id, row)
        }
      }
      const [currentArtifacts, currentChunks] = await Promise.all([
        loadSourceArtifacts([...expected.artifacts.keys()]), loadSourceChunks([...expected.chunks.keys()])
      ])
      const current = { artifacts: currentArtifacts, chunks: currentChunks }
      for (const store of ['artifacts', 'chunks']) {
        const existing = new Set(current[store].map(record => record.id))
        for (const key of expected[store].keys()) if (!existing.has(key)) expected[store].delete(key)
      }
      const result = await restoreSourceArchiveRecords({ artifacts, chunks }, { expected })
      notes.push(tr('资料归档已还原（{artifacts} 份来源 / {chunks} 个 chunk）。', { artifacts: result.written.artifacts, chunks: result.written.chunks }))
    }
    const worldbookAction = (plan.value?.actions || []).find((action) => action.domain === 'worldbook')
    if (worldbookAction?.type === 'restore-from-files') {
      notes.push(tr('世界书由文件优先加载自动接管——重新打开设定页即见文件版。'))
    }
    resultNote.value = notes.length ? notes.join(' ') : tr('当前计划没有可从文件恢复的域。')
    await rescan()
  } catch (error) {
    resultNote.value = tr('恢复失败：{message}', { message: error.localizationMessage ? tr(error.localizationMessage) : error.message })
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
    const { syncBookLocalMirror } = await import('../../services/localMirrorService.js')
    const project = boundProject.value
    const book = books.find(item => String(item.id) === String(project?.bookId))
    if (!book) throw new Error('请先为作品绑定本地项目目录')
    const sessions = getItem(STORAGE_KEYS.WRITING_SESSIONS, [])
    await syncBookLocalMirror(book.id, { binding: project, extras: () => ({
      sessions: buildSessionsPushPayload(sessions, book, books)
    }) })
    resultNote.value = tr('已补推到文件（含会话与资料归档）。')
    await rescan()
  } catch (error) {
    resultNote.value = tr('补推失败：{message}', { message: error.localizationMessage ? tr(error.localizationMessage) : error.message })
  } finally {
    pushing.value = false
  }
}

function armAnnihilate() {
  armedPlan.value = plan.value
  annihilateArmed.value = true
  annihilateConfirmText.value = ''
  annihilateResult.value = null
}

function disarmAnnihilate() {
  armedPlan.value = null
  annihilateArmed.value = false
  annihilateConfirmText.value = ''
}

async function runAnnihilate() {
  const reviewed = armedPlan.value
  if (!annihilateInputOk.value || !reviewed || cleaning.value) return
  cleaning.value = true
  try {
    const freshFiles = await buildServerState({ includeSources: false })
    const result = await withWritingBooksLock(() => {
      if (armedPlan.value !== reviewed) throw new Error(tr('清理计划已变化，请重新确认。'))
      const currentPlan = buildRestorePlan(collectBrowserState(), freshFiles)
      return annihilateBrowserCache(reviewed, { currentPlan })
    })
    disarmAnnihilate()
    await rescan()
    annihilateResult.value = { detail: tr('已清理 {cleared} 项，{kept} 项此前已移除，{refused} 项因内容或文件状态变化而保留。', {
      cleared: result.cleared.length, kept: result.kept.length, refused: result.refused.length
    }) }
  } catch (error) {
    annihilateResult.value = { detail: tr('湮灭失败：{message}', { message: error.localizationMessage ? tr(error.localizationMessage) : error.message }) }
  } finally {
    cleaning.value = false
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
        <p>{{ tr('核对当前项目的文件副本后可清理临时缓存。完整书架和共享资料可在「备份与恢复」中导出。') }}</p>
      </div>
      <div class="localization-actions">
        <button type="button" class="control-secondary" data-test="localization-scan" :disabled="scanning || restoring || pushing || cleaning" @click="rescan">{{ scanning ? tr('扫描中…') : tr('重新扫描') }}</button>
        <button type="button" class="control-secondary" data-test="localization-restore" :disabled="scanning || restoring || pushing || cleaning || !plan" @click="restoreFromFiles">{{ restoring ? tr('恢复中…') : tr('从文件恢复') }}</button>
        <button
          v-if="!annihilateArmed"
          type="button"
          class="control-danger"
          data-test="localization-annihilate-arm"
          :disabled="scanning || restoring || pushing || cleaning || !plan?.summary.clearKeyCount"
          @click="armAnnihilate"
        >{{ tr('湮灭浏览器缓存') }}</button>
      </div>
    </header>

    <p v-if="mirrorRoot" class="localization-note" role="status">{{ tr('项目根目录：{root}', { root: mirrorRoot }) }}</p>
    <p v-if="serverNote" class="localization-note" role="status" data-test="localization-server-note">{{ serverNote }}</p>
    <p v-for="issue in mirrorIssues" :key="issue" class="localization-note" role="status">{{ tr('文件待同步') }} · {{ issue }}</p>
    <p v-if="resultNote" class="localization-note" role="status" data-test="localization-result-note">{{ resultNote }}</p>

    <div v-if="annihilateArmed" class="localization-annihilate" data-test="localization-annihilate-confirm">
      <p class="localization-annihilate-warning">
        {{ tr('将清理 {count} 项。确认时会重新核对文件和本机内容，保留其他作品、共享资料和预览后的编辑。', { count: armedPlan?.summary.clearKeyCount || 0 }) }}
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
        <button type="button" class="control-danger" data-test="localization-annihilate-run" :disabled="cleaning || !annihilateInputOk" @click="runAnnihilate">{{ tr('确认湮灭') }}</button>
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
          <span class="localization-plan-note">{{ tr(action.note, action.noteArgs) }}</span>
        </li>
      </ul>
      <button
        v-if="plan.summary.pushPendingDomains.length"
        type="button"
        class="control-secondary"
        data-test="localization-push"
        :disabled="scanning || restoring || pushing || cleaning"
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
              <span class="localization-keyplan-reason">{{ tr(entry.reason) }}</span>
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
