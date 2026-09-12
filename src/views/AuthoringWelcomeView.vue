<template>
  <div class="authoring-welcome">
    <header class="authoring-welcome__chrome">
      <strong>Pinax</strong>
      <nav aria-label="辅助入口">
        <button type="button" @click="settings.open('storage')">备份</button>
        <router-link to="/docs/10-beta-guide">内测说明</router-link>
        <router-link to="/docs/README">使用指南</router-link>
      </nav>
    </header>

    <main class="authoring-welcome__main">
      <section class="authoring-welcome__intro" aria-labelledby="authoring-welcome-title">
        <span class="authoring-welcome__eyebrow">以作者为中心的创作工作台</span>
        <h1 id="authoring-welcome-title">从一句话开始，<br>让故事慢慢长出来。</h1>
        <p>直接写正文，不必先建立世界，也不必先配置 AI。需要时再打开设定、批注和推演。</p>

        <div class="authoring-welcome__actions">
          <router-link class="authoring-welcome__primary" data-test="welcome-start-authoring" to="/authoring?start=new">开始写作</router-link>
          <router-link class="authoring-welcome__secondary" data-test="welcome-import-manuscript" to="/authoring?start=import">导入已有书稿</router-link>
        </div>

        <div class="authoring-welcome__local-note">
          <strong>作品保存在当前浏览器</strong>
          <span>不会自动跨设备同步。写作一段时间后，请在“备份”中导出作品备份。</span>
        </div>
      </section>

      <aside class="authoring-welcome__guide" aria-label="开始使用">
        <div v-if="recentBooks.length" class="authoring-welcome__recent">
          <span class="authoring-welcome__section-label">继续写</span>
          <router-link
            v-for="book in recentBooks"
            :key="book.id"
            :to="{ name: 'authoring', query: { bookId: book.id } }"
          >
            <span>
              <strong>{{ book.title || '未命名书稿' }}</strong>
              <small>{{ book.chapters.length }} 章 · {{ bookWordCount(book).toLocaleString('zh-CN') }} 字</small>
            </span>
            <span aria-hidden="true">→</span>
          </router-link>
        </div>

        <div class="authoring-welcome__steps">
          <span class="authoring-welcome__section-label">第一次使用</span>
          <ol>
            <li><span>01</span><p><strong>新建或导入</strong><small>空白开始，或带入 UTF-8 的 TXT / Markdown 书稿。</small></p></li>
            <li><span>02</span><p><strong>先写，再按需请 AI</strong><small>正文自动保存在本机；生成内容由你决定是否采用。</small></p></li>
            <li><span>03</span><p><strong>定期带走作品</strong><small>可导出章节、整本书和本地作品备份。</small></p></li>
          </ol>
        </div>

        <nav class="authoring-welcome__tools" aria-label="其他工作区">
          <router-link to="/settings/structured">补充设定</router-link>
          <router-link to="/materials">整理素材</router-link>
          <button type="button" @click="settings.open('ai')">配置 AI</button>
        </nav>
      </aside>
    </main>
    <SettingsPopup v-if="settings.isOpen.value" />
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref } from 'vue'
import { useSettingsPopup } from '../composables/useSettingsPopup.js'
import { loadWritingBooks, subscribeWritingBooks } from '../services/writing/writingBooksRepository.js'
import SettingsPopup from '../components/workbench/SettingsPopup.vue'

const settings = useSettingsPopup()
const books = ref(loadWritingBooks())
const recentBooks = ref([...books.value].sort(byUpdatedAt).slice(0, 3))

const stopBooks = subscribeWritingBooks(({ books: nextBooks }) => {
  books.value = Array.isArray(nextBooks) ? nextBooks : []
  recentBooks.value = [...books.value].sort(byUpdatedAt).slice(0, 3)
})

function byUpdatedAt(left, right) {
  return Date.parse(right?.updatedAt || right?.createdAt || 0) - Date.parse(left?.updatedAt || left?.createdAt || 0)
}

function bookWordCount(book) {
  return (book?.chapters || []).reduce((total, chapter) => total + Number(chapter?.wordCount || 0), 0)
}

onBeforeUnmount(() => {
  stopBooks()
  settings.close()
})
</script>

<style scoped>
.authoring-welcome {
  min-height: var(--app-viewport-height, 100vh);
  display: flex;
  flex-direction: column;
  overflow: auto;
  background:
    linear-gradient(90deg, transparent 0 66%, color-mix(in srgb, var(--archive-olive) 6%, transparent) 66%),
    var(--archive-paper, var(--bg-primary));
  color: var(--archive-ink, var(--text-primary));
}

.authoring-welcome__chrome {
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: min(1180px, calc(100% - 48px));
  margin: 0 auto;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 16%, transparent);
}

