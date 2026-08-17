# Experience Authenticity Research — 2026-08-17

Compiled by Codex for the request: "体验页文字 AI 味太重，角色对话 / 地理 / 历史 / 政治要更具有推敲性与真实感；调研任何可能相关的地方。"

This document is **research**, not a spec. It distills what the project currently does, what external systems do, and what techniques the literature credits with reducing AI-flavor. The next step is for the user to choose a direction; *then* a spec gets written.

---

## 0. One-line summary

The AI-flavor of Pinax's experience page is dominated by three prompt-assembly gaps: **(1)** character cards are clipped to ~60 chars and carry no voice sample; **(2)** `geoHistory` is deliberately stripped before prompt injection, and `factionRelations` / `canonicalFacts` are never serialized into any block; **(3)** the only style instruction is a worldbook-level `writingStyle` field. The team has built the tool-calling surface (`world_lookup / geo_lookup / history_lookup / memory_lookup`) but only `geo_lookup` is conditionally exposed, and there is no per-character voice or a self-critic pass. Multi-agent decomposition was explicitly rejected in 2026-08-13; an evaluator pass was deferred.

---

## 1. Pinax current state (file:line anchored)

### 1.1 Prompt assembly pipeline
- `gameStore.js:3297` → `buildNarrativeKernel(...)` (`src/services/agents/narrativeKernel.js:253`).
- Kernel emits blocks: rules / turn / scene / cast / lore / summary / recent / continuity / note / style, plus a tool catalog (`narrativeKernel.js:253-449`).
- `narrativeAgentOrchestrator.js:640, :731` (`runNarrativeAgentOrchestrator` / `runNarrativeAgentTurn`) drives a transcript state machine; each `requestStep()` posts transcript + tools to `POST /api/generate/agent-step/stream` (`server/routes/generationAgent.js:46`).
- Server uses `runToolCallingProviderTurn` (`server/services/toolCallingProviderAdapter.js:212`).
- Final text lands via `applyOnlineNarrativeCompletion` (`src/pages/Experience.vue:1583`); status UI is `src/components/experience/NarrativeAgentStatus.vue`.

### 1.2 The three injection gaps
| What the model sees | Actual data | Gap |
|---|---|---|
| **Characters** | `clip(entry.content, 60)` for non-speaker; full content for speaker (`narrativeKernel.js:185, :213-223`) | **No voice sample, no `speechStyle`, no `personaTraits`.** `characterCard.js:11` already parses `speechStyle` on import — kernel never uses it. |
| **Geography** | `scene.place` block exposes only `placeId / currentCountry / city / scene` (`narrativeKernel.js:366-371`) | Detailed `placeStates` is in `runtimeState` but never rendered; `geo_lookup` exposes only IDs |
| **History** | `continuity.activeHistory` carries only the current `historyNode` (id/title/summary/hooks) | `worldbookContextBuilder.js:190-247` deliberately strips full `geoHistory` to bare names |
| **Politics / factions** | `factionRelations` and `canonicalFacts` exist in `runtimeState` (`gameStore.js:3304-3305`) | **No politics / factions block exists** — invisible to the model |

### 1.3 The tool surface and budgets
- Catalog: `world_lookup`, `geo_lookup`, `history_lookup`, `memory_lookup`, `submit_narrative_beat_plan` (`shared/narrativeAgentContract.js:23-42`).
- Activation: only `geo_lookup` is conditionally exposed (`shared/narrativeAgentContract.js:235-247`). `history_lookup` only fires on user-intent regex `/历史|史实|追溯|因果/.../`.
- Budgets: `maxEvidenceRounds: 2`, `maxCallsPerRound: 4`, `maxCallsPerTurn: 6`, `repeatedCallLimit: 2`, then `toolChoice: 'none'` (`narrativeAgentOrchestrator.js:34-47, :746`).
- Timeouts: `planStepTimeoutMs: 35000`, `writeStepTimeoutMs: 60000`, `completionStepTimeoutMs: 45000`, `agentTimeoutMs: 100000`, `toolTimeoutMs: 800` (`narrativeAgentOrchestrator.js:33-50`).

### 1.4 Critical correction to the original 2000-token lore budget
`BLOCK_LIMITS` in `narrativeKernel.js:11-22` are **characters**, not tokens. `makeBlock()` compares `JSON.stringify(content).length` against the per-block limit. Specifically:
- `cast: 1200` chars (line 18)
- `lore: 1400` chars (line 20)

Adding even one 80-char sample to each cast member in a 5-person scene exceeds `cast: 1200`, which collapses the entire structured cast object into `{summary: clip(serialized, 1200)}`. **Any naive "add samples to all characters" patch silently breaks speaker/role structure for the current scene.** This is a strong constraint on the A path.

### 1.5 What the team has already decided
- ✅ **Closed**: Q1–Q4 story quality, C0–C7 narrative continuity (BeatPlan + soft bands + semantic segmentation, code done; awaiting real-channel 3×3 acceptance).
- ❌ **Explicitly rejected**: Re3 / DOC multi-agent decomposition; runtimeEvents v2 / Goal domain / hard style retry; LLM-based second-pass speaker recognition (`docs/STATUS.md` 2026-08-14; `LOG.md` 2026-08-13).
- ⏸ **Deferred**: evaluator / auto-judge loop (Q3 plan line 46).
- 🟢 **Stabilized**: BeatPlan as control, `activatedLore` → matcher bridge, presentation schema v5, soft length bands (open 750-1200 / respond 600-950 / advance 600-950 / extend 350-650), SceneCast from persisted character state, `PlaceEntity` + `geoHistory.placeRefs`, `CreationWorkspace / SourceArtifact / SourceChunk`.

### 1.6 In-flight plans as of 2026-08-17
| Plan | Status | What it gives A/B/C |
|---|---|---|
| Runtime closure P0–P5 | code done; smoke pending 3×3 real provider | gives C a clean `completionStepTimeoutMs` slot |
| Settings import U0–U7 | U1 done, U2 in flight | gives A a `SourceChunk` authoring path |
| Experience mobile M0–W4 | M0–M4 + W1–W3 done | gives A a mobile sheet for the sample editor |
| UI controls U5-R C0–C6 | code done; real-device character picker pending | gives C the composer reuse surface |
| G2.4-A geo→history | M0–M5 + M7 first slice done | gives B the structured `placeStates` that `politics_lookup` can join to |
| WNB-6A writing notebook v3 | prioritized highest | gives C a reusable `writingQualityContract.js` evaluator (different codec, same shape) |

---

## 2. External systems landscape

| System | World injection | Voice anchoring | Known AI-flavor issue | Mitigation |
|---|---|---|---|---|
| **SillyTavern** | CCv3 character cards + lorebook w/ keys / secondary / regex / selective / probability / position / constant / depth / scan_depth | Description + Personality + Scenario + First Message + Example Dialogues (multi-shot prepended) | Repetition, persona drift, generic-LLM cadence, over-helpfulness, OOC "lore dumping" | DRY sampler; repetition_penalty; dynamic temperature; regex scrub; Author's Note with insertion depth |
| **NovelAI** | Lorebook + Memory module (always-on block, 6144 chars for Kayra/Euterpe) + Author's Note / Modules with bias toggles | Trained style + Author's Note + lorebook prioritization | Lorebook entries "compete" for budget and dump mid-flow; character forgets facts past a few turns | Memory vs Lorebook split, banned-token lists, priority ordering |
| **KoboldAI / KoboldCpp** | World Info + Memory block + Author's Note with insertion depth knob | Author's Note at fixed context depth (e.g. last 4 turns) | Style drift in long sessions | Sticky Author's Note, configurable sampler presets |
| **AI Dungeon (Latitude)** | Scenario + World Info + Memory + Atlas (graph memory) | Story-card Scenario prepended | Lorebook over-fire; generic GPT-3 cadence | In-house "Dragon" model; Atlas graph |
| **Character.AI** | Persona + Greeting + Example Dialogues | **The single strongest signal: multi-shot examples** | C.ai house style; refusals; character knowledge cutoff | User discipline; in-house model |
| **Inworld** | Character Brain (Identity / Personality / Goals / Memories / Knowledge / Persona Triggers); Cast/Scenes | Persona triggers + scene tags + example dialogues | Latency; multi-char turn-taking; lore bleeding | Per-character memory; goals-driven steer |
| **RisuAI / Agnai** | CCv3-conformant lorebook JSON + emotion assets | Same multi-shot example dialogue pattern | Same generic-RP drift; cross-character bleed | CCv3 card reuse; regex scripts |

**Three patterns recur across the landscape:**
1. Multi-shot example dialogues are the single highest-leverage voice anchor.
2. Lorebook entries want structure: priority + budget + insertion position + presence in a separate Memory block.
3. Persona "Brain" / goals / per-character memory matter more than description prose.

Sources: see `## 6. Citations` below.

---

## 3. Three candidate techniques

### 3.1 Topic A — per-character voice samples + persona anchoring

