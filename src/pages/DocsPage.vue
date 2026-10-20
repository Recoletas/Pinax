<script setup>
import { tr, uiLocale } from '../i18n/index.js'
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { marked } from 'marked'
import { sanitizeHtml } from '../utils/sanitize'
import WorkbenchIcon from '../components/workbench/WorkbenchIcon.vue'
import { useComposableWorkspace } from '../composables/useComposableWorkspace.js'

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
const directoryQuery = ref('')
const bodyRef = ref(null)
const activeHeading = ref('')
const host = useComposableWorkspace()
const directoryMode = ref('guide')
const desktopExpanded = ref(true)
const directoryExpanded = computed(() => host.state.narrow ? host.state.directoryOpen : desktopExpanded.value)
function setDirectoryExpanded(value) {
  if (host.state.narrow) host.state.directoryOpen = Boolean(value)
  else desktopExpanded.value = Boolean(value)
}
const releaseDirectory = host.bindDirectorySurface({
  routeName: 'docs',
  items: [{ id: 'guide', label: '使用指南', icon: 'guide' }, { id: 'outline', label: '本页内容', icon: 'outline' }],
  controller: {
    mode: directoryMode, expanded: directoryExpanded,
    width: host.directory.width, resize: host.directory.resize,
    setExpanded: setDirectoryExpanded,
    toggle: () => setDirectoryExpanded(!directoryExpanded.value),
    select: mode => {
      if (directoryMode.value === mode) setDirectoryExpanded(!directoryExpanded.value)
      else { directoryMode.value = mode; setDirectoryExpanded(true) }
    }
  }
})
const chapterIcons = { README: 'guide', '01-quickstart': 'writing', '05-writing': 'writing', '03-worldbook': 'worldbook', '04-materials': 'sources', '07-settings': 'settings', '08-faq': 'message-square', '02-experience': 'adventure', '06-storyboard': 'film', '09-comics': 'comics' }
const chapterIndex = computed(() => manifest.value?.chapters.findIndex(ch => ch.id === currentChapter.value?.id) ?? -1)
const previousChapter = computed(() => manifest.value?.chapters[chapterIndex.value - 1])
const nextChapter = computed(() => chapterIndex.value < 0 ? null : manifest.value?.chapters[chapterIndex.value + 1])

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
    const query = directoryQuery.value.trim().toLocaleLowerCase()
    if (query && !`${ch.title} ${ch.summary || ''}`.toLocaleLowerCase().includes(query)) continue
    const g = ch.group || '其他'
    if (!map.has(g)) map.set(g, [])
    map.get(g).push(ch)
  }
  return Array.from(map, ([name, chapters]) => ({ name, chapters }))
})