.authoring-welcome__chrome > strong { font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; }
.authoring-welcome__chrome nav { display: flex; align-items: center; gap: 20px; }
.authoring-welcome__chrome a,
.authoring-welcome__chrome button,
.authoring-welcome__tools a,
.authoring-welcome__tools button { border: 0; background: none; color: var(--archive-ink-soft, var(--text-secondary)); font: inherit; font-size: 12px; text-decoration: none; cursor: pointer; }

.authoring-welcome__main {
  flex: 1;
  width: min(1180px, calc(100% - 48px));
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.8fr);
  gap: clamp(56px, 8vw, 120px);
  align-items: center;
  padding: 64px 0 76px;
}

.authoring-welcome__intro { max-width: 720px; }
.authoring-welcome__eyebrow,
.authoring-welcome__section-label { color: var(--archive-olive); font-size: 11px; font-weight: 700; letter-spacing: 0.12em; }
.authoring-welcome__intro h1 { margin: 18px 0 24px; font: 700 clamp(42px, 5.4vw, 72px)/1.14 var(--font-serif); letter-spacing: -0.035em; }
.authoring-welcome__intro > p { max-width: 570px; margin: 0; color: var(--archive-ink-soft, var(--text-secondary)); font-size: 16px; line-height: 1.9; }

.authoring-welcome__actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 34px; }
.authoring-welcome__actions a { min-height: 46px; display: inline-flex; align-items: center; justify-content: center; padding: 0 22px; border-radius: 3px; font-size: 14px; font-weight: 650; text-decoration: none; }
.authoring-welcome__primary { border: 1px solid var(--archive-ink); background: var(--archive-ink); color: var(--archive-paper); }
.authoring-welcome__secondary { border: 1px solid color-mix(in srgb, var(--archive-ink) 28%, transparent); color: var(--archive-ink); }

.authoring-welcome__local-note { max-width: 570px; display: grid; gap: 4px; margin-top: 42px; padding-top: 18px; border-top: 1px solid color-mix(in srgb, var(--archive-ink) 16%, transparent); font-size: 12px; }
.authoring-welcome__local-note span { color: var(--archive-ink-soft, var(--text-secondary)); line-height: 1.6; }

.authoring-welcome__guide { display: grid; gap: 30px; padding: 28px 0 28px 28px; border-left: 1px solid color-mix(in srgb, var(--archive-ink) 18%, transparent); }
.authoring-welcome__recent,
.authoring-welcome__steps { display: grid; gap: 12px; }
.authoring-welcome__recent > a { display: flex; align-items: center; justify-content: space-between; min-height: 58px; gap: 12px; padding: 0 2px 10px; border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 13%, transparent); color: inherit; text-decoration: none; }
.authoring-welcome__recent > a > span:first-child { min-width: 0; display: grid; gap: 4px; }
.authoring-welcome__recent strong { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.authoring-welcome__recent small { color: var(--archive-ink-soft, var(--text-secondary)); }

.authoring-welcome__steps ol { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.authoring-welcome__steps li { display: grid; grid-template-columns: 30px 1fr; gap: 12px; padding: 14px 0; border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 12%, transparent); }
.authoring-welcome__steps li > span { padding-top: 2px; color: var(--archive-olive); font-size: 10px; font-variant-numeric: tabular-nums; }
.authoring-welcome__steps p { display: grid; gap: 4px; margin: 0; }
.authoring-welcome__steps strong { font-size: 13px; }
.authoring-welcome__steps small { color: var(--archive-ink-soft, var(--text-secondary)); font-size: 12px; line-height: 1.55; }
.authoring-welcome__tools { display: flex; flex-wrap: wrap; gap: 16px; }
.authoring-welcome__tools a,
.authoring-welcome__tools button { padding: 0; text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--archive-ink) 24%, transparent); text-underline-offset: 4px; }

@media (max-width: 820px) {
  .authoring-welcome { background: var(--archive-paper, var(--bg-primary)); }
  .authoring-welcome__main { grid-template-columns: 1fr; gap: 54px; align-items: start; padding-top: 48px; }
  .authoring-welcome__guide { padding: 26px 0 0; border-top: 1px solid color-mix(in srgb, var(--archive-ink) 18%, transparent); border-left: 0; }
}

@media (max-width: 520px) {
  .authoring-welcome__chrome,
  .authoring-welcome__main { width: calc(100% - 32px); }
  .authoring-welcome__chrome { min-height: 54px; }
  .authoring-welcome__chrome nav { gap: 14px; }
  .authoring-welcome__main { gap: 42px; padding: 42px 0 56px; }
  .authoring-welcome__intro h1 { margin-top: 14px; font-size: 38px; }
  .authoring-welcome__intro > p { font-size: 14px; line-height: 1.75; }
  .authoring-welcome__actions { display: grid; }
  .authoring-welcome__actions a { min-height: 48px; }
  .authoring-welcome__local-note { margin-top: 30px; }
}
</style>
