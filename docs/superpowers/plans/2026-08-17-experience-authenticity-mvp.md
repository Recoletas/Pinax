# Experience Authenticity MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Experience narration authenticity with bounded character voice anchors, on-demand political grounding, and a non-blocking shadow critic that measures quality without rewriting visible prose.

**Architecture:** Character entries retain a small structured voice profile, but only the selected speaker’s profile enters the Narrative Kernel. Existing runtime relations/facts are projected into the read-only narrative resource index and exposed through `politics_lookup` only after a successful `world_lookup` in the same turn. The critic runs after visible text is emitted on an independent bounded queue, stores only allowlisted identifiers/counts/scores/flags, and can never change or fail the committed narrative path.

**Tech Stack:** Vue 3, Pinia, existing Narrative Kernel/transcript/tool runtime, streaming provider adapters, localStorage metrics, Vitest, Vite, VitePress.

---

## Scope

This MVP includes:

- top-level character-entry `speechStyle` and `samples[]` fields;
- bounded import/edit/persistence of voice samples;
- selected-speaker-only voice injection in the `cast` Kernel block;
- read-only `politics_lookup(current|get|trace)` over existing faction, character-relation, place-control, and canonical-fact state;
- a strict `world_lookup -> politics_lookup` activation chain;
- deterministic 25% shadow-critic sampling across anchored and unanchored turns;
- critic metrics with no raw prose, prompts, API keys, or rewrite text;
- synthetic contract verification plus existing real-provider release scripts.

This MVP explicitly excludes:

- automatic critic rewrites or retries;
- voice-type pools, response graphs, tone wheels, TTS/audio signatures, glossary locks, translation policy, detector-driven “AI flavor” optimization, or best-of-N sampling;
- new world-state schemas or political mutations;
- Experience page status pills, settings toggles, or other UI changes;
- deletion/GC, snapshot slimming, dialogue CSS ownership, mobile layout, online protocol, or WNB writing-unit work.

## Parallel execution contract

This plan runs beside `docs/superpowers/plans/2026-08-17-wnb-6a-writing-unit-v3.md` from the same baseline commit.

- Experience branch: `feature/experience-authenticity-mvp`.
- WNB branch: `feature/wnb-6a-writing-unit-v3`.
- Experience exclusively owns `src/pages/WorldBookEditor.vue`, `src/stores/gameStore.js`, `src/services/characterCard.js`, the new voice/critic files, narrative Kernel/resource/tool/orchestrator services and contracts, `src/composables/useStorage.js`, `src/__tests__/agentContracts.test.js`, and `src/__tests__/worldBookQuickImport.test.js`.
- Experience must not edit `src/pages/Experience.vue`, `src/components/GamePanel.vue`, `src/components/experience/NarrativeTurn.vue`, `src/pages/Writing.vue`, `src/components/writing/**`, writing services/contracts, `src/__tests__/integration.test.js`, `src/__tests__/gameStoreSession.test.js`, `src/__tests__/uiControlContract.test.js`, or `scripts/ui-audit.mjs`.
- The committed message/turn interface is frozen: do not rename or reinterpret `message.id`, `message.role`, `message.content`, `message.branchId`, `turnRecord.id`, `turnRecord.status`, or `turnRecord.assistantMessageIds`.
- Critic metadata lives outside messages and turn records. WNB imports exactly the same visible assistant content whether the critic runs, skips, times out, or returns invalid output.
- Neither worker updates canonical status/plan/log/roadmap files. Each produces a unique branch summary; the integration owner updates shared docs after both merges pass combined verification.

## Locked contracts

### Character voice profile

```js
{
  speechStyle: '句子短，措辞克制；拒绝回答时先重复对方的关键词。',
  samples: [
    '先把舱门关上。这里不是谈忠诚的地方。',
    '你问的是信号，我能确认的也只有信号。'
  ]
}
```

Limits:

```js
export const NARRATIVE_VOICE_LIMITS = Object.freeze({
  maxStoredSamples: 6,
  maxStoredSampleChars: 240,
  maxSpeechStyleChars: 240,
  maxKernelSamples: 3,
  maxKernelVoiceChars: 720
})
```

Only user-authored/imported entry fields are voice anchors. Generated assistant replies are never promoted into `samples[]` automatically.

### Political resource

```js
{
  id: 'faction:港务议会',
  domain: 'politics',
  type: 'faction-relation',
  title: '港务议会',
  summary: '当前关系值：-35',
  relations: [],
  sourceRefs: ['runtime-state:factionRelations:港务议会'],
  trust: 'runtime-confirmed',
  conflictState: 'clean'
}
```

`politics_lookup` has actions `current`, `get`, and `trace`. It is read-only and returns the same bounded tool-result envelope as other narrative tools.

### Shadow critic verdict

```js
{
  schemaVersion: 1,
  pass: true,
  scores: {
    voiceConsistency: 4, // null when no voice anchor exists
    grounding: 4,       // null when no political evidence is relevant
    continuity: 3,
    readability: 4
  },
  flags: ['minor-register-drift'],
  reason: '角色措辞基本符合样例；结尾略偏解释性。'
}
```

The verdict `reason` is transient diagnostic output and is not persisted because a model could echo source prose into it. The stored metric contains only `runId`, timestamp, provider/model identifiers, text length, `voiceVariant`, `politicsVariant`, scores, flags, critic duration/outcome, and token usage. It never stores raw narrative text, content-derived fingerprints, sample text, prompts, verdict reasons, credentials, or a rewritten draft.

