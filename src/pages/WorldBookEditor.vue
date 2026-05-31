<template>
  <div class="worldbook-page">
    <header class="editor-header">
      <div class="header-left">
        <button class="ghost-btn" @click="openExperience">返回体验</button>
        <h1>世界书 · 高级设置</h1>
      </div>
      <div class="header-right">
        <button class="ghost-btn" @click="openQuickImport">返回快速导入</button>
        <input
          v-model.trim="worldbookSearch"
          class="search-input"
          placeholder="搜索世界书..."
          type="text"
        />
        <button class="primary-btn" @click="createWorldbook">新建世界书</button>
      </div>
    </header>

    <div class="editor-layout">
      <aside class="worldbook-pane">
        <div class="pane-title">世界书</div>
        <div class="worldbook-list" v-if="filteredWorldbooks.length">
          <button
            v-for="wb in filteredWorldbooks"
            :key="wb.id"
            :class="['worldbook-item', { active: wb.id === activeWorldbook?.id }]"
            @click="selectWorldbook(wb.id)"
          >
            <span class="worldbook-name">{{ wb.name }}</span>
            <span class="worldbook-meta">{{ wb.entryCount || 0 }} 条目</span>
          </button>
        </div>
        <div v-else class="empty-hint">暂无匹配世界书</div>
      </aside>

      <section class="editor-main" v-if="activeWorldbook">
        <section class="card">
          <div class="card-head">
            <h2>世界书基础设定</h2>
          </div>
          <div class="worldbook-form">
            <label>
              名称
              <input v-model.trim="worldbookForm.name" class="text-input" type="text" placeholder="世界书名称" />
            </label>
            <label>
              作者
              <input v-model.trim="worldbookForm.author" class="text-input" type="text" placeholder="作者（可选）" />
            </label>
            <label class="full-width">
              世界设定描述
              <textarea
                v-model.trim="worldbookForm.worldDescription"
                class="text-area"
                rows="4"
                placeholder="描述世界观的基本设定、背景故事、核心概念等。这是 AI 生成内容时必须遵循的基础设定。"
              ></textarea>
            </label>
            <label class="full-width">
              写作风格
              <textarea
                v-model.trim="worldbookForm.writingStyle"
                class="text-area"
                rows="3"
                placeholder="定义叙事风格、语言风格、情感基调等。例如：采用第三人称叙事，语言简洁有力，注重心理描写..."
              ></textarea>
            </label>
            <label class="full-width">
              示例文本
              <textarea
                v-model.trim="worldbookForm.examples"
                class="text-area"
                rows="4"
                placeholder="提供示例供 AI 参考，帮助理解预期的输出风格和格式。可以是优秀的叙事片段示例。"
              ></textarea>
            </label>
            <label class="full-width">
              禁止内容
              <textarea
                v-model.trim="worldbookForm.forbidden"
                class="text-area"
                rows="3"
                placeholder="定义 AI 不应该生成的内容类型、风格或元素。例如：避免过于现代的口语、不出现某些敏感话题..."
              ></textarea>
            </label>
          </div>
          <div class="card-actions">
            <button class="primary-btn" :disabled="savingWorldbook" @click="saveWorldbook">
              {{ savingWorldbook ? '保存中...' : '保存世界书' }}
            </button>
            <button class="danger-btn" @click="deleteWorldbook">删除世界书</button>
          </div>
        </section>

        <section class="card">
          <div class="card-head split">
            <h2>导入导出</h2>
            <div class="entry-tools">
              <input
                ref="importFileInputRef"
                class="hidden-file-input"
                type="file"
                accept=".json,application/json"
                @change="handleImportFileChange"
              />
              <button class="ghost-btn" :disabled="importing" @click="openImportFilePicker">
                {{ importing ? '读取中...' : '导入 SillyTavern JSON' }}
              </button>
              <button class="ghost-btn" :disabled="exporting || !activeWorldbook?.id" @click="exportActiveWorldbook">
                {{ exporting ? '导出中...' : '导出当前世界书' }}
              </button>
            </div>
          </div>

          <div v-if="importError" class="import-error">{{ importError }}</div>
          <div v-if="transferMessage" class="import-success">{{ transferMessage }}</div>

          <div v-if="importPreview" class="import-preview">
            <div class="import-preview-head">
              <strong>{{ importPreview.name }}</strong>
              <span>{{ importPreview.fileName }}</span>
            </div>

            <div class="import-meta-grid">
              <div class="meta-item">
                <span>条目数</span>
                <strong>{{ importPreview.entryCount }}</strong>
              </div>
              <div class="meta-item">
                <span>分组数</span>
                <strong>{{ importPreview.groupCount }}</strong>
              </div>
              <div class="meta-item">
                <span>作者</span>
                <strong>{{ importPreview.author || '未知' }}</strong>
              </div>
            </div>

            <div v-if="importPreview.typeStats.length" class="import-type-list">
              <span v-for="stat in importPreview.typeStats" :key="stat.type" class="type-chip">
                {{ stat.label }} {{ stat.count }}
              </span>
            </div>

            <div v-if="importPreview.previewEntries.length" class="preview-entry-list">
              <div
                v-for="previewEntry in importPreview.previewEntries"
                :key="previewEntry.uid"
                class="preview-entry-item"
              >
                <span class="preview-entry-name">{{ previewEntry.name }}</span>
                <span class="preview-entry-meta">{{ entryTypeLabel(previewEntry.type) }} / {{ entryModeLabel(previewEntry.mode) }}</span>
              </div>
            </div>

            <div class="card-actions">
              <button class="primary-btn" :disabled="importing" @click="confirmImportFromPreview">
                {{ importing ? '导入中...' : '确认导入为新世界书' }}
              </button>
              <button class="ghost-btn" @click="clearImportPreview">取消预览</button>
            </div>
          </div>

          <div v-else class="empty-hint">
            导入前会先显示摘要预览，确认后再创建新世界书。
          </div>
        </section>

        <section class="card">
          <div class="card-head split">
            <h2>分组管理</h2>
            <button class="ghost-btn small" :disabled="groupWorking" @click="pruneEmptyGroups">
              清理空分组
            </button>
          </div>

          <div v-if="groupError" class="import-error">{{ groupError }}</div>
          <div v-if="groupSuccess" class="import-success">{{ groupSuccess }}</div>

          <div v-if="groupStats.length" class="group-overview">
            <div
              v-for="group in groupStats"
              :key="group.name"
              class="group-overview-item"
              :class="{ empty: group.entryCount === 0 }"
            >
              <span>{{ group.name }}</span>
              <strong>{{ group.entryCount }} 条</strong>
            </div>
          </div>
          <div v-else class="empty-hint">当前没有分组，可先创建。</div>

          <div class="group-manager-grid">
            <section class="group-manager-block">
              <h3>创建分组</h3>
              <div class="group-form-row">
                <input
                  v-model.trim="groupDraftName"
                  class="text-input"
                  type="text"
                  list="worldbook-group-options"
                  placeholder="输入新分组名称"
                />
                <button class="ghost-btn" :disabled="groupWorking" @click="createGroup">
                  创建
                </button>
              </div>
            </section>

            <section class="group-manager-block" v-if="groupStats.length">
              <h3>重命名分组</h3>
              <div class="group-form-row">
                <select v-model="groupRenameSource" class="select-input">
                  <option v-for="group in groupStats" :key="`rename-${group.name}`" :value="group.name">
                    {{ group.name }}
                  </option>
                </select>
                <input
                  v-model.trim="groupRenameTarget"
                  class="text-input"
                  type="text"
                  list="worldbook-group-options"
                  placeholder="新分组名称"
                />
                <button class="ghost-btn" :disabled="groupWorking" @click="renameGroup">
                  重命名
                </button>
              </div>
            </section>

            <section class="group-manager-block" v-if="groupStats.length">
              <h3>迁移条目</h3>
              <div class="group-form-row">
                <select v-model="groupMoveSource" class="select-input">
                  <option v-for="group in groupStats" :key="`move-${group.name}`" :value="group.name">
                    {{ group.name }}
                  </option>
                </select>
                <input
                  v-model.trim="groupMoveTarget"
                  class="text-input"
                  type="text"
                  list="worldbook-group-options"
                  placeholder="迁移到分组"
                />
                <label class="checkbox-line inline">
                  <input v-model="groupDropSourceAfterMove" type="checkbox" />
                  <span>迁移后删除源分组</span>
                </label>
                <button class="ghost-btn" :disabled="groupWorking" @click="migrateGroupEntries">
                  迁移
                </button>
              </div>
            </section>

            <section class="group-manager-block danger" v-if="groupStats.length">
              <h3>删除分组</h3>
              <div class="group-form-row">
                <select v-model="groupDeleteSource" class="select-input">
                  <option v-for="group in groupStats" :key="`delete-${group.name}`" :value="group.name">
                    {{ group.name }}
                  </option>
                </select>
                <button class="danger-btn" :disabled="groupWorking" @click="deleteGroup">
                  删除并清空条目分组
                </button>
              </div>
            </section>
          </div>

          <datalist id="worldbook-group-options">
            <option v-for="group in availableGroups" :key="`opt-${group}`" :value="group"></option>
          </datalist>
        </section>

        <section class="card">
          <div class="card-head split">
            <h2>条目管理</h2>
            <div class="entry-tools">
              <input
                v-model.trim="entrySearch"
                class="search-input"
                placeholder="搜索条目..."
                type="text"
              />
              <select v-model="entryTypeFilter" class="select-input">
                <option value="all">全部类型</option>
                <option v-for="type in entryTypes" :key="type.value" :value="type.value">
                  {{ type.label }}
                </option>
              </select>
              <select v-model="injectionModeFilter" class="select-input">
                <option value="all">全部注入模式</option>
                <option v-for="mode in injectionModes" :key="mode.value" :value="mode.value">
                  {{ mode.label }}
                </option>
              </select>
              <select v-model="entryGroupFilter" class="select-input">
                <option value="all">全部分组</option>
                <option value="__none">未分组</option>
                <option v-for="group in availableGroups" :key="group" :value="group">
                  {{ group }}
                </option>
              </select>
              <button class="primary-btn" @click="createEntry">新增条目</button>
            </div>
          </div>

          <div class="bulk-tools" v-if="filteredEntries.length">
            <span class="bulk-label">已选 {{ selectedEntryIds.length }} 条</span>
            <button class="ghost-btn small" @click="selectAllFilteredEntries">全选筛选结果</button>
            <button class="ghost-btn small" @click="invertFilteredSelection">反选</button>
            <button class="ghost-btn small" @click="clearEntrySelection">清空选择</button>
            <select v-model="bulkModeTarget" class="select-input compact">
              <option v-for="mode in injectionModes" :key="mode.value" :value="mode.value">
                {{ mode.label }}
              </option>
            </select>
            <button class="ghost-btn small" :disabled="!selectedEntryIds.length" @click="applyBulkMode">
              批量改模式
            </button>
            <input
              v-model.trim="bulkGroupValue"
              class="text-input compact"
              type="text"
              placeholder="批量分组"
            />
            <button class="ghost-btn small" :disabled="!selectedEntryIds.length" @click="applyBulkGroup">
              批量改分组
            </button>
            <button class="danger-btn small" :disabled="!selectedEntryIds.length" @click="bulkDeleteEntries">
              批量删除
            </button>
          </div>

          <div class="entry-layout">
            <aside class="entry-list">
              <div
                v-for="entry in filteredEntries"
                :key="entry.id"
                :class="['entry-item', { active: entry.id === selectedEntryId }]"
                @click="pickEntry(entry.id)"
              >
                <input
                  type="checkbox"
                  class="entry-checkbox"
                  :checked="isEntrySelected(entry.id)"
                  @click.stop
                  @change="toggleEntrySelection(entry.id, $event.target.checked)"
                />
                <div class="entry-main">
                  <span class="entry-title">{{ entry.name || '未命名条目' }}</span>
                  <div class="entry-badges">
                    <span class="entry-type">{{ entryTypeLabel(entry.type) }}</span>
                    <span class="entry-mode">{{ entryModeLabel(entry.injection?.mode) }}</span>
                    <span v-if="entry.injection?.group" class="entry-group">{{ entry.injection.group }}</span>
                  </div>
                </div>
              </div>
              <div v-if="!filteredEntries.length" class="empty-hint">暂无匹配条目</div>
            </aside>

            <div class="entry-editor" v-if="selectedEntry">
              <label>
                条目名称
                <input v-model.trim="entryForm.name" class="text-input" type="text" placeholder="条目名称" />
              </label>
              <label>
                条目类型
                <select v-model="entryForm.type" class="select-input">
                  <option v-for="type in entryTypes" :key="type.value" :value="type.value">
                    {{ type.label }}
                  </option>
                </select>
              </label>
              <label>
                触发词（逗号分隔）
                <input
                  v-model.trim="entryForm.keys"
                  class="text-input"
                  type="text"
                  placeholder="例如：公爵领, 埃利奥诺"
                />
              </label>
              <label>
                次级触发词（逗号分隔）
                <input
                  v-model.trim="entryForm.keysSecondary"
                  class="text-input"
                  type="text"
                  placeholder="例如：边境领地"
                />
              </label>
              <label>
                内容
                <textarea
                  v-model.trim="entryForm.content"
                  class="text-area"
                  rows="8"
                  placeholder="输入条目内容"
                ></textarea>
              </label>

              <section class="injection-panel">
                <h3>注入参数</h3>
                <div class="injection-grid">
                  <label>
                    注入模式
                    <select v-model="entryForm.injectionMode" class="select-input">
                      <option v-for="mode in injectionModes" :key="mode.value" :value="mode.value">
                        {{ mode.label }}
                      </option>
                    </select>
                  </label>
                  <label>
                    概率（0-100）
                    <input v-model.number="entryForm.injectionProbability" class="text-input" type="number" min="0" max="100" />
                  </label>
                  <label>
                    深度
                    <input v-model.number="entryForm.injectionDepth" class="text-input" type="number" min="1" />
                  </label>
                  <label>
                    冷却轮次
                    <input v-model.number="entryForm.injectionCooldown" class="text-input" type="number" min="0" />
                  </label>
                  <label class="full-row">
                    分组
                    <input v-model.trim="entryForm.injectionGroup" class="text-input" type="text" placeholder="例如：地理设定" />
                  </label>
                </div>
                <label class="checkbox-line">
                  <input v-model="entryForm.excludeRecursion" type="checkbox" />
                  <span>排除递归注入</span>
                </label>
                <div class="group-quick" v-if="availableGroups.length">
                  <span class="group-quick-label">常用分组</span>
                  <div class="group-chip-list">
                    <button
                      v-for="group in availableGroups"
                      :key="group"
                      class="group-chip"
                      :class="{ active: entryForm.injectionGroup === group }"
                      @click.prevent="setEntryGroup(group)"
                    >
                      {{ group }}
                    </button>
                  </div>
                </div>
              </section>

              <div class="card-actions">
                <button class="primary-btn" :disabled="savingEntry" @click="saveEntry">
                  {{ savingEntry ? '保存中...' : '保存条目' }}
                </button>
                <button class="danger-btn" @click="deleteEntry">删除条目</button>
              </div>
            </div>

            <div class="entry-editor empty" v-else>
              请选择一个条目进行编辑，或点击“新增条目”。
            </div>
          </div>
        </section>
      </section>

      <section class="editor-main empty" v-else>
        尚无可编辑世界书，点击左上角“新建世界书”开始。
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useWorldStore } from '../stores/worldStore'
import { formatWorldbookStatus } from '../services/worldbookFeedback'

