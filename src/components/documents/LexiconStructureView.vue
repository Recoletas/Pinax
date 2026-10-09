<script setup>
// 词汇表.json 结构视图（W1.5，只读）：禁用词 / 偏好词 / 专名口径 三段表格。
// 数据来自 src/services/documents/documentReader.js parseLexiconJsonText（本地轨）
// 或 GET /api/localmirror/lexicon（服务器轨），形状 = shared/lexiconFileContract.js 契约。
// 文件即真相：本视图零编辑——空段引导直接编辑项目根「词汇表.json」。
import { computed } from 'vue'
import { tr } from '../../i18n/index.js'

const props = defineProps({
  lexicon: { type: Object, default: null },
  warning: { type: String, default: '' },
  title: { type: String, default: '' }
})

const banned = computed(() => (Array.isArray(props.lexicon?.banned) ? props.lexicon.banned : []))
const own = computed(() => (Array.isArray(props.lexicon?.own) ? props.lexicon.own : []))
const canon = computed(() => (Array.isArray(props.lexicon?.canon) ? props.lexicon.canon : []))
const hasAnyEntry = computed(() => banned.value.length > 0 || own.value.length > 0 || canon.value.length > 0)

function levelLabel(level) {
  return Number(level) === 1 ? tr('一级（零容忍）') : tr('二级（单段 ≤3）')
}

function aliasesLabel(entry) {
  return (Array.isArray(entry?.aliases) ? entry.aliases : []).join('、')
}
</script>

<template>
  <section class="lexicon-view" data-test="doc-lexicon-view">
    <header class="lexicon-view__head">
      <h1>{{ title || tr('词汇表') }}</h1>
      <p v-if="lexicon?.project" class="lexicon-view__project">{{ lexicon.project }}</p>
    </header>

    <p v-if="warning" class="lexicon-view__warning" role="status" data-test="doc-lexicon-warning">{{ warning }}</p>

    <p v-if="!lexicon" class="lexicon-view__empty" data-test="doc-lexicon-empty">
      {{ tr('尚未播种：项目根目录还没有「词汇表.json」。新建或首次同步项目时会自动生成默认骨架。') }}
    </p>
    <template v-else-if="hasAnyEntry">
      <section class="lexicon-view__section" data-test="doc-lexicon-banned">
        <h2>{{ tr('禁用词') }} <small>{{ banned.length }}</small></h2>
        <table>
          <thead>
            <tr><th>{{ tr('词语') }}</th><th>{{ tr('级别') }}</th><th>{{ tr('备注') }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in banned" :key="`${item.word}-${index}`" :class="{ 'is-l1': Number(item.level) === 1 }">
              <td class="lexicon-view__word">{{ item.word }}</td>
              <td><span class="lexicon-view__level" :class="Number(item.level) === 1 ? 'is-1' : 'is-2'">{{ levelLabel(item.level) }}</span></td>
              <td class="lexicon-view__muted">{{ item.note || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="own.length" class="lexicon-view__section" data-test="doc-lexicon-own">
        <h2>{{ tr('偏好词') }} <small>{{ own.length }}</small></h2>
        <table>
          <thead>
            <tr><th>{{ tr('词语') }}</th><th>{{ tr('备注') }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in own" :key="`${item.word}-${index}`">
              <td class="lexicon-view__word">{{ item.word }}</td>
              <td class="lexicon-view__muted">{{ item.note || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="canon.length" class="lexicon-view__section" data-test="doc-lexicon-canon">
        <h2>{{ tr('专名口径') }} <small>{{ canon.length }}</small></h2>
        <table>
          <thead>
            <tr><th>{{ tr('正名') }}</th><th>{{ tr('禁用别名') }}</th><th>{{ tr('出处') }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in canon" :key="`${item.term}-${index}`">
              <td class="lexicon-view__word">{{ item.term }}</td>
              <td class="lexicon-view__muted">{{ aliasesLabel(item) || '—' }}</td>
              <td class="lexicon-view__muted lexicon-view__ref">{{ item.ref || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
    <p v-else class="lexicon-view__empty" data-test="doc-lexicon-empty">
      {{ tr('这份词汇表三段都是空。直接编辑项目根目录下的「词汇表.json」（禁用词 banned／偏好词 own／专名口径 canon），保存后即生效。') }}
    </p>

    <p class="lexicon-view__hint">{{ tr('文件即真相：本页只读，直接编辑项目根目录下的「词汇表.json」即可生效。') }}</p>
  </section>
</template>

<style scoped>
.lexicon-view {
  max-width: 720px;
  margin-inline: auto;
  color: var(--text-primary);
}
.lexicon-view__head h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}
.lexicon-view__project {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 12.5px;
}
.lexicon-view__warning {
  margin: 12px 0 0;
  padding: 8px 12px;
  border-left: 3px solid var(--warning);
  background: color-mix(in srgb, var(--warning) 10%, transparent);
  color: var(--text-primary);
  font-size: 12.5px;
  border-radius: 0 4px 4px 0;
}
.lexicon-view__empty {
  margin: 16px 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.8;
}
.lexicon-view__section {
  margin-top: 24px;
}
.lexicon-view__section h2 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
}
.lexicon-view__section h2 small {
  margin-left: 4px;
  color: var(--text-muted);
  font-weight: 400;
}
.lexicon-view table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.lexicon-view th,
.lexicon-view td {
  padding: 7px 10px;
  border: 1px solid var(--hairline-soft);
  text-align: left;
  vertical-align: top;
}
.lexicon-view th {
  background: var(--surface-raised);
  color: var(--text-secondary);
  font-weight: 600;
}
.lexicon-view tr.is-l1 td {
  background: color-mix(in srgb, var(--warning) 7%, transparent);
}
.lexicon-view__word {
  font-weight: 600;
}
.lexicon-view__muted {
  color: var(--text-secondary);
}
.lexicon-view__ref {
  font-family: var(--font-mono);
  font-size: 11.5px;
  word-break: break-all;
}
.lexicon-view__level {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--hairline-soft);
  font-size: 11px;
  white-space: nowrap;
}
.lexicon-view__level.is-1 {
  color: var(--warning);
  border-color: color-mix(in srgb, var(--warning) 40%, transparent);
}
.lexicon-view__level.is-2 {
  color: var(--text-secondary);
}
.lexicon-view__hint {
  margin: 26px 0 0;
  color: var(--text-muted);
  font-size: 11.5px;
  line-height: 1.7;
}
</style>
