# Pinax Unified Agent Capability Architecture Design

**Date:** 2026-08-22

**Status:** proposed; awaiting user review before implementation planning

## 1. Outcome

Pinax will replace page-owned AI pipelines with one project-level capability architecture shared by Settings, Experience, and Writing. The three surfaces may present different commands and context views, but they will no longer own separate prompt builders, task semantics, result lifecycles, or competing copies of project context.

The architecture is an application-level sparse expert system:

- a deterministic task router chooses a registered capability from the user's explicit command;
- a shared context resolver selects the smallest useful context from one project knowledge model;
- each task activates only its required policy, tools, output schema, budget, and execution workflow;
- only genuinely open-ended narrative work uses an autonomous tool loop;
- predictable extraction, completion, rewriting, review, and derivation use bounded workflows;
- every durable mutation passes through one revision-aware result transaction layer.

This resembles mixture-of-experts routing at the product level, but it is not a model-level MoE and not a collection of agents independently writing competing prose.

## 2. Validated product decisions

The following decisions are fixed by the 2026-08-21 and 2026-08-22 design dialogue:

1. Settings remains a focused knowledge-maintenance workspace.
2. Experience and Writing converge into one continuously editable manuscript workspace.
3. During migration, the old Experience route remains a compatibility surface until its capabilities pass parity in the authoring workspace.
4. The existing Experience NarrativeKernel and narrative orchestrator are the strongest production runtime and must be generalized, not replaced by Writing's lightweight completion path.
5. Settings, Experience, and Writing share one project context model. “Shared” means shared identity, revision, authority, provenance, and retrieval—not placing every project token in every prompt.
6. A user's explicit command selects the task family. The model may choose bounded evidence tools inside a task, but it does not decide which product capability the user meant when the UI already knows.
7. Routine observations derived from committed manuscript text may update automatically. Per-item confirmation is not required.
8. Ambiguous identity, locked-fact contradiction, destructive timeline mutation, and cross-scene retcon are exceptions that require attention.
9. User-invoked continuation or simulation writes directly into the current draft as one undoable editor transaction.
10. Canonical setting changes extracted from imported reference material remain drafts until adopted; importing third-party or ambiguous material must not silently rewrite project canon.
11. Complete expanded prompts, hidden reasoning, stream fragments, rejected alternatives, and duplicated context are not durable project data.
12. Product behavior is developed and audited in the Web application first. Electron later replaces persistence and system boundaries without forking the task/context architecture.

## 3. Research basis

- Anthropic distinguishes deterministic workflows from autonomous agents and recommends beginning with simple composable patterns. Routing is appropriate when tasks belong to clear categories; evaluator-optimizer loops are justified only when evaluation criteria and measurable improvement exist: <https://www.anthropic.com/engineering/building-effective-agents>.
- Anthropic's context-engineering guidance treats context as a finite resource and recommends the smallest high-signal token set, just-in-time retrieval through stable references, compaction, and isolated specialist context when it pays for itself: <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>.
- OpenAI's agent guidance identifies handoffs, guardrails, tracing, and human intervention as explicit orchestration concerns rather than prompt conventions: <https://openai.com/index/new-tools-for-building-agents/> and <https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/>.
- LangGraph's current multi-agent taxonomy separates subagents, handoffs, skills, routers, and custom workflows, and notes that a single agent with dynamically selected tools/context often meets needs attributed to multi-agent systems: <https://langchain-ai.github.io/langgraph/tutorials/multi_agent/multi-agent-collaboration/>.

Pinax should adopt these architectural lessons without adding a framework dependency. Existing contracts, provider adapters, retry logic, context ledgers, and narrative tools are sufficient building blocks once their ownership is unified.

## 4. Current-state audit

### 4.1 Existing shared foundations

Pinax already has useful pieces:

- `shared/agentTaskContract.js` declares task types, target types, revision requirements, result modes, and context limits;
- `src/services/agents/agentTaskRegistry.js` exposes task lookup and surface metadata;
- `src/services/agents/agentContextEnvelope.js` and `shared/agentContextContract.js` provide bounded context blocks and source refs;
- `src/services/agents/agentResultLifecycle.js` models pending, completed, failed, stale, applied, and dismissed results;
- `src/services/advisorTaskService.js` and the server advisor route provide one validated request path;
- `src/services/generationService.js` centralizes basic retry-driven generation and narrative tool turns;
- `src/services/agents/narrativeKernel.js` provides the richest project-aware context assembly;
- `src/services/agents/narrativeAgentOrchestrator.js` provides planning/prose isolation, evidence tools, repair limits, timeout budgets, and typed recovery.

These are not yet one runtime. The task registry contains declared but unavailable tasks, and many live calls bypass it.

### 4.2 Settings pipelines

Settings currently owns separate calls for:

| Existing capability | Current path | Current effect |
|---|---|---|
| Local TXT/MD/PDF/DOCX parsing | source adapters/archive | deterministic archive write |
| Full source → worldbook extraction | worldbook import generation | structured preview/draft |
| Brief → foundation | worldbook import generation | structured preview/draft |
| Source → setting candidates | setting field generation | candidate review batch |
| Single field completion | setting field generation | field draft |
| Section completion | setting field generation | multiple field drafts |
| Feedback revision | setting field generation | revised field draft |
| Geography overview → places | setting place generation | place drafts |
| Place flesh-out | setting place generation | place draft |
| Research query planning | worldbook research | search plan |
| Research claim review | research claims/revision | claim/conflict draft |
| Worldbook maintenance | worldbook maintenance | reviewed maintenance actions |
| Geography review/history draft | task registry declarations | incomplete/unavailable execution |

These services build their own messages, timeouts, schemas, retries, and context subsets. Their outputs are not uniformly represented by the agent result lifecycle.

### 4.3 Experience pipelines

Experience currently owns:

| Existing capability | Execution kind | Current effect |
|---|---|---|
| Main narrative response/open/extend/advance | autonomous bounded narrative loop | commits visible message and runtime turn |
| Beat planning | forced structured tool workflow | discarded control artifact plus trace |
| World/history/geo/politics/memory lookup | model-selected read tools | evidence for current narrative run |
| Next-action advice | advisor task | review-only options |
| Dialogue options | standalone generation workflow | transient choices |
| Emergence scheduling | deterministic scheduler | candidate only |
| Emergence materialization | structured generation workflow | reviewed runtime candidate |
| Adventure trigger prose/storyboard | standalone generation workflow | draft artifact |
| Context compression | standalone generation workflow | compact session context |
| Experience → material summary | standalone generation workflow | material draft |
| Shadow critic | sampled detached model call | privacy-bounded metrics only |
| Memory candidate recording/compaction | local/server memory paths | scoped candidate/memory state |
| Goal/character/choice/faction extraction | deterministic regex and worldbook matching | immediate runtime mutation |

The main narrative path is mature, but auxiliary calls use several unrelated execution and result paths. Some deterministic extractors use `ai-extract` naming even though no model is called.

### 4.4 Writing pipelines

Writing currently has at least three overlapping systems:

| Existing capability | Current path | Current effect |
|---|---|---|
| Passive cursor completion | `useWritingAgent` | transient suggestion, optional insert/undo |
| Selection/paragraph fixes and light continuation | advisor task path | validated text patch |
| Thread/chapter review | advisor task path | suggestions/review annotations |
| Explicit rewrite candidates | page-owned request flow | candidate diff, adopt, undo |
| Batched chapter review | page-owned advisor batches | revision-checked annotations |
| Experience turn import | writing import bridge | copies one turn into a separate document |

Writing has a context envelope and worldbook matcher, but it does not use the NarrativeKernel's complete cast, continuity, scene thread, causality, and evidence-tool behavior.

### 4.5 Structural failures to correct

1. Page ownership determines prompt and context behavior.
2. Declared task types are not guaranteed executable.
3. A single logical capability may have both page-owned and advisor-owned implementations.
4. Context budgets, block vocabulary, authority, and retrieval differ between surfaces.
5. Result validation and revision checks are not universal.
6. Background extraction and user-visible generation are not clearly separated.
7. Task names, execution profiles, and provider transport task types are conflated.
8. Trace metadata cannot answer one consistent question: what task ran, what context was activated, what tools were allowed, and what durable effect occurred?

