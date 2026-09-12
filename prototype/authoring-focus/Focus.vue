<script setup>
import { computed, nextTick, ref } from 'vue'
import WorkbenchIcon from '../../src/components/workbench/WorkbenchIcon.vue'

// Fixed, deliberately authored content: no provider, persistence or repository access.
const routes = {
  conceal: {
    title: '把缺页藏起来', consequence: '秘密保住了，信任开始松动。',
    steps: [
      { action: '莉娜把缺页收进袖口', text: ['艾德加的脚步停在门外。莉娜合上总册，把那张薄纸压进袖口。', '“找到了吗？”他问。', '她摇头。艾德加没有进来，只把手里的灯搁在门槛上。灯光照着两人之间的地板，谁也没有去拿。'] },
      { action: '问他为什么不进来', text: ['“你还没让我进去。”艾德加说。', '莉娜让开半步。他却先看了看她的袖口，然后才跨过门槛。', '“那就从第一本开始找。”他把灯推到桌子中央，给自己留了一个能看见她双手的位置。'] }
    ]
  },
  admit: {
    title: '让他看见缺页', consequence: '他愿意帮忙，但要一起查下去。',
    steps: [
      { action: '莉娜把缺页递给艾德加', text: ['莉娜把薄纸摊在灯下，没有挡住上面的名字。', '艾德加接过去，指腹停在断开的装订线上。“这不是撕下来的。有人拆过整本总册。”', '他抬头看她。这一次，问的不是她在找什么，而是：“还有谁碰过它？”'] },
      { action: '请他帮忙辨认装订线', text: ['艾德加从衣袋里取出一枚细针，挑起纸边残留的线头。线是新的，针孔却已经磨圆。', '“有人缝回去过。”他说，“我可以帮你找出是哪一本。”', '莉娜刚要道谢，他便按住了总册。“但找到以后，我们一起看。”'] }
    ]
  }
}
const origin = '走廊里响起脚步声。莉娜低下头，才发现总册里夹着一张缺页，上面写着艾德加的名字。'
const mode = ref('writing')
const active = ref('conceal')
const depths = ref({ conceal: 0, admit: 0 })
const drafts = ref({ conceal: null, admit: null })
const adopted = ref('')
const picking = ref(false)
const mobileBranch = ref('conceal')
const notice = ref('')
const dark = ref(false)
const draftVisible = ref(false)
const draftKey = ref('conceal')
const entry = ref(null)
const heading = ref(null)
const draftInput = ref(null)
const current = computed(() => routes[active.value])
const steps = computed(() => picking.value ? [] : current.value.steps.slice(0, depths.value[active.value]))
const explored = computed(() => Object.keys(routes).filter(key => depths.value[key] > 0))
const comparing = computed(() => mode.value === 'compare')
const draft = computed({ get: () => drafts.value[draftKey.value] || '', set: value => { drafts.value[draftKey.value] = value } })

async function focusHeading() {
  await nextTick()
  heading.value?.focus({ preventScroll: true })
}
function enter() {
  mode.value = 'explore'
  notice.value = ''
  focusHeading()
}
async function leave() {
  mode.value = 'writing'
  await nextTick()
  entry.value?.focus({ preventScroll: true })
}
function choose(key) {
  active.value = key
  depths.value[key] = Math.max(1, depths.value[key])
  picking.value = false
  mode.value = 'explore'
  notice.value = ''
  focusHeading()
}
async function advance() {
  depths.value[active.value] = Math.min(2, depths.value[active.value] + 1)
  await nextTick()
  const plane = document.querySelector('.reading-plane')
  if (plane && window.innerWidth > 720) plane.scrollTop = plane.scrollHeight
}
function fork() { picking.value = true; mode.value = 'explore'; focusHeading() }
function compare() { mobileBranch.value = active.value; mode.value = 'compare'; focusHeading() }
function edit(key = active.value) {
  active.value = key
  draftKey.value = key
  if (drafts.value[key] === null) drafts.value[key] = routes[key].steps.slice(0, depths.value[key]).flatMap(step => step.text).join('\n\n')
  draftVisible.value = true
  notice.value = ''
  nextTick(() => draftInput.value?.focus())
}
function useDraft() {
  if (!draft.value.trim()) return
  adopted.value = draft.value
  draftVisible.value = false
  notice.value = '已放回样例稿页。仅本页暂存，未写入你的作品。'
}
function toggleTheme() {
  dark.value = !dark.value
  document.documentElement.classList.toggle('theme-dark', dark.value)
}
</script>

