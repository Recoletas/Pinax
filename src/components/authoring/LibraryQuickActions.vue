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
    <div class="library-quick-actions__new"><router-link data-test="welcome-start-authoring" to="/authoring?start=new&guide=first-run"><WorkbenchIcon name="bookmark-plus" :size="25" /><span><strong>新建作品</strong><small>从一份空白书稿开始</small></span></router-link><details ref="menu" @keydown.esc.stop.prevent="closeMenu" @focusout="closeMenu"><summary aria-label="新建作品选项"><WorkbenchIcon name="chevron-down" :size="17" /></summary><div class="library-quick-actions__menu"><router-link to="/authoring?start=new&guide=first-run">空白小说</router-link><router-link to="/authoring?start=import&guide=first-run">从已有书稿创建</router-link></div></details></div>
    <router-link data-test="welcome-import-manuscript" to="/authoring?start=import&guide=first-run"><WorkbenchIcon name="download" :size="25" /><span><strong>导入书稿</strong><small>TXT / Markdown</small></span></router-link>
    <button type="button" @click="$emit('backup')"><WorkbenchIcon name="archive" :size="25" /><span><strong>备份与恢复</strong><small>为作品留一份副本</small></span></button>
    <router-link to="/docs/10-beta-guide"><WorkbenchIcon name="book" :size="25" /><span><strong>创作指南</strong><small>了解工作台与创作工具</small></span></router-link>
  </div>
</template>

<style scoped>
.library-quick-actions { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin: 28px 0 38px; }
.library-quick-actions > a, .library-quick-actions > button, .library-quick-actions__new { display: flex; align-items: center; gap: 16px; min-height: 94px; padding: 18px; border: 1px solid var(--archive-paper-strong); border-radius: 8px; background: var(--archive-paper-soft); color: var(--archive-ink); text-decoration: none; font: inherit; text-align: left; cursor: pointer; }
.library-quick-actions__new { padding: 0; gap: 0; background: color-mix(in srgb, var(--archive-olive) 4%, var(--archive-paper-soft)); }
.library-quick-actions__new > a { padding: 18px; flex: 1; display: flex; gap: 16px; align-items: center; min-width: 0; text-decoration: none; color: inherit; }
.library-quick-actions svg { flex-shrink: 0; color: var(--archive-olive); }
.library-quick-actions strong { display: block; font-size: 18px; font-weight: 550; white-space: nowrap; }
.library-quick-actions small { display: block; font-size: 13px; color: var(--archive-ink-soft); margin-top: 7px; }
.library-quick-actions details { position: relative; margin-right: 8px; }
.library-quick-actions summary { display: grid; place-items: center; width: 32px; height: 44px; cursor: pointer; list-style: none; }
.library-quick-actions summary::-webkit-details-marker { display: none; }
.library-quick-actions__menu { position: absolute; z-index: 5; right: 0; top: 100%; width: 210px; padding: 6px; border: 1px solid var(--archive-paper-strong); border-radius: 6px; background: var(--archive-paper-soft); box-shadow: 0 8px 24px color-mix(in srgb, var(--archive-ink) 14%, transparent); }
.library-quick-actions__menu a { display: block; padding: 12px; color: var(--archive-ink); text-decoration: none; font-size: 15px; border-radius: 4px; }
.library-quick-actions__menu a:hover { background: var(--archive-paper); }
.library-quick-actions > a:hover, .library-quick-actions > button:hover, .library-quick-actions__new:hover { border-color: var(--archive-olive); }
@media (max-width: 1179px) { .library-quick-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 520px) { .library-quick-actions { gap: 10px; margin: 22px 0; } .library-quick-actions > a, .library-quick-actions > button, .library-quick-actions__new > a { padding: 12px; gap: 10px; } .library-quick-actions strong { font-size: 16px; } .library-quick-actions small { font-size: 12px; line-height: 1.5; } .library-quick-actions__new > a { padding-right: 0; } .library-quick-actions details { margin-right: 0; } }
</style>
