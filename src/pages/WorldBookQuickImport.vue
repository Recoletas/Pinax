<template>
  <div class="quick-page">
    <header class="quick-hero">
      <div class="hero-left">
        <h1>世界书 · 快速导入</h1>
        <p>
          这是快速工作流入口：用预设、小说段落或一句说明，生成可执行的世界书草案。
          条目精修、注入参数与批量改动请在高级设置中处理。
        </p>
      </div>
      <div class="hero-actions">
        <button class="ghost-btn" @click="openExperience">返回体验</button>
        <button class="primary-btn" @click="openAdvancedEditor">进入高级设置</button>
      </div>
    </header>

    <section class="status-row">
      <div class="status-chip">当前世界书数量：{{ worldbooksIndex.length }}</div>
      <div class="status-chip" v-if="activeWorldbookName">当前激活：{{ activeWorldbookName }}</div>
    </section>

    <section v-if="errorMessage" class="feedback error">{{ errorMessage }}</section>
    <section v-if="successMessage" class="feedback success">{{ successMessage }}</section>
    <section v-if="infoMessage" class="feedback info">{{ infoMessage }}</section>

    <section class="quick-grid">
      <article class="card">
        <div class="card-head">
          <h2>一键预设</h2>
          <span>标准基线，开箱可用</span>
        </div>

        <div class="preset-list">
          <div class="preset-item" v-for="preset in presets" :key="preset.id">
            <div class="preset-main">
              <strong>{{ preset.name }}</strong>
              <p>{{ preset.description }}</p>
              <div class="preset-tags">
                <span class="tag">{{ preset.genreLabel }}</span>
                <span class="tag">{{ preset.entries.length }} 条目</span>
              </div>
            </div>
            <button class="ghost-btn" :disabled="creating" @click="importPreset(preset)">
              {{ creating ? '创建中...' : '一键导入' }}
            </button>
          </div>
        </div>
      </article>

      <article class="card">
        <div class="card-head">
          <h2>小说段落导入</h2>
          <span>AI 优先，失败自动回退本地提炼</span>
        </div>

        <label>
          世界书名称（可选）
          <input
            v-model.trim="novelInput.name"
            class="text-input"
            type="text"
            placeholder="例如：风雪港调查案"
          />
        </label>

        <label>
          粘贴小说片段 / 大纲说明
          <textarea
            v-model.trim="novelInput.sourceText"
            class="text-area"
            rows="8"
            placeholder="粘贴若干段正文、章节摘要或世界设定说明..."
          ></textarea>
        </label>

        <div class="inline-controls">
          <input
            ref="novelFileInputRef"
            class="hidden-file-input"
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            @change="handleNovelFileChange"
          />
          <button class="ghost-btn" :disabled="generatingNovel || creating" @click="openNovelFilePicker">
            上传 TXT/MD
          </button>
          <button class="ghost-btn" :disabled="generatingNovel || creating || !novelInput.sourceText" @click="clearNovelText">
            清空文本
          </button>
          <span class="inline-hint" v-if="novelSourceFileName">已加载：{{ novelSourceFileName }}</span>
        </div>

        <div class="inline-controls">
          <label class="compact-label">
            目标条目数
            <input v-model.number="novelInput.targetCount" class="text-input compact" type="number" min="3" max="30" />
          </label>
          <label class="checkbox-line">
            <input v-model="novelInput.useAiFirst" type="checkbox" />
            <span>优先尝试 AI 提炼</span>
          </label>
        </div>

        <button class="primary-btn" :disabled="generatingNovel || creating" @click="generateFromNovelText">
          {{ generatingNovel ? '生成中...' : '生成导入预览' }}
        </button>
      </article>

      <section class="card segment-preview-card" v-if="novelSegments.length > 0">
        <div class="card-head split">
          <div>
            <h2>章节分段预览</h2>
            <span>共 {{ novelSegments.length }} 段，{{ totalSegmentEntries }} 条目</span>
          </div>
          <div class="segment-actions">
            <button class="ghost-btn small" :disabled="creating" @click="regenerateSegments">
              重新分段
            </button>
            <button class="ghost-btn small" :disabled="creating" @click="clearSegments">
              清除分段
            </button>
          </div>
        </div>

        <div class="segment-list">
          <div
            v-for="(segment, sIdx) in novelSegments"
            :key="sIdx"
            class="segment-block"
            :class="{ expanded: expandedSegmentIndex === sIdx }"
          >
            <div class="segment-header" @click="toggleSegment(sIdx)">
              <div class="segment-info">
                <span class="segment-index">{{ sIdx + 1 }}</span>
                <strong class="segment-title">{{ segment.title }}</strong>
                <span class="segment-meta">{{ segment.charCount }} 字 · {{ segment.entries?.length || 0 }} 条目</span>
              </div>
              <div class="segment-toggle">
                <span v-if="expandedSegmentIndex === sIdx">收起</span>
                <span v-else>展开</span>
              </div>
            </div>

            <div class="segment-content" v-if="expandedSegmentIndex === sIdx">
              <div class="segment-text-preview">{{ segment.content?.slice(0, 300) }}{{ segment.content?.length > 300 ? '...' : '' }}</div>

              <div class="segment-entries">
                <div class="segment-entries-header">
                  <span>提取条目</span>
                  <button class="ghost-btn small" @click.stop="addEntryToSegment(sIdx)">+ 添加条目</button>
                </div>
                <div class="segment-entry-list">
                  <div
                    v-for="(entry, eIdx) in segment.entries"
                    :key="eIdx"
                    class="segment-entry-item"
                    :class="{ editing: editingSegmentIndex === sIdx && editingEntryIndex === eIdx }"
                  >
                    <template v-if="editingSegmentIndex === sIdx && editingEntryIndex === eIdx">
                      <div class="entry-edit-form">
                        <input
                          v-model="segment.entries[eIdx].name"
                          class="text-input small"
                          placeholder="条目名称"
                        />
                        <select v-model="segment.entries[eIdx].type" class="select-input small">
                          <option v-for="opt in entryTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                        </select>
                        <input
                          v-model="segment.entries[eIdx].keysInput"
                          class="text-input small"
                          placeholder="触发词（逗号分隔）"
                          @input="updateEntryKeys(segment.entries[eIdx])"
                        />
                        <textarea
                          v-model="segment.entries[eIdx].content"
                          class="text-area small"
                          rows="3"
                          placeholder="条目内容"
                        ></textarea>
                        <div class="entry-edit-actions">
                          <button class="ghost-btn small" @click="saveEntryEdit(sIdx, eIdx)">保存</button>
                          <button class="ghost-btn small" @click="cancelEntryEdit">取消</button>
                          <button class="ghost-btn small danger" @click="deleteEntryFromSegment(sIdx, eIdx)">删除</button>
                        </div>
                      </div>
                    </template>
                    <template v-else>
                      <div class="entry-quick-view">
                        <div class="entry-main">
                          <strong>{{ entry.name }}</strong>
                          <span class="entry-type-tag">{{ entryTypeLabel(entry.type) }}</span>
                        </div>
                        <div class="entry-keys">触发词：{{ (entry.keys || []).join('、') }}</div>
                        <div class="entry-content-preview">{{ entry.content?.slice(0, 60) }}{{ entry.content?.length > 60 ? '...' : '' }}</div>
                        <div class="entry-quick-actions">
                          <button class="ghost-btn small" @click="startEditEntry(sIdx, eIdx)">编辑</button>
                          <button class="ghost-btn small danger" @click="deleteEntryFromSegment(sIdx, eIdx)">删除</button>
                        </div>
                      </div>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card-actions">
          <button class="primary-btn" :disabled="creating" @click="importFromSegments">
            {{ creating ? '导入中...' : `确认导入（${totalSegmentEntries} 条目）` }}
          </button>
          <button class="ghost-btn" :disabled="creating" @click="clearSegments">取消</button>
        </div>
      </section>

      <article class="card">
        <div class="card-head">
          <h2>说明随机生成</h2>
          <span>AI 根据输入生成世界书草案</span>
        </div>

        <label>
          世界风格
          <select v-model="randomInput.genre" class="select-input">
            <option v-for="option in genreOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>

        <label>
          世界书名称（可选）
          <input
            v-model.trim="randomInput.name"
            class="text-input"
            type="text"
            placeholder="例如：荒潮城守夜人"
          />
        </label>

        <label>
          说明 / 核心梗概
          <textarea
            v-model.trim="randomInput.brief"
            class="text-area"
            rows="6"
            placeholder="例如：蒸汽朋克港口城市，夜里会出现吞噬记忆的雾潮。"
          ></textarea>
        </label>

        <div class="inline-controls">
          <label class="compact-label">
            目标条目数
            <input v-model.number="randomInput.targetCount" class="text-input compact" type="number" min="3" max="30" />
          </label>
        </div>

        <button class="primary-btn" :disabled="generatingRandom || creating" @click="generateFromBrief">
          {{ generatingRandom ? '生成中...' : 'AI 生成预览' }}
        </button>
      </article>
    </section>

    <section class="card preview-card" v-if="pendingImport">
      <div class="card-head split">
        <div>
          <h2>导入预览</h2>
          <span>{{ pendingImport.sourceLabel }}</span>
        </div>
        <div class="preview-meta">
          <span>{{ pendingImport.entries.length }} 条目</span>
          <span>{{ pendingImport.groups.length }} 分组</span>
        </div>
      </div>

      <div class="preview-summary">
        <div class="summary-item">
          <span>世界书名称</span>
          <strong>{{ pendingImport.name }}</strong>
        </div>
        <div class="summary-item">
          <span>描述</span>
          <strong>{{ pendingImport.description || '未填写' }}</strong>
        </div>
      </div>

      <div class="conflict-box" v-if="pendingConflictWorldbook">
        <strong>检测到同名世界书：{{ pendingConflictWorldbook.name }}</strong>
        <p>请选择导入策略：</p>
        <select v-model="conflictMode" class="select-input conflict-select">
          <option value="rename">自动重命名后新建</option>
          <option value="create">保持同名直接新建</option>
          <option value="overwrite">覆盖同名世界书（清空原条目）</option>
        </select>
        <div class="conflict-metrics" v-if="pendingConflictMetrics">
          <span>现有条目：{{ pendingConflictMetrics.currentCount }}</span>
          <span>导入条目：{{ pendingConflictMetrics.incomingCount }}</span>
          <span :class="['delta', pendingConflictMetrics.delta >= 0 ? 'up' : 'down']">
            条目变化：{{ pendingConflictMetrics.delta >= 0 ? '+' : '' }}{{ pendingConflictMetrics.delta }}
          </span>
        </div>

        <div class="diff-preview" v-if="conflictMode === 'overwrite' && pendingEntryDiffs && pendingEntryDiffs.length > 0">
          <div class="diff-summary-header">
            <span>条目变更预览</span>
            <span class="diff-stats">
              <span class="stat-add">新增 {{ pendingEntryDiffs.filter(d => d.type === 'add').length }}</span>
              <span class="stat-update">更新 {{ pendingEntryDiffs.filter(d => d.type === 'update').length }}</span>
              <span class="stat-remove">移除 {{ pendingEntryDiffs.filter(d => d.type === 'remove').length }}</span>
            </span>
          </div>
          <div class="diff-list">
            <div v-for="(diff, idx) in pendingEntryDiffs.slice(0, 10)" :key="idx" :class="['diff-item', diff.type]">
              <div class="diff-item-header">
                <span class="diff-type-badge">{{ diff.type === 'add' ? '新增' : diff.type === 'update' ? '更新' : '移除' }}</span>
                <strong>{{ diff.incomingEntry?.name || diff.existingEntry?.name }}</strong>
              </div>
              <div class="diff-field-changes" v-if="diff.fieldChanges && diff.fieldChanges.length > 0">
                <div v-for="(change, cIdx) in diff.fieldChanges.slice(0, 3)" :key="cIdx" class="field-change">
                  <span class="field-name">{{ entryFieldLabel(change.field) }}</span>
                  <span class="field-arrow">→</span>
                  <span class="field-new">{{ formatFieldValue(change.field, change.to) }}</span>
                </div>
                <span v-if="diff.fieldChanges.length > 3" class="more-fields">+{{ diff.fieldChanges.length - 3 }} 项变更</span>
              </div>
            </div>
            <div v-if="pendingEntryDiffs.length > 10" class="diff-more">
              还有 {{ pendingEntryDiffs.length - 10 }} 条变更未显示
            </div>
          </div>
        </div>

        <div class="group-migration" v-if="conflictMode === 'overwrite' && pendingGroupMigration">
          <div class="group-migration-header">分组迁移预览</div>
          <div class="group-migration-content">
            <div class="group-column" v-if="pendingGroupMigration.addedCount > 0">
              <span class="group-label add">新增分组</span>
              <div class="group-tags">
                <span v-for="g in pendingGroupMigration.added" :key="g" class="group-tag add">{{ g }}</span>
              </div>
            </div>
            <div class="group-column" v-if="pendingGroupMigration.unchangedCount > 0">
              <span class="group-label keep">保留分组</span>
              <div class="group-tags">
                <span v-for="g in pendingGroupMigration.unchanged" :key="g" class="group-tag keep">{{ g }}</span>
              </div>
            </div>
            <div class="group-column" v-if="pendingGroupMigration.removedCount > 0">
              <span class="group-label remove">移除分组</span>
              <div class="group-tags">
                <span v-for="g in pendingGroupMigration.removed" :key="g" class="group-tag remove">{{ g }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="preview-groups" v-if="pendingImport.groups.length">
        <span class="group-chip" v-for="group in pendingImport.groups" :key="group">{{ group }}</span>
      </div>

      <div class="entry-preview-list">
        <div class="entry-preview-item" v-for="entry in pendingImport.entries.slice(0, 20)" :key="entry.id">
          <div class="entry-title-line">
            <strong>{{ entry.name }}</strong>
            <span>{{ entryTypeLabel(entry.type) }}</span>
          </div>
          <div class="entry-keywords">触发词：{{ entry.keys.join('、') }}</div>
          <p>{{ entry.content }}</p>
        </div>
      </div>

      <div class="card-actions">
        <button class="primary-btn" :disabled="creating" @click="importPending">
          {{ creating ? '导入中...' : '导入为新世界书' }}
        </button>
        <button class="ghost-btn" :disabled="creating" @click="clearPendingImport">清空预览</button>
        <button class="ghost-btn" :disabled="creating" @click="openAdvancedEditor">去高级设置继续编辑</button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useWorldStore } from '../stores/worldStore'