## 5. Target architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│ UI command surfaces                                                 │
│ Settings workspace | Authoring editor | Context inspector           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ explicit task + target
┌──────────────────────────────▼──────────────────────────────────────┐
│ Task Registry + Deterministic Router                                │
│ definition / activation profile / workflow / permissions / schema  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ resolve context
┌──────────────────────────────▼──────────────────────────────────────┐
│ Project Knowledge Facade                                           │
│ identity / revision / authority / sourceRefs / current state        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ bounded envelope + ledger
┌──────────────────────────────▼──────────────────────────────────────┐
│ Execution Engine                                                    │
│ local | one-shot | validated chain | agent loop | derive | shadow  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ typed result/actions
┌──────────────────────────────▼──────────────────────────────────────┐
│ Result Transaction Layer                                           │
│ schema → domain guard → revision → authority → apply/draft/derive   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ domain event
┌──────────────────────────────▼──────────────────────────────────────┐
│ Project stores + derived-job scheduler + compact trace/receipt      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.1 Project Knowledge Facade

The facade is a domain API, not a database or graph-database requirement. In Web-first development it reads existing Pinia/localStorage/IndexedDB sources through adapters. In the desktop product it reads TXT/SQLite/assets through adapters. Task and context code does not know which persistence adapter is active.

The facade exposes stable typed reads:

- project/book/volume/chapter identities and revisions;
- manuscript text windows and structural ranges;
- worldbook overview, entries, structured settings, and source archive refs;
- characters, aliases, voice anchors, knowledge boundaries, and states;
- places, map state, histories, and current scene;
- relationships, canonical facts, events, timeline, goals, and unresolved hooks;
- materials, canvas/storyboard derivatives, and their provenance/staleness;
- scoped memory candidates and current accepted memory;
- author preferences, task instruction, and locked spans.

It never returns full project data by default. Every query names a scope, target, revision, and limit.

### 5.2 Deterministic task router

The router receives an explicit task type from a command. It does not spend a model call deciding that clicking “补全地理” means `worldbook.setting.field.complete`.

Natural-language command entry may resolve to a task only when the user has not already selected one. Ambiguous resolution returns choices and performs no mutation.

The router loads a fixed registry definition containing:

```js
{
  taskType,
  ownerDomain,
  targetTypes,
  workflowKind,
  contextProfile,
  toolProfile,
  outputSchema,
  resultMode,
  effectPolicy,
  requiresRevision,
  retryPolicy,
  timeoutPolicy,
  privacyPolicy
}
```

Client and server derive their allowlists from the same shared definitions. A declared production task cannot be silently unavailable; experimental declarations use a separate experimental catalog and are not shown as available UI commands.

### 5.3 Sparse expert profiles

An expert is a policy/configuration package, not an autonomous persona with private project memory. A profile selects:

- system policy and canonical examples;
- required, optional, and forbidden context blocks;
- eager context versus just-in-time read tools;
- output schema and domain validators;
- model/tool budgets and retry limits;
- permissible result actions.

The first stable profiles are:

| Profile | Purpose | Typical workflow |
|---|---|---|
| `setting-import` | extract structured knowledge from source materials | validated chain |
| `setting-maintenance` | complete/revise/review canonical setting drafts | structured one-shot/batch |
| `narrative-scene` | continue or simulate an open scene | bounded agent loop |
| `local-prose-edit` | rewrite/expand/shorten a known range | structured one-shot |
| `chapter-review` | produce located findings without editing prose | validated batches |
| `narrative-observer` | derive entities/relations/events from committed prose | background derive |
| `shadow-quality` | record low-sensitivity quality metrics | detached shadow |

No v1 model-tier router is added. Provider/model selection remains user configuration; task profiles control behavior and budgets, not vendor choice.

## 6. Shared request and context contracts

### 6.1 Task request

```js
{
  schemaVersion: 1,
  requestId,
  taskType,
  projectId,
  surface,
  target: {
    type,
    id,
    revision,
    range: { from, to } | null,
    nodeIds: []
  },
  input: {
    instruction,
    selectedSourceIds: [],
    selectedCharacterIds: [],
    parameters: {}
  }
}
```

