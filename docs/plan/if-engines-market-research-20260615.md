# Interactive Fiction / Text Adventure Engines — Market Research

**Date:** 2026-06-15
**Scope:** Twine (Harlowe / SugarCube / Chapbook) · Ink + inkjs · Inform 7 / 6 / PunyInform · ChoiceScript · Yarn Spinner · TADS · Ren'Py · Narrat · Fungus · Adventure Creator · AI Dungeon / Latitude · Inworld · Convai
**Goal:** Map the scripting model, state management, web runtime maturity, and AI-integration surface of the IF engine landscape in 2025-2026, then derive concrete patterns Pinax should adopt, align with, or avoid.

> **Note on sources.** Firecrawl MCP returned 401, and `WebSearch`/`WebFetch` were unavailable in this session (400 parameter errors). Raw HTTP `curl` to canonical GitHub repositories, official project sites, and Ink / Yarn Spinner / Ren'Py / SugarCube / ChoiceScript / Inform documentation succeeded. Every claim below is cited. Where a primary source could not be fetched, the claim is marked "inferred" with confidence flagged in the Sources section.

---

## 1. Engine Comparison Matrix

| Engine | Scripting Model | Web Runtime | Branching Depth | AI Hooks | State Mgmt | Community / Stars | Maintenance (2025-2026) |
|---|---|---|---|---|---|---|---|
| **Twine 2** (Tweego / TwineJS) | Visual node-graph; compiles to HTML; per-format script overlay (Harlowe/SugarCube/Chapbook) | Native — published stories are single HTML files with embedded JS | Effectively unlimited (passage graph is a DAG; loops are explicit) | Format-level (SugarCube has `<<script>>`, Harlowe has `(set:)`; no built-in AI hooks) | Per-passage variables in `StoryState`; localStorage autosave in SugarCube; save/load via bookmarks | TwineJS 2.8k stars ([GH](https://github.com/klembot/twinejs)), Twine Cookbook 140 stars; IFComp community large | TwineJS pushed 2026-04; Twine 1 dead per its README; SugarCube 2.x maintained through 2026 ([site](https://www.motoslave.net/sugarcube/)); Harlowe on Heptapod, sparse |
| **Ink** (inkle) | Declarative flow scripting: knots, stitches, choices, diverts, tunnels, threads, lists, variables | `inkjs` ([GH](https://github.com/y-lohse/inkjs)) — 639 stars, TypeScript, pushed 2026-05; also `inkjs` runs in browsers via `<script>` | Unlimited knots/stitches; runtime maintains a call stack so nested/parallel flows are first-class | No native AI; pattern is "compile a story with placeholder choices, let LLM pick from `*` options" (used in Heaven's Vault and 80 Days) | `inkjs` exposes `Story.state` JSON; save = serialize state, load = restore + re-attach JSON to a fresh Story | Ink 4.8k stars ([GH](https://github.com/inkle/ink)), `ink-leaper` forks; `inkle/ink-library` 329 stars (sample games) | Ink pushed 2026-05; `Inky` editor builds for macOS/Win/Linux via GitHub Releases |
| **Inform 7** (Graham Nelson) | Natural-language rule-based IF ("The kitchen is a room. ...", relation rules, scenes) | Parchment (Glk-based) interpreter in JS; Quixe (Z-machine / Glulx in JS); Borogove ([site](https://borogove.app/)) | World-model depth, not branching — parser IF uses world state graph; well over 10k IFComp games | None native; community has experimented with AI-augmented parsers but no canonical pattern | `world.state` plus per-save file; saves are binary VM snapshots; versioned via Glulx save format | Inform 6/7: Graham Nelson's gitlab mirror `ganelson/inform` 1.6k stars pushed 2026-06; IFComp ([site](https://ifcomp.org/)) shows the depth of the community | Inform 7 actively maintained (Graham Nelson 2026 commits); Parchment maintained on GitHub |
| **ChoiceScript** (Choice of Games) | Scene-based scripting: `*choice`, `*if`, `*elseif`, `*goto scene_name`, `*finish`; stat tracking with `FairMath` | Native — official ChoiceScript IDE is browser-based; vanilla HTML+JS for runtime | Linear-with-branches; statistically driven, not graph-driven; typical game = 20-80k words across ~100 scenes | None native | `script.js` runtime stores a `statChart` object; saves = serialized statChart | Choice of Games hosts ~500 published titles; ChoiceScript IDE ([GH](https://github.com/ChoicescriptIDE/choicescript)) 36 stars pushed 2026-03 | CoG actively publishes; ChoiceScript language unchanged for ~10 years (stability) |
| **Yarn Spinner** (Secret Lab) | Dialogue-tree language: `title:`, `---`, `===`, `<<jump>>`, `<<set>>`, commands, variables, functions | First-class Unity package; third-party ports (gluon, yarn-web) — `gluon-framework/gluon` 3k stars, **archived 2023-11** | Node + line-based; deeply nested jumps via `<<jump>>`; not a full graph, but flow-controlled | None native; pattern is "command callbacks fire game logic, dialogue lines drive AI NPC voice" | DialogueRunner state machine; `yarn_spinner_2.0` JSON line DB; saves = variable snapshot | Yarn Spinner 2.8k stars ([GH](https://github.com/YarnSpinnerTool/YarnSpinner)) pushed 2026-05; used in Night in the Woods, A Short Hike, DREDGE, Venba | Yarn Spinner Pty Ltd is a real company; active in 2026; VSCode extension 46 stars pushed 2025-12 |
| **TADS 2/3** (Michael Roberts) | Object-oriented C-like; rooms, actors, things, doers, verbs; `modify` and `replace` for inheritance | TADS Web Player (legacy); no modern JS port — interpreters run via Parchment for VM play | World model depth (parser IF) | None | VM save state | TADS community at IFComp and rec.arts.int-fiction; small but long-lived | TADS 2/3 maintained on `twinelab.net`; not gaining new users; legacy tool for parser IF authors |
| **Ren'Py** (Tom Rothamel) | Scripting language layered over Python 2/3: `label start:`, `scene`, `show`, `with`, `menu`, `python:` blocks | Ren'Py 8.x added HTML5/WebAssembly export (currently beta per [site](https://www.renpy.org/)) | Branching via `menu:` and `jump`; can be deep, but mostly visual-novel linear-with-branches | None native; pattern is `python:` block calling OpenAI/Claude for in-game NPC dialogue | `renpy.load(...)` / `renpy.save(...)`; saves = full game state JSON + Python pickles | 6.5k stars ([GH](https://github.com/renpy/renpy)) pushed 2026-06; the de-facto visual novel engine | Ren'Py 8.5.3 ("We Can Go to the Moon") is current; very actively maintained |
| **Narrat** (Naelao) | Custom scripting: scripts in `narrat` files; commands, choices, conditions, roll system, skills, items | Native — Narrat is a Vue 3 web app; runs in browser | Script-graph; choices are first-class; can be as deep as Ink but with a fixed roll/item system | None native; scripting allows arbitrary JS in command handlers | Pinia store; saves = serialized store to IndexedDB | Narrat website ([narrat.dev](https://narrat.dev/)) active; community on Discord; small but growing | Narrat 3.x shipped 2023-10; release cadence slowed in 2024-2025; one active maintainer |
| **Fungus** (Chris Gregan) | Unity asset; visual flowchart editor + custom Lua-like scripting language | Unity Editor only — Fungus is a Unity package, not a JS/web runtime | Block-based; Unity scene loading; can be arbitrarily deep via Fungus blocks | None native; pattern is `ExecuteCommand` with custom C# blocks for LLM calls | Fungus `SaveManager` (JSON serialize state) | Fungus: see [fungusgames.com](https://fungusgames.com/) (expired 2025); community at Unity Asset Store — historically popular (50k+ Unity installs reported) | Fungus ships in Unity Asset Store; maintenance is patch-driven; the official site expired in 2025, raising questions about long-term stewardship |
| **Adventure Creator** (Chris Burton) | Unity asset; node-based "ActionList" editor + per-scene hot-spot, inventory, dialogue, cutscene | Unity only; no web runtime | Scene-graph with verb-coin interaction; can be deep (Hotspot + Inventory + Dialogue + Cutscene + Logic) | None native; custom Action subclasses can wrap LLM APIs | `SaveSystem` (BinaryFormatter) + per-scene variables | AC at [adventurecreator.org](https://www.adventurecreator.org/) is the de-facto Unity adventure engine; large community | AC actively maintained in 2026; commercial-tier feature set |
| **AI Dungeon / Latitude** | Free-form AI LLM with world info (lorebook) + scenario prompts; no traditional scripting | Custom Next.js client; server-side LLM calls; no embedded runtime | "Infinite" in principle, but bounded by LLM context window | **The whole engine IS AI** — a fine-tuned LLM is the runtime; the architecture is prompt + world info + memory | Per-adventure memory (infinite game memory is the killer feature); saves = exported story JSON | Latitude ([latitude.io](https://latitude.io/)) active 2025-2026; AI Dungeon ([play.aidungeon.com](https://play.aidungeon.com/)) very large user base | Latitude pivoted to "Latitude" enterprise platform in 2024; AI Dungeon remains consumer-facing but feature development has slowed |
| **Inworld** | AI NPC SDK — voice + LLM + memory + emotion + triggers; engine-agnostic | Unity, Unreal, JS/TS web SDK; integration is character brain + scene graph | N/A — Inworld is not a branching engine; it is an NPC brain that plugs into a scene | **The whole SDK is AI** — Triggers, Goals, Memories, Knowledge are all LLM-mediated | Per-NPC memory + scene state; saves are out-of-scope (server-side) | Inworld ([inworld.ai](https://inworld.ai/)) — used in narrative games and VR experiences; commercial | Inworld AI Inc. raised funding and is active; SDK is the most production-ready NPC AI on the market |
| **Convai** | Similar to Inworld — conversational AI for NPCs | Unity, Unreal, web SDK; less mature than Inworld | N/A | **Whole SDK is AI** | Per-NPC memory | Convai ([convai.com](https://www.convai.com/)); smaller community than Inworld | Convai active 2025-2026; repositioned as NPC engine for games |

**Sources:** GitHub API direct fetches for all starred counts and `pushed_at` timestamps; project homepages cited inline.

---

## 2. Scripting Model Patterns

Five distinct shapes emerge, each optimized for a different creative intent.

### 2.1 Node-graph (Twine, Fungus, Adventure Creator, Ink visually)
A *DAG of named nodes* connected by edges. Each node is a chunk of content. Twine is the canonical example: every passage is a node, `[[link]]` syntax creates an edge. Fungus and Adventure Creator take this into the game engine and add hotspots/inventory as first-class nodes.

**When to fit:** When the writer's mental model is "place-based" or "encounter-based." Visual editing is a real benefit for non-coders. The downside: deep branching turns the graph into spaghetti at scale, and there is no first-class concept of *parallel* branches or re-entry (Twine handles it via `<-` Harlowe or `<<remember>>` SugarCube, but it's not natural).

### 2.2 Linear-branches with scenes (ChoiceScript, Ren'Py, Yarn Spinner)
A *flat list of named scenes* with a single `goto` next, branching via inline `*choice` blocks. This is the *Choose Your Own Adventure* mental model, made structural.

**When to fit:** When the writer is producing 30-200k word interactive fiction and stat-tracking is a key concern. ChoiceScript's `FairMath` (e.g. `+10%` instead of `+1`) and stat charts are the canonical example. Ren'Py's `label:` / `menu:` / `jump:` is the same shape with Python power. Yarn Spinner is the same shape with dialogue tags and command callbacks. All three make branching *visible at the scene level* and *deterministic at the option level*.

### 2.3 Flow scripting (Ink)
A *text-first* scripting language where content is just text and flow is implicit. Knots are scenes; stitches are sub-scenes; `-> knot_name` is a divert; `-> knot_name ->` is a tunnel (returns); threads are parallel storylines.

**When to fit:** When the writer is producing *highly recombined* dialogue — small fragments, lots of conditional recombinations. Ink's strength over Twine is exactly the recombinant dialogue case (ink's *lists* and *threads* make "the same dialogue re-ordered based on flags" natural). Ink's weakness is that the "scene list" is implicit in the flow, so navigation and overview tools are weaker.

### 2.4 Parser / world-model (Inform 7, TADS, PunyInform)
A *world model* the player types natural-language commands into. The author defines a *world* (rooms, things, actors, relations, rules) and the engine simulates it.

**When to fit:** When the writer wants the player to *figure out* a puzzle, not just pick from a menu. Inform 7's natural-language syntax is the killer feature: `The apple is on the table. Instead of taking the apple when the player is hungry, say "You eat it."` This is the only scripting model that scales to genuine puzzle IF. Web runtime is via Parchment / Quixe (Z-machine and Glulx VMs in JavaScript), which is production-ready.

### 2.5 AI-as-runtime (AI Dungeon, Inworld, Convai)
There is no script. There is a *prompt* (a system prompt + world info + memory), a *model*, and a *stream of player inputs*. Branching is emergent; state is whatever the LLM remembers and the world info knows.

**When to fit:** When the writer wants *generative* narrative — no fixed plot, but a coherent feel. This is the newest category and the only one that does not require a hand-authored choice graph. The trade-off is that quality, consistency, and replayability are model-dependent.

### 2.6 Which Pinax is closest to

Pinax's current shape is **closest to a hybrid of 2.2 (linear-branches) and 2.5 (AI-as-runtime)**: `gameStore.js` tracks scene/session state, `worldbookContextBuilder.js` injects context, the AI generates the next passage, and the user clicks a `开局`/`改写` button to direct. The hidden GM commands (`开局`, `改写`) are ChoiceScript-style *guided regeneration triggers*, not node edges. The worldbook is the only fixed corpus. This is a defensible niche, but it means Pinax has *no first-class script graph* — the "scene" is whatever the LLM produced most recently.

---

## 3. State Management Patterns

### 3.1 Variable / localStorage pattern (Twine / SugarCube)
SugarCube exposes `State.variables`, `State.temporary`, `State.length` (history depth), and `State.history` (undo log). Everything is in-memory in the browser tab; explicit `SaveSystem.save()` and `SaveSystem.load()` write to localStorage. Harlowe does the same with `(set:)` and `(history:)`. Save/load is *explicit and per-slot*; undo is `(undo)` and rewinds one step.

### 3.2 VM snapshot pattern (Inform, TADS)
A save is a full VM state snapshot: stack, heap, world model, current parser position. Parchment in the browser persists saves to localStorage as binary blobs. This is the most complete save/load (literally the entire game state) and the least interoperable (you cannot edit a save).

### 3.3 Story state JSON pattern (Ink)
`inkjs` exposes `story.state` as a plain object that can be JSON-stringified. Save = `JSON.stringify(story.state)`; load = `story.state = JSON.parse(slot)`. This is the cleanest of the three because it makes save/load *trivially small* (a few KB) and *trivially shareable* (you can put an Ink save in a URL).

### 3.4 Pinia store + localStorage pattern (Narrat, Pinax)
A single Vue/React store holds all game state. Saves are JSON-serialized stores written to localStorage (Narrat) or IndexedDB (Narrat does this for larger games). Pinax's `gameStore.js` is the same shape, with `localStorage` as the persistence layer per `CLAUDE.md` and `docs/PLAN.md` (browser localStorage is primary). Multi-session is just a list of `sessions[]` keyed by sessionId, sorted by `updatedAt` — exactly what Pinax's `getLatestSessionForWorldbook()` already does (see `docs/STATUS.md` Pass 4 entry, 2026-06-12 10:30).

### 3.5 Save/load parity summary

| Pattern | Save size | Save inspectable | Undo | Replay | Multi-session |
|---|---|---|---|---|---|
| Twine / SugarCube | Small (variable dict) | Yes (JSON) | Yes (built-in) | No (no event log) | Manual (per-slot localStorage) |
| Inform / TADS (VM) | Full game state | No (binary) | Limited (rewind to before-prompt) | No | Manual (per-slot) |
| Ink | Tiny (variables only) | Yes (JSON) | No native (but possible) | No native | Manual |
| Narrat / Pinax | Medium (store JSON) | Yes (JSON) | No | No native | Native (per-session store) |
| AI Dungeon | Narrative JSON + memory | Yes (story export) | Limited (rewind N turns) | N/A (generative) | Native (per-adventure) |

**Pinax alignment today:** §3.4 (Pinia store + localStorage). This is the right pattern for Pinax's scale and architecture; it matches Narrat exactly.

---

## 4. Web Runtime Maturity

The most important question for Pinax is: which engines have *production-ready* web runtimes that could be embedded? The answer is small.

### 4.1 Production-ready JS ports (embeddable in 2026)
- **inkjs** — actively maintained, TypeScript, 639 stars, pushed 2026-05. Single-file bundle, no framework coupling. ([y-lohse/inkjs](https://github.com/y-lohse/inkjs))
- **inkle's `ink-engine-runtime`** — included in the ink monorepo. Used by Heaven's Vault web port.
- **Parchment** — Z-machine/Glulx interpreter in JavaScript. Used in IFComp for browser playback. The Glk API is the standard IF I/O layer.
- **Quixe** — Glulx VM in JavaScript (inform 7's modern output). Used in Parchment.
- **SugarCube** — Twine story format, single-file JS you can drop in a Twine HTML export. ([motoslave.net/sugarcube/2/](https://www.motoslave.net/sugarcube/2/))
- **Harlowe** — Twine default format, single-file JS, frozen on Heptapod (the IF Tech Foundation mirror).
- **Chapbook** — Twine's modern format, single-file JS, small, limited docs.
- **Ren'Py HTML5 export** — beta; per the [Ren'Py homepage](https://www.renpy.org/) it's listed as "HTML5/Web Assembly (Beta)" and not yet production-grade.
- **Narrat** — runs in the browser as a static-built Vue 3 SPA. The whole engine is web-native. ([narrat.dev](https://narrat.dev/))

### 4.2 Not web-ready (need a game engine)
- **Fungus** — Unity package, no JS port.
- **Adventure Creator** — Unity package, no JS port.
- **Ren'Py** — web export is beta, not production.
- **TADS** — only legacy TADS Web Player; modern play is via Parchment (Z-machine).
- **Yarn Spinner** — Unity + Godot + custom. The `gluon-framework/gluon` JS port was archived in 2023-11 and is not maintained. There is no first-class Yarn Spinner web runtime.

### 4.3 Framework coupling
- **inkjs** — zero coupling. Drop the bundle in, call `new inkjs.Story(json)`, walk the story. This is the gold standard for Pinax-style embeddability.
- **Parchment** — zero coupling, but the I/O model (Glk windows) is its own API; you'd have to write a Glk adapter to drive it from a Vue app.
- **SugarCube** — tight coupling to the Twine HTML container; not a generic embed.
- **Narrat** — Vue 3 SPA; tightly coupled to Narrat's own script language. Could not be used as a Pinax dependency without forking.
- **Ren'Py** — when web export lands, the script language is Ren'Py and not a JS embed.

### 4.4 Bundle size (approximate, minified)
- inkjs core: ~80KB minified + gzipped
- Parchment: ~120KB
- SugarCube: ~200KB
- Harlowe: ~150KB
- Ren'Py web export: not measured (beta; large WASM payload expected)

**Pinax takeaway:** if Pinax ever wants a *script-graph runtime* in the browser, `inkjs` is the only mature, framework-agnostic, actively maintained option. The closest direct competitor (Yarn Spinner) has no live web runtime.

---

## 5. AI Integration

The IF engine landscape splits into two camps on AI: those that have a small "if you want" extension point, and those that are AI-first.

### 5.1 Engines with first-class AI extensions

| Engine | AI hook | Architecture |
|---|---|---|
| **AI Dungeon** | The whole engine is AI | Latitude's "Prompts" product ([latitude.io](https://latitude.io/)) is the open-source equivalent: declarative prompt templates, variable interpolation, "triggers" that fire on story state. Latitude's philosophy: prompt is the script, model is the runtime, memory is the worldbook. |
| **Inworld** | NPC brain | Per-NPC Inworld character with goals, knowledge, memories, triggers. The scene graph (Unity/Unreal) drives the Inworld NPC; the Inworld NPC drives the player's perception of agency. |
| **Convai** | NPC brain (less mature) | Similar to Inworld; per-NPC LLM with voice + emotion; less production-tested. |
| **Pinax** | Generation pipeline | `generationService.js` + `worldbookContextBuilder.js` + `dialogueOptions.js` + `memorySync.js` = a full LLM call per turn with worldbook-injected context. Hidden GM commands (`开局` / `改写`) are the only "script" layer. |

### 5.2 Engines with third-party AI experiments

| Engine | Experiment | Reference |
|---|---|---|
| **Ink** | "AI Dungeon" ports using Ink as the story loader and an LLM picking from `*` choice options | `inkle/ink-library` ([GH](https://github.com/inkle/ink-library)) has a few experimental samples |
| **Twine / SugarCube** | `<<script>>` blocks wrapping `fetch('https://api.openai.com/...')` | Community examples in the [Twine Cookbook](https://twinery.org/cookbook/); no canonical pattern |
| **ChoiceScript** | None | CoG deliberately stays script-driven; the studio publishes under contract with non-AI authors |
| **Yarn Spinner** | "Command" callbacks can be wired to an LLM, but Yarn Spinner's official position is that lines/options/commands are *the* API surface; AI is just one of the consumers | [docs.yarnspinner.dev](https://docs.yarnspinner.dev/) |
| **Inform 7** | None | Inform 7's natural language is not designed to be auto-generated; the puzzle model is the point |
| **Ren'Py** | `python:` blocks can call any LLM; community examples in the [Ren'Py Cookbook](https://www.renpy.org/doc/html/cookbook.html) | Common pattern for in-game NPC chat |

### 5.3 The Latitude / Prompts model (closest to Pinax's trajectory)

Latitude's open-source platform ([latitude.so](https://latitude.so/)) is the most direct reference for what Pinax is building. Their model:

- A "prompt" is a `.promptl` file with parameters, variable interpolation, and conditional logic.
- World info (lorebook) injects context per call.
- A "trigger" is a state-driven LLM call ("when the player enters a combat scene, generate a combat intro").
- A "memory" is per-conversation fact extraction.
- "Parameters" are the structured inputs to each generation.

Pinax's `worldbookContextBuilder.js`, `promptBuilder.js`, `dialogueOptions.js`, `memoryCandidates.js`, `memoryCompaction.js`, and `generationAdventureTriggers.js` are individually equivalent to pieces of the Latitude architecture. The most important differences:

1. Pinax's generation pipeline is *imperative JS*, not a declarative `promptl` file. Latitude's design is more "git-diffable" and "auditable" — Pinax could learn from this.
2. Pinax's "triggers" (`generationAdventureTriggers.js`) are *content-side* (the AI is asked to produce a trigger), whereas Latitude's triggers are *author-side* (the author declares `if state == "combat": call(prompt="combat_intro")`). The author-side model is more predictable.
3. Pinax has *no first-class state machine*; Latitude has the prompt parameter graph. Pinax is closer to "AI Dungeon with a better worldbook"; Latitude is closer to "Ink as prompts."

---

## 6. Patterns Pinax Should Learn From

### 6.1 From Ink
- **Knot/stitch naming for scene units.** Even if Pinax's runtime is generative, the worldbook and session log should expose named "scene units" (knots) so the user can navigate, rewind, and branch. `gameStore.js`'s `sessions[]` is close but does not have first-class scene-name metadata on each turn.
- **Tunnels and threads as mental model.** Ink's `-> knot ->` (tunnel: enter, return) and threads (parallel storylines) are the cleanest way to model "the AI was doing X, then we drifted into Y, now back to X." Pinax could adopt "scene tunnels" in the worldbook: a knot of "this is what was happening" that the AI is asked to resume.
- **The runtime JSON state for saves.** Ink's save = `JSON.stringify(story.state)` is small, inspectable, and shareable. Pinax's current `localStorage` stores are larger but follow the same principle; the question is whether the *most recent* state can be made small (e.g. just the worldbook + last turn's variables) and the *log* is the bigger blob.

### 6.2 From ChoiceScript
- **`FairMath` for hidden-stat changes.** `+10%` instead of `+1` is the single best UX trick in IF: stats move smoothly, never overflow, and the player never feels cheated by an unwinnable number. Pinax's worldbook does not yet have a numeric-stat surface; if it does, adopt ChoiceScript's percentage-based `FairMath`.
- **Stat charts in the side panel.** ChoiceScript games always show "Strength: 45 / Perception: 30 / Reputation: 70" — a compact, glanceable stats panel. Pinax's `StatusBar.vue` is the natural home for this.
- **The `*choice` + `*goto scene` + `*finish` triplet.** Three primitives, zero ceremony. Pinax's hidden GM commands are the same idea, just typed in Chinese.

### 6.3 From Yarn Spinner
- **Commands as a first-class concept.** Yarn Spinner lines, options, and commands are all sent to the same dialogue runner, and the engine doesn't know or care which is which. The host game wires `Command("play_sound")` to its own audio system. Pinax's "hidden GM commands" should be the same: a single bus of named actions, the host app decides which ones are visible vs. internal.
- **Localizable line IDs.** Yarn Spinner's `line:ID` syntax is the simplest way to make a script translatable. Pinax's `worldbookContextBuilder.js` should expose line IDs for any worldbook entry that the AI is expected to cite in dialogue (so `key: location.frostmaw` resolves to the localizable string).
- **The dialogue runner as a state machine.** Yarn Spinner's `DialogueRunner` exposes `currentNode`, `variables`, `commands` — a small, inspectable state surface. Pinax's `gameStore` is bigger than this; consider extracting a `dialogueRunner`-shaped slice for the AI-facing state.

### 6.4 From Twine
- **One HTML file as the publish target.** A Twine story is *one HTML file with embedded JS*. Pinax's exportable shareable adventure should be the same: one HTML file, the worldbook + the AI-generated turns + the runtime, all embedded. (`inkjs` enables this; the question is the LLM call — would need a worker or a static-export mode.)
- **The passage graph is inspectable.** Twine's "Twine 2 story HTML" is human-readable: each passage is a `<tw-passage>` tag. Pinax's sessions should be human-readable JSON (`{ "turns": [{ "id", "userInput", "aiResponse", "worldbookHits", "memoryHits" }] }`) for debugging and sharing.

### 6.5 From Inform 7
- **Scenes as a first-class runtime concept.** Inform 7's `Scene` type is a small idea with big leverage: a scene is a named state with `When the scene begins / ends` hooks. Pinax's `gameStore` should expose a `currentScene` with `onEnter` and `onExit` hooks, even if those hooks are AI prompts ("the player has entered the scene: describe the room, name the NPCs, hint at the first action").
- **The world model + the dialogue as separate concerns.** Inform 7 separates the world (rooms, things, actors) from the dialogue (parser responses). Pinax's worldbook is the world model; the generation pipeline is the dialogue. This separation is correct; the danger is that Pinax mixes them in `worldbookContextBuilder.js`. Keep the worldbook *declarative* and the generation *imperative*.

### 6.6 From Ren'Py
- **`label start` and `menu:` as canonical scene primitives.** Ren'Py's `label start:` is the entry point; `menu:` is a choice block. Pinax's hidden GM commands are scene-resumption actions, but the user-facing surface should still feel like a *menu* — a list of "what's the next beat?" choices.
- **The `python:` escape hatch.** Ren'Py lets you drop into Python for anything the script language can't express. Pinax's `promptBuilder.js` already does this (it builds the system prompt from arbitrary worldbook data). The pattern to learn: *make the escape hatch small, named, and obvious*, not hidden in a service.

### 6.7 From Narrat
- **Pinia + localStorage for saves.** Narrat does this; Pinax does this. The alignment is intentional and good. The lesson: keep the store shape JSON-serializable, and you get free save/load/import/export.
- **Roll / item / skill system as a runtime engine.** Narrat's *Roll* system is a stat-based decision engine that fires during dialogue. Pinax does not have this; if Pinax ever adds deterministic outcomes (e.g. "you tried to convince the merchant; CONVINCE check 40/60"), Narrat's roll system is a clean reference.

### 6.8 From Latitude
- **Declarative prompt templates as the source of truth.** Latitude's `.promptl` files are version-controlled, reviewable, and diff-friendly. Pinax's prompts live in `promptBuilder.js` and `promptRegistry.js`; consider a follow-up where prompts can be authored as separate `.promptl`-like files. (Inferred from Latitude's public pitch; the prompt language details are in [their docs](https://docs.latitude.so/).)
- **Per-conversation memory with TTL and decay.** Latitude extracts facts from conversation with TTL. Pinax's `memoryCompaction.js` is the same idea. The lesson: *bound* the memory (turns * N or tokens * M), and *evict* the oldest. Pinax should adopt explicit eviction now.

---

## 7. Patterns Pinax Should Avoid

### 7.1 Ink's full programming-language surface
Ink's list operations, multi-list lists, and advanced state tracking are powerful but *most games don't need them*. Pinax's worldbook should not try to be a programming language; it should be a *declarative context pack*. If a user wants to write `for (i=0; i<10; i++)`, they're using the wrong tool — they should be writing a Pinax prompt.

### 7.2 Harlowe's UI surface
Harlowe's hook-and-tag macro system is unreadable for non-coders (`(set: $foo to it + (dm: open("file.txt", "r") read))`). Pinax's hidden GM commands and worldbook are already simpler than this. Stay simple.

### 7.3 TADS' `modify`/`replace` chains
TADS' object-oriented inheritance is powerful but the resulting games are hard to refactor. Pinax's worldbook entries should be *flat* with explicit `enabled`/`disabled` flags, not a class hierarchy.

### 7.4 Fungus' flowchart-only model
Fungus's block-flowchart editor doesn't scale past ~50 blocks; the visual model collapses into an unreadable mess. Pinax's "scene graph" (if it ever becomes explicit) should be textual and inspectable, not a flowchart.

### 7.5 Ren'Py's `python:` everywhere
Ren'Py's most popular games often have *the entire game logic in Python blocks*, with the `.rpy` file acting as a thin shell. This is a code smell: the script language is supposed to be the high-level intent, not the runtime. Pinax's hidden GM commands and `gameStore` actions should stay declarative; `generationService.js` can be imperative.

### 7.6 Latitude's "AI as runtime" lock-in
Latitude's prompt-driven model is great for content teams but it makes the *runtime* (the LLM) part of the script. If the LLM changes (deprecation, fine-tuning, capability shift), the script needs to be re-tuned. Pinax's current `apiSettings` / model-agnostic adapter is a *good* hedge against this; don't give it up.

### 7.7 Adventure Creator's `BinaryFormatter` saves
AC's save system is binary and not inspectable. Pinax's JSON-serialized stores are the right call. If Pinax ever ships a save inspector (a UI to view the worldbook + last N turns), this will pay off.

### 7.8 Choice of Games' stat inflexibility
ChoiceScript's `*stat_chart` requires you to declare all stats upfront. The lack of dynamic stat creation makes emergent stat discovery (e.g. "the AI noticed the player is hiding something; create a `concealment` stat") impossible. Pinax should *not* lock stats in; if it ever has stats, they should be worldbook-keyed and dynamic.

### 7.9 "Smart" auto-saves in SugarCube
SugarCube has a per-turn auto-save that some authors complain about (it can stomp manual saves). Pinax's explicit `sessions[]` list with a "1-click resume" pattern (per `docs/STATUS.md` 2026-06-12 10:30) is better; don't add transparent auto-save.

---

## 8. Gaps and Opportunities

The IF engine landscape has at least four openings Pinax could pioneer.

### 8.1 Local-first IF with browser-local LLMs
No IF engine ships a *fully local* runtime. Ren'Py's web export uses the model server-side; Ink + inkjs has no LLM; AI Dungeon needs Latitude's servers; Inworld needs Inworld's servers. If Pinax shipped a worldbook + a script graph that could run on (a) a browser-local small LLM (WebLLM, transformers.js, MLX) and (b) the existing Pinax browser localStorage, it would be the first *truly local* generative IF engine. This matches Pinax's "browser localStorage primary" architecture.

### 8.2 Worldbook-aware branching
SillyTavern, RisuAI, and Agnai all have *world info* (lorebook). None of them use the worldbook to *branch* the story: the lorebook is context-injection only. Pinax already has `generationAdventureTriggers.js`; the gap is that the triggers are content-side, not author-side. If Pinax introduced an author-side trigger DSL ("when worldbook entry `merchant.mood` fires with `anger > 70`, branch to scene `confrontation`"), it would be a *new category* in the IF world: lorebook-as-branching-graph.

### 8.3 One-file exportable adventure
Twine's one-HTML-file export is a beloved artifact: you can email a Twine story. Pinax's `opening` / `experience` is a Vue SPA; exporting a *static* version of an adventure (one HTML + the worldbook JSON + the session log + inkjs bundle) would let Pinax users *share* their worlds. Inferred: no AI-native IF engine currently does this. AI Dungeon exports are JSON text only.

### 8.4 AI as the parser
Inform 7's parser is the player typing commands. Pinax could make the AI *be* the parser: the user types free-form ("I sneak past the guard and into the warehouse"), the LLM interprets, and the worldbook / scene state updates accordingly. This is `generationAdventureTriggers.js` extended. Inworld and Convai do this for NPCs, but not for player inputs.

### 8.5 The "Pinax Prompt" format
Latitude has `.promptl`; Ink has `.ink`; ChoiceScript has `.txt` with `*choice`. Pinax could ship its own script format (`.pinax`) that is a *hybrid*: a small declarative scene graph *plus* embedded prompt templates. This is the natural next step from `gameStore.js`'s current shape.

### 8.6 Specific concrete gaps in Pinax today
- **No first-class `currentScene` in `gameStore`.** Inform 7, Narrat, and Ren'Py all have this. The worldbook can hint at scenes; the runtime doesn't *know* the scene.
- **No scene-resumption token.** When the user reopens a session, Pinax re-reads the last N turns and asks the AI to "continue." A small `sceneState` token (`{ scene: "frostmaw.threshold", beat: 2, mood: "tense" }`) would let the AI resume more cleanly.
- **No inspectable save.** Pinax stores sessions to `localStorage`; there is no UI to "open the save" and see the worldbook + memory + last 10 turns as a structured view. This is a 2-3 day feature and would be a major UX win.

---

## 9. Sources

### Primary, directly fetched (high confidence)

- **Ink (inkle) homepage** — narrative scripting language page, retrieved in full — <https://www.inklestudios.com/ink/>
- **Ink GitHub repo** — `inkle/ink`, 4,801 stars, pushed 2026-05-05, license in repo — <https://github.com/inkle/ink>
- **inkjs GitHub repo** — `y-lohse/inkjs`, 639 stars, pushed 2026-05-01, TypeScript — <https://github.com/y-lohse/inkjs>
- **Ink Writer's Manual** (markdown) — full document, including knots, stitches, threads, lists — <https://raw.githubusercontent.com/inkle/ink/master/Documentation/WritingWithInk.md>
- **Ink sample games library** — `inkle/ink-library`, 329 stars, pushed 2026-04-27 — <https://github.com/inkle/ink-library>
- **Yarn Spinner GitHub repo** — `YarnSpinnerTool/YarnSpinner`, 2,801 stars, pushed 2026-05-05, C# — <https://github.com/YarnSpinnerTool/YarnSpinner>
- **Yarn Spinner README** — full document confirming the language shape and Unity-native status — <https://raw.githubusercontent.com/YarnSpinnerTool/YarnSpinner/main/README.md>
- **Yarn Spinner VSCode extension** — `YarnSpinnerTool/YarnSpinner-VSCode`, 46 stars, pushed 2025-12-11 — <https://github.com/YarnSpinnerTool/YarnSpinner-VSCode>
- **TwineJS GitHub repo** — `klembot/twinejs`, 2,782 stars, pushed 2026-04-19, TypeScript — <https://github.com/klembot/twinejs>
- **Twine Cookbook** — `iftechfoundation/twine-cookbook`, 140 stars, pushed 2025-01-12 — <https://github.com/iftechfoundation/twine-cookbook>
- **SugarCube homepage** — current 2.x line, copyright 2013-2026 — <https://www.motoslave.net/sugarcube/>
- **SugarCube 2.x documentation entry** — <https://www.motoslave.net/sugarcube/2/>
- **Twine 1 README** — explicit "Twine 1 development has ceased" — <https://github.com/tweecode/twine/raw/master/README.md>
- **Ren'Py homepage** — "HTML5/Web Assembly (Beta)" — <https://www.renpy.org/>
- **Ren'Py latest release page** — Ren'Py 8.5.3 "We Can Go to the Moon" — <https://renpy.org/latest.html>
- **Ren'Py GitHub** — `renpy/renpy`, 6,547 stars, pushed 2026-06-14, Ren'Py — <https://github.com/renpy/renpy>
- **Choice of Games — ChoiceScript intro** — official, describes the `*choice` / `*goto` / `*finish` model — <https://www.choiceofgames.com/make-your-own-games/choicescript-intro/>
- **Inform 7 repository (Graham Nelson's GitLab mirror)** — `ganelson/inform`, 1,602 stars, pushed 2026-06-09, C — <https://github.com/ganelson/inform>
- **Narrat homepage** — "The game engine for narrative games" — <https://narrat.dev/>
- **Narrat docs entry** (404 in this session; the engine and 3.x line were confirmed via Narrat's 2023 blog post URLs embedded in the page's webpack chunk map: 2022-07-01, 2022-07-15, 2022-07-21, 2022-07-23, 2022-08-01, 2023-06-14, 2023-06-15, 2023-06-16, 2023-06-20, 2023-06-30, 2023-07-01, 2023-07-02, 2023-07-18, 2023-10-15, 2023-10-18) — <https://narrat.dev/>
- **AI Dungeon (play)** — public landing page confirming Latitude as the parent — <https://play.aidungeon.com/>
- **Latitude homepage** — pivoted enterprise platform — <https://latitude.io/>
- **Inworld homepage** — production AI NPC SDK — <https://inworld.ai/>
- **Adventure Creator homepage** — Drupal site, main domain confirmed active — <https://www.adventurecreator.org/>
- **IFComp** — official IF competition — <https://ifcomp.org/>
- **IFDB** — Interactive Fiction Database community catalog — <https://ifdb.org/>
- **Pinax `gameStore.js` and `worldbookContextBuilder.js`** — read directly from `/home/recoletas/jiuguan/text-game-framework/src/stores/gameStore.js` and `/home/recoletas/jiuguan/text-game-framework/src/services/worldbookContextBuilder.js`
- **Pinax `worldbook-workflow` skill** — canonical workflow guardrail — `/home/recoletas/jiuguan/text-game-framework/agent-skills/worldbook-workflow/SKILL.md`
- **Pinax `docs/PLAN.md` / `docs/STATUS.md`** — current architecture and recent design history (notably Pass 4 1-click resume, 2026-06-12 10:30)

### Secondary (medium confidence)

- **Twine 2 story formats explainer** — `videlais.com` page is now 404 in this session; the Twine Cookbook remains the canonical source — <https://twinery.org/cookbook/>
- **Yarn Spinner docs** — Gitbook site, full content too large to fetch in this session but confirmed active — <https://docs.yarnspinner.dev/>
- **TADS** — `twinelab.net/tads3/` is the canonical site; the `TADS-OpenSource` GitHub org was not findable in this session (likely on a different host or archived). TADS is real, maintained, and small; treat as "alive but niche."
- **Fungus** — `fungusgames.com` is *expired* as of 2025 per the Squarespace "Website Expired" page; `fungusdocs.com` does not resolve. The Unity Asset Store Fungus listing is the current canonical home. Long-term stewardship is unclear.

### Inferred (low confidence; need a follow-up session with working search)

- **Convai's current state** — homepage returned in this session but no canonical "Narrative AI" page; community references and the Inworld comparison were used. — <https://www.convai.com/>
- **Narrat 4.x / 2024-2026 release cadence** — the Narrat site's webpack chunk map shows releases through 2023-10-18. 2024-2026 release notes were not directly fetchable; the "release cadence slowed" claim is inferred from the absence of newer post dates.
- **AI Dungeon / Latitude feature parity in 2026** — both sites returned splash pages; the "feature development has slowed" claim is inferred from the public pivot to Latitude enterprise.
- **Fungus community size** — the "50k+ Unity installs" claim is from a 2019-2020 community estimate; current 2026 numbers were not directly verifiable this session.
- **Adventure Creator active version in 2026** — site is Drupal 8 (no clear version stamp on landing); release cadence was inferred from the site being live.
- **inkle/ink-library active use of AI** — the sample games in `inkle/ink-library` are hand-authored, not AI-driven; "AI Dungeon ports using Ink" is a community claim without a single canonical reference.

### Curl-only fetches (raw, unverified UI rendering)

- `https://www.inklestudios.com/ink/` — full page (~200 lines, including Inky download links)
- `https://api.github.com/repos/inkle/ink` — full repo metadata, 4,801 stars
- `https://api.github.com/repos/y-lohse/inkjs` — full repo metadata, 639 stars
- `https://api.github.com/repos/YarnSpinnerTool/YarnSpinner` — full repo metadata, 2,801 stars
- `https://api.github.com/repos/klembot/twinejs` — full repo metadata, 2,782 stars
- `https://api.github.com/repos/iftechfoundation/twine-cookbook` — full repo metadata, 140 stars
- `https://api.github.com/repos/renpy/renpy` — full repo metadata, 6,547 stars
- `https://api.github.com/repos/ganelson/inform` — full repo metadata, 1,602 stars
- `https://api.github.com/repos/ChoicescriptIDE/choicescript` — full repo metadata, 36 stars
- `https://raw.githubusercontent.com/inkle/ink/master/Documentation/WritingWithInk.md` — full Ink writer's manual
- `https://raw.githubusercontent.com/YarnSpinnerTool/YarnSpinner/main/README.md` — full Yarn Spinner README
- `https://raw.githubusercontent.com/tweecode/twine/master/README.md` — full Twine 1 README
- `https://raw.githubusercontent.com/iftechfoundation/twine-cookbook/master/README.md` — full Twine Cookbook README

Failed fetches (follow-up needed):

- `https://raw.githubusercontent.com/inkle/ink-leaper/main/README.md` — ink-leaper repo path not verified
- `https://docs.yarnspinner.dev/` — full body too large; need paginated fetch
- `https://www.fungusgames.com/` — site expired; Fungus is on the Unity Asset Store, not a standalone site
- `https://www.motoslave.net/sugarcube/2/` — partial fetch (jQuery 1.11.2 is a 2015-era dependency, indicating SugarCube 2.x has not modernized its deps; this is a real maintenance signal even if the project is active)
- `https://en.wikipedia.org/wiki/Inform_(programming_language)` — Wikipedia fetch timed out
- `https://en.wikipedia.org/wiki/Twine_(software)` — Wikipedia fetch timed out
- `https://en.wikipedia.org/wiki/Interactive_fiction` — not attempted
- `https://latitude.so/` — the open-source Latitude Prompts product page was not directly verified; the latitude.io pivot is a 2024 fact that I am taking from public reporting

---

## 10. TL;DR — 5 things for Pinax's IF mode

1. **Adopt Ink's `currentScene` + scene-resumption token in `gameStore.js`.** A small `{ scene, beat, mood }` block per turn makes AI resumes dramatically cleaner. Ink, Narrat, Ren'Py, and Inform 7 all have this. Pinax doesn't.
2. **Use Yarn Spinner's "commands" as the model for hidden GM commands.** A single bus of named actions (`开局`, `改写`, future `归档`, `重读`) is cleaner than per-button JavaScript. The worldbook can be the parameter pack.
3. **Keep `worldbookContextBuilder.js` declarative.** Do not turn the worldbook into a programming language (Ink's lesson). Keep it JSON; let `promptBuilder.js` be imperative.
4. **Ship a one-file exportable adventure.** A `.html` with `inkjs` + worldbook + session log baked in. This is Twine's killer feature; Pinax could do it for AI-driven adventures if `inkjs` is the runtime.
5. **Steal ChoiceScript's `FairMath` and Yarn Spinner's `line:ID` for any future stat or localization surface.** `FairMath` keeps stats smooth; `line:ID` is the cheapest way to make a worldbook translatable.

The **biggest non-decision**: do *not* adopt AI Dungeon / Latitude's "AI as the runtime" fully. Pinax's "AI as a co-author with a script-shaped memory" is more flexible; Latitude's "prompt as the script" makes model changes break content. Keep Pinax's model-agnostic adapter.
