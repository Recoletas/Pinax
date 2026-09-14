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

    <main class="authoring-welcome__main" :class="{ 'is-returning': Boolean(primaryBook) }">
      <section class="authoring-welcome__intro" :aria-labelledby="primaryBook ? 'authoring-welcome-continue-title' : 'authoring-welcome-title'">
        <template v-if="primaryBook">
          <h1 id="authoring-welcome-continue-title" class="authoring-welcome__sr-title">回到书稿</h1>
          <span class="authoring-welcome__eyebrow">回到书稿</span>
          <router-link
            class="authoring-welcome__continue"
            data-test="welcome-continue-book"
            :to="{ name: 'authoring', query: { bookId: primaryBook.id } }"
          >
            <strong>{{ primaryBook.title || '未命名书稿' }}</strong>
            <small>{{ primaryBook.chapters.length }} 章 · {{ bookWordCount(primaryBook).toLocaleString('zh-CN') }} 字</small>
          </router-link>

          <div class="authoring-welcome__actions authoring-welcome__actions--secondary">
            <router-link class="authoring-welcome__secondary" data-test="welcome-start-authoring" to="/authoring?start=new&guide=first-run">另起一本</router-link>
            <router-link class="authoring-welcome__secondary" data-test="welcome-import-manuscript" to="/authoring?start=import&guide=first-run">导入已有书稿</router-link>
          </div>

          <div class="authoring-welcome__local-note">
            <strong>作品保存在当前浏览器</strong>
            <span>不会自动跨设备同步。写作一段时间后，请在“备份”中导出作品备份。</span>
          </div>
        </template>

        <template v-else>
          <span class="authoring-welcome__eyebrow">以作者为中心的创作工作台</span>
          <h1 id="authoring-welcome-title">从一句话开始，<br>让故事慢慢长出来。</h1>
          <p>直接写正文，不必先建立世界，也不必先配置 AI。需要时再打开设定、批注和推演。</p>

          <div class="authoring-welcome__actions">
            <router-link class="authoring-welcome__primary" data-test="welcome-start-authoring" to="/authoring?start=new&guide=first-run">开始写作</router-link>
            <router-link class="authoring-welcome__secondary" data-test="welcome-import-manuscript" to="/authoring?start=import&guide=first-run">导入已有书稿</router-link>
          </div>

          <div class="authoring-welcome__local-note">
            <strong>作品保存在当前浏览器</strong>
            <span>不会自动跨设备同步。写作一段时间后，请在“备份”中导出作品备份。</span>
          </div>
        </template>
      </section>

      <aside class="authoring-welcome__guide" aria-label="开始使用">
        <div v-if="otherBooks.length" class="authoring-welcome__recent">
          <span class="authoring-welcome__section-label">其他书稿</span>
          <router-link
            v-for="book in otherBooks"
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

        <div class="authoring-welcome__journey">
          <span class="authoring-welcome__section-label">一条最短创作回路</span>
          <p class="authoring-welcome__journey-lede">不用先学完所有工具，只顺着故事完成这一轮。</p>
          <ol>
            <li>
              <span aria-hidden="true">01</span>
              <p><strong>写一场</strong><small>从眼前正在发生的事开始。</small></p>
            </li>
            <li>
              <span aria-hidden="true">02</span>
              <p><strong>放入人物</strong><small>角色 → 当前场，告诉 Pinax 谁能回应。</small></p>
            </li>
            <li>
              <span aria-hidden="true">03</span>
              <p><strong>试一条岔路</strong><small>推演回应和另一种走法，再决定是否写回。</small></p>
            </li>
          </ol>
          <p class="authoring-welcome__journey-end">进入稿面后会继续提示当前下一步；随时可以关闭。</p>
        </div>

        <nav class="authoring-welcome__tools" aria-label="开始前的帮助">
          <span>AI 暂时不可用？</span>
          <button type="button" @click="settings.open('ai')">测试模型连接</button>
        </nav>
      </aside>
    </main>
    <SettingsPopup v-if="settings.isOpen.value" />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
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

// 回访作者的首要内容是最近作品本身;空库才展示完整欢迎语与两条主路径。
const primaryBook = computed(() => recentBooks.value[0] || null)
const otherBooks = computed(() => recentBooks.value.slice(1))

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
.authoring-welcome__sr-title {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.authoring-welcome__eyebrow,
.authoring-welcome__section-label { color: var(--archive-olive); font-size: 11px; font-weight: 700; letter-spacing: 0.12em; }
.authoring-welcome__intro h1 { margin: 18px 0 24px; font: 700 clamp(42px, 5.4vw, 72px)/1.14 var(--font-serif); letter-spacing: -0.035em; }
.authoring-welcome__intro > p { max-width: 570px; margin: 0; color: var(--archive-ink-soft, var(--text-secondary)); font-size: 16px; line-height: 1.9; }

/* 回访:最近作品是首要内容,继续动作一个、直接打开该书。 */
.authoring-welcome__continue { display: grid; gap: 8px; margin-top: 16px; color: inherit; text-decoration: none; }
.authoring-welcome__continue strong {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  font: 700 clamp(26px, 3vw, 40px)/1.3 var(--font-serif);
  letter-spacing: -0.01em;
  word-break: break-word;
}
.authoring-welcome__continue small { color: var(--archive-ink-soft, var(--text-secondary)); font-size: 13px; }
.authoring-welcome__continue:hover strong,
.authoring-welcome__continue:focus-visible strong { color: var(--archive-olive); }
.authoring-welcome__continue:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 4px; }

