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

      <div v-if="!drivesView" class="folder-browser__crumb">
        <button v-if="current.parent" type="button" @click="go(current.parent)">↑ {{ tr('上一级') }}</button>
        <template v-for="(segment, index) in crumbSegments" :key="index">
          <button type="button" @click="go(segment.path)">{{ segment.label }}</button>
          <span class="folder-browser__sep">›</span>
        </template>
        <span class="folder-browser__here">{{ crumbSegments.at(-1)?.label || current.path }}</span>
      </div>
      <div v-else class="folder-browser__crumb"><span class="folder-browser__here">{{ tr('此电脑') }}</span></div>

      <p v-if="error" class="folder-browser__error" role="alert">{{ error }}</p>

      <div v-if="drivesView" class="folder-browser__section">
        <span class="folder-browser__sectionlabel">{{ tr('常用位置') }}</span>
        <button v-for="quick in quickLocations" :key="quick.path" type="button" class="folder-browser__row" @click="go(quick.path)">
          <span>{{ quick.name }}</span><span class="folder-browser__subpath">{{ quick.path }}</span>
        </button>
        <span class="folder-browser__sectionlabel">{{ tr('磁盘') }}</span>
        <button v-for="drive in drives" :key="drive.name" type="button" class="folder-browser__row" @click="go(drive.name)">
          <span>{{ drive.name }}</span>
        </button>
      </div>

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
        <button type="button" class="folder-browser__newfolder" :disabled="drivesView" @click="createFolder">{{ tr('+ 新建文件夹') }}</button>
        <button type="button" class="folder-browser__select" data-test="folder-browser-select" @click="emit('select', current.path)">
          {{ tr('选择此文件夹') }}<template v-if="current.isProject">（{{ tr('Pinax 项目') }}）</template>
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { tr } from '../../i18n/index.js'
import { computed, onMounted, ref } from 'vue'

const emit = defineEmits(['close', 'select'])
const current = ref({ path: '', parent: null, directories: [], bookFiles: 0, isProject: false })
const drives = ref([])
const quickLocations = ref([])
const drivesView = ref(true)
const error = ref('')
// 路径视图的目录列表（渲染取自实例属性；数据在 current.directories）
const directories = computed(() => current.value.directories || [])

const crumbSegments = computed(() => {
  if (!current.value.path) return []
  const segments = []
  const parts = current.value.path.split(/[\\/]+/).filter(Boolean)
  let accumulated = ''
  for (const part of parts) {
    accumulated = accumulated ? `${accumulated}\\${part}` : `${part}\\`
    segments.push({ path: accumulated, label: part.endsWith(':') ? part : part })
  }
  return segments
})

async function go(target) {
  error.value = ''
  try {
    const url = target ? `/api/localmirror/browse?path=${encodeURIComponent(target)}` : '/api/localmirror/browse'
    const response = await fetch(url)
    const body = await response.json().catch(() => null)
    if (!response.ok || body?.ok !== true) {
      error.value = body?.message || tr('目录读取失败')
      return
    }
    drives.value = body.drives || []
    quickLocations.value = body.quick || []
    drivesView.value = Boolean(body.drives)
    if (body.path) {
      const directories = (body.directories || []).map((entry) => ({ ...entry, childPath: `${body.path.replace(/[\\/]+$/, '')}\\${entry.name}` }))
      current.value = { path: body.path, parent: body.parent, directories, bookFiles: body.bookFiles || 0, isProject: Boolean(body.isProject) }
    }
  } catch (e) {
    error.value = e?.message || tr('目录读取失败')
  }
}

async function createFolder() {
  const name = window.prompt(tr('新文件夹名称'))
  if (!name?.trim()) return
  try {
    const response = await fetch('/api/localmirror/browse/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: current.value.path, name: name.trim() })
    })
    const body = await response.json().catch(() => null)
    if (!response.ok || body?.ok !== true) {
      error.value = body?.message || tr('新建失败')
      return
    }
    await go(current.value.path)
  } catch (e) {
    error.value = e?.message || tr('新建失败')
  }
}

onMounted(() => { void go('') })
</script>

<style scoped>
.folder-browser__overlay { position: fixed; inset: 0; z-index: 140; display: grid; place-items: center; padding: 24px; background: color-mix(in srgb, var(--archive-ink, #111) 46%, transparent); }
.folder-browser { width: min(560px, 100%); max-height: min(640px, calc(100vh - 48px)); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-panel, var(--surface-raised)); color: var(--text-primary); box-shadow: 0 24px 70px color-mix(in srgb, var(--archive-ink, #111) 24%, transparent); }
.folder-browser__head, .folder-browser__foot { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 18px; }
.folder-browser__head { border-bottom: 1px solid var(--border); }
.folder-browser__head h2 { margin: 2px 0 0; font: 600 18px/1.3 var(--font-sans); }
.folder-browser__kicker { color: var(--text-secondary); font-size: 11px; letter-spacing: 0.12em; }
.folder-browser__close { width: 40px; height: 40px; border: 0; background: transparent; color: var(--text-secondary); font-size: 22px; cursor: pointer; }
.folder-browser__crumb { display: flex; align-items: center; gap: 6px; padding: 10px 18px; border-bottom: 1px solid var(--border); font-size: 12px; color: var(--text-secondary); min-width: 0; overflow: hidden; }
.folder-browser__crumb button { flex: none; min-height: 28px; padding: 0 8px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text-primary); font: inherit; cursor: pointer; }
.folder-browser__sep { flex: none; color: var(--text-muted); }
.folder-browser__here { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; min-width: 0; }
.folder-browser__section { flex: 1; min-height: 200px; overflow: auto; display: grid; gap: 4px; align-content: start; padding: 10px 12px; }
.folder-browser__sectionlabel { font-size: 11px; font-weight: 650; color: var(--text-muted); padding: 6px 4px 2px; }
.folder-browser__row { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 40px; padding: 8px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--text-primary); font: inherit; text-align: left; cursor: pointer; }
.folder-browser__row:hover { background: var(--nav-hover); }
.folder-browser__subpath { font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.folder-browser__list { flex: 1; min-height: 200px; overflow: auto; margin: 0; padding: 8px 12px; list-style: none; }
.folder-browser__list button { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 40px; padding: 8px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--text-primary); font: inherit; text-align: left; cursor: pointer; }
.folder-browser__list button:hover { background: var(--nav-hover); }
.folder-browser__badge { flex: none; font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--archive-olive, var(--accent)); color: var(--archive-olive, var(--accent)); }
.folder-browser__empty { padding: 16px 10px; color: var(--text-secondary); font-size: 13px; }
.folder-browser__error { margin: 12px 18px; color: var(--danger); font-size: 13px; }
.folder-browser__foot { border-top: 1px solid var(--border); }
.folder-browser__newfolder { min-height: 34px; padding: 0 10px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text-primary); font: inherit; cursor: pointer; }
.folder-browser__newfolder:disabled { opacity: 0.4; cursor: default; }
.folder-browser__select { min-height: 38px; padding: 0 14px; border: 1px solid var(--archive-olive, var(--accent)); border-radius: 8px; background: var(--archive-olive, var(--accent)); color: var(--archive-paper-soft, var(--bg-primary)); font: inherit; cursor: pointer; }
</style>
