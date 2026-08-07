<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { marked } from 'marked'
import { sanitizeHtml } from '../../utils/sanitize'
import { useDocsViewer } from '../../composables/useDocsViewer'
import { useSettingsPopup } from '../../composables/useSettingsPopup'
import { useTransientLayer } from '../../composables/useTransientLayer'
import { useRoute } from 'vue-router'

const docs = useDocsViewer()
const settingsPopup = useSettingsPopup()
const route = useRoute()

const LAYER_ID = 'docs-viewer'
const closeButtonRef = ref(null)

const manifest = ref(null)
const manifestError = ref(null)
const chapterBody = ref('')
const chapterError = ref(null)
const chapterLoading = ref(false)
const fetchToken = ref(0)

const currentChapterId = computed(() => docs.chapter.value)

const currentChapter = computed(() => {
  if (!manifest.value) return null
  return manifest.value.chapters.find((c) => c.id === currentChapterId.value) || null
})

const sanitizedHtml = computed(() => {
  if (!chapterBody.value) return ''
  // marked@18 returns string by default; configure is also safe.
  const html = marked.parse(chapterBody.value, { async: false })
  return sanitizeHtml(html)
})

useTransientLayer({
  id: LAYER_ID,
  isOpen: docs.isOpen,
  onClose: () => docs.close(),
  initialFocus: () => closeButtonRef.value,
  returnFocus: null,
  exclusive: true
})

async function loadManifest() {
  if (manifest.value) return
  try {
    const res = await fetch('/docs/user-manual/manifest.json')
    if (!res.ok) throw new Error(`manifest ${res.status}`)
    manifest.value = await res.json()
    manifestError.value = null
  } catch (e) {
    manifestError.value = e?.message || String(e)
  }
}

async function loadChapter(chapterId) {
  const meta = manifest.value?.chapters.find((c) => c.id === chapterId)
  if (!meta) return
  const token = ++fetchToken.value
  chapterLoading.value = true
  chapterError.value = null
  try {
    const res = await fetch(`/docs/user-manual/${meta.file}`)
    if (!res.ok) throw new Error(`${meta.file} ${res.status}`)
    const text = await res.text()
    if (token !== fetchToken.value) return  // stale
    chapterBody.value = text
  } catch (e) {
    if (token !== fetchToken.value) return
    chapterError.value = e?.message || String(e)
  } finally {
    if (token === fetchToken.value) chapterLoading.value = false
  }
}

function selectChapter(chapterId) {
  if (chapterId === currentChapterId.value) return
  docs.open(chapterId)
}

function retryChapter() {
  if (currentChapterId.value) loadChapter(currentChapterId.value)
}

function retryManifest() {
  manifest.value = null
  manifestError.value = null
  loadManifest()
}

// 路由切换自动关闭（避免跨页时残留 modal）
watch(() => route.fullPath, () => {
  if (docs.isOpen.value) docs.close()
})

watch(currentChapterId, (id) => {
  if (!id || !manifest.value) return
  loadChapter(id)
  nextTick(() => {
    const body = document.querySelector('.docs-viewer__body')
    if (body) body.scrollTop = 0
  })
})

watch(() => docs.isOpen.value, async (open) => {
  if (open) {
    await loadManifest()
    await loadChapter(currentChapterId.value)
  } else {
    fetchToken.value++
    chapterBody.value = ''
    chapterError.value = null
  }
})

onMounted(() => {
  // 立即预拉 manifest, 缩短首次打开的等待
  loadManifest()
})

onBeforeUnmount(() => {
  fetchToken.value++
})