## File map

**Create**

- `src/services/narrativeVoiceProfile.js` — normalize/import bounded character voice profiles.
- `src/services/agents/tools/politicsLookup.js` — read-only current/get/trace executor.
- `src/services/agents/narrativeCritic.js` — rubric, strict verdict parser, sampling, detached queue, and bounded provider call.
- `src/services/agents/narrativeCriticMetrics.js` — capped privacy-safe critic metrics.
- `docs/agent-runs/2026-08-17-wnb-experience-parallel/experience-authenticity-summary.md` — branch handoff.

**Modify**

- `src/services/characterCard.js` — carry `speechStyle`, `samples`, and compatible `mes_example` inputs.
- `src/pages/WorldBookEditor.vue` — character-only voice editor with six bounded samples.
- `src/services/agents/narrativeKernel.js` — selected-speaker-only voice injection and metadata.
- `shared/narrativeAgentContract.js` — `politics_lookup` contract, validation, activation, and catalog.
- `src/services/agents/narrativeResourceIndex.js` — political resource projection, revision, counts, and trace.
- `src/services/agents/narrativeToolRegistry.js` — politics executor/domain registration.
- `src/services/agents/narrativeAgentOrchestrator.js` — chained tool exposure and detached critic scheduling.
- `src/stores/gameStore.js` — pass existing runtime political state into Kernel/resource snapshot; do not change message/turn shapes.
- `src/composables/useStorage.js` — critic metric storage key only.
- `src/__tests__/worldBookQuickImport.test.js` — extend existing character-card/editor test; add no new `it()`.
- `src/__tests__/agentContracts.test.js` — extend the existing narrative contract test; add no new `it()`.

## Task 0: Establish the shared baseline and isolated worktree

**Files:**

- Read: `docs/STATUS.md`
- Read: `LOCAL.md`
- Read: `docs/superpowers/research/experience-authenticity-20260817.md`
- Read: `docs/agent-runs/2026-08-17-wnb-experience-parallel/current.md`
- No source edits

- [ ] **Step 1: Verify the orchestration board has a concrete baseline**

Run:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
sed -n '1,180p' docs/agent-runs/2026-08-17-wnb-experience-parallel/current.md
```

Expected: the shared worktree’s dirty state is visible and the board contains a concrete baseline commit. If it says `blocked-on-baseline`, stop; do not create a worktree from `00dd965` or older commits because current worldbook/Experience prerequisites would be missing.

- [ ] **Step 2: Create the isolated feature worktree**

Use `using-git-worktrees` to create:

```text
/home/recoletas/jiuguan/worktrees/pinax-experience-authenticity
feature/experience-authenticity-mvp
```

from the exact baseline recorded on the board.

Expected: `git status --short` is empty inside the new worktree and `git rev-parse HEAD` equals the board baseline.

- [ ] **Step 3: Capture the focused baseline**

Run:

```bash
npm run verify:contract -- src/__tests__/agentContracts.test.js src/__tests__/worldBookQuickImport.test.js
```

Expected: exit 0. Record current test counts without adding new test cases beyond the repository’s 200-test ceiling.

## Task 1: Normalize and round-trip character voice profiles

**Files:**

- Create: `src/services/narrativeVoiceProfile.js`
- Modify: `src/services/characterCard.js`
- Modify: `src/__tests__/worldBookQuickImport.test.js`

- [ ] **Step 1: Extend the existing character-card assertion with voice inputs**

Inside the existing `worldBookQuickImport.test.js` test that already asserts `parseCharacterCards`, replace its simple fixture with:

```js
expect(parseCharacterCards(JSON.stringify({
  name: '陆沉',
  identity: '巡夜人',
  personality: '克制、敏锐',
  goal: '查明旧案',
  speechStyle: '短句，先复述事实再下判断',
  mes_example: '<START>\nUser: 你相信谁？\n陆沉: 我只相信能复核的记录。\n<START>\nUser: 现在怎么办？\n陆沉: 先关门，再谈下一步。'
}))).toMatchObject([{
  name: '陆沉',
  traits: ['克制', '敏锐'],
  goal: '查明旧案',
  speechStyle: '短句，先复述事实再下判断',
  samples: ['我只相信能复核的记录。', '先关门，再谈下一步。']
}])
```

In the existing static `WorldBookEditor.vue` source assertion, add checks for `entryForm.speechStyle`, `entryForm.samples`, `addVoiceSample`, and `removeVoiceSample`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm run test:run -- src/__tests__/worldBookQuickImport.test.js
```

Expected: FAIL because parsed cards drop structured voice fields and the editor lacks sample controls.

- [ ] **Step 3: Implement the reusable voice normalizer**

Create `narrativeVoiceProfile.js`:

```js
export const NARRATIVE_VOICE_LIMITS = Object.freeze({
  maxStoredSamples: 6,
  maxStoredSampleChars: 240,
  maxSpeechStyleChars: 240,
  maxKernelSamples: 3,
  maxKernelVoiceChars: 720
})

const clean = (value, limit) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)

function sampleText(value) {
  return clean(typeof value === 'string' ? value : value?.text, NARRATIVE_VOICE_LIMITS.maxStoredSampleChars)
}

export function extractMesExampleSamples(value, characterName = '') {
  const name = clean(characterName, 120)
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => {
      const match = line.match(/^([^:：]{1,80})\s*[:：]\s*(.+)$/)
      if (!match) return ''
      const speaker = clean(match[1], 80).replace(/^\{\{char\}\}$/i, name)
      return !name || speaker === name ? sampleText(match[2]) : ''
    })
    .filter(Boolean)
}

export function normalizeNarrativeVoiceProfile(input = {}, characterName = '') {
  const source = input?.voice && typeof input.voice === 'object' ? { ...input, ...input.voice } : input
  const rawSamples = Array.isArray(source?.samples)
    ? source.samples
    : extractMesExampleSamples(source?.mes_example ?? source?.mesExample, characterName)
  const samples = [...new Set(rawSamples.map(sampleText).filter(Boolean))]
    .slice(0, NARRATIVE_VOICE_LIMITS.maxStoredSamples)
  return {
    speechStyle: clean(source?.speechStyle ?? source?.speakingStyle, NARRATIVE_VOICE_LIMITS.maxSpeechStyleChars),
    samples
  }
}

export function toKernelVoiceProfile(input = {}, characterName = '') {
  const profile = normalizeNarrativeVoiceProfile(input, characterName)
  let used = profile.speechStyle.length
  const samples = []
  for (const sample of profile.samples.slice(0, NARRATIVE_VOICE_LIMITS.maxKernelSamples)) {
    if (used + sample.length > NARRATIVE_VOICE_LIMITS.maxKernelVoiceChars) break
    samples.push(sample)
    used += sample.length
  }
  return { speechStyle: profile.speechStyle, samples }
}
```

- [ ] **Step 4: Carry voice fields through character-card parsing**

In `characterCard.js`, import `normalizeNarrativeVoiceProfile`. `fromObject` returns:

```js
const voice = normalizeNarrativeVoiceProfile(source, name)
return {
  name,
  gender: text(source.gender),
  age: text(source.age),
  traits,
  description: text(source.description || source.persona) || description,
  goal: text(source.goal || source.motivation),
  greeting: text(source.greeting),
  mood: Number.isFinite(Number(source.mood)) ? Math.max(0, Math.min(100, Number(source.mood))) : 50,
  speechStyle: voice.speechStyle,
  samples: voice.samples
}
```

Add `samples` aliases `['示例台词', '台词样例', 'samples', 'mesexample']`. Repeated labeled sample lines append with `\n` during parsing and are split into sample values before normalization. Do not infer samples from `description`, `greeting`, or model-generated messages.

- [ ] **Step 5: Verify the parser contract**

Run:

```bash
npm run test:run -- src/__tests__/worldBookQuickImport.test.js
```

Expected: the parser assertions pass; the static editor assertions still fail until Task 2.

- [ ] **Step 6: Commit the normalization slice**

Invoke `testing-verification` and `commit-conventions`.

```bash
git add src/services/narrativeVoiceProfile.js src/services/characterCard.js src/__tests__/worldBookQuickImport.test.js
git commit -m "feat(experience): normalize character voice profiles"
```

## Task 2: Add bounded voice authoring and selected-speaker Kernel injection

**Files:**

- Modify: `src/pages/WorldBookEditor.vue`
- Modify: `src/services/agents/narrativeKernel.js`
- Modify: `src/__tests__/worldBookQuickImport.test.js`
- Modify: `src/__tests__/agentContracts.test.js`

- [ ] **Step 1: Extend existing Kernel fixtures with speaker and non-speaker voice data**

In the existing narrative Kernel test, add `speechStyle` and `samples` to the existing `entry-chu`, then append `entry-lu` (do not create a second `entry-chu`):

```js
{
  id: 'entry-lu',
  type: 'character',
  name: '陆晨曦',
  content: '身份：工程师。',
  speechStyle: '语速快，常用反问',
  samples: ['你真觉得这是巧合？']
}
```

Add these fields to the existing `entry-chu` object:

```js
speechStyle: '短句，先确认事实，不使用感叹句',
samples: ['先报坐标。', '结论之后再谈责任。', '我需要能复核的记录。']
```

Add `dialogueCharacter: { id: 'entry-chu', name: '褚岩' }` to `narrativeRuntime`, add 陆晨曦 to `encounteredCharacters`, rebuild `narrativeKernel`, then assert:

```js
const cast = narrativeKernel.blocks.find((block) => block.kind === 'cast').content.members
const speaker = cast.find((member) => member.role === 'speaker')
const nonSpeaker = cast.find((member) => member.name === '陆晨曦')
expect(speaker.voice).toEqual({
  speechStyle: '短句，先确认事实，不使用感叹句',
  samples: ['先报坐标。', '结论之后再谈责任。', '我需要能复核的记录。']
})
expect(nonSpeaker.voice).toBeUndefined()
expect(narrativeKernel.voice).toMatchObject({ anchored: true, speakerId: speaker.speakerId, sampleCount: 3 })
```

- [ ] **Step 2: Run both focused files and verify they fail**

Run:

```bash
npm run test:run -- src/__tests__/worldBookQuickImport.test.js src/__tests__/agentContracts.test.js
```

Expected: FAIL on missing editor state and missing speaker voice data.

- [ ] **Step 3: Add character-only voice controls to WorldBookEditor**

Extend `entryForm` with `speechStyle: ''` and `samples: []`; sync/reset/save those fields through `normalizeNarrativeVoiceProfile`. Render this section only for `entryForm.type === 'character'`:

```vue
<section v-if="entryForm.type === 'character'" class="entry-voice-editor" aria-labelledby="entry-voice-title">
  <header>
    <h3 id="entry-voice-title">角色声口</h3>
    <span>{{ entryForm.samples.length }}/6</span>
  </header>
  <label>
    说话方式
    <textarea v-model="entryForm.speechStyle" rows="3" maxlength="240" placeholder="句长、措辞、回避或强调习惯"></textarea>
  </label>
  <label v-for="(_sample, index) in entryForm.samples" :key="index">
    示例台词 {{ index + 1 }}
    <span class="entry-voice-editor__sample">
      <textarea v-model="entryForm.samples[index]" rows="2" maxlength="240"></textarea>
      <button type="button" @click="removeVoiceSample(index)">移除</button>
    </span>
  </label>
  <button v-if="entryForm.samples.length < 6" type="button" @click="addVoiceSample">添加示例台词</button>
</section>
```

The UI is continuous with the existing entry editor: no card shadow, modal, voice-generation button, or permanent Experience-page control. At save time, trim/dedupe samples and drop blank rows.

- [ ] **Step 4: Inject only the selected speaker’s bounded profile**

In `narrativeKernel.js`, import `toKernelVoiceProfile`. Preserve voice fields when mapping character entries, then add `voice` only in the speaker branch:

```js
const voice = toKernelVoiceProfile(entry, member.name)
return {
  ...publicMember,
  role: isSpeaker ? 'speaker' : 'scene',
  ...(isSpeaker
    ? {
        characterCard: entry.content,
        selectionReason,
        ...(voice.speechStyle || voice.samples.length ? { voice } : {})
      }
    : { selectionReason: 'present-in-scene' })
}
```

Expose low-sensitive Kernel metadata outside the blocks:

```js
const voiceSpeaker = cast.find((member) => member.role === 'speaker' && member.voice)
// in returned Kernel
voice: voiceSpeaker
  ? { anchored: true, speakerId: voiceSpeaker.speakerId, sampleCount: voiceSpeaker.voice.samples.length }
  : { anchored: false, speakerId: null, sampleCount: 0 }
```

Do not put sample text in trace, metrics, context ledger, or turn receipts. The cast block’s existing 1200-character cap remains authoritative.

- [ ] **Step 5: Verify voice persistence, privacy, and Kernel bounds**

Run:

```bash
npm run test:run -- src/__tests__/worldBookQuickImport.test.js src/__tests__/agentContracts.test.js
```

Expected: PASS; only the selected speaker has `voice`, no more than three samples reach the Kernel, and the editor source contains all four required voice-control identifiers.

- [ ] **Step 6: Commit the voice slice**

Invoke `ui-style-check`, `testing-verification`, and `commit-conventions`.

```bash
git add src/pages/WorldBookEditor.vue src/services/agents/narrativeKernel.js src/__tests__/worldBookQuickImport.test.js src/__tests__/agentContracts.test.js
git commit -m "feat(experience): anchor narrator to speaker samples"
```

## Task 3: Project existing runtime politics into the resource index

**Files:**

- Modify: `src/stores/gameStore.js`
- Modify: `src/services/agents/narrativeResourceIndex.js`
- Modify: `src/__tests__/agentContracts.test.js`

- [ ] **Step 1: Extend the existing resource-index fixture**

In the existing narrative contract test, create a named political fixture so Tasks 3–5 can reuse it without undeclared helpers:

```js
var politicalWorldbook = {
  ...narrativeWorldbook,
  entries: narrativeWorldbook.entries.concat({
    id: 'entry-council',
    name: '港务议会',
    type: 'organization',
    keys: ['议会', '港务议会'],
    content: '港务议会控制港口，并与巡灯人同盟公开敌对。'
  })
}
var politicalRuntime = {
  factionRelations: { '港务议会': -35, '巡灯人同盟': 60 },
  characterRelations: {
    'relation:lu-chu': {
      subjectId: 'entry-lu', objectId: 'entry-chu', kind: 'guardian', status: 'confirmed',
      sourceRefs: ['runtime-event:relation-confirmed']
    }
  },
  canonicalFacts: {
    'fact:harbor-control': {
      subjectId: 'place-harbor', predicate: 'controller', value: '港务议会', status: 'confirmed',
      confidence: 0.9, sourceRefs: ['runtime-event:harbor-control']
    }
  },
  placeStates: {
    'place-harbor': { status: '戒严', controllerId: '港务议会', danger: 72 }
  },
  worldMapState: { placeId: 'place-harbor' },
  dialogueCharacter: { id: 'entry-chu', name: '褚岩' },
  encounteredCharacters: [{ id: 'entry-chu', name: '褚岩' }]
}
var politicalSnapshot = {
  projectId: 'wb-politics',
  sessionId: 'session-politics',
  worldbook: politicalWorldbook,
  runtimeState: politicalRuntime,
  memories: []
}
var politicalIndex = createNarrativeResourceIndex(politicalSnapshot)
```