const router = useRouter()
const worldStore = useWorldStore()

const worldbookSearch = ref('')
const entrySearch = ref('')
const entryTypeFilter = ref('all')
const injectionModeFilter = ref('all')
const entryGroupFilter = ref('all')
const selectedEntryId = ref('')
const selectedEntryIds = ref([])
const bulkModeTarget = ref('selective')
const bulkGroupValue = ref('')
const importFileInputRef = ref(null)
const importPreview = ref(null)
const importError = ref('')
const transferMessage = ref('')
const importing = ref(false)
const exporting = ref(false)
const groupDraftName = ref('')
const groupRenameSource = ref('')
const groupRenameTarget = ref('')
const groupMoveSource = ref('')
const groupMoveTarget = ref('')
const groupDeleteSource = ref('')
const groupDropSourceAfterMove = ref(true)
const groupWorking = ref(false)
const groupError = ref('')
const groupSuccess = ref('')
const savingWorldbook = ref(false)
const savingEntry = ref(false)

const worldbookForm = reactive({
  name: '',
  author: '',
  worldDescription: '',
  writingStyle: '',
  examples: '',
  forbidden: '',
  description: ''
})

const entryForm = reactive({
  name: '',
  type: 'general',
  keys: '',
  keysSecondary: '',
  content: '',
  injectionMode: 'selective',
  injectionProbability: 100,
  injectionCooldown: 0,
  injectionDepth: 1,
  excludeRecursion: false,
  injectionGroup: ''
})

