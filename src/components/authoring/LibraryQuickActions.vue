<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
defineEmits(['backup'])
const menu = ref(null)
function closeMenu(event) {
  if (event.type === 'focusout' && menu.value?.contains(event.relatedTarget)) return
  menu.value?.removeAttribute('open')
  if (event.key === 'Escape') menu.value?.querySelector('summary')?.focus()
}
function onOutsidePointer(event) {
  if (!menu.value?.contains(event.target)) closeMenu(event)
}
onMounted(() => document.addEventListener('pointerdown', onOutsidePointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutsidePointer))
</script>

<template>
  <div class="library-quick-actions">
    <div class="library-quick-actions__new"><router-link data-test="welcome-start-authoring" to="/authoring?start=new&guide=first-run"><WorkbenchIcon name="new-manuscript" :size="18" /><span><strong>新建作品</strong></span></router-link><details ref="menu" @keydown.esc.stop.prevent="closeMenu" @focusout="closeMenu"><summary aria-label="新建作品选项"><WorkbenchIcon name="chevron-down" :size="17" /></summary><div class="library-quick-actions__menu"><router-link to="/authoring?start=new&guide=first-run">空白小说</router-link><router-link to="/authoring?start=import&guide=first-run">从已有书稿创建</router-link></div></details></div>
    <router-link data-test="welcome-import-manuscript" to="/authoring?start=import&guide=first-run"><WorkbenchIcon name="import-manuscript" :size="18" /><span><strong>导入书稿</strong></span></router-link>
    <button type="button" @click="$emit('backup')"><WorkbenchIcon name="backup" :size="18" /><span><strong>备份与恢复</strong></span></button>
    <router-link to="/docs/01-quickstart"><WorkbenchIcon name="guide" :size="18" /><span><strong>创作指南</strong></span></router-link>
  </div>
</template>

<style scoped>
.library-quick-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: 24px 0 32px; }
.library-quick-actions > a, .library-quick-actions > button, .library-quick-actions__new { display: inline-flex; align-items: center; gap: 8px; min-height: 38px; padding: 0 14px; border: 1px solid var(--archive-paper-strong); border-radius: 6px; background: transparent; color: var(--text-primary); text-decoration: none; font: inherit; text-align: left; cursor: pointer; }
.library-quick-actions__new { padding: 0; gap: 0; color: var(--accent-text); background: var(--accent); border-color: transparent; }
.library-quick-actions__new > a { display: flex; align-items: center; gap: 8px; min-height: 38px; padding: 0 12px; color: inherit; text-decoration: none; }
.library-quick-actions > button, .library-quick-actions > a:last-child { border-color: transparent; color: var(--text-secondary); }
.library-quick-actions svg { flex-shrink: 0; }
.library-quick-actions strong { font-size: 14px; font-weight: 550; white-space: nowrap; }
.library-quick-actions details { position: relative; }
.library-quick-actions summary { display: grid; place-items: center; width: 32px; height: 30px; border-left: 1px solid color-mix(in srgb, var(--accent-text) 28%, transparent); cursor: pointer; list-style: none; }
.library-quick-actions summary::-webkit-details-marker { display: none; }
.library-quick-actions__menu { position: absolute; z-index: 5; left: 0; top: calc(100% + 9px); width: 210px; padding: 6px; border: 1px solid var(--archive-paper-strong); border-radius: 8px; background: var(--archive-paper-soft); box-shadow: 0 8px 24px color-mix(in srgb, var(--archive-ink) 12%, transparent); }
.library-quick-actions__menu a { display: flex; align-items: center; padding: 8px 10px; min-height: 36px; color: var(--text-primary); text-decoration: none; font-size: 14px; border-radius: 4px; }
.library-quick-actions__menu a:hover, .library-quick-actions > a:hover, .library-quick-actions > button:hover { background: var(--nav-hover); color: var(--text-primary); }
.library-quick-actions__new > a:hover, .library-quick-actions summary:hover { background: color-mix(in srgb, var(--accent-text) 12%, transparent); }
.library-quick-actions :is(a, button, summary):focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 4px; }
.library-quick-actions__new :is(a, summary):focus-visible { outline-color: var(--text-primary); }
.library-quick-actions :is(a, button, summary):active { filter: brightness(.94); }
@media (max-width: 520px) {
 .library-quick-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 22px 0 26px; }
 .library-quick-actions__new > a { flex: 1; }
 .library-quick-actions > a, .library-quick-actions > button { min-height: 40px; padding-inline: 10px; }
 .library-quick-actions__new, .library-quick-actions__new > a { min-height: 40px; }
}
@media (pointer: coarse) {
 .library-quick-actions > a, .library-quick-actions > button, .library-quick-actions__new > a, .library-quick-actions summary { min-height: 44px; }
 .library-quick-actions summary { width: 40px; }
}
</style>
