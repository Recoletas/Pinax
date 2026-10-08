<template>
  <section class="entry-profile-editor" aria-labelledby="entry-profile-title">
    <header class="entry-profile-head">
      <div>
        <span class="panel-kicker">{{ tr("条目档案") }}</span>
        <h3 id="entry-profile-title">{{ tr("模板与字段") }}</h3>
      </div>
      <span v-if="missingLabels.length" class="entry-profile-missing" role="status">
        {{ tr("必填未填：{labels}", { labels: missingLabels.join('、') }) }}
      </span>
    </header>
    <p class="entry-profile-hint">
      {{ tr("选择模板决定字段集；保存时会把字段投影成条目正文。若正文已被手动修改，会先请你选择保留原文还是覆盖。") }}
    </p>

    <label class="entry-profile-template">
      {{ tr("模板") }}
      <select v-model="selectedTemplateId" class="select-input">
        <option v-for="template in templates" :key="template.id" :value="template.id">
          {{ tr(template.label) }}
        </option>
      </select>
    </label>

    <label v-for="field in template.fields" :key="field.key" class="entry-profile-field">
      <span>{{ tr(field.label) }}<i v-if="field.required" class="req" :title="tr('必填')">*</i></span>
      <textarea
        v-if="field.multiline"
        v-model="values[field.key]"
        rows="3"
        :placeholder="tr(field.label)"
      ></textarea>
      <input v-else v-model="values[field.key]" class="text-input" type="text" :placeholder="tr(field.label)" />
    </label>

    <section class="entry-profile-speech" aria-labelledby="entry-profile-speech-title">
      <label class="checkbox-line">
        <input v-model="speech.enabled" type="checkbox" />
        <span id="entry-profile-speech-title">{{ tr("声口设定（说话方式与示例台词）") }}</span>
      </label>
      <template v-if="speech.enabled">
        <label>
          {{ tr("说话方式") }}
          <textarea v-model="speech.speechStyle" rows="2" maxlength="240" :placeholder="tr('句长、措辞、回避或强调习惯')"></textarea>
        </label>
        <label>
          {{ tr("常用词（顿号或逗号分隔）") }}
          <input v-model="speech.vocabularyCommonText" class="text-input" type="text" :placeholder="tr('例如：唔、按理说、契约')" />
        </label>
        <label>
          {{ tr("禁用词（顿号或逗号分隔）") }}
          <input v-model="speech.vocabularyForbiddenText" class="text-input" type="text" :placeholder="tr('该角色不会说的词')" />
        </label>
        <label>
          {{ tr("示例台词（每行一条）") }}
          <textarea v-model="speech.samplesText" rows="3" :placeholder="tr('台词示例')"></textarea>
        </label>
        <label>
          {{ tr("登场问候") }}
          <textarea v-model="speech.greeting" rows="2" maxlength="240"></textarea>
        </label>
      </template>
    </section>

    <details class="entry-profile-preview">
      <summary>{{ tr("预览投影正文") }}</summary>
      <pre class="entry-profile-preview-body">{{ renderedContent || tr('（空）') }}</pre>
    </details>

    <div v-if="confirmOpen" class="entry-profile-confirm" role="alertdialog" :aria-label="tr('正文已被手动修改')">
      <p>{{ tr("条目正文已被手动修改，与模板投影不一致。请选择保留哪一份：") }}</p>
      <div class="entry-profile-confirm-actions">
        <button type="button" class="ghost-btn" @click="emitSave(false)">{{ tr("以原文为准（只存字段）") }}</button>
        <button type="button" class="primary-btn" @click="emitSave(true)">{{ tr("覆盖原文（用投影替换）") }}</button>
        <button type="button" class="ghost-btn small" @click="confirmOpen = false">{{ tr("取消") }}</button>
      </div>
    </div>
    <div v-else class="entry-profile-actions">
      <button type="button" class="primary-btn" :disabled="saving" @click="requestSave">
        {{ saving ? tr('保存中...') : tr('保存档案并投影正文') }}
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { tr } from '../../i18n/index.js'
import {
  ENTRY_PROFILE_TEMPLATES,
  getProfileTemplate,
  missingRequiredLabels,
  normalizeSpeech,
  profileFromEntry
} from '../../services/worldbook/entryProfileTemplates.js'

const props = defineProps({
  /** 选中条目（运行时 Entry 形状） */
  entry: { type: Object, required: true },
  /** 当前编辑中的正文（含未保存的手改）；缺省读 entry.content */
  content: { type: String, default: '' },
  saving: { type: Boolean, default: false }
})
const emit = defineEmits(['save'])