The caller may select sources, characters, ranges, and bounded parameters. It cannot enable arbitrary tools, expand its own budget, choose an output action, or bypass a revision requirement.

### 6.2 Context block vocabulary

All profiles use one block vocabulary:

| Block | Contains |
|---|---|
| `policy` | task rules, authority and mutation restrictions |
| `target` | exact field/range/chapter/scene and expected revision |
| `local-text` | cursor/selection/paragraph/chapter windows |
| `structure` | outline, chapter map, scene boundaries |
| `canon` | locked world rules and confirmed setting facts |
| `scene` | current place/time/goals/pressure |
| `cast` | selected speaker detail and bounded other-character summaries |
| `continuity` | SceneThread, causal state, recent changes and conflicts |
| `relations` | relevant character/faction relations |
| `timeline` | relevant events and validity ranges |
| `sources` | selected imported evidence and research claims |
| `memory` | scoped accepted memory, never an unbounded transcript |
| `materials` | explicitly selected derivative/reference assets |
| `preferences` | writing style and presentation-independent author preferences |

Each block has `sourceRefs[]`, source revision, activation reason, priority, characters used, truncation state, and authority class. The durable ledger stores this metadata, not the expanded content.

### 6.3 Authority order

When sources disagree, context assembly does not silently blend them:

1. system/task safety and mutation policy;
2. user-locked canon and locked manuscript spans;
3. user-confirmed setting entities and timeline facts;
4. current target manuscript text as authored evidence;
5. confirmed runtime events and state;
6. derived observations tied to current source revisions;
7. imported/research evidence not yet adopted;
8. selected materials and summaries;
9. model-generated suggestions and memory candidates.

Lower layers cannot overwrite higher layers. A contradiction becomes an explicit conflict block. Existing manuscript prose is never silently rewritten merely because it conflicts with setting; only an explicit rewrite task may change it.

### 6.4 Context profiles

A context profile declares:

```js
{
  requiredBlocks,
  optionalBlocks,
  forbiddenBlocks,
  maxChars,
  perBlockLimits,
  retrieval: {
    eagerKinds,
    toolKinds,
    maxToolRounds
  }
}
```

Examples:

- field completion requires `policy`, `target`, `canon`; it may include `sources`, but forbids session transcript and runtime inventory;
- local rewrite requires `policy`, `target`, `local-text`; it may include related canon/cast, but forbids unrelated chapters and emergence tools;
- narrative continuation requires scene/cast/continuity and receives just-in-time world/history/geo/politics/memory read tools;
- background entity observation receives the committed patch plus bounded adjacent text and an identity index, but no prose-writing tools.

## 7. Execution engine

### 7.1 Workflow kinds

| Kind | Model control | Use |
|---|---|---|
| `local` | no model | parsing, matching, hashing, scheduling, deterministic validation |
| `structured-one-shot` | one bounded response | field completion, local rewrite, dialogue options |
| `validated-chain` | fixed code-controlled stages | source extraction, research, complex structured import |
| `agent-loop` | model chooses bounded read tools | narrative continuation/simulation only |
| `background-derive` | queued bounded extraction | entities, relations, events, timeline observations |
| `shadow-observer` | detached sampling | low-sensitivity quality metrics |

Retries are part of the workflow definition. A failed parse may receive one schema repair; it does not restart the entire workflow by default. A task cannot promote itself from one-shot to agent-loop.

### 7.2 Narrative agent loop

The existing Experience orchestration remains the foundation:

1. determine narrative intent and target editor transaction;
2. create an isolated forced BeatPlan only when the profile requires it;
3. discard planner transcript after validation;
4. build a fresh prose transcript;
5. expose only profile-approved read tools;
6. enforce evidence/tool/repair/timeout budgets;
7. validate narrative presentation and target revision;
8. commit one editor transaction;
9. schedule derived observers after commit.

Local rewrite/expand/shorten must not inherit BeatPlan or the complete narrative tool catalog merely because both operate on prose.

### 7.3 Settings workflows

Settings extraction is a workflow, not a free-running agent:

```text
parse locally
→ structure/chunk/index locally
→ select source ranges
→ model extracts typed candidates
→ schema/provenance/identity validation
→ candidate draft batch
→ user adopts canonical changes
```