<template>
  <div class="focus-prototype" :class="{ 'is-writing': mode === 'writing', 'is-comparing': comparing }">
    <header class="masthead">
      <span class="brand">PINAX <span>创作</span></span>
      <span class="prototype-note">交互原型 · 固定样例</span>
      <button class="theme-switch" :aria-label="dark ? '切换浅色' : '切换深色'" @click="toggleTheme">{{ dark ? '浅色' : '深色' }}</button>
    </header>

    <div class="same-screen" :class="{ 'has-rehearsal': mode !== 'writing' }">
    <main class="manuscript">
      <div class="book-title">雾港纪事 <span>/ 第二章</span></div>
      <h1>第三排第七格</h1>
      <div class="focus-prose" contenteditable="true" role="textbox" aria-label="样例正文" aria-multiline="true" spellcheck="false">
        <p>莉娜把油灯放到第三排书架前。灯焰向左偏，像被一口看不见的气息牵住。</p>
        <p>她没有立刻翻找总册，而是先数墙上的水痕：一道、两道、三道。最上面那道水痕旁，多了一个昨夜还不存在的名字。</p>
        <p>黄铜钥匙在她掌心发热。税务所后门仍锁着，门缝里却漏进海潮退去后的腥味。</p>
        <p class="origin-paragraph">{{ origin }}</p>
      </div>
      <div class="entry-line"><span>从缺页出现的这一刻</span><button ref="entry" class="ink-button" @click="mode === 'writing' ? enter() : leave()">{{ mode !== 'writing' ? '收起推演' : explored.length ? '继续这次推演' : '从这里推演' }}<WorkbenchIcon name="arrow-right" :size="16" /></button></div>
      <section v-if="draftVisible" class="inline-draft">
        <div class="seam"><span>{{ routes[draftKey].title }} · 试稿</span><span>未采用</span></div>
        <label class="draft-label"><textarea ref="draftInput" v-model="draft" aria-label="编辑试稿" spellcheck="false" /></label>
        <div class="draft-actions"><button @click="draftVisible = false">收起试稿</button><button class="primary" :disabled="!draft.trim()" @click="useDraft">采用到样例稿页</button></div>
      </section>
      <div v-if="adopted" class="focus-prose adopted" data-test="adopted-sample"><p v-for="(p, i) in adopted.split('\n\n')" :key="i">{{ p }}</p></div>
      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    </main>

    <div v-if="mode !== 'writing'" class="focus-workspace">

      <main class="reading-plane" :class="{ 'comparison-plane': comparing }">
        <header class="reading-head">
          <div><h1 ref="heading" tabindex="-1">推演</h1></div>
          <button class="quiet" @click="leave">收起</button>
        </header>
        <div v-if="explored.length" class="branch-tabs"><button v-for="key in explored" :key="key" :aria-pressed="active === key" @click="choose(key)">{{ routes[key].title }}</button><button v-if="explored.length === 2" @click="mode = comparing ? 'explore' : 'compare'">{{ comparing ? '收起对照' : '对照' }}</button></div>

        <template v-if="mode === 'explore'">
          <section v-for="(step, index) in steps" :key="active + index" class="beat">
            <div class="intervention"><span>{{ step.action }}</span><button v-if="index === 0" @click="fork">换个选择</button></div>
            <div class="focus-prose"><p v-for="(p, i) in step.text" :key="i">{{ p }}</p></div>
          </section>
          <section v-if="picking || !steps.length" class="choices" aria-label="起点选择">
            <h2>她要不要让他看见那张纸？</h2>
            <button v-for="(route, key) in routes" :key="key" @click="choose(key)"><span>{{ route.title }}</span><WorkbenchIcon name="arrow-right" :size="17" /></button>
            <p class="sample-note">此原型演示这两种选择；自由行动在生产接线时接入。</p>
          </section>
          <section v-else class="next-move">
            <template v-if="steps.length < 2"><span class="minor-label">接下来</span><button class="next-choice" @click="advance">{{ current.steps[1].action }}<WorkbenchIcon name="arrow-right" :size="17" /></button></template>
            <p v-else class="outcome">{{ current.consequence }}</p>
            <div class="reading-actions">
              <button v-if="explored.length === 2" @click="compare">对照另一种走法</button>
              <button v-else @click="fork">回到起点，试另一种</button>
              <button class="ink-button" @click="edit()">沿这条走法写成试稿<WorkbenchIcon name="arrow-right" :size="16" /></button>
            </div>
          </section>
        </template>

        <template v-else-if="comparing">
          <p class="comparison-intro">只看从那张缺页开始，不同选择怎样改变了两人的关系。</p>
          <div class="mobile-tabs" aria-label="切换对照走法"><button v-for="key in explored" :key="key" :aria-pressed="mobileBranch === key" @click="mobileBranch = key">{{ routes[key].title }}</button></div>
          <div class="comparison-grid">
            <article v-for="key in explored" :key="key" :class="{ 'mobile-visible': mobileBranch === key }">
              <h2>{{ routes[key].title }}</h2>
              <p class="comparison-outcome">{{ routes[key].consequence }}</p>
              <div class="focus-prose"><p v-for="(p, i) in routes[key].steps[depths[key] - 1].text" :key="i">{{ p }}</p></div>
              <button class="ink-button" @click="edit(key)">选这条走法<WorkbenchIcon name="arrow-right" :size="16" /></button>
            </article>
          </div>
        </template>

      </main>
    </div>
    </div>
  </div>
