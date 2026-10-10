<template>
  <section class="entry-profile-editor" aria-labelledby="entry-profile-title">
    <header class="entry-profile-head">
      <div>
        <span class="panel-kicker">{{ tr("条目档案") }}</span>
        <h3 id="entry-profile-title">{{ tr("模板与字段") }}</h3>
      </div>
      <span v-if="missingLabels.length" class="entry-profile-missing" role="status">
        {{ tr("必填未填：{labels}", { labels: missingLabels.map((label) => tr(label)).join('、') }) }}
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

    <section class="entry-profile-free" aria-labelledby="entry-profile-free-title">
      <header class="entry-profile-free-head">
        <span id="entry-profile-free-title">{{ tr("自由字段") }}</span>
        <span class="entry-profile-free-add">
          <input v-model.trim="newFreeKey" class="text-input" type="text" :placeholder="tr('字段名，如 性别/年龄/目标')" @keyup.enter="addFreeField" />
          <button type="button" class="ghost-btn small" @click="addFreeField">{{ tr("添加字段") }}</button>
        </span>
      </header>
      <p class="entry-profile-hint">
        {{ tr("模板之外的字段（含正文里识别出的【自定义标签】）在这里编辑；保存时会一并投影进正文。") }}
      </p>
      <div v-for="pair in freeEntries" :key="pair.key" class="entry-profile-field">
        <span class="entry-profile-free-label">
          {{ pair.key }}
          <button type="button" class="ghost-btn small" @click="removeFreeField(pair.key)">{{ tr("移除") }}</button>
        </span>
        <textarea v-model="values[pair.key]" rows="2" :placeholder="pair.key"></textarea>
      </div>
      <div v-if="!freeEntries.length" class="empty-hint">{{ tr("暂无自由字段。") }}</div>
    </section>

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
const newFreeKey = ref('')

const template = computed(() => getProfileTemplate(selectedTemplateId.value))
const missingLabels = computed(() => missingRequiredLabels({ template: selectedTemplateId.value, values }))

// 自由键 = values 里既不是模板字段 key、也不是模板字段 label 的键
function knownFieldNames() {
  const fields = template.value.fields
  return new Set([...fields.map((field) => field.key), ...fields.map((field) => field.label)])
}

const freeEntries = computed(() => {
  const known = knownFieldNames()
  return Object.keys(values).filter((key) => !known.has(key)).map((key) => ({ key }))
})

function addFreeField() {
  const key = newFreeKey.value.trim()
  newFreeKey.value = ''
  if (!key) return
  const fields = template.value.fields
  // 与模板字段 key/label 撞名的输入拒绝：撞名键既不会被当自由键投影，也会被模板字段遮蔽
  if (fields.some((field) => field.key === key || field.label === key)) return
  if (!Object.prototype.hasOwnProperty.call(values, key)) values[key] = ''
}

function removeFreeField(key) {
  delete values[key]
}

function splitListText(text) {
  return String(text ?? '')
    .split(/[\n,，、;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function seedFromEntry() {
  const profile = profileFromEntry(props.entry, props.entry?.profile?.template || '')
  selectedTemplateId.value = profile.template
  const fields = template.value.fields
  // 先清掉旧自由键再播种：切换条目/重读时上一条的键不得残留
  for (const key of Object.keys(values)) {
    if (!fields.some((field) => field.key === key)) delete values[key]
  }
  for (const field of fields) {
    values[field.key] = profile.values[field.key] || ''
  }
  for (const [key, value] of Object.entries(profile.values)) {
    if (knownFieldNames().has(key)) continue
    values[key] = value
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
  const fields = template.value.fields
  const known = new Set(fields.map((field) => field.key))
  const valuesOut = {}
  // 模板字段在前（保投影顺序），自由键按 values 插入序跟在后面（renderToContent 同序）
  for (const field of fields) {
    valuesOut[field.key] = String(values[field.key] ?? '').trim()
  }
  for (const [key, value] of Object.entries(values)) {
    if (known.has(key)) continue
    const text = String(value ?? '').trim()
    if (text) valuesOut[key] = text
  }
  return {
    template: template.value.id,
    values: valuesOut,
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

.entry-profile-free {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  border: 1px dashed var(--border, var(--border-subtle));
  border-radius: 6px;
}

.entry-profile-free-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--text-secondary);
  font-size: var(--authoring-catalog-label-size, 12px);
  font-weight: 600;
}

.entry-profile-free-add {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 200px;
}

.entry-profile-free-add .text-input {
  flex: 1;
  min-width: 0;
}

.entry-profile-free-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
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