Completing a field uses current canonical context and selected evidence, returns a field draft, and cannot write another field. Section completion produces independently reviewable field drafts and preserves partial successes.

Research uses a fixed chain:

```text
query plan → provider search → page fetch → evidence normalization
→ claim extraction → provenance/conflict validation → review draft
```

Search/fetch are program tools controlled by the workflow. The claim extractor cannot initiate arbitrary network requests.

## 8. Canonical task catalog

### 8.1 Settings tasks

| Canonical task | Profile/workflow | Result/effect |
|---|---|---|
| `source.parse` | local | archive artifacts/chunks |
| `source.structure.detect` | local | chapter/section metadata and warnings |
| `worldbook.import.extract` | setting-import / validated-chain | candidate worldbook draft |
| `worldbook.foundation.generate` | setting-maintenance / structured-one-shot | foundation draft |
| `worldbook.candidates.extract` | setting-import / validated-chain | provenance candidates |
| `worldbook.setting.field.complete` | setting-maintenance / structured-one-shot | one field draft |
| `worldbook.setting.section.complete` | setting-maintenance / bounded batch | multiple independent drafts |
| `worldbook.setting.draft.revise` | setting-maintenance / structured-one-shot | revised draft |
| `worldbook.place.extract` | setting-import / structured-one-shot | place candidate batch |
| `worldbook.place.flesh-out` | setting-maintenance / structured-one-shot | place draft |
| `worldbook.research.plan` | setting-import / chain stage | bounded query plan |
| `worldbook.research.claims.extract` | setting-import / chain stage | cited claim/conflict drafts |
| `worldbook.maintenance.review` | setting-maintenance / validated batch | bounded maintenance actions |
| `worldbook.geography.review` | setting-maintenance / structured-one-shot | review findings |
| `worldbook.history.draft` | setting-maintenance / structured-one-shot | history draft |

Canonical worldbook mutations require adoption because they change author-maintained project truth. Explicit user edits continue to save directly without an AI confirmation layer.

### 8.2 Unified authoring tasks

| Canonical task | Profile/workflow | Result/effect |
|---|---|---|
| `authoring.continue` | narrative-scene / agent-loop | direct text transaction + undo |
| `authoring.advance` | narrative-scene / agent-loop | direct text transaction + undo |
| `authoring.simulate.character` | narrative-scene / agent-loop | direct text transaction + undo |
| `authoring.simulate.scene` | narrative-scene / agent-loop | direct text transaction + undo |
| `authoring.insert` | narrative-scene / agent-loop or bounded chain | direct text transaction + undo |
| `authoring.rewrite` | local-prose-edit / structured-one-shot | direct text transaction + undo |
| `authoring.expand` | local-prose-edit / structured-one-shot | direct text transaction + undo |
| `authoring.shorten` | local-prose-edit / structured-one-shot | direct text transaction + undo |
| `authoring.complete.inline` | local-prose-edit / structured-one-shot | transient suggestion, explicit accept |
| `authoring.review.chapter` | chapter-review / validated batches | located annotations |
| `authoring.next-actions` | narrative-scene / structured-one-shot | transient options |
| `authoring.dialogue-options` | narrative-scene / structured-one-shot | transient options |
| `authoring.emergence.materialize` | narrative-scene / validated-chain | reviewed runtime candidate |
| `authoring.trigger.prose` | narrative-scene / structured-one-shot | draft artifact |
| `authoring.trigger.storyboard` | narrative-scene / structured-one-shot | storyboard draft |
| `authoring.context.compact` | narrative-scene / validated-chain | compact session/scene state |
| `authoring.asset.summarize` | narrative-scene / structured-one-shot | material draft |

The old `experience.*`, `writing.*`, advisor aliases, and transport-only task names map to this catalog during migration. Alias use is traced and removed after all callers migrate.

### 8.3 Background observation tasks

| Canonical task | Input | Durable effect |
|---|---|---|
| `narrative.observe.entities` | committed text patch + identity index | derived entity mentions/states |
| `narrative.observe.relations` | patch + cast/known relations | derived relationship observations |
| `narrative.observe.events` | patch + current timeline | derived event observations |
| `narrative.observe.timeline` | patch + time/scene anchors | derived temporal observations |
| `narrative.memory.candidate` | patch + scoped memory refs | memory candidate |
| `narrative.quality.shadow` | sampled receipt + bounded text | aggregate quality metrics only |

