# Narrative Plan/Prose Phase Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Prevent internal BeatPlan protocol and meta-ending instructions from entering Experience story prose by separating planning and prose into independent transcripts.

**Architecture:** Run a forced, plan-only provider turn first, validate it in an isolated planner transcript, then create a fresh prose transcript containing only compact scene constraints and read-only evidence tools. Reject meta-narrative `endCondition` values at the structured plan boundary; do not post-process final prose.

**Tech Stack:** Vue 3 application services, shared JavaScript contracts, Vitest, Vite, existing tool-calling provider adapters.

---

### Task 1: Lock the provider-specific planning boundary

**Files:**
- Modify: `src/__tests__/agentContracts.test.js`
- Modify: `src/services/agents/narrativeAgentOrchestrator.js`
- Read: `shared/generationToolContract.js`

- [x] **Step 1: Extend the existing transcript-loop test with failing boundary assertions**

Inside the existing `transcriptLoop` case, assert that the first request is planning-only and the next request is prose-only:

```js
expect(transcriptRequests[0].tools.map((tool) => tool.name)).toEqual(['submit_narrative_beat_plan'])
expect(transcriptRequests[0].options).toMatchObject({
  parallelToolCalls: false,
  toolChoice: { type: 'function', function: { name: 'submit_narrative_beat_plan' } }
})
expect(JSON.stringify(transcriptRequests[1])).not.toContain('submit_narrative_beat_plan')
expect(transcriptRequests[1].tools.every((tool) => tool.name !== 'submit_narrative_beat_plan')).toBe(true)
expect(transcriptRequests[1].messages.some((message) => (
  message.role === 'system' && message.content.includes('本轮场景约束')
))).toBe(true)
```

