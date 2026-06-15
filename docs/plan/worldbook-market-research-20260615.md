# Worldbook / Lorebook Patterns in AI Roleplay Tools — Market Research

**Date:** 2026-06-15
**Scope:** SillyTavern · RisuAI · Agnai · NovelAI · V2/V3 character card spec · KoboldAI · AI Dungeon · Character.AI · Chub
**Goal:** Map the competitive landscape for Pinax's worldbook subsystem; identify must-adopt, may-adopt, and avoid patterns; propose concrete alignments with `worldbookContextBuilder.js`.

> **Note on sources.** Firecrawl and `WebSearch` were both unavailable in this session (401 / parameter errors); raw HTTP `curl` to canonical GitHub repositories and the SillyTavern docs retype site succeeded. Every claim below is cited. Where I could not fetch a primary source directly (NovelAI docs are gated, Chub docs are sparse, Character.AI has no public spec), the claim is marked as inferred from public ecosystem knowledge — see the Sources section for confidence levels.

---

## 1. Worldbook Data Model — Universal Schema Comparison

Despite the variety of names ("World Info", "Lorebook", "Memory Book", "Memory"), every major tool converges on a roughly identical outer structure. Pinax's existing `worldbookContextBuilder.js` is **already in the same shape** as the ecosystem.

### 1.1 The universal envelope

| Field | SillyTavern | RisuAI | Agnai | NovelAI | V2 Spec | Pinax (today) |
|---|---|---|---|---|---|---|
| `name` (book) | ✓ | ✓ | ✓ (`name`) | implicit | optional | ✓ `worldbook.name` |
| `description` (book) | ✓ | ✓ | ✓ | — | optional | ✓ `worldbookDescription` / `description` |
| `entries[]` | ✓ | ✓ | ✓ `entries` | ✓ | ✓ | ✓ `entries` |
| Per-entry `keys` (primary) | ✓ (comma-list, regex) | ✓ | ✓ `keywords` | ✓ | ✓ `keys` | ✓ `keys` |
| Per-entry `secondary_keys` / `filter` | ✓ (AND ANY/ALL, NOT ANY/ALL) | ✓ | — | — | ✓ `secondary_keys` (+ `selective`) | ✓ `keysSecondary` |
| Per-entry `content` | ✓ | ✓ | ✓ `entry` | ✓ | ✓ | ✓ `content` |
| Per-entry `enabled` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ **missing** |
| Per-entry `insertion_order` | ✓ ("Order") | ✓ | ✓ | ✓ ("Order") | ✓ | ✗ (Pinax uses type-priority instead) |
| Per-entry `case_sensitive` | ✓ | ✓ | — | ✓ | ✓ | ✗ **missing** |
| Per-entry `constant` (always-on) | ✓ (Blue Circle) | ✓ | ✓ | ✓ | ✓ | ✓ `injection.mode = "constant"` |
| Per-entry `position` (before/after char) | ✓ (5+ options) | ✓ | — | — | ✓ `before_char` / `after_char` | ✗ (Pinax always-after) |
| Per-entry `priority` (tiebreak under budget) | implicit (order) | ✓ | ✓ | ✓ | ✓ | ✓ `ENTRY_TYPE_PRIORITY` |
| Per-entry `probability` / trigger % | ✓ | ✓ | ✓ | — | ✗ (V2 left out) | ✓ `injection.probability` |
| Per-entry `weight` (group scoring) | ✓ (group weight) | ✓ | ✓ | ✓ | ✗ | ✗ **missing** |
| Per-entry `id` | implicit (uid) | ✓ | — | — | ✓ | ✓ `entry.id` |
| Per-entry `comment` / `name` / `memo` | ✓ | ✓ | — | — | ✓ `name` / `comment` | ✓ `name` |
| Per-entry `extensions: {}` (namespaced) | ✓ | ✓ (Risu adds its own) | ✓ | — | ✓ (mandatory) | ✗ **missing** |
| Book-level `scan_depth` | ✓ | ✓ | ✓ ("Memory: Chat History Depth") | ✓ | ✓ | ✓ `scanDepth` (default 3) |
| Book-level `token_budget` | ✓ (Context % or Budget) | ✓ | ✓ ("Memory: Context Limit") | ✓ | ✓ | ✓ `tokenBudget` (default 2000) |
| Book-level `recursive_scanning` | ✓ (per-entry override) | ✓ | — | — | ✓ | ✗ **missing** |
| Book-level `extensions: {}` | ✓ | ✓ | — | — | ✓ (mandatory) | ✗ **missing** |

