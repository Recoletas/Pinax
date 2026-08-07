<template>
  <section class="place-catalog" data-test="place-catalog">
    <header class="place-catalog-head">
      <div>
        <span class="place-catalog-kicker">正式地点条目</span>
        <h3>地点目录</h3>
      </div>
      <div class="place-catalog-count">{{ filteredPlaces.length }} / {{ places.length }}</div>
    </header>

    <div class="place-catalog-toolbar">
      <label class="place-search">
        <Search :size="15" aria-hidden="true" />
        <span class="sr-only">搜索地点</span>
        <input v-model.trim="search" type="search" placeholder="搜索名称、别名或描述" />
      </label>
      <label class="place-filter">
        <span class="sr-only">按类型筛选</span>
        <select v-model="kindFilter">
          <option value="">全部类型</option>
          <option v-for="kind in placeKinds" :key="kind" :value="kind">{{ kindLabel(kind) }}</option>
        </select>
      </label>
      <button type="button" class="place-tool-button" data-test="place-new" @click="startCreate">
        <Plus :size="15" aria-hidden="true" />
        新建地点
      </button>
      <button
        type="button"
        class="place-tool-button is-accent"
        data-test="place-generate"
        :disabled="generationState === 'pending'"
        @click="generateFromOverview"
      >
        <Sparkles :size="15" aria-hidden="true" />
        {{ generationState === 'pending' ? '整理中…' : '从概述整理' }}
      </button>
    </div>

    <p v-if="feedback" class="place-feedback" :class="{ 'is-error': feedbackKind === 'error' }" role="status">
      {{ feedback }}
    </p>

    <div v-if="generationErrors.length" class="place-generation-errors" role="alert">
      <strong>部分批次未完成</strong>
      <span v-for="error in generationErrors" :key="`${error.batchIndex}-${error.code}`">
        第 {{ Number(error.batchIndex) + 1 }} 批：{{ error.message }}
      </span>
    </div>

    <div class="place-catalog-layout">
      <aside class="place-list" aria-label="正式地点列表">
        <div class="place-list-head">
          <span>地点</span>
          <span>{{ places.length }}</span>
        </div>
        <button
          v-for="place in filteredPlaces"
          :key="place.entryId"
          type="button"
          class="place-list-row"
          :class="{ active: !isCreating && selectedId === place.entryId }"
          @click="selectPlace(place.entryId)"
        >
          <span class="place-list-name">{{ place.name }}</span>
          <span class="place-list-meta">{{ kindLabel(place.kind) }} · {{ place.scale }}</span>
        </button>
        <p v-if="!filteredPlaces.length" class="place-empty">没有匹配的正式地点。</p>
      </aside>

      <form class="place-editor" data-test="place-editor" @submit.prevent="savePlace">
        <div class="place-editor-head">
          <div>
            <span class="place-catalog-kicker">{{ isCreating ? '新条目' : '条目编辑' }}</span>
            <h4>{{ isCreating ? '新建正式地点' : (form.name || '选择一个地点') }}</h4>
          </div>
          <div class="place-editor-actions">
            <button
              v-if="isCreating && hasWorldContext"
              type="button"
              class="place-action-button"
              :disabled="createState === 'pending'"
              @click="runPlaceCreate"
            >
              <Sparkles :size="14" aria-hidden="true" />
              {{ createState === 'pending' ? '生成中…' : 'AI 生成新地点' }}
            </button>
            <button
              type="button"
              class="place-action-button"
              :disabled="!form.name.trim() || fleshOutState === 'pending'"
              @click="runFleshOut"
            >
              <Sparkles :size="14" aria-hidden="true" />
              {{ fleshOutState === 'pending' ? '补全中…' : 'AI 补全' }}
            </button>
            <button type="submit" class="place-action-button is-primary" :disabled="saving || !form.name.trim()">
              <Save :size="14" aria-hidden="true" />
              {{ saving ? '保存中…' : '保存' }}
            </button>
            <button v-if="!isCreating && selectedId" type="button" class="place-action-button is-danger" @click="requestDelete">
              <Trash2 :size="14" aria-hidden="true" />
              删除
            </button>
          </div>
          <p v-if="showParentFactionBanner" class="place-editor-banner">该地点已有上级/势力关系，AI 补全不会写入这两项；如需修改请直接编辑。</p>
        </div>

        <div v-if="deleteImpact" class="place-delete-confirm" role="alert">
          <span>
            删除「{{ deleteImpact.name }}」将影响
            {{ deleteImpact.relationRefs }} 个关系、{{ deleteImpact.historyRefs }} 个历史引用
            <template v-if="deleteImpact.mapBinding">和地图绑定</template>。
          </span>
          <div>
            <button type="button" class="place-action-button is-danger" @click="confirmDelete">确认删除</button>
            <button type="button" class="place-action-button" @click="deleteImpact = null">取消</button>
          </div>
        </div>

        <fieldset class="place-fields" :disabled="!isCreating && !selectedId">
          <label class="place-field is-wide">
            <span>名称</span>
            <input v-model="form.name" required maxlength="80" />
          </label>
          <label class="place-field">
            <span>类型</span>
            <select v-model="form.kind">
              <option v-for="kind in placeKinds" :key="kind" :value="kind">{{ kindLabel(kind) }}</option>
            </select>
          </label>
          <label class="place-field">
            <span>尺度</span>
            <select v-model="form.scale">
              <option v-for="scale in placeScales" :key="scale" :value="scale">{{ scaleLabel(scale) }}</option>
            </select>
          </label>
          <label class="place-field is-wide">
            <span>别名</span>
            <input v-model="form.aliasesText" placeholder="用逗号分隔" />
          </label>
          <label class="place-field">
            <span>上级地点</span>
            <input v-model="form.parentText" placeholder="可留空，允许待解析" />
            <small class="place-field-hint">AI 补全不会写入此项；请通过 relations 或直接编辑</small>
          </label>
          <label class="place-field">
            <span>势力 / 国家</span>
            <input v-model="form.factionText" placeholder="可留空，允许待解析" />
            <small class="place-field-hint">AI 补全不会写入此项；请直接编辑</small>
          </label>
          <label class="place-field is-wide">
            <span>地形提示</span>
            <input v-model="form.terrainText" placeholder="如：沿海、山地" />
          </label>
          <label class="place-field is-wide">
            <span>关键词</span>
            <input v-model="form.keywordsText" placeholder="用于世界书匹配，用逗号分隔" />
          </label>
          <label class="place-field is-wide">
            <span>描述</span>
            <textarea v-model="form.description" rows="5" maxlength="1500" />
            <p v-if="descriptionWarning" class="place-field-hint">描述已超过 1500 字，补全只会保留前 1500 字。</p>
          </label>
          <label class="place-field is-wide">
            <span>AI 补全补充要求（可选，最多 300 字）</span>
            <textarea v-model="form.userBrief" rows="2" maxlength="300" placeholder="例如：聚焦寒带气候与学院氛围；避免提及具体历史事件" />
          </label>
        </fieldset>

        <div class="place-relations" :class="{ 'is-disabled': !isCreating && !selectedId }">
          <div class="place-subhead">
            <span>地点关系</span>
            <button type="button" class="place-inline-button" :disabled="!isCreating && !selectedId" @click="addRelation">
              <Plus :size="13" aria-hidden="true" />
              添加关系
            </button>
          </div>
          <div v-for="(relation, index) in form.relations" :key="relation.localId" class="place-relation-row">
            <select v-model="relation.type" aria-label="关系类型">
              <option v-for="type in relationTypes" :key="type" :value="type">{{ relationLabel(type) }}</option>
            </select>
            <input v-model="relation.targetName" aria-label="关系目标" placeholder="目标名称" />
            <button type="button" class="place-icon-button" title="移除关系" aria-label="移除关系" @click="removeRelation(index)">
              <X :size="14" aria-hidden="true" />
            </button>
          </div>
          <p v-if="!form.relations.length" class="place-hint">暂无显式关系。</p>
        </div>
      </form>
    </div>

    <section v-if="drafts.length || generationState === 'pending'" class="place-review" data-test="place-review">
      <div class="place-review-head">
        <div>
          <span class="place-catalog-kicker">setting-places.v1</span>
          <h4>概述整理草稿</h4>
        </div>
        <span class="place-review-count">{{ pendingDraftCount }} 项待审阅</span>
      </div>
      <p v-if="generationState === 'pending'" class="place-hint">正在按原文分批整理，草稿不会自动写入世界书。</p>
      <article v-for="(draft, index) in drafts" :key="draft.draftId || `${draft.name}-${index}`" class="place-draft-row" :class="`is-${draft.reviewDecision}`">
        <div class="place-draft-status">
          <span class="place-draft-name">{{ draft.name || '未命名地点' }}</span>
          <span class="place-draft-badge">{{ classificationLabel(draft.classification) }}</span>
          <span v-if="draft.lowConfidence" class="place-draft-badge is-warning">低置信证据</span>
          <span v-if="draft.reviewDecision === 'ignored'" class="place-draft-badge">已忽略</span>
          <span v-if="draft.reviewDecision === 'stale'" class="place-draft-badge is-warning">需要重新整理</span>
        </div>
        <div class="place-draft-fields">
          <input v-model="draft.name" aria-label="草稿名称" placeholder="名称" />
          <select v-model="draft.kind" aria-label="草稿类型">
            <option v-for="kind in placeKinds" :key="kind" :value="kind">{{ kindLabel(kind) }}</option>
          </select>
          <input v-model="draft.aliasesText" aria-label="草稿别名" placeholder="别名" />
          <input v-model="draft.parentText" aria-label="草稿上级" placeholder="上级地点" />
          <input v-model="draft.factionText" aria-label="草稿势力" placeholder="势力 / 国家" />
          <input v-model="draft.terrainText" aria-label="草稿地形" placeholder="地形提示" />
          <input v-model="draft.keywordsText" aria-label="草稿关键词" placeholder="关键词" />
          <input v-model="draft.relationsText" aria-label="草稿关系" placeholder="关系：目标，如 route=白石港" />
          <textarea v-model="draft.description" aria-label="草稿描述" rows="2" placeholder="描述" />
          <textarea v-model="draft.evidence" aria-label="草稿证据" rows="2" placeholder="原文证据" />
        </div>
        <div class="place-draft-foot">
          <span class="place-draft-meta">{{ draft.invalidReason || (draft.evidenceStatus === 'high' ? '证据命中概述' : '证据未精确命中，请人工核对') }}</span>
          <div class="place-draft-actions">
            <button type="button" class="place-action-button is-primary" :disabled="draft.classification === 'invalid' || draft.reviewDecision === 'accepted' || draft.reviewDecision === 'stale'" @click="adoptDraft(draft, index)">
              <Check :size="14" aria-hidden="true" />
              采纳
            </button>
            <button type="button" class="place-action-button" :disabled="draft.reviewDecision === 'accepted'" @click="ignoreDraft(draft)">
              <X :size="14" aria-hidden="true" />
              忽略
            </button>
          </div>
        </div>
      </article>
    </section>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Check, Plus, Save, Search, Sparkles, Trash2, X } from 'lucide-vue-next'