Assert `index.counts.politics === 5`, all political resources use `domain: 'politics'`, confirmed event-backed items are eligible evidence, and the revision changes when a faction score changes.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm run test:run -- src/__tests__/agentContracts.test.js
```

Expected: FAIL because the index ignores runtime political state.

- [ ] **Step 3: Implement political resource projection**

In `narrativeResourceIndex.js`, add `politicsResources(runtimeState)` that returns:

- one `faction-relation` item per bounded faction score;
- one `character-relation` item per normalized relationship;
- one `canonical-fact` item per confirmed/disputed fact;
- one `place-control` item per controlled/status-bearing place.

Use stable IDs and relations:

```js
resource({
  id: `faction:${name}`,
  domain: 'politics',
  type: 'faction-relation',
  title: name,
  summary: `当前关系值：${score}`,
  aliases: [name],
  sourceRefs: [`runtime-state:factionRelations:${name}`],
  trust: 'runtime-confirmed'
})
```

Character relations link subject/object; facts link subject and scalar object where applicable; place control links place and controller. Cap each collection at 32 before global tool-result limits.

Add normalized political state to `createNarrativeResourceSnapshotRevision`, include the resources in `createNarrativeResourceIndex`, and add `politics` to `counts`. Never mutate the input runtime state.

- [ ] **Step 4: Pass existing state into Kernel and resource snapshots**

In `gameStore.js`, add `factionRelations: this.factionRelations` to the existing Kernel runtime input. Add a `runtimeState` object to `getNarrativeResourceIndex` containing only:

```js
{
  factionRelations: this.factionRelations,
  characterRelations: this.characterRelations,
  canonicalFacts: this.canonicalFacts,
  placeStates: this.placeStates,
  worldMapState: this.worldMapState
}
```

Do not change session persistence, message creation, turn records, or commit order.

- [ ] **Step 5: Verify deterministic index behavior**

Run:

```bash
npm run test:run -- src/__tests__/agentContracts.test.js
```

Expected: PASS; political resources are stable, revision-sensitive, read-only, and included in counts.

- [ ] **Step 6: Commit the resource projection**

Invoke `testing-verification` and `commit-conventions`.

```bash
git add src/stores/gameStore.js src/services/agents/narrativeResourceIndex.js src/__tests__/agentContracts.test.js
git commit -m "feat(experience): index runtime political state"
```

## Task 4: Add chained `politics_lookup` activation

**Files:**

- Create: `src/services/agents/tools/politicsLookup.js`
- Modify: `shared/narrativeAgentContract.js`
- Modify: `src/services/agents/narrativeToolRegistry.js`
- Modify: `src/services/agents/narrativeResourceIndex.js`
- Modify: `src/services/agents/narrativeKernel.js`
- Modify: `src/services/agents/narrativeAgentOrchestrator.js`
- Modify: `src/__tests__/agentContracts.test.js`

- [ ] **Step 1: Extend existing tool-contract and loop assertions**

In the existing narrative contract test, assert:

```js
expect(resolveNarrativeActiveToolNames('港务议会与巡灯人同盟现在是敌对阵营吗？', {
  hasPolitics: true
})).toContain('politics_lookup')
expect(validateNarrativeToolInput('politics_lookup', {
  action: 'trace', ids: ['faction:港务议会'], limit: 4
}).valid).toBe(true)
```

Run a loop whose decision runner records tool names per request:

```js
var politicalKernel = buildNarrativeKernel({
  worldbook: politicalWorldbook,
  runtimeState: politicalRuntime,
  messages: [{
    id: 'politics-question',
    role: 'user',
    content: '港务议会与巡灯人同盟现在是敌对阵营吗？'
  }],
  projectId: 'wb-politics',
  sessionId: 'session-politics'
})
var politicalRegistry = createNarrativeToolRegistry({
  index: politicalIndex,
  projectId: 'wb-politics',
  sessionId: 'session-politics',
  currentPlaceId: 'place-harbor'
})
var validBeatPlan = {
  responseObligation: '回答两个组织当前是否敌对',
  causalSteps: ['核对世界书组织条目', '核对当前政治关系'],
  revealOrChange: '明确当前控制权与敌对关系',
  endCondition: '给出有依据的当前判断'
}
var catalogs = []
var step = 0
var politicsRun = await runNarrativeAgentLoop({
  kernel: politicalKernel,
  registry: politicalRegistry,
  requestId: 'politics-chain',
  decisionRunner: async (request) => {
    catalogs.push(request.tools.map((tool) => tool.name))
    step += 1
    if (step === 1) return { kind: 'tool_calls', calls: [{ id: 'plan', name: 'submit_narrative_beat_plan', arguments: validBeatPlan }] }
    if (step === 2) return { kind: 'tool_calls', calls: [{ id: 'world', name: 'world_lookup', arguments: { action: 'search', query: '港务议会', limit: 2 } }] }
    if (step === 3) return { kind: 'tool_calls', calls: [{ id: 'politics', name: 'politics_lookup', arguments: { action: 'trace', ids: ['faction:港务议会'], limit: 4 } }] }
    return { kind: 'final_ready', text: '议会仍控制港口，但巡灯人同盟已经公开拒绝协助。', calls: [] }
  }
})
expect(catalogs[0]).not.toContain('politics_lookup')
expect(catalogs[1]).not.toContain('politics_lookup')
expect(catalogs[2]).toContain('politics_lookup')
expect(politicsRun.trace.calls.map((call) => call.name)).toContain('politics_lookup')
```

Keep these assertions inside the existing narrative contract `it()`; do not add a new test case.

- [ ] **Step 2: Run the focused test and verify the tool is missing**

Run:

```bash
npm run test:run -- src/__tests__/agentContracts.test.js
```

Expected: FAIL because the politics contract/executor and chain gate do not exist.

- [ ] **Step 3: Add the shared tool contract and activation rule**

Add to `NARRATIVE_READ_TOOLS`:

```js
politics_lookup: Object.freeze({
  actions: Object.freeze(['current', 'get', 'trace']),
  description: '查询当前势力关系、人物关系、地点控制和已确认政治事实。必须先核对相关世界书条目。'
})
```

Validation rules:

- `current` accepts optional filters and no query/IDs;
- `get` and `trace` require IDs;
- all existing cursor, limit, ID, filter, and result bounds apply.

In `resolveNarrativeActiveToolNames`, add `politics_lookup` only when `options.hasPolitics === true` and input matches `/势力|派系|同盟|敌对|外交|联盟|阵营|控制权|领主|议会/`.

- [ ] **Step 4: Implement the executor and registry domain**

Create `politicsLookup.js`:

```js
import {
  getNarrativeResources,
  getCurrentNarrativePolitics,
  traceNarrativePolitics
} from '../narrativeResourceIndex'

