<script setup>
import { tr, uiLocale } from '../i18n/index.js'
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { marked } from 'marked'
import { sanitizeHtml } from '../utils/sanitize'
import WorkbenchIcon from '../components/workbench/WorkbenchIcon.vue'

// 独立全页文档界面（对标 platform.minimaxi.com/docs 的阅读体验）：
// 工作区文档标签：保留章节深链接，复用 AppShell 的导航与标签。
// 章节清单来自 /docs/user-manual/manifest.json（带 group 分组字段），
// 正文按章节拉取同名 .md，经 marked → sanitizeHtml 渲染。

const route = useRoute()
const router = useRouter()

const DEFAULT_CHAPTER = 'README'

const manifest = ref(null)
let manifestToken = 0
const chapterLanguage = ref(uiLocale.value)
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

// 章节参数可能是清单里的 id（01-quickstart）、文件名（01-quickstart.md）或 README.md。
// 统一解析到真实章节；同时兜底 URL 里残留的 .md 形式（旧整页跳转留下的地址/书签/历史）。
function resolveChapter(rawId) {
  if (!manifest.value || !rawId) return null
  const requested = String(rawId).split(/[?#]/)[0]
  const plain = /^10-beta-guide(?:\.md)?$/.test(requested) ? '01-quickstart' : requested
  return (
    manifest.value.chapters.find((c) => c.id === plain) ||
    manifest.value.chapters.find((c) => c.file === plain) ||
    manifest.value.chapters.find((c) => `${c.id}.md` === plain) ||
    null
  )
}

const currentChapter = computed(() => resolveChapter(currentChapterId.value))

// 正文里跨章节链接是 [文本](./XX.md) 形式：marked 原样输出 <a href="./XX.md">。
// 若让浏览器默认处理，会整页跳转到 /docs/XX.md，路由匹配到 chapterId="XX.md"，
// 清单里找不到对应章节 → 空白页。这里建 file → id 映射，点击时改走 SPA 路由。
const chapterByFile = computed(() => {
  if (!manifest.value) return new Map()
  return new Map(manifest.value.chapters.map((c) => [c.file, c.id]))
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
  const token = ++manifestToken
  const locale = uiLocale.value
  try {
    const res = await fetch(`/docs/user-manual/${locale === 'en' ? 'en/' : ''}manifest.json`)
    if (!res.ok) throw new Error(`manifest ${res.status}`)
    const data = await res.json()
    if (token !== manifestToken || locale !== uiLocale.value) return false
    manifest.value = data
    manifestError.value = null
    return true
  } catch (e) {
    if (token !== manifestToken) return false
    manifestError.value = e?.message || String(e)
    return false
  }
}

async function loadChapter(chapterId) {
  const meta = resolveChapter(chapterId)
  if (!meta) return
  const token = ++fetchToken.value
  const locale = uiLocale.value
  const contentLanguage = locale === 'en' && !meta.chineseOnly ? 'en' : 'zh-CN'
  chapterBody.value = ''
  chapterLoading.value = true
  chapterError.value = null
  try {
    const res = await fetch(`/docs/user-manual/${contentLanguage === 'en' ? 'en/' : ''}${meta.file}`)
    if (!res.ok) throw new Error(`${meta.file} ${res.status}`)
    const text = await res.text()
    if (token !== fetchToken.value) return
    chapterLanguage.value = contentLanguage
    chapterBody.value = text
  } catch (e) {
    if (token !== fetchToken.value) return
    chapterError.value = e?.message || String(e)
  } finally {
    if (token === fetchToken.value) chapterLoading.value = false
  }
}

function selectChapter(chapterId) {
  sidebarOpen.value = false
  if (chapterId === currentChapterId.value) return
  router.push({ name: 'docs', params: { chapterId } })
}

// 拦截正文内的 <a> 点击：外部链接/锚点走浏览器默认；站内 ./XX.md 映射成
// /docs/XX 走 Vue Router（避免整页跳转后清单匹配不上 → 空白页）。中键 /
// Ctrl/Cmd 点击时在新标签打开解析后的正确地址。
function onContentClick(event) {
  const anchor = event.target?.closest?.('a[href]')
  if (!anchor) return
  const href = (anchor.getAttribute('href') || '').trim()
  if (!href) return
  // 外部协议 / 纯锚点 / 协议相对：交回浏览器默认行为
  if (/^(?:https?:|mailto:|tel:|ftp:|#|\/\/|data:)/i.test(href)) return
  event.preventDefault()
  // 去掉 ./ 前缀与 #fragment / ?query，只留路径
  const clean = href.replace(/^\.\/+/, '').split(/[?#]/)[0]
  if (clean.endsWith('.md')) {
    const id = chapterByFile.value.get(clean) || clean.slice(0, -3)
    const resolved = router.resolve({ name: 'docs', params: { chapterId: id } })
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) {
      window.open(resolved.href, '_blank', 'noopener')
    } else if (id !== currentChapterId.value) {
      router.push(resolved)
    }
    return
  }
  // 站内绝对路径（如 /experience、/writing）交给应用路由
  if (clean.startsWith('/')) router.push(clean)
}

function retryChapter() {
  if (currentChapterId.value) loadChapter(currentChapterId.value)
}

function retryManifest() {
  manifest.value = null
  manifestError.value = null
  void loadManifest().then(ok => { if (ok) return loadChapter(currentChapterId.value) })
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

// URL 兜底：若地址栏是 .md / 文件名形式（如旧整页跳转留下的 /docs/01-quickstart.md），
// 解析出真实章节后把地址规整回 /docs/<id>，让地址栏、侧栏高亮、后退行为都基于规范 id。
watch(
  () => currentChapter.value?.id,
  (resolvedId) => {
    if (resolvedId && resolvedId !== currentChapterId.value) {
      router.replace({ name: 'docs', params: { chapterId: resolvedId } })
    }
  }
)

// 关闭移动端侧栏


// 章节切换时同步 document.title（App.vue 只管 AppShell 内路由）
function syncTitle() {
  const title = currentChapter.value?.title || '使用指南'
  document.title = `${tr(title)} - Pinax ${tr('文档')}`
}

watch([currentChapterId, currentChapter], () => {
  syncTitle()
})

onMounted(async () => {
  if (await loadManifest()) await loadChapter(currentChapterId.value)
  syncTitle()
})

watch(uiLocale, async () => {
  fetchToken.value++
  manifest.value = null
  chapterBody.value = ''
  chapterError.value = null
  if (await loadManifest()) await loadChapter(currentChapterId.value)
  syncTitle()
})

onBeforeUnmount(() => {
  manifestToken++
  fetchToken.value++
})
</script>

<template>
  <div class="docs-page" data-test="docs-page">
    <p v-if="currentChapter?.chineseOnly" role="status">{{ tr('本章目前仅有中文版本。') }}</p>
    <header class="docs-page__head">
      <div class="docs-page__head-inner">
        <button
          type="button"
          class="docs-page__back"
          data-test="docs-back"
          @click="goBack"
        >
          <WorkbenchIcon name="arrow-left" :size="16" /><span>{{ tr('返回工作区') }}</span>
        </button>

        <button
          type="button"
          class="docs-page__menu-toggle"
          :aria-label="tr(&quot;切换章节目录&quot;)"
          :aria-expanded="sidebarOpen ? 'true' : 'false'"
          data-test="docs-menu-toggle"
          @click="sidebarOpen = !sidebarOpen"
        >
          <WorkbenchIcon name="panel-left" :size="16" />
        </button>

        <div class="docs-page__brand">
          <span>{{ tr('使用指南') }}</span>
        </div>

        <span class="docs-page__chapter-caption">
          {{ currentChapter?.title || '…' }}
        </span>
      </div>
    </header>

    <div class="docs-page__layout">
      <aside
        class="docs-page__sidebar workspace-sidebar"
        :class="{ open: sidebarOpen }"
        :aria-label="tr(&quot;章节目录&quot;)"
      >
        <p v-if="manifestError" class="docs-page__hint" role="alert">{{ tr('章节列表加载失败') }}<button type="button" class="docs-page__retry" @click="retryManifest">{{ tr('重试') }}</button>
        </p>
        <template v-else-if="manifest">
          <nav
            v-for="group in groups"
            :key="group.name"
            class="docs-page__group"
          >
            <h3 class="docs-page__group-title workspace-nav-section">{{ group.name }}</h3>
            <ul class="docs-page__list">
              <li v-for="ch in group.chapters" :key="ch.id">
                <button
                  type="button"
                  class="docs-page__nav-item workspace-nav-item"
                  :class="{ 'is-active': ch.id === currentChapter?.id }"
                  :aria-current="ch.id === currentChapter?.id ? 'page' : 'false'"
                  :data-test="`docs-nav-${ch.id}`"
                  @click="selectChapter(ch.id)"
                >
                  <span class="docs-page__nav-title workspace-nav-label">{{ ch.title }}</span>
                  <span class="docs-page__nav-summary workspace-nav-meta">{{ ch.summary }}</span>
                </button>
              </li>
            </ul>
          </nav>
        </template>
        <p v-else class="docs-page__hint">{{ tr('章节加载中…') }}</p>
      </aside>

      <!-- 移动端遮罩 -->
      <button
        v-if="sidebarOpen"
        type="button"
        class="docs-page__scrim"
        :aria-label="tr(&quot;关闭章节目录&quot;)"
        @click="sidebarOpen = false"
      />

      <main class="docs-page__main">
        <article class="docs-page__body" data-test="docs-body">
          <p v-if="chapterLoading" class="docs-page__hint" role="status">{{ tr('章节加载中…') }}</p>
          <p v-else-if="chapterError" class="docs-page__hint docs-page__error" role="alert">{{ tr('加载失败：{chapterError}', { chapterError: chapterError }) }}<button type="button" class="docs-page__retry" @click="retryChapter">{{ tr('重试') }}</button>
          </p>
          <div
            v-else-if="chapterBody"
            class="docs-page__content"
            data-test="docs-content"
            :lang="chapterLanguage"
            v-html="sanitizedHtml"
            @click="onContentClick"
          />
          <p v-else class="docs-page__hint">{{ tr('无内容') }}</p>
        </article>
      </main>
    </div>
  </div>
</template>

<style scoped>
.docs-page {
  min-height: 0;
  height: 100%;
  overflow: hidden;
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
  color: var(--text-secondary);
}

.docs-page__layout {
  flex: 1;
  display: flex;
  min-height: 0;
  width: 100%;
}

.docs-page__sidebar {
  width: var(--workspace-sidebar-width, 240px);
  flex: 0 0 var(--workspace-sidebar-width, 240px);
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
  border-radius: 6px;
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
  font-weight: 500;
}

.docs-page__nav-summary {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.45;
}

.docs-page__main {
  flex: 1;
  min-width: 0;
  min-height: 0;
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
  max-width: 760px;
  margin-inline: auto;
  font-size: 16px;
  line-height: 1.9;
  color: var(--text-primary);
}

.docs-page__content :deep(h1),
.docs-page__content :deep(h2),
.docs-page__content :deep(h3) {
  line-height: 1.3;
  color: var(--text-primary);
}

.docs-page__content :deep(h1) {
  font-size: 30px;
  font-weight: 700;
  margin: 0 0 1em;
  padding-bottom: 0.5em;
  border-bottom: 0;
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
