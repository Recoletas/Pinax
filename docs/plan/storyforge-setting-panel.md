# StoryForge Setting Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Absorb the useful parts of `yuanbw2025/storyforge` into Pinax's worldbook setting panel: structured setting fields, field-level AI drafts, visible prompt context, and confirmed write-back into the existing worldbook system.

**Architecture:** Keep Pinax's current Vue 3 + Pinia + localStorage worldbook architecture. Add a structured setting layer inside each worldbook, then let users generate, review, and either save fields or convert them into normal worldbook entries. Do not copy StoryForge's React, Zustand, Dexie, TipTap, or full workflow engine.

**Tech Stack:** Vue 3, Pinia, Vitest, existing `runGenerationTask`, existing `worldStore`, existing worldbook import and context services.

---

## 1. Source Reading Summary

StoryForge's transferable ideas:

- Structured setting library: world origin, nature, culture, story core, character tiers, creative rules.
- Field-level AI generation: each field can be generated independently.
- Smart context: existing filled fields are injected when generating a related field.
- Prompt visibility: system prompt, user template, parameters, examples, and final rendered prompt can be seen and adjusted.
- Confirmed write-back: generated output is reviewed before being saved.

Pinax-specific constraints:

- Existing source of truth is `worldStore.activeWorldbook`.
- Existing long-term setting payloads are normal worldbook entries with injection rules.
- Existing generation calls should go through `runGenerationTask`.
- Existing UX principle: worldbook and memory must not receive silent writes.
- Existing worldbook editor is already large; new UI must be split into focused components.

## 2. Product Decision

Build a new "结构化设定" tab inside the advanced worldbook editor.

The tab gives users a calmer setting workbench:

```text
世界书 · 高级设置
  基础设定
  结构化设定   <-- new
  导入导出
  分组管理
  条目管理
```

The new tab is not a replacement for worldbook entries. It is an authoring surface above them.

Data flow:

```text
User edits field
  -> saved under activeWorldbook.structuredSettings
  -> field can generate AI draft
  -> draft is shown in review panel
  -> user chooses one action:
       Save to field
       Convert to worldbook entry
       Copy
       Discard
```

## 3. File Structure

Create:

- `src/services/settingPanelSchema.js`
  Defines section and field schema, field defaults, labels, and helpers.

- `src/services/settingFieldGeneration.js`
  Builds generation messages, renders context preview, calls `runGenerationTask`, parses draft text.

- `src/components/worldbook/StructuredSettingsPanel.vue`
  Main structured setting tab UI.

- `src/components/worldbook/SettingFieldCard.vue`
  One field editor with save, generate, clear, and convert controls.

- `src/components/worldbook/SettingDraftReview.vue`
  Draft review surface with prompt preview and write-back actions.

- `src/__tests__/settingPanelSchema.test.js`
  Schema normalization and context extraction tests.

- `src/__tests__/settingFieldGeneration.test.js`
  Prompt/context/generation behavior tests.

- `src/__tests__/structuredSettingsStore.test.js`
  Store persistence and worldbook entry conversion tests.

Modify:

- `src/stores/worldStore.js`
  Add `structuredSettings` normalization, update methods, and conversion method.

- `src/pages/WorldBookEditor.vue`
  Add tab navigation and mount `StructuredSettingsPanel`.

- `src/services/worldbookContextBuilder.js`
  Include concise structured settings in worldbook context.

- `src/__tests__/worldbookContextBuilder.test.js`
  Verify structured settings context budget behavior.

Do not modify:

- `src/router/index.js`
- `src/pages/WorldBookQuickImport.vue` in the first implementation pass
- `server/index.js`
- package dependencies

## 4. Data Model

Add `structuredSettings` to a worldbook:

```js
structuredSettings: {
  world: {
    origin: '',
    powerSystem: '',
    geography: '',
    history: '',
    factions: '',
    rules: ''
  },
  story: {
    logline: '',
    concept: '',
    theme: '',
    coreConflict: '',
    mainline: '',
    sublines: ''
  },
  characters: {
    protagonists: '',
    majorSupporting: '',
    npcs: '',
    relationshipSummary: ''
  },
  creativeRules: {
    writingStyle: '',
    perspective: '',
    tone: '',
    taboos: '',
    consistency: '',
    references: ''
  }
}
```

