<script setup>
import { tr } from '../../i18n/index.js'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
defineEmits(['backup', 'create', 'projects'])
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
    <div class="library-quick-actions__new"><button type="button" data-test="welcome-start-authoring" @click="$emit('create')"><WorkbenchIcon name="new-manuscript" :size="18" /><span><strong>{{ tr('新建作品') }}</strong></span></button><details ref="menu" @keydown.esc.stop.prevent="closeMenu" @focusout="closeMenu"><summary :aria-label="tr(&quot;新建作品选项&quot;)"><WorkbenchIcon name="chevron-down" :size="17" /></summary><div class="library-quick-actions__menu"><router-link to="/authoring?start=new&view=assistant">{{ tr('和助手构思') }}</router-link><router-link to="/authoring?start=import&guide=first-run">{{ tr('从已有书稿导入') }}</router-link></div></details></div>
    <button type="button" data-test="welcome-project-manager" @click="$emit('projects')"><WorkbenchIcon name="backup" :size="18" /><span><strong>{{ tr('项目管理') }}</strong></span></button>
    <router-link data-test="welcome-import-manuscript" to="/authoring?start=import&guide=first-run"><WorkbenchIcon name="import-manuscript" :size="18" /><span><strong>{{ tr('导入书稿') }}</strong></span></router-link>
    <button type="button" @click="$emit('backup')"><WorkbenchIcon name="backup" :size="18" /><span><strong>{{ tr('备份与恢复') }}</strong></span></button>
    <router-link to="/docs/01-quickstart"><WorkbenchIcon name="guide" :size="18" /><span><strong>{{ tr('创作指南') }}</strong></span></router-link>
  </div>
</template>

<style scoped>
.library-quick-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin: 24px 0 40px; font: 14px/1.5 var(--font-sans); }
.library-quick-actions > a, .library-quick-actions > button, .library-quick-actions__new { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 16px; border: 1px solid var(--hairline-soft); border-radius: 999px; background: transparent; color: var(--text-primary); text-decoration: none; font: inherit; text-align: left; cursor: pointer; transition: background .16s ease, color .16s ease; }
.library-quick-actions__new { position: relative; padding: 0; gap: 0; color: var(--accent-text); background: var(--accent); border-color: transparent; }
.library-quick-actions__new > :is(a, button) { display: flex; min-width: 0; align-items: center; gap: 8px; min-height: 40px; padding: 0 18px; border: 0; border-radius: 999px 0 0 999px; background: transparent; color: inherit; text-decoration: none; font: inherit; }
.library-quick-actions :is(a, button) > span { min-width: 0; }
.library-quick-actions > button, .library-quick-actions > a:last-child { border-color: transparent; color: var(--text-secondary); }
.library-quick-actions svg { flex-shrink: 0; }
.library-quick-actions strong { font-size: 14px; font-weight: 400; white-space: nowrap; }
.library-quick-actions__new strong { font-weight: 500; }
.library-quick-actions details { position: relative; flex: none; }
.library-quick-actions summary { display: grid; place-items: center; width: 40px; height: 40px; border-left: 1px solid color-mix(in srgb, var(--accent-text) 22%, transparent); border-radius: 0 999px 999px 0; cursor: pointer; list-style: none; }
.library-quick-actions summary::-webkit-details-marker { display: none; }
.library-quick-actions__menu { position: absolute; z-index: 5; left: 0; top: calc(100% + 8px); width: 224px; padding: 8px; border: 1px solid var(--hairline-soft); border-radius: 16px; background: var(--surface-workbench-raised); box-shadow: var(--shadow-workbench-float); }
.library-quick-actions__menu a { display: flex; align-items: center; padding: 8px 12px; min-height: 40px; color: var(--text-primary); text-decoration: none; font-size: 14px; border-radius: 10px; }
.library-quick-actions__menu a:hover, .library-quick-actions > a:hover, .library-quick-actions > button:hover { background: var(--nav-hover); color: var(--text-primary); }
.library-quick-actions__new > :is(a, button):hover, .library-quick-actions summary:hover { background: color-mix(in srgb, var(--accent-text) 12%, transparent); }
.library-quick-actions :is(a, button, summary):focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.library-quick-actions__new :is(a, summary):focus-visible { outline-color: var(--text-primary); }
.library-quick-actions :is(a, button, summary):active { filter: brightness(.94); }
@media (max-width: 520px) {
 .library-quick-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 22px 0 26px; }
 .library-quick-actions__new > :is(a, button) { flex: 1; }
 .library-quick-actions__new details { position: static; }
 .library-quick-actions__menu { width: min(280px, calc(100vw - 32px)); }
 .library-quick-actions strong { white-space: normal; line-height: 1.35; overflow-wrap: anywhere; }
 .library-quick-actions > a, .library-quick-actions > button { min-height: 40px; padding-inline: 10px; }
 .library-quick-actions__new > :is(a, button) { padding-inline: 8px; }
 .library-quick-actions__new, .library-quick-actions__new > :is(a, button) { min-height: 40px; }
}
@media (max-width: 760px), (pointer: coarse) {
 .library-quick-actions > a, .library-quick-actions > button, .library-quick-actions__new, .library-quick-actions__new > :is(a, button), .library-quick-actions summary, .library-quick-actions__menu a { min-height: 44px; }
 .library-quick-actions summary { width: 44px; height: 44px; }
}
</style>
