<!-- StoryAgent-beta：pi-agent 适配层的侧栏测试坞（校验/测试专用，不写入书稿/世界书）。
     链路：src/services/agents/piAgent/piNarrativeAgentBridge.js → pinax-adapter（默认 127.0.0.1:8451）。
     所有 SSE 帧都经上游 parseNarrativeAgentSseEvent 校验；不触碰既有 AI 链路与状态机。 -->
<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { createPiNarrativeAgentBridge } from '../../services/agents/storyagent/piNarrativeAgentBridge.js'
import { parseNarrativeAgentSseEvent } from '../../../shared/narrativeAgentStreamContract.js'
import { useWorldStore } from '../../stores/worldStore.js'

const route = useRoute()
const worldStore = useWorldStore()

const endpoint = String(import.meta.env.VITE_PI_ADAPTER_URL || 'http://127.0.0.1:8451')
const contractStats = reactive({ total: 0, ok: 0 })
const bridge = createPiNarrativeAgentBridge({
  endpoint,
  // 逐帧过上游契约 parser：漂移立刻现形（校验面板的核心职责）
  parseEvent: (raw) => {
    const ev = parseNarrativeAgentSseEvent(raw)
    contractStats.total += 1
    if (ev) contractStats.ok += 1
    return ev
  }
})

const open = ref(false)
const health = ref(null)
const contractCheck = ref('')
const intent = ref('推进当前场景，写一个短叙事片段')
const mode = ref('auto')
const maxTokens = ref(1200)
const sceneText = ref('')
const running = ref(false)
const statusLine = ref('待命')
const output = ref('')
const toolLog = ref([])
const result = ref(null)
const errorMsg = ref('')
let controller = null
let lastTaskId = ''

const isAuthoring = computed(() => route.name === 'authoring')
const worldEntries = computed(() => {
  const entries = worldStore.activeWorldbook?.entries || []
  return entries
    .slice(0, 30)
    .map((e) => ({
      id: String(e?.id || ''),
      title: String(e?.title || e?.name || ''),
      type: String(e?.type || ''),
      summary: String(e?.summary || e?.description || e?.text || '')
    }))
    .filter((e) => e.title || e.summary)
})

async function checkHealth() {
  health.value = await bridge.healthz()
}

async function checkContract() {
  contractCheck.value = '检查中…'
  try {
    const res = await fetch(`${endpoint}/v1/pinax/contract`)
    const raw = await res.text()
    const ev = parseNarrativeAgentSseEvent(raw)
    contractCheck.value = ev ? '✓ 契约帧解析通过' : '✗ 契约帧解析失败'
  } catch (e) {
    contractCheck.value = `✗ 不可达：${String(e.message || e).slice(0, 80)}`
  }
}

function buildKernel() {
  const scene = sceneText.value.trim()
  const first = worldEntries.value[0] || null
  return {
    revision: `sab_${Date.now().toString(36)}`,
    scene: { summary: scene ? scene.slice(0, 800) : '（未提供场景文本。依据世界书资料推进一个短叙事片段。）' },
    ...(first ? { character: { name: first.title, profile: first.summary.slice(0, 600) } } : {}),
    recentText: scene ? scene.slice(-1200) : ''
  }
}

function buildIndex() {
  return {
    revision: `sabw_${worldEntries.value.length}`,
    byDomain: { world: worldEntries.value }
  }
}

