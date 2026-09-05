<template>
  <details class="authoring-context-picker" data-test="context-picker" aria-label="本次参考选择" :open="requiresAttention">
    <summary class="authoring-context-picker__head">
      <strong>本次参考</strong>
      <span>{{ selected.length ? `${selected.length}/${max}` : '添加' }}</span>
    </summary>

    <div class="authoring-context-picker__body">

    <ul v-if="selected.length" class="authoring-context-picker__selected" aria-label="已选参考">
      <li v-for="item in selected" :key="item.id" :class="`is-${item.selectionStatus}`">
        <button type="button" class="authoring-context-picker__copy" @click="togglePreview(item.id)">
          <span><strong>{{ item.label }}</strong><small>{{ item.typeLabel }} · {{ roleLabel(item.usageRole) }}</small></span>
          <span class="authoring-context-picker__state">{{ stateLabel(item) }}</span>
        </button>
        <p v-if="expandedId === item.id">{{ item.live?.excerpt || item.excerpt || '来源内容为空' }}</p>
        <div class="authoring-context-picker__row-actions">
          <button v-if="item.selectionStatus === 'modified'" type="button" @click="$emit('refresh', item.id)">采用新版</button>
          <button type="button" @click="$emit('remove', item.id)">移除</button>
        </div>
      </li>
    </ul>

      <label class="authoring-context-picker__search">
      <span class="sr-only">搜索本次参考</span>
      <input :value="query" type="search" placeholder="搜索速记或素材" @input="$emit('update:query', $event.target.value)" />
      </label>

    <div v-if="!catalog.length" class="authoring-context-picker__empty">当前项目还没有可用的速记或素材。</div>
    <div v-else-if="!filtered.length" class="authoring-context-picker__empty">没有匹配的参考。</div>
    <div v-else class="authoring-context-picker__groups">
      <section v-for="group in groups" :key="group.id" v-show="group.items.length">
        <h4>{{ group.label }} <span>{{ group.items.length }}</span></h4>
        <ul>
          <li v-for="item in group.items" :key="item.id">
            <button type="button" class="authoring-context-picker__copy" @click="togglePreview(item.id)">
              <span><strong>{{ item.label }}</strong><small>{{ item.typeLabel }} · {{ roleLabel(item.usageRole) }}</small></span>
              <span v-if="item.previewTruncated" class="authoring-context-picker__state">内容较长</span>
            </button>
            <p v-if="expandedId === item.id">{{ item.excerpt }}</p>
          <button type="button" class="authoring-context-picker__add" data-test="context-reference-add" :data-reference-id="item.id" :disabled="isSelected(item.id) || selected.length >= max" @click="$emit('add', item)">
              {{ isSelected(item.id) ? '已选' : selected.length >= max ? '已满' : '加入' }}
            </button>
          </li>
        </ul>
      </section>
    </div>
      <div class="authoring-context-picker__foot">
        <p v-if="notice" class="authoring-context-picker__notice" role="status">{{ notice }}</p>
        <button type="button" @click="$emit('open-full')">管理素材</button>
      </div>
    </div>
  </details>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  catalog: { type: Array, default: () => [] },
  selected: { type: Array, default: () => [] },
  query: { type: String, default: '' },
  max: { type: Number, default: 3 },
  notice: { type: String, default: '' }
})
defineEmits(['add', 'remove', 'refresh', 'open-full', 'update:query'])

const expandedId = ref('')
const requiresAttention = computed(() => props.selected.some((item) => item.selectionStatus !== 'ready'))
const filtered = computed(() => {
  const needle = String(props.query || '').trim().toLocaleLowerCase()
  if (!needle) return props.catalog
  return props.catalog.filter((item) => [item.label, item.typeLabel, item.excerpt]
    .some((value) => String(value || '').toLocaleLowerCase().includes(needle)))
})
const groups = computed(() => [
  { id: 'exploration', label: '速记', items: filtered.value.filter((item) => item.group === 'exploration') },
  { id: 'material', label: '素材', items: filtered.value.filter((item) => item.group === 'material') }
])

function isSelected(id) {
  return props.selected.some((item) => item.id === id)
}

function togglePreview(id) {
  expandedId.value = expandedId.value === id ? '' : id
}