The model intentionally uses strings, not nested arrays, for the first pass. This keeps storage compatible with current localStorage and avoids building a second database.

## 5. Tasks

### Task 1: Add Structured Setting Schema

**Files:**
- Create: `src/services/settingPanelSchema.js`
- Test: `src/__tests__/settingPanelSchema.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it } from 'vitest'
import {
  createEmptyStructuredSettings,
  getSettingField,
  normalizeStructuredSettings,
  summarizeStructuredSettings
} from '../services/settingPanelSchema'

describe('settingPanelSchema', () => {
  it('creates every expected setting section and field', () => {
    const settings = createEmptyStructuredSettings()

    expect(Object.keys(settings)).toEqual(['world', 'story', 'characters', 'creativeRules'])
    expect(settings.world.origin).toBe('')
    expect(settings.story.logline).toBe('')
    expect(settings.characters.relationshipSummary).toBe('')
    expect(settings.creativeRules.consistency).toBe('')
  })

  it('normalizes partial legacy data without losing known values', () => {
    const settings = normalizeStructuredSettings({
      world: { origin: '雾潮来自旧神遗骸。' },
      story: { theme: '记忆与代价' },
      unknown: { value: 'ignored' }
    })

    expect(settings.world.origin).toBe('雾潮来自旧神遗骸。')
    expect(settings.story.theme).toBe('记忆与代价')
    expect(settings.world.powerSystem).toBe('')
    expect(settings.unknown).toBeUndefined()
  })

  it('returns field metadata by section and field key', () => {
    const field = getSettingField('world', 'powerSystem')

    expect(field.label).toBe('力量体系')
    expect(field.entryType).toBe('lore')
    expect(field.defaultGroup).toBe('世界观')
  })

  it('summarizes filled fields for generation context', () => {
    const settings = normalizeStructuredSettings({
      world: { origin: '世界从沉没月亮中诞生。', geography: '大陆被内海分为三块。' },
      story: { logline: '失忆书记官追查会吞噬姓名的雾。' }
    })

    expect(summarizeStructuredSettings(settings, { exclude: { sectionKey: 'world', fieldKey: 'origin' } }))
      .toContain('地理环境：大陆被内海分为三块。')
    expect(summarizeStructuredSettings(settings, { exclude: { sectionKey: 'world', fieldKey: 'origin' } }))
      .not.toContain('世界起源：世界从沉没月亮中诞生。')
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm run test:run -- src/__tests__/settingPanelSchema.test.js
```

Expected: fail because `src/services/settingPanelSchema.js` does not exist.

- [ ] **Step 3: Implement the schema service**

Create `src/services/settingPanelSchema.js` with:

```js
export const SETTING_SECTIONS = [
  {
    key: 'world',
    label: '世界观',
    description: '世界来源、地理、历史、势力与运行规则',
    fields: [
      { key: 'origin', label: '世界起源', entryType: 'lore', defaultGroup: '世界观' },
      { key: 'powerSystem', label: '力量体系', entryType: 'lore', defaultGroup: '世界观' },
      { key: 'geography', label: '地理环境', entryType: 'location', defaultGroup: '地理' },
      { key: 'history', label: '历史线', entryType: 'event', defaultGroup: '历史' },
      { key: 'factions', label: '势力分布', entryType: 'organization', defaultGroup: '势力' },
      { key: 'rules', label: '世界规则', entryType: 'rule', defaultGroup: '硬约束' }
    ]
  },
  {
    key: 'story',
    label: '故事核心',
    description: '故事概念、主题、冲突、主线与复线',
    fields: [
      { key: 'logline', label: '一句话故事', entryType: 'lore', defaultGroup: '故事核心' },
      { key: 'concept', label: '故事概念', entryType: 'lore', defaultGroup: '故事核心' },
      { key: 'theme', label: '主题', entryType: 'lore', defaultGroup: '故事核心' },
      { key: 'coreConflict', label: '核心冲突', entryType: 'event', defaultGroup: '故事核心' },
      { key: 'mainline', label: '主线', entryType: 'quest', defaultGroup: '故事核心' },
      { key: 'sublines', label: '复线', entryType: 'quest', defaultGroup: '故事核心' }
    ]
  },
  {
    key: 'characters',
    label: '角色设定',
    description: '主角、重要配角、NPC 与关系摘要',
    fields: [
      { key: 'protagonists', label: '主角', entryType: 'character', defaultGroup: '角色' },
      { key: 'majorSupporting', label: '重要配角', entryType: 'character', defaultGroup: '角色' },
      { key: 'npcs', label: 'NPC', entryType: 'character', defaultGroup: '角色' },
      { key: 'relationshipSummary', label: '关系摘要', entryType: 'lore', defaultGroup: '角色关系' }
    ]
  },
  {
    key: 'creativeRules',
    label: '创作规则',
    description: '文风、视角、基调、禁忌、一致性与参考作品',
    fields: [
      { key: 'writingStyle', label: '写作风格', entryType: 'style', defaultGroup: '文风约束' },
      { key: 'perspective', label: '叙事视角', entryType: 'style', defaultGroup: '文风约束' },
      { key: 'tone', label: '基调', entryType: 'style', defaultGroup: '文风约束' },
      { key: 'taboos', label: '禁忌', entryType: 'forbidden', defaultGroup: '禁写边界' },
      { key: 'consistency', label: '一致性规则', entryType: 'rule', defaultGroup: '硬约束' },
      { key: 'references', label: '参考作品', entryType: 'lore', defaultGroup: '参考' }
    ]
  }
]

export function createEmptyStructuredSettings() {
  return Object.fromEntries(
    SETTING_SECTIONS.map((section) => [
      section.key,
      Object.fromEntries(section.fields.map((field) => [field.key, '']))
    ])
  )
}

export function getSettingSection(sectionKey) {
  return SETTING_SECTIONS.find((section) => section.key === sectionKey) || null
}

export function getSettingField(sectionKey, fieldKey) {
  return getSettingSection(sectionKey)?.fields.find((field) => field.key === fieldKey) || null
}

export function normalizeStructuredSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const empty = createEmptyStructuredSettings()

  for (const section of SETTING_SECTIONS) {
    const sectionSource = source[section.key] && typeof source[section.key] === 'object'
      ? source[section.key]
      : {}
    for (const field of section.fields) {
      empty[section.key][field.key] = String(sectionSource[field.key] || '')
    }
  }

  return empty
}

export function summarizeStructuredSettings(settings, options = {}) {
  const normalized = normalizeStructuredSettings(settings)
  const lines = []
  const excluded = options.exclude || {}

  for (const section of SETTING_SECTIONS) {
    for (const field of section.fields) {
      if (excluded.sectionKey === section.key && excluded.fieldKey === field.key) continue
      const value = normalized[section.key][field.key].trim()
      if (!value) continue
      lines.push(`${field.label}：${value}`)
    }
  }

  return lines.join('\n')
}
```

- [ ] **Step 4: Run the schema tests**

Run:

```bash
npm run test:run -- src/__tests__/settingPanelSchema.test.js
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/settingPanelSchema.js src/__tests__/settingPanelSchema.test.js
git commit -m "feat: add structured setting schema"
```

### Task 2: Persist Structured Settings in World Store

**Files:**
- Modify: `src/stores/worldStore.js`
- Test: `src/__tests__/structuredSettingsStore.test.js`

- [ ] **Step 1: Write failing store tests**