export function executePoliticsLookup(index, input, context = {}) {
  if (input.action === 'current') return getCurrentNarrativePolitics(index, input.filters, input, context)
  if (input.action === 'get') return getNarrativeResources(index, 'politics', input.ids, input.filters, input)
  return traceNarrativePolitics(index, input.ids, input.filters, input.limit, input)
}
```

Register it in `EXECUTORS` and `TOOL_DOMAINS`. Implement `getCurrentNarrativePolitics` as current-place/control plus highest absolute faction scores and active conflicts, and `traceNarrativePolitics` as a bounded breadth-first relation walk within the politics domain.

- [ ] **Step 5: Gate exposure behind a successful world lookup**

In `narrativeKernel.js`, pass `hasPolitics` when political runtime collections are non-empty. The Kernel catalog may contain `politics_lookup`, but `runNarrativeAgentLoop` filters it until a successful world result occurs:

```js
const completeToolCatalog = kernel.toolCatalog || []
let worldLookupSucceeded = false
const requestTools = () => completeToolCatalog.filter((tool) => (
  tool.name !== 'politics_lookup' || worldLookupSucceeded
))
```

Use `tools: requestTools()` in each decision request. After executing a `world_lookup`, set `worldLookupSucceeded = true` only when its result has `ok === true` and at least one eligible item. Once enabled, keep the politics declaration for the remainder of the transcript so historical tool calls remain declared.

If a provider returns an undeclared early politics call, existing validation must reject it; do not silently execute or reorder it.

- [ ] **Step 6: Verify contracts and chain behavior**

Run:

```bash
npm run test:run -- src/__tests__/agentContracts.test.js
```

Expected: PASS; politics is absent before world grounding, present afterward, trace results are bounded, and no tool mutates runtime state.

- [ ] **Step 7: Commit the political grounding slice**

Invoke `testing-verification` and `commit-conventions`.

```bash
git add shared/narrativeAgentContract.js src/services/agents/tools/politicsLookup.js src/services/agents/narrativeToolRegistry.js src/services/agents/narrativeResourceIndex.js src/services/agents/narrativeKernel.js src/services/agents/narrativeAgentOrchestrator.js src/__tests__/agentContracts.test.js
git commit -m "feat(experience): add chained political grounding"
```

## Task 5: Add a privacy-safe, non-blocking shadow critic

**Files:**

- Create: `src/services/agents/narrativeCritic.js`
- Create: `src/services/agents/narrativeCriticMetrics.js`
- Modify: `src/composables/useStorage.js`
- Modify: `src/services/agents/narrativeAgentOrchestrator.js`
- Modify: `src/__tests__/agentContracts.test.js`

- [ ] **Step 1: Extend the existing orchestrator test with strict critic assertions**

Add imports for critic parsing/scheduling/metrics inside the existing `agentContracts.test.js` narrative test and assert:

```js
const validVerdict = parseNarrativeCriticVerdict(JSON.stringify({
  schemaVersion: 1,
  pass: true,
  scores: { voiceConsistency: 4, grounding: 4, continuity: 3, readability: 4 },
  flags: ['minor-register-drift'],
  reason: '声口基本稳定。'
}))
expect(validVerdict).toMatchObject({ pass: true, scores: { voiceConsistency: 4 } })
expect(parseNarrativeCriticVerdict('{"pass":true,"rewrittenText":"禁止持久化"}')).toBeNull()

var voiceKernel = {
  ...politicalKernel,
  voice: { anchored: true, speakerId: 'char:entry-chu', sampleCount: 3 }
}
var productionCalls = 0
var productionDecisionRunner = async function () {
  productionCalls += 1
  if (productionCalls === 1) {
    return {
      kind: 'tool_calls',
      calls: [{ id: 'critic-plan', name: 'submit_narrative_beat_plan', arguments: validBeatPlan }]
    }
  }
  return { kind: 'final_ready', text: '原始可见正文。', calls: [] }
}
var releaseCritic
var criticGate = new Promise(function (resolve) { releaseCritic = resolve })
var visible = []
var criticResolved = false
var run = await runNarrativeAgentGeneration({
  kernel: voiceKernel,
  registry: politicalRegistry,
  requestId: 'critic-shadow-run',
  decisionRunner: productionDecisionRunner,
  criticRunner: async () => {
    await criticGate
    criticResolved = true
    return validVerdict
  },
  criticSampleRate: 1,
  callbacks: { onChunk: ({ content }) => visible.push(content) }
})
expect(run.finalText).toBe('原始可见正文。')
expect(visible.join('')).toBe('原始可见正文。')
expect(criticResolved).toBe(false)
releaseCritic()
await flushNarrativeCriticQueue()
expect(criticResolved).toBe(true)
const metric = listNarrativeCriticMetrics().find((item) => item.runId === 'critic-shadow-run')
expect(metric).toMatchObject({ outcome: 'success', voiceVariant: 'anchored' })
expect(JSON.stringify(metric)).not.toContain('原始可见正文。')
```

Also force timeout and invalid verdict paths; after flushing, assert both produce metrics but leave `run.finalText` and callbacks unchanged.

- [ ] **Step 2: Run the focused test and verify critic APIs are missing**

Run:

```bash
npm run test:run -- src/__tests__/agentContracts.test.js
```

Expected: FAIL because critic services and scheduler injection do not exist.

- [ ] **Step 3: Implement the strict critic contract and deterministic sampler**

In `narrativeCritic.js`, define:

```js
export const NARRATIVE_CRITIC_SCHEMA_VERSION = 1
export const NARRATIVE_CRITIC_LIMITS = Object.freeze({ timeoutMs: 12000, maxTokens: 500, maxTextChars: 5000, sampleRate: 0.25 })

