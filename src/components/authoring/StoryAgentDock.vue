<!-- StoryAgent 控制台坞：适配器运维 + 会话只读面板（可收起悬浮板）。
     功能分区：助手=对话与资料；本坞=引擎运维（健康/契约/任务/取消）与会话查看。
     不写书稿/世界书；自包含 fetch，不经桥件。 -->
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const endpoint = String(import.meta.env.VITE_PI_ADAPTER_URL || 'http://127.0.0.1:8451')
const route = useRoute()

const open = ref(false)
const tab = ref('engine')
const health = ref(null)
const contractCheck = ref('')
const tasks = ref([])
const expandedTask = ref('')
const taskPreview = ref({})
const sessions = ref([])
const now = ref(Date.now())

const visible = computed(() => route.name === 'authoring' || route.name === 'experience')
const bookId = computed(() => String(route.query.bookId || ''))

async function refresh() {
  checkHealth()
  loadTasks()
  loadSessions()
}

async function checkHealth() {
  health.value = await fetch(`${endpoint}/healthz`).then((r) => r.json()).catch(() => null)
}

async function checkContract() {
  contractCheck.value = '检查中…'
  try {
    const res = await fetch(`${endpoint}/v1/pinax/contract`)
    contractCheck.value = (await res.text()).includes('schemaVersion') ? '✓ 契约帧正常' : '✗ 契约帧异常'
  } catch (e) {
    contractCheck.value = `✗ 不可达：${String(e.message || e).slice(0, 60)}`
  }
}

async function loadTasks() {
  try {
    const j = await fetch(`${endpoint}/v1/pinax/tasks/list`).then((r) => r.json())
    tasks.value = (j?.tasks || []).slice(0, 15)
    now.value = Date.now()
  } catch {
    tasks.value = []
  }
}

async function toggleTask(taskId) {
  expandedTask.value = expandedTask.value === taskId ? '' : taskId
  if (!expandedTask.value) return
  taskPreview.value = { ...taskPreview.value, [taskId]: '读取中…' }
  try {
    const snap = await fetch(`${endpoint}/v1/pinax/tasks/${encodeURIComponent(taskId)}`).then((r) => r.json())
    taskPreview.value = { ...taskPreview.value, [taskId]: String(snap.finalText || '（无正文）').slice(0, 400) }
  } catch (e) {
    taskPreview.value = { ...taskPreview.value, [taskId]: `读取失败：${String(e.message || e).slice(0, 60)}` }
  }
}

async function cancelTask(taskId) {
  await fetch(`${endpoint}/v1/pinax/tasks/${encodeURIComponent(taskId)}/cancel`, { method: 'POST' }).catch(() => null)
  loadTasks()
}

function loadSessions() {
  try {
    const raw = bookId.value ? localStorage.getItem(`pinax_agent_sessions_${bookId.value}`) : null
    const j = raw ? JSON.parse(raw) : null
    sessions.value = (j?.sessions || []).slice(0, 10).map((s) => ({
      id: s.sessionId,
      title: s.title || s.sessionId,
      count: (s.messages || []).length,
    }))
  } catch {
    sessions.value = []
  }
}

function fmtTime(ts) {
  return ts ? new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''
}

onMounted(() => {
  refresh()
  loadSessions()
})
watch(open, (v) => {
  if (v) { checkHealth(); loadTasks(); loadSessions() }
})
watch(bookId, loadSessions)
</script>