Replace old assertions that require BeatPlan to remain declared throughout the shared transcript.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm run test:run -- src/__tests__/agentContracts.test.js
```

Expected: FAIL because all requests currently share the complete tool catalog and transcript.

- [x] **Step 3: Add protocol-aware specific tool choice**

Import `resolveGenerationToolProtocol` and add a pure helper:

```js
function specificToolChoice(settings, name) {
  const protocol = resolveGenerationToolProtocol(settings || {})
  if (protocol === 'anthropic') return { type: 'tool', name }
  if (protocol === 'openai-responses') return { type: 'function', name }
  return { type: 'function', function: { name } }
}
```

The helper must not inspect secrets and must use the same protocol resolution as server adapters.

- [x] **Step 4: Split transcript construction by responsibility**

Replace `createInitialNarrativeTranscript` with two focused constructors:

```js
function createNarrativePlanningTranscript({ kernel, mode, intent, requestId, expansion })
function createNarrativeProseTranscript({ kernel, mode, intent, formatInstructions, requestId, expansion, beatPlan })
```

Both reuse a helper that builds real history messages and the current user turn. The planning system message contains the plan schema intent but no prose instruction. The prose system message contains `buildNarrativeVoiceContract`, Kernel data, and a system scene-constraint message built from `beatPlan`, but contains no planning tool name or planning-status language.

- [x] **Step 5: Implement the isolated planning request**

At the beginning of `runNarrativeAgentLoop`, when `requiresBeatPlanFor(...)` is true:

```js
const planTool = (kernel.toolCatalog || []).find((tool) => tool.name === NARRATIVE_BEAT_PLAN_TOOL)
```

Fail with `NARRATIVE_BEAT_PLAN_TOOL_UNAVAILABLE` if absent. Call `decisionRunner` with only `[planTool]`, `parallelToolCalls: false`, the specific tool choice, plan timeout, bounded plan tokens, and the linked abort signal. Require exactly one plan call; validate and execute it through the existing registry so revision and typed errors remain authoritative. On success set application-owned `targetChars`, revision, usage, total call/tool round counts, and plan trace stats. Then discard the planner transcript and create the prose transcript.

- [x] **Step 6: Keep one bounded repair inside the planner transcript**

If the planning response is plain text, missing the BeatPlan call, has multiple calls, or fails BeatPlan validation, append a typed repair user message only to the planner transcript and retry once. Count it in `repairCount` and `phaseStats.plan`; after the retry, rethrow the typed failure. Do not append planner messages to the prose transcript.

- [x] **Step 7: Remove BeatPlan handling from the evidence/write loop**

Use a read-only catalog:

```js
const completeToolCatalog = (kernel.toolCatalog || []).filter(
  (tool) => tool.name !== NARRATIVE_BEAT_PLAN_TOOL
)
```

Remove the branch that asks a final-text response to call BeatPlan, plan-result extraction from executed evidence tools, and the post-plan user control message. Phase classification becomes final text → write/completion, tool calls → evidence. `requestStep` starts with the write timeout and uses only read tools.

- [x] **Step 8: Run focused tests and verify GREEN**

Run:

```bash
npm run test:run -- src/__tests__/agentContracts.test.js
```

Expected: the existing suite passes with the new transcript/tool boundaries.

### Task 2: Make scene endings diegetic at the structured boundary

**Files:**
- Modify: `shared/narrativeBeatPlanContract.js`
- Modify: `shared/narrativeAgentContract.js`
- Modify: `src/services/agents/narrativeVoicePolicy.js`
- Modify: `src/services/agents/narrativeAgentOrchestrator.js`
- Test: `src/__tests__/agentContracts.test.js`

- [x] **Step 1: Add failing BeatPlan validation assertions**

Extend the existing BeatPlan schema block:

```js
expect(validateNarrativeBeatPlanInput({
  responseObligation: '回应玩家',
  causalSteps: ['确认印泥来源'],
  revealOrChange: '伪造来源被确认',
  endCondition: '故事在这里自然停下，等待玩家下一步行动'
})).toMatchObject({
  valid: false,
  error: { code: 'NARRATIVE_BEAT_PLAN_END_META' }
})
expect(validateNarrativeBeatPlanInput({
  responseObligation: '回应玩家',
  causalSteps: ['确认印泥来源'],
  revealOrChange: '伪造来源被确认',
  endCondition: '莉娜把伪造印章放到艾德加面前'
}).valid).toBe(true)
```

- [x] **Step 2: Run focused test and verify RED**

Run the same focused Vitest command. Expected: the meta end condition is currently accepted.

- [x] **Step 3: Validate obvious meta-narrative end conditions**

Add a small predicate in `shared/narrativeBeatPlanContract.js` that rejects only explicit structural language:

```js
function hasMetaNarrativeEndCondition(value) {
  return /(故事|叙事|剧情).*(结束|停下|告一段落)|等待.*(玩家|读者|下一步|选择|行动)|留待.*(下一轮|下一步|后续)/.test(value)
}
```

Return `NARRATIVE_BEAT_PLAN_END_META` with a message requiring an observable in-scene action, line, or fact. Keep this validation before serialized-length validation.

- [x] **Step 4: Update schemas and prose guidance**

Change tool descriptions and `endCondition` schema text from “自然停下” to “最后一个可观察场景状态”. In `buildNarrativeVoiceContract`, require the last sentence to land on an in-scene action, dialogue line, or confirmed fact and prohibit announcing story structure or waiting for player choice.

In `buildBeatPlanControlMessage`, rename the heading to `【本轮场景约束】`, render `场景内结束状态`, and remove “计划”“写到这个状态就停下” terminology. The bounded-completion prompt must say:

```js
`（继续）从最后一句续写，完成当前动作链，使场景落到：${beatPlan.endCondition}；不重述前文。`
```

- [x] **Step 5: Run focused tests and verify GREEN**

Run the focused agent-contract suite. Expected: plan validation and all narrative loop cases pass.

### Task 3: Cover all provider protocols and preserved runtime semantics

**Files:**
- Modify: `src/__tests__/agentContracts.test.js`
- Modify: `src/__tests__/gameStoreSession.test.js`
- Modify if required by failing test: `src/services/agents/narrativeAgentOrchestrator.js`
- Modify: `src/services/agents/narrativeAgentPolicy.js`
- Modify: `server/services/providers/anthropicToolAdapter.js`
- Modify: `server/services/providers/openAiToolAdapter.js`
- Modify: `server/services/providers/openAiResponsesToolAdapter.js`

- [x] **Step 1: Add provider-shape assertions without adding a new test case**

Within the existing provider protocol block, run the narrative loop with one plan call and one final prose response for settings with `format: 'responses'` and `format: 'anthropic'`. Capture the first request and assert:

```js
expect(responsesPlan.options.toolChoice)
  .toEqual({ type: 'function', name: 'submit_narrative_beat_plan' })