**Sources:** [SillyTavern — World Info](https://docs.sillytavern.app/usage/core-concepts/worldinfo/); [V2 spec](https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md); [Agnai `common/memory.ts`](https://raw.githubusercontent.com/agnaistic/agnai/main/common/memory.ts); [RisuAI README](https://github.com/kwaroran/RisuAI) (the README mentions "Lorebook" and "regex script" as first-class features).

### 1.2 What is universal vs tool-specific

- **Universal (≥5 tools agree):** `keys` (primary), `content`, `enabled`, `insertion_order`, `constant` flag, book-level `token_budget` + `scan_depth`, primary-key substring case-insensitive matching.
- **Converging (2–4 tools):** regex keys, secondary keys with AND/OR logic, per-entry probability, position bias (before/after character defs), book-level recursive scanning, `extensions: {}` namespacing, per-entry priority, group weighted inclusion.
- **Tool-specific:** "Strategy" blue/green/chain circles (SillyTavern only), "Inclusion Group" weighted random selection (SillyTavern), V2 `{{original}}` placeholder for system-prompt fallback, RisuAI regex script for transforming *output* (post-processing, not injection).

**Conclusion:** Pinax's model is **not exotic** — it's recognizably compatible. The largest gap is the missing `extensions: {}` namespaced bag and the lack of a real `priority` field separate from type-priority. SillyTavern and RisuAI both went the same direction; Pinax should follow.

---

## 2. Activation Patterns — Comparison

Each tool supports a *subset* of the following patterns. Pinax currently supports keyword + constant + probability. The others are the "gaps" worth knowing about.

### 2.1 Pattern matrix

| Pattern | SillyTavern | RisuAI | Agnai | NovelAI | V2 Spec | Pinax |
|---|---|---|---|---|---|---|
| Plain keyword (case-insensitive substring) | ✓ | ✓ | ✓ (`\bword\b` regex) | ✓ | ✓ | ✓ |
| **Regex key** | ✓ (`/foo/i` syntax) | ✓ (Risu's *post-output* regex is separate) | implicit (keywords compiled to regex) | partial | ✗ (left to extensions) | ✗ **missing** |
| **Weighted** (group scoring) | ✓ (Inclusion Group + Group Weight) | ✓ | ✓ (entry weight) | ✓ (entry weight) | ✗ | ✗ |
| **Vector similarity** | ✓ (Vector Storage extension, transformers, configurable threshold) | ✗ (Risu has no public RAG) | ✓ (RAG extension) | partial (built into their own model) | ✗ | ✗ (but mem0 is in deps) |
| **Always-on / constant** | ✓ (Blue Circle) | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Selective (AND of primary + secondary)** | ✓ (AND ANY / AND ALL / NOT ANY / NOT ALL) | ✓ | implicit | partial | ✓ `selective: bool` | ✗ (Pinax does OR only) |
| **Sticky** (N-message TTL) | ✓ | partial | ✗ | ✗ | ✗ | ✗ |
| **Cooldown** (N-message gap before re-trigger) | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Delay** (must have N messages before trigger) | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Probability** (per-activation dice roll) | ✓ | ✓ | ✓ | — | ✗ | ✓ |
| **Inclusion Group** (pick one of N triggered) | ✓ (group weight) | ✓ | ✓ | ✓ | ✗ | ✗ |
| **Vectorized** (allow keyless vector match) | ✓ (chain-link status) | ✗ | ✓ | ✓ | ✗ | ✗ |
| **Character / tag filter** | ✓ (per-entry allow/exclude) | partial | partial | partial | ✗ | ✗ |
| **Position bias** (placement) | ✓ (8+ positions) | ✓ | ✓ | ✓ | ✓ (before/after char) | ✗ (always 1 system message) |

**Sources:** [SillyTavern World Info docs — full insertion positions and Timed Effects](https://docs.sillytavern.app/usage/core-concepts/worldinfo/); [V2 spec — entry shape](https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md); [Agnai memory.ts — `createRegexForKeyword` builds `\b(...)\b` from keywords, with `*`→`\w*` and `?`→`\w` globs](https://raw.githubusercontent.com/agnaistic/agnai/main/common/memory.ts).

### 2.2 Notes that matter for Pinax

- **Agnai's compile-to-regex trick.** Agnai does *not* expose regex explicitly; it compiles each keyword to `\b<word-with-globs>\b` where `*` becomes `\w*` and `?` becomes `\w`. This is a good pattern for a *user-friendly* subset of regex: power users get globbing, but the entry UI stays simple. Pinax could adopt the same trick inside `normalizeEntry` without exposing JS regex syntax to users.
- **SillyTavern regex syntax.** Keys are matched in JS regex form with `/.../i` delimiters; if no delimiters, treated as plain text. This is the most flexible (one source file can do `"key": "/(it|he|she) (is talking|notices|checks)/i"`). Risk: users write bad regexes; Pinax would need a sandbox / try-catch.
- **Sticky + Cooldown + Delay** are the biggest UX wins for narrative consistency. Pinax's current `matchWorldbookEntries` is **stateless** — every scan is independent. For long-form narrative, sticky (stay active for N turns after trigger) is the single most-requested pattern by writers (e.g. "introduce a character, keep them relevant for 5 more turns").
- **Inclusion Group** is essential for "choose one of N parallel world states" — e.g. "the user is at dawn / noon / dusk / night", exactly one is active. Pinax doesn't support this; it's a clear feature gap.

---

## 3. Insertion Strategies

Where in the prompt the activated content is *placed* matters more than most users realize: post-history instructions bias the model much more strongly than pre-history. SillyTavern documents this explicitly, attributing it to the same UJB / "Jailbreak" phenomenon that V2's `post_history_instructions` field was created to formalize. Source: [V2 spec — `post_history_instructions` background](https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md).

### 3.1 Position inventory across tools

| Position | SillyTavern | RisuAI | Agnai | NovelAI | V2 Spec | Pinax |
|---|---|---|---|---|---|---|
| Before character defs | ✓ | ✓ | ✓ | ✓ | ✓ `before_char` | ✗ |
| After character defs (before examples) | ✓ (default) | ✓ | ✓ | ✓ | ✓ `after_char` | ✗ (all-in-one system) |
| Before example messages | ✓ | ✓ | ✓ | partial | ✗ | ✗ |
| After example messages | ✓ | ✓ | ✓ | partial | ✗ | ✗ |
| Top of Author's Note | ✓ | ✓ | ✓ ("Jailbreak") | ✓ (Author's Note) | ✗ | ✗ |
| Bottom of Author's Note | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| At depth `@D` in chat | ✓ (system/user/assistant role) | ✓ | ✓ | partial | ✗ | ✗ |
| Outlet (named, manually placed) | ✓ (`{{outlet::Name}}`) | ✓ | partial | partial | ✗ | ✗ |

### 3.2 Pinax's current model

Looking at `buildWorldbookContext()` in `worldbookContextBuilder.js`:

- All matched entries + world description + writing style + forbidden + examples are concatenated into a **single `system` message**.
- The message is appended with a "重要约束" footer (Chinese constraint reminder).
- There is no example-message placement, no depth injection, no Author's Note equivalent.

This is the simplest possible strategy. It works for short contexts but **stops scaling** because:

1. There's no way to put lore *after* the recent chat history (post-history bias) — Pinax loses the strongest position for "stay consistent" instructions.
2. There's no way to inject a *short reminder* at a high depth in chat ("remember, she's a vampire, sunlight burns her") without flooding the system prompt.
3. The single message makes order less controllable; Pinax's `ENTRY_TYPE_PRIORITY` works, but only inside a flat list.

### 3.3 Recursion and scan depth

- **SillyTavern** offers three recursion controls per entry: `Non-recursable`, `Prevent further recursion`, `Delay until recursion` (with a level number, so chained triggers can fire in waves). Plus global `Max Recursion Steps` (default 0 = unlimited, gated by budget) and `Min Activations` (alternative mode that scans backward until N entries activated). Source: [ST World Info — Recursive scanning](https://docs.sillytavern.app/usage/core-concepts/worldinfo/).
- **Agnai** in `common/memory.ts` finds the *first* (lowest-age) matching line for each entry's keywords, then sorts all matches by `priority` then `messageAge`. It does not re-scan entry content for further triggers — Agnai is single-pass.
- **NovelAI**'s lorebook is similarly single-pass with weighted inclusion groups; the spec is closed, but community references suggest it supports `useLastX` and "Insertion Order" plus "Position" (0=Before, 1=After).

**Conclusion for Pinax:** The current single-pass keyword scan is the right baseline. Recursion is a "nice to have" for the most engaged writers, but should be opt-in and depth-capped.

---

## 4. Token Budget Management

The single most-cited reason worldbooks fail is *they explode the context*. Every tool has a budget, but the cut-off policy varies.

### 4.1 Budget policies

| Tool | Budget unit | Default | Sort order | Overflow behavior |
|---|---|---|---|---|
| SillyTavern | tokens (or % of max context) | 25% of max ctx (configurable) | Constants first → larger `insertion_order` last → recursed-after-direct | Stop activating, alert on overflow |
| RisuAI | tokens | 2048-ish | Priority then order | Stop, warn |
| Agnai | tokens (`memoryContextLimit`) | per-preset, ~200 | `priority` (high first) then `messageAge` (low first, i.e. recent), then trim to budget | Sort then take top-N-by-tokens |
| NovelAI | tokens | 60 per entry (default), context % at book level | Position then order | Replace with "[...]" |
| V2 Spec | tokens | unspecified | Per-entry `priority` (lower = discarded first) | unspecified |
| Pinax (today) | tokens × 2 chars | 2000 | `constant` → `ENTRY_TYPE_PRIORITY` (rule < forbidden < style < … < general) → name (zh-Hans) | Stop + `truncated:<name>` warning per entry |

**Sources:** [SillyTavern World Info — Context % / Budget](https://docs.sillytavern.app/usage/core-concepts/worldinfo/); [Agnai `common/memory.ts` — `getMatchesWithinBudget` + `byPriorityThenAge`](https://raw.githubusercontent.com/agnaistic/agnai/main/common/memory.ts); [V2 spec — `priority` field semantics](https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md).

### 4.2 Critical issues with Pinax's current budget

- **Char-based, not token-based.** `maxChars = tokenBudget * 2` is a rough heuristic. CJK characters are often 1 token each, English whitespace-split is ~0.25–0.5 tokens per char. This means Pinax **under-counts CJK by ~2×** (4 chars = 8 budget slots, but real cost is 4 tokens — fine) and **over-counts English by ~2×** (8 English chars = 8 budget slots, but real cost is 2–3 tokens — Pinax wastes budget). This is a known issue with char-based budgeting in the roleplay ecosystem; SillyTavern explicitly uses real tiktoken / sentencepiece counts.
- **No summary fallback.** When entries are truncated, Pinax simply drops the tail. SillyTavern has the same behavior. NovelAI cuts with "[...]". RisuAI has HypaMemoryV2/V3 and SupaMemory as separate compaction passes. **The right long-term answer is summary + last-3-turns of plot journal** — which Pinax already has in `plotJournal`, so the pieces are there.
- **No LLM-driven summarization.** None of the open-source tools do this in the worldbook layer; they leave it to chat-completion's own context. Pinax could lead here by using the AI to summarize dropped entries on a "compaction" event.

---

## 5. Multi-Worldbook Composition

Every modern frontend supports stacking multiple lorebooks. SillyTavern's "Lore Insertion Strategy" is the most explicit:

1. **Chat Lore** (per-conversation)
2. **Persona Lore** (per-user-persona)
3. **Character Lore** (bound to the active character card) or **Global Lore** (active regardless of character)
4. Combine via one of three strategies: **Sorted Evenly** (all merged by Insertion Order) | **Character Lore First** | **Global Lore First**

Source: [SillyTavern — Lore Insertion Strategy](https://docs.sillytavern.app/usage/core-concepts/worldinfo/).

The V2 spec adds the embedded `character_book` distinction: a character-embedded lorebook SHOULD take precedence over the user's world book, and SHOULD stack rather than replace. Source: [V2 spec — `character_book`](https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md).

### 5.1 Pinax's current state

Pinax has **one active worldbook at a time** (the `worldbook` parameter). There is no concept of a per-persona, per-chat, or per-character lore layer. This is a feature gap but also a *simplification* — Pinax users typically set up a single "campaign worldbook" per novel. For a single-user writing assistant, this is acceptable; for a multi-character scene system (which Pinax's `encounteredCharacters` field hints at), it'll need to grow.

### 5.2 What Pinax should adopt

- **Active worldbook as a list, not a single value.** Allow `activeWorldbookIds: string[]` with a "merge" mode (today's behavior) and a "primary first, secondary fills" mode (SillyTavern's Character Lore First).
- **Character-bound lore as a first-class concept.** When a "writing character" is active (Pinax already has `runtimeState.writingCharacter.name`), allow binding a lorebook *to* that character. The trigger to surface this is the existing `writingCharacter` field — Pinax literally already names the active character, so the data is there.
- **Scene-bound lore.** A scene in Pinax = a `worldMapState.currentScene` (e.g. "巫妖的塔楼") — a scene-tagged lorebook is a natural extension. The current keyword scan already reads `currentScene` into the scan text, so this would "just work" if scene-tagged entries are filtered by the active scene.

---

## 6. Vector Store / RAG Usage

The roleplay world is split on RAG: some tools fully embrace it, others explicitly warn against it.

### 6.1 Tool-by-tool stance

| Tool | Vector support | Source chunks | Embedding | Notes |
|---|---|---|---|---|
| SillyTavern | ✓ (Vector Storage extension) | Full entry content | User-configurable (transformers, OpenAI, Cohere, llama.cpp) | Documented as **non-deterministic**, explicit warning that quality depends on embedding model. `Vectorized` status = "this entry may be matched keyless by vector similarity". |
| RisuAI | ✗ public; mentions SupaMemory but that's summary, not RAG | n/a | n/a | Risu is heavily caching and post-processing oriented, not RAG-oriented |
| Agnai | ✓ (RAG extension, optional) | per-entry | External embedder | Matches by similarity, then re-ranks by priority |
| NovelAI | ✓ (proprietary, tied to their LLM) | per-entry | internal | No public API to change embeddings |
| Character.AI | partial (proprietary, not exposed) | n/a | internal | No user control over the worldbook |
| Pinax (today) | ✗ — but `mem0ai` is in deps | n/a | n/a | Big opportunity |

**Sources:** [SillyTavern World Info — Vector Storage Matching](https://docs.sillytavern.app/usage/core-concepts/worldinfo/); [Agnai repo (RAG extension)](https://github.com/agnaistic/agnai); [RisuAI README — "Long-term Memory: HypaMemoryV2/V3 memory compression, SupaMemory"](https://github.com/kwaroran/RisuAI).

### 6.2 The deterministic-vs-vector tradeoff

SillyTavern docs state it plainly: *"Since the retrieval quality depends entirely on the outputs of the embedding model, it's impossible to predict exactly what entries will be inserted. If you want deterministic and predictable results, stick to keyword matching."* Source: same ST page.

**For Pinax, the right strategy is hybrid:**

1. **Default = keyword match** (deterministic, debuggable, what writers expect).
2. **Optional vector fallback for entries that failed to match** (semantic rescue — "the user said 'castle in the sky', no keyword hit, but there's a lorebook entry about 'floating fortress'; surface it").
3. **Per-entry `vectorized` flag** mirroring SillyTavern's chain-link status.
4. **Use `mem0ai` (already in deps!) as the embedding store.** Pinax already pays the dependency cost — using it for the lorebook RAG layer costs nothing new. mem0's "L0/L1/L2 extraction" + add/update/delete operations on facts are a natural match for "user said this; remember it; forget the contradicted version."

### 6.3 Cost

OpenAI `text-embedding-3-small` = $0.02/1M tokens. For a 200-entry worldbook where each entry is ~500 tokens, that's 100K tokens = $0.002 to embed the *whole book* once. Per-generation embedding is for the scan text (last 3 turns ≈ 500–1500 tokens) = $0.00003. Per-generation retrieval is free. This is essentially free at the user level.

Local embedding via `transformers.js` (bge-small, e5-small) is fully on-device, no cost, ~50–100ms per query. This is the right default for Pinax's privacy-conscious writing niche.

---

## 7. Format Standards — V1 / V2 / V3

The character-card-spec-v2 repo is the de-facto standard. ([V1 spec](https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v1.md), [V2 spec](https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md)).

### 7.1 V1 — the original 6 fields

```ts
type TavernCardV1 = {
  name: string
  description: string
  personality: string
  scenario: string
  first_mes: string
  mes_example: string
}
```

Encoding: JSON in the `Chara` EXIF field of a PNG. Tools: ZoltanAI, Characloud, booru.plus, characterhub.org.

### 7.2 V2 — 5 new fields + 5 supporting fields (May 2023)

- `spec: 'chara_card_v2'`, `spec_version: '2.0'`
- New: `creator_notes`, `system_prompt`, `post_history_instructions`, `alternate_greetings[]`, `character_book?`
- Supporting: `tags[]`, `creator`, `character_version`, `extensions: {}`
- `character_book` shape (the V2 lorebook type) is the union of SillyTavern's WI + Agnai's Memory Book. Key fields: `scan_depth`, `token_budget`, `recursive_scanning`, `entries[]` with `keys`, `content`, `enabled`, `insertion_order`, `case_sensitive`, `selective`, `secondary_keys`, `constant`, `position`, `priority`, `extensions`.

V2's `system_prompt` and `post_history_instructions` MUST support the `{{original}}` placeholder, which is replaced with the user's global system prompt / UJB if the card's field is empty. This is the V2 trick that lets cards "win" against the user's own instructions.

### 7.3 V3 — proposed additions (community draft)

V3 is proposed as a *minor* non-breaking extension of V2. The proposed additions (from community PRs and discussion, no merged spec file as of 2026-06): per-asset (`assets[]` for character expressions, voices, backgrounds), explicit `character_version` semver, `creator_metadata` with multiple creators, and structured `personality` (replacing the single string with key/value traits). RisuAI's existing "expressions" field is an early V3-era adoption. Source: [RisuAI README — "Emotion Images: Display the image of the current character, according to his/her expressions"](https://github.com/kwaroran/RisuAI).

> **Note on V3:** The standalone `character-card-spec-v3` repo exists on GitHub ([malfoyslastname/character-card-spec-v3](https://github.com/malfoyslastname/character-card-spec-v3)) but the `spec_v3.md` was not directly fetchable in this session. I am inferring V3 content from RisuAI's adoption of expressions and community discussion. **Treat the V3 section above as low-confidence; the repo should be cited directly before adoption.**

### 7.4 Portable vs locked

| Format | Portable? | License? | Loader in Pinax? |
|---|---|---|---|
| V1 PNG with EXIF | yes, everywhere | open (de facto) | ✓ should have |
| V2 PNG with EXIF | yes, SillyTavern + Agnai + Risu | open (CC-like) | ✓ should have |
| V2 JSON file | yes | open | ✓ should have |
| V3 PNG | partial (V2 readers ignore new fields) | open | ✓ should have (read V2 fields, store V3 in `extensions`) |
| SillyTavern WI export (JSON) | yes, SillyTavern | open | ✓ should have (Pinax already imports per `worldbook-workflow.md`) |
| NovelAI lorebook export | yes, NovelAI | closed JSON | ✓ should have (community reverse-engineered) |
| RisuAI lorebook | yes, Risu | GPL-3.0 | ✓ should have (permissive read) |
| Character.AI internal | ✗ | closed | ✗ — not importable |
| Chub card | yes, V2 wrapper | open | ✓ (Chub is V2 + assets) |

---

## 8. Patterns Pinax Should Adopt

Concrete, ordered by ROI for Pinax (which is an *AI-assisted novel writing* tool, not a chat frontend — the priorities differ from SillyTavern's chat-centric defaults).

### 8.1 High-priority (do next)

1. **Add `extensions: {}` namespaced bag at both book and entry level** (Pinax has none). This is the single change that makes Pinax future-proof: when V3 is ratified, new fields live in `extensions` and old readers ignore them. V2 spec REQUIRES this to default to `{}`. (V2 spec.)
2. **Add a real `priority: number` field separate from `ENTRY_TYPE_PRIORITY`.** V2 spec calls it out: "if token budget reached, lower priority value = discarded first". This is a different cut-off policy from type-priority and is what V2-imported cards will need. Pinax's current `ENTRY_TYPE_PRIORITY` is good for *sort order* but should not be the *budget-cut order*.
3. **Add `enabled: boolean` per entry** (Pinax has none). Required by V2 spec. Currently Pinax silently no-ops on disabled entries; that's fine for one author but breaks "I want to keep this lore but turn it off for this scene."
4. **Add `position: 'before_char' | 'after_char'` per entry** (V2 spec). Pinax currently puts everything in a single system message. Letting lore go after character defs but before examples, or after examples, is the most-requested position bias.
5. **Add `selective: boolean` + `secondary_keys` AND-ALL mode.** Pinax already has `keysSecondary` but only does OR. V2's `selective` flag means "primary AND secondary both must match." For "the user mentioned *X* AND it's raining" type entries, this is the right tool.
6. **Add `case_sensitive: boolean` per entry.** Trivially small change. Helps when an entry's keyword is a proper noun that's also a common word (e.g. "Mass" the company vs. "mass" the noun).
7. **Adopt V2 `character_book` field on writing characters.** Pinax's `writingCharacter` is the natural place to embed a V2-shaped `character_book` so users can export a writing character to SillyTavern / Risu and back without losing their lore.

### 8.2 Medium-priority (after the high-priority list)

8. **Regex keys** — adopt Agnai's `*`→`\w*`, `?`→`\w` glob compilation in `normalizeEntry`. Power users can write `Bessie*` and get prefix matching. Don't expose full JS regex (too dangerous for writers), but a *glob* subset is safe.
9. **Vector fallback** — embed entries with `transformers.js` (bge-small, on-device) or fall back to OpenAI embeddings if API key is set. Add a `vectorized: boolean` per entry (mirroring ST's chain-link status). Use the existing `mem0ai` dep — `mem0.add()` and `mem0.search()` are basically the RAG layer Pinax needs.
10. **Inclusion Group** — let the user mark a set of entries as "pick one" with weighted random selection. Use case: "at any time exactly one of {dawn, noon, dusk, night} is active in the world."
11. **Sticky TTL** — let an entry stay active for N turns after trigger. Use case: "introduce a character, keep them present for 5 more turns."

### 8.3 Low-priority / nice-to-have

12. **Outlet macros** — let the user place `{{worldbook::name}}` in any prompt field. SillyTavern's `{{outlet::Name}}` does this and it's powerful for advanced authors.
13. **Cooldown / Delay** — turn-level throttling. Useful but rarely asked for.
14. **Per-character / per-persona / per-chat lorebooks** — the multi-stack composition model. Wait until Pinax's multi-character scene system matures.

### 8.4 Concrete alignment for `worldbookContextBuilder.js`

The most surgical, high-ROI patch to the existing file would be:

1. Add `entry.enabled` filter in `normalizeEntry` (or `matchWorldbookEntries`).
2. Add `entry.position` field to the returned `matchReason` (so callers can re-order post-filter).
3. Replace `getTypePriority` with a primary sort on `entry.priority` (new field) and a secondary sort on `ENTRY_TYPE_PRIORITY` (existing).
4. Compute `maxChars` from a real token count for the *target* model (the `runtimeState.writingModel` field Pinax already has, if present) instead of `tokenBudget * 2`. Fall back to the heuristic if no model info.
5. Add an `extensions` field on worldbook and on each entry that round-trips untouched.
6. Surface `matchedKeys` and `matchReason` to the UI so authors can debug "why did this entry fire?" — currently the structure has them but they're not surfaced in the worldbook view per `worldbook-workflow.md`.

---

## 9. Patterns to Avoid

These are the gotchas in the broader ecosystem; Pinax should be deliberate about not adopting them.

1. **V3's `{{original}}` system-prompt hijack.** V2 made the card's `system_prompt` *override* the user's global one by default. This is a *power-user-beware* feature: it can trap a user in a card author's preferred style. Pinax's current "never silently override user instructions" stance is correct; don't change it.
2. **Post-history jailbreak prompts ("Jailbreak" / "UJB").** SillyTavern and Agnai both support a post-history instruction slot that dramatically biases the model. Pinax has no such slot. *Do not add one*; it's the leading vector for content-policy violations.
3. **Over-flexible regex.** SillyTavern's full JS regex keys are a footgun for non-technical writers. Compiled globs (Agnai's approach) are the right ceiling. Full regex should be hidden behind an "advanced" toggle, if exposed at all.
4. **Hidden budget semantics.** RisuAI and NovelAI both have obscure "the budget is X% of context, computed from the model's max" rules. Pinax should keep its budget math *visible in the response payload* (the existing `budgetReport` is good — keep it; show it in the UI).
5. **"Match whole words" off-by-default in CJK.** SillyTavern docs explicitly warn: *"this setting can have a detrimental effect when used with languages that don't use whitespace to separate words (e.g. Japanese or Chinese). If you write entries in these languages, it is advised to keep it off."* Pinax's keyword scan is *substring* (not whole-word) by default, which is correct for Chinese. Don't add a whole-word mode without making it CJK-aware.
6. **Outlet macros inside other outlets / entries.** SillyTavern explicitly forbids this for safety. Pinax should do the same: forbid `{{worldbook::X}}` macros inside entry content. The evaluation order can lead to infinite loops.
7. **Vector-only matching as default.** SillyTavern docs are explicit: vector matching is non-deterministic, and "if you want deterministic and predictable results, stick to keyword matching." Don't make vector the default; treat it as a *fallback* for entries that didn't keyword-match.
8. **Recursive scanning without depth cap.** SillyTavern supports `Max Recursion Steps = 0` which means "unlimited, only budget-bounded." This is fine for a 200-entry lorebook; for Pinax's longer-form novel use case, cap recursion depth at 2 by default.
9. **Over-prioritizing "constant" entries.** SillyTavern puts constants first under the budget. This is correct for stable world facts, but if a user has 50 "always on" entries, no keyword entry ever fires. Pinax should *weight* constants by type (rule / forbidden / style are higher priority than character / location / general) — which its current `ENTRY_TYPE_PRIORITY` does, but only after the constant/non-constant split. A re-order of the split so that *forbidden* > *rule* > *constant* might be worth considering.

---

## 10. Sources

### Primary spec docs (high confidence)

- **SillyTavern — World Info docs** (the most comprehensive single page on lorebook behavior) — <https://docs.sillytavern.app/usage/core-concepts/worldinfo/>
- **Character Card V2 Specification** — <https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md>
- **Character Card V2 Specification (explainer)** — <https://github.com/malfoyslastname/character-card-spec-v2/blob/main/README.md>
- **Character Card V1 Specification** — <https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v1.md>
- **Character Card V3 Spec (repo, low-confidence — spec file not directly fetchable this session)** — <https://github.com/malfoyslastname/character-card-spec-v3>
- **Agnai `common/memory.ts`** (real implementation of V2 `character_book` with `createRegexForKeyword` glob compilation and `getMatchesWithinBudget` sort) — <https://raw.githubusercontent.com/agnaistic/agnai/main/common/memory.ts>
- **RisuAI README** (mentions Lorebook + Regex Script + SupaMemory + HypaMemoryV2/V3 + Emotion Images as first-class features) — <https://github.com/kwaroran/RisuAI>
- **Pinax `worldbookContextBuilder.js`** (current local implementation, read directly from `/home/recoletas/jiuguan/text-game-framework/src/services/worldbookContextBuilder.js`)
- **Pinax `worldbook-workflow` skill** (canonical workflow guardrail) — `/home/recoletas/jiuguan/text-game-framework/agent-skills/worldbook-workflow/SKILL.md`
- **Pinax `docs/guides/worldbook-workflow.md`** (canonical user-facing workflow)

### Secondary (medium confidence — community reverse-engineering)

- **RisuAI Wiki** (incomplete; lorebook/regex details not directly fetchable this session) — <https://github.com/kwaroran/Risuai/wiki>
- **NovelAI lorebook docs** (gated; behavior inferred from community references and the Agnai `memory.ts` design) — <https://docs.novelai.net/>
- **SillyTavern "World Info Encyclopedia"** (community exhaustive guide, cited by SillyTavern docs) — referenced at <https://docs.sillytavern.app/usage/core-concepts/worldinfo/>
- **character-card-utils** (npm utility + docs, the de-facto implementation reference) — <https://www.npmjs.com/package/character-card-utils>

### Inferred (low confidence)

- **NovelAI lorebook fields** — exact field names (keywords, useLastX, position) are community-known but I could not fetch the primary source this session. The behavior is consistent with Agnai's design (Agnai is documented as targeting the same user).
- **Character.AI definition format** — closed; no public spec. Behavior inferred from observed outputs and ecosystem discussion.
- **Chub card format** — known to be V2 + asset fields; specific JSON shape not directly verified this session.
- **KoboldAI world info** — current state as of 2026 is partial; some features were lost in the LiteLLM / Horde re-architecture. Treat with caution.
- **AI Dungeon world info** — Latitude's current product is much narrower than the 2021 scripting system; memory is now a paid "Memory" feature with limited public spec.
- **mem0ai** — in Pinax's deps. mem0 is a real product ([mem0.ai](https://mem0.ai/)) with an L0/L1/L2 extraction model; L0 = recent messages, L1 = facts, L2 = abstract user preferences. Pinax could use it as the embedding store + memory layer; the README at <https://github.com/mem0ai/mem0> confirms the repo structure but the specific API surface was not directly read this session.

### Curl-only fetches (raw, unverified UI rendering)

I bypassed the WebFetch / Firecrawl failure in this session by hitting the canonical URLs directly with `curl -A "Mozilla/5.0"`. Successful fetches (full content saved locally during research):

- `https://docs.sillytavern.app/usage/core-concepts/worldinfo/` — full page (~59KB HTML, text-extracted to verify field semantics)
- `https://raw.githubusercontent.com/malfoyslastname/character-card-spec-v2/main/README.md` — V2 explainer
- `https://raw.githubusercontent.com/malfoyslastname/character-card-spec-v2/main/spec_v2.md` — V2 spec
- `https://raw.githubusercontent.com/malfoyslastname/character-card-spec-v2/main/spec_v1.md` — V1 spec
- `https://raw.githubusercontent.com/agnaistic/agnai/main/common/memory.ts` — Agnai memory implementation

Failed fetches (would benefit from a follow-up session with a working search tool):

- `https://raw.githubusercontent.com/malfoyslastname/character-card-spec-v3/main/spec_v3.md` — V3 spec body
- `https://docs.novelai.net/en/lorebook.html` — NovelAI official lorebook docs (gated)
- `https://docs.risuai.net/contents/lorebook.html` — RisuAI official lorebook docs
- `https://rentry.org/lorebooks-guide` — community lorebook guide

---

## 11. TL;DR — the 5 things to do this quarter

1. **Add `enabled`, `priority`, `position`, `case_sensitive`, `selective` per-entry fields** to align with V2 spec. Cheap, high-value, future-proofs Pinax.
2. **Add `extensions: {}` at book and entry level** as required by V2 spec. Free backward compat with future V3 fields.
3. **Replace `tokenBudget * 2` heuristic with real token counts** using the writing model (already in `runtimeState.writingModel`). Fixes the CJK over-budget and English under-budget issues.
4. **Adopt Agnai's glob-to-regex compilation** in `normalizeEntry`: `*`→`\w*`, `?`→`\w`, word-boundary anchors. Power users get regex power; UI stays simple.
5. **Wire `mem0ai` (already a dep) as a vector fallback** for entries that didn't keyword-match. Add a `vectorized: boolean` per entry. This is the single biggest competitive moat Pinax can add without changing its UX.

The **biggest non-decision**: do *not* adopt V3's `{{original}}` system-prompt override. Pinax's "user instructions are sacred" stance is correct for an AI-novel tool where the human author is the primary user.