import { useWorldStore } from '../../stores/worldStore'
import {
  PLACE_KINDS,
  PLACE_RELATION_TYPES,
  PLACE_SCALES
} from '../../../shared/placeEntryContract.js'
import { mergeUniqueSentences } from '../../../shared/placeDescriptionMerge.js'
import { adoptPlaceDraft, getPlaceDeleteImpact, getPlaceOverview, listPlaceEntries } from '../../services/worldbookPlaceCatalog'
import { generatePlacesFromOverview, generatePlaceFleshOut } from '../../services/settingPlaceGeneration'

const props = defineProps({
  worldbook: { type: Object, required: true }
})

const emit = defineEmits(['saved'])
const worldStore = useWorldStore()
const placeKinds = PLACE_KINDS
const placeScales = PLACE_SCALES
const relationTypes = PLACE_RELATION_TYPES
const search = ref('')
const kindFilter = ref('')
const selectedId = ref('')
const isCreating = ref(false)
const saving = ref(false)
const feedback = ref('')
const feedbackKind = ref('')
const generationState = ref('idle')
const generationErrors = ref([])
const fleshOutState = ref('idle')
const createState = ref('idle')
const drafts = ref([])
const deleteImpact = ref(null)

let relationSequence = 0
const blankForm = () => ({
  name: '',
  aliasesText: '',
  kind: 'site',
  scale: 'unknown',
  parentText: '',
  factionText: '',
  terrainText: '',
  keywordsText: '',
  description: '',
  userBrief: '',
  relations: []
})
const form = reactive(blankForm())