```js
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorldStore } from '../stores/worldStore'

describe('structured settings in worldStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('creates a worldbook with normalized structured settings', async () => {
    const store = useWorldStore()
    const worldbook = await store.createWorldbook({ name: '测试世界' })

    expect(worldbook.structuredSettings.world.origin).toBe('')
    expect(worldbook.structuredSettings.story.logline).toBe('')
  })

  it('updates one structured setting field without replacing other fields', async () => {
    const store = useWorldStore()
    const worldbook = await store.createWorldbook({ name: '测试世界' })

    await store.updateStructuredSetting(worldbook.id, 'world', 'origin', '世界来自一场失败的封神。')
    await store.updateStructuredSetting(worldbook.id, 'story', 'theme', '自由与代价')

    expect(store.activeWorldbook.structuredSettings.world.origin).toBe('世界来自一场失败的封神。')
    expect(store.activeWorldbook.structuredSettings.story.theme).toBe('自由与代价')
    expect(store.activeWorldbook.structuredSettings.world.powerSystem).toBe('')
  })

  it('converts a structured field into a confirmed worldbook entry', async () => {
    const store = useWorldStore()
    const worldbook = await store.createWorldbook({ name: '测试世界' })

    await store.updateStructuredSetting(worldbook.id, 'creativeRules', 'taboos', '不要出现现代网络流行语。')
    const entry = await store.convertStructuredSettingToEntry(worldbook.id, 'creativeRules', 'taboos')

    expect(entry.name).toBe('禁忌')
    expect(entry.type).toBe('forbidden')
    expect(entry.content).toBe('不要出现现代网络流行语。')
    expect(entry.injection.mode).toBe('constant')
    expect(entry.injection.group).toBe('禁写边界')
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm run test:run -- src/__tests__/structuredSettingsStore.test.js
```

Expected: fail because store methods and normalized field do not exist.

- [ ] **Step 3: Update world store normalization**

In `src/stores/worldStore.js`, import schema helpers:

```js
import {
  getSettingField,
  normalizeStructuredSettings
} from '../services/settingPanelSchema'
```

In `normalizeWorldbook(raw = {})`, add:

```js
structuredSettings: normalizeStructuredSettings(source.structuredSettings),
```

In `createWorldbook(data = {})`, add:

```js
structuredSettings: normalizeStructuredSettings(data.structuredSettings),
```

- [ ] **Step 4: Add update and conversion actions**

Add these actions inside `actions` in `src/stores/worldStore.js`:

```js
async updateStructuredSetting(worldbookId, sectionKey, fieldKey, value) {
  let worldbook = this.activeWorldbook
  if (worldbook?.id !== worldbookId) {
    const raw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
    if (!raw) throw new Error('世界书不存在')
    worldbook = normalizeWorldbook(raw)
  }

  const field = getSettingField(sectionKey, fieldKey)
  if (!field) throw new Error('设定字段不存在')

  const structuredSettings = normalizeStructuredSettings(worldbook.structuredSettings)
  structuredSettings[sectionKey][fieldKey] = String(value || '')

  return this.updateWorldbook(worldbookId, { structuredSettings })
},

async convertStructuredSettingToEntry(worldbookId, sectionKey, fieldKey) {
  let worldbook = this.activeWorldbook
  if (worldbook?.id !== worldbookId) {
    const raw = decodeStored(getItem(WORLDBOOK_KEY_PREFIX + worldbookId), null)
    if (!raw) throw new Error('世界书不存在')
    worldbook = normalizeWorldbook(raw)
  }

  const field = getSettingField(sectionKey, fieldKey)
  if (!field) throw new Error('设定字段不存在')

  const structuredSettings = normalizeStructuredSettings(worldbook.structuredSettings)
  const content = structuredSettings[sectionKey][fieldKey].trim()
  if (!content) throw new Error('设定字段为空，不能转为世界书条目')

  const isConstant = ['rule', 'style', 'forbidden'].includes(field.entryType)
  return this.addEntry(worldbookId, {
    name: field.label,
    type: field.entryType,
    keys: [field.label],
    content,
    injection: {
      mode: isConstant ? 'constant' : 'selective',
      probability: 100,
      cooldown: 0,
      depth: isConstant ? 2 : 1,
      excludeRecursion: false,
      group: field.defaultGroup
    },
    relations: {
      tags: ['结构化设定'],
      locations: [],
      characters: [],
      events: []
    },
    metadata: {
      importSource: 'structured-setting',
      sourceSection: sectionKey,
      sourceField: fieldKey
    }
  })
},
```

- [ ] **Step 5: Run store tests**

Run:

```bash
npm run test:run -- src/__tests__/structuredSettingsStore.test.js
```

Expected: pass.

- [ ] **Step 6: Run existing worldbook tests**

Run:

```bash
npm run test:run -- src/__tests__/worldbookContextBuilder.test.js src/__tests__/worldbookDraftAssets.test.js
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/stores/worldStore.js src/__tests__/structuredSettingsStore.test.js
git commit -m "feat: persist structured worldbook settings"
```