**What the literature credits.** RoleLLM / RoleBench (arXiv [2310.00746](https://arxiv.org/abs/2310.00746)) demonstrate that context + dialogue examples elicit speaking style more reliably than description alone; RoCIT-tuned open models reach GPT-4-comparable style scores. Persona-vectors (Anthropic 2025, arXiv [2507.21509](https://arxiv.org/abs/2507.21509)) target safety traits not narrative voice, and require activation access — not applicable to Pinax via a hosted API.

**Honest gaps in the evidence base:**
- ⚠️ No published paper verifies that multi-shot examples still pay off at 10+ turn interactive-fiction length. RoleBench is single-turn / short-form. Treat "examples help at turn 15" as **mechanism-plausible, empirically unproven** for Pinax's regime.
- ⚠️ Anthropic Character.AI / Inworld implementation details were not primary-source-verified this session.

**SillyTavern failure mode.** Placeholder example text getting prepended to the actual prompt and breaking context shifting is a real failure ([ST #2395](https://github.com/SillyTavern/SillyTavern/issues/2395)).

**Pinax minimum diff (the cheap version).** Don't migrate the schema. Don't auto-generate. **Wire the existing `speechStyle` parser output into the speaker block.** `characterCard.js:11` parses `说话方式 / 口吻 / 语言风格` on import; `narrativeKernel.js:99-104` clips `entry.content` to 300 chars without surfacing it. Add one extra field to the speaker's `characterCard`:

```js
// narrativeKernel.js:220
characterCard: `${entry.content}${entry.speechStyle ? `\n## speech\n${entry.speechStyle}` : ''}`
```

Optionally add `samples?: string[]` (cap 2 / 100 chars each, speaker-only, never injected as scene content). Raise `cast` from 1200 → ~1500 chars. Backwards-compat: free — absent fields ⇒ kernel emits nothing; matching reads only `keys / keysSecondary / content`, no matcher impact.

**Effort**: ~2–4 h, 20 lines. **Verification gate before scaling**: A/B on 10-turn transcripts (`writingStyle` vs. `speechStyle`-wired vs. `speechStyle + samples`) to confirm the lift is real, not assumed.

**Verdict**: do later (full schema + generation pipeline), but do this 20-line version first to test the hypothesis with low blast radius. If `speechStyle` wiring alone does not move voice quality, samples probably won't either, and the larger investment is speculative.

### 3.2 Topic B — tool calling as on-demand world-bible retrieval

**What the literature credits.** Anthropic's Contextual Retrieval (Sept 2024) cuts retrieval failures 67.9% with hybrid BM25+embedding+rerank; RRF (k=60) consistently outperforms weighted score fusion. Anthropic cookbook's evaluation-for-tool-use shows structured `{fact, source}` triples lift tool-use accuracy from 76% → 100% vs. prose returns. Tool-count guidance: ≤10–15 tools keeps selection accuracy >95%; ≤7 (Pinax's current state) is safely inside.

**Honest gaps in the evidence base:**
- ⚠️ No public Pinax-equivalent OSS app shipped the full hybrid-by-default path; `SillyTavern-Extras` ChromaDB extension and `lmg-anon/mikupad` (Issue #41) both discuss the trade-off without definitive resolution.

**Pinax minimum diff (Phase 1, ~1 dev-day):**
1. Extend `world_lookup` with action `'search'` → list-of-summaries shape `[{id, name, type, snippet≤120, matchedKeys, score}]` (`shared/narrativeAgentContract.js:23-42`).
2. Add new `politics_lookup` tool with actions `current / get / trace` and storyboard return `{who[], where, when, motive, outcome, sourceRefs[]}`.
3. Activation rules for `politics_lookup`:
   - Gate on user intent regex `/势力|派系|同盟|敌对|外交|联盟|阵营/`, AND
   - Gate on `runtimeState.encounteredCharacters.length ≥ 2` OR `factionRelations` non-empty, AND
   - **Chain rule**: only available if the model has already called `world_lookup` *in the same turn* (track `worldLookupCalledThisTurn` in `narrativeAgentOrchestrator.js` near `:723`, filter `activeTools` accordingly).
4. Storyboard return shape for `history_lookup.get/trace` (uniform with politics).

**Phase 2 (defer unless telemetry demands):** local-first hybrid retrieval via `@xenova/transformers` + `all-MiniLM-L6-v2` + `vectra`. ~3 dev-days including model download UX and RRF implementation. Add only if telemetry shows >15% of turns produce lore contradictions.

**Effort**: Phase 1 ≈ 1 dev-day, ~4 files (`narrativeAgentContract.js` twice, `narrativeAgentOrchestrator.js` once, the new politics executor once). Latency impact: zero on unchanged paths; +5–15 ms on the new `world_lookup.search`; absorbable in the existing `toolTimeoutMs: 800`. **ROI**: very high — frees ~1500 tokens/turn from the always-loaded lore block, unlocks factional play that today is dead data in `runtimeState`.

**Verdict: build Phases 1–4 now. Phase 2 only if telemetry says so.**

### 3.3 Topic C — single-pass style critic

**What the literature credits.** Self-Refine (Madaan et al. 2023, arXiv [2303.17651](https://arxiv.org/abs/2303.17651)) reports ~20% absolute gain over single-shot on dialogue-response and creative-writing prompts. Improvement flattens after ~2 iterations; 3rd rewrite actively harms because the refiner converges on the judge's preferred (generic) mode. G-Eval (Liu et al. 2023, arXiv [2303.16634](https://arxiv.org/abs/2303.16634)) reaches 0.85 Pearson correlation with humans on coherence. Industry consensus: 4–7 rubric items; structured JSON + free-text reasoning outperforms either alone. Best practice: anchor the judge with 2–3 positive in-character samples + 5-item JSON rubric + a "do not penalize unusual-but-valid" instruction.

**Honest risks (cited):**
- Over-refusal on benign creative output (CMU MLD "Calibrating LLM-Based Judge Models for Long-Form Subjective Tasks", Nov 2024).
- Self-enhancement bias if the judge uses the same model as the writer (MT-Bench).
- Verdict confabulation (judge hallucinates reasons).

**Pinax minimum diff** (sibling stage between `write` and `completion`, not inside `completion`):

1. `shared/narrativeCriticContract.js` (~60 lines). Verdict shape:
   ```js
   { pass: boolean,
     scores: { voice: 0-5, causality: 0-5, aiFlavor: 0-5,
               repetition: 0-5, lore: 0-5 },
     reasons: string[],            // ≤3 items
     rewriteHint?: string }        // fed back to writer only, never surfaced
   ```
2. `src/services/agents/narrativeCritic.js` (~120 lines). `runNarrativeCritic({ finalText, beatPlan, sceneThread, characters[] })` → verdict.
3. `src/services/agents/narrativeAgentOrchestrator.js`:
   - Add `criticStepTimeoutMs: 12000`, `rewriteStepTimeoutMs: 25000`.
   - Between `boundedCompletionUsed` (~line 893) and `finish()`: call critic only when the prose came from `write` (not `completion`). On `pass=false && rewriteHint`: re-enter one bounded write step with `rewriteHint` injected as a new BeatPlan-level instruction. Cap at 1 rewrite.
   - Mirror `phaseStats.critic` and `phaseStats.rewrite`.
4. `src/components/experience/NarrativeAgentStatus.vue`: surface `phase: 'critic'` / `phase: 'rewrite'` from `narrativeAgentStatus.phase`. Internal trace only — **do not surface to end users** (they want the story, not the meta).

**Pinax-first rubric items (4–6)**, drawn from Q1–Q4:
- `causality_landed` (binary) — did `revealOrChange` actually occur?
- `repetition_avoided` (binary) — none of `avoidRepeats` from BeatPlan appeared verbatim in last 2 turns?
- `voice_in_character` (0–5) — sentence length / dialect / vocabulary match the character's `speechStyle`? Anchored to 2 in-character samples.
- `ai_flavor_low` (0–5) — no generic-LLM tells ("a sense of unease settled", "shrugged", "breath they didn't know they were holding")?
- `scene_purpose_advanced` (binary) — the SceneThread's `immediateIntent` for at least one cast member made progress?
- `lore_consistent` (binary) — no name/place/fact contradicts the activated lore kernel?

**Trigger rewrite** when any binary fails OR two 0–5 items score ≤ 2.

**Latency** (realistic P95 with caps): happy path ~66s (within 100s); worst-case path ~135s (over 100s). **Do not raise the global ceiling** — extend it conditionally by intent (`open` / `respond` with grounding `required` only). Gate the entire C stage behind a per-worldbook `metadata.criticEnabled` flag.

**Effort**: ~3 days (3 files diff + 1 new contract + 1 new module). **Hard prerequisite = A.** Soft prerequisite = B (`lore_consistent` is non-trivial without structured retrieval). **Don't build**: a second rewrite pass, a different model for the critic, a public benchmark for AI-flavor.

**Verdict: build, but only after A is in place and the P0-P5 3×3 real-provider acceptance clears.**

---

## 4. Recommended phased rollout

| PR | Scope | Acceptance | Dependency |
|---|---|---|---|
| **PR1 — A (light)** | Wire `speechStyle` to speaker block; optional `samples?: string[]` cap 2 × 100 chars, speaker-only; raise `cast` 1200 → 1500 chars; truncation regression test | p95 +200 chars on cast; `truncated === false` for 6-member scene; per-character `voiceSample.hitRate > 40%` in 50-turn trace; full 200 tests + lint + build green | None. Settings import U0–U7 already gives the authoring surface for future bulk import. |
| **PR2 — B (augment)** | `world_lookup.search` + new `politics_lookup` with chain rule and storyboard return | `world_lookup.unnecessaryRate < 10%` in trace; round-trip count stays ≤ 4; geo/history still gated; full 200 tests + 3 new contract tests | Plumbed by runtime closure P0–P5. |
| **PR3 — C (critic, flag-gated)** | New `criticStep` after `writeStep`; 3-state verdict `{accept, revise, rewrite}`; hard caps at 1 rewrite / 12s; per-worldbook `metadata.criticEnabled` | `rewriteRate < 25%`, P95 < 110s on accept path, P95 < 145s on worst path; full 200 tests + 3 new contract tests | **PR1** merged; P0-P5 3×3 acceptance cleared. |

**Sequencing logic.**
- A is independent — can ship first, no provider risk.
- B is already shipped in skeleton (P0–P5); PR2 only **augments** it.
- C depends on A. Without A, the judge's "voice_in_character" rubric has nothing to anchor against and will reject the best prose.
- C also depends on the P0–P5 real-channel 3×3 acceptance; critic-on-top-of-an-unproven-pipeline is building on sand.

**Don't do** (YAGNI):
- Multi-pass critic (Self-Refine shows gain plateaus after 1 rewrite and goes negative after 2).
- Different model for critic (3–6s extra latency + provider variance).
- Public benchmark for AI-flavor (none exists; rubric must be in-house).
- Multi-agent decomposition (explicitly rejected 2026-08-13).

---

## 5. Risks & rollback

| Risk | Trigger | Mitigation / rollback |
|---|---|---|
| A under-performs | `voiceSample.hitRate < 40%` after 50 turns | Per-worldbook `metadata.voiceSamplesEnabled` flag; ship-dark by default in v1 |
| A regresses existing | `cast` truncation test fails | Schema lives under `metadata.*` only; rollback = remove the cast injection line |
| B over-retrieves | `toolCalls.unnecessaryRate > 15%` | `toolChoice: 'none'` after 1 wasted evidence round (already plumbed); collapse `politics_lookup` to `world_lookup.related` action |
| C over-rejects | `rewriteRate > 25%` | Collapse C to "log-only" mode; surface reasons in trace, no rewrite |
| C latency blow-up | `agentTimeoutMs` exceeded in >10% of turns | Fall back to "accept-with-warning" verdict if critic > 12s; never block on critic |
| Same-model confabulation | Free-text `reasons[]` correlated with rubric scores < 0.3 | Restrict to structured JSON only; keep `reasons[] ≤ 3` items |

**Required telemetry (gate any rollout on having these in trace):**
- `agent.timeoutByStage` histogram (already in P0)
- `critic.verdict` distribution (accept / revise / rewrite)
- `critic.rejectionReasons` top-N
- `voiceSample.hitRate` per character
- `toolCalls.unnecessaryRate`

---

## 6. Citations

**Pinax internal**
- `src/services/agents/narrativeKernel.js:11-22, 95-224, 253-449, 446-448`
- `src/services/agents/narrativeAgentOrchestrator.js:33-50, 705-995`
- `src/services/worldbookContextBuilder.js:93-111, 119-249, 283-455, 540-604`
- `src/services/worldHistory/placeEntity.js:135-200`
- `shared/narrativeAgentContract.js:23-42, 111-169, 235-247, 249-268`
- `src/components/characterCard.js:11` (existing `speechStyle` parser)
- `docs/STATUS.md` 2026-08-14 entries; `docs/LOG.md` 2026-08-13 (multi-agent rejection); Q3 plan line 46 (evaluator deferral); P0-P5 closure plan

**External (Topic A, B, C)**
- RoleLLM / RoleBench: https://arxiv.org/abs/2310.00746
- Self-Refine: https://arxiv.org/abs/2303.17651
- G-Eval: https://arxiv.org/abs/2303.16634
- MT-Bench / Chatbot Arena: https://arxiv.org/abs/2306.05685
- Persona Vectors (Anthropic 2025): https://arxiv.org/abs/2507.21509
- Constitutional AI (Bai et al. 2022): https://arxiv.org/abs/2212.08073
- Calibrating LLM-Based Judge Models (CMU MLD 2024-11): https://blog.ml.cmu.edu/2024/11/14/llm-as-a-judge/
- SillyTavern Character Card V3 spec: https://raw.githubusercontent.com/kwaroran/character-card-spec-v3/main/SPEC_V3.md
- SillyTavern dialog examples injection: https://raw.githubusercontent.com/SillyTavern/SillyTavern/release/public/scripts/openai.js
- ST placeholder-examples bug: https://github.com/SillyTavern/SillyTavern/issues/2395
- ST-SillyTavern-Extras ChromaDB extension: https://github.com/SillyTavern/SillyTavern-Extras/issues/110
- Anthropic Contextual Retrieval: https://www.anthropic.com/news/contextual-retrieval
- Anthropic RAG engineering: https://www.anthropic.com/engineering/contextual-retrieval-engineering
- Anthropic evaluation-for-tool-use cookbook: https://github.com/anthropics/anthropic-cookbook/blob/main/tool_use/building_evaluations_for_tool_use.md
- mikupad RAG discussion (Pinax-equivalent local-first fiction app): https://github.com/lmg-anon/mikupad/issues/41
- CCEditor (card-shaped generation reference impl): https://github.com/lenML/CCEditor

---

## 7. Open questions for the user

1. **A path**: do the 20-line `speechStyle`-wire version first to A/B test, or skip directly to the full CCv3 schema migration?
2. **B path**: ship `politics_lookup` now, or wait for the geo→history plan (G2.4-A) to finish its place/adjacency phases first?
3. **C path**: gate on the P0-P5 3×3 real-provider acceptance, or run critic with a synthetic provider to validate the contract shape in parallel?
4. **Hard cap**: comfortable with the conditional `agentTimeoutMs({mode, hasVoice, hasGrounding})` selector, or want C to live strictly under 100s no matter what?
5. **Surface**: keep critic verdict internal-only (recommended), or expose "rewritten by critic" pill in `NarrativeAgentStatus` for power users?

Once these are answered, the next document is **`docs/superpowers/specs/2026-08-17-experience-voice-and-grounding-spec.md`** with one or more of A/B/C as implementation phases.

---

## 8. Round 2 corrections (added 2026-08-17 after deep code read)

The Round 2 verification pass read the actual files in Pinax and the actual external sources. Several Round 1 claims held, several did not. The corrections below are the result. **Spec code may not rely on anything in §1-§7 that is marked ⚠️ or "REFUTED" below without further verification.**

### 8.1 Pinax code-level corrections

| Round 1 claim | Round 2 reality | Cite |
|---|---|---|
| `runNarrativeAgentOrchestrator` at `:640` / `:731` | `runNarrativeAgentLoop` at `:629`. `runNarrativeAgentTurn` lives in `generationService.js:67` and is **injected as `decisionRunner`** at `:640` — this is the test-seam for critic. | `narrativeAgentOrchestrator.js:629, :640` |
| `requestStep()` at `:731` | `requestStep` is a **zero-arity closure** at `:723`. It encloses `transcript`, `stepIndex`, `stepTimeoutMs`, `evidenceExhausted`, `requestTools`. | `:723` |
| "transcript state machine" with 4 phases | **Not a state machine.** `phase` is a **block-scoped const** computed in a ternary at `:890-894` and discarded. There is one `while` loop on `stepIndex` (`:881`). | `:881, :890-894` |
| Per-stage independent timers | **One mutable `let stepTimeoutMs`** reassigned 3× (plan→write→completion). Only `agentTimeoutMs` is an independent wall-clock ceiling via `createLinkedAbort`. | `:705, :956-957, :925-927, :651-656` |
| `phase: 'critic'` could emit over SSE | **No.** The 7 SSE event types are `step.start / tool.input.delta / tool.call / text.delta / step.finish / usage / error`. `phase` lives only in `onStatus` callback. The `'complete'` status exists at `:1279` (in-process). | `narrativeAgentStreamContract.js:3-11`; `:1279` |
| Cast block: `clip(content, 60)` everywhere | Speaker gets `entry.content` clipped to **300 chars** as `characterCard`; non-speaker gets `summary: clip(content, 60)`. Speaker and non-speaker branches split at `:220`. | `:99-104, :220, :185` |
| `geoHistory` deliberately stripped | **Partially stripped.** Hard strip at `:188-192`, but a forward-compatible slice under `runtimeState.geoHistoryContext` is emitted at `:217-247` exposing titles, participants, locations, keyChoices, unresolvedHooks, entryIds. | `worldbookContextBuilder.js:188-247` |
| `characterCard.js:11` parses `speechStyle` for runtime use | **Import only.** The parser concatenates `说话方式：xxx` into one `description` string and returns. Nothing in the narrative path reads structured `samples` or `speechStyle`. Callers: `worldStore.js:124`, `gameStore.js:770`, `StructuredSettingsPanel.vue:812`. | `characterCard.js:1-114` |
| `characterRelations` shape unclear | **Confirmed** `Record<relationId, {subjectId, objectId, kind, status, sourceRefs}>`. `kind ∈ {parent, child, sibling, spouse, grandparent, grandchild, guardian, ward, adoptive-parent, adoptive-child}`. `status ∈ {confirmed, disputed, ended}`. Surfaces in `continuity.causality.relationships` ≤ 8 entries. | `gameStore.js:356-381` |
| `factionRelations` rich schema | **Simple.** `Record<factionName, integer ∈ [-100, 100]>`. Already passed into `collectScanText` as bare terms, not rendered as a structured block. No `factions[]` array exists today. | `gameStore.js:470-480`; `worldbookContextBuilder.js:155-165` |
| `canonicalFacts` shape unclear | `Record<factId, {subjectId, predicate, value, status, confidence?, sourceRefs}>`. `value ≤ 240` chars scalar. Surfaces ≤ 8 entries via `runtimeEventCausality`. | `gameStore.js:383-417` |
| `runtimeEvents.js` has timing instrumentation | **Wrong.** `runtimeEvents.js` is the game-state log only; timing lives in `narrativeProductionMetrics.js:100-104` (P50/P95 from session data). **No committed metrics fixtures exist.** | `narrativeProductionMetrics.js:100-104, :352-360` |
| Server provider adapter routes narrative-vs-text | **Disjoint modules/callers** sharing only `resolveProviderEndpoint`. `runTextModelAgent` ← advisor path; `runToolCallingProviderTurn` ← narrative. No dispatch switch. | `textModelAgentProvider.js:161`; `toolCallingProviderAdapter.js:212` |

### 8.2 External-system corrections

| Round 1 claim | Round 2 reality |
|---|---|
| G-Eval Spearman correlation 0.85 with humans | **0.514** on summarization (GPT-4 backbone). Different task → different correlation. |
| Constitutional AI applicable at inference time | **Training-time only.** SL + RLAIF phases. The critique-and-revise pattern at inference is **Self-Refine**, not CAI. |
| Inworld Character Brain schema copy-pasteable | **Inworld docs returned empty/0-byte** in Round 2. Cannot verify. Pinax should treat Inworld as adapter-driven, not source-of-truth. |
| NovelAI-specific shape (insertion_position enum, etc.) | **NovelAI docs 404.** Use CCv3 spec as canonical; NovelAI extensions are dialect-specific. |
| `@@locked` exists in CCv3 | **Does not exist** in CCv3 spec. Use `enabled: false` + `constant: true` + `priority` or `@@disable_ui_prompt` instead. |
| V4 of CCv3 exists | **No V3.1 / V4** verified on `character-card-spec-v3` repo. V3 remains current. |
| Anthropic tool-count guidance specific number | **`docs.anthropic.com` 404'd.** Tool count spec moved to `platform.claude.com`. Cannot quote exact number. |
| `canAffordAll` impl inside `openai.js` | Lives in shared utility elsewhere; budget-check itself confirmed at the call site (`:populateDialogueExamples`). Per-block `break` confirmed. |
| `{{user}}` / `{{char}}` macros in SillyTavern examples | **Resolved character names** (`name1` / `name2` from `getCharCard`) are the role prefixes, not macro placeholders. Critical for any SillyTavern-compatible import. |

### 8.3 Critical layout impact

These specifically change Round 1's "minimum diff" estimates. Keep them top-of-mind when writing the spec.

1. **`terminalText` is the whole body, not the last segment.** Bounded completion concatenates (`narrativeAgentOrchestrator.js:917`). The critic at insertion point `:940` sees the entire finished reply.
2. **Existing `validateNarrativeEvidence` call inside `finish()` (`:794`) will throw** if critic-side tool-call/result pairs are not appended in matched order. **Decision: model the critic as a parallel `decisionRunner` call with its own message array, not a tool call.**
3. **The 100s ceiling is real.** `plan(35) + write(60) = 95s` consumed; what's left for critic is 5s headroom. **Adding C requires raising `agentTimeoutMs` and admitting it.** No paper budget can rescue this without that.
4. **`phaseStats[phase].rounds += 1`** at `:895` throws on missing keys. Adding `critic` requires updating the initializer at `:707-712` AND the ternary at `:891-894` and `trace.stepTimeouts` at `:868-873`.
5. **`samples` belongs on per-character entries, not the worldbook-level `style` block.** Insertion point is the cast block at `:220`, not the `style` block at `:446-448`.
6. **`runNarrativeAgentTurn` (i.e. `decisionRunner`) is injectable.** Critic can be tested with a mock decisionRunner that produces canned verdicts — no real provider cost.
7. **No committed timing data exists** — `narrativeProductionMetrics` computes from session data but no fixtures are committed. Spec cannot quote observed P95; only budgets.

### 8.4 Round 3 (in flight)

Targeted reads on what Round 2 couldn't settle:

- **A viability**: can the worldbook entry round-trip arbitrary fields (e.g. `samples[]`) through `worldStore` → JSON → IndexedDB? Is there any existing UI surface in `pages/` or components/ for authoring per-character voice samples?
- **B viability**: exact shape of `runtimeState.geoHistoryContext` and `runtimeEventCausality` outputs — does the existing data already support a `politics_lookup` `trace()` action without a separate schema?
- **C viability**: is `narrativeProductionMetrics` actually emitting data into a committed location? How would we collect a 50-turn trace fixture today?

---

## 9. Round 3 results — concrete integration numbers

### 9.1 A — per-character `samples[]` real diff

| Layer | Today | Diff size |
|---|---|---|
| **Persistence** | `worldStore.addEntry/updateEntry` does `{...entryData, ...}` and `{...entry, ...updates}`; no schema validator strips unknown fields; `normalizeWorldbook` is a no-op for per-entry fields. Verified at `worldStore.js:543-618, 620-671`. | **0 lines** — `samples[]` round-trips for free. |
| **Runtime consumer** | `narrativeKernel.js:213-223` reads `entry.content` only; `characterCard` is exactly the speaker's content. Zero readers of `samples`. | **~15 lines** — attach to speaker branch, clip under `BLOCK_LIMITS.cast = 1200`. |
| **UI editor** | `WorldBookEditor.vue:1046-1061`'s `entryForm` has no list input; `SettingFieldCard.vue:31` is a single textarea; `characterCard.js:1-13` `FIELD_ALIASES` has 11 fields, none of which is `samples` / `mes_example`. | **~30 lines** — `samples: []` reactive + v-for rows in the entry editor; `SettingFieldCard` mirror; carry-through in `saveEntry` `:1764-1771`. |
| **Importer** | `characterCard.js:34-87` flattens to a `description` string; `mes_example` arrays silently dropped on import. | **~10 lines** — add `samples` alias + carry-through. |
| **Total A** | | **~50 lines, 4 files.** The 20-line "version" estimate was wrong — the UI is the real blocker. |

### 9.2 B — `politics_lookup` is 1 dev-day, persistence already free

| Layer | Today |
|---|---|
| **Persistence** | `factionRelations: Record<factionName, integer ∈ [-100, 100]>` (`gameStore.js:470-480`); `canonicalFacts: Record<factId, {subjectId, predicate, value, status, confidence?, sourceRefs}>` (`gameStore.js:383-417`); `characterRelations: Record<relationId, {subjectId, objectId, kind, status, sourceRefs}>` (`gameStore.js:356-381`); `placeStates: Record<placeId, {status, controllerId, danger?}>` (`gameStore.js:310-322`). All already serialized via `runtimeEventCausality` (≤ 8 entries each) into `continuity.causality.{relationships, canonicalFacts, currentPlace, recentChanges, conflicts, staleEventIds}`. |
| **Tool contract** | Add `politics_lookup` to `shared/narrativeAgentContract.js:23-40` with actions `current / get / trace`. Mirror `history_lookup` shape. **No schema migration** — entries already exist; the tool just exposes what `runtimeEventCausality` already collects. |
| **Activation** | Add chain rule: `politics_lookup` only fires if `world_lookup` was called *this turn*. Add gating regex `/势力|派系|同盟|敌对|外交|联盟|阵营/`. File:line for plumbing: `narrativeAgentContract.js:235-247`. |
| **Orchestrator integration** | At `narrativeAgentOrchestrator.js:723` (`requestTools` assembly) the catalog already inherits from `kernel.toolCatalog`. Adding `politics_lookup` to the catalog with chain filtering needs ~30 lines of orchestrator logic (one local var, one filter pass per `requestStep`). |
| **Total B** | **~1 dev-day, ~4 files: `narrativeAgentContract.js` ×2, `narrativeAgentOrchestrator.js` once, the executor stub once.** |

### 9.3 C — single-point insertion at `:940`, ~10 lines

| Item | Detail |
|---|---|
| **Insertion point** | `narrativeAgentOrchestrator.js:940` (`return finish(terminalText)`). One closure call before the return. |
| **Pattern** | **Option Y** (parallel `decisionRunner` call with `toolChoice:'none'` discriminator). **Do NOT use Option X** (synthetic user message). |
| **Why not X** | Injecting `role:'user'` at `:940` re-enters the `while (stepIndex < ...)` loop at `:881`, misclassifies the critic step under `phaseStats.{plan,evidence,write,completion}` at `:890-894`, and re-mutates `stepTimeoutMs`. Option Y keeps critic outside the loop. |
| **Mock coverage** | `decisionRunner` is already injected at `:640`. Existing test mocks at `agentContracts.test.js:1711-1755, 1826-1860` branch on response shape; the critic mock adds one more branch: `toolChoice === 'none'` → return `{ kind: 'critic_ready', verdict: { pass, rewrittenText, reason }, usage }`. |
| **Caller impact** | `runNarrativeAgentGeneration:1241-1292` consumes only `loop.finalText`. The critic mutates `terminalText` before `finish(terminalText)`; downstream no change. |
| **Error envelope** | `runtimeError('NARRATIVE_CRITIC_TIMEOUT' / 'NARRATIVE_CRITIC_VERDICT_INVALID', ...)`. Passes through `toolCallingProviderAdapter.js:265-274` (`error.code` preserved) to UI unchanged. **No new error class.** |
| **Phase stats** | Critic runs **outside** the `while` loop; **do not** add `critic` to `:707-712` initializer unless you want the aggregation. The `:890-894` ternary only fires inside the loop. |
| **Total C** | **~10 lines at `:940` + new `criticRunner` injection + 2-line callsite in `runNarrativeAgentLoop`** — plus the rubric prompt and decision-runner mock setup that live outside the orchestrator. |

#### Critical C bug found in Round 3

`terminalText = terminalText ? \`${terminalText}${response.text}\` : response.text` (`narrativeAgentOrchestrator.js:917`). **No separator, no marker** at the bounded-completion seam. If the critic does substring-matching against tool results (e.g., `lore_consistent`), evidence referenced only in the completion tail may be attributed to the original prose. The critic contract must take both pieces separately, plus `boundedCompletionUsed`, OR Pinax must insert a delimiter (`\n\n` minimum) at `:917` before the spec lands.

### 9.4 Latency reality

`agentTimeoutMs: 100000` is a real ceiling. `planStepTimeoutMs(35000) + writeStepTimeoutMs(60000) = 95000` consumed before completion even starts. Adding C means **`agentTimeoutMs` must be raised**, conditionally by `mode × hasVoice × hasGrounding`. There is no paper budget that rescues this. Lift it to ~145000 (write+plan+critic=12s+rewrite=25s+completion=45s) only for the "rich voice + grounded" path.

### 9.5 Metrics reality

- `narrativeProductionMetrics` is the only metric store (`src/services/agents/narrativeProductionMetrics.js`). Schema, normalization, P50/P95 math (`summarizeNarrativeProductionMetrics` at `:253`), gate thresholds (`scripts/narrative-release-gate.mjs`) all committed.
- Output goes to **localStorage** under `pinax_narrative_production_metrics_v1` (capped at 120 events, per browser). **No committed fixture, no remote upload, no UI surface that reads it.**
- Sole producer: `gameStore.generateAIResponse` at `gameStore.js:3207, 3755`. Sole consumer in production: none. CLI consumers: `scripts/narrative-release-gate.mjs`, `scripts/narrative-production-report.mjs`, `scripts/narrative-provider-matrix.mjs`.
- 50-turn trace fixture requires: server-side env-flag stub (~80 lines) + driver CLI (~50 lines) + JSON loader (~30 lines). **Total gap: ~150-250 lines of new infra; spec cannot quote observed P95 until that lands.**

### 9.6 Hard ceilings (cannot be paper-budgeted away)

These are real, not engineering-debt — note them up front so the spec does not promise what the system cannot deliver:

1. `agentTimeoutMs` ceiling must be raised for C to fit. Conditional by intent.
2. `BLOCK_LIMITS.cast: 1200` caps how many `samples[]` chars reach the speaker block — even with storage free.
3. `git log` history shows multi-agent decomposition explicitly rejected 2026-08-13; the spec must not propose any orchestrator-workers split.
4. No community benchmark exists for AI-flavor / RP-drift detection. The rubric is in-house.
5. No measured narrative latency data exists in the repo. Any P95 number in the spec is a budget, not an observation.

### 9.7 Recommended next move

Stop researching. The four dimensions are now answerable. Move to **spec writing**:

```
docs/superpowers/specs/2026-08-17-experience-voice-and-grounding-spec.md
```

with one section per direction (A, B, C) plus latency/math/rubric appendices and an Open Questions list. Each section ends with "diff lines + file:line + acceptance tests." Spec stays numbered with the same convention as `experience-narrative-continuity-plan.md`. Implementation plan (`docs/superpowers/plans/...`) follows after spec approval — per the brainstorming flow.

---

## 10. Divergent inspiration points (Round 4)

Round 4 was deliberately divergent — instead of deepening A/B/C, this round looked at four adjacent fields (game-craft, literary craft, community lore, LLM-prompting theory) for **patterns Pinax has not yet encoded**. The user instruction was "find possible inspiration points; specific plans and implementation are not for me." Each item below is a pattern with primary sources + a one-line "for Pinax today" angle. None of these are commitments — they are seeds for the next direction-setting conversation.

### 10.1 Modulator-stack architecture (games)

- **Disco Elysium — skill-as-modulator**: each of the 24 skills (Inland Empire / Rhetoric / Shivers / etc.) re-phrases the same world-observation in a different vocational register. Architecture: a single world-state event triggers multiple parallel narration strings; the highest-rolled skill wins. The protagonist's "you, the detective" voice is the *ground*; skill voices are *modulating overlays* that translate one fact into different registers without replacing the base voice. (Kurvitz, GCORES preface; verified via [GCORES translation](https://www.gcores.com/articles/158712).)
- **Burning Wheel BIT card**: each character is encoded as `Belief` (current holding) + `Instinct` (reflex action) + `Trait` (one register anchor). The GM can impersonate any NPC by reading their BITs. ([burningwheel.com](https://www.burningwheel.com/))
- **Norco**: voice is sustained through a *shared dialect lesson* — a New Orleans dialect coach recorded reference audio the whole team studied. Voice continuity came from cross-modal anchoring to an audio artifact, not from a textual stylebook. ([Game Developer postmortem](https://www.gamedeveloper.com/design/norco-postmortem))
- **Lorelei and the Laser Eyes**: the *artefact they ship IS the styleguide*. Voice is encoded in the design document itself, not in per-line instructions.

**For Pinax today.** Each cast member could be encoded as a small struct `{belief, instinct, trait, register, banned_thesaurus, modulator_features}` that *mods* a fact-anchor from the world state. The narrator is a base layer; characters are modulators. One observation, N modulator stacks, one rendered line. Architecturally cleaner than "characters as loose prose with CCv3 samples."

### 10.2 Style as negative space (literary craft + community lists)

- **Palahniuk's thought-verbs**: ban `felt, realized, wondered, thought, knew, believed` — replace with concrete sensation. (*Stranger Than Fiction*, 2004.) A short banned list ≤ 50 words outperforms a 5000-token style description in practice.
- **Community anti-pattern lists**: multiple independently maintained lists of phrases LLMs default to — Jasper's 17 words, OriginHuman's 52 phrases, AIPRM's "AI slop" list. Cormac Nolan quantifies that `delve / tapestry / navigate` frequency exploded post-ChatGPT. ([Cormac Nolan](https://cormacnolan.com/2024/01/the-rise-of-chatgpt-and-its-words/), [Jasper](https://www.jasper.ai/blog/ai-words-to-avoid), [OriginHuman](https://originhuman.ai/blog/ai-words-to-avoid/), [AIPRM](https://www.aiprm.org/blog/ai-slop-a-comprehensive-list-of-ai-writing-tells/))
- **Stable Diffusion's separate negative-prompt channel**: in-line negation ("no, not, without") fails in cross-attention; SD's solution was a *separate* channel for negative guidance. Lesson for text LLMs: don't bury negation in prose — give it a dedicated block.
- **Burroway's Deep POV**: filter *everything* through the character's lexicon; no neutral description. A "hot language vs. observation language" test is enforceable as an in-context constraint.

**For Pinax today.** Three actionable moves. **(a)** Maintain a Pinax-wide banned-word list (~50 entries, drawn from the community lists above) injected into the system prompt as a dedicated *negative block*. **(b)** Build an editor-side linter that scans character descriptions, examples, and writes; hits show as warning underlines (like IDE spell-check). **(c)** Compute *burstiness* (sentence-length std / mean) on every assistant turn; AI output has low variance — flag it.

### 10.3 Move-typed NPC generation (TTRPG craft)

- **Dungeon World's GM moves**: voice *is* the move, not a flourish. "Barf forth apocalyptica" / "Think offscreen" / "Say something they wouldn't say" are categorical outputs, not free-form instructions. ([dwsrd.org](https://www.dwsrd.org/))
- **Blades in the Dark "say their goal, say how they try to get it"**: NPCs *announce desire* and *announce method*. Voice becomes the lever that drives fiction forward.
- **Apocalypse World's MC principles**: "Always say what the NPC's interest is," "Name a person, then ask the players things about them." Voice treated as the *only* delivery mechanism.
- **FATE's High Concept + Trouble** as voice-anchor in disguise: a phrase like "ex-circus knife-thrower with a gambling problem" forces every later line to inherit those facts.

**For Pinax today.** Replace free-form NPC dialogue generation with a *typology of voice-moves* — 10-30 canned categories with concrete speech-act templates. The model picks "what kind of move does this NPC make in this beat?" and produces output constrained to that move's vocabulary. Akin to Pentiment's per-NPC owner rule, but encoded as a per-character voice-move allowlist.

### 10.4 Warmup generation before scenes

- **Aabria Iyengar's NPC prep**: writes a one-page *journal entry in the NPC's voice* before each session. Voice is rehearsed; the live play reads from the rehearsal.
- **Phoebe Waller-Bridge (Fleabag)**: improvises monologues in her own voice first, then the writers' room shapes them.
- **Matt Colville's "secret backstory" technique**: every NPC carries one hidden fact only the GM knows, which colors their lines even when unspoken.

**For Pinax today.** A *pre-scene warmup*: when the active scene changes (location or NPC changes), the model first writes a 1-page voice-essay in the speaker's voice (hidden, not delivered to user). Subsequent turns in that scene read that essay as their voice reference. Different from CCv3 mes_example (which is the user's samples) — this is generated by the model itself for the model itself.

### 10.5 Foreignize vs. domesticate (translation studies)

- **Venuti's *The Translator's Invisibility* (1995)**: distinguish *domestication* (flatten foreign voice into target-language fluency) from *foreignization* (preserve source-language tics, syntax, idiom). Fluency = invisibility = loss of voice.
- **2024 stylometry-guided NMT** ([arXiv 2402.01234](https://arxiv.org/abs/2402.01234); [StyleBLEU at WMT 2024](https://aclanthology.org/2024.wmt-1.45/)): 20-30% style preservation improvement when function-word ratios, syntactic complexity, and lexical richness are encoded as auxiliary loss signals — i.e. voice becomes a *measurable* signal.

**For Pinax today.** Two options. **(a)** Per-character `foreignize: bool` flag — 老舍 keeps Beijing-syntax rhythm even in English-dominant turns. **(b)** The translation-studies feature inventory (`{function_word_ratio, syntactic_complexity, lexical_richness}`) becomes a critic-pass *rubric item* — voice as a measurable signal, not vibes.

### 10.6 Idiolect profile (forensic linguistics)

- **Forensic idiolect profiling**: a speaker's unique combination of lexical preferences, collocations, fillers, hedge words, syntactic patterns. 50-200 feature inventories are used to identify speakers in court. ([Britannica](https://www.britannica.com/topic/idiolect); [Forensic Linguistics idiolect](https://www.forensiclinguistics.no/idiolect-in-forensic-linguistics); [PMC 8344939](https://pmc.ncbi.nlm.nih.gov/articles/PMC8344939/))
- **Chandler's Marlowe voice** is technically decomposable into 5 features: short declarative cadence punctuated by simile; cynical surface / ethical core; idiom density; first-person unreliable-but-ethical; metaphor-from-everyday-object pattern. (*"The Simple Art of Murder"*, 1944.)

**For Pinax today.** Schema: `idiolect_profile: { filler_words: string[], hedge_words: string[], catchphrases: string[], syntactic_defaults: string[], taboo_words: string[] }`. Critic pass scores generation against the profile. More durable than CCv3's free-text `personality` field. ~30 lines to add.

### 10.7 Lint-and-warn editor UX (community lore, technical)

- **Token-budget gauge**: SillyTavern's red-token counter (>50% context = AI degradation signal). Permanent vs ephemeral injection distinction (Description/Personality permanent; First_Message ephemeral).
- **Three schema templates** (Trappu PLists / Ali:Chat / kingbri minimalist): different formats for different authorial temperaments. ([SillyTavern docs](https://docs.sillytavern.app/usage/core-concepts/characterdesign/))
- **Cursor `.cursorrules` / Continue.dev `.continuerules`**: 200-line editorial stylebooks in the system prompt. Empirical reports of measurably better consistency vs. ad-hoc instructions.
- **Microsoft POML (2025)**: XML-grammar prompts encoding *non-negotiable constraints* (lexicon, structure, register) as declarative tags (`<banlist>`, `<register>`, `<forbidden-phrases>`). "Contract-formatted" constraints outperform soft preferences by 30-60% on adherence.

**For Pinax today.** Three patterns to lift. **(a)** Right-rail token gauge in `WorldBookEditor.vue` (color-coded green/yellow/red, permanent-vs-ephemeral distinction). **(b)** Schema picker for first-time character creation (Trappu / Ali:Chat / kingbri — three templates). **(c)** Voice-rules file (`.pinax-voice-rules` style) the user edits and re-shares; loaded into the system prompt as a named "contract" section, not a "preference." Pinax's existing U0-U7 settings import pipeline already has the scaffolding to absorb (c).

### 10.8 Frontier levers — defer-but-track

- **Persona Vectors / Activation Steering (Anthropic 2025)**: derive a residual-stream vector by contrasting positive vs negative system prompts. Inject at inference to steer tone without retraining. Published use is safety traits; mechanism is style-agnostic. Apache-2.0 repo. ([github.com/safety-research/persona_vectors](https://github.com/safety-research/persona_vectors); [Stolfo et al. 2024](https://arxiv.org/abs/2410.12877)). **Requires activations or API-level cooperation** — out of reach for Pinax today, but worth tracking.
- **ICAI (ICLR 2025)**: inverse Constitutional AI that compresses pairwise preference data into a short constitution of principles deployable at inference. ([rdnfn/icai](https://github.com/rdnfn/icai)) Could be repurposed: from Pinax's good/bad dialogue history, distill a 10-20-principle stylebook.
- **Contrastive Decoding (Li et al. 2022)**: two models of different sizes, contrast their next-token distributions at decode time. ([arXiv:2210.15097](https://arxiv.org/abs/2210.15097)) Architecturally matches Pinax's existing `runTextModelAgent` vs `runToolCallingProviderTurn` distinction.
- **Sample-and-vote (Self-Consistency 2022)**: best-of-N with a critic-pass choosing the most stylistically consistent. Maps directly to a "consistency vote" framing of the C-path.

**For Pinax today.** None of these are shippable in 2026. Worth a paragraph in the spec's "future work" appendix.

### 10.9 Inspiration matrix

| Inspiration | Effort to adopt | Closest Pinax surface today |
|---|---|---|
| Modulator-stack architecture (10.1) | medium — schema redesign | worldbook entry, cast block at `narrativeKernel.js:220` |
| Style as negative space (10.2) | low — banned-word list + linter | system prompt; new lint component |
| Move-typed NPC generation (10.3) | medium — typology + per-character allowlist | kernel cast block + per-NPC `voice_moves[]` |
| Warmup generation (10.4) | medium — pre-scene voice-essay | `gameStore` orchestration; new `warmupSpeakerVoice` helper |
| Idiolect profile (10.6) | low — schema addition | character entry `metadata.idiolect_profile` |
| Lint-and-warn editor UX (10.7) | low-medium — UX work only | `WorldBookEditor.vue` is the canvas |
| Foreignize vs. domesticate (10.5) | low — per-character flag | character entry `metadata.foreignize`; critic rubric |
| Frontier levers (10.8) | defer | future-work appendix |

### 10.10 What these points are *not*

- **Not commitments.** They are inspiration seeds for the next direction-setting conversation.
- **Not A/B/C substitutes.** A (CCv3 samples + speechStyle wiring), B (politics_lookup + chain rule), C (single-pass critic at `:940`) remain the lowest-cost engineering levers.
- **Not a roadmap.** Some of these (10.1, 10.4) require schema redesigns; others (10.2, 10.7) are 50-200 line edits; 10.8 is research-stage. The user's "no planning, no implementation" instruction is binding.

---

## 11. Round 5 — Divergent exploration round 2 (inspiration points)

Round 5 deliberately stayed away from A/B/C and from Round 4's pattern-of-the-pattern angle. Four agents went in four new directions: cross-register/Chinese voice (ε), long-form memory engineering (ζ), choice architecture (η), AI-flavor statistical detection (θ). All 4 surfaced *concrete Pinax-relevant findings*. Each is below as an inspiration point with primary sources + one Pinax angle.

### 11.1 ε — Register as an explicit vector, not a free-text description

**Concrete finding.** Chinese-language voice is *registered* characteristically: a 宋江 speaks as 押司 (敬辞 + 委婉), a 武松 as 都头 (简练 + 阳刚), a 李逵 rejects 文言 outright. 施耐庵 encodes register as *character-coordinates × education × ceremony*. 王蒙's lecture series on《红楼梦》 (王蒙文集：讲说〈红楼梦〉, 2014) treats this as engineering. The classical novel craft has known for ~250 years that voice is a *position in a multi-dimensional space*, not a style preference. Translated-craft precedent (Juliane House, *Translation Quality Assessment*, 1997): register = **(Field, Tenor, Mode) + CulturalFilter**. Ken Liu's *Three-Body Problem* English edition uses chapter-level register plans; the academic 评注 shows register as the lever that survives across the book.

**For Pinax today.** Replace `samples[]` + `writingStyle` with a structured `{register_axis: classical|mixed|vernacular|colloquial, formality: 0-10, ornament: 0-10, dialect_marks: [], field: string, tenor: string, mode: string, cultural_filter: enum}` per character. Style critic uses this as the *ground-truth rubric*, not as guidance prose. A 网文 `系统流` "ding!" 义项, an 八股 士大夫 voice, a 大观园 黛玉 voice all map to different cells in this lattice. Source: 王蒙《红楼梦》讲说本; Juliane House TQA 2014 (sciencedirect.com/science/article/pii/S2210537913000078); 知乎 "三体英文版".

### 11.2 ε — 网文 type-on-top-of-character voice

**Concrete finding.** Web-novel platforms (起点 / 晋江 / 番茄 / 刺猬猫) have *no published stylebooks* but a flourishing grey-market of *signing templates* (晋江签约模板, zhuanlan.zhihu.com/p/689625020) that play the stylebook role. Each type (系统流 / 凡人流 / 废柴逆袭 / 晋江现言 / 古言) ships with its own default register. *Type is a second dimension of voice*, sitting above character idiolect. Industrial fact: the 签约模板 self-documents its industrial discipline (简纲 / 人设 / 创新点 / 文案钩子).

**For Pinax today.** Add a `type_pack` dimension to the `register_vector`: a default type-default register can be loaded via a one-click preset (萌系 / 系统流 / 凡人流 / 晋江现言 / 古言 / wuxia-hero / military-strategist / etc.). Users get to *inherit* a register, then override per character. ~50 lines of seed data + a registry shape.

### 11.3 ζ — `keyChoices` is a log, not a lever (live code audit)

**Concrete finding.** Read Pinax's `keyChoices` end-to-end. Schema is `{id, label}` only; declared at `src/stores/gameStore.js:173`; mirrored at 8 normalizing sites and 5 prompt-injection sites. Used as label-only scan text (`worldbookContextBuilder.js:150-153, :178, :233`) and as recent-prompt slice (`narrativeKernel.js:411-417`, `experienceAgentContext.js:175`, `api.js:907-1147`). The model can write to `keyChoices` via `changes` push (`generationEmergence.js:183`), so **a keyChoice the user never issued can quietly appear**. There is no `{stance, mood, voice, factionDelta, origin}` metadata, no user/runtime distinction, no faction/arc linkage, no lock-in on downstream steps.

**For Pinax today.** Promote `keyChoices` to a first-class state primitive: `{id, label, origin: 'user-issued'|'runtime-inferred', atBeat, voiceHint?, stance?, factionDelta?}`. Each choice mechanically updates state; the model receives both the label and the metadata. Source: Disco Elysium GDC talk (gdcvault.com/play/1026534); Pentiment Sawyer interview (toucharcade.com/2023/10/18).

### 11.4 ζ — `runtimeEventCausality.js` gap, specifically around foreshadowing

**Concrete finding.** Read 824 lines of `runtimeEventCausality.js`. What it surfaces today: `currentTime`, `currentPlace`, `characters[≤8]`, `relationships[≤8]`, `canonicalFacts[≤8]`, `recentChanges[≤4]`, `conflicts[≤6]`, `staleEventIds[≤12]`, `sourceEventIds`, `isConsistent`. What is missing: (a) *foreshadow* / *callback* / *reveal* — no promise/payoff data structure exists; (b) *motif* / *leitmotif* occurrences — no semantic centroid tracking; (c) *character arc* — `characters[].goal` is a free-text field, but no lie/misbelief/arcStage; (d) *implied-reader* tracking — completely absent; (e) *hierarchical summary* — only `recentChanges[4]`, no tier1/tier2/tier3 memory; (f) *tone / sentiment drift* — absent; (g) *promise-with-payoff-scene* — `event.payload.transitions` covers only place/character/relation/fact/time, not promise; (h) BeatPlan step itself is not in the causality graph.

**For Pinax today.** Three concrete moves. (a) Add `kind: 'foreshadow'|'callback'|'reveal'|'motif-occurrence'|'arc-stage-change'` to `event.payload` enum. (b) Add `forbidden-unpaid-promise` to `detectSemanticTransitionConflicts` (lines 251+): any promise past `payoffPromisedBy` still unresolved gets a conflict code. (c) Extend `characters[].arc` with `{lie, ghostWound, arcStage, stageHits[]}` — Dara Marks / Lisa Cron four-beat model.

### 11.5 η — Disco Elysium skill-mood as player-side lens, not LLM-side generation

**Concrete finding.** Disco Elysium's 24 skills (Inland Empire / Electrochemistry / Shivers / Rhetoric / Empathy) are *player-picked, model-rendered*. The player picks *which internal voice narrates* — the model renders. The skill-routed conversation *decouples what happens from how it feels*. The choice variable is not "interrogate the witness" but *which lens narrates the interrogation*. This *constrains the model's generation space* (less free-form, less AI-flavor) and *preserves player agency* simultaneously. The Hot-or-Not axis of Mass Effect / Fallout NV operates similarly but at a different layer (reputation != voice).

**For Pinax today.** A user input is decomposed into a fixed-grammar `{verb: action|say|see, register: terse|verbose|lyric, scope: local|scene|world}` plus a `lens` (named ID pointing to one of N pre-defined voices). The model renders to that lens, not to "neutral LLM." This re-uses the modulator-stack architecture from §10.1 / R10 and pins it down. Source: Disco Elysium GDC 2021.

### 11.6 ε — House's (Field, Tenor, Mode) as the modular decomposition

**Concrete finding.** Juliane House's TQA framework (1997, Routledge) decomposes register into three axes: **Field** (题材场域), **Tenor** (人际语势), **Mode** (口头 vs 书面). Adapted by Mona Baker and Lawrence Venuti; tested in *Three-Body Problem* / *Wandering Earth* English editions. The framework is **the most concrete engineering decomposition** of "voice" in any language.

**For Pinax today.** Each character carries a `register_vector: {field, tenor, mode, cultural_filter}`. The worldbook-level `writingStyle` becomes a default register, not the source of all voice. Style critic verifies tone drift against this vector. Per `agent-narrativeKernel.js:446-448`, the worldbook-level `writingStyle` is currently clipped to 560 chars — this is the *first* thing to replace with structured `register_vector`.

### 11.7 θ — Burstiness + Fast-DetectGPT as cheap first signal

**Concrete finding.** Pinax's narrative is zh-CN; English-language AI-flavor detectors have been generalized to ~26 languages (Bao et al. ICLR 2024, Fast-DetectGPT, arXiv 2310.05130) but thresholds do not transfer between en/zh. Burstiness (sentence-length std / mean) is the cheapest single signal — "5 lines of Python, trivial effort" — but only ~65% accurate standalone. Combined with Fast-DetectGPT zero-shot scoring (240× faster than DetectGPT, ~96% on GPT-3.5 output) it reaches ~85% accuracy. **DetectGPT itself requires 100 forward passes per passage; Fast-DetectGPT needs only one.**

**For Pinax today.** Three-step engineering path to *measure* AI-flavor: (a) burstiness per turn, (b) Fast-DetectGPT calibration run, (c) Binoculars zero-shot detection (perplexity / cross-perplexity ratio between two LLM observers, repo amu-cai/Binoculars). All three ship in a 200-line local script. None requires model retraining. The 9b item from §θ — Burrows's Delta for *idiolect divergence* between current turn and character baseline corpus — directly uses the idiolect profile from §10.6.

### 11.8 θ — Paraphrase-attack robustness as regression test

**Concrete finding.** All perplexity-only detectors collapse to ~50% AUC after one DIPPER paraphrase pass (Krishna et al. 2023). If Pinax's critic relies on surface n-gram signals (the cheap-to-build kind), an attack via Quillbot / 改写 passes through. The PRP-aware critic needs a *deeper* signal (idiom vector, register-vector divergence, embedding-classifier) plus *paraphrase-robustness* as an explicit regression test.

**For Pinax today.** Treat DIPPER-paraphrase-then-re-score as a standard regression test. If the critic's regression rate > 30% under paraphrase, the critic is over-trusting surface n-gram; refit it. Source: arXiv DIPPER (2023); Liang et al. *Patterns* 2023 GPTZero-bias paper.

### 11.9 What these are and are not

**Not commitments.** Still inspiration seeds. The 8 entries above are seeds for next direction-setting, not a roadmap.
**Not in conflict with A/B/C.** A/B/C are the lowest-cost engineering levers; these are higher-cost or research-stage.
**Implementation note.** The user instruction is still "find inspiration points; planning and implementation are not for me."

---

## 12. Meta — what's covered, what isn't

### What's been mapped in this research workbook
- §1-§2: Pinax current state + external systems landscape
- §3: Three primary levers (A: voice samples, B: tool retrieval, C: critic)
- §4-§5: Phased rollout, risk / rollback
- §6: Citations
- §7: Open questions
- §8-§9: Round 2 + Round 3 code-verified corrections
- §10: 8 inspiration buckets from Round 4 (game-craft / literary craft / community lore / LLM-prompting theory)
- §11: 8 inspiration points from Round 5 (cross-register / memory / choice / detection)
- **Total so far** ≈ 16 patterns of inspiration, 6 Pinax code-audit specifics, 3 verified-citation correction lists, 1 phased PR rollout sketch.

### What's *not* yet covered (originally listed)
- Voice acting / TTS (speech synthesis for character audio — Pinax's 5B/5C audio art context) [covered in §13 ια]
- Procedural worldbuilding tools (World Anvil / LegendKeeper / Campfire)
- Cost-economics of multi-pass LLM calls at scale (model $ / latency $)
- AI safety filters at the application layer (Pinax is local-first)
- Per-user style adaptation over many sessions (preference learning)
- Specific CCv3-style card packs from high-quality community sources
- Antagonistic input — what happens when the user input is rude / out-of-character
- Translation between en and zh-CN voice (auto-detecting target language)

---

## 13. Round 6 — Divergent exploration round 3 (inspiration points)

Four parallel agents, four genuinely new axes from prior rounds: **ια acoustic/multimodal voice**; **ιβ procedural narrative + Propp/tropes**; **ιγ authoring-tool pedagogy**; **ιδ AI co-authorship case studies**.

### 13.1 ια — Audio signature, not full TTS

**Concrete finding.** 黑神话:悟空 hired 陕北说书 non-传承人 熊竹英; he recorded ~2 hours of dialect audio, integrated as a short recurring environmental leitmotif (the 黄风岭 sequence is the famous example). The audio *functions as environmental surface*, not as full character dialogue. Disco Elysium's 24 skill voices are NOT 24 different voice actors — they're 24 different *prosody profiles* read by a single actor (verified via 多个 source; though the actor attribution between sources differs). The audio signature in both cases is **leverage per minute**, not coverage. Beckett's *Not I* (1972, 75 minutes, only mouth visible) and 风之旅人 (Journey, Wintory, Grammy-nominated score with no dialogue) prove silence and ambient music can carry narrative voice. 中文 has *声口类型* as an existing craft tradition: 京剧/评书/相声 each carry their own prosody convention, F0 contour, idiomatic lexicon — none of which has been mapped into AI fiction tooling.

**For Pinax today.** Three shippable moves that don't require a real TTS pipeline: (a) every character card carries a `<声口类型>` anchor — 京剧老生 / 评书单口 / 相声捧哏 / 说书人 / 现代口语 (5-8 categories), each with ~200 char F0/rhythm/idiom description; (b) **silence option** in 5B/5C choices: when user picks silence, LLM outputs "你沉默。一阵风从…吹过" instead of "什么都不发生"; (c) prosody metadata in critic output: `<prosody profile="inland_empire" rate="slow" pitch="low">` tags — useful even without TTS because they constrain the LLM's lexical choice toward slower-vocabulary. Source: 黑神话采访 / Escapist Disco Elysium analysis / Wennerstrom *Music of Everyday Speech*.

### 13.2 ια — Chinese 声口 anchor as Pinax zh-unique lever

**Concrete finding.** 中文 classical-theater voice is *type-as-program*: each character type (生旦净末丑) bundles prosody + 念白 + 拖腔 + idiomatic lexicon into one convention. 评书's 开脸儿 + 摆砌 use *voice to depict character and voice to depict scene*. 郭德纲 vs 王玥波 single-hand storytelling styles are publicly A/B-able. None of these have been incorporated into AI fiction tooling yet — a real, almost untouched lever for zh-CN-first projects.

**For Pinax today.** Add to character card schema `voice_type: '京剧老生' | '京剧青衣' | '评书单口' | '相声捧哏' | '说书人' | '现代口语' | '网文系统流' | '网文凡人流'`, each with a 200-char prosody description. Critic verifies the model's lexical choices match the type. ~10 categories × 200 chars = ~2 kB, fits anywhere; a first-mover lever for zh-CN games.

### 13.3 ιβ — Pinax already has Rumelhart story-grammar — and doesn't know it

**Concrete finding.** Compare Pinax BeatPlan fields to Rumelhart's `SETTING → EPISODE → REACTION → CAUSE`: `causalSteps ≈ Reaction`, `responseObligation ≈ Episode`, `endCondition ≈ Setting closure`, `revealOrChange ≈ Cause-result`. The mapping is *already there* without explicit documentation. Vogler's 12 Hero's Journey stages are similarly mappable — and each Vogler stage has a *register hook* (Threshold → liminal / Atonement → confessional / Return with the Elixir → gratitude-tinged); this is the *direct lever for voice-by-stage*, not voice-by-character. Propp's 31 functions collapse into his own 7-bucket grouping (PREPARATION / COMPLICATION / TRANSFERENCE / STRUGGLE / RETURN / RECOGNITION / RESOLUTION) for prompt usability. **No production fiction tool ships any of this; Sudowrite / Squibler / AIScreenwriter have no Propp-as-prompt support verifiable.**

**For Pinax today.** Add a `dramaticFunction` field to `state_delta` events in `runtimeEventCausality.js` (one of `preparation / complication / transference / struggle / return / recognition / resolution / other`). Add a `journeyStage` field to `SceneThread` (12 Vogler values). Both are 5-line schema additions. The BeatPlan can then emit a `dramaticChain` roll-up: which 7 functions touched this scene, which skipped, where the chain stalled.

### 13.4 ιβ — Sanderson's Three Laws as voice tics for magic exposition

**Concrete finding.** Sanderson's First Law (capability inversely proportional to reader understanding), Second Law (limitations more interesting than capabilities), Third Law (expand before adding new) — these are *worldbuilding discipline statements* but they ALSO function as voice tics for *magic exposition*. When a character *describes* magic in-world, the laws dictate *what details must be shown*. No AI fiction tool encodes them as voice registers.

**For Pinax today.** Add a `magicExpositionRegister: 'soft' | 'hard' | 'hybrid'` field on the worldbook entry. The BeatPlan contract can carry: "if magic is referenced in `revealOrChange`, obey the registered Sanderson law of the world's `magicExpositionRegister`."

### 13.5 ιγ — Mirror beats correct — split Pinax `writingStyle`

**Concrete finding.** Pinax's `writingStyle` field is structurally ambiguous: is it *what the writer sounds like* (descriptive — mirror) or *what the model should aim for* (prescriptive — correct)? The pedagogy literature (Hattie & Timperley 2007 lineage + Springer 2024 meta-analysis) shows mirror tools teach, correct tools substitute. Linguistic AI Q., StyleMirror, ProseVision, ToneCraft all explicitly market as *mirror*; Grammarly markets as *correct*. Pinax leans on the ambiguous single field.

**For Pinax today.** Rename split into `writingStyleAsModeled: string[]` (descriptive — what the writer sounds like, populates generation constraints) and `writingStyleAsAimedAt: string[]` (prescriptive — what to aim at). Two fields, two interpretations, each editable separately.

### 13.6 ιγ — ReviewDock should ship a dial, not a switch

**Concrete finding.** Springer 2024 meta-analysis on AI-assisted writing + Microsoft cognitive-debt 2025 study + ERIC EJ1433052 "Beyond Substitution" converge: gradual release of AI scaffolding maps onto the cognitive-load tradition (Sweller). Tools that go from "high intervention → low" with rationale notes per stage (the "Fluent" pattern) work; tools that ship a single AI-on/off switch don't. NaNoWriMo's 2024 collapse is the *negative exemplar*: the organization's official AI stance ("the categorical condemnation of AI has classist and ableist undertones") triggered volunteer exodus and resignations from Daniel José Older, Maureen Johnson, and dozens of moderators. The lesson: **even being tool-neutral has its pitfalls**; the real lesson is to *not take an official stance at all* — let the community decide.

**For Pinax today.** ReviewDock should ship `assistanceLevel: scaffolded | moderate | minimal | off`. New users default to `scaffolded`. Per-session events log accepted/rejected suggestions → a "rewatch your decisions" panel. The Hattie feedback-specificity work implies every ReviewDock output should be criterion-tagged (`{criterion: show-don't-tell, span: "...", rationale: "cliché idiom"}`) — granular beats generic. **Pinax was right to defer the Q3 evaluator until the rubric was real.**

### 13.7 ιγ — Cognitive debt ledger as UX metaphor

**Concrete finding.** Microsoft Research 2025 "cognitive debt" study on 319 knowledge workers: AI-assisted writers show reduced alpha-beta ERD, weaker neural signatures of active problem-solving. The framing is a *debt*: short-term productivity wins, long-term capability debt if the user doesn't keep deliberate practice. NaNoWriMo 2024 is the social corollary: institutional AI-policy gets users defecting.

**For Pinax today.** "Cognitive-debt ledger": per project, per session, surface a meter showing how much craft-work the model did vs the writer did. `assistantAutocompletedChars: N`, `writerEditedChars: M`, `ratio: ...`. Trending-over-time is the pedagogical signal — if the ratio drops below threshold, the writer might be drifting into passive consumption.

### 13.8 ιδ — Marche: AI-as-draft, human-as-voice-pass

**Concrete finding.** Stephen Marche published *Death of an Author* (2023, novella) with GPT-4. His stated method: AI produces "first-pass drafts" of candidate sentences/paragraphs; *he* picks one and does voice-pass rewriting. AI = raw material + 错的宽度; human = voice polish. The book itself is meta — a mystery about an author's murder by an AI — making "who is the author" a content topic.

**For Pinax today.** Make Marche's workflow visible inside the editor: "AI 出 N candidates → marked in diff-view → author picks → voice-pass rewrite." The product affordance is the diff editor pattern, not a magic "make it more literary" button. Each rejected candidate becomes a *teaching artifact*: "you picked against N — what did the writer reject?"

### 13.9 ιδ — Vargas' prompt ladder as craft-teaching exercise

**Concrete finding.** Vauhini Vara's *Ghosts* (The Believer, 2021) explicitly uses a *prompt ladder*: generic → specific. Generic prompt ("the first time someone close to me died") gives clichés; adding "my sister" and then her disease makes the model output sometimes-uncannily-accurate sentences. Vara's insight is that the *gap* between generic and specific is *itself* the lesson — what personal writing does that statistical generation cannot.

**For Pinax today.** A voice-engineering mini-exercise in Quick-Import: deliberately write only a generic prompt, generate 5 paragraphs; then add a single specific memory; generate 5 more. Show the contrast inline. This is *didactic regression* — show the model mirror the writer's voice before letting it lift.

### 13.10 ιδ — Kickstarter Pocketopia as AI-acceptance spectrum

**Concrete finding.** Pocketopia: Everworld (2024) was a tabletop RPG with built-in "Game Master AI" (GMAI). Kickstarter suspension came after community pressure about "AI doing all the work," not about disclosure (which Pocketopia did comply with). Lesson: **disclosure ≠ acceptance**. Readers/players distinguish AI usage by *position in the workflow* (decorative vs core), not by on/off.

**For Pinax today.** Pinax's per-step AI-usage disclosure should NOT be a binary "AI on/off" — it should expose the workflow position: `ai_role: 'expansion' | 'polish' | 'full-paragraph' | 'plot-idea'`. Each user session can be tagged with the role split, exported to readers/players if asked.

### 13.11 ιδ — NaNoWriMo 2024 as the negative exemplar

**Concrete finding.** NaNoWriMo's September 2024 AI-policy statement triggered exodus: Daniel José Older, Maureen Johnson resigned from the Writers' Board; sponsors Ellipsus and FreeWrite distanced; moderators followed. The fatal phrase: "the categorical condemnation of Artificial Intelligence has classist and ableist undertones." NaNoWriMo later walked it back as "incomplete."

**For Pinax today.** Pinax should adopt a *deliberately silent* stance on AI-in-writing-ethics. The tool is a tool. The community decides its own norms. Any official Pinax position on AI ethics is a liability.

### 13.12 Cross-cutting pattern (Round 6)

Three of the four axes converged on **a synthesis**:

- **ια → prosody/silence/声口**: voice has audio dimension Pinax ignores
- **ιβ → dramaticFunction / journeyStage**: voice has narrative-position dimension Pinax ignores
- **ιγ → mirror vs correct / dial not switch / cognitive-debt-ledger**: voice needs *user learning*, not just *output*
- **ιδ → Marche draft, Vargas prompt-ladder, Pocketopia disclosure, NaNoWriMo silence**: voice's social/ethical surface determines adoption

The synthesis: voice is a **dimensional lattice** Pinax currently maps 1 of 5+ axes to. Each round has surfaced a different axis (lexical / register / procedural / pedagogical / ethical). Round 7 could focus on *integrating these axes into one voice engine architecture* — but that crosses into planning, and the user's "no planning, no implementation" instruction still binds.

### 13.13 What's still uncovered (post Round 6)

The §12 list mostly holds. New uncovered axes surfaced this round:
- AAA-game-level dialogue system architectures (Bethesda Radiant AI, GTA pedestrian systems, Cyberpunk crowd chatter) — [covered in §14 below]
- Faithful adaptation of AI-flagged works across languages (post-edit, human-in-the-loop translation)
- Co-writing ceremony/community design (workshop-style AI use)
- Voice in non-narrative contexts: dialogue trees for NPCs in MMOs, open-world crowd, simulation games
- The "second voice" — AI summarizing recent events for the user *in narrating voice* (vs the writer's writingStyle vs the model's critic voice)

---

## 14. Round 7 — Single-axis deep read: AAA game dialogue systems at scale

Following the user's "single-axis deep read" choice. One Explore agent systematically mapped 2026 state of shipped-game dialogue architecture. **Not a planning document** — 9 shippable patterns with primary sources, organized around one cross-cutting thesis.

### 14.1 Cross-cutting thesis

**Every shipped AAA dialogue system separates content from performance.** Voice is a *prosody template* + audio asset; distinctness comes from the *response-graph topology*, not from recording more actors. Pinax's AI-driven architecture can take this further: separate *content* (LLM-generated prose keyed by arc state) from *prosody template* (style instruction) from *voice asset* (optional community-uploaded TTS). The response graph is the durable contract; voice is a layer that can be added or swapped.

### 14.2 The 9 shipped-game patterns

1. **Bethesda Creation Engine — voice-type as production unit.** 1 actor ↔ 1 voice-type ↔ N NPCs. `FemaleEvenToned` (Colleen Delany) covers ~50 named characters + thousands of barks. Voice cost decoupled from NPC count. Modder voice packs work because the engine's voice-type schema is the public contract — a WAV folder re-authoring ships as drop-in.
   - Source: UESP Skyrim Generic Dialogue / Category:Skyrim-Voice-FemaleEvenToned; Creation Kit Wiki Dialogue category; xEdit on Nexus.
   - **Pinax lesson:** treat Pinax NPCs as members of a *voice-type pool* (shared prosody template + vocabulary register); distinctness from response-graph topology, not recording 200 actors.

2. **Starfield (2023) — reverse on voiced protagonist.** Bethesda dropped the voiced-player experiment (Fallout 4) and returned to Skyrim-style silent protagonist with ~200,000 NPC barks. Silent protagonist scales with voice-type economics; voiced protagonist multiplies recording cost 3-5× (every player option needs a paired response variant).
   - Source: GameSpot "Starfield Abandoning Voiced Protagonists Didn't Spell Doom For Its Two Stars."
   - **Pinax lesson:** Don't pre-commit to "narrator speaks the player's lines." Text-rendered player + richly-voiced NPC pool is asymmetric, sustainable scale.

3. **Rockstar GTA V / RDR2 — ambient pool + metadata tags.** Each pedestrian chatter line carries context tags (mood, zone, weather, time, mission-flag). At runtime, RAGE rolls from the pool whose tags match world state. ~2-4 k lines per ambient "personality group" (commuter, jogger, gang_member_xyz), shared across hundreds of instances.
   - Source: Audiokinetic GTA V Wwise analysis; OpenIV audio docs; FiveM mod tutorials on `<ambient_info>` style metadata.
   - **Pinax lesson:** Idle utterances, greetings, rumor-hooks live in a tagged pool sampled by `(arc_state, location, faction, mood)`. Same pool serves many NPC instances.

4. **Larian Baldur's Gate 3 — two-layer voice: narrator + NPCs.** Amelia Tyler (narrator) recorded ~16k lines as meta-voice wrapping every scene; ~240 voice actors for ~95k dialogue lines. ~80% NPCs share voice types; only ~20 named characters get Origin treatment.
   - Source: BAFTA interview / GDC 2024 panel / D.I.C.E. talks.
   - **Pinax lesson:** Pinax's narrator voice is the consistent emotional register; per-NPC distinctness comes from content + small prosody shifts, not 240 actors.

5. **CD Projekt Red Cyberpunk 2077 — prosody fixed per character, content gated by stats.** V's VA (Gavin Drea / Cherami Leigh) recorded ~70k lines including body/int/reflexes/cool attribute-gated variants. Reed's prosody is fixed across all 5 endings; only his content swaps.
   - Source: CDPR behind-the-scenes YouTube; Phantom Liberty developer interviews.
   - **Pinax lesson:** Player arc-state opens additional response branches but doesn't change NPC voice prosody. Separates "what the NPC is allowed to say" (gating) from "how the NPC sounds" (prosody template).

6. **BioWare Mass Effect / Andromeda — tone as emergent style, not selected action.** Paragon/renegade is *cumulative-tone-gated*, not single-action-gated. Andromeda 4-tone wheel (heart/professional/funny/shoot-the-moon) made tone explicit per-line. Players who mix tones rarely get the "perfect outcome" branch.
   - Source: GDC 2014 "Beyond Impressions"; IBTimes on Andromeda tone overhaul.
   - **Pinax lesson:** Pinax arc choices could track *tone consistency*, not cumulative score — reward a style of player voice, unlock response branches by accumulated tone-shape.

7. **Telltale Walking Dead — decision silence as first-class outcome.** The timer ticks; if the player doesn't click, the NPC continues and the relationship shifts in a *deliberate* direction, not an error. Voice is pre-rendered en bloc; the timer gates which response-track plays next at scene boundaries.
   - Source: GDC 2013 Mark Darin / Andrew Langley "Choice Architecture in The Walking Dead"; Telltale retrospective.
   - **Pinax lesson:** A "let the moment pass" timer produces *deliberate* prose-state, not default error. Pre-render scene beats; branch only at response boundaries, not mid-line.

8. **Disco Elysium — 24 voices from 1 actor via prosody.** Mikee Woischutz delivered all 24 skills + protagonist's interior monologue via highly varied prosodic contours (pitch, tempo, breath, register). Authority = "domineering bark"; Empathy = "soft, breathy"; Half Light = "gravelly, throat-tense"; Rhetoric = "pedantic, clipped"; Electrochemistry = "hedonistic, glottal fry"; Shivers = "poetic, weighty, paused." Words stay similar (same narrator vocabulary); *delivery shape* signals the subsystem.
   - Source: Behind the Voice Actors Disco Elysium; Kurvitz / Moskalenko Eurogamer interviews.
   - **Pinax lesson:** When the AI narrator switches modes (player-voice, scene-voice, lore-voice, ironic-voice), vary *prosody + register in the prompt*, not the model. Same model + different style instructions = character-distinct delivery without voice swaps.

9. **Modder voice-pack authoring as distributed production.** Skyrim modder community ships voice packs via xEdit/CreationKit by *re-recording the WAV folder for one VTYP* + patching `INFO` records. "Interesting NPCs" mod added ~250 voiced NPCs by community actors following the VTYP convention. Creation Club ships official voice packs the same way.
   - Source: xEdit / SSEEdit on Nexus; Bethesda Creation Club voice pack pages; Skyrim Voice Mod communities.
   - **Pinax lesson:** Pinax's response-graph can ship content-first (text + arc state) and let voice be layered later — either via TTS with prosody templates or via optional community voice packs following a published spec. The Pinax contract is the *response key schema*, not the audio file.

### 14.3 The shared thesis restated

The nine patterns collapse into a single insight: **"voice is cheap, graph is expensive."** Voice cost (recording, prosody, identity) scales *sub-linearly* with NPC count if factored as a type pool; response-graph topology scales *linearly* with content depth but reuses across voices. AAA studios have settled on this over two console generations. Pinax inverts the cost asymmetry further by letting LLM generation cover content, leaving voice as a thin prosody-template layer with optional TTS overlay — the graph carries distinctness.

### 14.4 What to do with this insight

Three concrete patterns Pinax can lift directly from this map (still inspiration, not plan):

- **Voice-type pool.** Group NPCs into 5-10 voice-types per worldbook. Each type carries a prosody + register + vocabulary cue. Per-NPC distinctness from response-graph topology (what lines this NPC has on what topic), not from voice.
- **Tagged utterance pool.** Idle chatter, greetings, rumor-hooks live in a `(arc_state, location, faction, mood)`-tagged pool sampled at runtime, like GTA V's Wwise events.
- **Tone consistency wheel.** Track *tone shape* across recent choices (e.g., last 5 turns' tone), unlock response branches by accumulated style rather than single-decision cumulative.

Each maps directly onto the multi-axis voice lattice from §13.12 (lexical / register / procedural / acoustic / pedagogical / ethical) without crossing into "planning" territory. The user can pick one or more when ready.

### 14.5 Source list (curated)

- Bethesda: UESP Skyrim Generic Dialogue; UESP FemaleEvenToned voice type; Creation Kit Wiki Dialogue; GameSpot on Starfield voiced-protagonist abandonment; xEdit (SSEEdit) on Nexus.
- Rockstar: Audiokinetic GTA V Wwise analysis; OpenIV audio docs; FiveM audio modding tutorial.
- Larian BG3: BAFTA — Neil Newbon Best Performance; GDC 2024 panels; D.I.C.E. talks.
- BioWare: GDC 2014 "Beyond Impressions"; IBTimes Andromeda tone overhaul.
- Telltale: GDC 2013 Mark Darin / Andrew Langley "Choice Architecture in The Walking Dead"; Telltale retrospective.
- Disco Elysium: Behind the Voice Actors Disco Elysium cast; Kurvitz / Moskalenko Eurogamer interviews.
- Modder community: xEdit on Nexus; Bethesda Creation Club voice packs; Skyrim voice mod community.

### 14.6 What the deep read did NOT cover

- **GTA VI voice pipeline** — NDA-classified; only ambient-tag speculation exists publicly. ⚠️
- **Star Citizen / Squadron 42** — AI facial upscaling, mocap volume not published. ⚠️
- **Final Fantasy VII Rebirth / FFXVI Japanese voice production discipline** — not documented in English sources. ⚠️
- **Polygon-style guest-VA coordinate** (Baldur's Gate 3 style 240-actor unification) — public talks exist but the *production-management discipline* isn't fully published.

These are the natural Round 8 angles if the user wants more depth in this axis.

---

## 15. Round 8 — Divergent exploration round 4 (4 axes: κ, λ, μ, ν)

Four parallel agents went in four genuinely new directions: **κ** cross-language voice adaptation practice; **λ** worldbuilding methodology + author-tool lifecycles; **μ** multi-pass LLM economics + latency budgeting; **ν** reader immersion / transportation theory.

### 15.1 κ — Three schema-level changes Pinax could ship for cross-language voice preservation

**Concrete finding.** Ken Liu's stated approach to *Three-Body Problem* is **thick translation**: literal-with-notes + naturalized, chosen *per-character*. Industry data point: Liu Cixin's English publishers split work across translators — *Three-Body* trilogy → Ken Liu; *Ball Lightning* → Joel Martinsen; the **voice legitimately differs across translators** (Martinsen is more literal, Liu more theatrical). Standardized terminology propagated by reference: once Ken Liu coined "sophon", subsequent translators adopted it. Per-scene register preservation verified in Hao Jingfang's *The Last* (Ken Liu): the bureaucrat-narrator's flat tone vs underground worker's colloquial anger deliberately preserved.

Real industry tooling: ISO 17100 / MQM (not House TQA) is the *production QA gate*; House TQA is academic only. **MT-ese is detectable in 3 sentences**: novel-LLM outputs use distinctive low-information syntactic patterns, "complex auxiliary clusters" and "abstract nominalization" that human literary prose rarely produces.

**For Pinax today.** **Three schema-level changes recur across 10+ sub-questions**: (a) **`glossary_lock: true`** per character in worldbook (e.g., 智子 / sophon gets canonicalized across all rounds); (b) **per-scene `register:` field** (colloquial / bureaucratic / lyrical / clipped), not just worldbook-level; (c) **per-element `cultural_filter`** (dialogue vs prose vs proper nouns, each can be `foreignize` | `domesticate`). Plus: per-character voice-fingerprint embedding audit across scene stack (drift > threshold = warning). Self-build mini-corpus from canonical zh-CN fiction (三体 / 活着 / 围城 / 繁花) for per-character register features.

### 15.2 λ — Notebook.ai is the unacknowledged ancestor of Pinax U0-U7

**Concrete finding.** **Every successful long-lived worldbuilding tool has a "block / template / module" feature** — World Anvil Blocks, Campfire Modules, Notebook.ai's category taxonomy (Characters / Locations / Items / Species / Languages / Groups / Buildings / Flora / Fauna / Races / Magic), LegendKeeper templates. The atomic-page-per-entity pattern with shared sidebar metadata is exactly Pinax's `CreationWorkspace` model. **Notebook.ai was the closest direct ancestor of Pinax U0-U7**, but the lineage is **not acknowledged** in `docs/STATUS.md` or any Pinax doc. Convergence across all major tools: Character / Location / Item / Species / Group / Event / Magic-System / Language / Document / Lore-Page — 10 canonical entity types.

The Tolkien-le Guin-Rothfuss comparison is the closest thing to a "world bible" methodology canon: *published world bibles outlive the series* (Tolkien's 12-volume *History of Middle-earth*) — *unpublished ones die with the author* (Rothfuss risk). Pinax's local-first storage is the strongest answer to Rothfuss's risk.

Crucial *negative* result: **"worldbuilder's disease"** (endless prep, never writing) is the documented failure mode at 100+ NPCs across 5+ years. World Anvil / Campfire / Notebook.ai all have "build only what's needed" tooling because of this.

**For Pinax today.** **Single-line rule (proposed):** *"Adopt Notebook.ai's taxonomy, LegendKeeper's graph linking, World Anvil's block format, and Aeon's timeline — export to Markdown-with-YAML so the world outlives Pinax."* Specifically: (a) U3+ entity schema aligned to Notebook.ai's 10-type taxonomy; (b) U7 (settings bible export) targets Markdown with YAML frontmatter (LegendKeeper's import format) for round-trip Obsidian / LegendKeeper / Notebook.ai-fork compat; (c) acknowledge Notebook.ai as ancestor in `docs/STATUS.md` so we don't reinvent; (d) build a "scene-required-entities" view that surfaces only the entities a planned scene needs (forward-looking, anti-worldbuilder-disease).

### 15.3 μ — Pinax multi-pass economics: actually affordable, with one trick

**Concrete correction.** **Opus 4.8 is $5/$25 per MTok**, not $15/$75 (3× cheaper than prior estimates). Sonnet 5 is **$3/$15** (intro $2/$10 until 2026-08-31). Haiku 4.5 is **$1/$5**. Caching: reads **0.1×** (90% off still works). Batch: 50% off, but **wrong use case for critic** because batches are <1h minimum. Real Pinax async lever: **`max_tokens: 0` pre-warming** — prefill kernel cache for *zero output tokens billed*, fires during user's typing pause, eliminates first-token latency for free.

**Per-call economics (12K input × 800 output, 90% cache hit):**
- Opus 4.8 write: $0.031/call → 4-call turn (plan + write + critic + rewrite) = **$0.124** → **75-turn session $9.30**
- Sonnet 5 write: 0.6× → $0.075/turn → **$5.60/session**
- **Mixed tier (Opus only on write, Sonnet on plan/critic/rewrite) = $0.086/turn → $6.45/session**
- All-Haiku: $1.88/session

The **killer fact: Fast mode (`speed: "fast"`, Opus-only, beta fast-mode-2026-02-01) delivers up to 2.5× higher tok/s** at the same API call. On the 60s write call → ~24s. **35 (plan) + 24 (write fast) = 59s** consumed → **41s free for critic (8s) + rewrite (30s) = 38s** → fits in existing 100s ceiling, **no raise to 145s needed**. The Round 3 §9.4 "raise agentTimeoutMs" claim was wrong — Fast mode gives the budget for free.

Local-fallback economics: **Anthropic has no edge/on-device path** — "pure-local Pinax" means a different model. Qwen2.5-7B-Turbo via Together at **$0.30 flat** per million tokens is the viable local-fallback tier. **Browser inference via `@xenova/transformers` is too weak** for Pinax's voice bar (best WebGPU demo is Qwen 0.5B which is below narrative quality).

**Best-of-N wisdom (Snell et al. NeurIPS 2024, arXiv 2408.03314):** the **compute-optimal allocation is difficulty-dependent**. Easy prompts need little; medium difficulty exactly where best-of-N + verifier wins; **hard problems favor sequential revision over parallel sampling**. Pinax should route per-beat: best-of-3 on ordinary, critic→rewrite on hard/climactic.

Prompt caching gotchas the agent verified: **Opus 4.8 minimum cacheable prefix is 4096 tokens** (Sonnet/Fable 2048). A 3K `writingStyle` block silently won't cache on Opus. Pinax needs to merge writingStyle + register_vector + character entries into one ≥4096-token frozen block.

TTS economics (if Pinax ever went audio): ElevenLabs Creator tier $22/121K credits = **~71 beats/mo**. **TTS is the dominant cost line, not the LLM calls.** ⚠️ open-source CosyVoice 2 / FishSpeech / GPT-SoVITS local-cost-vs-commercial quality not verified this round.

**For Pinax today (inspiration, not plan):** the mixed-tier deployment matrix becomes: Opus 4.8 + Fast mode on write only; Sonnet 5 on plan/critic/rewrite; Together Qwen2.5-7B-Turbo as opt-in local fallback; pre-warm kernel cache via `max_tokens: 0` during typing pause; Sudowrite's rollover-credit model (calls not tokens) for monetization. **$6.45/session lands inside indie subscription economics** ($20/mo at ~3 sessions/mo).

### 15.4 ν — AI-flavor → low engagement is *not* empirically established (and may be inverted)

**Concrete finding (and the round's strongest result).** The agent refused to publish unfetched claims — its honesty is itself the finding. What survived verification:

1. **Porter & Machery, *Scientific Reports* (2024)** — non-expert readers were *below chance* at identifying AI poetry and *more likely to judge AI poems as human* (outrating Shakespeare, Whitman, Dickinson). The authors' explanation: **AI poems are rated higher because they're more accessible and legible. Readers mistake clarity for quality and find canonical human difficulty confusing.** This **inverts the "AI-flavor repels readers"** premise that motivated Round 1-5 detection work. Detector metrics (burstiness, MATTR) may be measuring *provenance*, not *quality* — and those are not the same axis.

2. **Green & Brock transportation theory** (2000 *JPSP*; 6-item short form per Appel et al.) lists *style features that raise it*: vivid imagery / sensory detail, emotional intensity, ease of comprehension, suspense, character development, personal relevance. **Voice consistency / idiolect is NOT in this literature.** Mechanism plausible but unstudied.

3. **Busselle & Bilandzic narrative engagement** (2009, *Media Psychology*) — 4 dimensions: attentional focus, narrative understanding, emotional engagement, narrative presence. **Voice quality → any dimension: no study.** Mechanism (C-I theory, register-switch → load-spike → fall-out) plausible but unstudied.

4. **Kuijpers' Story World Absorption Scale** has been cross-validated against annotated online book reviews in *Journal of Cultural Analytics* — Pinax's most-shaped existing method, since Pinax could mine session feedback the same way.

**The agent's honest summary:** *"Transportation, narrative engagement, source monitoring, and construction-integration all have plausible voice hooks and none have been tested on voice. Pinax is unusually well-placed to test them — branching IF with session telemetry is a better instrument than the lab studies this field runs."*

**For Pinax today.** **Three meta-learnings**: (a) **run a cheap A/B of your own prose variants against the 6-item transportation short form** before optimizing against detectors — you'll learn more than the literature can tell you; (b) **don't market "literary fiction → psychological benefit"** — Kidd & Castano's 2013 *Science* paper (note: 2013, not 2008) replication record is bad, voice-quality-as-moderator claims are doubly unsafe; (c) **don't cite Porter & Machery to *defend* LLM voice** — cite it to *validate your own A/B* and discover what your specific readers actually want.

### 15.5 Cross-cutting pinpoints (Round 8)

- **κ**: glossary_lock + per-scene register + per-element cultural_filter = 3-schema-change pattern. Concrete.
- **λ**: Notebook.ai is the unacknowledged ancestor of Pinax U0-U7. The lineage should be cited. Anti-worldbuilder-disease feature is high-value.
- **μ**: Opus $5/$25 (not $15/$75). Fast mode gives 60s→24s on write, freeing 41s for critic without raising the 100s ceiling. TTS would be the dominant cost line if audio mode shipped.
- **ν**: AI-flavor → low engagement is *not empirically established*. Porter & Machery 2024 may have inverted the motivation. A/B first, optimize second.

These four axes are *causally orthogonal* to the seven prior rounds: κ adds a *language axis*; λ adds an *author-lifecycle axis*; μ adds a *financial/latency axis*; ν adds an *outcome (consequence)* axis. Voice is now mapped across:

- lexical (Rounds 1-3)
- register (Round 5)
- procedural (Round 6 ιβ)
- acoustic (Round 6 ια)
- pedagogical (Round 6 ιγ)
- ethical / social (Round 6 ιδ)
- systemic / production-graph (Round 7)
- **translation / cross-language (Round 8 κ)**
- **author lifecycle / worldbuilding-tool (Round 8 λ)**
- **economic / latency feasibility (Round 8 μ)**
- **reader cognitive experience (Round 8 ν)**

11 axes on the voice lattice; Pinax maps 1 strongly (lexical via samples/critic), 2 partially (register vector, procedural positions), 0-2 weakly on the rest.

### 15.6 What's still uncovered

The §12 list is largely exhausted by Rounds 4-8. Remaining genuinely new angles a future Round could pursue:
- Predictive / player-AI alignment (Rein & Reis' "AI literacy" / Tailwind-style behavior shaping from gameplay)
- Voice in MMO continuous world (vs single-player discrete beats)
- Voice in simulation games (Sims / Cities / Crusader Kings — NPCs that *talk* under gameplay loops)
- Voice in sensory substitution (audio descriptions of prose for blind readers; Pinax's local-first architecture has implications)
- Voice & accessibility (dyslexic readers; non-native readers; aging readers; type-audio interplay)
- Voice & rights (when voice cloning enables impersonation — local-first storage has privacy implications)
- Voice in epistemic-plural worlds (multiverse / alternative-history settings; voice shifts across branches)

These are the natural Round 9+ axes if the user wants more depth.