// 防止 SettingsPopup 打开时 DocsViewer 抢占焦点
watch(() => settingsPopup.isOpen.value, (open) => {
  if (open && docs.isOpen.value) docs.close()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="docs-layer">
      <div
        v-if="docs.isOpen.value"
        class="docs-viewer"
        role="dialog"
        aria-modal="true"
        aria-label="Pinax 文档"
        data-test="docs-viewer"
      >
        <button
          class="docs-viewer__backdrop"
          type="button"
          aria-label="关闭文档"
          @click="docs.close()"
        />

        <div class="docs-viewer__panel" :data-test="`docs-viewer-panel`">
          <header class="docs-viewer__head">
            <div class="docs-viewer__title">
              <span class="docs-viewer__kicker">Pinax · 用户手册</span>
              <strong>{{ currentChapter?.title || '导言' }}</strong>
            </div>
            <button
              ref="closeButtonRef"
              class="docs-viewer__close"
              type="button"
              aria-label="关闭"
              data-test="docs-viewer-close"
              @click="docs.close()"
            >×</button>
          </header>

          <div class="docs-viewer__layout">
            <nav class="docs-viewer__sidebar" aria-label="章节">
              <p
                v-if="manifestError"
                class="docs-viewer__sidebar-error"
                role="alert"
              >
                章节列表加载失败
                <button type="button" class="docs-viewer__retry" @click="retryManifest">重试</button>
              </p>
              <ol v-else-if="manifest" class="docs-viewer__chapter-list">
                <li
                  v-for="ch in manifest.chapters"
                  :key="ch.id"
                  class="docs-viewer__chapter"
                  :class="{ 'is-active': ch.id === currentChapterId }"
                >
                  <button
                    type="button"
                    class="docs-viewer__chapter-btn"
                    :aria-current="ch.id === currentChapterId ? 'page' : 'false'"
                    :data-test="`docs-chapter-${ch.id}`"
                    @click="selectChapter(ch.id)"
                  >
                    <span class="docs-viewer__chapter-title">{{ ch.title }}</span>
                    <span class="docs-viewer__chapter-summary">{{ ch.summary }}</span>
                  </button>
                </li>
              </ol>
              <p v-else class="docs-viewer__sidebar-loading">章节加载中…</p>
            </nav>

            <article
              class="docs-viewer__body"
              data-test="docs-viewer-body"
            >
              <p v-if="chapterLoading" class="docs-viewer__loading" role="status">章节加载中…</p>
              <p
                v-else-if="chapterError"
                class="docs-viewer__error"
                role="alert"
              >
                加载失败：{{ chapterError }}
                <button type="button" class="docs-viewer__retry" @click="retryChapter">重试</button>
              </p>
              <div
                v-else-if="chapterBody"
                class="docs-viewer__content"
                data-test="docs-viewer-content"
                v-html="sanitizedHtml"
              />
              <p v-else class="docs-viewer__empty">无内容</p>
            </article>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.docs-viewer {
  position: fixed;
  inset: 0;
  z-index: var(--z-docs, 850);
  display: flex;
  align-items: stretch;
  justify-content: center;
}

.docs-viewer__backdrop {
  position: absolute;
  inset: 0;
  background: var(--surface-overlay, rgba(0, 0, 0, 0.22));
  backdrop-filter: blur(2px);
  border: 0;
  cursor: pointer;
  padding: 0;
}

.docs-viewer__panel {
  position: relative;
  width: min(920px, 90vw);
  height: min(86vh, 720px);
  margin: auto;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  box-shadow: var(--shadow-elevated);
  overflow: hidden;
}

.docs-viewer__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--hairline-soft);
  background: var(--surface-raised);
}

.docs-viewer__title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.docs-viewer__kicker {
  font-size: var(--fs-sm, 12px);
  color: var(--text-muted);
  letter-spacing: 0.04em;
}

.docs-viewer__title strong {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.docs-viewer__close {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  border-radius: 3px;
  transition: background var(--motion-fast, 140ms);
}

.docs-viewer__close:hover,
.docs-viewer__close:focus-visible {
  background: var(--bg-hover);
  color: var(--text-primary);
  outline: none;
}

.docs-viewer__layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  flex: 1;
  min-height: 0;
}

.docs-viewer__sidebar {
  border-right: 1px solid var(--hairline-soft);
  padding: 12px 8px;
  overflow-y: auto;
  background: var(--surface-soft);
}

.docs-viewer__chapter-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.docs-viewer__chapter-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
  border-radius: 3px;
  transition: background var(--motion-fast, 140ms);
}

.docs-viewer__chapter-btn:hover,
.docs-viewer__chapter-btn:focus-visible {
  background: var(--bg-hover);
  color: var(--text-primary);
  outline: none;
}

.docs-viewer__chapter.is-active .docs-viewer__chapter-btn {
  background: var(--accent-light);
  color: var(--text-primary);
}

