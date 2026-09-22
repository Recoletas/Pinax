<template>
  <section class="authoring-idea-shelf" aria-label="构思与速记">
    <header class="authoring-idea-shelf__head">
      <span class="authoring-idea-shelf__title">
        <WorkbenchIcon name="pencil" :size="14" />
        <span>{{ tr('构思') }}</span>
        <small>{{ docs.length }}</small>
      </span>
      <span class="authoring-idea-shelf__head-actions">
        <button type="button" title="打开推演夹" aria-label="打开推演夹" @click="pickerOpen = !pickerOpen"><WorkbenchIcon name="archive" :size="13" /></button>
        <button type="button" title="新建速记" aria-label="新建速记" @click="$emit('create')">＋</button>
      </span>
    </header>

    <button v-if="legacyNoteCount" type="button" class="authoring-idea-shelf__legacy" @click="$emit('migrate')">
      迁移旧速记 {{ legacyNoteCount }}
    </button>

    <button
      v-if="selected.length"
      type="button"
      class="authoring-run-tray"
      :class="{ 'is-open': pickerOpen, 'has-attention': requiresAttention }"
      data-test="authoring-run-tray"
      @click="pickerOpen = !pickerOpen"
    >
      <span>推演夹</span>
      <small>{{ selected.length }}/{{ max }}</small>
      <span aria-hidden="true">{{ pickerOpen ? '−' : '›' }}</span>
    </button>

    <div v-if="pickerOpen" class="authoring-idea-picker" data-test="authoring-idea-picker">
      <div v-if="selected.length" class="authoring-idea-picker__selected" aria-label="推演夹内容">
        <div v-for="item in selected" :key="item.id" class="authoring-idea-picker__picked" :class="`is-${item.selectionStatus}`">
          <span :title="item.live?.excerpt || item.excerpt"><strong>{{ item.label }}</strong><small>{{ stateLabel(item) }}</small></span>
          <button v-if="item.selectionStatus === 'modified'" type="button" @click="$emit('refresh', item.id)">更新</button>
          <button type="button" aria-label="移出推演夹" @click="$emit('remove', item.id)">×</button>
        </div>
      </div>

      <label class="authoring-idea-picker__search">
        <span class="sr-only">搜索速记或素材</span>
        <input :value="query" type="search" placeholder="搜索速记或素材" @input="$emit('update:query', $event.target.value)" />
      </label>

      <div v-if="!filteredCatalog.length" class="authoring-idea-picker__empty">
        {{ catalog.length ? (query ? '没有匹配内容' : '没有更多可带入内容') : '还没有可带入的速记或素材' }}
      </div>
      <template v-else>
        <section v-for="group in catalogGroups" :key="group.id" v-show="group.items.length" class="authoring-idea-picker__group">
          <h4>{{ group.label }}</h4>
          <button
            v-for="item in group.items"
            :key="item.id"
            type="button"
            class="authoring-idea-picker__option"
            :class="{ 'is-selected': isSelected(item.id) }"
            :disabled="!isSelected(item.id) && selected.length >= max"
            :title="item.excerpt"
            @click="toggleReference(item)"
          >
            <span><strong>{{ item.label }}</strong><small>{{ item.typeLabel }}</small></span>
            <span>{{ isSelected(item.id) ? '移出' : selected.length >= max ? '已满' : '带入' }}</span>
          </button>
        </section>
      </template>
      <footer>
        <span v-if="notice" role="status">{{ notice }}</span>
        <button type="button" @click="$emit('open-full')">素材页</button>
      </footer>
    </div>

    <div class="authoring-idea-shelf__list">
      <div
        v-for="doc in activeDocs"
        :key="doc.id"
        class="authoring-idea-row workspace-nav-item workspace-nav-item--tree"
        :class="{ 'is-active': activeDocId === doc.id, 'has-association': doc.associationLabel }"
        :data-wt3-doc="doc.id"
      >
        <button type="button" class="authoring-idea-row__open" @click="$emit('open', doc.id)">
          <span class="workspace-nav-label">{{ doc.title }}</span>
          <small v-if="doc.associationLabel">{{ doc.associationLabel }}</small>
        </button>
        <span class="authoring-idea-row__actions">
          <details class="authoring-idea-row__menu">
            <summary :aria-label="`${doc.title}操作`"><WorkbenchIcon name="more" :size="14" /></summary>
            <div>
              <button
                v-if="referenceFor(doc)"
                type="button"
                :aria-label="isSelected(referenceFor(doc).id) ? '移出推演夹' : '带入推演夹'"
                @click="runRowAction($event, () => toggleReference(referenceFor(doc)))"
              >{{ isSelected(referenceFor(doc).id) ? '移出推演夹' : '带入推演' }}</button>
              <button type="button" @click="runRowAction($event, () => $emit('open-dual', doc.id))">在双栏打开</button>
              <button
                type="button"
                :disabled="!currentChapterId || doc.associatedChapterIds?.includes(currentChapterId)"
                @click="runRowAction($event, () => $emit('link-current', doc.id))"
              >{{ doc.associatedChapterIds?.includes(currentChapterId) ? '已关联本章' : '关联当前章' }}</button>
              <button type="button" @click="runRowAction($event, () => $emit('park', doc.id))">搁置</button>
              <button type="button" @click="runRowAction($event, () => $emit('extract-preview', doc.id))">提炼候选</button>
              <button type="button" class="is-danger" @click="runRowAction($event, () => $emit('delete', doc.id))">删除</button>
            </div>
          </details>
        </span>
      </div>
    </div>

    <details v-if="parkedDocs.length" class="authoring-idea-shelf__parked">
      <summary>搁置 {{ parkedDocs.length }}</summary>
      <div v-for="doc in parkedDocs" :key="doc.id" class="authoring-idea-row is-parked" :data-wt3-doc="doc.id">
        <button type="button" class="authoring-idea-row__open" @click="$emit('open', doc.id)"><span>{{ doc.title }}</span></button>
        <span class="authoring-idea-row__actions">
          <details class="authoring-idea-row__menu">
            <summary :aria-label="`${doc.title}操作`"><WorkbenchIcon name="more" :size="14" /></summary>
            <div>
              <button type="button" @click="runRowAction($event, () => $emit('restore', doc.id))">移回构思</button>
              <button type="button" class="is-danger" @click="runRowAction($event, () => $emit('delete', doc.id))">删除</button>
            </div>
          </details>
        </span>
      </div>
    </details>
  </section>