const places = computed(() => listPlaceEntries(props.worldbook))
const filteredPlaces = computed(() => {
  const needle = search.value.toLocaleLowerCase('zh-Hans-CN')
  return places.value.filter((place) => {
    if (kindFilter.value && place.kind !== kindFilter.value) return false
    if (!needle) return true
    return [place.name, ...place.aliases, place.description].some((value) => String(value || '').toLocaleLowerCase('zh-Hans-CN').includes(needle))
  })
})
const pendingDraftCount = computed(() => drafts.value.filter((draft) => !['accepted', 'ignored'].includes(draft.reviewDecision)).length)
const currentEntry = computed(() => {
  if (isCreating.value || !selectedId.value) return null
  return places.value.find((place) => place.entryId === selectedId.value) || null
})
const showParentFactionBanner = computed(() => {
  const entry = currentEntry.value
  if (!entry) return false
  return Boolean((entry.parentRef && entry.parentRef.targetName) || (entry.factionRef && entry.factionRef.targetName))
})
const descriptionWarning = computed(() => (form.description || '').length > 1500)
const hasWorldContext = computed(() => places.value.length > 0 || Boolean(text(getPlaceOverview(props.worldbook))))

function text(value) {
  return String(value || '').trim()
}

function splitList(value) {
  return [...new Set(String(value || '').split(/[\n,，、]/).map(text).filter(Boolean))]
}