async function runTask() {
  if (running.value) return
  running.value = true
  output.value = ''
  toolLog.value = []
  result.value = null
  errorMsg.value = ''
  contractStats.total = 0
  contractStats.ok = 0
  statusLine.value = '启动任务…'
  controller = new AbortController()
  lastTaskId = `sab_${Date.now().toString(36)}`
  try {
    const run = await bridge.run({
      kernel: buildKernel(),
      index: buildIndex(),
      mode: mode.value,
      intent: intent.value.trim() || null,
      formatInstructions: '输出纯叙事正文，不要标题。',
      maxTokens: Number(maxTokens.value) || 1200,
      requestId: `sabreq_${Date.now().toString(36)}`,
      taskId: lastTaskId,
      signal: controller.signal,
      callbacks: {
        onChunk: ({ content }) => {
          output.value += String(content || '')
        }
      },
      onStatus: (s) => {
        if (s.phase === 'tool') {
          toolLog.value.push(`${s.tool} · ${s.action || ''}`)
          statusLine.value = `工具回合：${s.tool} · ${s.action || ''}`
        } else if (s.phase === 'step') {
          statusLine.value = `步骤 ${Number(s.stepIndex || 0) + 1}`
        }
      }
    })
    result.value = {
      ok: run.ok,
      model: run.model,
      usage: run.usage,
      taskId: run.trace?.taskId || lastTaskId,
      status: run.trace?.status || (run.ok ? 'completed' : 'failed'),
      steps: run.trace?.steps || 0,
      calls: run.totalCalls || 0,
      chars: (run.finalContent || '').length
    }
    statusLine.value = run.ok ? '完成' : '失败'
  } catch (e) {
    errorMsg.value = String(e?.message || e)
    statusLine.value = '失败'
  } finally {
    running.value = false
    controller = null
  }
}

async function cancelTask() {
  try {
    controller?.abort(new Error('PINAX_ADAPTER_CANCELLED'))
  } catch { /* already settled */ }
  if (lastTaskId) await bridge.cancel(lastTaskId).catch(() => null)
  statusLine.value = '已请求取消'
}

async function copyOutput() {
  try {
    await navigator.clipboard.writeText(output.value)
  } catch { /* 剪贴板不可用即忽略 */ }
}

onMounted(() => {
  checkHealth()
  worldStore.loadWorldbooksIndex().catch(() => null)
})
watch(open, (v) => {
  if (v) checkHealth()
})
</script>