const entryTypes = [
  { value: 'general', label: '通用' },
  { value: 'rule', label: '规则' },
  { value: 'style', label: '风格' },
  { value: 'forbidden', label: '禁忌' },
  { value: 'location', label: '地点' },
  { value: 'character', label: '角色' },
  { value: 'organization', label: '组织' },
  { value: 'item', label: '物品' },
  { value: 'lore', label: '设定' },
  { value: 'quest', label: '任务' },
  { value: 'event', label: '事件' }
]

const injectionModes = [
  { value: 'selective', label: '选择触发' },
  { value: 'constant', label: '常量注入' }
]

const worldbooksIndex = computed(() => worldStore.worldbooksIndex || [])
const activeWorldbook = computed(() => worldStore.activeWorldbook)
const entries = computed(() => activeWorldbook.value?.entries || [])

const availableGroups = computed(() => {
  const pool = new Set()
  for (const group of activeWorldbook.value?.groups || []) {
    const normalized = normalizeGroupName(group)
    if (normalized) pool.add(normalized)
  }
  for (const entry of entries.value) {
    const normalized = normalizeGroupName(entry?.injection?.group)
    if (normalized) pool.add(normalized)
  }
  return Array.from(pool)
})

const groupStats = computed(() => {
  const counter = new Map()

  for (const group of activeWorldbook.value?.groups || []) {
    const normalized = normalizeGroupName(group)
    if (!normalized || counter.has(normalized)) continue
    counter.set(normalized, 0)
  }

  for (const entry of entries.value) {
    const group = normalizeGroupName(entry?.injection?.group)
    if (!group) continue
    counter.set(group, (counter.get(group) || 0) + 1)
  }

  return Array.from(counter.entries())
    .map(([name, entryCount]) => ({ name, entryCount }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const filteredWorldbooks = computed(() => {
  const keyword = worldbookSearch.value.toLowerCase()
  if (!keyword) return worldbooksIndex.value
  return worldbooksIndex.value.filter((wb) => {
    return [wb.name, wb.description, wb.author]
      .map(v => String(v || '').toLowerCase())
      .some(v => v.includes(keyword))
  })
})

const filteredEntries = computed(() => {
  const keyword = entrySearch.value.toLowerCase()
  return entries.value.filter((entry) => {
    const matchType = entryTypeFilter.value === 'all' || entry.type === entryTypeFilter.value
    const modeValue = normalizeInjection(entry?.injection).mode
    const matchMode = injectionModeFilter.value === 'all' || modeValue === injectionModeFilter.value
    const groupValue = String(entry?.injection?.group || '').trim()
    const matchGroup = entryGroupFilter.value === 'all'
      || (entryGroupFilter.value === '__none' ? !groupValue : groupValue === entryGroupFilter.value)
    const matchKeyword = !keyword || [
      entry.name,
      entry.content,
      ...(entry.keys || []),
      ...(entry.keysSecondary || [])
    ]
      .map(v => String(v || '').toLowerCase())
      .some(v => v.includes(keyword))

    return matchType && matchMode && matchGroup && matchKeyword
  })
})

const selectedEntry = computed(() => {
  return entries.value.find(e => e.id === selectedEntryId.value) || null
})

watch(activeWorldbook, (next) => {
  syncWorldbookForm(next)
  selectFirstEntry()
  selectedEntryIds.value = []
  groupDraftName.value = ''
  groupRenameTarget.value = ''
  groupMoveTarget.value = ''
  clearGroupMessages()
}, { immediate: true })

watch(selectedEntry, (entry) => {
  if (entry) syncEntryForm(entry)
  else resetEntryForm()
}, { immediate: true })

watch(entries, (nextEntries) => {
  const idSet = new Set(nextEntries.map(entry => entry.id))
  selectedEntryIds.value = selectedEntryIds.value.filter(id => idSet.has(id))
  if (selectedEntryId.value && !idSet.has(selectedEntryId.value)) {
    selectFirstEntry()
  }
}, { deep: true })

watch(availableGroups, (groups) => {
  if (entryGroupFilter.value === 'all' || entryGroupFilter.value === '__none') return
  if (!groups.includes(entryGroupFilter.value)) {
    entryGroupFilter.value = 'all'
  }
})

watch(groupStats, (stats) => {
  const names = stats.map(item => item.name)

  if (!names.length) {
    groupRenameSource.value = ''
    groupMoveSource.value = ''
    groupDeleteSource.value = ''
    return
  }

  if (!names.includes(groupRenameSource.value)) {
    groupRenameSource.value = names[0]
  }

  if (!names.includes(groupMoveSource.value)) {
    groupMoveSource.value = names[0]
  }

  if (!names.includes(groupDeleteSource.value)) {
    groupDeleteSource.value = names[0]
  }

  if (!normalizeGroupName(groupMoveTarget.value)) {
    groupMoveTarget.value = names.find(name => name !== groupMoveSource.value) || ''
  }
}, { immediate: true })

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function toStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item || '').trim())
      .filter(Boolean)
  }
  const normalized = String(value || '').trim()
  return normalized ? [normalized] : []
}