function kindLabel(kind) {
  return { continent: '大陆', region: '区域', city: '城市', town: '城镇', village: '村落', port: '港口', fortress: '要塞', academy: '学院', site: '地点', river: '河流', route: '路线' }[kind] || kind
}

function scaleLabel(scale) {
  return { macro: '宏观', regional: '区域', local: '局部', unknown: '未知' }[scale] || scale
}

function relationLabel(type) {
  return { parent: '上级', state: '国家/势力', adjacent: '相邻', river: '沿河', route: '通路', 'same-state': '同属', 'different-state': '异属' }[type] || type
}

function classificationLabel(classification) {
  return { new: '新增', duplicate: '重复', update: '更新', 'relation-pending': '关系待解析', invalid: '无效' }[classification] || classification || '待审阅'
}

function setForm(place = null) {
  const next = blankForm()
  if (place) {
    next.name = place.name
    next.aliasesText = place.aliases.join(', ')
    next.kind = place.kind
    next.scale = place.scale
    next.parentText = place.parentRef?.targetName || ''
    next.factionText = place.factionRef?.targetName || ''
    next.terrainText = place.terrainHints.join(', ')
    next.keywordsText = place.keywords.join(', ')
    next.description = place.description
    next.relations = place.relations.map((relation) => ({
      localId: `relation_${++relationSequence}`,
      type: relation.type || 'adjacent',
      targetName: relation.targetName || ''
    }))
  }
  Object.assign(form, next)
}

function selectPlace(entryId) {
  const place = places.value.find((item) => item.entryId === entryId)
  if (!place) return
  isCreating.value = false
  selectedId.value = entryId
  deleteImpact.value = null
  setForm(place)
}

function startCreate() {
  isCreating.value = true
  selectedId.value = ''
  deleteImpact.value = null
  setForm()
}

function addRelation() {
  form.relations.push({ localId: `relation_${++relationSequence}`, type: 'adjacent', targetName: '' })
}

function removeRelation(index) {
  form.relations.splice(index, 1)
}

function buildPayload(source = form) {
  return {
    name: text(source.name),
    aliases: splitList(source.aliasesText),
    kind: source.kind,
    scale: source.scale,
    parentRef: text(source.parentText) ? { targetName: text(source.parentText) } : {},
    factionRef: text(source.factionText) ? { targetName: text(source.factionText) } : {},
    terrainHints: splitList(source.terrainText),
    keywords: splitList(source.keywordsText),
    relations: (source.relations || []).filter((relation) => text(relation.targetName)).map((relation) => ({
      type: relation.type,
      targetName: text(relation.targetName)
    })),
    description: text(source.description),
    reviewState: 'accepted'
  }
}

async function savePlace() {
  if (!form.name.trim() || saving.value) return
  saving.value = true
  feedback.value = ''
  try {
    const payload = buildPayload()
    const entry = isCreating.value
      ? await worldStore.createPlace(props.worldbook.id, payload)
      : await worldStore.updatePlace(props.worldbook.id, selectedId.value, payload)
    isCreating.value = false
    selectedId.value = entry.id
    setForm(listPlaceEntries(props.worldbook).find((place) => place.entryId === entry.id))
    feedback.value = '地点条目已保存。'
    feedbackKind.value = 'success'
    emit('saved', entry?.metadata?.updatedAt || Date.now())
  } catch (error) {
    feedback.value = error?.message || '地点保存失败。'
    feedbackKind.value = 'error'
  } finally {
    saving.value = false
  }
}

function requestDelete() {
  if (!selectedId.value) return
  deleteImpact.value = getPlaceDeleteImpact(props.worldbook, selectedId.value)
}

async function confirmDelete() {
  if (!selectedId.value) return
  try {
    await worldStore.deletePlace(props.worldbook.id, selectedId.value, { confirmImpact: true })
    selectedId.value = ''
    isCreating.value = true
    setForm()
    deleteImpact.value = null
    feedback.value = '地点条目已删除，相关引用未被级联改写。'
    feedbackKind.value = 'success'
    emit('saved', Date.now())
  } catch (error) {
    feedback.value = error?.message || '地点删除失败。'
    feedbackKind.value = 'error'
  }
}