</template>

<script setup>
import { tr } from '../../i18n/index.js'
import { computed, ref } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'

const props = defineProps({
  docs: { type: Array, default: () => [] },
  catalog: { type: Array, default: () => [] },
  selected: { type: Array, default: () => [] },
  activeDocId: { type: String, default: '' },
  currentChapterId: { type: String, default: '' },
  query: { type: String, default: '' },
  notice: { type: String, default: '' },
  legacyNoteCount: { type: Number, default: 0 },
  max: { type: Number, default: 3 }
})

const emit = defineEmits([
  'extract-preview',
  'create', 'migrate', 'open', 'open-dual', 'add', 'remove', 'refresh', 'link-current', 'park', 'restore', 'delete', 'open-full', 'update:query'
])

const pickerOpen = ref(false)
const activeDocs = computed(() => props.docs.filter((doc) => doc.status !== 'parked'))
const parkedDocs = computed(() => props.docs.filter((doc) => doc.status === 'parked'))
const requiresAttention = computed(() => props.selected.some((item) => item.selectionStatus !== 'ready'))
const filteredCatalog = computed(() => {
  const needle = String(props.query || '').trim().toLocaleLowerCase()
  return props.catalog.filter((item) => !isSelected(item.id) && (!needle || [item.label, item.typeLabel, item.excerpt]
    .some((value) => String(value || '').toLocaleLowerCase().includes(needle))))
})
const catalogGroups = computed(() => [
  { id: 'exploration', label: '速记', items: filteredCatalog.value.filter((item) => item.group === 'exploration') },
  { id: 'material', label: '素材', items: filteredCatalog.value.filter((item) => item.group === 'material') }
])

function referenceFor(doc) {
  return props.catalog.find((item) => item.sourceKind === 'exploration-doc' && item.sourceId === doc.id) || null
}

function isSelected(id) {
  return props.selected.some((item) => item.id === id)
}

