<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { marked } from 'marked'
import { sanitizeHtml } from '../utils/sanitize'

// 独立全页文档界面（对标 platform.minimaxi.com/docs 的阅读体验）：
// 顶部返回栏 + 左侧分组章节导航 + 主内容区。不套 AppShell，自成一个页面。
// 章节清单来自 /docs/user-manual/manifest.json（带 group 分组字段），
// 正文按章节拉取同名 .md，经 marked → sanitizeHtml 渲染。

const route = useRoute()
const router = useRouter()

const DEFAULT_CHAPTER = 'README'

const manifest = ref(null)
const manifestError = ref(null)
const chapterBody = ref('')
const chapterError = ref(null)
const chapterLoading = ref(false)
const fetchToken = ref(0)
const sidebarOpen = ref(false)

const currentChapterId = computed(() => {
  const id = route.params.chapterId || DEFAULT_CHAPTER
  return Array.isArray(id) ? id[0] : id
})

const currentChapter = computed(() => {
  if (!manifest.value) return null
  return manifest.value.chapters.find((c) => c.id === currentChapterId.value) || null
})

// 按 manifest 的 group 字段分组的导航树。
const groups = computed(() => {
  if (!manifest.value) return []
  const map = new Map()
  for (const ch of manifest.value.chapters) {
    const g = ch.group || '其他'
    if (!map.has(g)) map.set(g, [])
    map.get(g).push(ch)
  }
  return Array.from(map, ([name, chapters]) => ({ name, chapters }))
})

const sanitizedHtml = computed(() => {
  if (!chapterBody.value) return ''
  const html = marked.parse(chapterBody.value, { async: false })
  return sanitizeHtml(html)
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
    if (token !== fetchToken.value) return
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
  router.push({ name: 'docs', params: { chapterId } })
}

function retryChapter() {
  if (currentChapterId.value) loadChapter(currentChapterId.value)
}

function retryManifest() {
  manifest.value = null
  manifestError.value = null
  loadManifest()
}

function goBack() {
  const from = route.query?.from
  if (from && String(from).startsWith('/')) {
    router.push(String(from))
  } else {
    router.push('/')
  }
}

watch(
  currentChapterId,
  (id) => {
    if (!id || !manifest.value) return
    loadChapter(id)
    nextTick(() => {
      const body = document.querySelector('.docs-page__body')
      if (body) body.scrollTop = 0
    })
  },
  { immediate: false }
)

// 关闭移动端侧栏
function closeSidebarOnNavigate() {
  sidebarOpen.value = false
}

// 章节切换时同步 document.title（App.vue 只管 AppShell 内路由）
function syncTitle() {
  const title = currentChapter.value?.title || '使用指南'
  document.title = `${title} - Pinax 文档`
}

watch([currentChapterId, currentChapter], () => {
  syncTitle()
})

onMounted(async () => {
  await loadManifest()
  await loadChapter(currentChapterId.value)
  syncTitle()
})

onBeforeUnmount(() => {
  fetchToken.value++
})
</script>

<template>
  <div class="docs-page" data-test="docs-page">
    <header class="docs-page__head">
      <div class="docs-page__head-inner">
        <button
          type="button"
          class="docs-page__back"
          data-test="docs-back"
          @click="goBack"
        >
          ← <span>返回应用</span>
        </button>

        <button
          type="button"
          class="docs-page__menu-toggle"
          aria-label="切换章节目录"
          aria-expanded="sidebarOpen ? 'true' : 'false'"
          data-test="docs-menu-toggle"
          @click="sidebarOpen = !sidebarOpen"
        >
          ☰
        </button>

        <div class="docs-page__brand">
          <strong>Pinax</strong>
          <span class="docs-page__brand-sep">/</span>
          <span>使用指南</span>
        </div>

        <span class="docs-page__chapter-caption">
          {{ currentChapter?.title || '…' }}
        </span>
      </div>
    </header>

    <div class="docs-page__layout">
      <aside
        class="docs-page__sidebar"
        :class="{ open: sidebarOpen }"
        aria-label="章节目录"
      >
        <p v-if="manifestError" class="docs-page__hint" role="alert">
          章节列表加载失败
          <button type="button" class="docs-page__retry" @click="retryManifest">重试</button>
        </p>
        <template v-else-if="manifest">
          <nav
            v-for="group in groups"
            :key="group.name"
            class="docs-page__group"
          >
            <h3 class="docs-page__group-title">{{ group.name }}</h3>
            <ul class="docs-page__list">
              <li v-for="ch in group.chapters" :key="ch.id">
                <button
                  type="button"
                  class="docs-page__nav-item"
                  :class="{ 'is-active': ch.id === currentChapterId }"
                  :aria-current="ch.id === currentChapterId ? 'page' : 'false'"
                  :data-test="`docs-nav-${ch.id}`"
                  @click="selectChapter(ch.id)"
                >
                  <span class="docs-page__nav-title">{{ ch.title }}</span>
                  <span class="docs-page__nav-summary">{{ ch.summary }}</span>
                </button>
              </li>
            </ul>
          </nav>
        </template>
        <p v-else class="docs-page__hint">章节加载中…</p>
      </aside>

      <!-- 移动端遮罩 -->
      <button
        v-if="sidebarOpen"
        type="button"
        class="docs-page__scrim"
        aria-label="关闭章节目录"
        @click="sidebarOpen = false"
      />

      <main class="docs-page__main">
        <article class="docs-page__body" data-test="docs-body">
          <p v-if="chapterLoading" class="docs-page__hint" role="status">章节加载中…</p>
          <p v-else-if="chapterError" class="docs-page__hint docs-page__error" role="alert">
            加载失败：{{ chapterError }}
            <button type="button" class="docs-page__retry" @click="retryChapter">重试</button>
          </p>
          <div
            v-else-if="chapterBody"
            class="docs-page__content"
            data-test="docs-content"
            v-html="sanitizedHtml"
          />
          <p v-else class="docs-page__hint">无内容</p>
        </article>
      </main>
    </div>
  </div>
</template>

<style scoped>
.docs-page {
  min-height: var(--app-viewport-height, 100vh);
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.docs-page__head {
  position: sticky;
  top: 0;
  z-index: 30;
  border-bottom: 1px solid var(--hairline-soft);
  background: var(--surface-raised);
}

.docs-page__head-inner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 20px;
}

.docs-page__back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  padding: 6px 8px;
  border-radius: 3px;
  transition: background var(--motion-fast, 140ms), color var(--motion-fast, 140ms);
}