const renderedChapter = computed(() => {
  if (!chapterBody.value) return { html: '', headings: [] }
  const html = marked.parse(chapterBody.value, { async: false })
    .replace(/(src=["'])(?:\.\.\/)+screenshots\//g, '$1/docs/screenshots/')
  const doc = new DOMParser().parseFromString(sanitizeHtml(html), 'text/html')
  // Resolve manual assets against their Markdown file, not the SPA chapter URL.
  const assetBase = new URL(`/docs/user-manual/${chapterLanguage.value === 'en' ? 'en/' : ''}${currentChapter.value?.file || 'README.md'}`, window.location.origin)
  for (const img of doc.querySelectorAll('img')) {
    const src = img.getAttribute('src') || ''
    if (/^\.\.?\//.test(src)) img.setAttribute('src', new URL(src, assetBase).pathname)
    img.setAttribute('loading', 'lazy')
    img.setAttribute('decoding', 'async')
    if (img.getAttribute('src')?.includes('/images/20261016/')) {
      // Reserve the captured viewport so lazy images do not move heading links.
      img.setAttribute('width', '1440')
      img.setAttribute('height', '960')
    }
    if (img.getAttribute('src')?.startsWith('/docs/user-manual/images/') && !img.closest('a')) {
      const link = doc.createElement('a')
      link.href = img.getAttribute('src')
      link.target = '_blank'
      link.rel = 'noopener'
      img.replaceWith(link)
      link.append(img)
    }
  }
  const used = new Map()
  const headings = []
  for (const node of doc.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    const title = node.textContent.trim()
    const base = title.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-') || 'section'
    const count = used.get(base) || 0
    used.set(base, count + 1)
    node.id = count ? `${base}-${count}` : base
    if (node.tagName === 'H2') headings.push({ id: node.id, title })
  }
  for (const table of doc.querySelectorAll('table')) {
    const wrapper = doc.createElement('div')
    wrapper.className = 'docs-table-scroll'
    table.replaceWith(wrapper)
    wrapper.append(table)
  }
  return { html: doc.body.innerHTML, headings }
})
const sanitizedHtml = computed(() => renderedChapter.value.html)
const headings = computed(() => renderedChapter.value.headings)

function updateActiveHeading() {
  const body = bodyRef.value
  if (!body) return
  const top = body.getBoundingClientRect().top + 64
  let id = headings.value[0]?.id || ''
  for (const node of body.querySelectorAll('h2[id]')) {
    if (node.getBoundingClientRect().top > top) break
    id = node.id
  }
  activeHeading.value = id
}
function scrollToHash(hash = route.hash) {
  const body = bodyRef.value
  if (!body) return
  let id = ''
  try { id = decodeURIComponent(hash.replace(/^#/, '')) } catch { /* malformed fragment */ }
  const target = [...body.querySelectorAll('[id]')].find(node => node.id === id)
  if (target) target.scrollIntoView({ block: 'start', behavior: 'instant' })
  else body.scrollTop = 0
  updateActiveHeading()
}
function decodedHash(hash) {
  try { return decodeURIComponent(hash) } catch { return hash }
}
async function jumpToHeading(id) {
  const hash = `#${decodedHash(id)}`
  await router.replace({ hash })
  scrollToHash(hash)
  if (host.state.narrow) { setDirectoryExpanded(false); await nextTick(); bodyRef.value?.focus({ preventScroll: true }) }
}
watch(() => route.hash, () => { if (!chapterLoading.value) nextTick(() => scrollToHash()) })

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
  const token = ++fetchToken.value
  const meta = resolveChapter(chapterId)
  if (!meta) { chapterBody.value = ''; chapterError.value = tr('找不到这篇指南'); chapterLoading.value = false; return }
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
    if (token === fetchToken.value) {
      chapterLoading.value = false
      await nextTick()
      if (token === fetchToken.value) scrollToHash()
    }
  }
}

async function selectChapter(chapterId) {
  const restoreFocus = host.state.narrow && directoryExpanded.value
  if (host.state.narrow) setDirectoryExpanded(false)
  directoryQuery.value = ''
  if (chapterId !== currentChapter.value?.id) await router.push({ name: 'docs', params: { chapterId }, query: route.query })
  if (restoreFocus) { await nextTick(); bodyRef.value?.focus({ preventScroll: true }) }
}

function onContentClick(event) {
  const anchor = event.target?.closest?.('a[href]')
  if (!anchor) return
  const href = (anchor.getAttribute('href') || '').trim()
  if (!href || anchor.target === '_blank' || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) return
  if (href.startsWith('#')) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return
    event.preventDefault(); void jumpToHeading(href.slice(1)); return
  }
  const url = new URL(href, window.location.href)
  const clean = href.replace(/^\.\//, '').split(/[?#]/)[0]
  const id = chapterByFile.value.get(clean)
  if (id) {
    event.preventDefault()
    const resolved = router.resolve({ name: 'docs', params: { chapterId: id }, query: route.query, hash: decodedHash(url.hash) })
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) window.open(resolved.href, '_blank', 'noopener')
    else router.push(resolved)
  } else if (clean.endsWith('.md')) {
    // Repository-only docs have no chapter route; open their actual source.
    event.preventDefault()
    const source = new URL(href, `https://github.com/Recoletas/Pinax/blob/main/docs/user-manual/${chapterLanguage.value === 'en' ? 'en/' : ''}${currentChapter.value?.file || 'README.md'}`)
    window.open(source.href, '_blank', 'noopener')
  } else if (clean.startsWith('/') && !event.ctrlKey && !event.metaKey) { event.preventDefault(); router.push(href) }
}

function retryChapter() {
  if (currentChapterId.value) loadChapter(currentChapterId.value)
}

function retryManifest() {
  manifest.value = null
  manifestError.value = null
  void loadManifest().then(ok => { if (ok) return loadChapter(currentChapterId.value) })
}

watch(
  currentChapterId,
  (id) => {
    if (!id || !manifest.value) return
    loadChapter(id)
    nextTick(() => {
      const body = bodyRef.value
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
      router.replace({ name: 'docs', params: { chapterId: resolvedId }, query: route.query, hash: route.hash })
    }
  }
)

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
  releaseDirectory()
  host.state.directoryOpen = false
  manifestToken++
  fetchToken.value++
})
</script>

<template>
  <div class="docs-page" data-test="docs-page">
    <Teleport v-if="host.directoryTarget.value" :to="host.directoryTarget.value">
      <div class="docs-page__sidebar" :aria-label="tr(directoryMode === 'guide' ? '章节目录' : '本页内容')">
        <template v-if="directoryMode === 'guide'">
          <div class="docs-page__directory-head">
            <label class="docs-page__search"><WorkbenchIcon name="search" :size="16" /><input v-model="directoryQuery" type="search" :placeholder="tr('查找章节')" :aria-label="tr('查找章节')" /></label>
          </div>
          <p v-if="manifestError" class="docs-page__hint" role="alert">{{ tr('章节列表加载失败') }}<button type="button" class="docs-page__retry" @click="retryManifest">{{ tr('重试') }}</button></p>
          <template v-else-if="manifest">
            <nav v-for="group in groups" :key="group.name" class="docs-page__group" :aria-label="group.name">
              <h2 class="docs-page__group-title">{{ group.name }}</h2>
              <ul class="docs-page__list"><li v-for="ch in group.chapters" :key="ch.id">
                <button type="button" class="docs-page__nav-item" :class="{ 'is-active': ch.id === currentChapter?.id }" :aria-current="ch.id === currentChapter?.id ? 'page' : undefined" :data-test="`docs-nav-${ch.id}`" @click="selectChapter(ch.id)">
                  <WorkbenchIcon :name="chapterIcons[ch.id] || 'guide'" :size="17" /><span>{{ ch.title }}</span>
                </button>
              </li></ul>
            </nav>
            <p v-if="!groups.length" class="docs-page__hint" role="status">{{ tr('没有匹配的章节') }}</p>
          </template>
          <p v-else class="docs-page__hint" role="status">{{ tr('章节加载中…') }}</p>
        </template>
        <nav v-else class="docs-page__outline" :aria-label="tr('本页内容')">
          <h2 class="docs-page__group-title">{{ currentChapter?.title }}</h2>
          <a v-for="heading in headings" :key="heading.id" :href="`#${heading.id}`" :class="{ 'is-active': activeHeading === heading.id }" :aria-current="activeHeading === heading.id ? 'location' : undefined" @click.prevent="jumpToHeading(heading.id)">{{ heading.title }}</a>
        </nav>
      </div>
    </Teleport>
    <section class="docs-page__main">
        <article ref="bodyRef" class="docs-page__body" data-test="docs-body" tabindex="-1" :aria-busy="chapterLoading" @scroll.passive="updateActiveHeading">
          <p v-if="chapterLoading" class="docs-page__hint" role="status">{{ tr('章节加载中…') }}</p>
          <div v-else-if="chapterError" class="docs-page__hint" role="alert"><p>{{ tr('加载失败：{chapterError}', { chapterError }) }}</p><button type="button" class="docs-page__retry" @click="retryChapter">{{ tr('重试') }}</button></div>
          <template v-else-if="chapterBody">
            <p v-if="currentChapter?.chineseOnly" class="docs-page__language-note" role="status">{{ tr('本章目前仅有中文版本。') }}</p>
            <div class="docs-page__content" data-test="docs-content" :lang="chapterLanguage" v-html="sanitizedHtml" @click="onContentClick" @auxclick="onContentClick" />
            <nav class="docs-page__pagination" :aria-label="tr('相邻章节')">
              <button v-if="previousChapter" type="button" @click="selectChapter(previousChapter.id)"><WorkbenchIcon name="arrow-left" :size="16" /><span>{{ previousChapter.title }}</span></button>
              <button v-if="nextChapter" type="button" class="docs-page__next" @click="selectChapter(nextChapter.id)"><span>{{ nextChapter.title }}</span><WorkbenchIcon name="arrow-right" :size="16" /></button>
            </nav>
          </template>
          <p v-else class="docs-page__hint">{{ tr('无内容') }}</p>
        </article>
    </section>
  </div>
</template>

<style scoped>
.docs-page { display: flex; flex: 1; flex-direction: column; width: 100%; min-width: 0; min-height: 0; height: 100%; overflow: hidden; background: var(--surface-workbench); color: var(--text-primary); font-family: var(--font-interface, var(--font-sans)); }
.docs-page__sidebar { box-sizing: border-box; min-height: 100%; padding: 14px 12px 24px; color: var(--text-primary); font-family: var(--font-interface); }
.docs-page__directory-head { display: flex; align-items: center; gap: 6px; margin-bottom: 24px; }
.docs-page__search { display: flex; flex: 1; align-items: center; min-width: 0; gap: 8px; color: var(--text-muted); background: var(--surface-workbench); padding: 0 10px; min-height: 36px; border-radius: var(--radius-control); }
.docs-page__search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--text-primary); font: 13px/1.5 var(--font-sans); }
.docs-page__search input::placeholder { color: var(--text-muted); }
.docs-page__search:focus-within { outline: 2px solid var(--workbench-focus-ring, var(--text-secondary)); outline-offset: 2px; }
.docs-page__group { margin-bottom: 24px; }
.docs-page__group-title { margin: 0 10px 8px; font-size: 12px; font-weight: 500; color: var(--text-muted); }
.docs-page__list { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; }
.docs-page__nav-item { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 38px; padding: 8px 10px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-secondary); font: 14px/1.5 var(--font-sans); text-align: start; cursor: pointer; }
.docs-page__nav-item svg { flex: none; opacity: .8; }
.docs-page__nav-item:hover { background: var(--nav-hover); color: var(--text-primary); }
.docs-page__nav-item.is-active { background: var(--nav-primary-selected); color: var(--text-primary); font-weight: 600; }
.docs-page__main { display: flex; flex: 1; min-width: 0; min-height: 0; }
.docs-page__body { flex: 1; min-width: 0; overflow-y: auto; overscroll-behavior: contain; padding: 44px clamp(24px, 4vw, 72px) 56px; scroll-padding-top: 28px; outline: 0; }
.docs-page__content, .docs-page__pagination, .docs-page__language-note { width: 100%; max-width: 820px; margin-inline: auto; }
.docs-page__content { font-size: 16px; line-height: 1.85; overflow-wrap: anywhere; }
.docs-page__content :deep(h1) { margin: 0 0 26px; color: var(--text-primary); font-size: 30px; font-weight: 650; line-height: 1.3; letter-spacing: -.025em; }
.docs-page__content :deep(h2) { margin: 42px 0 16px; color: var(--text-primary); font-size: 22px; font-weight: 600; line-height: 1.4; letter-spacing: -.015em; }
.docs-page__content :deep(h3) { margin: 30px 0 12px; color: var(--text-primary); font-size: 17px; font-weight: 600; line-height: 1.5; }
.docs-page__content :deep(p) { margin: 12px 0; }
.docs-page__content :deep(ul), .docs-page__content :deep(ol) { padding-left: 1.5em; margin: 16px 0; }
.docs-page__content :deep(li) { padding-left: 4px; margin: 8px 0; }
.docs-page__content :deep(li::marker) { color: var(--text-muted); }
.docs-page__content :deep(strong) { font-weight: 600; }
.docs-page__content :deep(a) { color: var(--text-primary); text-decoration-color: var(--text-muted); text-underline-offset: 4px; text-decoration-thickness: 1px; }
.docs-page__content :deep(a:hover) { color: var(--accent); }
.docs-page__content :deep(img) { display: block; max-width: 100%; height: auto; margin: 24px auto; border-radius: var(--radius-control); }
.docs-page__content :deep(code) { padding: 2px 5px; border-radius: 4px; background: var(--surface-workbench-input); font: .88em var(--font-mono); }
.docs-page__content :deep(pre) { margin: 24px 0; padding: 18px 20px; border-radius: var(--radius-control); background: var(--surface-workbench-muted); overflow: auto; line-height: 1.7; }
.docs-page__content :deep(pre code) { padding: 0; background: transparent; overflow-wrap: normal; }
.docs-page__content :deep(blockquote) { margin: 24px 0; padding: 2px 0 2px 18px; border-left: 2px solid var(--hairline-soft); color: var(--text-secondary); }
.docs-page__content :deep(.docs-table-scroll) { max-width: 100%; overflow-x: auto; margin: 24px 0; }
.docs-page__content :deep(table) { width: 100%; border-collapse: collapse; font-size: 14px; line-height: 1.7; }
.docs-page__content :deep(th), .docs-page__content :deep(td) { padding: 12px 14px; text-align: start; vertical-align: top; border-bottom: 1px solid var(--hairline-soft); min-width: 96px; }
.docs-page__content :deep(th) { background: var(--surface-workbench-muted); font-weight: 600; color: var(--text-secondary); }
.docs-page__content :deep(hr) { margin: 32px 0; border: 0; border-top: 1px solid var(--hairline-soft); }
.docs-page__outline a { display: block; box-sizing: border-box; padding: 9px 10px; border-radius: var(--radius-control); color: var(--text-secondary); text-decoration: none; font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.docs-page__outline a:hover { color: var(--text-primary); background: var(--nav-hover); }
.docs-page__outline a.is-active { color: var(--text-primary); background: var(--nav-primary-selected); }
.docs-page__pagination { margin-top: 48px; padding-top: 20px; border-top: 1px solid var(--hairline-soft); display: flex; justify-content: space-between; gap: 24px; }
.docs-page__pagination button { display: inline-flex; align-items: center; gap: 12px; border: 0; padding: 8px 0; background: transparent; color: var(--text-secondary); font: 14px/1.5 var(--font-sans); text-align: start; cursor: pointer; }
.docs-page__pagination button:hover { color: var(--text-primary); }
.docs-page__pagination svg { flex: none; }
.docs-page__next { margin-left: auto; text-align: end !important; }
.docs-page__hint { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 12px 0; color: var(--text-secondary); font-size: 14px; }
.docs-page__language-note { margin-bottom: 18px; color: var(--text-muted); font-size: 13px; }
.docs-page__retry { border: 0; border-radius: var(--radius-control); background: var(--nav-hover); color: var(--text-primary); padding: 8px 12px; cursor: pointer; }
:is(.docs-page, .docs-page__sidebar) :is(button, a):focus-visible { outline: 2px solid var(--text-secondary); outline-offset: 3px; }
@media (max-width: 900px) {
  .docs-page__search, .docs-page__nav-item, .docs-page__outline a { min-height: 44px; }
  .docs-page__body { padding: 28px 24px 40px; }
  .docs-page__content { font-size: 15px; line-height: 1.85; }
  .docs-page__content :deep(h1) { font-size: 28px; }
  .docs-page__content :deep(h2) { margin-top: 36px; font-size: 20px; }
  .docs-page__pagination button { min-height: 44px; }
}
</style>