function toggleReference(item) {
  if (!item) return
  if (isSelected(item.id)) emit('remove', item.id)
  else emit('add', item)
}

function runRowAction(event, action) {
  action()
  const menu = event.currentTarget?.closest?.('details')
  if (menu) menu.open = false
}

function stateLabel(item) {
  return ({ ready: '', modified: '已更新', missing: '已删除', 'project-mismatch': '其他作品' })[item.selectionStatus] || '需核对'
}
</script>

<style scoped>
.authoring-idea-shelf { position: relative; padding-bottom: 6px; border-bottom: 1px solid var(--border-subtle); }
.authoring-idea-shelf button { appearance: none; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.authoring-idea-shelf button:focus-visible, .authoring-idea-shelf input:focus-visible, .authoring-idea-shelf summary:focus-visible { outline: 2px solid var(--focus-ring, currentColor); outline-offset: 2px; }
.authoring-idea-shelf__head { display: flex; height: 28px; align-items: center; justify-content: space-between; padding: 0 8px 0 2px; color: var(--text-secondary); font-size: 13px; }
.authoring-idea-shelf__title, .authoring-idea-shelf__head-actions, .authoring-idea-row__actions { display: flex; align-items: center; }
.authoring-idea-shelf__title { min-width: 0; gap: 7px; }
.authoring-idea-shelf__title small { font-size: 10px; }
.authoring-idea-shelf__head-actions { gap: 1px; }
.authoring-idea-shelf__head-actions button { width: 25px; height: 25px; border-radius: 4px; font-size: 14px; }
.authoring-idea-shelf__head-actions button:hover { background: var(--surface-hover); color: var(--text-primary); }
.authoring-idea-shelf__legacy { width: calc(100% - 16px); margin: 0 8px 4px; padding: 5px 0; color: var(--archive-olive-strong); text-align: left; font-size: 11px; }
.authoring-run-tray { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; width: calc(100% - 16px); min-height: 29px; margin: 0 8px 5px; align-items: center; gap: 7px; padding: 0 7px; border-radius: 5px !important; background: color-mix(in srgb, var(--archive-olive) 8%, transparent) !important; color: var(--text-primary) !important; text-align: left; font-size: 11px !important; }
.authoring-run-tray small { color: var(--archive-olive-strong); font-size: 10px; }
.authoring-run-tray.has-attention { box-shadow: inset 2px 0 var(--archive-rose); }
.authoring-idea-picker { position: absolute; z-index: 20; top: 33px; right: 8px; left: 8px; max-height: min(380px, calc(100vh - 160px)); overflow: auto; padding: 4px 7px 7px; border: 1px solid var(--border-subtle); border-radius: 6px; background: var(--surface-elevated, var(--surface-primary)); box-shadow: 0 12px 32px rgb(29 34 42 / 14%); color: var(--text-secondary); font-size: 11px; }
.authoring-idea-picker__selected { margin-bottom: 4px; }
.authoring-idea-picker__picked, .authoring-idea-picker__option { display: flex; min-width: 0; align-items: center; gap: 5px; }
.authoring-idea-picker__picked { min-height: 27px; border-bottom: 1px solid var(--border-subtle); }
.authoring-idea-picker__picked > span, .authoring-idea-picker__option > span:first-child { display: flex; min-width: 0; flex: 1; align-items: baseline; gap: 6px; }
.authoring-idea-picker strong { overflow: hidden; color: var(--text-primary); font-weight: 560; text-overflow: ellipsis; white-space: nowrap; }
.authoring-idea-picker small { flex: 0 0 auto; color: var(--text-tertiary, var(--text-secondary)); font-size: 9px; }
.authoring-idea-picker__picked > button { padding: 2px 3px; }
.authoring-idea-picker__picked.is-modified small, .authoring-idea-picker__picked.is-missing small { color: var(--archive-rose); }
.authoring-idea-picker__search { display: block; }
.authoring-idea-picker__search input { width: 100%; height: 29px; border: 0; border-bottom: 1px solid var(--border-default); border-radius: 0; background: transparent; color: var(--text-primary); font: inherit; }
.authoring-idea-picker__group h4 { margin: 8px 0 2px; color: var(--text-secondary); font-size: 9px; font-weight: 520; letter-spacing: .08em; }
.authoring-idea-picker__option { width: 100%; min-height: 29px; justify-content: space-between; padding: 3px 0 !important; border-top: 1px solid var(--border-subtle) !important; text-align: left; }
.authoring-idea-picker__option.is-selected > span:last-child { color: var(--archive-olive-strong); }
.authoring-idea-picker__option:disabled { opacity: .5; cursor: default; }
.authoring-idea-picker__empty { padding: 10px 0 6px; }
.authoring-idea-picker footer { display: flex; min-height: 26px; align-items: end; justify-content: flex-end; gap: 8px; }
.authoring-idea-picker footer span { margin-right: auto; color: var(--archive-olive-strong); }
.authoring-idea-picker footer button { padding: 3px 0; }
.authoring-idea-shelf__list { min-width: 0; }
.authoring-idea-row { position: relative; display: flex; height: 28px; align-items: center; padding: 0 8px 0 34px; border-radius: 3px; color: var(--text-secondary); }
.authoring-idea-row.has-association { height: 40px; }
.authoring-idea-row:hover, .authoring-idea-row:focus-within, .authoring-idea-row.is-active { background: var(--surface-hover); color: var(--text-primary); }
.authoring-idea-shelf .authoring-idea-row__open { display: flex; min-width: 0; flex: 1; flex-direction: column; justify-content: center; padding: 0 !important; color: inherit; font-size: 13px; font-weight: 400; line-height: 1.6; text-align: left; }
.authoring-idea-row__open > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.authoring-idea-row__open small { overflow: hidden; color: var(--text-secondary); font-size: 11px; font-weight: 400; line-height: 14px; text-overflow: ellipsis; white-space: nowrap; }
.authoring-idea-row__actions { flex: 0 0 auto; visibility: hidden; }
.authoring-idea-row:hover .authoring-idea-row__actions, .authoring-idea-row:focus-within .authoring-idea-row__actions { visibility: visible; }
.authoring-idea-row__menu { position: relative; }
.authoring-idea-row__menu > summary { display: grid; width: 25px; height: 25px; place-items: center; border-radius: 4px; cursor: pointer; list-style: none; }
.authoring-idea-row__menu > summary::-webkit-details-marker { display: none; }
.authoring-idea-row__menu > summary:hover, .authoring-idea-row__menu[open] > summary { background: var(--surface-primary); color: var(--text-primary); }
.authoring-idea-row__menu > div { position: absolute; z-index: 12; top: 27px; right: 0; display: grid; width: 112px; padding: 4px; border: 1px solid var(--border-subtle); border-radius: 6px; background: var(--surface-primary, #fff); box-shadow: 0 8px 24px rgb(29 34 42 / 12%); }
.authoring-idea-row__menu button { min-height: 28px; padding: 0 7px; border-radius: 4px; text-align: left; white-space: nowrap; }
.authoring-idea-row__menu button:hover { background: var(--surface-hover); color: var(--text-primary); }
.authoring-idea-row__menu button:disabled { opacity: .45; cursor: default; }
.authoring-idea-row__menu button.is-danger:hover { color: var(--archive-rose); }

.authoring-idea-shelf :is(button, summary):focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.authoring-idea-shelf :is(button, summary):active:not(:disabled) { background: var(--nav-focused); }
.authoring-idea-shelf__parked { margin: 3px 0 0; color: var(--text-secondary); font-size: 10px; }
.authoring-idea-shelf__parked > summary { margin: 0 8px; padding: 5px 0; cursor: pointer; list-style-position: inside; }
.authoring-idea-row.is-parked { opacity: .66; }
@media (max-width: 720px) {
  .authoring-idea-shelf__head { height: 44px; }
  .authoring-idea-shelf__head-actions button, .authoring-idea-row__menu > summary { min-width: 44px; min-height: 44px; }
  .authoring-idea-row { height: 48px; padding-inline-start: 34px; }
  .authoring-idea-row.has-association { height: 54px; }
  .authoring-idea-row__actions { visibility: visible; }
  .authoring-idea-picker__search input, .authoring-idea-picker__option { min-height: 44px; }
}
</style>