.docs-viewer__chapter-title {
  font-size: 13px;
  font-weight: 600;
}

.docs-viewer__chapter-summary {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.45;
}

.docs-viewer__sidebar-loading,
.docs-viewer__sidebar-error {
  font-size: 12px;
  color: var(--text-muted);
  padding: 8px 10px;
  margin: 0;
}

.docs-viewer__body {
  overflow-y: auto;
  padding: 24px 32px;
  background: var(--bg-secondary);
  min-width: 0;
}

.docs-viewer__loading,
.docs-viewer__empty,
.docs-viewer__error {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
  padding: 12px 0;
}

.docs-viewer__error {
  color: var(--danger);
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.docs-viewer__retry {
  padding: 4px 10px;
  border: 1px solid var(--border);
  background: var(--surface-raised);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 12px;
  border-radius: 3px;
}

.docs-viewer__retry:hover {
  background: var(--bg-hover);
}

.docs-viewer__content {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
}

.docs-viewer__content :deep(h1),
.docs-viewer__content :deep(h2),
.docs-viewer__content :deep(h3) {
  margin: 1.4em 0 0.6em;
  line-height: 1.3;
  color: var(--text-primary);
}

.docs-viewer__content :deep(h1) { font-size: 20px; }
.docs-viewer__content :deep(h2) { font-size: 17px; }
.docs-viewer__content :deep(h3) { font-size: 15px; }

.docs-viewer__content :deep(p) {
  margin: 0.6em 0;
}

.docs-viewer__content :deep(code) {
  background: var(--bg-tertiary);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 12px;
}

.docs-viewer__content :deep(pre) {
  background: var(--bg-tertiary);
  padding: 10px 12px;
  border-radius: 4px;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.55;
}

.docs-viewer__content :deep(pre code) {
  background: transparent;
  padding: 0;
}

.docs-viewer__content :deep(ul),
.docs-viewer__content :deep(ol) {
  padding-left: 1.6em;
  margin: 0.6em 0;
}

.docs-viewer__content :deep(blockquote) {
  margin: 0.8em 0;
  padding: 4px 14px;
  border-left: 3px solid var(--accent);
  background: var(--accent-light);
  color: var(--text-primary);
}

.docs-viewer__content :deep(a) {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.docs-viewer__content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.8em 0;
  font-size: 12px;
}

.docs-viewer__content :deep(th),
.docs-viewer__content :deep(td) {
  border: 1px solid var(--hairline-soft);
  padding: 6px 10px;
  text-align: left;
}

.docs-viewer__content :deep(th) {
  background: var(--surface-raised);
  font-weight: 600;
}

/* Transition */
.docs-layer-enter-active,
.docs-layer-leave-active {
  transition: opacity var(--motion-layer, 180ms) var(--motion-ease-out);
}
.docs-layer-enter-active .docs-viewer__panel,
.docs-layer-leave-active .docs-viewer__panel {
  transition: transform var(--motion-layer, 180ms) var(--motion-ease-out);
}
.docs-layer-enter-from,
.docs-layer-leave-to {
  opacity: 0;
}
.docs-layer-enter-from .docs-viewer__panel,
.docs-layer-leave-to .docs-viewer__panel {
  transform: translateY(-12px);
}

/* 移动端改为底部 sheet */
@media (max-width: 640px) {
  .docs-viewer__panel {
    width: 100vw;
    height: 90vh;
    max-height: 90vh;
    margin: auto 0 0 0;
    border-radius: 12px 12px 0 0;
  }
  .docs-viewer__layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
  .docs-viewer__sidebar {
    border-right: 0;
    border-bottom: 1px solid var(--hairline-soft);
    padding: 8px;
    max-height: 38vh;
  }
  .docs-viewer__chapter-list {
    flex-direction: row;
    overflow-x: auto;
    gap: 6px;
  }
  .docs-viewer__chapter {
    flex: 0 0 auto;
    min-width: 140px;
  }
  .docs-viewer__chapter-summary {
    display: none;
  }
  .docs-viewer__body {
    padding: 16px 18px;
  }
  .docs-layer-enter-from .docs-viewer__panel,
  .docs-layer-leave-to .docs-viewer__panel {
    transform: translateY(16px);
  }
}
</style>