.docs-page__back:hover,
.docs-page__back:focus-visible {
  background: var(--bg-hover);
  color: var(--text-primary);
  outline: none;
}

.docs-page__menu-toggle {
  display: none;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  width: 30px;
  height: 30px;
  font-size: 15px;
  line-height: 1;
  border-radius: 3px;
}

.docs-page__brand {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 14px;
}

.docs-page__brand strong {
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.01em;
}

.docs-page__brand-sep {
  color: var(--text-muted);
}

.docs-page__chapter-caption {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-muted);
}

.docs-page__layout {
  flex: 1;
  display: flex;
  min-height: 0;
  width: 100%;
}

.docs-page__sidebar {
  width: 248px;
  flex: 0 0 248px;
  border-right: 1px solid var(--hairline-soft);
  padding: 18px 14px 32px;
  overflow-y: auto;
  background: var(--surface-soft);
}

.docs-page__group {
  margin-bottom: 20px;
}

.docs-page__group-title {
  margin: 0 0 6px;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.docs-page__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.docs-page__nav-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
  border-radius: 3px;
  transition: background var(--motion-fast, 140ms), color var(--motion-fast, 140ms);
}

.docs-page__nav-item:hover,
.docs-page__nav-item:focus-visible {
  background: var(--bg-hover);
  color: var(--text-primary);
  outline: none;
}

.docs-page__nav-item.is-active {
  background: var(--accent-light);
  color: var(--text-primary);
}

.docs-page__nav-title {
  font-size: 13px;
  font-weight: 600;
}

.docs-page__nav-summary {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.45;
}

.docs-page__main {
  flex: 1;
  min-width: 0;
  display: flex;
}