.authoring-welcome__actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 34px; }
.authoring-welcome__actions a { min-height: 46px; display: inline-flex; align-items: center; justify-content: center; padding: 0 22px; border-radius: 3px; font-size: 14px; font-weight: 650; text-decoration: none; }
.authoring-welcome__primary { border: 1px solid var(--archive-ink); background: var(--archive-ink); color: var(--archive-paper); }
.authoring-welcome__secondary { border: 1px solid color-mix(in srgb, var(--archive-ink) 28%, transparent); color: var(--archive-ink); }
.authoring-welcome__actions--secondary { margin-top: 20px; }
.authoring-welcome__actions--secondary a { min-height: 40px; font-size: 13px; font-weight: 500; }

.authoring-welcome__local-note { max-width: 570px; display: grid; gap: 4px; margin-top: 42px; padding-top: 18px; border-top: 1px solid color-mix(in srgb, var(--archive-ink) 16%, transparent); font-size: 12px; }
.authoring-welcome__local-note span { color: var(--archive-ink-soft, var(--text-secondary)); line-height: 1.6; }

.authoring-welcome__guide { display: grid; gap: 30px; padding: 28px 0 28px 28px; border-left: 1px solid color-mix(in srgb, var(--archive-ink) 18%, transparent); }
.authoring-welcome__recent,
.authoring-welcome__journey { display: grid; gap: 12px; }
.authoring-welcome__recent > a { display: flex; align-items: center; justify-content: space-between; min-height: 58px; gap: 12px; padding: 0 2px 10px; border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 13%, transparent); color: inherit; text-decoration: none; }
.authoring-welcome__recent > a > span:first-child { min-width: 0; display: grid; gap: 4px; }
.authoring-welcome__recent strong { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.authoring-welcome__recent small { color: var(--archive-ink-soft, var(--text-secondary)); }

.authoring-welcome__journey-lede { max-width: 330px; margin: 2px 0 4px; color: var(--archive-ink-soft, var(--text-secondary)); font-size: 13px; line-height: 1.7; }
.authoring-welcome__journey ol { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; counter-reset: none; }
.authoring-welcome__journey li { position: relative; display: grid; grid-template-columns: 32px 1fr; gap: 12px; padding: 14px 0 16px; }
.authoring-welcome__journey li:not(:last-child)::after { position: absolute; top: 34px; bottom: -2px; left: 11px; width: 1px; background: color-mix(in srgb, var(--archive-olive) 32%, transparent); content: ''; }
.authoring-welcome__journey li > span { display: grid; place-items: center; align-self: start; width: 23px; height: 23px; border: 1px solid color-mix(in srgb, var(--archive-olive) 50%, transparent); border-radius: 50%; color: var(--archive-olive); font-size: 9px; font-variant-numeric: tabular-nums; }
.authoring-welcome__journey p { display: grid; gap: 5px; margin: 0; }
.authoring-welcome__journey strong { font-size: 14px; }
.authoring-welcome__journey small { color: var(--archive-ink-soft, var(--text-secondary)); font-size: 12px; line-height: 1.65; }
.authoring-welcome__journey-end { margin: 4px 0 0; padding-top: 14px; border-top: 1px solid color-mix(in srgb, var(--archive-ink) 14%, transparent); color: var(--archive-ink-soft, var(--text-secondary)); font-size: 11px; line-height: 1.6; }
.authoring-welcome__tools { display: flex; align-items: baseline; gap: 7px; color: var(--archive-ink-soft, var(--text-secondary)); font-size: 11px; }
.authoring-welcome__tools button { padding: 0; color: var(--archive-ink); text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--archive-ink) 24%, transparent); text-underline-offset: 4px; }

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
  .authoring-welcome__guide { gap: 26px; }
  .authoring-welcome__journey-lede { max-width: none; }
  /* 回访:最近作品在欢迎介绍之前,第一屏直接可点。 */
  .authoring-welcome__main.is-returning { padding-top: 30px; gap: 34px; }
  .authoring-welcome__main.is-returning .authoring-welcome__continue strong { font-size: 26px; }
}
</style>
