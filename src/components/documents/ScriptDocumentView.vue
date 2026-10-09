<script setup>
// kit 剧本格式只读版面（W1-B v1 轻样式）：行级 token → 样式化行。
// 全部文本经插值渲染（不经 v-html），未识别行按 plain 原样呈现，绝不报错。
import { computed } from 'vue'
import { tr } from '../../i18n/index.js'

const props = defineProps({
  lines: { type: Array, default: () => [] },
  title: { type: String, default: '' }
})

const stats = computed(() => {
  const counts = { sceneHead: 0, action: 0, dialogue: 0, hook: 0, narration: 0 }
  for (const line of props.lines) {
    if (counts[line.kind] !== undefined) counts[line.kind] += 1
  }
  return counts
})

const badges = computed(() => {
  const items = []
  if (stats.value.sceneHead) items.push(tr('{count} 场', { count: stats.value.sceneHead }))
  if (stats.value.dialogue) items.push(tr('{count} 句台词', { count: stats.value.dialogue }))
  if (stats.value.action) items.push(tr('{count} 个动作', { count: stats.value.action }))
  if (stats.value.hook) items.push(tr('{count} 个卡点', { count: stats.value.hook }))
  if (stats.value.narration) items.push(tr('{count} 段旁白', { count: stats.value.narration }))
  return items
})

function headingTag(level) {
  return `h${Math.min(Math.max(level || 1, 1), 6)}`
}
</script>

<template>
  <article class="script-view" data-test="doc-script-view">
    <header v-if="title" class="script-view__doc-title">
      <h1>{{ title }}</h1>
      <p v-if="badges.length" class="script-view__badges">
        <span v-for="badge in badges" :key="badge" class="script-view__badge">{{ badge }}</span>
      </p>
    </header>
    <div class="script-view__body">
      <template v-for="(line, index) in lines" :key="index">
        <component
          :is="headingTag(line.level)"
          v-if="line.kind === 'mdHeading'"
          class="script-view__md-heading"
          :class="`is-h${Math.min(Math.max(line.level || 1, 1), 6)}`"
        >{{ line.text }}</component>
        <div v-else-if="line.kind === 'episodeHeading'" class="script-view__episode" data-test="doc-script-episode">{{ line.text }}</div>
        <div v-else-if="line.kind === 'breakdownHeading'" class="script-view__breakdown" data-test="doc-script-breakdown">{{ line.text }}</div>
        <div v-else-if="line.kind === 'sceneHead'" class="script-view__scene" data-test="doc-script-scene"><span class="script-view__scene-label">{{ tr('场景') }}</span>{{ line.text }}</div>
        <p v-else-if="line.kind === 'action'" class="script-view__action" data-test="doc-script-action"><span class="script-view__action-mark">△</span>{{ line.text }}</p>
        <p v-else-if="line.kind === 'dialogue'" class="script-view__dialogue" data-test="doc-script-dialogue">
          <span class="script-view__speaker">{{ line.speaker }}</span><span v-if="line.emotion" class="script-view__emotion">（{{ line.emotion }}）</span><span class="script-view__speech">{{ line.text }}</span>
        </p>
        <p v-else-if="line.kind === 'hook'" class="script-view__hook" data-test="doc-script-hook"><span class="script-view__hook-label">{{ tr('卡点') }}</span>{{ line.text }}</p>
        <p v-else-if="line.kind === 'narration'" class="script-view__narration" data-test="doc-script-narration">{{ tr('旁白') }}：{{ line.text }}</p>
        <p v-else-if="line.kind === 'breakdownField'" class="script-view__field"><span class="script-view__field-label">{{ line.label }}</span>{{ line.text }}</p>
        <blockquote v-else-if="line.kind === 'quote'" class="script-view__quote">{{ line.text }}</blockquote>
        <p v-else-if="line.kind === 'plain'" class="script-view__plain">{{ line.text }}</p>
        <div v-else-if="line.kind === 'blank'" class="script-view__spacer" aria-hidden="true" />
      </template>
    </div>
  </article>
</template>

<style scoped>
.script-view {
  max-width: 720px;
  margin-inline: auto;
  color: var(--text-primary);
}
.script-view__doc-title {
  margin-bottom: 18px;
}
.script-view__doc-title h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;
}
.script-view__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0 0;
}
.script-view__badge {
  padding: 2px 8px;
  border: 1px solid var(--hairline-soft);
  border-radius: 999px;
  background: var(--surface-raised);
  color: var(--text-secondary);
  font-size: 11px;
}
.script-view__body {
  display: flex;
  flex-direction: column;
}
.script-view__md-heading {
  margin: 1.4em 0 0.5em;
  line-height: 1.3;
}
.script-view__md-heading.is-h1 { font-size: 20px; font-weight: 700; }
.script-view__md-heading.is-h2 { font-size: 17px; font-weight: 600; }
.script-view__md-heading.is-h3,
.script-view__md-heading.is-h4,
.script-view__md-heading.is-h5,
.script-view__md-heading.is-h6 { font-size: 15px; font-weight: 600; }
.script-view__episode {
  margin: 26px 0 10px;
  padding-bottom: 6px;
  border-bottom: 2px solid var(--accent);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.script-view__breakdown {
  margin: 20px 0 8px;
  padding: 4px 10px;
  border-left: 3px solid var(--accent);
  background: var(--accent-light);
  font-size: 14px;
  font-weight: 600;
}
.script-view__scene {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 18px 0 6px;
  font-size: 14px;
  font-weight: 700;
}
.script-view__scene-label {
  flex: none;
  padding: 1px 8px;
  border-radius: 3px;
  background: var(--text-primary);
  color: var(--bg-primary);
  font-size: 11px;
  font-weight: 600;
}
.script-view__action {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 6px 0;
  color: var(--text-primary);
  font-size: 13.5px;
  line-height: 1.8;
}
.script-view__action-mark {
  flex: none;
  color: var(--info);
  font-weight: 700;
}
.script-view__dialogue {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 4px;
  margin: 6px 0 6px 2.2em;
  font-size: 13.5px;
  line-height: 1.8;
}
.script-view__speaker {
  color: var(--accent);
  font-weight: 600;
}
.script-view__emotion {
  color: var(--text-muted);
  font-size: 12px;
}
.script-view__hook {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 10px 0;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--warning) 45%, transparent);
  border-left: 3px solid var(--warning);
  border-radius: 4px;
  background: color-mix(in srgb, var(--warning) 10%, transparent);
  font-size: 13px;
  line-height: 1.7;
}
.script-view__hook-label {
  flex: none;
  color: var(--warning);
  font-weight: 700;
}
.script-view__narration {
  margin: 4px 0;
  color: var(--text-muted);
  font-size: 12.5px;
  line-height: 1.7;
}
.script-view__field {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 4px 0;
  font-size: 13px;
  line-height: 1.7;
}
.script-view__field-label {
  flex: none;
  color: var(--text-secondary);
  font-weight: 600;
}
.script-view__quote {
  margin: 8px 0;
  padding: 6px 14px;
  border-left: 3px solid var(--hairline-accent);
  color: var(--text-secondary);
}
.script-view__plain {
  margin: 4px 0;
  font-size: 13.5px;
  line-height: 1.8;
}
.script-view__spacer {
  height: 0.6em;
}
@media (max-width: 720px) {
  .script-view__dialogue {
    margin-left: 1.2em;
  }
}
@media (prefers-reduced-motion: reduce) {
  .script-view * { transition: none; }
}
</style>