function decorateDraft(draft) {
  return {
    ...draft,
    draftId: draft.draftId || `place_draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    aliasesText: (draft.aliases || []).join(', '),
    parentText: draft.parentRef?.targetName || '',
    factionText: draft.factionRef?.targetName || '',
    terrainText: (draft.terrainHints || []).join(', '),
    keywordsText: (draft.keywords || []).join(', '),
    relationsText: (draft.relations || []).map((relation) => `${relation.type}=${relation.targetName}`).join(', '),
    reviewDecision: draft.reviewDecision || 'pending'
  }
}

function parseRelations(value) {
  return String(value || '').split(/[\n,，、]/).map(text).filter(Boolean).map((item) => {
    const [rawType, ...targetParts] = item.split(/[=:：]/)
    const type = relationTypes.includes(text(rawType)) ? text(rawType) : 'adjacent'
    return { type, targetName: text(targetParts.join('=')) || text(item) }
  }).filter((relation) => relation.targetName)
}

async function generateFromOverview() {
  if (generationState.value === 'pending') return
  generationState.value = 'pending'
  generationErrors.value = []
  feedback.value = ''
  try {
    const result = await generatePlacesFromOverview({ worldbook: props.worldbook })
    drafts.value = (result.drafts || []).map(decorateDraft)
    generationErrors.value = result.errors || []
    if (!result.ok && !drafts.value.length) {
      feedback.value = result.reason || '没有生成可审阅的地点草稿。'
      feedbackKind.value = 'error'
    } else if (drafts.value.length) {
      feedback.value = `已生成 ${drafts.value.length} 项草稿，请逐项审阅。`
      feedbackKind.value = 'success'
    }
  } catch (error) {
    feedback.value = error?.message || '地点整理失败。'
    feedbackKind.value = 'error'
  } finally {
    generationState.value = 'idle'
  }
}

function applyFleshOut(place) {
  if (!place) return
  const generatedDesc = text(place.description)
  if (generatedDesc) {
    const currentDesc = text(form.description)
    // 句子级智能合并：用户原文永远保留,只追加 AI 中用户没说过的新句;
    // 解决「AI 返回更长时直接覆盖用户原文」的回归。
    const mergeResult = mergeUniqueSentences(currentDesc, generatedDesc)
    if (mergeResult.addedCount > 0) {
      form.description = mergeResult.text
      feedback.value = `已补全 ${mergeResult.addedCount} 句${mergeResult.dedupedCount ? `(去重 ${mergeResult.dedupedCount} 句)` : ''}`
    } else if (!currentDesc) {
      form.description = generatedDesc
    } else if (mergeResult.dedupedCount > 0) {
      // 全是重复 → 不动 form,但提示一下
      feedback.value = `补全内容已包含在原文里(去重 ${mergeResult.dedupedCount} 句)`
    }
  }
  const mergeList = (currentText, generated) => {
    const merged = [...splitList(currentText), ...(Array.isArray(generated) ? generated : [])]
    const seen = new Set()
    const result = []
    for (const item of merged) {
      const value = text(item)
      const key = value.toLocaleLowerCase('zh-Hans-CN')
      if (!key || seen.has(key)) continue
      seen.add(key)
      result.push(value)
    }
    return result.join(', ')
  }
  if (place.aliases?.length) form.aliasesText = mergeList(form.aliasesText, place.aliases)
  if (place.terrainHints?.length) form.terrainText = mergeList(form.terrainText, place.terrainHints)
  if (place.keywords?.length) form.keywordsText = mergeList(form.keywordsText, place.keywords)
  if (Array.isArray(place.relations) && place.relations.length) {
    const existingTargets = new Set(form.relations.map((relation) => text(relation.targetName).toLocaleLowerCase('zh-Hans-CN')))
    for (const relation of place.relations) {
      const targetName = text(relation?.targetName)
      const key = targetName.toLocaleLowerCase('zh-Hans-CN')
      if (!targetName || existingTargets.has(key)) continue
      existingTargets.add(key)
      form.relations.push({
        localId: `relation_${++relationSequence}`,
        type: relationTypes.includes(relation.type) ? relation.type : 'adjacent',
        targetName
      })
    }
  }
}

async function runFleshOut() {
  if (fleshOutState.value === 'pending' || !text(form.name)) return
  fleshOutState.value = 'pending'
  feedback.value = ''
  try {
    const seedRelations = form.relations
      .filter((relation) => text(relation.targetName))
      .slice(0, 8)
      .map((relation) => ({ type: relation.type || 'adjacent', targetName: text(relation.targetName) }))
    const result = await generatePlaceFleshOut({
      worldbook: props.worldbook,
      seed: {
        name: form.name,
        kind: form.kind,
        scale: form.scale,
        aliasesText: form.aliasesText,
        terrainText: form.terrainText,
        keywordsText: form.keywordsText,
        description: form.description,
        relations: seedRelations
      },
      userBrief: form.userBrief,
      excludeEntryId: isCreating.value ? '' : selectedId.value,
      excludeName: text(form.name)
    })
    if (!result.ok || !result.place) {
      feedback.value = result.reason || '地点补全未返回结果。'
      feedbackKind.value = 'error'
    } else {
      applyFleshOut(result.place)
      feedback.value = '已在你已写内容基础上扩写并补全（列表与关系只增不减），请审阅后保存。'
      feedbackKind.value = 'success'
    }
  } catch (error) {
    feedback.value = error?.message || '地点补全失败。'
    feedbackKind.value = 'error'
  } finally {
    fleshOutState.value = 'idle'
  }
}

function applyPlaceCreate(place) {
  if (!place) return
  if (!text(form.name) && text(place.name)) form.name = text(place.name)
  // 描述走句子级合并:create 模式下用户可能已写一段,需要保留
  if (text(place.description)) {
    const descMerge = mergeUniqueSentences(text(form.description), text(place.description))
    if (descMerge.addedCount > 0) {
      form.description = descMerge.text
    } else if (!text(form.description)) {
      form.description = text(place.description)
    }
  }
  if (place.kind && placeKinds.includes(place.kind)) form.kind = place.kind
  if (place.scale && placeScales.includes(place.scale)) form.scale = place.scale
  // 列表字段走 mergeList(用户已输入的 + AI 新生成的,去重合并),
  // 修复原版 `.join(', ')` 直接覆盖的回归。
  const mergeList = (currentText, generated) => {
    const merged = [...splitList(currentText), ...(Array.isArray(generated) ? generated : [])]
    const seen = new Set()
    const result = []
    for (const item of merged) {
      const value = text(item)
      const key = value.toLocaleLowerCase('zh-Hans-CN')
      if (!key || seen.has(key)) continue
      seen.add(key)
      result.push(value)
    }
    return result.join(', ')
  }
  if (place.aliases?.length) form.aliasesText = mergeList(form.aliasesText, place.aliases)
  if (place.terrainHints?.length) form.terrainText = mergeList(form.terrainText, place.terrainHints)
  if (place.keywords?.length) form.keywordsText = mergeList(form.keywordsText, place.keywords)
  const existingTargets = new Set()
  for (const entry of places.value) {
    existingTargets.add(text(entry.name).toLocaleLowerCase('zh-Hans-CN'))
    for (const alias of (entry.aliases || [])) {
      existingTargets.add(text(alias).toLocaleLowerCase('zh-Hans-CN'))
    }
  }
  const validRelations = (Array.isArray(place.relations) ? place.relations : [])
    .filter((relation) => {
      const targetName = text(relation?.targetName)
      return targetName && existingTargets.has(targetName.toLocaleLowerCase('zh-Hans-CN'))
    })
    .slice(0, 3)
  form.relations = validRelations.map((relation) => ({
    localId: `relation_${++relationSequence}`,
    type: relationTypes.includes(relation.type) ? relation.type : 'adjacent',
    targetName: text(relation.targetName)
  }))
}

async function runPlaceCreate() {
  if (createState.value === 'pending' || !hasWorldContext.value) return
  createState.value = 'pending'
  feedback.value = ''
  try {
    const result = await generatePlaceFleshOut({
      worldbook: props.worldbook,
      seed: { name: text(form.name) },
      mode: 'create',
      excludeName: text(form.name)
    })
    if (!result.ok || !result.place) {
      feedback.value = result.reason || '生成新地点失败，请重试。'
      feedbackKind.value = 'error'
    } else {
      applyPlaceCreate(result.place)
      feedback.value = '已基于世界设定生成新地点，请审阅后保存（已过滤指向不存在地点的关系）。'
      feedbackKind.value = 'success'
    }
  } catch (error) {
    feedback.value = error?.message || '生成新地点失败。'
    feedbackKind.value = 'error'
  } finally {
    createState.value = 'idle'
  }
}

function draftPayload(draft) {
  const evidence = text(draft.evidence)
  const evidenceStatus = evidence && getPlaceOverview(props.worldbook).includes(evidence) ? 'high' : 'low'
  return {
    ...draft,
    ...buildPayload({
      name: draft.name,
      aliasesText: draft.aliasesText,
      kind: draft.kind,
      scale: draft.scale,
      parentText: draft.parentText,
      factionText: draft.factionText,
      terrainText: draft.terrainText,
      keywordsText: draft.keywordsText,
      description: draft.description,
      relations: parseRelations(draft.relationsText)
    }),
    evidenceStatus,
    sourceEvidence: [{ excerpt: evidence, source: '地理环境', confidence: evidenceStatus }]
  }
}

async function adoptDraft(draft, index) {
  if (draft.reviewDecision === 'accepted') return
  draft.reviewDecision = 'working'
  try {
    await adoptPlaceDraft({ worldStore, worldbook: props.worldbook, draft: draftPayload(draft) })
    drafts.value.splice(index, 1)
    feedback.value = `已采纳「${draft.name}」，其余草稿保持可审阅。`
    feedbackKind.value = 'success'
    emit('saved', Date.now())
  } catch (error) {
    draft.reviewDecision = error?.code === 'PLACE_DRAFT_STALE' ? 'stale' : 'pending'
    draft.error = error?.message || '采纳失败。'
    feedback.value = draft.error
    feedbackKind.value = 'error'
  }
}

function ignoreDraft(draft) {
  draft.reviewDecision = draft.reviewDecision === 'ignored' ? 'pending' : 'ignored'
}

watch(selectedId, (entryId) => {
  if (!entryId) return
  const place = places.value.find((item) => item.entryId === entryId)
  if (place) setForm(place)
})

if (!places.value.length) startCreate()
</script>

<style scoped>
.place-catalog {
  /* Remap the archive palette to neutral tokens so this block reads as clean/white
     as the rest of the settings surface, instead of navy-tinted. */
  --archive-ink: var(--text-secondary);
  --archive-olive: var(--accent);
  --archive-paper-soft: var(--surface-raised);
  grid-column: 1 / -1;
  min-width: 0;
  margin-top: 10px;
  padding: 14px;
  background: var(--bg-secondary);
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 12px;
  color: var(--archive-ink, var(--text-primary));
}

.place-catalog-head,
.place-editor-head,
.place-review-head,
.place-draft-foot,
.place-subhead,
.place-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.place-catalog-head h3,
.place-editor-head h4,
.place-review-head h4 {
  margin: 2px 0 3px;
  font-size: 18px;
}

.place-catalog-head p,
.place-hint,
.place-empty,
.place-draft-meta {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.place-catalog-kicker {
  color: var(--archive-olive, var(--accent));
  font-size: 11px;
  font-weight: 750;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.place-catalog-count,
.place-review-count {
  color: var(--text-muted);
  font-size: 12px;
  white-space: nowrap;
}

.place-catalog-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
}

.place-search,
.place-filter {
  display: flex;
  align-items: center;
  min-height: 34px;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 20%, var(--border));
  background: var(--surface-raised);
}

.place-search {
  flex: 1 1 220px;
  gap: 7px;
  padding: 0 9px;
}

.place-search svg { color: var(--text-muted); }
.place-search input,
.place-filter select {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
}

.place-filter { flex: 0 1 140px; padding: 0 7px; }
.place-filter select { min-height: 32px; }

.place-tool-button,
.place-action-button,
.place-inline-button,
.place-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid color-mix(in srgb, var(--archive-ink) 24%, var(--border));
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 680;
  cursor: pointer;
}

.place-tool-button { min-height: 34px; padding: 0 10px; }
.place-tool-button.is-accent,
.place-action-button.is-primary { border-color: color-mix(in srgb, var(--archive-olive, var(--accent)) 58%, var(--border)); color: var(--archive-olive, var(--accent)); }
.place-tool-button:hover,
.place-action-button:hover,
.place-inline-button:hover,
.place-icon-button:hover { border-color: var(--accent); color: var(--accent); }
.place-tool-button:disabled,
.place-action-button:disabled,
.place-inline-button:disabled { cursor: not-allowed; opacity: .55; }
.place-action-button { min-height: 32px; padding: 0 9px; }
.place-action-button.is-danger { border-color: color-mix(in srgb, var(--danger) 55%, var(--border)); color: var(--danger); }
.place-inline-button { padding: 4px 7px; }
.place-icon-button { width: 28px; height: 28px; padding: 0; flex: 0 0 auto; }

.place-field-hint {
  margin: 2px 0 0;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.4;
}

.place-editor-banner {
  margin: 8px 0 0;
  padding: 6px 10px;
  border-left: 2px solid color-mix(in srgb, var(--accent) 34%, var(--border));
  background: color-mix(in srgb, var(--accent) 6%, transparent);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.place-feedback,
.place-generation-errors,
.place-delete-confirm {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin: 8px 0;
  padding: 8px 10px;
  border-left: 2px solid var(--archive-olive, var(--accent));
  background: color-mix(in srgb, var(--archive-olive, var(--accent)) 7%, transparent);
  font-size: 12px;
  line-height: 1.5;
}

.place-feedback.is-error,
.place-generation-errors { border-left-color: var(--danger); color: var(--danger); }
.place-delete-confirm { border-left-color: var(--danger); color: var(--text-secondary); align-items: center; justify-content: space-between; }
.place-delete-confirm > div { display: flex; gap: 7px; }

.place-catalog-layout {
  display: grid;
  grid-template-columns: minmax(180px, .32fr) minmax(0, .68fr);
  min-width: 0;
  border-top: 1px solid color-mix(in srgb, var(--archive-ink) 14%, var(--border));
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 14%, var(--border));
}

.place-list { min-width: 0; border-right: 1px solid color-mix(in srgb, var(--archive-ink) 14%, var(--border)); }
.place-list-head { padding: 10px 9px; color: var(--text-muted); font-size: 11px; font-weight: 750; text-transform: uppercase; }
.place-list-row { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; width: 100%; padding: 10px 9px; border: 0; border-top: 1px solid color-mix(in srgb, var(--archive-ink) 10%, var(--border)); background: transparent; color: inherit; text-align: left; cursor: pointer; }
.place-list-row:hover,
.place-list-row.active { background: color-mix(in srgb, var(--archive-olive, var(--accent)) 9%, transparent); }
.place-list-name { overflow: hidden; width: 100%; color: var(--text-primary); font-size: 13px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.place-list-meta { color: var(--text-muted); font-size: 11px; }
.place-empty { padding: 12px 9px; }

.place-editor { min-width: 0; padding: 12px 14px 15px; }
.place-editor-head { align-items: flex-start; margin-bottom: 10px; }
.place-editor-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 7px; }
.place-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px 12px; margin: 0; padding: 0; border: 0; }
.place-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; color: var(--text-muted); font-size: 11px; font-weight: 700; }
.place-field.is-wide { grid-column: 1 / -1; }
.place-field input,
.place-field select,
.place-field textarea,
.place-draft-fields input,
.place-draft-fields select,
.place-draft-fields textarea,
.place-relation-row input,
.place-relation-row select { width: 100%; min-width: 0; box-sizing: border-box; border: 1px solid color-mix(in srgb, var(--archive-ink) 18%, var(--border)); border-radius: 2px; padding: 7px 8px; background: var(--surface-raised); color: var(--text-primary); font: inherit; font-size: 13px; }
.place-field textarea { resize: vertical; line-height: 1.5; }

.place-relations { margin-top: 13px; padding-top: 10px; border-top: 1px solid color-mix(in srgb, var(--archive-ink) 12%, var(--border)); }
.place-relations.is-disabled { opacity: .55; }
.place-subhead { margin-bottom: 7px; color: var(--text-muted); font-size: 11px; font-weight: 750; text-transform: uppercase; }
.place-relation-row { display: grid; grid-template-columns: minmax(110px, .3fr) minmax(0, 1fr) 28px; gap: 7px; margin-top: 7px; }

.place-review { margin-top: 15px; padding-top: 13px; border-top: 1px solid color-mix(in srgb, var(--archive-ink) 18%, var(--border)); }
.place-review-head { margin-bottom: 8px; }
.place-draft-row { padding: 10px 0; border-top: 1px solid color-mix(in srgb, var(--archive-ink) 12%, var(--border)); }
.place-draft-row.is-ignored { opacity: .68; }
.place-draft-status { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin-bottom: 7px; }
.place-draft-name { font-size: 13px; font-weight: 750; }
.place-draft-badge { padding: 2px 6px; border: 1px solid color-mix(in srgb, var(--archive-ink) 20%, var(--border)); color: var(--text-muted); font-size: 10px; }
.place-draft-badge.is-warning { border-color: color-mix(in srgb, var(--danger) 48%, var(--border)); color: var(--danger); }
.place-draft-fields { display: grid; grid-template-columns: 1.1fr .65fr 1fr 1fr; gap: 7px; }
.place-draft-fields textarea { grid-column: span 2; resize: vertical; }
.place-draft-foot { margin-top: 8px; }
.place-draft-actions { display: flex; gap: 7px; }

.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

@media (max-width: 980px) {
  .place-catalog-layout { grid-template-columns: minmax(150px, .36fr) minmax(0, .64fr); }
  .place-draft-fields { grid-template-columns: 1fr 1fr; }
}

@media (max-width: 640px) {
  .place-catalog-toolbar > * { flex: 1 1 100%; }
  .place-catalog-layout { grid-template-columns: 1fr; }
  .place-list { border-right: 0; border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 14%, var(--border)); max-height: 220px; overflow: auto; }
  .place-fields,
  .place-draft-fields { grid-template-columns: 1fr; }
  .place-field.is-wide,
  .place-draft-fields textarea { grid-column: 1; }
  .place-relation-row { grid-template-columns: 1fr 28px; }
  .place-relation-row select { grid-column: 1 / -1; }
  .place-editor-head,
  .place-delete-confirm,
  .place-draft-foot { align-items: flex-start; flex-direction: column; }
}
</style>