import {
  tryAiExtractWorldbookJson,
  tryAiGenerateWorldbookJsonFromBrief
} from '../services/worldbookImportGeneration'
import { formatWorldbookStatus } from '../services/worldbookFeedback'

const router = useRouter()
const worldStore = useWorldStore()

const worldbooksIndex = computed(() => worldStore.worldbooksIndex || [])
const activeWorldbookName = computed(() => worldStore.activeWorldbook?.name || '')

const creating = ref(false)
const generatingNovel = ref(false)
const generatingRandom = ref(false)
const pendingImport = ref(null)
const novelFileInputRef = ref(null)
const novelSourceFileName = ref('')
const conflictMode = ref('rename')
const novelSegments = ref([])
const editingSegmentIndex = ref(-1)
const editingEntryIndex = ref(-1)

const errorMessage = ref('')
const successMessage = ref('')
const infoMessage = ref('')

const pendingConflictWorldbook = computed(() => {
  const pendingName = normalizeText(pendingImport.value?.name)
  if (!pendingName) return null
  return worldbooksIndex.value.find(wb => normalizeText(wb?.name) === pendingName) || null
})

const pendingConflictMetrics = computed(() => {
  if (!pendingConflictWorldbook.value || !pendingImport.value) return null
  const currentCount = Number(pendingConflictWorldbook.value.entryCount) || 0
  const incomingCount = Array.isArray(pendingImport.value.entries) ? pendingImport.value.entries.length : 0
  return {
    currentCount,
    incomingCount,
    delta: incomingCount - currentCount
  }
})

const pendingEntryDiffs = computed(() => {
  if (!pendingConflictWorldbook.value || !pendingImport.value || conflictMode.value !== 'overwrite') return null

  const existingEntries = worldStore.activeWorldbook?.entries || []
  const incomingEntries = pendingImport.value.entries || []

  if (!existingEntries.length || !incomingEntries.length) return null

  const diffs = []
  const matchedExisting = new Set()

  for (const incoming of incomingEntries) {
    const incomingName = normalizeText(incoming?.name).toLowerCase()
    const incomingKeys = (incoming?.keys || []).map(k => normalizeText(k).toLowerCase())

    let bestMatch = null
    let bestScore = 0

    for (const existing of existingEntries) {
      const existingName = normalizeText(existing?.name).toLowerCase()
      const existingKeys = (existing?.keys || []).map(k => normalizeText(k).toLowerCase())

      let score = 0
      if (existingName === incomingName) {
        score += 10
      }
      const commonKeys = incomingKeys.filter(k => existingKeys.includes(k))
      score += commonKeys.length * 2

      if (score > bestScore && score >= 2) {
        bestScore = score
        bestMatch = existing
      }
    }

    if (bestMatch) {
      matchedExisting.add(bestMatch.id)

      const fieldChanges = []
      if (normalizeText(incoming.name) !== normalizeText(bestMatch.name)) {
        fieldChanges.push({ field: 'name', from: bestMatch.name, to: incoming.name })
      }
      if (normalizeEntryType(incoming.type) !== normalizeEntryType(bestMatch.type)) {
        fieldChanges.push({ field: 'type', from: entryTypeLabel(bestMatch.type), to: entryTypeLabel(incoming.type) })
      }
      const existingKeysStr = (bestMatch.keys || []).sort().join(',')
      const incomingKeysStr = (incoming.keys || []).sort().join(',')
      if (existingKeysStr !== incomingKeysStr) {
        fieldChanges.push({ field: 'keys', from: bestMatch.keys || [], to: incoming.keys || [] })
      }
      if (normalizeText(incoming.content) !== normalizeText(bestMatch.content)) {
        fieldChanges.push({ field: 'content', from: bestMatch.content?.slice(0, 50), to: incoming.content?.slice(0, 50) })
      }
      const existingGroup = bestMatch.injection?.group || ''
      const incomingGroup = incoming.injection?.group || ''
      if (normalizeText(existingGroup) !== normalizeText(incomingGroup)) {
        fieldChanges.push({ field: 'group', from: existingGroup || '未分组', to: incomingGroup || '未分组' })
      }

      if (fieldChanges.length > 0) {
        diffs.push({
          type: 'update',
          incomingEntry: incoming,
          existingEntry: bestMatch,
          fieldChanges,
          matchScore: bestScore
        })
      }
    } else {
      diffs.push({
        type: 'add',
        incomingEntry: incoming,
        existingEntry: null,
        fieldChanges: []
      })
    }
  }

  for (const existing of existingEntries) {
    if (!matchedExisting.has(existing.id)) {
      diffs.push({
        type: 'remove',
        incomingEntry: null,
        existingEntry: existing,
        fieldChanges: []
      })
    }
  }

  return diffs
})