const templates = ENTRY_PROFILE_TEMPLATES
const selectedTemplateId = ref('')
const values = reactive({})
const speech = reactive({ enabled: false, speechStyle: '', vocabularyCommonText: '', vocabularyForbiddenText: '', samplesText: '', greeting: '' })
const confirmOpen = ref(false)

const template = computed(() => getProfileTemplate(selectedTemplateId.value))
const missingLabels = computed(() => missingRequiredLabels({ template: selectedTemplateId.value, values }))

function splitListText(text) {
  return String(text ?? '')
    .split(/[\n,，、;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function seedFromEntry() {
  const profile = profileFromEntry(props.entry, props.entry?.profile?.template || '')
  selectedTemplateId.value = profile.template
  for (const field of template.value.fields) {
    values[field.key] = profile.values[field.key] || ''
  }
  Object.assign(speech, {
    enabled: profile.speech.enabled,
    speechStyle: profile.speech.speechStyle,
    vocabularyCommonText: profile.speech.vocabularyCommon.join('、'),
    vocabularyForbiddenText: profile.speech.vocabularyForbidden.join('、'),
    samplesText: profile.speech.samples.join('\n'),
    greeting: profile.speech.greeting
  })
  confirmOpen.value = false
}

watch(() => props.entry?.id, seedFromEntry, { immediate: true })
watch(selectedTemplateId, () => {
  // 换模板：保留同名字段值，新字段补空
  for (const field of template.value.fields) {
    if (typeof values[field.key] !== 'string') values[field.key] = ''
  }
})

function buildProfile() {
  return {
    template: template.value.id,
    values: Object.fromEntries(template.value.fields.map((field) => [field.key, String(values[field.key] ?? '').trim()])),
    speech: normalizeSpeech({
      enabled: speech.enabled,
      speechStyle: speech.speechStyle,
      vocabularyCommon: splitListText(speech.vocabularyCommonText),
      vocabularyForbidden: splitListText(speech.vocabularyForbiddenText),
      samples: speech.samplesText,
      greeting: speech.greeting
    })
  }
}

const renderedContent = computed(() => template.value.renderToContent(buildProfile()))

function requestSave() {
  const current = String(props.content ?? props.entry?.content ?? '')
  const rendered = renderedContent.value
  // 投影为空：只存字段，不动正文；投影与原文一致：直接保存，无需选择
  if (!rendered || rendered === current.trim()) {
    emitSave(rendered === current.trim())
    return
  }
  // 正文被手改过：显式二选一，禁默认
  confirmOpen.value = true
}

function emitSave(overwrite) {
  confirmOpen.value = false
  emit('save', {
    profile: buildProfile(),
    content: renderedContent.value,
    overwrite: Boolean(overwrite)
  })
}
</script>

<style scoped>
.entry-profile-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 0 8px;
  border-top: 1px dashed var(--border, var(--border-subtle));
}

.entry-profile-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.entry-profile-head h3 {
  margin: 2px 0 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.entry-profile-missing {
  padding: 2px 8px;
  border: 1px solid color-mix(in srgb, var(--warning, #b8860b) 45%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--warning, #b8860b) 12%, transparent);
  color: var(--warning, #b8860b);
  font-size: 11px;
}

.entry-profile-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--authoring-catalog-meta-size, 11px);
  line-height: 1.5;
}

.entry-profile-template,
.entry-profile-field,
.entry-profile-speech label {
  display: block;
  color: var(--text-secondary);
  font-size: var(--authoring-catalog-label-size, 12px);
}

.entry-profile-field > span { display: block; margin-bottom: 4px; }
.entry-profile-field .req { color: var(--warning, #b8860b); font-style: normal; margin-left: 2px; }
.entry-profile-template .select-input,
.entry-profile-field .text-input,
.entry-profile-field textarea,
.entry-profile-speech textarea {
  display: block;
  box-sizing: border-box;
  width: 100%;
  margin-top: 4px;
  color: var(--text-primary);
}

.entry-profile-speech {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border, var(--border-subtle));
  border-radius: 6px;
}

.entry-profile-speech .checkbox-line {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
}

.entry-profile-preview summary {
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.entry-profile-preview-body {
  margin: 8px 0 0;
  padding: 10px 12px;
  border: 1px solid var(--border, var(--border-subtle));
  border-radius: 6px;
  background: var(--surface-workbench-muted, var(--bg-secondary));
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.entry-profile-actions,
.entry-profile-confirm-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.entry-profile-confirm {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--warning, #b8860b) 45%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--warning, #b8860b) 8%, transparent);
}

.entry-profile-confirm p { margin: 0; color: var(--text-primary); font-size: 13px; }

@media (pointer: coarse) {
  .entry-profile-actions button,
  .entry-profile-confirm-actions button { min-height: 44px; }
}
</style>
