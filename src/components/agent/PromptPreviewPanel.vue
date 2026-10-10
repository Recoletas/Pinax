<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { tr, uiLocale } from '../../i18n/index.js'
import { getPromptSnapshot } from '../../services/agents/promptSnapshot.js'
import { closePromptPreview } from '../../composables/usePromptPreview.js'

const props = defineProps({
  snapshotKey: { type: String, default: '' }
})

// 会话内快照（promptSnapshot.js，内存 LRU 20）；刷新后失效走缺失说明。
const snapshot = computed(() => getPromptSnapshot(props.snapshotKey))

const BLOCK_LABELS = {
  rules: '约束',
  turn: '本轮指令',
  scene: '场景',
  projection: '现场投影',
  lore: '动态世界书',
  'compiled-context': '冻结上下文',
  // 不复用既有 '摘要'（en 译为 Snippet，语义不符）；独立键避免误译。
  summary: '场景摘要',
  recent: '近期对话',
  continuity: '连续性',
  note: '导演注',
  style: '文风',
  cast: '角色编排',
  'local-rules': '本地约束',
  // 信封（advisor/legacy 等）块类型，与 AuthoringRunLog 同词表；缺键会回落显示原始 kind。
  system: '系统', selection: '选区', character: '角色', location: '地点',
  history: '历史', memory: '记忆', references: '参考', raw: '原文',
  outline: '大纲', worldbook: '世界书', inbox: '速记', legacy: '旧版'
}
function blockLabel(kind) {
  return BLOCK_LABELS[kind] || kind || '未知'
}

function joinLabels(list) {
  return list.join(uiLocale.value === 'en' ? ', ' : '、')
}

const surfaceLabel = computed(() => {
  if (snapshot.value?.surface === 'authoring') return tr('创作')
  if (snapshot.value?.surface === 'experience') return tr('跑团')
  return ''
})