function detectEntryType(keys, content, name = '') {
  if (typeof worldStore.guessEntryType === 'function') {
    return worldStore.guessEntryType(keys, content, name)
  }
  return 'general'
}

function inferPreviewInjectionMode(rawEntry, type) {
  const modeText = String(rawEntry?.mode || '').trim().toLowerCase()
  if (rawEntry?.constant === true || modeText === 'constant') return 'constant'
  if (['rule', 'style', 'forbidden'].includes(type)) return 'constant'
  return 'selective'
}

function normalizePreview(rawData, fileName) {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
    throw new Error('JSON 结构无效：需要对象根节点')
  }

  const rawEntries = rawData.entries || rawData.entry || {}
  const entryPairs = Array.isArray(rawEntries)
    ? rawEntries.map((entry, idx) => [String(idx), entry])
    : (rawEntries && typeof rawEntries === 'object' ? Object.entries(rawEntries) : [])

  if (!entryPairs.length) {
    throw new Error('未检测到可导入的 entries 数据')
  }

  const previewEntries = entryPairs.map(([uid, entry]) => {
    const keys = toStringArray(entry?.key)
    const keysSecondary = toStringArray(entry?.keysecondary)
    const type = detectEntryType(keys, String(entry?.content || ''), String(entry?.comment || uid || ''))
    const mode = inferPreviewInjectionMode(entry, type)
    const group = String(entry?.group || '').trim() || null

    return {
      uid,
      name: String(entry?.comment || keys[0] || uid || '未命名条目'),
      type,
      mode,
      group,
      keyCount: keys.length + keysSecondary.length
    }
  })

  const typeCounter = new Map()
  const groupSet = new Set()

  for (const entry of previewEntries) {
    typeCounter.set(entry.type, (typeCounter.get(entry.type) || 0) + 1)
    if (entry.group) groupSet.add(entry.group)
  }

  for (const group of Array.isArray(rawData.groups) ? rawData.groups : []) {
    const normalized = String(group || '').trim()
    if (normalized) groupSet.add(normalized)
  }

  const typeStats = Array.from(typeCounter.entries())
    .map(([type, count]) => ({
      type,
      label: entryTypeLabel(type),
      count
    }))
    .sort((a, b) => b.count - a.count)

  return {
    fileName,
    name: String(rawData.name || rawData.world_name || '导入世界书'),
    author: String(rawData.creator || rawData.author || ''),
    entryCount: previewEntries.length,
    groupCount: groupSet.size,
    typeStats,
    previewEntries: previewEntries.slice(0, 10),
    rawData
  }
}

function normalizeInjection(injection = {}) {
  const mode = injection?.mode === 'constant' ? 'constant' : 'selective'
  return {
    mode,
    probability: clampNumber(injection?.probability, 100, 0, 100),
    cooldown: clampNumber(injection?.cooldown, 0, 0, 99999),
    depth: clampNumber(injection?.depth, 1, 1, 99),
    excludeRecursion: Boolean(injection?.excludeRecursion),
    group: String(injection?.group || '').trim() || null
  }
}

function splitKeywords(input) {
  return String(input || '')
    .split(/[\n,，]/)
    .map(v => v.trim())
    .filter(Boolean)
}

function normalizeGroupName(value) {
  return String(value || '').trim()
}