Observers are idempotent on `(taskType, sourceId, sourceRevision, range fingerprint)`. If the source revision changes before completion, the result is discarded or marked stale. Observer failure never rolls back committed prose.

## 9. Result transaction layer

Every model result becomes a typed result before any domain mutation:

```text
raw response (ephemeral)
→ transport parse
→ output schema validation
→ domain validator
→ expected revision check
→ authority/effect-policy check
→ apply, retain as draft, auto-derive, or reject
→ compact receipt and domain event
```

### 9.1 Effect policies

| Policy | Behavior |
|---|---|
| `read-only` | no project mutation |
| `transient` | session suggestion/options only |
| `draft-review` | saves bounded candidate/draft; user adoption changes canon |
| `direct-text` | explicit user command writes one undoable manuscript transaction |
| `derived-auto` | background observation commits automatically below locked canon |
| `exception-review` | saves conflict/ambiguity item; does not overwrite source |
| `external-request` | prepares media/storyboard job; submission remains explicit |

An AI task never chooses its own effect policy. The registry fixes it.

### 9.2 Revision and concurrency

- Every mutable target has an expected revision.
- Direct text actions also carry exact range/node identities and base text/hash.
- Section batches validate each field independently; successful drafts survive sibling failures.
- Background observations use source revision and range fingerprints.
- A stale result is never auto-rebased by a model.
- Re-running an idempotent task cannot duplicate accepted observations, imports, or material links.
- One active direct-text operation per chapter is allowed; read-only review and detached shadow work may run concurrently.

### 9.3 Confirmation policy

No universal confirmation queue is introduced:

- explicit manual edits: immediate;
- explicit continue/simulate/rewrite/expand/shorten: immediate with transient highlight and request-level Undo;
- passive inline completion: explicit accept;
- source import and AI changes to canonical settings: draft review;
- routine manuscript-derived observations: automatic;
- locked-fact conflict, ambiguous identity, destructive timeline mutation, cross-scene retcon: exception review;
- derivative regeneration and external media jobs: explicit action.

## 10. Three surface projections

### 10.1 Settings workspace

Settings owns author-maintained knowledge, not a private Settings Agent.

It presents:

- source import/parse quality and provenance;
- candidate extraction and duplicate/conflict review;
- structured fields, characters, places, organizations, events, rules, and research claims;
- field/section completion and revision commands;
- locked canon controls;
- exception review for derived conflicts;
- source usage and stale status.

Once a setting is adopted, it is immediately available to all project tasks. “导入体验” ceases to be a data-transfer operation.

### 10.2 Experience compatibility surface

During migration, Experience continues to render existing sessions and invoke the mature narrative runtime. Its calls are progressively moved behind canonical `authoring.*` tasks and the shared context resolver.

It must not gain new exclusive capabilities. Once authoring parity is complete:

- existing session links open the corresponding chapter/range or a read-only migrated transcript view;
- “收进稿件” disappears because narrative output already belongs to the draft;
- the route redirects new creation to the authoring workspace;
- compatibility export remains until legacy migration support expires.

### 10.3 Unified authoring workspace

Writing becomes the primary editable surface and exposes two lightweight command groups without creating separate pages:

- **写作**: rewrite, expand, shorten, inline completion, annotations, review;
- **推演**: continue, advance, selected-character drive, multi-character scene, event/emergence continuation.

Both groups operate on the same editor, chapter revision, undo history, context inspector, and result transaction layer.

The inspector presents only task-relevant context:

- current scene, cast, relationships, events, timeline and selected materials;
- activated setting/source references for the last request;
- derived conflicts and unresolved annotations;
- current/last AI operation and undo state.

It does not expose a permanent list of internal expert personas.

## 11. Background derived-state architecture

After a manuscript transaction commits, a deterministic scheduler computes which observer tasks are relevant from the changed range. It does not call every observer after every keystroke.

Triggers:

- manual typing: debounce until a stable save/checkpoint, then inspect the changed range;
- AI direct text: schedule immediately after transaction commit;
- rewrite/delete: invalidate observations overlapping the old source range before recomputation;
- bulk import: chunk by chapter/range and apply rate/budget limits.