.docs-page__body {
  flex: 1;
  overflow-y: auto;
  padding: 32px 44px 64px;
  background: var(--bg-secondary);
}

.docs-page__hint {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0;
  padding: 12px 0;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.docs-page__error {
  color: var(--danger);
}

.docs-page__retry {
  padding: 4px 10px;
  border: 1px solid var(--border);
  background: var(--surface-raised);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 12px;
  border-radius: 3px;
}

.docs-page__retry:hover {
  background: var(--bg-hover);
}

.docs-page__content {
  font-size: 14px;
  line-height: 1.75;
  color: var(--text-primary);
  /* 铺满视口下 880px 左对齐会留出 ~440px 右空区; 放宽阅读列并居中,
     空区对称分布, 视觉上不再「右半边是空的」。超宽屏仍有舒适行长上限。 */
  max-width: 1180px;
  margin-inline: auto;
}

.docs-page__content :deep(h1),
.docs-page__content :deep(h2),
.docs-page__content :deep(h3) {
  line-height: 1.3;
  color: var(--text-primary);
}

.docs-page__content :deep(h1) {
  font-size: 26px;
  font-weight: 700;
  margin: 0 0 1em;
  padding-bottom: 0.5em;
  border-bottom: 1px solid var(--hairline-soft);
}

.docs-page__content :deep(h2) {
  font-size: 19px;
  font-weight: 600;
  margin: 1.8em 0 0.6em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--hairline-soft);
}

.docs-page__content :deep(h3) {
  font-size: 16px;
  font-weight: 600;
  margin: 1.6em 0 0.5em;
}

.docs-page__content :deep(p) {
  margin: 0.7em 0;
}

.docs-page__content :deep(ul),
.docs-page__content :deep(ol) {
  padding-left: 1.7em;
  margin: 0.7em 0;
}

.docs-page__content :deep(li) {
  margin: 0.25em 0;
}

.docs-page__content :deep(code) {
  background: var(--bg-tertiary);
  padding: 1px 6px;
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 0.9em;
}

.docs-page__content :deep(pre) {
  background: var(--bg-tertiary);
  padding: 14px 16px;
  border-radius: 4px;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  margin: 0.9em 0;
}

.docs-page__content :deep(pre code) {
  background: transparent;
  padding: 0;
}

.docs-page__content :deep(blockquote) {
  margin: 0.9em 0;
  padding: 8px 16px;
  border-left: 3px solid var(--accent);
  background: var(--accent-light);
  color: var(--text-primary);
}

.docs-page__content :deep(blockquote p) {
  margin: 0.3em 0;
}

.docs-page__content :deep(a) {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.docs-page__content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
  font-size: 13px;
}

.docs-page__content :deep(th),
.docs-page__content :deep(td) {
  border: 1px solid var(--hairline-soft);
  padding: 7px 12px;
  text-align: left;
}

.docs-page__content :deep(th) {
  background: var(--surface-raised);
  font-weight: 600;
}

.docs-page__content :deep(hr) {
  border: 0;
  border-top: 1px solid var(--hairline-soft);
  margin: 1.5em 0;
}

.docs-page__scrim {
  display: none;
}

/* 移动端：侧栏变抽屉 + 遮罩 */
@media (max-width: 720px) {
  .docs-page__menu-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .docs-page__chapter-caption {
    display: none;
  }

  .docs-page__head-inner {
    padding: 10px 14px;
    gap: 10px;
  }

  .docs-page__layout {
    position: relative;
  }

  .docs-page__sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    top: 0;
    bottom: 0;
    width: min(300px, 82vw);
    flex: none;
    z-index: 60;
    transform: translateX(-100%);
    transition: transform var(--motion-layer, 180ms) var(--motion-ease-out);
    box-shadow: none;
    padding-top: 20px;
  }

  .docs-page__sidebar.open {
    transform: translateX(0);
    box-shadow: var(--shadow-elevated);
  }

  .docs-page__scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 55;
    background: var(--surface-overlay, rgba(0, 0, 0, 0.22));
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  .docs-page__body {
    padding: 20px 18px 56px;
  }

  .docs-page__content {
    font-size: 14px;
  }
}
</style>