</template>

<style>
* { box-sizing:border-box; }
body { margin:0; background:var(--surface-workbench-muted); color:var(--archive-ink); font:14px/1.6 system-ui,sans-serif; }
button, textarea { font:inherit; }
button { color:inherit; background:none; border:0; padding:8px 12px; min-height:44px; cursor:pointer; }
button:disabled { opacity:.45; cursor:not-allowed; }
button:not(:disabled):hover { color:var(--accent); }
button:focus-visible, textarea:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
button svg { flex-shrink:0; }
h1,h2,p { margin:0; }
.masthead { height:64px; display:flex; align-items:center; gap:16px; padding:0 32px; border-bottom:1px solid var(--hairline-soft); background:var(--archive-paper); }
.brand { font-weight:700; letter-spacing:.12em; font-size:13px; }
.brand span { margin-left:8px; font-weight:400; letter-spacing:0; color:var(--text-secondary); }
.return { display:flex; align-items:center; gap:10px; padding-left:0; font-size:13px; }
.prototype-note { margin-left:auto; font-size:11px; color:var(--text-muted); }
.theme-switch { padding:8px; color:var(--text-secondary); font-size:12px; }
.manuscript { max-width:800px; min-height:calc(100dvh - 64px); margin:0 auto; padding:64px 60px 120px; background:var(--archive-paper-soft); }
.book-title { font-size:12px; color:var(--text-secondary); margin-bottom:20px; }
.book-title span { color:var(--text-muted); margin-left:12px; }
h1 { font:500 30px/1.5 'Noto Serif CJK SC','Songti SC',serif; letter-spacing:.02em; }
.manuscript h1 { margin-bottom:40px; }
.focus-prose { font:18px/2 'Noto Serif CJK SC','Songti SC',serif; overflow-wrap:anywhere; }
.focus-prose p + p { margin-top:20px; }
.origin-paragraph { padding-bottom:20px; }
.entry-line { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:16px 0 28px; padding:12px 0; border-block:1px solid var(--hairline-soft); font-size:12px; color:var(--text-muted); }
.ink-button { display:inline-flex; align-items:center; gap:10px; color:var(--accent); padding-left:0; font-size:13px; }
.notice { color:var(--text-secondary); font-size:13px; margin-top:24px; }
.focus-workspace { display:grid; grid-template-columns:200px minmax(0, 1fr); max-width:1240px; margin:0 auto; min-height:calc(100dvh - 64px); }
.route-index { align-self:start; position:sticky; top:32px; padding:48px 24px 32px 8px; }
.index-book { font-size:13px; margin-bottom:30px; }
.index-book span { display:block; margin-top:6px; color:var(--text-muted); font-size:12px; }
.origin-link { padding-left:0; font-size:12px; color:var(--text-secondary); }
.route-list { margin-top:32px; }
.route-list > small { color:var(--text-muted); font-size:11px; }
.route-list button { width:100%; text-align:left; padding:10px 0 10px 12px; border-left:1px solid var(--border); display:grid; gap:2px; margin-top:10px; font-size:13px; }
.route-list button small { color:var(--text-muted); font-size:11px; }
.route-list button[aria-pressed=true] { color:var(--accent); border-left:2px solid var(--accent); }
.route-list .compare-link { display:flex; align-items:center; gap:8px; padding-left:0; border:0; margin-top:18px; font-size:12px; }
.session-note { margin-top:48px; font-size:11px; line-height:1.9; color:var(--text-muted); }
.reading-plane { background:var(--archive-paper-soft); padding:44px clamp(32px,5vw,80px) 90px; min-width:0; max-width:940px; border-inline:1px solid var(--hairline-soft); }
.reading-head { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:28px; }
.mode-label { display:block; color:var(--text-muted); font-size:11px; margin-bottom:10px; }
.reading-head h1:focus { outline:none; }
.reading-head .quiet { font-size:12px; white-space:nowrap; color:var(--text-secondary); padding-right:0; }
.origin-excerpt { padding-bottom:26px; }
.origin-excerpt > span { font-size:11px; color:var(--text-muted); }
.origin-excerpt p { margin-top:8px; font:15px/1.9 'Noto Serif CJK SC','Songti SC',serif; color:var(--text-secondary); }
.seam { display:flex; align-items:center; gap:12px; padding-top:16px; border-top:1px solid var(--hairline-soft); color:var(--accent); font-size:11px; }
.seam span:last-child { margin-left:auto; color:var(--text-muted); }
.beat { padding-top:24px; }
.beat + .beat { margin-top:26px; }
.intervention { display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:12px; color:var(--text-secondary); margin-bottom:18px; }
.intervention > span::before { content:'↳'; margin-right:10px; color:var(--accent); }
.intervention button { padding:0; min-height:44px; font-size:11px; color:var(--text-secondary); }
.choices { margin-top:30px; }
.choices h2 { font:500 21px/1.7 'Noto Serif CJK SC','Songti SC',serif; margin-bottom:22px; }
.choices > button { display:flex; align-items:center; justify-content:space-between; width:100%; padding:18px 0; border-bottom:1px solid var(--hairline-soft); text-align:left; font-size:16px; }
.choices svg { color:var(--accent); }
.sample-note { margin-top:20px; font-size:11px; color:var(--text-muted); line-height:1.8; }
.next-move { border-top:1px solid var(--hairline-soft); margin-top:32px; padding-top:20px; }
.minor-label { font-size:11px; color:var(--text-muted); }
.next-choice { padding:8px 0; display:flex; align-items:center; justify-content:space-between; gap:16px; width:100%; font-size:15px; text-align:left; }
.next-choice svg { color:var(--accent); }
.reading-actions { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; margin-top:20px; }
.reading-actions > button:first-child { padding-left:0; font-size:12px; color:var(--text-secondary); }
.outcome { color:var(--text-secondary); font-size:14px; }
.comparison-plane { max-width:none; padding-inline:44px; }
.comparison-intro { margin:8px 0 26px; font-size:13px; color:var(--text-secondary); }
.comparison-grid { display:grid; grid-template-columns:1fr 1fr; gap:32px; }
.comparison-grid article { min-width:0; }
.comparison-grid article + article { border-left:1px solid var(--hairline-soft); padding-left:32px; }
.comparison-grid h2 { font:500 23px/1.6 'Noto Serif CJK SC','Songti SC',serif; }
.comparison-outcome { font-size:13px; color:var(--accent); margin:12px 0 28px; }
.comparison-grid .focus-prose { font-size:17px; }
.comparison-grid .ink-button { margin-top:26px; }
.mobile-tabs { display:none; }
.draft-label { display:block; margin-top:24px; }
.draft-label textarea { width:100%; min-height:440px; resize:vertical; border:0; background:none; color:var(--archive-ink); font:18px/2 'Noto Serif CJK SC','Songti SC',serif; padding:0 6px; }
.draft-actions { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; border-top:1px solid var(--hairline-soft); padding-top:18px; margin-top:18px; }
.draft-actions > button:first-child { padding-left:0; font-size:13px; color:var(--text-secondary); }
.primary { display:flex; align-items:center; justify-content:center; gap:10px; background:var(--accent); color:var(--accent-text); padding:10px 20px; border-radius:3px; font-size:13px; }
.primary:not(:disabled):hover { background:var(--accent-hover); color:var(--accent-text); }
.sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
@media (max-width:980px) {
  .focus-workspace { grid-template-columns:160px minmax(0,1fr); }
  .route-index { padding-left:20px; padding-right:16px; }
  .reading-plane { padding-inline:32px; }
  .comparison-grid { gap:20px; }
  .comparison-grid article + article { padding-left:20px; }
}
@media (max-width:720px) {
  .masthead { height:52px; padding:0 18px; gap:10px; }
  .return { font-size:12px; }
  .return svg { display:none; }
  .prototype-note { font-size:10px; }
  .focus-workspace { display:block; }
  .route-index { display:none; }
  .reading-plane { border:0; min-height:calc(100dvh - 52px); padding:28px 24px 60px; }
  .manuscript { padding:36px 24px 64px; }
  h1 { font-size:25px; }
  .reading-head { gap:10px; margin-bottom:24px; }
  .reading-head h1 { font-size:25px; }
  .reading-head .quiet { font-size:11px; }
  .focus-prose { font-size:17px; line-height:1.95; }
  .focus-prose p + p { margin-top:16px; }
  .origin-excerpt { padding-bottom:22px; }
  .origin-excerpt p { font-size:14px; }
  .intervention { margin-bottom:12px; }
  .intervention button { min-height:44px; }
  .entry-line { flex-direction:column; align-items:flex-start; gap:2px; }
  .reading-actions { align-items:flex-start; flex-direction:column; }
  .mobile-tabs { display:flex; gap:8px; border-bottom:1px solid var(--hairline-soft); margin:0 0 24px; }
  .mobile-tabs button { flex:1; padding:8px 0; font-size:13px; }
  .mobile-tabs button[aria-pressed=true] { color:var(--accent); border-bottom:2px solid var(--accent); }
  .comparison-grid { display:block; }
  .comparison-grid article { display:none; }
  .comparison-grid article.mobile-visible { display:block; }
  .comparison-grid article + article { border:0; padding:0; }
  .comparison-grid h2 { font-size:22px; }
  .draft-label textarea { font-size:17px; min-height:55dvh; }
}
@media (prefers-reduced-motion:no-preference) {
  .beat { animation:appear .22s ease-out; }
  @keyframes appear { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
}
</style>

<style>
.same-screen { max-width:1440px; margin:auto; }
.same-screen.has-rehearsal { display:grid; grid-template-columns:minmax(0, 1.15fr) minmax(0, 1fr); }
.same-screen .manuscript { width:100%; padding:44px 44px 80px; height:calc(100dvh - 64px); overflow:auto; }
.same-screen .focus-workspace { display:block; min-height:0; height:calc(100dvh - 64px); overflow:hidden; }
.same-screen .reading-plane { height:100%; overflow:auto; padding:24px 32px 48px; background:var(--archive-paper); }
.same-screen .reading-head { margin-bottom:12px; align-items:center; }
.same-screen .reading-head h1 { font:500 18px/1.5 system-ui,sans-serif; }
.same-screen .focus-prose { font-size:17px; line-height:1.95; }
.same-screen .beat + .beat { margin-top:12px; }
.same-screen .comparison-grid { display:block; }
.same-screen .comparison-grid article + article { border-left:0; border-top:1px solid var(--hairline-soft); padding:24px 0 0; margin-top:24px; }
.same-screen .comparison-grid h2 { font-size:19px; }
.same-screen .comparison-intro { display:none; }
.same-screen .mobile-tabs { display:none; }
.same-screen .comparison-grid article { display:block; }
.branch-tabs { display:flex; flex-wrap:wrap; gap:4px 16px; border-bottom:1px solid var(--hairline-soft); }
.branch-tabs button { padding-inline:0; font-size:12px; color:var(--text-secondary); }
.branch-tabs button[aria-pressed=true] { color:var(--accent); border-bottom:2px solid var(--accent); }
.inline-draft textarea { min-height:340px; }
[contenteditable]:focus-visible { outline:1px solid var(--hairline-soft); outline-offset:8px; }
@media(max-width:720px) {
  .same-screen.has-rehearsal { display:block; }
  .same-screen .manuscript { height:auto; min-height:0; padding:28px 24px; overflow:visible; }
  .same-screen .focus-workspace { height:auto; overflow:visible; }
  .same-screen .reading-plane { height:auto; overflow:visible; border-top:1px solid var(--border); padding:20px 24px 48px; min-height:0; }
  .same-screen .manuscript h1 { margin-bottom:24px; }
}
</style>