Observers receive known identity indexes and must return source-located observations. They cannot invent stable IDs; unresolved names become ambiguity exceptions. Results are lower authority than locked/confirmed canon and are automatically available to future context only while their source revision is current.

The first release may retain deterministic worldbook-name matching for obvious entity mentions. Model extraction is added only for relationships, events, aliases, and implicit state where deterministic rules are insufficient.

## 12. Error, recovery, and cancellation

All workflows use typed failures:

- invalid request/target;
- missing required context;
- context budget exhausted;
- provider configuration/unsupported protocol;
- timeout/rate limit/cancelled;
- tool unavailable/tool timeout/tool invalid result;
- response schema/domain validation failure;
- stale target revision;
- locked-authority conflict;
- partial batch failure;
- background observer stale/failed.

Rules:

- cancellation propagates to provider, tools, parser, and queued derived work when possible;
- failed direct-text tasks leave the draft unchanged;
- a failed observer does not block or roll back prose;
- partial settings batches retain individually valid drafts;
- tool evidence and model response are released after validation/receipt creation;
- retry counts are bounded by profile and visible in trace;
- app reload can distinguish a committed text transaction from pending background work.

## 13. Privacy, storage, and observability

The compact task receipt stores:

- request/task/profile/workflow IDs;
- provider/model and bounded parameters;
- target/source IDs and revisions;
- activated block kinds, sourceRefs, activation reasons, char counts and truncation;
- tool names, rounds, typed outcomes and timings;
- output action IDs, resulting revision and undo patch reference;
- failure classification and retry count.

It does not store:

- the complete assembled prompt;
- duplicated source/manuscript prose;
- hidden reasoning;
- streaming fragments;
- rejected candidates after their transient review lifetime;
- provider transport envelopes;
- shadow critic prose.

Trace summaries must support comparison by task family and execution profile without exposing project content. Debug logs are rotated application logs, not permanent novel data.

## 14. Web-first migration

This design changes implementation order, not the final desktop/local-folder product target.

### Phase W0: Contract and inventory lock

- replace declared/executable divergence with one shared production catalog;
- classify every current model call, deterministic extractor, tool, and side effect;
- add aliases for current task names;
- prohibit new page-owned AI calls.

Exit: every live call has a canonical task, workflow kind, context profile, output schema, and effect policy.

### Phase W1: Shared project/context facade

- add Web adapters over existing stores/archive;
- define authority and stable revision reads;
- converge block vocabulary and context ledger;
- keep existing UI and generated behavior unchanged.

Exit: Settings, Experience, and Writing test fixtures can resolve equivalent canon/source identities through the same facade.

### Phase W2: Settings workflow migration

- move import, foundation, candidates, field/section completion, revision, places, research, and maintenance into canonical tasks;
- preserve current review UI and partial failure behavior;
- eliminate duplicate message/timeout/retry ownership.

Exit: no Settings component/service calls raw generation transport outside the execution engine.

### Phase W3: Writing workflow migration

- unify passive completion, advisor fixes, explicit rewrite, and chapter review behind canonical authoring tasks;
- preserve editor transaction, annotation, stale, adoption and undo semantics;
- make the context inspector consume shared ledger data.

Exit: no Writing page-owned prompt builder or competing result lifecycle remains.

### Phase W4: Narrative runtime generalization

- adapt NarrativeKernel into the shared project/context facade while preserving its richer scene/cast/continuity/tool behavior;
- route Experience commands through `authoring.*` tasks;
- keep planning/prose isolation and current production gates.

Exit: Experience runtime behavior passes existing narrative contracts and uses the shared task/context/receipt contracts.

### Phase W5: Unified authoring Web UI

- make the Writing editor the current manuscript surface;
- add the 推演 command group;
- commit narrative output directly as editor transactions;
- retain the old Experience route behind compatibility routing;
- remove the normal “收进稿件” path after parity.

Exit: continue, advance, selected-character drive, multi-character scene, insertion, rewrite, cancellation, stale revision, recovery and undo pass in the Web UI.

### Phase W6: Background observations and exception review

