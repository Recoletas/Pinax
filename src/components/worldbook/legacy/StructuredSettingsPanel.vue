<!--
  Frozen snapshot from 4e779d2 fix(world-map): stabilize settlement realism baselines.
  Extracted 2026-06-15 by feat/theme-system-20260615 implementation.
  DO NOT MODIFY. This file is a visual fallback only.

  Allowed changes (per spec §7):
  - compile fixes required by current Vue/Vite/store contracts
  - wrapper adapters for renamed composables or store fields
  - accessibility / test IDs for the theme switcher
  - critical bug fixes that prevent the fallback from loading
-->
<template>
  <section class="card structured-settings-panel">
    <div class="card-head">
      <h2>结构化设定</h2>
    </div>

    <nav class="section-tabs">
      <button
        v-for="section in sections"
        :key="section.key"
        :class="['section-tab', { active: activeSectionKey === section.key }]"
        @click="activeSectionKey = section.key"
      >
        {{ section.label }}
      </button>
    </nav>

    <div v-if="feedback" class="feedback-line">{{ feedback }}</div>

    <div class="fields-grid">
      <SettingFieldCard
        v-for="field in activeSection.fields"
        :key="field.key"
        :section="activeSection"
        :field="field"
        v-model="form[activeSectionKey][field.key]"
        :working="workingKey === `${activeSectionKey}.${field.key}`"
        @save="saveField"
        @generate="generateField"
        @convert-entry="convertCurrentField"
      />
    </div>

    <SettingDraftReview
      :draft="draft"
      @discard="draft = null"
      @update:content="updateDraftContent"
      @save-field="saveDraftToField"
      @convert-entry="convertDraftToEntry"
      @copy="copyDraft"
    />
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useWorldStore } from '../../stores/worldStore'
import { SETTING_SECTIONS, getSettingField, normalizeStructuredSettings } from '../../services/settingPanelSchema'
import { buildSettingPromptPreview, generateSettingFieldDraft } from '../../services/settingFieldGeneration'
import SettingDraftReview from './SettingDraftReview.vue'
import SettingFieldCard from './SettingFieldCard.vue'

const props = defineProps({
  worldbook: { type: Object, required: true }
})

const worldStore = useWorldStore()
const sections = SETTING_SECTIONS
const activeSectionKey = ref('world')
const workingKey = ref('')
const feedback = ref('')
const draft = ref(null)
const form = reactive(normalizeStructuredSettings(props.worldbook?.structuredSettings))

const activeSection = computed(() => SETTING_SECTIONS.find((section) => section.key === activeSectionKey.value) || SETTING_SECTIONS[0])

watch(
  () => props.worldbook?.structuredSettings,
  (next) => Object.assign(form, normalizeStructuredSettings(next)),
  { deep: true }
)

async function saveField({ sectionKey, fieldKey }) {
  await worldStore.updateStructuredSetting(props.worldbook.id, sectionKey, fieldKey, form[sectionKey][fieldKey])
  feedback.value = '已保存'
}

async function generateField({ sectionKey, fieldKey }) {
  const field = getSettingField(sectionKey, fieldKey)
  workingKey.value = `${sectionKey}.${fieldKey}`
  feedback.value = ''
  const promptPreview = buildSettingPromptPreview({
    worldbook: { ...props.worldbook, structuredSettings: form },
    sectionKey,
    fieldKey,
    userBrief: ''
  })
  const result = await generateSettingFieldDraft({
    worldbook: { ...props.worldbook, structuredSettings: form },
    sectionKey,
    fieldKey,
    userBrief: ''
  })
  workingKey.value = ''
  if (!result.ok) {
    feedback.value = result.reason
    return
  }
  draft.value = {
    sectionKey,
    fieldKey,
    fieldLabel: field.label,
    content: result.content,
    promptPreview
  }
}

function updateDraftContent(content) {
  if (draft.value) {
    draft.value = { ...draft.value, content }
  }
}

async function saveDraftToField() {
  if (!draft.value) return
  form[draft.value.sectionKey][draft.value.fieldKey] = draft.value.content
  await saveField(draft.value)
  draft.value = null
}

async function convertDraftToEntry() {
  if (!draft.value) return
  form[draft.value.sectionKey][draft.value.fieldKey] = draft.value.content
  await saveField(draft.value)
  await worldStore.convertStructuredSettingToEntry(props.worldbook.id, draft.value.sectionKey, draft.value.fieldKey)
  feedback.value = '已转为世界书条目'
  draft.value = null
}

function copyDraft() {
  if (!draft.value) return
  navigator.clipboard.writeText(draft.value.content)
  feedback.value = '已复制'
}

async function convertCurrentField({ sectionKey, fieldKey }) {
  await saveField({ sectionKey, fieldKey })
  await worldStore.convertStructuredSettingToEntry(props.worldbook.id, sectionKey, fieldKey)
  feedback.value = '已转为世界书条目'
}
</script>

<style scoped>
.structured-settings-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.section-tab {
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--text-secondary);
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
}

.section-tab.active {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 9%, var(--bg-primary));
}

.feedback-line {
  font-size: 12px;
  color: var(--text-muted);
  padding: 4px 0;
}

.fields-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 10px;
}

@media (max-width: 720px) {
  .fields-grid {
    grid-template-columns: 1fr;
  }
}
</style>
