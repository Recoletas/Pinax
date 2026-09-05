<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import AuthoringCharacterAiReview from './AuthoringCharacterAiReview.vue'
import { parseCharacterEntryProfile, serializeCharacterEntryProfile } from '../../services/characterCard'

const props = defineProps({
  worldbook: { type: Object, default: null },
  chapters: { type: Array, default: () => [] },
  currentChapterId: { type: [String, Number], default: '' },
  presentPeople: { type: Array, default: () => [] },
  selectedText: { type: String, default: '' },
  focusEntryId: { type: [String, Number], default: '' }
})
const emit = defineEmits(['bind', 'create', 'update', 'remove', 'generate', 'open-chapter', 'open-full', 'toggle-pin', 'close'])

const query = ref('')
const selectedId = ref('')
const tab = ref('profile')
const fileInput = ref(null)
const profileScroll = ref(null)
const uploadHintVisible = ref(false)
const aiReviewOpen = ref(false)
const collapsedFolders = ref(new Set())
const profileFieldInputs = new Map()
const draft = reactive({ name: '', background: '', personality: '', appearance: '', other: '', avatar: '' })
let hydratingDraft = false
let saveTimer = null
let preservedScroll = null

const characters = computed(() => (props.worldbook?.entries || []).filter((entry) => entry?.type === 'character'))
const visibleCharacters = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  return characters.value.filter((entry) => !needle || `${entry.name || ''} ${entry.content || ''}`.toLocaleLowerCase().includes(needle))
})
const characterFolders = computed(() => {
  const byName = new Map()
  for (const entry of visibleCharacters.value) {
    const name = String(entry?.injection?.group || '').trim() || '角色'
    if (!byName.has(name)) byName.set(name, [])
    byName.get(name).push(entry)
  }
  const declaredOrder = (props.worldbook?.groups || []).map((name) => String(name || '').trim()).filter(Boolean)
  return [...byName.entries()]
    .map(([name, items]) => ({ name, items }))
    .sort((left, right) => {
      const leftIndex = declaredOrder.indexOf(left.name)
      const rightIndex = declaredOrder.indexOf(right.name)
      if (leftIndex < 0 && rightIndex < 0) return left.name.localeCompare(right.name, 'zh-CN')
      if (leftIndex < 0) return 1
      if (rightIndex < 0) return -1
      return leftIndex - rightIndex
    })
})
const selectedCharacter = computed(() => characters.value.find((entry) => String(entry.id) === selectedId.value) || null)
const mentions = computed(() => {
  const name = selectedCharacter.value?.name?.trim()
  if (!name) return []
  return props.chapters.filter((chapter) => `${chapter.title || ''}\n${chapter.content || chapter.text || ''}`.includes(name))
})
const totalCount = computed(() => [draft.background, draft.personality, draft.appearance, draft.other].join('').length)

function profileFor(entry) {
  const profile = parseCharacterEntryProfile(entry)
  return {
    name: entry?.name || '',
    background: profile.background ?? entry?.content ?? '',
    personality: profile.personality || '',
    appearance: profile.appearance || '',
    other: profile.other || '',
    avatar: profile.avatar || entry?.avatar || ''
  }
}

function loadDraft(entry) {
  hydratingDraft = true
  Object.assign(draft, profileFor(entry))
  hydratingDraft = false
  nextTick(resizeProfileFields)
}