const pendingGroupMigration = computed(() => {
  if (!pendingConflictWorldbook.value || !pendingImport.value || conflictMode.value !== 'overwrite') return null

  const existingGroups = new Set((worldStore.activeWorldbook?.groups || []).map(g => normalizeText(g)).filter(Boolean))
  const incomingGroups = new Set((pendingImport.value.groups || []).map(g => normalizeText(g)).filter(Boolean))

  const added = []
  const removed = []
  const unchanged = []

  for (const group of incomingGroups) {
    if (!existingGroups.has(group)) {
      added.push(group)
    } else {
      unchanged.push(group)
    }
  }

  for (const group of existingGroups) {
    if (!incomingGroups.has(group)) {
      removed.push(group)
    }
  }

  if (added.length === 0 && removed.length === 0 && unchanged.length === 0) return null

  return {
    added: added.sort(),
    removed: removed.sort(),
    unchanged: unchanged.sort(),
    addedCount: added.length,
    removedCount: removed.length,
    unchangedCount: unchanged.length
  }
})

const expandedSegmentIndex = ref(-1)

const totalSegmentEntries = computed(() => {
  return novelSegments.value.reduce((sum, seg) => sum + (seg.entries?.length || 0), 0)
})

const genreOptions = [
  { value: 'fantasy', label: '奇幻冒险' },
  { value: 'urban', label: '都市现实' },
  { value: 'scifi', label: '科幻星际' },
  { value: 'wuxia', label: '武侠仙侠' },
  { value: 'apocalypse', label: '末日生存' }
]