<template>
  <div v-if="visible">
    <button v-if="!open" class="sad-tab" type="button" title="StoryAgent 控制台" @click="open = true">
      StoryAgent
    </button>
    <section v-else class="sad-panel" role="complementary" aria-label="StoryAgent 控制台">
      <header class="sad-head">
        <strong>StoryAgent</strong>
        <span class="sad-health" :class="health?.ok ? 'is-ok' : 'is-down'">{{ health?.ok ? '适配器在线' : '不可达' }}</span>
        <button class="sad-close" type="button" aria-label="关闭 StoryAgent 控制台" @click="open = false">×</button>
      </header>

      <div class="sad-body">
        <div class="sad-tabs" role="tablist">
          <button class="sad-tabbtn" :class="{ 'is-on': tab === 'engine' }" role="tab" :aria-selected="tab === 'engine'" type="button" @click="tab = 'engine'">引擎</button>
          <button class="sad-tabbtn" :class="{ 'is-on': tab === 'tasks' }" role="tab" :aria-selected="tab === 'tasks'" type="button" @click="tab = 'tasks'">任务（{{ tasks.length }}）</button>
          <button class="sad-tabbtn" :class="{ 'is-on': tab === 'sessions' }" role="tab" :aria-selected="tab === 'sessions'" type="button" @click="tab = 'sessions'; loadSessions()">会话（{{ sessions.length }}）</button>
        </div>

        <div v-if="tab === 'engine'" class="sad-section">
          <p class="sad-dim">端点：{{ endpoint }}</p>
          <div class="sad-row">
            <button class="sad-btn" type="button" @click="checkContract">契约自检</button>
            <span class="sad-dim">{{ contractCheck }}</span>
          </div>
          <p class="sad-dim">对话在助手内进行；本坞只负责引擎运维（健康/契约/任务），不写书稿。</p>
        </div>

        <div v-if="tab === 'tasks'" class="sad-section">
          <div class="sad-row">
            <button class="sad-btn" type="button" @click="loadTasks">刷新</button>
            <span class="sad-dim">全部作品的适配器任务（近 {{ tasks.length }} 条）</span>
          </div>
          <ul class="sad-list">
            <li v-for="t in tasks" :key="t.taskId" class="sad-task">
              <span class="sad-dot" :class="`is-${t.status}`" :title="t.status"></span>
              <button class="sad-link" type="button" @click="toggleTask(t.taskId)">{{ t.taskId }}</button>
              <span class="sad-dim">{{ t.bookId ? `归属 ${String(t.bookId).slice(0, 14)}` : '未归属' }} · {{ fmtTime(t.updatedAt) }}</span>
              <button v-if="t.status === 'running'" class="sad-btn sad-mini" type="button" @click="cancelTask(t.taskId)">取消</button>
              <pre v-if="expandedTask === t.taskId" class="sad-preview">{{ taskPreview[t.taskId] || '（展开读取中…）' }}</pre>
            </li>
            <li v-if="!tasks.length" class="sad-dim">（暂无任务）</li>
          </ul>
        </div>

        <div v-if="tab === 'sessions'" class="sad-section">
          <p class="sad-dim">当前作品的 Agent 会话（随书持久化；切换请在助手 ⚙ 中进行）</p>
          <ul class="sad-list">
            <li v-for="s in sessions" :key="s.id" class="sad-session-row">
              <span class="sad-session-title">{{ s.title }}</span>
              <span class="sad-dim">{{ s.count }} 条</span>
            </li>
            <li v-if="!sessions.length" class="sad-dim">（本书暂无会话——在助手发首条创作消息即建立）</li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sad-tab {
  position: fixed;
  right: 0;
  top: 40%;
  z-index: 690;
  writing-mode: vertical-rl;
  letter-spacing: 0.08em;
  padding: 10px 5px;
  border: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  border-right: 0;
  border-radius: 8px 0 0 8px;
  background: var(--archive-paper, #faf9f6);
  color: var(--text-secondary, #555);
  font-size: 11px;
  cursor: pointer;
}

.sad-panel {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 690;
  width: min(360px, 100vw);
  display: flex;
  flex-direction: column;
  background: var(--archive-paper, #faf9f6);
  color: var(--text-primary, #1c1c1c);
  border-left: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  box-shadow: var(--shadow-workbench-float, 0 8px 24px rgba(0, 0, 0, 0.14));
}

.sad-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
}

.sad-close {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--text-muted, #888);
  font-size: 16px;
  cursor: pointer;
}

.sad-health { font-size: 11px; color: var(--text-muted, #888); }
.sad-health.is-ok { color: var(--accent, #2563eb); }

.sad-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
}

.sad-tabs { display: flex; gap: 4px; }

.sad-tabbtn {
  border: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary, #555);
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
}

.sad-tabbtn.is-on {
  background: var(--accent, #2563eb);
  border-color: var(--accent, #2563eb);
  color: var(--accent-text, #fff);
}

.sad-section { display: flex; flex-direction: column; gap: 8px; }
.sad-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sad-dim { color: var(--text-muted, #888); font-size: 11px; }

.sad-btn {
  border: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary, #555);
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.sad-mini { padding: 2px 8px; font-size: 11px; }
.sad-link { border: 0; background: transparent; padding: 0; color: var(--accent, #2563eb); font-size: 11px; cursor: pointer; }

.sad-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sad-task { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11px; color: var(--text-secondary, #555); }

.sad-preview {
  margin: 0;
  width: 100%;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.6;
  color: var(--archive-ink, #222);
  border: 1px dashed var(--hairline-soft, rgba(0, 0, 0, 0.12));
  border-radius: 6px;
  padding: 6px 8px;
  max-height: 180px;
  overflow-y: auto;
}

.sad-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted, #888); flex: none; }
.sad-dot.is-completed { background: var(--accent, #2563eb); }
.sad-dot.is-failed { background: var(--sab-danger, #b42318); }
.sad-dot.is-running { background: var(--accent, #2563eb); opacity: 0.5; }

.sad-session-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-secondary, #555); }
.sad-session-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