### Task 3: Add Field-Level AI Draft Generation

**Files:**
- Create: `src/services/settingFieldGeneration.js`
- Test: `src/__tests__/settingFieldGeneration.test.js`

- [ ] **Step 1: Write failing generation tests**

```js
import { describe, expect, it, vi } from 'vitest'
import {
  buildSettingGenerationMessages,
  buildSettingPromptPreview,
  generateSettingFieldDraft
} from '../services/settingFieldGeneration'

vi.mock('../services/api', () => ({
  getResolvedApiSettings: vi.fn(async () => ({
    baseUrl: 'https://api.example.test',
    apiKey: 'test-key',
    model: 'test-model'
  }))
}))

vi.mock('../services/generationService', () => ({
  runGenerationTask: vi.fn(async () => ({
    success: true,
    content: '力量来自雾潮中残留的旧神姓名。'
  }))
}))

describe('settingFieldGeneration', () => {
  it('builds messages with existing structured context', () => {
    const messages = buildSettingGenerationMessages({
      worldbook: {
        name: '雾港',
        worldDescription: '夜雾会吞噬记忆。',
        structuredSettings: {
          world: { origin: '旧神死后形成雾潮。' },
          story: { theme: '记忆与代价' }
        }
      },
      sectionKey: 'world',
      fieldKey: 'powerSystem',
      userBrief: '偏克制，不要游戏数值感'
    })

    expect(messages[0].role).toBe('system')
    expect(messages[1].content).toContain('目标字段：力量体系')
    expect(messages[1].content).toContain('旧神死后形成雾潮。')
    expect(messages[1].content).toContain('偏克制，不要游戏数值感')
  })

  it('renders a prompt preview for the review panel', () => {
    const preview = buildSettingPromptPreview({
      worldbook: { name: '雾港', structuredSettings: { story: { logline: '书记官追查雾潮。' } } },
      sectionKey: 'story',
      fieldKey: 'coreConflict',
      userBrief: ''
    })

    expect(preview).toContain('目标字段：核心冲突')
    expect(preview).toContain('一句话故事：书记官追查雾潮。')
  })

  it('generates a plain draft string', async () => {
    const result = await generateSettingFieldDraft({
      worldbook: { name: '雾港', structuredSettings: {} },
      sectionKey: 'world',
      fieldKey: 'powerSystem',
      userBrief: ''
    })

    expect(result.ok).toBe(true)
    expect(result.content).toBe('力量来自雾潮中残留的旧神姓名。')
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm run test:run -- src/__tests__/settingFieldGeneration.test.js
```

Expected: fail because `settingFieldGeneration.js` does not exist.

- [ ] **Step 3: Implement generation service**

Create `src/services/settingFieldGeneration.js`:

```js
import { getResolvedApiSettings } from './api'
import { runGenerationTask } from './generationService'
import {
  getSettingField,
  getSettingSection,
  summarizeStructuredSettings
} from './settingPanelSchema'

function normalizeDraft(content) {
  return String(content || '')
    .replace(/^```[\s\S]*?\n?/, '')
    .replace(/```$/g, '')
    .trim()
}

export function buildSettingGenerationMessages({ worldbook, sectionKey, fieldKey, userBrief = '' }) {
  const section = getSettingSection(sectionKey)
  const field = getSettingField(sectionKey, fieldKey)
  if (!section || !field) throw new Error('设定字段不存在')

  const context = summarizeStructuredSettings(worldbook?.structuredSettings, {
    exclude: { sectionKey, fieldKey }
  })

  const userLines = [
    `世界书：${worldbook?.name || '未命名世界书'}`,
    worldbook?.worldDescription ? `基础世界设定：${worldbook.worldDescription}` : '',
    `设定分区：${section.label}`,
    `目标字段：${field.label}`,
    context ? `已填写设定：\n${context}` : '已填写设定：无',
    userBrief ? `用户补充要求：${userBrief}` : '',
    '',
    '请生成该字段内容。',
    '要求：',
    '1. 只输出可直接写入字段的正文。',
    '2. 不输出标题、解释、项目符号、Markdown 代码块。',
    '3. 保持与已填写设定一致，不制造冲突。',
    '4. 内容应具体，有可执行设定信息，避免空泛评价。'
  ].filter(Boolean)

  return [
    {
      role: 'system',
      content: '你是小说设定编辑，负责补全结构化世界书字段。输出必须克制、清晰、可直接保存。'
    },
    {
      role: 'user',
      content: userLines.join('\n')
    }
  ]
}

export function buildSettingPromptPreview(options) {
  return buildSettingGenerationMessages(options)
    .map((message) => `【${message.role}】\n${message.content}`)
    .join('\n\n')
}

export async function generateSettingFieldDraft(options) {
  const settings = await getResolvedApiSettings()
  if (!settings?.baseUrl || !settings?.apiKey || !settings?.model) {
    return { ok: false, reason: '未检测到可用 AI 配置。' }
  }

  const result = await runGenerationTask({
    taskType: `worldbook.setting.${options.sectionKey}.${options.fieldKey}`,
    baseMessages: buildSettingGenerationMessages(options),
    settings,
    generationOptions: {
      temperature: 0.45,
      max_tokens: 900,
      max_input_chars: 12000
    },
    attempts: [
      { name: 'setting-field-draft' }
    ],
    parseContent: normalizeDraft,
    isValidParsed: (text) => Boolean(String(text || '').trim())
  })

  if (!result?.success) {
    return { ok: false, reason: 'AI 未返回可用设定草稿。' }
  }

  return {
    ok: true,
    content: normalizeDraft(result.parsed || result.content)
  }
}
```

- [ ] **Step 4: Run generation tests**

Run:

```bash
npm run test:run -- src/__tests__/settingFieldGeneration.test.js
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/settingFieldGeneration.js src/__tests__/settingFieldGeneration.test.js
git commit -m "feat: add setting field draft generation"
```

### Task 4: Add Structured Settings UI Components

**Files:**
- Create: `src/components/worldbook/StructuredSettingsPanel.vue`
- Create: `src/components/worldbook/SettingFieldCard.vue`
- Create: `src/components/worldbook/SettingDraftReview.vue`
- Modify: `src/pages/WorldBookEditor.vue`

- [ ] **Step 1: Create `SettingDraftReview.vue`**

Use this component contract:

```vue
<template>
  <section v-if="draft" class="setting-draft-review">
    <div class="draft-head">
      <div>
        <p class="draft-kicker">AI 草稿</p>
        <h3>{{ draft.fieldLabel }}</h3>
      </div>
      <button class="ghost-btn small" @click="$emit('discard')">丢弃</button>
    </div>

    <textarea
      class="text-area"
      rows="8"
      :value="draft.content"
      @input="$emit('update:content', $event.target.value)"
    ></textarea>

    <details class="prompt-preview">
      <summary>查看本次提示词</summary>
      <pre>{{ draft.promptPreview }}</pre>
    </details>

    <div class="card-actions">
      <button class="primary-btn" @click="$emit('save-field')">采纳到字段</button>
      <button class="ghost-btn" @click="$emit('convert-entry')">转为世界书条目</button>
      <button class="ghost-btn" @click="$emit('copy')">复制</button>
    </div>
  </section>
</template>

<script setup>
defineProps({
  draft: {
    type: Object,
    default: null
  }
})

defineEmits(['discard', 'update:content', 'save-field', 'convert-entry', 'copy'])
</script>
```

- [ ] **Step 2: Create `SettingFieldCard.vue`**

Use this component contract:

```vue
<template>
  <article class="setting-field-card">
    <div class="field-head">
      <div>
        <h3>{{ field.label }}</h3>
        <span>{{ section.label }} / {{ field.defaultGroup }}</span>
      </div>
      <div class="field-actions">
        <button class="ghost-btn small" :disabled="working" @click="$emit('generate', payload)">生成</button>
        <button class="ghost-btn small" :disabled="working || !modelValue" @click="$emit('convert-entry', payload)">转条目</button>
      </div>
    </div>

    <textarea
      class="text-area"
      rows="5"
      :placeholder="`填写${field.label}`"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
      @blur="$emit('save', payload)"
    ></textarea>
  </article>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  section: { type: Object, required: true },
  field: { type: Object, required: true },
  modelValue: { type: String, default: '' },
  working: { type: Boolean, default: false }
})

defineEmits(['update:modelValue', 'save', 'generate', 'convert-entry'])

const payload = computed(() => ({
  sectionKey: props.section.key,
  fieldKey: props.field.key
}))
</script>
```

- [ ] **Step 3: Create `StructuredSettingsPanel.vue`**

The component must:

- Render section tabs from `SETTING_SECTIONS`.
- Keep an editable local copy of `activeWorldbook.structuredSettings`.
- Save field changes through `worldStore.updateStructuredSetting`.
- Generate drafts through `generateSettingFieldDraft`.
- Show draft through `SettingDraftReview`.
- Convert confirmed field or draft through `worldStore.convertStructuredSettingToEntry`.

Implementation outline:

```vue
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

async function saveDraftToField() {
  if (!draft.value) return
  form[draft.value.sectionKey][draft.value.fieldKey] = draft.value.content
  await saveField(draft.value)
  draft.value = null
}

async function convertCurrentField(payload) {
  await saveField(payload)
  await worldStore.convertStructuredSettingToEntry(props.worldbook.id, payload.sectionKey, payload.fieldKey)
  feedback.value = '已转为世界书条目'
}
</script>
```

Use existing button classes (`primary-btn`, `ghost-btn`, `text-area`) and add only scoped layout classes.

- [ ] **Step 4: Mount the panel in `WorldBookEditor.vue`**

Add import:

```js
import StructuredSettingsPanel from '../components/worldbook/StructuredSettingsPanel.vue'
```

Add a tab state:

```js
const editorTab = ref('base')
const editorTabs = [
  { key: 'base', label: '基础设定' },
  { key: 'structured', label: '结构化设定' },
  { key: 'transfer', label: '导入导出' },
  { key: 'groups', label: '分组管理' },
  { key: 'entries', label: '条目管理' }
]
```

Render tab buttons above the existing cards:

```vue
<nav class="editor-tabs" aria-label="世界书编辑分区">
  <button
    v-for="tab in editorTabs"
    :key="tab.key"
    :class="['editor-tab', { active: editorTab === tab.key }]"
    @click="editorTab = tab.key"
  >
    {{ tab.label }}
  </button>
</nav>
```

Wrap existing sections with `v-if`:

```vue
<section v-if="editorTab === 'base'" class="card">...</section>
<StructuredSettingsPanel
  v-if="editorTab === 'structured'"
  :worldbook="activeWorldbook"
/>
<section v-if="editorTab === 'transfer'" class="card">...</section>
<section v-if="editorTab === 'groups'" class="card">...</section>
<section v-if="editorTab === 'entries'" class="card">...</section>
```

- [ ] **Step 5: Add scoped styles**

Add styles inside `WorldBookEditor.vue` and the new components. Keep them consistent with existing cards:

```css
.editor-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.editor-tab {
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border-radius: 6px;
  padding: 7px 10px;
  cursor: pointer;
}

.editor-tab.active {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 9%, var(--bg-secondary));
}
```

- [ ] **Step 6: Run build**

Run:

```bash
npm run build
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/worldbook src/pages/WorldBookEditor.vue
git commit -m "feat: add structured settings panel"
```

### Task 5: Include Structured Settings in Worldbook Context

**Files:**
- Modify: `src/services/worldbookContextBuilder.js`
- Test: `src/__tests__/worldbookContextBuilder.test.js`

- [ ] **Step 1: Add failing context test**

Append:

```js
it('includes concise structured settings before matched entries', () => {
  const result = buildWorldbookContext({
    worldbook: {
      name: '雾港',
      worldDescription: '雾港每夜失去一段记忆。',
      structuredSettings: {
        story: { logline: '书记官追查吞噬姓名的雾。' },
        creativeRules: { consistency: '所有魔法都必须付出记忆代价。' }
      },
      entries: []
    },
    inputText: '书记官走进雾港。',
    recentMessages: [],
    runtimeState: {},
    maxChars: 2000
  })

  expect(result.contextText).toContain('【结构化设定】')
  expect(result.contextText).toContain('一句话故事：书记官追查吞噬姓名的雾。')
  expect(result.contextText).toContain('一致性规则：所有魔法都必须付出记忆代价。')
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm run test:run -- src/__tests__/worldbookContextBuilder.test.js
```

Expected: fail because structured settings are not included.

- [ ] **Step 3: Add concise structured settings context**

In `src/services/worldbookContextBuilder.js`, import:

```js
import { summarizeStructuredSettings } from './settingPanelSchema'
```

After base world description/style/forbidden/example blocks and before matched entry blocks, add:

```js
const structuredSummary = summarizeStructuredSettings(worldbook.structuredSettings)
if (structuredSummary) {
  const text = `\n\n【结构化设定】\n${structuredSummary}`
  if (usedChars + text.length <= maxChars) {
    parts.push(text)
    usedChars += text.length
  } else {
    warnings.push('structured-settings-truncated')
  }
}
```

If local variable names differ, preserve the existing budget accounting style in the file.

- [ ] **Step 4: Add warning label**

In `describeWorldbookWarning(code)`, add:

```js
'structured-settings-truncated': '结构化设定因预算不足被截断',
```

- [ ] **Step 5: Run context tests**

Run:

```bash
npm run test:run -- src/__tests__/worldbookContextBuilder.test.js
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/worldbookContextBuilder.js src/__tests__/worldbookContextBuilder.test.js
git commit -m "feat: inject structured settings into worldbook context"
```

### Task 6: Final Verification

**Files:**
- No new files
- Verify all changed behavior

- [ ] **Step 1: Run focused tests**

```bash
npm run test:run -- src/__tests__/settingPanelSchema.test.js src/__tests__/settingFieldGeneration.test.js src/__tests__/structuredSettingsStore.test.js src/__tests__/worldbookContextBuilder.test.js
```

Expected: all pass.

- [ ] **Step 2: Run full test suite**

```bash
npm run test:run
```

Expected: all pass.

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected: pass.

- [ ] **Step 4: Manual smoke check**

Use the already running dev server:

1. Open worldbook advanced editor.
2. Select an existing worldbook or create one.
3. Click `结构化设定`.
4. Fill `世界观 / 世界起源`.
5. Leave the field and confirm it persists after switching tabs.
6. Click `生成` for `力量体系`.
7. Confirm an AI draft appears in the review panel.
8. Click `采纳到字段`.
9. Click `转为世界书条目`.
10. Switch to `条目管理` and confirm the entry exists with type `设定` or `规则` based on the field.
11. Start a chat generation that uses the active worldbook and confirm the context preview includes `【结构化设定】`.

- [ ] **Step 5: Commit verification fixes if needed**

If verification required fixes:

```bash
git add src docs/plan/storyforge-setting-panel.md
git commit -m "fix: stabilize structured setting panel"
```

If no fixes were needed, do not create an empty commit.

## 6. Risk Controls

- No silent write: AI draft never writes directly to fields or entries.
- No duplicate system: structured settings are an authoring layer; normal worldbook entries remain the injection layer.
- No new dependency: use current Vue, Pinia, and generation services.
- No full StoryForge clone: prompt template library, workflow engine, Dexie tables, and master study are out of scope.
- No backend dependency: generation uses existing resolved API settings.
- No overlong context: structured settings enter context through concise summaries and budget checks.

## 7. Acceptance Criteria

The plan is complete when:

1. A user can open the advanced worldbook editor and see a `结构化设定` tab.
2. The tab contains world, story, character, and creative rule sections.
3. Each field can be edited and persisted in the active worldbook.
4. Each field can request an AI draft through the existing generation task layer.
5. Generated drafts show a prompt preview and require user confirmation before saving.
6. A confirmed field can be converted into a normal worldbook entry.
7. Chat/worldbook context can include concise structured settings.
8. Focused tests, full tests, and production build pass.

## 8. Deferred Work

These are intentionally excluded from this implementation:

- Prompt template marketplace or clone/edit template library.
- Genre pack hot switching.
- Multi-step起书 workflow runner.
- Million-word chunk import resume system.
- Master study and method library.
- Dexie migration.
- Rich text editor migration.
- Character relationship force graph.