<template>
  <div v-if="isAuthoring">
    <button v-if="!open" class="sab-tab" type="button" title="StoryAgent-beta 测试面板" @click="open = true">
      StoryAgentβ
    </button>
    <section v-else class="sab-panel" role="complementary" aria-label="StoryAgent-beta 测试面板">
      <header class="sab-head">
        <strong>StoryAgent-beta</strong>
        <span class="sab-health" :class="health?.ok ? 'is-ok' : 'is-down'">
          {{ health?.ok ? '适配器在线' : '适配器不可达' }}
        </span>
        <button class="sab-close" type="button" aria-label="关闭 StoryAgent-beta" @click="open = false">×</button>
      </header>

      <div class="sab-body">
        <p class="sab-note">
          校验测试通道：请求直发 pinax-adapter，事件逐帧过上游契约 parser，不写入书稿与世界书。
        </p>

        <div class="sab-row">
          <button class="sab-btn" type="button" :disabled="running" @click="checkContract">契约自检</button>
          <span class="sab-dim">{{ contractCheck || `帧校验 ${contractStats.ok}/${contractStats.total}` }}</span>
        </div>

        <label class="sab-field">
          <span>指令</span>
          <input v-model="intent" type="text" :disabled="running" />
        </label>
        <div class="sab-row">
          <label class="sab-field sab-grow">
            <span>模式</span>
            <select v-model="mode" :disabled="running">
              <option value="auto">auto</option>
              <option value="continue">continue</option>
              <option value="init">init</option>
              <option value="respond">respond</option>
            </select>
          </label>
          <label class="sab-field sab-narrow">
            <span>maxTokens</span>
            <input v-model="maxTokens" type="number" min="200" max="8000" :disabled="running" />
          </label>
        </div>

        <label class="sab-field">
          <span>场景/正文（可选；{{ worldEntries.length }} 条世界书资料随请求上行）</span>
          <textarea
            v-model="sceneText"
            rows="4"
            :disabled="running"
            placeholder="可粘贴当前章节正文或场景要点；留空则仅凭世界书资料推进。"
          ></textarea>
        </label>

        <div class="sab-row">
          <button class="sab-btn sab-primary" type="button" :disabled="running" @click="runTask">运行任务</button>
          <button class="sab-btn" type="button" :disabled="!running" @click="cancelTask">取消</button>
          <button class="sab-btn" type="button" :disabled="!output" @click="copyOutput">复制</button>
        </div>

        <p class="sab-status">{{ statusLine }}</p>
        <pre v-if="output" class="sab-output">{{ output }}</pre>
        <ul v-if="toolLog.length" class="sab-tools">
          <li v-for="(t, i) in toolLog" :key="i">{{ t }}</li>
        </ul>
        <p v-if="errorMsg" class="sab-error">✗ {{ errorMsg }}</p>
        <p v-if="result" class="sab-result">
          {{ result.ok ? '✓' : '✗' }} {{ result.model }} · {{ result.status }} · steps {{ result.steps }} ·
          tools {{ result.calls }} · {{ result.chars }} 字 · tokens {{ result.usage?.totalTokens ?? 0 }} ·
          task {{ result.taskId }}
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sab-tab {
  position: fixed;
  right: 0;
  top: 40%;
  z-index: 700;
  writing-mode: vertical-rl;
  letter-spacing: 0.08em;
  padding: 12px 6px;
  border: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  border-right: 0;
  border-radius: 8px 0 0 8px;
  background: var(--archive-paper, #faf9f6);
  color: var(--text-secondary, #555);
  font-size: 12px;
  cursor: pointer;
}

.sab-panel {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 700;
  width: min(380px, 100vw);
  display: flex;
  flex-direction: column;
  background: var(--archive-paper, #faf9f6);
  color: var(--text-primary, #1c1c1c);
  border-left: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  box-shadow: var(--shadow-workbench-float, 0 8px 24px rgba(0, 0, 0, 0.14));
}

.sab-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
}

.sab-close {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--text-muted, #888);
  font-size: 16px;
  cursor: pointer;
}

.sab-health {
  font-size: 11px;
  color: var(--text-muted, #888);
}

.sab-health.is-ok {
  color: var(--accent, #2563eb);
}

.sab-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
}

.sab-note {
  margin: 0;
  color: var(--text-muted, #888);
  font-size: 12px;
  line-height: 1.5;
}

.sab-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sab-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-secondary, #555);
  font-size: 12px;
}

.sab-grow {
  flex: 1;
}

.sab-narrow {
  width: 96px;
}

.sab-field input,
.sab-field select,
.sab-field textarea {
  border: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  border-radius: 6px;
  background: transparent;
  color: inherit;
  padding: 6px 8px;
  font: inherit;
}

.sab-btn {
  border: 1px solid var(--hairline-soft, rgba(0, 0, 0, 0.12));
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary, #555);
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}

.sab-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.sab-primary {
  background: var(--accent, #2563eb);
  border-color: var(--accent, #2563eb);
  color: var(--accent-text, #fff);
}

.sab-dim {
  color: var(--text-muted, #888);
  font-size: 12px;
}

.sab-status {
  margin: 0;
  color: var(--text-muted, #888);
  font-size: 12px;
}

.sab-output {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
  font-family: inherit;
  font-size: 13px;
  color: var(--archive-ink, #222);
  max-height: 40vh;
  overflow-y: auto;
  padding: 8px;
  border: 1px dashed var(--hairline-soft, rgba(0, 0, 0, 0.12));
  border-radius: 6px;
}

.sab-tools {
  margin: 0;
  padding-left: 18px;
  color: var(--text-muted, #888);
  font-size: 12px;
}

.sab-error {
  margin: 0;
  color: var(--sab-danger, #b42318);
  font-size: 12px;
}

.sab-result {
  margin: 0;
  color: var(--text-secondary, #555);
  font-size: 12px;
  line-height: 1.5;
}
</style>