function resizeProfileField(element) {
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${Math.max(54, Math.ceil(element.scrollHeight))}px`
}

function resizeProfileFields() {
  profileFieldInputs.forEach(resizeProfileField)
}

function setProfileFieldInput(key, element) {
  if (!element) {
    profileFieldInputs.delete(key)
    return
  }
  if (profileFieldInputs.get(key) === element) return
  profileFieldInputs.set(key, element)
  resizeProfileField(element)
}

function selectCharacter(entry) {
  if (!entry?.id) return
  const changed = String(entry.id) !== selectedId.value
  flushSave()
  selectedId.value = String(entry.id)
  tab.value = 'profile'
  loadDraft(entry)
  if (changed) nextTick(() => profileScroll.value?.scrollTo({ top: 0 }))
}

function characterPayload() {
  const entry = selectedCharacter.value
  if (!entry || !draft.name.trim()) return null
  return {
    name: draft.name.trim(), type: 'character', keys: [...new Set([draft.name.trim(), ...(entry.keys || [])])], content: serializeCharacterEntryProfile(draft), avatar: draft.avatar,
    metadata: { ...(entry.metadata || {}), characterProfile: {
      background: draft.background.trim(), personality: draft.personality.trim(), appearance: draft.appearance.trim(), other: draft.other.trim(), avatar: draft.avatar
    } }
  }
}

function flushSave() {
  clearTimeout(saveTimer)
  saveTimer = null
  const payload = characterPayload()
  if (payload) {
    preservedScroll = { entryId: String(selectedCharacter.value.id), top: profileScroll.value?.scrollTop || 0 }
    emit('update', selectedCharacter.value.id, payload, { silent: true })
  }
}

function scheduleSave() {
  if (hydratingDraft || !selectedCharacter.value) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(flushSave, 500)
}

function startCreate(fromSelection = false) {
  flushSave()
  emit('create', {
    name: (fromSelection ? props.selectedText.trim().slice(0, 24) : '') || '新角色', type: 'character', content: '',
    injection: { mode: 'selective', probability: 100, cooldown: 0, depth: 1, excludeRecursion: false, group: '角色' },
    metadata: { characterProfile: { background: '', personality: '', appearance: '', other: '', avatar: '' } }
  })
}

function toggleFolder(name) {
  const next = new Set(collapsedFolders.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  collapsedFolders.value = next
}

function requestRemove() {
  if (!selectedCharacter.value || !window.confirm(`确定删除角色「${selectedCharacter.value.name || '未命名角色'}」？`)) return
  clearTimeout(saveTimer)
  saveTimer = null
  emit('remove', selectedCharacter.value.id)
}
function chooseImage() { fileInput.value?.click() }
function uploadImage(event) {
  const file = event.target.files?.[0]
  if (!file || !['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    event.target.value = ''
    return
  }
  const reader = new FileReader()
  reader.onload = () => { draft.avatar = String(reader.result || '') }
  reader.readAsDataURL(file)
  event.target.value = ''
}
function generateCharacterImage() {
  flushSave()
  const prompt = [['角色', draft.name], ['背景', draft.background], ['性格', draft.personality], ['外貌', draft.appearance], ['其他', draft.other]]
    .filter(([, value]) => String(value || '').trim())
    .map(([label, value]) => `${label}：${String(value).trim()}`)
    .join('\n')
  if (prompt) emit('generate', { entry: selectedCharacter.value, prompt, referenceImage: draft.avatar })
}

function applyAiProfile(profile) {
  for (const key of ['background', 'personality', 'appearance', 'other']) {
    draft[key] = String(profile?.[key] || '')
  }
  nextTick(() => {
    resizeProfileFields()
    flushSave()
  })
}

watch(draft, scheduleSave, { deep: true, flush: 'sync' })
watch(characters, (items) => {
  if (selectedCharacter.value) return
  const initial = items[0]
  if (initial) selectCharacter(initial)
}, { immediate: true })
watch(() => props.worldbook?.updatedAt, () => {
  if (!preservedScroll || preservedScroll.entryId !== selectedId.value) return
  const top = preservedScroll.top
  preservedScroll = null
  nextTick(() => {
    if (profileScroll.value) profileScroll.value.scrollTop = top
  })
})
watch(() => props.focusEntryId, (entryId) => {
  const target = characters.value.find((entry) => String(entry.id) === String(entryId || ''))
  if (target) selectCharacter(target)
})
onMounted(() => nextTick(resizeProfileFields))
onBeforeUnmount(flushSave)
</script>

<template>
  <section class="authoring-character-workbench">
    <main class="character-sheet">
      <template v-if="worldbook">
        <header class="character-sheet__head">
          <input v-model="draft.name" class="character-name-input" aria-label="角色名称" @blur="flushSave" />
          <button v-if="selectedCharacter" type="button" class="character-ai" :aria-pressed="aiReviewOpen.toString()" @click="aiReviewOpen = !aiReviewOpen">AI 补全</button>
          <button v-if="selectedCharacter" type="button" class="character-delete" title="删除角色" aria-label="删除角色" @click="requestRemove"><WorkbenchIcon name="trash" :size="15" /></button>
        </header>
        <nav class="character-sheet__tabs" aria-label="角色资料视图">
          <button type="button" :class="{ active: tab === 'profile' }" @click="tab = 'profile'">角色</button>
          <button type="button" :class="{ active: tab === 'mentions' }" @click="tab = 'mentions'">提及章节 <small>{{ mentions.length }}</small></button>
        </nav>
        <AuthoringCharacterAiReview v-if="selectedCharacter" v-model:open="aiReviewOpen" :worldbook="worldbook" :entry="selectedCharacter" :profile="draft" @apply="applyAiProfile" />
        <span class="character-upload-tooltip" :class="{ 'is-visible': uploadHintVisible }" role="tooltip">支持 jpg、jpeg、png 格式，单张不大于 5MB</span>
        <div v-if="tab === 'profile'" ref="profileScroll" class="character-sheet__scroll">
          <section class="character-portrait">
            <img v-if="draft.avatar" :src="draft.avatar" alt="角色参考图" />
            <div v-else class="character-portrait__idle"><WorkbenchIcon name="image" :size="18" /><span>生图/上传</span></div>
            <span class="character-portrait__buttons">
              <button type="button" @click="generateCharacterImage">生成角色图</button>
              <button type="button" @mouseenter="uploadHintVisible = true" @mouseleave="uploadHintVisible = false" @focus="uploadHintVisible = true" @blur="uploadHintVisible = false" @click="chooseImage">上传角色图</button>
            </span>
            <input ref="fileInput" class="visually-hidden" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" @change="uploadImage" />
          </section>
          <label v-for="field in [['background', '背景'], ['personality', '性格'], ['appearance', '外貌'], ['other', '其他']]" :key="field[0]" class="character-profile-field">
            <span>{{ field[1] }}</span><textarea :ref="(element) => setProfileFieldInput(field[0], element)" v-model="draft[field[0]]" @input="resizeProfileField($event.currentTarget)" @blur="flushSave"></textarea>
          </label>
          <footer class="character-count">{{ totalCount }}/20000</footer>
        </div>
        <div v-else class="character-mentions">
          <button v-for="chapter in mentions" :key="chapter.id" type="button" @click="emit('open-chapter', chapter.id)"><WorkbenchIcon name="book" :size="15" /><span>{{ chapter.title || '未命名章节' }}</span><small>打开 ›</small></button>
        </div>
      </template>
      <div v-else class="character-empty"><button type="button" @click="emit('bind')">关联世界书</button></div>
    </main>
    <aside class="character-directory">
      <div class="catalog-window-controls"><button type="button" title="固定角色工作台" @click="emit('toggle-pin')">⌖</button><button type="button" title="关闭角色工作台" @click="emit('close')">×</button></div>
      <div class="catalog-search"><WorkbenchIcon name="search" :size="16" /><input v-model="query" type="search" placeholder="角色" aria-label="搜索角色" /></div>
      <div class="catalog-actions"><button type="button" class="primary" @click="startCreate(false)">新建</button><button type="button" @click="startCreate(true)">提取</button></div>
      <header><strong>目录</strong><button type="button" title="在世界书中打开当前角色" @click="emit('open-full', selectedCharacter?.id)">世界书</button></header>
      <section v-for="group in characterFolders" :key="group.name" class="character-directory__group">
        <h3><button type="button" :aria-expanded="(!collapsedFolders.has(group.name)).toString()" @click="toggleFolder(group.name)"><span class="catalog-folder-caret" :class="{ open: !collapsedFolders.has(group.name) }">›</span><WorkbenchIcon name="folder" :size="17" /><span>{{ group.name }}</span></button></h3>
        <template v-if="!collapsedFolders.has(group.name)"><button v-for="entry in group.items" :key="entry.id" type="button" :class="{ active: selectedId === String(entry.id) }" @click="selectCharacter(entry)">{{ entry.name || '未命名角色' }}</button></template>
      </section>
    </aside>
  </section>
</template>

<style scoped>
.authoring-character-workbench{display:grid;grid-template-columns:minmax(0,1.62fr) minmax(160px,1fr);min-height:100%;height:100%;background:var(--surface-workbench-raised)}
button{border:0;background:transparent;color:var(--text-secondary);font:inherit;cursor:pointer}.primary{background:var(--accent-primary,var(--accent,#1677ff))!important;color:white!important}
.character-sheet{position:relative;display:flex;min-width:0;min-height:0;flex-direction:column;border-right:1px solid var(--border-subtle)}
.character-sheet__head{display:flex;min-height:62px;align-items:center;gap:12px;padding:8px 16px}.character-name-input{min-width:0;flex:1;border:0;background:transparent;color:var(--text-primary);font:600 var(--authoring-catalog-title-size,17px)/1.5 var(--font-body);outline:0}.character-name-input:focus{box-shadow:inset 0 -1px var(--accent-primary)}.character-ai{flex:0 0 auto;color:var(--accent-primary);font-size:var(--authoring-catalog-meta-size,10px)}.character-delete{width:28px;height:28px;color:var(--text-secondary)}
.character-sheet__tabs{display:flex;gap:22px;padding:0 16px;border-bottom:1px solid var(--border-subtle)}.character-sheet__tabs button{min-height:39px;border-bottom:2px solid transparent;color:var(--text-secondary);font-size:var(--authoring-catalog-control-size,14px)}.character-sheet__tabs button.active{border-bottom-color:var(--accent-primary);color:var(--text-primary);font-weight:600}.character-sheet__tabs small{font-size:var(--authoring-catalog-meta-size,10px)}
.character-upload-tooltip{position:absolute;z-index:5;top:88px;left:50%;box-sizing:border-box;width:max-content;max-width:calc(100% - 24px);padding:8px 11px;border:1px solid var(--border-subtle);border-radius:3px;background:var(--surface-workbench-raised);box-shadow:0 4px 14px color-mix(in srgb,var(--text-primary) 14%,transparent);color:var(--text-primary);font-size:11px;line-height:1.4;text-align:center;opacity:0;pointer-events:none;transform:translateX(-50%)}.character-upload-tooltip::after{position:absolute;bottom:-6px;left:70%;width:10px;height:10px;border-right:1px solid var(--border-subtle);border-bottom:1px solid var(--border-subtle);background:var(--surface-workbench-raised);content:"";transform:translateX(-50%) rotate(45deg)}.character-upload-tooltip.is-visible{opacity:1}
.character-sheet__scroll{position:relative;flex:1;min-height:0;overflow:auto;padding:12px 16px 38px}.character-portrait{position:relative;display:flex;min-height:74px;align-items:center;justify-content:center;border:1px dashed var(--border-subtle);border-radius:4px;background:var(--surface-workbench-muted)}.character-portrait__idle{display:flex;align-items:center;gap:8px;color:var(--text-secondary)}.character-portrait img{width:100%;height:150px;border-radius:3px;object-fit:cover}.character-portrait__buttons{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:12px;padding:15px;opacity:0;pointer-events:none;background:var(--surface-workbench-muted)}.character-portrait:hover .character-portrait__buttons,.character-portrait:focus-within .character-portrait__buttons{opacity:1;pointer-events:auto}.character-portrait:hover .character-portrait__idle,.character-portrait:focus-within .character-portrait__idle{opacity:0}.character-portrait__buttons button{position:relative;min-width:0;height:42px;flex:1;border:1px solid var(--border-subtle);border-radius:4px;background:var(--surface-workbench-raised);color:var(--text-primary)}.character-portrait__buttons button:first-child{border-color:var(--accent-primary,var(--accent,#1677ff));background:var(--accent-primary,var(--accent,#1677ff));color:white}
.character-profile-field{display:block;padding:17px 0 14px;border-bottom:1px dashed var(--border-subtle)}.character-profile-field>span{display:block;margin-bottom:7px;color:var(--text-secondary);font-size:var(--authoring-catalog-label-size,12px)}.character-profile-field textarea{display:block;box-sizing:border-box;width:100%;height:auto;min-height:54px;overflow:hidden;resize:none;border:0;background:transparent;color:var(--text-primary);font:var(--authoring-catalog-body-size,14px)/1.8 var(--font-body);outline:0}.character-count{position:sticky;bottom:-38px;padding:12px 0 0;text-align:right;color:var(--text-secondary);font-size:var(--authoring-catalog-meta-size,10px)}
.character-mentions{display:grid;align-content:start;gap:2px;padding:14px 12px}.character-mentions button{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;padding:11px;text-align:left}.character-mentions button:hover{background:color-mix(in srgb,var(--accent-primary) 7%,transparent)}.character-mentions small{color:var(--text-secondary);font-size:11px}
.character-directory{min-width:0;overflow:auto;padding:6px 10px 12px}.catalog-window-controls{display:flex;height:28px;align-items:center;justify-content:flex-end;gap:3px}.catalog-window-controls button{width:26px;height:26px;font-size:18px}.catalog-search{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:7px;height:38px;padding:0 10px;border:1px solid var(--border-subtle);border-radius:4px;background:var(--surface-workbench-muted);color:var(--text-secondary)}.catalog-search input{min-width:0;border:0;outline:0;background:transparent;color:var(--text-primary);font:inherit}.catalog-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:9px 0 14px}.catalog-actions button{height:36px;border:1px solid var(--border-subtle);border-radius:4px;color:var(--text-primary)}.character-directory>header{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}.character-directory>header button{font-size:11px}.character-directory__group h3{margin:10px 0 5px;font-size:13px;font-weight:500}.character-directory__group h3 button{display:flex;width:100%;min-height:30px;align-items:center;gap:6px;padding:0 6px;color:var(--text-primary);text-align:left}.catalog-folder-caret{display:inline-block;width:10px;color:var(--text-secondary);font-size:15px;transform-origin:center;transition:transform var(--motion-fast,120ms)}.catalog-folder-caret.open{transform:rotate(90deg)}.character-directory__group>button{width:100%;min-height:38px;padding:0 14px 0 27px;border-radius:4px;text-align:left;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.character-directory__group>button.active{background:color-mix(in srgb,var(--accent-primary,var(--accent,#1677ff)) 19%,var(--surface-workbench-raised));font-weight:600}.character-empty{padding:24px}.character-empty button{color:var(--accent-primary,var(--accent,#1677ff))}.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.catalog-search input,.catalog-actions button{font-size:var(--authoring-catalog-control-size,14px)}.character-directory>header{font-size:var(--authoring-catalog-directory-title-size,14px)}.character-directory>header button{font-size:var(--authoring-catalog-meta-size,10px)}.character-directory__group h3{font-size:var(--authoring-catalog-folder-size,13px)}.character-directory__group h3 button{font-size:inherit}.character-directory__group>button{font-size:var(--authoring-catalog-entry-size,13px)}
.character-directory__group h3{margin:6px 0 0}
.character-directory__group h3 button{min-height:34px;padding-inline:4px}
.character-directory__group>button{min-height:40px;padding-inline:36px 10px}
@media(max-width:720px){.authoring-character-workbench{grid-template-columns:1fr;grid-template-rows:minmax(0,42%) minmax(0,58%)}.character-directory{order:-1;max-height:none;border-bottom:1px solid var(--border-subtle)}.character-sheet{border-right:0}.character-directory__group h3{margin-top:8px}}
@media(hover:none){.character-portrait__buttons{opacity:1;pointer-events:auto}.character-portrait__idle{opacity:0}}
@media(pointer:coarse){.catalog-window-controls button,.character-delete,.character-portrait__buttons button{min-width:44px;min-height:44px}.catalog-actions button,.character-directory__group>button,.character-mentions button{min-height:44px}}
</style>