const timeLabel = computed(() => {
  if (!snapshot.value?.at) return ''
  return new Date(snapshot.value.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
})

const budgetPercent = computed(() => {
  const used = Number(snapshot.value?.budget?.usedChars || 0)
  const max = Number(snapshot.value?.budget?.maxChars || 0)
  if (!max) return 0
  return Math.min(100, Math.round((used / max) * 100))
})

function blockText(block) {
  const content = block?.content
  if (content == null) return ''
  if (typeof content === 'string') return content
  try {
    return JSON.stringify(content, null, 2)
  } catch {
    return String(content)
  }
}

const closeButton = ref(null)
onMounted(() => {
  nextTick(() => closeButton.value?.focus?.({ preventScroll: true }))
})
</script>

<template>
  <Teleport to="body">
    <section
      class="prompt-preview"
      role="dialog"
      :aria-label="tr('本轮提示词')"
      tabindex="-1"
      @keydown.esc.stop.prevent="closePromptPreview()"
    >
      <header class="prompt-preview__head">
        <div>
          <strong>{{ tr('本轮提示词') }}</strong>
          <span v-if="surfaceLabel || timeLabel" class="prompt-preview__meta">
            <template v-if="surfaceLabel">{{ surfaceLabel }}</template>
            <template v-if="surfaceLabel && timeLabel"> · </template>
            <template v-if="timeLabel">{{ timeLabel }}</template>
          </span>
        </div>
        <button
          ref="closeButton"
          type="button"
          class="prompt-preview__close"
          :aria-label="tr('关闭提示词预览')"
          :title="tr('关闭提示词预览')"
          @click="closePromptPreview()"
        >×</button>
      </header>

      <template v-if="snapshot">
        <div class="prompt-preview__budget">
          <div class="prompt-preview__budget-line">
            <span>{{ tr('上下文用量') }}</span>
            <b>{{ tr('{used} / {max} 字符', { used: snapshot.budget.usedChars, max: snapshot.budget.maxChars }) }}</b>
          </div>
          <div class="prompt-preview__budget-rail" aria-hidden="true">
            <span :style="{ width: budgetPercent + '%' }"></span>
          </div>
          <p v-if="snapshot.budget.truncatedBlocks.length" class="prompt-preview__truncated-note">
            {{ tr('已截断块：{list}', { list: joinLabels(snapshot.budget.truncatedBlocks.map((kind) => tr(blockLabel(kind)))) }) }}
          </p>
        </div>

        <ul class="prompt-preview__blocks">
          <li v-for="block in snapshot.blocks" :key="block.order + ':' + block.kind">
            <details class="prompt-preview__block">
              <summary>
                <span class="prompt-preview__kind">{{ tr(blockLabel(block.kind)) }}</span>
                <span class="prompt-preview__chars">{{ tr('{count} 字符', { count: block.chars }) }}</span>
                <span v-if="block.truncated" class="prompt-preview__badge">{{ tr('已截断') }}</span>
                <span v-if="block.sourceRefs.length" class="prompt-preview__refs">
                  {{ tr('{count} 处来源', { count: block.sourceRefs.length }) }}
                </span>
              </summary>
              <pre class="prompt-preview__content">{{ blockText(block) }}</pre>
            </details>
          </li>
        </ul>

        <footer class="prompt-preview__foot">
          <p v-if="snapshot.toolNames.length">{{ tr('可用工具：{list}', { list: joinLabels(snapshot.toolNames) }) }}</p>
          <p v-if="snapshot.activatedLore">
            {{ tr('世界书激活 {count} 条', { count: snapshot.activatedLore.entryCount }) }}
            <template v-if="snapshot.activatedLore.truncatedCount"> · {{ tr('已截断') }} {{ snapshot.activatedLore.truncatedCount }}</template>
          </p>
          <p>
            <template v-if="snapshot.revision">{{ tr('修订号 {id}', { id: snapshot.revision }) }}</template>
            <template v-if="snapshot.revision && snapshot.intentMode"> · </template>
            <template v-if="snapshot.intentMode">{{ tr('意图 {intent}', { intent: snapshot.intentMode }) }}</template>
            <template v-if="snapshot.temperature !== null && snapshot.temperature !== undefined"> · {{ tr('取样 {temp}', { temp: snapshot.temperature }) }}</template>
          </p>
        </footer>
      </template>

      <p v-else class="prompt-preview__missing">
        {{ tr('提示词快照已失效：仅保留最近 20 轮于当前会话内存，刷新页面后清空；新的回合会自动记录。') }}
      </p>
    </section>
  </Teleport>
</template>

<style scoped>
.prompt-preview {
  position: fixed;
  top: 76px;
  right: 18px;
  z-index: var(--z-floating-dock, 240);
  display: flex;
  flex-direction: column;
  width: min(400px, calc(100vw - 24px));
  max-height: min(76vh, 700px);
  border: 1px solid var(--border-subtle, var(--hairline-soft, rgba(0, 0, 0, 0.14)));
  border-radius: 4px;
  background: var(--surface-workbench-raised, #fff);
  color: var(--text-primary, inherit);
  box-shadow: 0 18px 42px color-mix(in srgb, #000 22%, transparent);
  font-family: var(--font-sans, sans-serif);
  outline: none;
}

.prompt-preview__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--border-subtle, var(--hairline-soft, rgba(0, 0, 0, 0.12)));
}

.prompt-preview__head strong {
  display: block;
  font-size: 13px;
  font-weight: 650;
}

.prompt-preview__meta {
  display: block;
  margin-top: 2px;
  color: var(--text-secondary, #666);
  font-size: 11px;
}

.prompt-preview__close {
  min-width: 28px;
  min-height: 28px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--text-secondary, #666);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.prompt-preview__close:hover,
.prompt-preview__close:focus-visible {
  background: color-mix(in srgb, var(--accent-primary, #3b82f6) 10%, transparent);
  color: var(--text-primary, inherit);
  outline: none;
}

.prompt-preview__budget {
  padding: 10px 14px 8px;
}

.prompt-preview__budget-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  color: var(--text-secondary, #666);
  font-size: 11px;
}

.prompt-preview__budget-line b {
  color: var(--text-primary, inherit);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.prompt-preview__budget-rail {
  height: 4px;
  margin-top: 6px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--text-secondary, #666) 16%, transparent);
  overflow: hidden;
}

.prompt-preview__budget-rail span {
  display: block;
  height: 100%;
  background: color-mix(in srgb, var(--accent-primary, #3b82f6) 72%, transparent);
}

.prompt-preview__truncated-note {
  margin: 6px 0 0;
  color: var(--text-secondary, #666);
  font-size: 10px;
  line-height: 1.5;
}

.prompt-preview__blocks {
  flex: 1 1 auto;
  min-height: 0;
  margin: 0;
  padding: 0 8px 4px 14px;
  overflow-y: auto;
  list-style: none;
}

.prompt-preview__block {
  border-bottom: 1px solid color-mix(in srgb, var(--text-secondary, #666) 14%, transparent);
}

.prompt-preview__block:last-child {
  border-bottom: 0;
}

.prompt-preview__block summary {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 2px;
  cursor: pointer;
  list-style: none;
}

.prompt-preview__block summary::-webkit-details-marker {
  display: none;
}

.prompt-preview__block summary::before {
  content: '›';
  color: var(--text-secondary, #666);
  transition: transform 120ms ease;
}

.prompt-preview__block[open] summary::before {
  transform: rotate(90deg);
}

.prompt-preview__kind {
  color: var(--text-primary, inherit);
  font-size: 12px;
  font-weight: 600;
}

.prompt-preview__chars,
.prompt-preview__refs {
  color: var(--text-secondary, #666);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.prompt-preview__refs {
  margin-left: auto;
}

.prompt-preview__badge {
  padding: 1px 5px;
  border: 1px solid color-mix(in srgb, var(--archive-rose, #b4656f) 46%, transparent);
  border-radius: 2px;
  color: color-mix(in srgb, var(--archive-rose, #b4656f) 82%, var(--text-primary, #000));
  font-size: 10px;
}

.prompt-preview__content {
  max-height: 320px;
  margin: 0 0 10px;
  padding: 8px 10px;
  overflow: auto;
  border-radius: 3px;
  background: color-mix(in srgb, var(--text-secondary, #666) 7%, transparent);
  color: var(--text-primary, inherit);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.prompt-preview__foot {
  flex: 0 0 auto;
  padding: 8px 14px 10px;
  border-top: 1px solid var(--border-subtle, var(--hairline-soft, rgba(0, 0, 0, 0.12)));
  color: var(--text-secondary, #666);
  font-size: 10px;
  line-height: 1.6;
}

.prompt-preview__foot p {
  margin: 0;
}

.prompt-preview__missing {
  margin: 0;
  padding: 14px;
  color: var(--text-secondary, #666);
  font-size: 11px;
  line-height: 1.7;
}

@media (max-width: 640px) {
  .prompt-preview {
    top: 56px;
    right: 8px;
    width: calc(100vw - 16px);
    max-height: min(72vh, 560px);
  }

  .prompt-preview__close {
    min-width: 44px;
    min-height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .prompt-preview__block summary::before {
    transition: none;
  }
}
</style>
