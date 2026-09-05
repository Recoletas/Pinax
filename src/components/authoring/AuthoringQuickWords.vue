<template>
  <section class="authoring-quick-words" aria-label="快捷词">
    <header><div><strong>快捷词</strong><span>选择常用名称，写作时按开头提示</span></div><button type="button" aria-label="关闭快捷词" @click="emit('close')">×</button></header>
    <nav aria-label="快捷词来源">
      <button v-for="option in sources" :key="option.id" type="button" :class="{ active: source === option.id }" @click="source = option.id">{{ option.label }}<small>{{ count(option.id) }}</small></button>
    </nav>
    <label class="authoring-quick-words__search"><WorkbenchIcon name="search" :size="14" /><input v-model="query" type="search" placeholder="搜索名称或别名" /></label>
    <div class="authoring-quick-words__list">
      <button v-for="item in visibleItems" :key="item.id" type="button" :aria-pressed="enabledIds.includes(item.id).toString()" @click="emit('toggle', item.id)">
        <span><strong>{{ item.label }}</strong><em>{{ item.summary }}</em></span><small>{{ enabledIds.includes(item.id) ? '已启用' : item.typeLabel }}</small>
      </button>
      <p v-if="!visibleItems.length">当前没有可用词条</p>
    </div>
    <footer>
      <span>已启用 {{ enabledIds.length }}</span>
      <div><button v-for="mark in punctuation" :key="mark" type="button" @click="emit('insert', mark)">{{ mark }}</button></div>
    </footer>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'

const props = defineProps({ catalog: { type: Array, default: () => [] }, enabledIds: { type: Array, default: () => [] } })
const emit = defineEmits(['close', 'toggle', 'insert'])
const source = ref('character')
const query = ref('')
const sources = Object.freeze([
  { id: 'character', label: '角色' },
  { id: 'setting', label: '设定' },
  { id: 'extracted', label: '智能提取' }
])
const punctuation = Object.freeze(['，', '。', '！', '？', '：', '；', '“', '”'])
const count = (kind) => props.catalog.filter((item) => item.sourceKind === kind).length
const visibleItems = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  return props.catalog.filter((item) => item.sourceKind === source.value && (!needle || `${item.label} ${item.summary}`.toLocaleLowerCase().includes(needle)))
})
</script>

<style scoped>
.authoring-quick-words { position:fixed; z-index:var(--z-popover,10020); inset-block-start:122px; inset-inline-start:50%; width:min(460px,calc(100vw - 32px)); max-height:min(560px,calc(100dvh - 150px)); transform:translateX(-50%); overflow:hidden; border:1px solid var(--border-subtle); border-radius:6px; background:var(--surface-workbench-raised); box-shadow:0 16px 42px color-mix(in srgb,#000 16%,transparent); }
.authoring-quick-words>header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:16px 18px 13px; border-bottom:1px solid var(--border-subtle); }
.authoring-quick-words>header div { display:grid; gap:3px; }
.authoring-quick-words>header strong { color:var(--text-primary); font-size:15px; }
.authoring-quick-words>header span { color:var(--text-secondary); font-size:11px; }
.authoring-quick-words button { border:0; background:transparent; color:var(--text-secondary); cursor:pointer; }
.authoring-quick-words>header>button { width:30px; height:30px; font-size:20px; }
.authoring-quick-words>nav { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); padding:0 18px; border-bottom:1px solid var(--border-subtle); }
.authoring-quick-words>nav button { min-height:38px; border-bottom:2px solid transparent; }
.authoring-quick-words>nav button.active { border-bottom-color:var(--accent-primary); color:var(--text-primary); }
.authoring-quick-words>nav small { margin-left:5px; font-size:10px; }
.authoring-quick-words__search { display:grid; grid-template-columns:20px minmax(0,1fr); align-items:center; height:36px; margin:12px 18px 4px; padding:0 9px; border:1px solid var(--border-subtle); border-radius:3px; color:var(--text-secondary); }
.authoring-quick-words__search input { min-width:0; border:0; outline:0; background:transparent; color:var(--text-primary); }
.authoring-quick-words__list { max-height:320px; overflow:auto; padding:4px 18px 10px; }
.authoring-quick-words__list>button { display:grid; width:100%; min-height:48px; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:12px; padding:7px 2px; border-bottom:1px solid color-mix(in srgb,var(--border-subtle) 70%,transparent); text-align:left; }
.authoring-quick-words__list>button:hover { color:var(--text-primary); }
.authoring-quick-words__list>button[aria-pressed="true"] { box-shadow:inset 2px 0 var(--accent-primary); }
.authoring-quick-words__list span { display:grid; min-width:0; gap:2px; }
.authoring-quick-words__list strong,.authoring-quick-words__list em { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.authoring-quick-words__list strong { color:var(--text-primary); font-size:13px; }
.authoring-quick-words__list em { font-size:10px; font-style:normal; }
.authoring-quick-words__list small { font-size:10px; }
.authoring-quick-words__list p { padding:24px 0; color:var(--text-secondary); font-size:12px; text-align:center; }
.authoring-quick-words>footer { display:flex; min-height:48px; align-items:center; justify-content:space-between; gap:10px; padding:8px 18px; border-top:1px solid var(--border-subtle); color:var(--text-secondary); font-size:11px; }
.authoring-quick-words>footer div { display:none; gap:7px; }
.authoring-quick-words>footer button { min-width:28px; min-height:32px; color:var(--text-primary); font-size:15px; }
@media (max-width:720px) { .authoring-quick-words { inset:auto 0 44px; width:auto; max-height:min(72dvh,560px); transform:none; border-inline:0; border-bottom:0; border-radius:8px 8px 0 0; } .authoring-quick-words__list { max-height:38dvh; } .authoring-quick-words>footer { align-items:flex-start; flex-direction:column; } .authoring-quick-words>footer div { display:flex; width:100%; justify-content:space-between; } .authoring-quick-words>footer button { min-width:36px; min-height:44px; } }
</style>