export function parseNarrativeCriticVerdict(value) {
  let parsed
  try { parsed = typeof value === 'string' ? JSON.parse(value) : value } catch { return null }
  if (!parsed || parsed.schemaVersion !== 1 || typeof parsed.pass !== 'boolean') return null
  if ('rewrittenText' in parsed || 'replacement' in parsed) return null
  const score = (name, nullable = false) => {
    if (parsed.scores?.[name] == null && nullable) return null
    const number = Number(parsed.scores?.[name])
    return Number.isInteger(number) && number >= 1 && number <= 5 ? number : undefined
  }
  const scores = {
    voiceConsistency: score('voiceConsistency', true),
    grounding: score('grounding', true),
    continuity: score('continuity'),
    readability: score('readability')
  }
  if (Object.values(scores).some((value) => value === undefined)) return null
  return {
    schemaVersion: 1,
    pass: parsed.pass,
    scores,
    flags: [...new Set((parsed.flags || []).map((flag) => String(flag).trim()).filter(Boolean))].slice(0, 8),
    reason: String(parsed.reason || '').replace(/\s+/g, ' ').trim().slice(0, 240)
  }
}
```

Implement `shouldSampleNarrativeCritic(runId, rate)` with the same stable deterministic run-ID bucketing used elsewhere. `rate=0` always skips; `rate=1` always runs; production defaults to 0.25.

- [ ] **Step 4: Implement the bounded critic call and detached queue**

The critic request uses `toolChoice: 'none'`, temperature 0, `maxTokens: 500`, its own 12-second abort controller, and a strict JSON-only rubric. Input contains bounded final text, the selected speaker’s voice anchors, applicable evidence summaries, and BeatPlan obligations; every field is labeled untrusted data.

Export:

```js
export async function runNarrativeCriticShadow(input)
export function scheduleNarrativeCriticShadow(input)
export async function flushNarrativeCriticQueue()
```

`scheduleNarrativeCriticShadow` adds the promise to a module-local `Set`, records success/timeout/invalid/error metrics, catches every rejection, and removes it in `finally`. It never throws into the narrative generation promise.

- [ ] **Step 5: Store only privacy-safe critic metrics**

Add `STORAGE_KEYS.NARRATIVE_CRITIC_METRICS = 'pinax_narrative_critic_metrics_v1'`. In `narrativeCriticMetrics.js`, cap records at 120 and export:

```js
export function recordNarrativeCriticMetric(input)
export function listNarrativeCriticMetrics()
export function clearNarrativeCriticMetrics()
```

Normalize to this allowlist only:

```js
{
  schemaVersion: 1,
  runId,
  at,
  provider,
  model,
  textChars,
  voiceVariant: 'anchored' | 'unanchored',
  politicsVariant: 'used' | 'available-not-used' | 'unavailable',
  outcome: 'success' | 'timeout' | 'invalid' | 'error' | 'skipped',
  pass,
  scores,
  flags,
  durationMs,
  usage: { inputTokens, outputTokens, totalTokens }
}
```

Reject/strip `text`, `finalText`, `samples`, `prompt`, `messages`, `settings`, `apiKey`, `baseUrl`, `rewrittenText`, `reason`, and all unknown fields. A verdict reason may be returned to the in-memory scheduler for debugging, but it never crosses the persistence boundary.

- [ ] **Step 6: Schedule critic only after visible text emits**

Extend `runNarrativeAgentGeneration` parameters with `criticRunner = runNarrativeCriticShadow` and `criticSampleRate = NARRATIVE_CRITIC_LIMITS.sampleRate`. Immediately after `emitNarrativeFinalText(callbacks, loop.finalText)`, call `scheduleNarrativeCriticShadow({ ..., runner: criticRunner })` without awaiting it. `scheduleNarrativeCriticShadow` must call the supplied `runner` rather than a hard-coded provider function so deterministic tests can hold and release the critic independently. The input derives variants from `kernel.voice.anchored` and whether `loop.trace.calls` contains `politics_lookup`.

Return the original loop result unchanged except for low-sensitive trace fields:

```js
criticShadow: {
  scheduled: shouldSample,
  sampleRate: criticSampleRate,
  voiceVariant,
  politicsVariant
}
```

Never put a verdict into the visible status stream, message, turn record, or return `finalText`.

- [ ] **Step 7: Verify critic isolation and storage**

Run:

```bash
npm run test:run -- src/__tests__/agentContracts.test.js
```

Expected: PASS; visible text returns before critic completion, failures do not reject generation, and stored metrics contain no raw prose or credentials.

- [ ] **Step 8: Commit the shadow critic slice**

Invoke `testing-verification` and `commit-conventions`.

```bash
git add src/services/agents/narrativeCritic.js src/services/agents/narrativeCriticMetrics.js src/composables/useStorage.js src/services/agents/narrativeAgentOrchestrator.js src/__tests__/agentContracts.test.js
git commit -m "feat(experience): add shadow narrative critic"
```

## Task 6: Run Experience authenticity gates and write the branch handoff

**Files:**

- Create: `docs/agent-runs/2026-08-17-wnb-experience-parallel/experience-authenticity-summary.md`
- Verify: all files changed by Tasks 1–5

- [ ] **Step 1: Run focused and full verification**

Invoke `testing-verification`, then run:

```bash
npm run test:run -- src/__tests__/agentContracts.test.js src/__tests__/worldBookQuickImport.test.js
npm run verify:full
```

Expected: both commands exit 0; the repository remains at no more than 20 test files / 200 tests, Vite and VitePress build, and diff check passes.

- [ ] **Step 2: Run deterministic smoke gates**

Run:

```bash
npm run smoke:narrative-production
npm run smoke:narrative-recovery
```

Expected: exit 0; existing production/recovery contracts remain unchanged by critic scheduling and politics-tool registration.

- [ ] **Step 3: Run real-provider matrix only with existing configured services**

Do not start or restart the user’s server. If the existing server and provider credentials are available, run:

```bash
npm run smoke:narrative-matrix
```

Expected: supported configured providers complete one grounded turn each; critic timeout/invalid output never changes the visible turn outcome. If credentials or service are unavailable, record `not-run: external prerequisite unavailable` in the branch summary; do not fabricate success and do not block the deterministic branch handoff.

- [ ] **Step 4: Inspect the character editor and stored metrics manually**

Using the existing dev server:

1. Add six samples to one character; a seventh control is unavailable.
2. Save/reload the worldbook; style and samples round-trip.
3. Select that character as speaker; Kernel contains at most three samples.
4. Put a second sampled character in the scene; their samples do not enter Kernel.
5. Ask a faction question; `world_lookup` precedes `politics_lookup` in trace.
6. Ask an unrelated scene question; politics tool is absent.
7. Force critic sampling for one local fixture; visible prose is identical before/after queue completion.
8. Inspect `pinax_narrative_critic_metrics_v1`; no raw prose, samples, prompt, API key, base URL, or rewrite appears.

Expected: all eight checks pass.

- [ ] **Step 5: Write the branch handoff**

Create `experience-authenticity-summary.md` below 120 lines with branch/baseline/final commit, commit range, changed files, voice limits, politics chain behavior, critic sampling/privacy behavior, focused/full/smoke results, real-provider result or explicit non-run reason, manual checks, and integration concerns. Do not paste raw prompts, outputs, credentials, or command logs.

- [ ] **Step 6: Verify and commit the handoff**

Run:

```bash
npm run verify:full
git status --short
git log --oneline --max-count=8
```

Expected: exit 0; only allowed Experience files and the unique summary are changed.

Invoke `commit-conventions`:

```bash
git add docs/agent-runs/2026-08-17-wnb-experience-parallel/experience-authenticity-summary.md
git commit -m "docs(experience): record authenticity mvp handoff"
```

Stop after this commit. Do not merge WNB or update canonical product docs from this worker.

## Integration window — integration owner only

After both feature workers stop:

1. Read both branch summaries.
2. Merge or cherry-pick the Experience and WNB commit ranges into one clean integration worktree based on the recorded baseline.
3. Confirm no feature branch violated its forbidden-file list.
4. Resolve imports/test-count changes only; do not redesign either feature during merge.
5. Run `npm run verify:full`.
6. Run WNB UI audit and the authenticity deterministic smokes.
7. Manually import a voice-anchored, politics-grounded assistant turn into Writing; confirm the imported Markdown equals the visible assistant content and contains complete Experience provenance but no critic metadata.
8. Invoke `docs-status-handoff`; update `docs/STATUS.md`, `docs/PLAN.md`, `docs/LOG.md`, and `docs/plan/pinax-integrated-product-roadmap.md` once with both shipped outcomes and exact combined verification.
9. Invoke `commit-conventions` and create one docs-only integration commit.

## Stop conditions

Stop and report instead of expanding scope when:

- the orchestration board has no concrete shared baseline commit;
- the baseline omits current worldbook editor or WNB prerequisite changes;
- voice samples leak from a non-speaker into the Kernel;
- voice data pushes the cast block past its existing bound without deterministic truncation;
- politics requires a new canonical world-state schema or any mutating tool;
- `politics_lookup` can run before successful `world_lookup` grounding;
- critic scheduling delays visible prose or rejects an otherwise successful generation;
- critic metrics contain raw prose, samples, prompts, credentials, or rewrite text;
- the feature needs edits to WNB-owned files;
- test count would exceed 200 without consolidating superseded assertions.

## Completion definition

The Experience authenticity MVP is complete only when:

- character voice profiles round-trip with explicit bounds;
- only the selected speaker’s voice profile enters the Kernel;
- political resources derive deterministically from existing runtime state;
- politics lookup is read-only and chained after world lookup;
- critic is sampled, detached, privacy-safe, and incapable of changing visible output;
- focused tests, `verify:full`, deterministic smokes, and eight manual checks pass;
- the branch contains no WNB-owned file changes and ends with a concise handoff summary.