function uniqueGroups(groups = []) {
  const result = []
  const seen = new Set()

  for (const group of groups) {
    const normalized = normalizeGroupName(group)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

function clearGroupMessages() {
  groupError.value = ''
  groupSuccess.value = ''
}

function setGroupError(message) {
  groupError.value = formatWorldbookStatus(message)
  groupSuccess.value = ''
}

function setGroupSuccess(message) {
  groupSuccess.value = formatWorldbookStatus(message)
  groupError.value = ''
}

function setTransferError(message) {
  importError.value = formatWorldbookStatus(message)
  transferMessage.value = ''
}

function setTransferSuccess(message) {
  transferMessage.value = formatWorldbookStatus(message)
  importError.value = ''
}

function getCurrentWorldbookGroups() {
  return uniqueGroups(activeWorldbook.value?.groups || [])
}

function getEntryIdsByGroup(groupName) {
  const normalizedGroup = normalizeGroupName(groupName)
  if (!normalizedGroup) return []

  return entries.value
    .filter(entry => normalizeGroupName(entry?.injection?.group) === normalizedGroup)
    .map(entry => entry.id)
}

function entryTypeLabel(typeValue) {
  const matched = entryTypes.find(t => t.value === typeValue)
  return matched?.label || typeValue || '通用'
}

function entryModeLabel(modeValue) {
  const mode = normalizeInjection({ mode: modeValue }).mode
  const matched = injectionModes.find(item => item.value === mode)
  return matched?.label || '选择触发'
}

function syncWorldbookForm(worldbook) {
  worldbookForm.name = worldbook?.name || ''
  worldbookForm.author = worldbook?.author || ''
  worldbookForm.worldDescription = worldbook?.worldDescription || worldbook?.description || ''
  worldbookForm.writingStyle = worldbook?.writingStyle || ''
  worldbookForm.examples = worldbook?.examples || ''
  worldbookForm.forbidden = worldbook?.forbidden || ''
  worldbookForm.description = worldbook?.description || ''
}

function syncEntryForm(entry) {
  const injection = normalizeInjection(entry?.injection)
  entryForm.name = entry?.name || ''
  entryForm.type = entry?.type || 'general'
  entryForm.keys = (entry?.keys || []).join(', ')
  entryForm.keysSecondary = (entry?.keysSecondary || []).join(', ')
  entryForm.content = entry?.content || ''
  entryForm.injectionMode = injection.mode
  entryForm.injectionProbability = injection.probability
  entryForm.injectionCooldown = injection.cooldown
  entryForm.injectionDepth = injection.depth
  entryForm.excludeRecursion = injection.excludeRecursion
  entryForm.injectionGroup = injection.group || ''
}

function resetEntryForm() {
  entryForm.name = ''
  entryForm.type = 'general'
  entryForm.keys = ''
  entryForm.keysSecondary = ''
  entryForm.content = ''
  entryForm.injectionMode = 'selective'
  entryForm.injectionProbability = 100
  entryForm.injectionCooldown = 0
  entryForm.injectionDepth = 1
  entryForm.excludeRecursion = false
  entryForm.injectionGroup = ''
}

function selectFirstEntry() {
  const first = entries.value[0]
  selectedEntryId.value = first?.id || ''
}

function openExperience() {
  router.push({ name: 'experience' })
}

function openQuickImport() {
  router.push({ name: 'experience-worldbook' })
}

async function selectWorldbook(worldbookId) {
  await worldStore.setActiveWorldbook(worldbookId)
}

async function createWorldbook() {
  const nextName = `世界书 ${worldbooksIndex.value.length + 1}`
  const created = await worldStore.createWorldbook({ name: nextName })
  await worldStore.loadWorldbooksIndex()
  if (created?.id) {
    await worldStore.setActiveWorldbook(created.id)
  }
}

async function saveWorldbook() {
  if (!activeWorldbook.value?.id || !worldbookForm.name.trim()) return
  savingWorldbook.value = true
  try {
    await worldStore.updateWorldbook(activeWorldbook.value.id, {
      name: worldbookForm.name.trim(),
      author: worldbookForm.author.trim(),
      worldDescription: worldbookForm.worldDescription.trim(),
      writingStyle: worldbookForm.writingStyle.trim(),
      examples: worldbookForm.examples.trim(),
      forbidden: worldbookForm.forbidden.trim(),
      description: worldbookForm.worldDescription.trim() // 兼容旧字段
    })
    await worldStore.loadWorldbooksIndex()
  } finally {
    savingWorldbook.value = false
  }
}

async function deleteWorldbook() {
  if (!activeWorldbook.value?.id) return
  const ok = window.confirm(`确认删除世界书「${activeWorldbook.value.name || '未命名'}」？`)
  if (!ok) return

  await worldStore.deleteWorldbook(activeWorldbook.value.id)
  await worldStore.loadWorldbooksIndex()
  if (typeof worldStore.ensureActiveWorldbook === 'function') {
    await worldStore.ensureActiveWorldbook()
  }
}

async function createEntry() {
  if (!activeWorldbook.value?.id) return
  const initialGroup = entryGroupFilter.value !== 'all' && entryGroupFilter.value !== '__none'
    ? entryGroupFilter.value
    : null
  const created = await worldStore.addEntry(activeWorldbook.value.id, {
    name: '新条目',
    type: 'general',
    keys: [],
    keysSecondary: [],
    content: '',
    injection: {
      mode: 'selective',
      probability: 100,
      cooldown: 0,
      depth: 1,
      excludeRecursion: false,
      group: initialGroup
    }
  })
  await worldStore.loadWorldbooksIndex()
  if (initialGroup) {
    await persistWorldbookGroups([initialGroup])
  }
  if (created?.id) selectedEntryId.value = created.id
}

async function saveEntry() {
  if (!activeWorldbook.value?.id || !selectedEntry.value) return
  savingEntry.value = true
  try {
    const normalizedInjection = normalizeInjection({
      mode: entryForm.injectionMode,
      probability: entryForm.injectionProbability,
      cooldown: entryForm.injectionCooldown,
      depth: entryForm.injectionDepth,
      excludeRecursion: entryForm.excludeRecursion,
      group: entryForm.injectionGroup
    })

    await worldStore.updateEntry(activeWorldbook.value.id, selectedEntry.value.id, {
      name: entryForm.name.trim() || '未命名条目',
      type: entryForm.type,
      keys: splitKeywords(entryForm.keys),
      keysSecondary: splitKeywords(entryForm.keysSecondary),
      content: entryForm.content.trim(),
      injection: normalizedInjection
    })
    await worldStore.loadWorldbooksIndex()
    if (normalizedInjection.group) {
      await persistWorldbookGroups([normalizedInjection.group])
    }
  } finally {
    savingEntry.value = false
  }
}

async function deleteEntry() {
  if (!activeWorldbook.value?.id || !selectedEntry.value?.id) return
  const ok = window.confirm(`确认删除条目「${selectedEntry.value.name || '未命名条目'}」？`)
  if (!ok) return

  await worldStore.deleteEntry(activeWorldbook.value.id, selectedEntry.value.id)
  await worldStore.loadWorldbooksIndex()
  selectFirstEntry()
}

function pickEntry(entryId) {
  selectedEntryId.value = entryId
}

function isEntrySelected(entryId) {
  return selectedEntryIds.value.includes(entryId)
}

function toggleEntrySelection(entryId, checked) {
  const selected = new Set(selectedEntryIds.value)
  if (checked) selected.add(entryId)
  else selected.delete(entryId)
  selectedEntryIds.value = Array.from(selected)
}

function selectAllFilteredEntries() {
  const selected = new Set(selectedEntryIds.value)
  for (const entry of filteredEntries.value) {
    selected.add(entry.id)
  }
  selectedEntryIds.value = Array.from(selected)
}

function invertFilteredSelection() {
  const selected = new Set(selectedEntryIds.value)
  for (const entry of filteredEntries.value) {
    if (selected.has(entry.id)) selected.delete(entry.id)
    else selected.add(entry.id)
  }
  selectedEntryIds.value = Array.from(selected)
}

function clearEntrySelection() {
  selectedEntryIds.value = []
}

async function updateEntriesByIds(entryIds, updater) {
  if (!activeWorldbook.value?.id || !entryIds.length) return

  for (const entryId of entryIds) {
    const entry = entries.value.find(item => item.id === entryId)
    if (!entry) continue
    const payload = updater(entry)
    if (!payload) continue
    await worldStore.updateEntry(activeWorldbook.value.id, entryId, payload)
  }

  await worldStore.loadWorldbooksIndex()
  await worldStore.setActiveWorldbook(activeWorldbook.value.id)
}

async function applyBulkMode() {
  if (!selectedEntryIds.value.length) return
  savingEntry.value = true
  try {
    await updateEntriesByIds(selectedEntryIds.value, (entry) => {
      return {
        injection: {
          ...normalizeInjection(entry.injection),
          mode: bulkModeTarget.value
        }
      }
    })
  } finally {
    savingEntry.value = false
  }
}

async function applyBulkGroup() {
  if (!selectedEntryIds.value.length) return
  savingEntry.value = true
  try {
    const groupValue = bulkGroupValue.value.trim()
    await updateEntriesByIds(selectedEntryIds.value, (entry) => {
      return {
        injection: {
          ...normalizeInjection(entry.injection),
          group: groupValue || null
        }
      }
    })
    if (groupValue) {
      await persistWorldbookGroups([groupValue])
    }
  } finally {
    savingEntry.value = false
  }
}

async function bulkDeleteEntries() {
  if (!activeWorldbook.value?.id || !selectedEntryIds.value.length) return
  const ok = window.confirm(`确认批量删除 ${selectedEntryIds.value.length} 条条目？`)
  if (!ok) return

  savingEntry.value = true
  try {
    const toDelete = [...selectedEntryIds.value]
    for (const entryId of toDelete) {
      await worldStore.deleteEntry(activeWorldbook.value.id, entryId)
    }
    await worldStore.loadWorldbooksIndex()
    await worldStore.setActiveWorldbook(activeWorldbook.value.id)
    selectedEntryIds.value = []
    selectFirstEntry()
  } finally {
    savingEntry.value = false
  }
}

async function persistWorldbookGroups(extraGroups = []) {
  const currentGroups = getCurrentWorldbookGroups()
  const nextGroups = uniqueGroups([...currentGroups, ...extraGroups])
  await replaceWorldbookGroups(nextGroups)
}

async function replaceWorldbookGroups(nextGroups = []) {
  if (!activeWorldbook.value?.id) return

  const currentGroups = getCurrentWorldbookGroups()
  const resolvedGroups = uniqueGroups(nextGroups)
  const unchanged = resolvedGroups.length === currentGroups.length
    && resolvedGroups.every(group => currentGroups.includes(group))

  if (unchanged) return

  await worldStore.updateWorldbook(activeWorldbook.value.id, {
    groups: resolvedGroups
  })
  await worldStore.loadWorldbooksIndex()
}

async function createGroup() {
  const nextGroup = normalizeGroupName(groupDraftName.value)
  if (!nextGroup) {
    setGroupError('请输入分组名称。')
    return
  }

  const exists = groupStats.value.some(group => group.name === nextGroup)
  if (exists) {
    setGroupError(`分组「${nextGroup}」已存在。`)
    return
  }

  groupWorking.value = true
  clearGroupMessages()

  try {
    await persistWorldbookGroups([nextGroup])
    groupDraftName.value = ''
    groupRenameSource.value = nextGroup
    groupMoveSource.value = nextGroup
    groupDeleteSource.value = nextGroup
    setGroupSuccess(`已创建分组「${nextGroup}」。`)
  } catch (error) {
    setGroupError(`创建分组失败：${error?.message || '未知错误'}`)
  } finally {
    groupWorking.value = false
  }
}

async function renameGroup() {
  const source = normalizeGroupName(groupRenameSource.value)
  const target = normalizeGroupName(groupRenameTarget.value)

  if (!source) {
    setGroupError('请选择要重命名的分组。')
    return
  }

  if (!target) {
    setGroupError('请输入新的分组名称。')
    return
  }

  if (source === target) {
    setGroupError('新分组名称不能与原名称相同。')
    return
  }

  const targetExists = groupStats.value.some(group => group.name === target)
  const confirmText = targetExists
    ? `目标分组「${target}」已存在，重命名将合并条目，是否继续？`
    : `确认将分组「${source}」重命名为「${target}」？`

  if (!window.confirm(confirmText)) return

  groupWorking.value = true
  clearGroupMessages()

  try {
    const sourceEntryIds = getEntryIdsByGroup(source)
    if (sourceEntryIds.length) {
      await updateEntriesByIds(sourceEntryIds, (entry) => {
        return {
          injection: {
            ...normalizeInjection(entry.injection),
            group: target
          }
        }
      })
    }

    const nextGroups = uniqueGroups([
      ...getCurrentWorldbookGroups().filter(group => group !== source),
      target
    ])
    await replaceWorldbookGroups(nextGroups)

    if (entryGroupFilter.value === source) {
      entryGroupFilter.value = target
    }
    groupRenameSource.value = target
    groupMoveSource.value = target
    groupDeleteSource.value = target
    groupRenameTarget.value = ''

    setGroupSuccess(`已重命名分组「${source}」为「${target}」，同步更新 ${sourceEntryIds.length} 条条目。`)
  } catch (error) {
    setGroupError(`重命名分组失败：${error?.message || '未知错误'}`)
  } finally {
    groupWorking.value = false
  }
}

async function migrateGroupEntries() {
  const source = normalizeGroupName(groupMoveSource.value)
  const target = normalizeGroupName(groupMoveTarget.value)

  if (!source) {
    setGroupError('请选择源分组。')
    return
  }

  if (!target) {
    setGroupError('请输入目标分组名称。')
    return
  }

  if (source === target) {
    setGroupError('目标分组不能与源分组相同。')
    return
  }

  const dropSource = groupDropSourceAfterMove.value
  const confirmText = dropSource
    ? `确认将「${source}」的条目迁移到「${target}」，并删除源分组？`
    : `确认将「${source}」的条目迁移到「${target}」并保留源分组？`
  if (!window.confirm(confirmText)) return

  groupWorking.value = true
  clearGroupMessages()

  try {
    const sourceEntryIds = getEntryIdsByGroup(source)
    if (sourceEntryIds.length) {
      await updateEntriesByIds(sourceEntryIds, (entry) => {
        return {
          injection: {
            ...normalizeInjection(entry.injection),
            group: target
          }
        }
      })
    }

    const nextGroups = uniqueGroups([
      ...getCurrentWorldbookGroups().filter(group => !(dropSource && group === source)),
      target
    ])
    await replaceWorldbookGroups(nextGroups)

    if (entryGroupFilter.value === source && dropSource) {
      entryGroupFilter.value = target
    }
    groupMoveSource.value = target
    groupDeleteSource.value = dropSource ? target : groupDeleteSource.value

    const suffix = dropSource ? '，并删除了源分组。' : '。'
    setGroupSuccess(`已迁移 ${sourceEntryIds.length} 条条目到「${target}」${suffix}`)
  } catch (error) {
    setGroupError(`迁移分组失败：${error?.message || '未知错误'}`)
  } finally {
    groupWorking.value = false
  }
}

async function deleteGroup() {
  const source = normalizeGroupName(groupDeleteSource.value)
  if (!source) {
    setGroupError('请选择要删除的分组。')
    return
  }

  const sourceEntryIds = getEntryIdsByGroup(source)
  const confirmText = sourceEntryIds.length
    ? `确认删除分组「${source}」？其中 ${sourceEntryIds.length} 条条目的分组将被清空。`
    : `确认删除空分组「${source}」？`
  if (!window.confirm(confirmText)) return

  groupWorking.value = true
  clearGroupMessages()

  try {
    if (sourceEntryIds.length) {
      await updateEntriesByIds(sourceEntryIds, (entry) => {
        return {
          injection: {
            ...normalizeInjection(entry.injection),
            group: null
          }
        }
      })
    }

    const nextGroups = getCurrentWorldbookGroups().filter(group => group !== source)
    await replaceWorldbookGroups(nextGroups)

    if (entryGroupFilter.value === source) {
      entryGroupFilter.value = 'all'
    }
    setGroupSuccess(`已删除分组「${source}」，并清空 ${sourceEntryIds.length} 条条目的分组。`)
  } catch (error) {
    setGroupError(`删除分组失败：${error?.message || '未知错误'}`)
  } finally {
    groupWorking.value = false
  }
}

async function pruneEmptyGroups() {
  const emptyGroups = groupStats.value
    .filter(group => group.entryCount === 0)
    .map(group => group.name)

  if (!emptyGroups.length) {
    setGroupSuccess('没有可清理的空分组。')
    return
  }

  const ok = window.confirm(`确认清理 ${emptyGroups.length} 个空分组？`)
  if (!ok) return

  groupWorking.value = true
  clearGroupMessages()

  try {
    const keepGroups = groupStats.value
      .filter(group => group.entryCount > 0)
      .map(group => group.name)
    await replaceWorldbookGroups(keepGroups)
    setGroupSuccess(`已清理 ${emptyGroups.length} 个空分组。`)
  } catch (error) {
    setGroupError(`清理空分组失败：${error?.message || '未知错误'}`)
  } finally {
    groupWorking.value = false
  }
}

function setEntryGroup(group) {
  entryForm.injectionGroup = group
}

function openImportFilePicker() {
  importError.value = ''
  transferMessage.value = ''
  if (importFileInputRef.value) {
    importFileInputRef.value.value = ''
    importFileInputRef.value.click()
  }
}

async function handleImportFileChange(event) {
  const file = event?.target?.files?.[0]
  if (!file) return

  importError.value = ''
  transferMessage.value = ''
  importing.value = true

  try {
    const text = await file.text()
    const parsed = JSON.parse(text)
    importPreview.value = normalizePreview(parsed, file.name)
  } catch (error) {
    importPreview.value = null
    setTransferError(`导入预览失败：${error?.message || '未知错误'}`)
  } finally {
    importing.value = false
  }
}

function clearImportPreview() {
  importPreview.value = null
  importError.value = ''
}

async function confirmImportFromPreview() {
  if (!importPreview.value?.rawData) return

  importing.value = true
  importError.value = ''
  transferMessage.value = ''

  try {
    const created = await worldStore.importFromSillyTavern(importPreview.value.rawData)
    await worldStore.loadWorldbooksIndex()
    if (created?.id) {
      await worldStore.setActiveWorldbook(created.id)
    }
    importPreview.value = null
    setTransferSuccess(`导入完成：${created?.name || '新世界书'}`)
  } catch (error) {
    setTransferError(`导入失败：${error?.message || '未知错误'}`)
  } finally {
    importing.value = false
  }
}

function toSafeFilename(input) {
  const cleaned = String(input || '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .trim()
  return cleaned || 'worldbook'
}

async function exportActiveWorldbook() {
  if (!activeWorldbook.value?.id) return

  exporting.value = true
  importError.value = ''
  transferMessage.value = ''

  try {
    const payload = await worldStore.exportToSillyTavern(activeWorldbook.value.id)
    const filename = `${toSafeFilename(activeWorldbook.value.name)}.json`
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(objectUrl)
    setTransferSuccess(`导出完成：${filename}`)
  } catch (error) {
    setTransferError(`导出失败：${error?.message || '未知错误'}`)
  } finally {
    exporting.value = false
  }
}

onMounted(async () => {
  try {
    await worldStore.loadWorldbooksIndex()
    if (typeof worldStore.ensureActiveWorldbook === 'function') {
      await worldStore.ensureActiveWorldbook()
    } else if (worldbooksIndex.value.length > 0) {
      await worldStore.setActiveWorldbook(worldbooksIndex.value[0].id)
    }
  } catch (e) {
    console.error('[世界书·高级设置] 初始化失败:', e)
  }
})
</script>

<style scoped>
.worldbook-page {
  min-height: var(--app-viewport-height, 100vh);
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-left h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.editor-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 12px;
  padding: 12px;
}

.worldbook-pane {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.pane-title {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.worldbook-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: auto;
}

.worldbook-item {
  border: 1px solid var(--border);
  background: var(--bg-primary);
  border-radius: 8px;
  color: var(--text-primary);
  text-align: left;
  padding: 8px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.worldbook-item.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-primary));
}

.worldbook-name {
  font-size: 13px;
  font-weight: 600;
}

.worldbook-meta {
  font-size: 11px;
  color: var(--text-muted);
}

.editor-main {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.editor-main.empty {
  background: var(--bg-secondary);
  border: 1px dashed var(--border);
  border-radius: 10px;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
}

.card-head {
  margin-bottom: 10px;
}

.card-head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.card-head.split {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.worldbook-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.worldbook-form .full-width {
  grid-column: 1 / -1;
}

.entry-tools {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.hidden-file-input {
  display: none;
}

.import-error,
.import-success {
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  margin-bottom: 8px;
}

.import-error {
  border: 1px solid color-mix(in srgb, #ef4444 55%, var(--border));
  background: color-mix(in srgb, #ef4444 12%, var(--bg-primary));
  color: #ef4444;
}

.import-success {
  border: 1px solid color-mix(in srgb, #10b981 55%, var(--border));
  background: color-mix(in srgb, #10b981 12%, var(--bg-primary));
  color: #10b981;
}

.import-preview {
  border: 1px dashed var(--border);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.import-preview-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.import-preview-head strong {
  font-size: 14px;
  color: var(--text-primary);
}

.import-preview-head span {
  font-size: 11px;
  color: var(--text-muted);
}

.import-meta-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.meta-item {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-item span {
  font-size: 11px;
  color: var(--text-muted);
}

.meta-item strong {
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-all;
}

.import-type-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.type-chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--text-secondary);
}

.preview-entry-list {
  border: 1px solid var(--border);
  border-radius: 8px;
  max-height: 180px;
  overflow: auto;
}

.preview-entry-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}

.preview-entry-item:last-child {
  border-bottom: none;
}

.preview-entry-name {
  font-size: 12px;
  color: var(--text-primary);
  word-break: break-all;
}

.preview-entry-meta {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

.group-overview {
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 10px;
  max-height: 180px;
  overflow: auto;
}

.group-overview-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}

.group-overview-item:last-child {
  border-bottom: none;
}

.group-overview-item span {
  color: var(--text-primary);
  word-break: break-all;
}

.group-overview-item strong {
  color: var(--text-secondary);
  font-weight: 600;
  white-space: nowrap;
}

.group-overview-item.empty span,
.group-overview-item.empty strong {
  color: var(--text-muted);
}

.group-manager-grid {
  display: grid;
  gap: 10px;
}

.group-manager-block {
  border: 1px dashed var(--border);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-manager-block h3 {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.group-manager-block.danger {
  border-color: color-mix(in srgb, #ef4444 45%, var(--border));
}

.group-form-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.group-form-row .text-input,
.group-form-row .select-input {
  min-width: 150px;
  flex: 1;
}

.bulk-tools {
  margin-bottom: 10px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.bulk-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.select-input.compact,
.text-input.compact {
  width: auto;
  min-width: 110px;
}

.entry-layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 12px;
  min-height: 320px;
}

.entry-list {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.entry-item {
  border: 1px solid var(--border);
  background: var(--bg-primary);
  border-radius: 8px;
  color: var(--text-primary);
  padding: 8px;
  cursor: pointer;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.entry-item.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-primary));
}

.entry-checkbox {
  margin-top: 2px;
}

.entry-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.entry-title {
  font-size: 12px;
  font-weight: 600;
  display: block;
  word-break: break-all;
}

.entry-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.entry-type,
.entry-mode,
.entry-group {
  font-size: 11px;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 1px 6px;
}

.entry-group {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}

.entry-editor {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.entry-editor.empty {
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.text-input,
.select-input,
.text-area,
.search-input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 8px 10px;
  font-size: 13px;
}

.text-area {
  resize: vertical;
}

.injection-panel {
  border: 1px dashed var(--border);
  border-radius: 8px;
  padding: 10px;
}

.injection-panel h3 {
  margin: 0 0 8px;
  font-size: 13px;
}

.injection-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.injection-grid .full-row {
  grid-column: 1 / -1;
}

.checkbox-line {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkbox-line.inline {
  margin-top: 0;
}

.group-quick {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.group-quick-label {
  font-size: 11px;
  color: var(--text-muted);
}

.group-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.group-chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
}

.group-chip.active {
  border-color: var(--accent);
  color: var(--accent);
}

.card-actions {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}

.primary-btn,
.ghost-btn,
.danger-btn {
  border: 1px solid var(--border);
  border-radius: 8px;
  height: 34px;
  padding: 0 12px;
  cursor: pointer;
  font-size: 12px;
}

.small {
  height: 30px;
  padding: 0 10px;
}

.primary-btn {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.primary-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.ghost-btn {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.danger-btn {
  background: transparent;
  color: #ef4444;
  border-color: color-mix(in srgb, #ef4444 70%, var(--border));
}

.empty-hint {
  color: var(--text-muted);
  font-size: 12px;
  padding: 8px;
}

@media (max-width: var(--bp-desktop)) {
  .editor-layout {
    grid-template-columns: 1fr;
  }

  .entry-layout {
    grid-template-columns: 1fr;
  }

  .worldbook-form {
    grid-template-columns: 1fr;
  }

  .injection-grid {
    grid-template-columns: 1fr;
  }

  .import-meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>