const entryTypeOptions = [
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

const presets = [
  {
    id: 'preset-fantasy',
    name: '奇幻调查基线',
    genreLabel: '奇幻冒险',
    description: '覆盖主城、机构、关键角色、关键道具与主线危机，可作为首轮约束基线。',
    entries: [
      createSeedEntry('location', '暮湾主城', ['暮湾', '主城'], '港雾常年笼罩的贸易主城，夜晚会响起无来源的钟声。', '地理'),
      createSeedEntry('location', '银藤学院', ['银藤学院', '法师学院'], '培养探索者与记录官的学院，地下藏有古代观测仪。', '地理'),
      createSeedEntry('character', '伊薇队长', ['伊薇', '队长'], '城防调查队长，信奉先证据后判断，与你关系复杂但可靠。', '角色'),
      createSeedEntry('item', '风蚀罗盘', ['罗盘', '风蚀罗盘'], '能够在异常雾潮中定位安全路径，但每次使用会损耗刻度。', '道具'),
      createSeedEntry('event', '钟楼停摆事件', ['钟楼停摆', '停摆'], '城中钟楼在三日前停摆，引发港区谣言与恐慌。', '事件'),
      createSeedEntry('lore', '雾潮契约', ['雾潮契约', '契约'], '旧时代签订的禁令：不得在雾潮之夜燃放高频火光。', '设定')
    ]
  },
  {
    id: 'preset-urban',
    name: '都市悬疑基线',
    genreLabel: '都市现实',
    description: '包含机构、人物网络、案件锚点与证据道具，适合推进推理和关系线。',
    entries: [
      createSeedEntry('location', '北岸传媒大厦', ['北岸传媒', '大厦'], '新闻与公关中心，内部流传一份不能公开的旧档案。', '地理'),
      createSeedEntry('character', '沈述记者', ['沈述', '记者'], '调查记者，擅长追踪资金流，嘴硬心软。', '角色'),
      createSeedEntry('character', '周岚律师', ['周岚', '律师'], '商业诉讼专家，知晓多家企业的隐秘协议。', '角色'),
      createSeedEntry('event', '凌晨坠楼案', ['坠楼案', '凌晨案'], '看似意外的坠楼事件，留下了被篡改的监控时间轴。', '事件'),
      createSeedEntry('item', '缺页笔记本', ['笔记本', '缺页'], '受害者遗留笔记，本应记录线索的几页被完整裁走。', '道具'),
      createSeedEntry('lore', '三层信息网', ['信息网', '三层'], '本城消息传播分公开、半公开、暗线三层，互相嵌套。', '设定')
    ]
  },
  {
    id: 'preset-scifi',
    name: '星际远征基线',
    genreLabel: '科幻星际',
    description: '覆盖舰队、前哨站、协定约束与风险事件，适合硬科幻任务流开局。',
    entries: [
      createSeedEntry('location', '赫利俄斯前哨站', ['前哨站', '赫利俄斯'], '位于边境轨道的补给站，长期受微陨石风暴干扰。', '地理'),
      createSeedEntry('character', '林霁舰长', ['林霁', '舰长'], '远征舰指挥官，强调程序与纪律，但对平民保持克制。', '角色'),
      createSeedEntry('item', '折跃芯簇', ['折跃芯簇', '芯簇'], '维持短距折跃稳定的核心组件，库存稀缺。', '道具'),
      createSeedEntry('event', '静默区失联', ['静默区', '失联'], '三支巡检小队进入静默区后全部失联，仅返还空白日志。', '事件'),
      createSeedEntry('lore', '联邦协定 17-B', ['17-B', '协定'], '禁止在未知信号源附近启用全频广播，以免触发回声干扰。', '设定'),
      createSeedEntry('quest', '回收黑匣任务', ['黑匣', '回收任务'], '需在 72 小时内回收失联舰的黑匣，避免航线被封锁。', '任务')
    ]
  }
]

const randomInput = reactive({
  genre: 'fantasy',
  name: '',
  brief: '',
  targetCount: 8
})

const novelInput = reactive({
  name: '',
  sourceText: '',
  targetCount: 10,
  useAiFirst: true
})

const RANDOM_POOLS = {
  fantasy: {
    characters: ['白烬审判官', '林地信使', '潮汐术士', '冬港守钟人', '流火学徒'],
    locations: ['雾铃海崖', '旧王城地库', '风帆修会', '银松边境', '夜桥集市'],
    items: ['裂纹圣印', '潮火灯芯', '星盐卷轴', '誓约短剑', '沉眠符印'],
    events: ['晨雾袭港', '圣坛熄火', '边境失踪潮', '王印争夺', '古渠开闸'],
    lore: ['旧纪元誓令', '渡雾礼俗', '守夜轮值法', '三塔盟约', '潮汐历']
  },
  urban: {
    characters: ['许南制作人', '陈止刑警', '韩雾摄影师', '顾远工程师', '梁笙医师'],
    locations: ['旧港地铁环线', '南城高架桥', '雨幕公寓', '城北仓储区', '银泉社区'],
    items: ['加密硬盘', '指纹门卡', '旧式录音笔', '匿名快递箱', '失效证件'],
    events: ['连夜断电', '证词撤回', '直播事故', '封路通告', '证据泄露'],
    lore: ['市政协调会', '媒体禁播条款', '地下物流网', '夜巡制度', '社区互助会']
  },
  scifi: {
    characters: ['轨道领航员', '深空工程师', '联邦监察官', '仿生译员', '遗迹测绘员'],
    locations: ['轨道补给环', 'β-12 冷却井', '黎明号舰桥', '碎环殖民区', '暗面通讯塔'],
    items: ['相位锚点', '跃迁信标', '应急纳米包', '量子锁钥', '环境滤芯'],
    events: ['航道坍缩', '跃迁延迟', '外缘信号复现', '供氧危机', '哨站脱网'],
    lore: ['联邦边境法', '信号静默令', '殖民分级制度', '舰队轮换规程', '异源接触协议']
  },
  wuxia: {
    characters: ['折梅剑客', '问药医仙', '雁门掌柜', '青衣捕头', '听雨楼主'],
    locations: ['听潮渡口', '落雪山庄', '北荒古道', '三河驿站', '云隐药谷'],
    items: ['寒铁令牌', '洗髓丹方', '玄木琴匣', '残缺剑谱', '封脉银针'],
    events: ['镖局失镖', '门派会盟', '夜雨追杀', '山门封禁', '武林帖重现'],
    lore: ['江湖行规', '门派谱系', '禁武约章', '宗门恩怨录', '渡口税契']
  },
  apocalypse: {
    characters: ['哨站修理员', '废土侦察兵', '药剂配给官', '迁徙向导', '旧城档案员'],
    locations: ['灰雨隔离区', '穹顶温室', '地下储水库', '废城高塔', '北线检查点'],
    items: ['净水滤芯', '便携发电匣', '旧时代地图', '生存药包', '抗寒防护服'],
    events: ['补给车失联', '风暴预警', '围栏破口', '疫潮复燃', '迁徙窗口开启'],
    lore: ['避难条约', '配给等级表', '夜间警戒令', '迁徙路线图', '净土传闻']
  }
}

onMounted(async () => {
  await worldStore.loadWorldbooksIndex()
  if (typeof worldStore.ensureActiveWorldbook === 'function') {
    await worldStore.ensureActiveWorldbook()
  }
})

function openExperience() {
  router.push({ name: 'experience' })
}

function openAdvancedEditor() {
  router.push({ name: 'experience-worldbook-advanced' })
}

function openNovelFilePicker() {
  if (!novelFileInputRef.value) return
  novelFileInputRef.value.value = ''
  novelFileInputRef.value.click()
}

async function handleNovelFileChange(event) {
  const file = event?.target?.files?.[0]
  if (!file) return

  clearFeedback()

  try {
    const text = await file.text()
    const normalized = normalizeText(text)
    if (normalized.length < 20) {
      setWorldbookError('文件内容过短，至少需要 20 字。')
      return
    }

    novelInput.sourceText = text
    novelSourceFileName.value = file.name

    if (!normalizeText(novelInput.name)) {
      novelInput.name = normalizeText(file.name.replace(/\.[^/.]+$/, ''))
    }

    setWorldbookInfo(`已加载文件：${file.name}（${normalized.length} 字）`)
  } catch (error) {
    setWorldbookError(`读取文件失败：${error?.message || '未知错误'}`)
  }
}

function clearNovelText() {
  novelInput.sourceText = ''
  novelSourceFileName.value = ''
  clearFeedback()
}

function clearFeedback() {
  errorMessage.value = ''
  successMessage.value = ''
  infoMessage.value = ''
}

function setWorldbookError(message) {
  errorMessage.value = formatWorldbookStatus(message)
  successMessage.value = ''
  infoMessage.value = ''
}

function setWorldbookSuccess(message) {
  successMessage.value = formatWorldbookStatus(message)
  errorMessage.value = ''
  infoMessage.value = ''
}

function setWorldbookInfo(message) {
  infoMessage.value = formatWorldbookStatus(message)
  errorMessage.value = ''
  successMessage.value = ''
}

function entryTypeLabel(typeValue) {
  const matched = entryTypeOptions.find(item => item.value === typeValue)
  return matched?.label || typeValue || '通用'
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeEntryType(typeValue) {
  const normalized = normalizeText(typeValue).toLowerCase()
  if (['location', 'character', 'item', 'event', 'lore', 'quest', 'general', 'rule', 'style', 'forbidden', 'organization'].includes(normalized)) {
    return normalized
  }
  if (normalized === 'org' || normalized === 'faction') return 'organization'
  if (normalized === 'setting') return 'lore'
  return 'general'
}

const CONSTRAINT_TYPES = new Set(['rule', 'style', 'forbidden'])

function isConstraintType(typeValue) {
  return CONSTRAINT_TYPES.has(normalizeEntryType(typeValue))
}

function inferConstraintTypeFromSignals({ name = '', content = '', keys = [] } = {}) {
  const keyList = Array.isArray(keys) ? keys : []
  const corpus = [name, content, ...keyList]
    .map(part => normalizeText(part).toLowerCase())
    .filter(Boolean)
    .join(' ')

  if (!corpus) return ''
  if (/(禁止|禁忌|不得|不能|不可|严禁|forbidden|ban|avoid)/.test(corpus)) return 'forbidden'
  if (/(风格|文风|语气|叙事|视角|style|tone)/.test(corpus)) return 'style'
  if (/(规则|约束|必须|一致性|设定边界|rule|constraint)/.test(corpus)) return 'rule'
  return ''
}

function inferEntryType(typeValue, name = '', content = '', keys = []) {
  const normalizedType = normalizeEntryType(typeValue)
  if (normalizedType !== 'general' && normalizedType !== 'lore') {
    return normalizedType
  }

  return inferConstraintTypeFromSignals({ name, content, keys }) || normalizedType
}

function normalizeGroupName(groupValue) {
  return normalizeText(groupValue)
}

function normalizeKeywords(value, fallback = '') {
  const fromArray = Array.isArray(value) ? value : [value]
  const tokens = []

  for (const item of fromArray) {
    const normalized = String(item || '')
      .split(/[\n,，、|/]/)
      .map(part => part.trim())
      .filter(Boolean)
    tokens.push(...normalized)
  }

  if (!tokens.length && fallback) {
    tokens.push(fallback.slice(0, 16))
  }

  return Array.from(new Set(tokens)).slice(0, 6)
}

function ensureEntryContent(type, name, content) {
  const normalized = normalizeText(content)
  if (normalized.length >= 24) return normalized

  if (isConstraintType(type)) {
    const defaults = {
      rule: '涉及世界规则、身份关系和事件因果时必须保持一致，不得自相矛盾。',
      style: '输出需持续保持既定叙事视角、语气强度与文风边界。',
      forbidden: '严禁生成与设定冲突或被明确禁止的内容。'
    }
    const suffix = defaults[normalizeEntryType(type)] || defaults.rule
    return normalized ? `${normalized} ${suffix}` : `${name}：${suffix}`
  }

  if (normalized) return normalized
  return `${name}：补充该条目的背景、边界与影响范围。`
}

function resolveInjectionPolicy(rawEntry, type, name, content, keys = []) {
  const modeText = normalizeText(rawEntry?.mode || '').toLowerCase()
  const explicitMode = rawEntry?.constant === true
    ? 'constant'
    : (modeText === 'constant' ? 'constant' : (modeText === 'selective' || rawEntry?.selective === true ? 'selective' : ''))

  const inferredConstraint = isConstraintType(type) || Boolean(inferConstraintTypeFromSignals({ name, content, keys }))
  const mode = inferredConstraint ? 'constant' : (explicitMode === 'constant' ? 'constant' : 'selective')
  const depthFallback = mode === 'constant' ? 2 : 1

  return {
    mode,
    probability: mode === 'constant' ? 100 : clampNumber(rawEntry?.probability, 100, 0, 100),
    cooldown: clampNumber(rawEntry?.cooldown, 0, 0, 9999),
    depth: clampNumber(rawEntry?.depth, depthFallback, 1, 99),
    excludeRecursion: Boolean(rawEntry?.excludeRecursion)
  }
}

function entryFieldLabel(field) {
  const labels = {
    name: '名称',
    type: '类型',
    keys: '触发词',
    content: '内容',
    group: '分组',
    mode: '注入模式',
    probability: '触发概率',
    depth: '注入深度',
    cooldown: '冷却'
  }
  return labels[field] || field
}

function formatFieldValue(field, value) {
  if (field === 'keys' && Array.isArray(value)) {
    return value.slice(0, 3).join('、') + (value.length > 3 ? ` +${value.length - 3}` : '')
  }
  if (field === 'content') {
    const str = String(value || '')
    return str.length > 30 ? str.slice(0, 30) + '...' : str
  }
  return String(value || '-')
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function pickRandom(list) {
  if (!Array.isArray(list) || list.length === 0) return ''
  const idx = Math.floor(Math.random() * list.length)
  return list[idx]
}

function uniqueGroups(groups = []) {
  const seen = new Set()
  const result = []
  for (const group of groups) {
    const normalized = normalizeGroupName(group)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function defaultGroupByType(typeValue) {
  const type = normalizeEntryType(typeValue)
  if (type === 'rule') return '硬约束'
  if (type === 'style') return '文风约束'
  if (type === 'forbidden') return '禁写边界'
  if (type === 'character') return '角色'
  if (type === 'location') return '地理'
  if (type === 'item') return '道具'
  if (type === 'organization') return '组织'
  if (type === 'event') return '事件'
  if (type === 'lore') return '设定'
  if (type === 'quest') return '任务'
  return '通用'
}

function createSeedEntry(type, name, keys, content, group, mode = '') {
  const normalizedKeys = normalizeKeywords(keys, name)
  const normalizedType = inferEntryType(type, name, content, normalizedKeys)
  const normalizedContent = ensureEntryContent(normalizedType, name, content)
  const injection = resolveInjectionPolicy({ mode }, normalizedType, name, normalizedContent, normalizedKeys)

  return {
    id: `seed_${Math.random().toString(36).slice(2, 10)}`,
    name,
    type: normalizedType,
    keys: normalizedKeys,
    keysSecondary: [],
    content: normalizedContent,
    injection: {
      ...injection,
      group: normalizeGroupName(group) || null
    }
  }
}

function normalizeGeneratedEntry(rawEntry, index = 0) {
  const rawType = normalizeEntryType(rawEntry?.type)
  const fallbackName = `${entryTypeLabel(rawType)}条目${index + 1}`
  const name = normalizeText(rawEntry?.name || rawEntry?.title || fallbackName) || fallbackName
  const keys = normalizeKeywords(rawEntry?.keys || rawEntry?.keywords || rawEntry?.key, name)
  const type = inferEntryType(rawType, name, rawEntry?.content || rawEntry?.description || '', keys)
  const content = ensureEntryContent(type, name, rawEntry?.content || rawEntry?.description || `${name}相关设定。`)
  const keysSecondary = normalizeKeywords(rawEntry?.keysSecondary || rawEntry?.secondary || rawEntry?.keysecondary)
  const group = normalizeGroupName(rawEntry?.group || rawEntry?.category || defaultGroupByType(type)) || null
  const injection = resolveInjectionPolicy(rawEntry, type, name, content, keys)

  return {
    id: `preview_${Date.now().toString(36)}_${index}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    type,
    keys,
    keysSecondary,
    content,
    injection: {
      ...injection,
      group
    }
  }
}

function splitIntoParagraphs(input) {
  const normalized = String(input || '')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!normalized) return []

  const byLines = normalized
    .split(/\n\s*\n/)
    .map(part => part.trim())
    .filter(Boolean)

  if (byLines.length >= 2) return byLines

  return normalized
    .split(/(?<=[。！？!?])/)
    .map(part => part.trim())
    .filter(part => part.length >= 10)
}

function detectChapters(input) {
  const text = String(input || '').trim()
  if (!text) return []

  const chapterPatterns = [
    /^[第卷][一二三四五六七八九十百千万零\d]+[章节回集篇部][\s\S]{0,30}$/gm,
    /^[第卷][一二三四五六七八九十百千万零\d]+[章节回集篇部]/gm,
    /^Chapter\s*\d+/gim,
    /^PART\s*\d+/gim,
    /^[【\[][\s\S]+[】\]]$/gm
  ]

  const chapters = []
  let foundChapters = false

  for (const pattern of chapterPatterns) {
    const matches = [...text.matchAll(pattern)]
    if (matches.length >= 2) {
      foundChapters = true
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index
        const end = i < matches.length - 1 ? matches[i + 1].index : text.length
        const title = text.slice(start, start + 50).split('\n')[0].trim()
        const content = text.slice(start, end).trim()
        chapters.push({
          index: i,
          title: title.slice(0, 40),
          content,
          charCount: content.length
        })
      }
      break
    }
  }

  if (!foundChapters) {
    const paragraphs = splitIntoParagraphs(text)
    const segmentSize = Math.ceil(paragraphs.length / Math.min(5, Math.max(1, Math.ceil(paragraphs.length / 8))))

    for (let i = 0; i < paragraphs.length; i += segmentSize) {
      const segmentParagraphs = paragraphs.slice(i, i + segmentSize)
      const content = segmentParagraphs.join('\n\n')
      chapters.push({
        index: Math.floor(i / segmentSize),
        title: `段落 ${Math.floor(i / segmentSize) + 1}`,
        content,
        charCount: content.length
      })
    }
  }

  return chapters
}

function buildSegmentedEntries(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return []

  return segments.map((segment, segmentIndex) => {
    const paragraphs = splitIntoParagraphs(segment.content)
    const entries = []

    for (let i = 0; i < Math.min(paragraphs.length, 5); i++) {
      const paragraph = paragraphs[i]
      const type = inferTypeFromText(paragraph)
      const keys = extractKeywordsFromText(paragraph, `${segment.title}-${i + 1}`)
      const name = keys[0] || `${entryTypeLabel(type)}${segmentIndex + 1}-${i + 1}`
      const content = paragraph.slice(0, 180)
      const group = defaultGroupByType(type)

      entries.push(createSeedEntry(type, name, keys, content, group))
    }

    return {
      ...segment,
      entries,
      entryCount: entries.length
    }
  })
}

function inferTypeFromText(paragraph) {
  const text = String(paragraph || '')
  if (/(禁止|禁忌|不得|不能|不可|严禁)/.test(text)) return 'forbidden'
  if (/(风格|文风|语气|叙事|笔调)/.test(text)) return 'style'
  if (/(规则|约束|必须|条例|制度|法律|协定|门规)/.test(text)) return 'rule'
  if (/(城|镇|村|街|港|山|河|海|森林|学院|基地|站|宫|殿|塔)/.test(text)) return 'location'
  if (/(先生|小姐|队长|博士|掌门|师兄|师姐|记者|警官|舰长|少年|少女)/.test(text)) return 'character'
  if (/(组织|门派|势力|公司|协会|联盟|公会|军团)/.test(text)) return 'organization'
  if (/(剑|刀|枪|卷轴|芯片|装置|药剂|令牌|证件|钥匙|终端)/.test(text)) return 'item'
  if (/(事件|危机|战斗|袭击|爆炸|失联|任务|追查|仪式|失踪)/.test(text)) return 'event'
  if (/(传说|历史|习俗|设定)/.test(text)) return 'lore'
  return 'general'
}

function extractKeywordsFromText(paragraph, fallback = '') {
  const stopwords = new Set(['他们', '我们', '你们', '然后', '但是', '因为', '所以', '这个', '那个', '一种', '已经', '开始', '如果'])
  const candidates = String(paragraph || '')
    .match(/[\u4e00-\u9fa5]{2,8}/g) || []

  const words = candidates
    .map(token => token.trim())
    .filter(token => token.length >= 2 && !stopwords.has(token))

  const unique = Array.from(new Set(words)).slice(0, 4)
  return normalizeKeywords(unique, fallback)
}

function inferGenreFromText(text) {
  const source = String(text || '')
  if (/(星际|飞船|轨道|联邦|AI|机甲|跃迁|殖民)/i.test(source)) return 'scifi'
  if (/(末日|废土|感染|避难|补给|哨站|灾变)/i.test(source)) return 'apocalypse'
  if (/(江湖|门派|掌门|剑|刀|仙|宗|丹)/i.test(source)) return 'wuxia'
  if (/(公司|公寓|地铁|记者|律师|警局|都市)/i.test(source)) return 'urban'
  return 'fantasy'
}

function createAutoWorldbookName(prefix) {
  return `${prefix}${worldbooksIndex.value.length + 1}`
}

function createUniqueWorldbookName(baseName) {
  const normalizedBase = normalizeText(baseName) || '快速世界书'
  const existingNames = new Set(worldbooksIndex.value.map(wb => normalizeText(wb?.name)).filter(Boolean))

  if (!existingNames.has(normalizedBase)) {
    return normalizedBase
  }

  let index = 1
  let candidate = `${normalizedBase}（导入）`
  while (existingNames.has(candidate)) {
    index += 1
    candidate = `${normalizedBase}（导入${index}）`
  }

  return candidate
}

function buildRandomEntries({ genre, brief, count, startIndex = 0 }) {
  const pool = RANDOM_POOLS[genre] || RANDOM_POOLS.fantasy
  const normalizedCount = clampNumber(count, 8, 3, 30)
  const typeOrder = ['character', 'location', 'item', 'event', 'lore']
  const briefKeyword = extractKeywordsFromText(brief, '').slice(0, 1)

  const entries = []
  for (let i = 0; i < normalizedCount; i += 1) {
    const type = typeOrder[(startIndex + i) % typeOrder.length]

    let baseName = ''
    if (type === 'character') baseName = pickRandom(pool.characters)
    if (type === 'location') baseName = pickRandom(pool.locations)
    if (type === 'item') baseName = pickRandom(pool.items)
    if (type === 'event') baseName = pickRandom(pool.events)
    if (type === 'lore') baseName = pickRandom(pool.lore)

    const name = baseName || `${entryTypeLabel(type)}设定${startIndex + i + 1}`
    const keys = normalizeKeywords([name, ...briefKeyword], name)
    const group = defaultGroupByType(type)

    const content = brief
      ? `${name}：与“${brief.slice(0, 40)}${brief.length > 40 ? '...' : ''}”直接相关，建议在关键剧情节点触发。`
      : `${name}：用于快速开局的 ${entryTypeLabel(type)} 条目，可在高级设置中继续细化。`

    entries.push(createSeedEntry(type, name, keys, content, group))
  }

  return entries
}

function buildEntriesFromParagraphs(sourceText, count) {
  const paragraphs = splitIntoParagraphs(sourceText)
  const normalizedCount = clampNumber(count, 10, 3, 30)
  const entries = []

  for (let i = 0; i < paragraphs.length && entries.length < normalizedCount; i += 1) {
    const paragraph = paragraphs[i]
    const type = inferTypeFromText(paragraph)
    const keys = extractKeywordsFromText(paragraph, `片段${i + 1}`)
    const name = keys[0] || `${entryTypeLabel(type)}片段${i + 1}`
    const content = paragraph.slice(0, 180)
    const group = defaultGroupByType(type)

    entries.push(createSeedEntry(type, name, keys, content, group))
  }

  if (entries.length < normalizedCount) {
    const inferredGenre = inferGenreFromText(sourceText)
    const fallback = buildRandomEntries({
      genre: inferredGenre,
      brief: sourceText,
      count: normalizedCount - entries.length,
      startIndex: entries.length
    })
    entries.push(...fallback)
  }

  return entries.slice(0, normalizedCount)
}

function collectGroupsFromEntries(entries) {
  return uniqueGroups(entries.map(entry => entry?.injection?.group))
}

function buildConstraintEntries({ name, description, worldDescription, writingStyle, forbidden, entries = [] }) {
  const normalizedEntries = Array.isArray(entries) ? entries : []
  const shortName = normalizeText(name).slice(0, 18) || '当前世界'

  const hasConstraintType = (targetType) => {
    return normalizedEntries.some((entry) => {
      const entryType = normalizeEntryType(entry?.type)
      if (entryType === targetType) return true
      if (entryType !== 'general' && entryType !== 'lore') return false
      const inferred = inferConstraintTypeFromSignals({
        name: entry?.name,
        content: entry?.content,
        keys: [...(entry?.keys || []), ...(entry?.keysSecondary || [])]
      })
      return inferred === targetType
    })
  }

  const constraints = []
  const worldContext = normalizeText(worldDescription || description)
  const writingContext = normalizeText(writingStyle)
  const forbiddenContext = normalizeText(forbidden)

  if (!hasConstraintType('rule')) {
    const ruleContent = worldContext
      ? `核心世界观：${worldContext.slice(0, 200)}${worldContext.length > 200 ? '...' : ''}。涉及人物关系、地理事实与历史事件时必须保持一致。`
      : '涉及人物关系、地理事实与历史事件时必须保持一致，不得无因改写既有设定。'
    constraints.push(createSeedEntry('rule', `${shortName}一致性规则`, ['世界规则', '一致性', shortName], ruleContent, '硬约束', 'constant'))
  }

  if (!hasConstraintType('style')) {
    const styleContent = writingContext
      ? `写作风格基线：${writingContext}`
      : '默认采用稳定叙事视角与一致语气；场景描写、人物对话和叙事节奏应保持同一文风基线。'
    constraints.push(createSeedEntry('style', `${shortName}文风基线`, ['写作风格', '文风', shortName], styleContent, '文风约束', 'constant'))
  }

  if (!hasConstraintType('forbidden')) {
    const forbiddenContent = forbiddenContext
      ? `禁止内容清单：${forbiddenContext}`
      : '禁止生成与设定冲突、角色动机断裂或无因果跳变的内容。'
    constraints.push(createSeedEntry('forbidden', `${shortName}禁写边界`, ['禁止内容', '禁忌', shortName], forbiddenContent, '禁写边界', 'constant'))
  }

  return constraints
}

async function tryAiExtractEntries(sourceText, targetCount, nameHint) {
  const safeTargetCount = clampNumber(targetCount, 10, 3, 30)
  const aiResult = await tryAiExtractWorldbookJson({
    sourceText,
    targetCount: safeTargetCount,
    nameHint
  })

  if (!aiResult.ok || !aiResult.parsed) return aiResult

  const parsed = aiResult.parsed
  const rawEntries = Array.isArray(parsed?.entries) ? parsed.entries : []
  const normalizedEntries = rawEntries
    .slice(0, safeTargetCount)
    .map((entry, idx) => normalizeGeneratedEntry(entry, idx))

  if (!normalizedEntries.length) {
    return {
      ok: false,
      reason: 'AI 提炼结果为空，已自动回退本地提炼。'
    }
  }

  const groups = uniqueGroups([
    ...(Array.isArray(parsed?.groups) ? parsed.groups : []),
    ...collectGroupsFromEntries(normalizedEntries)
  ])

  return {
    ok: true,
    payload: {
      name: normalizeText(parsed?.name || nameHint || createAutoWorldbookName('小说导入世界书')),
      worldDescription: normalizeText(parsed?.worldDescription || parsed?.description || ''),
      writingStyle: normalizeText(parsed?.writingStyle || ''),
      examples: normalizeText(parsed?.examples || ''),
      forbidden: normalizeText(parsed?.forbidden || ''),
      description: normalizeText(parsed?.description || parsed?.worldDescription || '由小说段落 AI 提炼生成'),
      sourceLabel: '小说段落 AI 提炼',
      entries: normalizedEntries,
      groups
    }
  }
}

async function tryAiGenerateFromBrief({ genre, brief, targetCount, nameHint }) {
  const safeTargetCount = clampNumber(targetCount, 8, 3, 30)
  const genreLabel = genreOptions.find(item => item.value === genre)?.label || '通用风格'

  const aiResult = await tryAiGenerateWorldbookJsonFromBrief({
    genreLabel,
    brief,
    targetCount: safeTargetCount,
    nameHint
  })

  if (!aiResult.ok || !aiResult.parsed) return aiResult

  const parsed = aiResult.parsed
  const rawEntries = Array.isArray(parsed?.entries) ? parsed.entries : []
  const normalizedEntries = rawEntries
    .slice(0, safeTargetCount)
    .map((entry, idx) => normalizeGeneratedEntry(entry, idx))

  if (!normalizedEntries.length) {
    return {
      ok: false,
      reason: 'AI 返回了空条目，请补充说明后重试。'
    }
  }

  const groups = uniqueGroups([
    ...(Array.isArray(parsed?.groups) ? parsed.groups : []),
    ...collectGroupsFromEntries(normalizedEntries)
  ])

  return {
    ok: true,
    payload: {
      name: normalizeText(parsed?.name || nameHint || createAutoWorldbookName('AI随机世界书')),
      worldDescription: normalizeText(parsed?.worldDescription || parsed?.description || brief.slice(0, 500) || '暂无世界设定描述'),
      writingStyle: normalizeText(parsed?.writingStyle || ''),
      examples: normalizeText(parsed?.examples || ''),
      forbidden: normalizeText(parsed?.forbidden || ''),
      description: normalizeText(parsed?.description || parsed?.worldDescription || brief || '由 AI 根据说明生成。'),
      sourceLabel: `AI 随机生成（${genreLabel}）`,
      entries: normalizedEntries,
      groups
    }
  }
}

function buildPendingPayload({
  name,
  description,
  worldDescription,
  writingStyle,
  examples,
  forbidden,
  sourceLabel,
  entries,
  groups
}) {
  const normalizedEntries = Array.isArray(entries)
    ? entries.map((entry, idx) => normalizeGeneratedEntry(entry, idx))
    : []
  const normalizedDescription = normalizeText(description || worldDescription)
  const normalizedWorldDescription = normalizeText(worldDescription || normalizedDescription)
  const normalizedWritingStyle = normalizeText(writingStyle)
  const normalizedExamples = normalizeText(examples)
  const normalizedForbidden = normalizeText(forbidden)
  const constraintEntries = buildConstraintEntries({
    name,
    description: normalizedDescription,
    worldDescription: normalizedWorldDescription,
    writingStyle: normalizedWritingStyle,
    forbidden: normalizedForbidden,
    entries: normalizedEntries
  })
  const mergedEntries = [...normalizedEntries, ...constraintEntries]

  return {
    name: normalizeText(name) || createAutoWorldbookName('快速世界书'),
    description: normalizedDescription,
    worldDescription: normalizedWorldDescription,
    writingStyle: normalizedWritingStyle,
    examples: normalizedExamples,
    forbidden: normalizedForbidden,
    sourceLabel: normalizeText(sourceLabel) || '快速导入',
    entries: mergedEntries,
    groups: uniqueGroups([...(Array.isArray(groups) ? groups : []), ...collectGroupsFromEntries(mergedEntries)])
  }
}

function resolveImportPayloadForConflict(payload) {
  const conflict = pendingConflictWorldbook.value
  if (!conflict) {
    return {
      payload: { ...payload },
      mode: 'create',
      conflict: null
    }
  }

  const selectedMode = conflictMode.value
  if (selectedMode === 'rename') {
    return {
      payload: {
        ...payload,
        name: createUniqueWorldbookName(payload.name)
      },
      mode: 'rename',
      conflict
    }
  }

  if (selectedMode === 'overwrite') {
    return {
      payload: { ...payload },
      mode: 'overwrite',
      conflict
    }
  }

  return {
    payload: { ...payload },
    mode: 'create',
    conflict
  }
}

async function generateFromNovelText() {
  if (generatingNovel.value || creating.value) return

  clearFeedback()
  const sourceText = normalizeText(novelInput.sourceText)
  if (sourceText.length < 20) {
    setWorldbookError('请至少粘贴一段有效文本（不少于 20 字）。')
    return
  }

  generatingNovel.value = true

  try {
    const chapters = detectChapters(sourceText)
    if (chapters.length > 1) {
      const segments = buildSegmentedEntries(chapters)
      novelSegments.value = segments
      expandedSegmentIndex.value = 0
      setWorldbookInfo(`检测到 ${chapters.length} 个章节/段落，已生成分段预览。可逐段编辑后导入。`)
    } else {
      const targetCount = clampNumber(novelInput.targetCount, 10, 3, 30)
      const fallbackEntries = buildEntriesFromParagraphs(sourceText, targetCount)
      let payload = buildPendingPayload({
        name: novelInput.name || createAutoWorldbookName('小说提炼世界书'),
        description: '由小说段落快速提炼生成，可在高级设置继续精修。',
        sourceLabel: '本地智能提炼（回退）',
        entries: fallbackEntries
      })

      if (novelInput.useAiFirst) {
        const aiResult = await tryAiExtractEntries(sourceText, targetCount, novelInput.name)
        if (aiResult.ok && aiResult.payload) {
          payload = buildPendingPayload(aiResult.payload)
          setWorldbookInfo('已完成 AI 提炼，可直接导入或继续调整。')
        } else if (aiResult.reason) {
          setWorldbookInfo(aiResult.reason)
        }
      } else {
        setWorldbookInfo('已使用本地智能提炼生成预览。')
      }

      pendingImport.value = payload
    }
  } catch (error) {
    setWorldbookError(`生成预览失败：${error?.message || '未知错误'}`)
  } finally {
    generatingNovel.value = false
  }
}

function toggleSegment(index) {
  expandedSegmentIndex.value = expandedSegmentIndex.value === index ? -1 : index
}

function regenerateSegments() {
  const sourceText = normalizeText(novelInput.sourceText)
  if (!sourceText) return

  const chapters = detectChapters(sourceText)
  novelSegments.value = buildSegmentedEntries(chapters)
  expandedSegmentIndex.value = 0
  setWorldbookInfo(`已重新生成分段预览（${chapters.length} 段）。`)
}

function clearSegments() {
  novelSegments.value = []
  expandedSegmentIndex.value = -1
  editingSegmentIndex.value = -1
  editingEntryIndex.value = -1
  clearFeedback()
}

function startEditEntry(segmentIndex, entryIndex) {
  editingSegmentIndex.value = segmentIndex
  editingEntryIndex.value = entryIndex
  const entry = novelSegments.value[segmentIndex]?.entries?.[entryIndex]
  if (entry) {
    entry.keysInput = (entry.keys || []).join('、')
  }
}

function cancelEntryEdit() {
  editingSegmentIndex.value = -1
  editingEntryIndex.value = -1
}

function saveEntryEdit(segmentIndex, entryIndex) {
  const entry = novelSegments.value[segmentIndex]?.entries?.[entryIndex]
  if (entry && entry.keysInput !== undefined) {
    entry.keys = normalizeKeywords(entry.keysInput, entry.name)
    delete entry.keysInput
  }
  editingSegmentIndex.value = -1
  editingEntryIndex.value = -1
}

function updateEntryKeys(entry) {
  if (entry.keysInput !== undefined) {
    entry.keys = normalizeKeywords(entry.keysInput, entry.name)
  }
}

function addEntryToSegment(segmentIndex) {
  const segment = novelSegments.value[segmentIndex]
  if (!segment) return

  if (!segment.entries) {
    segment.entries = []
  }

  const newEntry = createSeedEntry(
    'general',
    `新条目${segment.entries.length + 1}`,
    [],
    '请编辑条目内容',
    '通用'
  )
  newEntry.keysInput = ''
  segment.entries.push(newEntry)

  editingSegmentIndex.value = segmentIndex
  editingEntryIndex.value = segment.entries.length - 1
}

function deleteEntryFromSegment(segmentIndex, entryIndex) {
  const segment = novelSegments.value[segmentIndex]
  if (!segment?.entries) return

  segment.entries.splice(entryIndex, 1)
  if (editingSegmentIndex.value === segmentIndex && editingEntryIndex.value === entryIndex) {
    editingSegmentIndex.value = -1
    editingEntryIndex.value = -1
  }
}

async function importFromSegments() {
  if (creating.value || novelSegments.value.length === 0) return

  creating.value = true
  clearFeedback()

  try {
    const allEntries = novelSegments.value.flatMap(seg => seg.entries || [])
    if (!allEntries.length) {
      setWorldbookError('没有可导入的条目。')
      return
    }

    const payload = buildPendingPayload({
      name: novelInput.name || createAutoWorldbookName('小说导入世界书'),
      description: normalizeText(novelInput.sourceText).slice(0, 240) || '由小说分段导入生成',
      worldDescription: '由小说章节/段落提炼生成，建议在高级设置中补充背景边界。',
      sourceLabel: '小说分段导入',
      entries: allEntries,
      groups: collectGroupsFromEntries(allEntries)
    })

    const created = await createWorldbookFromPayload(payload)
    setWorldbookSuccess(`已创建：${created?.name || '新世界书'}（${payload.entries.length} 条目，含约束项）。`)

    novelSegments.value = []
    expandedSegmentIndex.value = -1
    pendingImport.value = null
  } catch (error) {
    setWorldbookError(`导入失败：${error?.message || '未知错误'}`)
  } finally {
    creating.value = false
  }
}

async function generateFromBrief() {
  if (generatingRandom.value || creating.value) return

  clearFeedback()
  generatingRandom.value = true

  try {
    const brief = normalizeText(randomInput.brief)
    if (brief.length < 8) {
      setWorldbookError('请先输入至少 8 字说明，AI 会基于说明生成。')
      pendingImport.value = null
      return
    }

    const targetCount = clampNumber(randomInput.targetCount, 8, 3, 30)
    const aiResult = await tryAiGenerateFromBrief({
      genre: randomInput.genre,
      brief,
      targetCount,
      nameHint: randomInput.name
    })

    if (!aiResult.ok || !aiResult.payload) {
      setWorldbookError(aiResult.reason || 'AI 随机生成失败，请稍后重试。')
      pendingImport.value = null
      return
    }

    pendingImport.value = buildPendingPayload(aiResult.payload)
    setWorldbookInfo('已完成 AI 生成预览，可直接导入。')
  } catch (error) {
    setWorldbookError(`随机生成失败：${error?.message || '未知错误'}`)
    pendingImport.value = null
  } finally {
    generatingRandom.value = false
  }
}

async function createWorldbookFromPayload(payload) {
  if (!payload || !Array.isArray(payload.entries) || !payload.entries.length) {
    throw new Error('没有可导入的条目')
  }

  const normalizedPayload = buildPendingPayload(payload)

  const created = await worldStore.createWorldbook({
    name: normalizedPayload.name,
    worldDescription: normalizedPayload.worldDescription || normalizedPayload.description || '',
    writingStyle: normalizedPayload.writingStyle || '',
    examples: normalizedPayload.examples || '',
    forbidden: normalizedPayload.forbidden || '',
    description: normalizedPayload.description || normalizedPayload.worldDescription || ''
  })

  for (const entry of normalizedPayload.entries) {
    await worldStore.addEntry(created.id, {
      name: entry.name,
      type: entry.type,
      keys: entry.keys,
      keysSecondary: entry.keysSecondary,
      content: entry.content,
      injection: entry.injection
    })
  }

  const groups = uniqueGroups([...(normalizedPayload.groups || []), ...collectGroupsFromEntries(normalizedPayload.entries)])
  if (groups.length) {
    await worldStore.updateWorldbook(created.id, { groups })
  }

  await worldStore.loadWorldbooksIndex()
  await worldStore.setActiveWorldbook(created.id)

  return created
}

async function overwriteWorldbookFromPayload(targetWorldbook, payload) {
  if (!targetWorldbook?.id) {
    throw new Error('覆盖目标世界书不存在')
  }

  const worldbookId = targetWorldbook.id
  const normalizedPayload = buildPendingPayload(payload)

  await worldStore.updateWorldbook(worldbookId, {
    name: normalizedPayload.name,
    worldDescription: normalizedPayload.worldDescription || normalizedPayload.description || '',
    writingStyle: normalizedPayload.writingStyle || '',
    examples: normalizedPayload.examples || '',
    forbidden: normalizedPayload.forbidden || '',
    description: normalizedPayload.description || normalizedPayload.worldDescription || ''
  })

  await worldStore.setActiveWorldbook(worldbookId)

  const existingEntries = [...(worldStore.activeWorldbook?.entries || [])]
  for (const entry of existingEntries) {
    await worldStore.deleteEntry(worldbookId, entry.id)
  }

  for (const entry of normalizedPayload.entries) {
    await worldStore.addEntry(worldbookId, {
      name: entry.name,
      type: entry.type,
      keys: entry.keys,
      keysSecondary: entry.keysSecondary,
      content: entry.content,
      injection: entry.injection
    })
  }

  const groups = uniqueGroups([...(normalizedPayload.groups || []), ...collectGroupsFromEntries(normalizedPayload.entries)])
  await worldStore.updateWorldbook(worldbookId, { groups })

  await worldStore.loadWorldbooksIndex()
  await worldStore.setActiveWorldbook(worldbookId)

  return {
    id: worldbookId,
    name: normalizedPayload.name
  }
}

async function importPending() {
  if (!pendingImport.value || creating.value) return
  creating.value = true
  clearFeedback()

  try {
    const resolved = resolveImportPayloadForConflict(pendingImport.value)
    pendingImport.value = resolved.payload

    let created = null
    if (resolved.mode === 'overwrite' && resolved.conflict) {
      const ok = window.confirm(`确认覆盖世界书「${resolved.conflict.name}」？原有条目将被替换。`)
      if (!ok) return
      created = await overwriteWorldbookFromPayload(resolved.conflict, resolved.payload)
    } else {
      created = await createWorldbookFromPayload(resolved.payload)
    }

    const modeLabel = resolved.mode === 'overwrite'
      ? '覆盖导入完成'
      : (resolved.mode === 'rename' ? '重命名导入完成' : '导入完成')
    setWorldbookSuccess(`${modeLabel}：${created?.name || '新世界书'}（${resolved.payload.entries.length} 条目）。`)
  } catch (error) {
    setWorldbookError(`导入失败：${error?.message || '未知错误'}`)
  } finally {
    creating.value = false
  }
}

async function importPreset(preset) {
  if (!preset || creating.value) return
  creating.value = true
  clearFeedback()

  try {
    const payload = buildPendingPayload({
      name: createAutoWorldbookName(preset.name),
      description: preset.description,
      sourceLabel: `一键预设：${preset.name}`,
      entries: preset.entries
    })

    const created = await createWorldbookFromPayload(payload)
    pendingImport.value = payload
    setWorldbookSuccess(`已创建预设世界书：${created?.name || '新世界书'}。`)
  } catch (error) {
    setWorldbookError(`预设导入失败：${error?.message || '未知错误'}`)
  } finally {
    creating.value = false
  }
}

function clearPendingImport() {
  pendingImport.value = null
  clearFeedback()
}
</script>

<style scoped>
.quick-page {
  min-height: var(--app-viewport-height, 100vh);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background:
    radial-gradient(130% 120% at 100% 0%, color-mix(in srgb, var(--accent) 14%, transparent) 0%, transparent 48%),
    linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 86%, #ffffff 14%) 0%, var(--bg-primary) 40%);
  color: var(--text-primary);
}

.quick-hero {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  background: color-mix(in srgb, var(--bg-secondary) 88%, #ffffff 12%);
  display: flex;
  gap: 12px;
  justify-content: space-between;
  align-items: flex-start;
}

.hero-left h1 {
  margin: 0 0 8px;
  font-size: 20px;
}

.hero-left p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
  max-width: 760px;
}

.hero-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.status-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.status-chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--bg-secondary) 92%, #ffffff 8%);
}

.feedback {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 13px;
}

.feedback.error {
  border-color: color-mix(in srgb, #ef4444 65%, var(--border));
  background: color-mix(in srgb, #ef4444 14%, var(--bg-primary));
  color: #ef4444;
}

.feedback.success {
  border-color: color-mix(in srgb, #10b981 65%, var(--border));
  background: color-mix(in srgb, #10b981 14%, var(--bg-primary));
  color: #059669;
}

.feedback.info {
  border-color: color-mix(in srgb, #0ea5e9 65%, var(--border));
  background: color-mix(in srgb, #0ea5e9 12%, var(--bg-primary));
  color: #0284c7;
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: color-mix(in srgb, var(--bg-secondary) 93%, #ffffff 7%);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-head {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.card-head.split {
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.card-head h2 {
  margin: 0;
  font-size: 15px;
}

.card-head span {
  font-size: 12px;
  color: var(--text-muted);
}

.preset-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.preset-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
  background: var(--bg-primary);
}

.preset-main strong {
  font-size: 13px;
}

.preset-main p {
  margin: 5px 0 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.preset-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tag {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 1px 7px;
  font-size: 11px;
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
.text-area,
.select-input {
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

.inline-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.hidden-file-input {
  display: none;
}

.inline-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.compact-label {
  max-width: 180px;
}

.text-input.compact {
  width: 88px;
}

.checkbox-line {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.preview-card {
  gap: 12px;
}

.preview-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--text-muted);
  font-size: 12px;
}

.preview-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.summary-item {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-item span {
  font-size: 11px;
  color: var(--text-muted);
}

.summary-item strong {
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-word;
}

.conflict-box {
  border: 1px solid color-mix(in srgb, #f59e0b 60%, var(--border));
  background: color-mix(in srgb, #f59e0b 10%, var(--bg-primary));
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.conflict-box strong {
  font-size: 13px;
  color: #b45309;
}

.conflict-box p {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.conflict-select {
  max-width: 360px;
}

.conflict-metrics {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11px;
}

.conflict-metrics span {
  border: 1px solid color-mix(in srgb, #f59e0b 50%, var(--border));
  border-radius: 999px;
  padding: 2px 8px;
  color: #92400e;
}

.conflict-metrics .delta.up {
  border-color: color-mix(in srgb, #10b981 50%, var(--border));
  color: #047857;
}

.conflict-metrics .delta.down {
  border-color: color-mix(in srgb, #ef4444 50%, var(--border));
  color: #b91c1c;
}

.diff-preview {
  margin-top: 10px;
  border-top: 1px solid color-mix(in srgb, #f59e0b 30%, var(--border));
  padding-top: 10px;
}

.diff-summary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
}

.diff-summary-header span:first-child {
  font-weight: 500;
  color: var(--text-primary);
}

.diff-stats {
  display: flex;
  gap: 8px;
}

.diff-stats span {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
}

.stat-add {
  background: color-mix(in srgb, #10b981 15%, transparent);
  color: #047857;
}

.stat-update {
  background: color-mix(in srgb, #0ea5e9 15%, transparent);
  color: #0284c7;
}

.stat-remove {
  background: color-mix(in srgb, #ef4444 15%, transparent);
  color: #b91c1c;
}

.diff-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow: auto;
}

.diff-item {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px;
  background: var(--bg-primary);
}

.diff-item.add {
  border-left: 3px solid #10b981;
}

.diff-item.update {
  border-left: 3px solid #0ea5e9;
}

.diff-item.remove {
  border-left: 3px solid #ef4444;
  opacity: 0.7;
}

.diff-item-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.diff-type-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 500;
}

.diff-item.add .diff-type-badge {
  background: color-mix(in srgb, #10b981 20%, transparent);
  color: #047857;
}

.diff-item.update .diff-type-badge {
  background: color-mix(in srgb, #0ea5e9 20%, transparent);
  color: #0284c7;
}

.diff-item.remove .diff-type-badge {
  background: color-mix(in srgb, #ef4444 20%, transparent);
  color: #b91c1c;
}

.diff-item-header strong {
  font-size: 12px;
}

.diff-field-changes {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 4px;
}

.field-change {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-size: 11px;
  color: var(--text-secondary);
}

.field-name {
  color: var(--text-muted);
}

.field-arrow {
  color: var(--text-muted);
}

.field-new {
  color: var(--text-primary);
}

.more-fields {
  font-size: 10px;
  color: var(--text-muted);
  padding-left: 4px;
}

.diff-more {
  text-align: center;
  font-size: 11px;
  color: var(--text-muted);
  padding: 6px;
}

.group-migration {
  margin-top: 10px;
  border-top: 1px solid color-mix(in srgb, #f59e0b 30%, var(--border));
  padding-top: 10px;
}

.group-migration-header {
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.group-migration-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-column {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.group-label {
  font-size: 11px;
  font-weight: 500;
}

.group-label.add {
  color: #047857;
}

.group-label.keep {
  color: var(--text-secondary);
}

.group-label.remove {
  color: #b91c1c;
}

.group-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.group-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--border);
}

.group-tag.add {
  background: color-mix(in srgb, #10b981 15%, transparent);
  border-color: color-mix(in srgb, #10b981 40%, var(--border));
  color: #047857;
}

.group-tag.keep {
  background: color-mix(in srgb, var(--bg-secondary) 80%, transparent);
  color: var(--text-secondary);
}

.group-tag.remove {
  background: color-mix(in srgb, #ef4444 10%, transparent);
  border-color: color-mix(in srgb, #ef4444 40%, var(--border));
  color: #b91c1c;
  text-decoration: line-through;
  opacity: 0.8;
}

.preview-groups {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.group-chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--text-secondary);
}

.entry-preview-list {
  border: 1px solid var(--border);
  border-radius: 10px;
  max-height: 360px;
  overflow: auto;
}

.entry-preview-item {
  padding: 10px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.entry-preview-item:last-child {
  border-bottom: none;
}

.entry-title-line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: baseline;
}

.entry-title-line strong {
  font-size: 13px;
}

.entry-title-line span {
  font-size: 11px;
  color: var(--text-muted);
}

.entry-keywords {
  font-size: 11px;
  color: var(--text-secondary);
}

.entry-preview-item p {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.card-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.primary-btn,
.ghost-btn {
  border: 1px solid var(--border);
  border-radius: 8px;
  height: 34px;
  padding: 0 12px;
  font-size: 12px;
  cursor: pointer;
}

.primary-btn {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.ghost-btn {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.primary-btn:disabled,
.ghost-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.ghost-btn.small {
  height: 26px;
  padding: 0 8px;
  font-size: 11px;
}

.ghost-btn.danger {
  color: #ef4444;
  border-color: color-mix(in srgb, #ef4444 50%, var(--border));
}

.ghost-btn.danger:hover {
  background: color-mix(in srgb, #ef4444 10%, var(--bg-primary));
}

.segment-preview-card {
  grid-column: 1 / -1;
}

.segment-actions {
  display: flex;
  gap: 6px;
}

.segment-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.segment-block {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.segment-block.expanded {
  border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
}

.segment-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--bg-secondary) 90%, #ffffff 10%);
  cursor: pointer;
  user-select: none;
}

.segment-header:hover {
  background: color-mix(in srgb, var(--bg-secondary) 80%, #ffffff 20%);
}

.segment-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.segment-index {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  color: #fff;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 500;
}

.segment-title {
  font-size: 13px;
}

.segment-meta {
  font-size: 11px;
  color: var(--text-muted);
}

.segment-toggle {
  font-size: 11px;
  color: var(--text-secondary);
}

.segment-content {
  padding: 12px;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.segment-text-preview {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
  padding: 8px;
  background: color-mix(in srgb, var(--bg-secondary) 90%, #ffffff 10%);
  border-radius: 6px;
  border: 1px solid var(--border);
}

.segment-entries {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.segment-entries-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}

.segment-entry-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.segment-entry-item {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px;
  background: var(--bg-primary);
}

.segment-entry-item.editing {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 5%, var(--bg-primary));
}

.entry-edit-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.text-input.small,
.select-input.small {
  height: 28px;
  padding: 4px 8px;
  font-size: 12px;
}

.text-area.small {
  padding: 6px 8px;
  font-size: 12px;
}

.entry-edit-actions {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.entry-quick-view {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.entry-main {
  display: flex;
  align-items: center;
  gap: 6px;
}

.entry-main strong {
  font-size: 12px;
}

.entry-type-tag {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
}

.entry-keys {
  font-size: 11px;
  color: var(--text-muted);
}

.entry-content-preview {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.entry-quick-actions {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

@media (max-width: 1200px) {
  .quick-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .quick-page {
    padding: 12px;
  }

  .quick-grid {
    grid-template-columns: 1fr;
  }

  .quick-hero {
    flex-direction: column;
  }

  .preview-summary {
    grid-template-columns: 1fr;
  }
}
</style>