- introduce derived entity/relation/event/timeline jobs;
- invalidate/recompute by source revision;
- auto-use current observations;
- show only exception conflicts/ambiguities.

Exit: ordinary derived changes require no confirmation; locked facts remain protected.

### Phase W7: Compatibility cleanup

- remove obsolete page-owned context builders and aliases;
- migrate or archive Experience transcripts;
- update docs and known issues;
- keep legacy export until the announced compatibility window ends.

### Phase D: Desktop persistence adapter

Only after W0-W6 behavior gates pass:

- implement project directory, TXT, SQLite, atomic writes, backup, cache, and Electron security boundaries;
- bind the same project facade and task engine to desktop persistence;
- rerun behavior parity plus desktop recovery/packaging gates.

Electron does not receive a separate Agent registry or context implementation.

## 15. Verification and evaluation

### 15.1 Contract coverage

- every UI-visible task exists in the shared production catalog;
- every catalog task has exactly one workflow/profile/schema/effect policy;
- client/server allowlists match;
- every mutation task requires an allowed target and revision;
- forbidden context/tool blocks never appear for a profile;
- result actions cannot exceed effect policy;
- aliases are measurable and cannot create duplicate definitions.

### 15.2 Context coverage

- the same project object resolves to the same stable ID/revision across three surfaces;
- context ledger explains every included/truncated/excluded source;
- locked canon outranks derived/imported evidence;
- unrelated project data does not enter task context;
- narrative JIT tools cannot access mutation APIs;
- expanded context is released and not persisted.

### 15.3 Workflow coverage

Representative provider-protocol tests cover execution profiles rather than multiplying every task by every provider:

- structured one-shot: setting field or local rewrite;
- validated chain: source import/research;
- agent loop: narrative continuation with evidence tool and repair;
- background derive: relationship/event observation with stale rejection;
- shadow observer: timeout/invalid response cannot affect visible text.

MiniMax, OpenAI-compatible, and Anthropic-compatible real-provider gates remain separate from deterministic contract tests.

### 15.4 User-visible Web gates

At 1440, 1024, 390 widths and 200% effective zoom:

- Settings import/review remains usable during partial/error/cancelled/stale states;
- the authoring editor exposes writing and simulation without duplicate global navigation;
- direct AI prose is immediately editable and has one transient Undo;
- context inspector shows activated sources without exposing raw prompts;
- background observations do not interrupt typing;
- conflicts remain reachable by keyboard and do not block unrelated edits;
- the old Experience route opens compatible content until parity retirement.

### 15.5 Release metrics

Track per canonical task/profile:

- success, typed failure, cancellation and stale rates;
- latency, tool rounds, retry count, input/output token ranges;
- context chars by block and truncation frequency;
- draft adoption/dismissal, direct-text undo, exception resolution;
- background observer yield, conflict and invalidation rates.

Metrics contain no manuscript or prompt-derived fingerprint that could reconstruct content.

## 16. Explicit non-goals

- no LLM supervisor call for explicit UI commands;
- no peer agents handing a live user conversation among themselves;
- no independent expert memory stores;
- no model-selected write permissions;
- no permanent chain-of-thought or full prompt archive;
- no all-project context dump;
- no automatic canonical-setting overwrite from imported or manuscript-derived material;
- no default evaluator-optimizer loop for every prose request;
- no simultaneous implementation of Electron-specific and Web-specific task engines;
- no immediate removal of Experience before authoring parity.

## 17. Architecture acceptance criteria

The design is accepted when all statements are agreed:

1. Settings stays a distinct knowledge workspace while sharing the project context runtime.
2. Experience and Writing converge into one editable authoring surface.
3. Experience's mature narrative loop becomes the `narrative-scene` profile.
4. Predictable small tasks remain workflows; only open narrative work receives an agent loop.
5. One project facade owns identity, revision, authority and provenance across all surfaces.
6. One production task catalog is executable on both client and server.
7. One result transaction layer owns every AI-induced durable mutation.
8. Routine derived observations auto-commit below locked canon; exceptions alone request attention.
9. Context is selected sparsely per task and recorded only as a low-sensitivity ledger.
10. Web behavior is implemented and validated before Electron persistence/packaging work resumes.
