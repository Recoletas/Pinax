<template>
  <div class="folder-browser__overlay" @click.self="emit('close')">
    <section class="folder-browser" role="dialog" aria-modal="true" :aria-label="tr('选择项目文件夹')">
      <header class="folder-browser__head">
        <div>
          <span class="folder-browser__kicker">{{ tr('本地文件夹') }}</span>
          <h2>{{ tr('选择项目文件夹') }}</h2>
        </div>
        <button type="button" class="folder-browser__close" :aria-label="tr('关闭')" @click="emit('close')">×</button>
      </header>
      <div class="folder-browser__crumb">
        <button v-if="current.parent" type="button" @click="go(current.parent)">↑ {{ tr('上一级') }}</button>
        <span class="folder-browser__path" data-test="folder-browser-path">{{ current.path }}</span>
      </div>
      <p v-if="error" class="folder-browser__error" role="alert">{{ error }}</p>
      <ul v-else class="folder-browser__list">
        <li v-if="!directories.length" class="folder-browser__empty">{{ tr('此层没有子文件夹') }}</li>
        <li v-for="entry in directories" :key="entry.name">
          <button type="button" @click="go(entry.childPath)">
            <span>{{ entry.name }}</span>
            <span v-if="entry.hasPinax" class="folder-browser__badge">{{ tr('Pinax 项目') }}</span>
          </button>
        </li>
      </ul>
      <footer class="folder-browser__foot">
        <p>{{ tr('当前层') }}：{{ directories.length }} {{ tr('个子文件夹') }}<template v-if="current.bookFiles"> · {{ current.bookFiles }} {{ tr('个书稿文件') }}</template><template v-if="current.isProject"> · {{ tr('已是 Pinax 项目') }}</template></p>
        <button type="button" class="folder-browser__select" data-test="folder-browser-select" @click="emit('select', current.path)">{{ tr('选择此文件夹') }}</button>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { tr } from '../../i18n/index.js'
import { onMounted, ref } from 'vue'

const emit = defineEmits(['close', 'select'])
const current = ref({ path: '', parent: null, directories: [], bookFiles: 0, isProject: false })
const error = ref('')

async function go(target) {
  error.value = ''
  try {
    const response = await fetch(`/api/localmirror/browse?path=${encodeURIComponent(target)}`)
    const body = await response.json().catch(() => null)
    if (!response.ok || body?.ok !== true) {
      error.value = body?.message || tr('目录读取失败')
      return
    }
    const directories = (body.directories || []).map((entry) => ({ ...entry, childPath: `${body.path.replace(/[\\/]+$/, '')}\\${entry.name}` }))
    current.value = { path: body.path, parent: body.parent, directories, bookFiles: body.bookFiles || 0, isProject: Boolean(body.isProject) }
  } catch (e) {
    error.value = e?.message || tr('目录读取失败')
  }
}

onMounted(() => {
  go('')
})
</script>

<style scoped>
.folder-browser__overlay { position: fixed; inset: 0; z-index: 140; display: grid; place-items: center; padding: 24px; background: color-mix(in srgb, var(--archive-ink, #111) 46%, transparent); }
.folder-browser { width: min(560px, 100%); max-height: min(640px, calc(100vh - 48px)); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-panel, var(--surface-raised)); color: var(--text-primary); box-shadow: 0 24px 70px color-mix(in srgb, var(--archive-ink, #111) 24%, transparent); }
.folder-browser__head, .folder-browser__foot { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 18px; }
.folder-browser__head { border-bottom: 1px solid var(--border); }
.folder-browser__head h2 { margin: 2px 0 0; font: 600 18px/1.3 var(--font-sans); }
.folder-browser__kicker { color: var(--text-secondary); font-size: 11px; letter-spacing: 0.12em; }
.folder-browser__close { width: 40px; height: 40px; border: 0; background: transparent; color: var(--text-secondary); font-size: 22px; cursor: pointer; }
.folder-browser__crumb { display: flex; align-items: center; gap: 10px; padding: 10px 18px; border-bottom: 1px solid var(--border); font-size: 12px; color: var(--text-secondary); min-width: 0; }
.folder-browser__crumb button { flex: none; min-height: 28px; padding: 0 8px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text-primary); font: inherit; cursor: pointer; }
.folder-browser__path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
.folder-browser__list { flex: 1; min-height: 200px; overflow: auto; margin: 0; padding: 8px 12px; list-style: none; }
.folder-browser__list button { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 40px; padding: 8px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--text-primary); font: inherit; text-align: left; cursor: pointer; }
.folder-browser__list button:hover { background: var(--nav-hover); }
.folder-browser__badge { flex: none; font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--archive-olive, var(--accent)); color: var(--archive-olive, var(--accent)); }
.folder-browser__empty { padding: 16px 10px; color: var(--text-secondary); font-size: 13px; }
.folder-browser__error { margin: 16px 18px; color: var(--danger); font-size: 13px; }
.folder-browser__foot { border-top: 1px solid var(--border); }
.folder-browser__foot p { margin: 0; font-size: 12px; color: var(--text-secondary); }
.folder-browser__select { min-height: 38px; padding: 0 14px; border: 1px solid var(--archive-olive, var(--accent)); border-radius: 8px; background: var(--archive-olive, var(--accent)); color: var(--archive-paper-soft, var(--bg-primary)); font: inherit; cursor: pointer; }
</style>