expect(anthropicPlan.options.toolChoice)
  .toEqual({ type: 'tool', name: 'submit_narrative_beat_plan' })
```

Also assert MiniMax protocol resolution produces the Anthropic shape through the same helper path.

At the adapter boundary, assert that `capabilities.parallelToolCalls=false` preserves a specific Anthropic tool choice and only adds `disable_parallel_tool_use: true`; it must not replace the named tool with `auto`.

Assert that OpenAI Chat and Responses serialize `parallel_tool_calls: false` instead of omitting the field. Add a combined repair regression: after one planner repair, a prose response that calls the undeclared BeatPlan tool must be rejected before execution, receive its own one-time prose repair, and leave the prose transcript clean.

- [x] **Step 2: Add preserved-semantics assertions**

For the existing transcript loop assert:

```js
expect(transcriptLoop.trace.phases).toMatchObject({
  plan: { rounds: 1 }, evidence: { rounds: 1 }, write: { rounds: 1 }
})
expect(transcriptLoop.totalCalls).toBe(2)
expect(transcriptLoop.toolRounds).toBe(2)
expect(transcriptLoop.usage).toMatchObject({ inputTokens: 30, outputTokens: 18, totalTokens: 48 })
expect(JSON.stringify(transcriptLoop.baseMessages)).not.toContain('submit_narrative_beat_plan')
```

Keep the existing evidence-budget, repair, bounded-completion, grounding, politics gating and SceneThread assertions.

- [x] **Step 3: Run focused tests and fix only observed compatibility failures**

Run:

```bash
npm run test:run -- src/__tests__/agentContracts.test.js
```

Expected: PASS. If an old assertion encodes shared-transcript behavior, update it to the approved phase-isolation contract; do not weaken evidence or timeout assertions.

### Task 4: Verify, document, and finish

**Files:**
- Modify: `docs/STATUS.md`
- Create: `docs/agent-runs/2026-08-21-narrative-plan-prose-phase-isolation-summary.md`

- [x] **Step 1: Run targeted verification**

```bash
npm run test:run -- src/__tests__/agentContracts.test.js src/__tests__/gameStore.test.js
npm run smoke:narrative-recovery
npm run smoke:narrative-production -- --dry-run
```

Expected: all commands exit 0.

- [x] **Step 2: Run full verification**

```bash
npm run verify:full
git diff --check
```

Expected: Vitest, Vite build, VitePress build and diff check pass.

- [x] **Step 3: Review the final diff**

Confirm:

- prose requests contain no planning tool name or planner history;
- planning calls use only one forced tool and no parallel calls;
- no final-text regex sanitizer or default retry was added;
- secrets and full critic/prose text are not added to trace;
- unrelated user changes are absent.

- [x] **Step 4: Update handoff docs**

Add a concise `docs/STATUS.md` fact and summary covering root cause, architectural fix, changed contracts, exact verification results, and any real-provider test not run. Do not claim live provider verification unless it was actually executed.

- [x] **Step 5: Commit the finished implementation**

Use `commit-conventions` and create one implementation commit:

```bash
git add shared/narrativeAgentContract.js shared/narrativeBeatPlanContract.js \
  server/services/providers/anthropicToolAdapter.js server/services/providers/openAiToolAdapter.js \
  server/services/providers/openAiResponsesToolAdapter.js \
  src/services/agents/narrativeAgentOrchestrator.js \
  src/services/agents/narrativeAgentPolicy.js \
  src/services/agents/narrativeVoicePolicy.js \
  src/__tests__/agentContracts.test.js src/__tests__/gameStoreSession.test.js \
  docs/STATUS.md \
  docs/superpowers/plans/2026-08-21-narrative-plan-prose-phase-isolation.md \
  docs/agent-runs/2026-08-21-narrative-plan-prose-phase-isolation-summary.md
git commit -m "fix(agents): isolate narrative planning from prose"
```

Before integration, use `requesting-code-review`, `verification-before-completion`, and `finishing-a-development-branch`. Keep the branch at no more than two final commits; squash only if an extra checkpoint commit was created.

## Plan self-review

- Every design requirement maps to a task.
- No final-output sanitizer, new model, UI work, or evaluation expansion is included.
- Helper names and request option shapes match the existing generation contract.
- TDD RED/GREEN steps precede each production behavior change.
- The verification and documentation handoff is explicit.
