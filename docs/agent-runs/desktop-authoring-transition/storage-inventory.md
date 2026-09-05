# Desktop storage ownership inventory

This inventory freezes migration ownership only. It does not redirect a current caller or imply that every project-class browser key already has a SQLite mapping.

## Declared `STORAGE_KEYS`

`src/services/storage/storageKeyPolicy.js` is the machine-checked exhaustive classification:

- `project`: authored content, drafts, history, narrative state, materials, canvas/storyboard/media, geography, and world nodes. These are migration candidates, not automatic desktop writes in P1.
- `preference`: application behavior or presentation such as reading profile, runtime policy, selected model, game settings, and first-visit/tip state. These stay outside a novel directory.
- `secret-config`: provider/API and Mem0 configuration. These must never enter project files, migration bundles, error details, or logs.
- `disposable`: runtime/production/critic metrics. These may be dropped or rotated and are not project truth.

## Direct-write exceptions outside `STORAGE_KEYS`

| Owner/caller | Keys or pattern | Class | P1 treatment |
|---|---|---|---|
| `Writing.vue` | `writing_books` direct read/write | project | Keep browser behavior; inventory for P2 migration. |
| `Notes.vue` | `pinax_notes_pinned_slips_v1` | preference | Application workspace preference; do not copy into each project. |
| `gameStore.js` | `dialogue_characters` | project | Legacy Experience state; inventory only until migration. |
| worldbook stores/workspaces | `pinax.worldbooks.*`, creation drafts, generated-section briefs | project | Keep source records untouched; P2 maps them explicitly. |
| `Settings.vue`, model stores, `memorySync.js` | `gameSettings`, model/API/Mem0 settings and caches | secret-config or preference | Credentials/config remain application-owned; Mem0 cache is disposable. |
| `themeStore.js` | `app_theme_variant`, `app_theme`, `pinax_ui_zoom` | preference | Application-owned presentation. |
| `useLocalDemo.js` | local demo snapshot | disposable | Trial/demo state; never durable project truth. |
| `agentRequestTrace.js` | bounded request traces | disposable | Diagnostic only; do not migrate prompts or prose. |
| `StructuredSettingsPanel.vue` | generated brief and draft prefixes | project | Worldbook draft candidates; preserve source until P2. |
| source archive / media stores | IndexedDB archives, image/video model data, accepted media | project plus secret-config split | Accepted project media migrates later; provider configs never do. |
| UI/smoke scripts | audit fixture keys and `sessionStorage` | disposable | Test-only state. |

## Boundary checks

- Current `useStorage.js`, page-level direct calls, browser backup, provider behavior, and localStorage schemas are unchanged in P1.
- P1 adds a browser compatibility repository and a desktop project repository, but does not silently send arbitrary legacy key/value records to SQLite.
- Complete prompts, model reasoning, transport envelopes, stack traces, and rejected alternatives are never project-owned merely because they appear in diagnostics.