function roleLabel(role) {
  return ({ fact: '事实', intent: '意图', inspiration: '灵感' })[role] || '灵感'
}

function stateLabel(item) {
  return ({
    ready: item.previewTruncated ? '可能截取' : '可用',
    modified: '内容已更新',
    missing: '来源已删除',
    'project-mismatch': '其他项目'
  })[item.selectionStatus] || '待核对'
}
</script>

<style scoped>
.authoring-context-picker { border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary); font-size: 12px; }
.authoring-context-picker__head, .authoring-context-picker__copy > span:first-child { display: flex; align-items: center; }
.authoring-context-picker__head { justify-content: space-between; gap: 12px; padding: 7px 0; cursor: pointer; list-style: none; }
.authoring-context-picker__head::-webkit-details-marker { display: none; }
.authoring-context-picker__head::after { content: '+'; color: var(--text-secondary); font-size: 14px; font-weight: 400; }
.authoring-context-picker[open] .authoring-context-picker__head::after { content: '−'; }
.authoring-context-picker__head > span { margin-left: auto; }
.authoring-context-picker__head strong, .authoring-context-picker__copy strong { color: var(--text-primary); font-weight: 650; }
.authoring-context-picker__head span, .authoring-context-picker__copy small { font-size: 11px; }
.authoring-context-picker__body { padding: 0 0 8px; }
.authoring-context-picker button { appearance: none; border: 0; background: transparent; color: var(--text-secondary); font: inherit; cursor: pointer; }
.authoring-context-picker button:hover:not(:disabled) { color: var(--text-primary); }
.authoring-context-picker button:focus-visible, .authoring-context-picker input:focus-visible { outline: 2px solid var(--focus-ring, currentColor); outline-offset: 2px; }
.authoring-context-picker__search { display: block; margin-top: 9px; }
.authoring-context-picker__search input { width: 100%; height: 32px; border: 0; border-bottom: 1px solid var(--border-default); border-radius: 0; background: transparent; color: var(--text-primary); font: inherit; }
.authoring-context-picker ul { margin: 0; padding: 0; list-style: none; }
.authoring-context-picker__selected { margin-top: 8px !important; }
.authoring-context-picker li { position: relative; min-width: 0; padding: 7px 48px 7px 0; border-top: 1px solid var(--border-subtle); }
.authoring-context-picker__selected li { padding-right: 78px; }
.authoring-context-picker__copy { display: flex; width: 100%; min-width: 0; align-items: center; justify-content: space-between; gap: 8px; padding: 0; text-align: left; }
.authoring-context-picker__copy > span:first-child { min-width: 0; gap: 7px; }
.authoring-context-picker__copy strong, .authoring-context-picker__copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.authoring-context-picker__state { flex: 0 0 auto; color: var(--archive-olive-strong); font-size: 10px; }
.authoring-context-picker li > p { margin: 7px 0 2px; color: var(--text-secondary); line-height: 1.55; }
.authoring-context-picker__row-actions, .authoring-context-picker__add { position: absolute; right: 0; top: 7px; }
.authoring-context-picker__row-actions { display: flex; gap: 7px; }
.authoring-context-picker__add:disabled { opacity: .45; cursor: default; }
.authoring-context-picker__groups h4 { margin: 11px 0 5px; color: var(--text-primary); font-size: 11px; font-weight: 600; letter-spacing: .04em; }
.authoring-context-picker__groups h4 span { color: var(--text-secondary); font-weight: 400; }
.authoring-context-picker__empty, .authoring-context-picker__notice { margin: 9px 0 0; line-height: 1.5; }
.authoring-context-picker__notice { color: var(--archive-olive-strong); }
.authoring-context-picker__foot { display: flex; align-items: center; justify-content: flex-end; gap: 12px; min-height: 30px; }
.authoring-context-picker__foot .authoring-context-picker__notice { margin-right: auto; }
@media (max-width: 720px) {
  .authoring-context-picker__search input { height: 44px; }
  .authoring-context-picker li { min-height: 54px; padding-block: 13px; }
  .authoring-context-picker__head button, .authoring-context-picker__row-actions button, .authoring-context-picker__add { min-width: 44px; min-height: 44px; }
  .authoring-context-picker__row-actions, .authoring-context-picker__add { top: 5px; }
}
</style>
