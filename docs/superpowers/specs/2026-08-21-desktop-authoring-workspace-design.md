# Pinax Desktop Authoring Workspace Design

**Date:** 2026-08-21

**Status:** proposed for implementation planning

## 1. Outcome

Pinax will become a desktop-first, local-project novel authoring application. The Electron desktop application is the complete product; the public web build is reduced to product documentation, temporary trial use, and legacy-data export. Long-lived projects no longer depend on browser `localStorage`.

The author works on one continuously editable manuscript draft. Writing, character-driven simulation, continuation, insertion, and rewriting all operate on the same editor and the same UTF-8 plain-text chapter files. There is no separate Experience document, no “collect into manuscript” transfer, and no second scene-draft branch.

## 2. Validated product decisions

The following decisions were made during the 2026-08-21 research and design dialogue:

1. The full product is desktop-first and packaged with Electron.
2. The author chooses a local project directory.
3. Chapter prose is stored as UTF-8 `.txt`, not Markdown.
4. The editor may look and behave like a restrained rich-text editor, but typography such as font, line height, page width, and first-line indentation is presentation rather than document markup.
5. Necessary local formatting, annotations, stable identities, relationships, and provenance live in a sidecar SQLite database. Tiptap JSON is reconstructable editor state, not a second manuscript truth.
6. Experience and Writing become one authoring surface. AI-generated prose is ordinary editable draft text as soon as it is written.
7. AI output receives only a transient visual highlight and request-level Undo. Pinax does not permanently label every sentence as “AI text”.
8. Character, relationship, and event changes inferred from the draft become usable automatically. Routine changes do not require per-item confirmation. Only contradictions with author-locked facts, ambiguous identity, or destructive cross-scene consequences require attention.
9. Complete prompts, expanded context, streaming fragments, model reasoning, and rejected alternatives are not permanent project data.
10. Materials, canvas arrangements, storyboards, and media are derivatives of manuscript and setting sources. They retain provenance and become stale when their sources change; they never overwrite their sources automatically.

## 3. Research basis

- A read-only inspection of Writer Assistant 5.15.0 found Electron, Vue, TinyMCE, SQLCipher/SQLite, `diff-match-patch`, and plain-text local-history snapshots. Its live rich-text state is database-backed; `.txt` is primarily a recovery history. This validates Electron and frequent recovery but does not satisfy Pinax's requirement that the author directly own the live text files.
- Writer Assistant publicly emphasizes a single creation product containing outline/settings, full-text search, correction, AI assistance, and history for every change: <https://www.yuewen.com/app/?type=appzj>.
- Scrivener's stable three-part project window is Binder, Editor, and Inspector, with sidebars that can be hidden for composition. This supports one contextual workbench rather than many top-level feature pages: <https://www.literatureandlatte.com/blog/how-to-use-scriveners-navigate-menu-to-access-elements-of-your-projects>.
- Scrivener documents that external plain-text edits can lose formatting in edited paragraphs. Pinax therefore promises preservation of prose, not perfect preservation of arbitrary local formatting after unrestricted external rewrites: <https://www.literatureandlatte.com/docs/Scrivener_Manual-Win.pdf>.
- Tiptap recommends JSON for complete rich-text persistence because nodes and marks form a document tree. Pinax intentionally narrows its persistent formatting instead of treating Tiptap JSON as canonical: <https://tiptap.dev/docs/editor/core-concepts/persistence>.
- W3C annotation selectors distinguish brittle character positions from quote-plus-context selectors. Pinax anchors annotations and exceptional formatting with both positions and text context: <https://www.w3.org/TR/selectors-states/>.
- Sudowrite demonstrates selection-scoped inline editing and story-aware context, while Novelcrafter demonstrates a Codex shared across planning, writing, and review. Pinax adopts the shared-context pattern without persisting complete expanded prompts: <https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/quick-tools/2asL35fds36oHAFJN7bYzz>, <https://www.novelcrafter.com/>.
- Node documents platform and network-filesystem caveats for `fs.watch`; file events cannot be the only external-change detector: <https://nodejs.org/api/fs.html>.
- SQLite documents that WAL sidecars are part of live database state and that deleted pages do not necessarily shrink the file until vacuuming. Pinax uses managed backups and scheduled compaction rather than telling users to copy an open `.db` file: <https://sqlite.org/walformat.html>, <https://www.sqlite.org/lang_vacuum.html>.

## 4. Product boundary

### 4.1 Desktop application

The Electron application owns all durable authoring features:

- create, choose, open, validate, move, and back up a project directory;
- read and atomically write manuscript and reference text files;
- maintain the project SQLite database;
- watch for external file edits and reconcile them safely;
- run the existing Express/provider services in a controlled Electron utility process;
- manage generated media, cache budgets, and project-size reporting;
- expose filesystem operations through a narrow preload API.

The Vue renderer does not receive unrestricted Node access. Electron keeps context isolation and renderer sandboxing enabled; filesystem, database, and process operations remain in main/preload/utility-process boundaries.

### 4.2 Public web application

The public site is not a second full persistence implementation. It may provide:

- product pages and documentation;
- an in-memory or explicitly temporary trial;
- import demonstration using user-selected files;
- export of legacy Pinax browser data to a migration bundle;
- desktop download and migration instructions.

The trial must clearly state that closing it discards unexported work. It must not silently reintroduce long-lived `localStorage` projects.

## 5. Project directory and truth ownership

```text
MyNovel/
├── manuscript/
│   ├── 01-volume-name/
│   │   ├── 001-chapter-name.txt
│   │   └── 002-chapter-name.txt
├── reference/
│   ├── characters/
│   ├── places/
│   ├── events/
│   └── research/
├── assets/
│   ├── images/
│   ├── audio/
│   ├── video/
│   └── documents/
└── .pinax/
    ├── project.json
    └── project.sqlite
```

Stable Latin directory names avoid cross-platform and integration ambiguity; the UI displays localized names. Authors can rename volume and chapter files. `.pinax/project.sqlite` maps stable IDs to current relative paths, so a filename is not an object identity.

Truth ownership is explicit:

| Data | Canonical owner | Notes |
|---|---|---|
| Chapter characters and line breaks | `manuscript/**/*.txt` | UTF-8, LF normalized on internal comparison, native-safe write on disk |
| Character/place/event description prose | `reference/**/*.txt` | Directly editable outside Pinax |
| Chapter order, stable IDs, aliases | SQLite | Paths may change without changing identity |
| Structured character fields, relationships, timeline facts | SQLite | Manual locked facts and derived observations are distinct |
| Annotations and exceptional local formatting | SQLite | Anchored to chapter ID, revision, position, quote, prefix, suffix |
| Accepted generated images/video/audio | `assets/` plus SQLite metadata | One physical object per project content hash |
| Canvas layout, storyboard, provenance, stale state | SQLite | Derivative state only |
| Tiptap document JSON | Memory/rebuildable cache | Never a durable truth |
| Search index, embeddings, thumbnails | Bounded global cache | Rebuildable and excluded from project backup |

## 6. Manuscript editor

The existing Tiptap editor remains the editing engine but receives a plain-text persistence adapter. Opening a chapter parses line breaks into editor paragraphs. Saving serializes visible prose back to text without Markdown markers or HTML.

The durable document vocabulary is intentionally small:

- ordinary paragraph;
- empty paragraph;
- chapter separator;
- optional centered or special-purpose text range;
- annotation range;
- transient AI-change decoration.

Font, font size, line height, paragraph spacing, first-line indentation, text column width, page color, focus mode, and dark appearance are editor preferences. They do not produce per-paragraph storage.

External editors are supported with an honest degradation contract. Pinax attempts to re-anchor annotations and exceptional formatting using position, exact quote, prefix, suffix, and source revision. When a unique match cannot be found, prose remains intact and the affected metadata becomes “needs relocation”; Pinax does not guess or discard it silently.

## 7. Unified authoring workbench

The desktop project window uses three contextual regions:

```text
Project navigator | Current editor/view | Context inspector
```

- The navigator contains manuscript, characters, places, events, research, materials, and canvas destinations.
- The center is the only primary work surface. It displays the manuscript editor, reference editor, material viewer, or scene board selected in the navigator.
- The inspector is contextual and collapsible. For a chapter it can show current scene, referenced characters, active events, annotations, recent AI operation, history, and sources. It does not display every tool simultaneously.
- Both side regions can be hidden. Focus mode leaves the restrained manuscript surface and a minimal status line.
- Materials and Canvas remain specialized center views because their tasks differ from prose editing, but they are destinations inside the same project shell rather than independent products with duplicate navigation.

The existing Experience route is retired only after feature parity. Its capabilities become manuscript commands:

- continue at cursor;
- let a selected character drive the next passage;
- continue a multi-character scene;
- advance from the current event or dramatic pressure;
- insert prose at an earlier cursor position;
- rewrite the selected existing text;
- inspect and undo the latest AI operation.

## 8. AI editing behavior

### 8.1 Direct draft editing

Continuation and simulation output enters the current manuscript as ordinary editable paragraphs. There is no transfer into Writing and no permanent candidate card. The author can immediately type inside, split, merge, move, delete, select, or recursively rewrite generated prose.

Each request is one editor/history transaction. Before a destructive or multi-paragraph AI edit, Pinax records a compact recovery checkpoint. Completion displays a low-intensity temporary highlight and “Undo this generation”. The highlight is a Tiptap decoration and is not stored after the editing session.

Large replacements may display an inline change view, but the result still belongs to the same draft and remains directly editable. Review UI is an aid, not a second document state.

### 8.2 Minimal durable receipt

The permanent AI receipt contains only:

- operation ID, time, command kind, provider/model, and bounded parameters;
- target chapter/scene/range IDs and their source revisions;
- IDs and revisions of context sources;
- the author's explicit instruction when one exists;
- the accepted text patch or request-level undo patch;
- resulting revision and failure classification.

The receipt excludes complete assembled prompts, duplicated source prose, model reasoning, streaming fragments, transport envelopes, and rejected alternatives. Provider diagnostics needed for an active failure remain in an application log with rotation, not in the novel project.

### 8.3 Context selection

AI context is rebuilt from current sources at request time. A visible compact context summary tells the author which characters, places, events, prior passage, and locked facts were used. The system uses stable IDs and bounded excerpts; it does not persist the expanded prompt afterward.

## 9. Automatic narrative state

Pinax separates authored facts from observations derived from prose:

- **locked fact:** explicitly authored or locked by the user; highest priority;
- **derived observation:** automatically extracted from a specific text revision and source range;
- **stale observation:** its source text changed and it has not yet been recomputed;
- **conflict:** a derived observation contradicts a locked fact or another identity cannot be resolved uniquely.

Routine relationship, character-state, and event observations become available to later AI operations automatically. They do not enter a confirmation queue. Rewriting or deleting their source causes invalidation and bounded recomputation.

The inspector only interrupts the author for exceptions:

- contradiction with a locked fact;
- ambiguous character/place/event identity;
- a proposed destructive change to an author-maintained timeline;
- a cross-scene retcon that would invalidate later locked material.

Warnings are non-blocking unless applying the operation would overwrite locked author data. The author may lock a useful observation, override it, or ignore the warning.

## 10. Materials, canvas, and staleness

The existing `sourceRefs[]` direction remains the provenance truth. The unified project model strengthens it rather than inventing a parallel cross-section schema:

1. Manuscript and reference objects have stable IDs and revisions.
2. A saved material records its source references and the source fingerprints used at creation.
3. Canvas cards and storyboards refer to materials and inherited source references.
4. Source changes compute `current`, `stale`, `detached`, or `archived` at read time when possible.
5. Stale derivatives show a review action; they are never regenerated or overwritten without an explicit user operation.
6. Rejected and temporary AI media remain cache entries. Only “Save to materials” makes them permanent project assets.

Content hashing prevents the same binary from being stored more than once inside a project. Logical uses and display names remain separate SQLite records.

## 11. Disk-usage policy

Pinax optimizes actual disk usage rather than merely hiding files:

- current prose and reference descriptions exist once as plain text;
- durable editor JSON, Markdown mirrors, HTML mirrors, and duplicated Experience transcripts are removed after migration;
- text history uses compressed patches with periodic compressed checkpoints;
- automatic history retention keeps hourly restore points for the most recent 24 hours, daily points for 30 days, weekly points for 12 weeks, and named snapshots indefinitely;
- identical checkpoints are content-hash deduplicated;
- rejected text candidates live only for the active editing session;
- raw AI requests and responses are dropped after the durable receipt and undo patch are committed;
- global thumbnails, search indexes, embeddings, and unpinned generated media share a user-configurable cache with a 1 GiB default hard limit and LRU cleanup;
- accepted project media is never deleted by cache cleanup;
- the project inspector reports bytes used by manuscript, reference data, history, accepted media, database, and global cache;
- SQLite incremental vacuum runs after retention cleanup, and an explicit “Compact project” operation performs a managed full compaction when enough free pages exist.

Portable backups are produced by the application after checkpointing/closing live SQLite writes. They include the project directory and exclude global rebuildable cache.

## 12. Save, external-change, and failure behavior

1. Renderer edits are debounced in memory but flushed at focus loss, chapter switch, explicit save, and application close.
2. The main process writes text through a temporary sibling file, flushes it, and atomically replaces the target where the platform permits.
3. The SQLite revision update and file-write receipt are coordinated so startup recovery can distinguish “text written, metadata pending” from “metadata written, text pending”.
4. File watching triggers a scan but is not authoritative. Pinax also compares directory inventory, size, modification time, and content hash when the window regains focus and when a chapter opens.
5. If an external edit arrives while unsaved editor changes exist, Pinax preserves both versions and opens a three-way conflict view using the last loaded text as the base. It never silently overwrites either side.
6. Missing or moved files enter a repair view. Content hash and known relative-path history are used to suggest a unique relocation; ambiguous matches require user selection.
7. A corrupt sidecar database never prevents extraction of manuscript/reference text. Startup integrity checks offer restore from the last managed database backup or rebuild the minimum index from visible files.

## 13. Migration from the current application

Migration is incremental and keeps the current web application usable until desktop parity:

### Stage A: storage boundary

Introduce a storage repository interface behind current stores before changing page behavior. The browser adapter continues to read existing data during migration; the desktop adapter writes project files and SQLite. New domain services stop importing `localStorage` directly.

### Stage B: export and desktop import

Extend the existing backup export into a versioned migration bundle. The public web app provides an explicit “Move project to desktop” export. The desktop import wizard performs a dry-run inventory, reports unsupported or orphaned records, writes into a new directory, validates counts/hashes, and leaves the original browser data untouched.

### Stage C: plain-text manuscript

Convert each current book/chapter into stable project/volume/chapter records and `.txt` files. Markdown and Tiptap schema-v3 content are parsed once; the migration report identifies any constructs that cannot be represented as plain prose plus sidecar annotations. Existing writing history and accepted candidates become compressed history/receipts rather than current-text duplicates.

### Stage D: unified workbench

Build the desktop project shell and make the current Writing editor its center manuscript surface. Move Experience commands into the editor one capability at a time. Keep the old route behind a migration flag until continuation, selected-speaker generation, multi-character simulation, insertion, rewrite, recovery, and source context all pass parity gates.

### Stage E: derived state and derivatives

Move character, relationship, event, material, canvas, storyboard, and media references to stable project IDs/revisions. Add automatic prose-derived observations and source invalidation. Existing assets without valid provenance remain usable but are marked detached; migration never fabricates references.

### Stage F: desktop default and web reduction

After migration, backup/restore, provider operations, and UI parity pass, desktop becomes the documented default. The public build removes persistent project creation and retains legacy export for at least one stable desktop release cycle.

## 14. Implementation decomposition

This design must be implemented as independently testable subprojects, in this order:

1. **Desktop project foundation:** Electron boundary, project picker, repository interfaces, SQLite schema, atomic text I/O, cache manager, backup and integrity checks.
2. **Legacy migration:** versioned web export, desktop dry-run/import, idempotency, count/hash validation, and rollback.
3. **Plain-text manuscript editor:** Tiptap text adapter, sidecar anchors, external-change reconciliation, compact history, and transient AI decorations.
4. **Unified authoring workbench:** project navigator, center editor/view host, contextual inspector, focus mode, and route compatibility.
5. **AI authoring integration:** direct continuation/simulation/insertion/rewrite transactions, minimal receipts, request-level Undo, and visible bounded context summary.
6. **Automatic narrative state:** locked facts, derived observations, invalidation/recompute, exception-only conflicts, and downstream context use.
7. **Materials/canvas migration:** stable source revisions, deduplicated media, computed staleness, detached repair, and bounded cache.
8. **Desktop release transition:** packaging, signing/update preparation, migration messaging, public-web reduction, and recovery documentation.

Each subproject must ship working software and compatibility adapters. No subproject may require a big-bang replacement of `Experience.vue`, `Writing.vue`, `gameStore.js`, or `useStorage.js`.

## 15. Verification and acceptance

### Data integrity

- A migration dry run makes no writes.
- Importing the same migration bundle twice produces no duplicate projects, chapters, settings, assets, or history.
- Every imported chapter's normalized text hash and character count match the migration report.
- Killing the application during text save, database commit, history compaction, media copy, and backup leaves either the old or new complete state recoverable.
- External edit, rename, move, delete, and conflict flows are covered on Windows paths and Unicode filenames.

### Editor behavior

- A chapter round-trips through Tiptap without Markdown/HTML appearing in `.txt`.
- AI continuation, character simulation, insertion, and rewrite create ordinary editable paragraphs in the same editor.
- Each AI request is undone in one action even after multi-paragraph insertion.
- Transient highlights disappear without creating durable marks.
- Annotation/format anchors either reattach uniquely or become visibly unresolved; prose is never altered to preserve an anchor.

### State and provenance

- Routine derived state becomes available without confirmation.
- Editing source text invalidates and recomputes only observations derived from the affected revisions.
- Locked facts are not overwritten by automatic extraction.
- Materials and canvas items become stale or detached without automatic destructive regeneration.

### Storage

- Expanded prompts, streaming chunks, reasoning, rejected candidates, Tiptap JSON, Markdown mirrors, and duplicate Experience transcripts are absent from durable project storage.
- Duplicate media imports resolve to one project blob.
- Retention cleanup never deletes current text, named snapshots, locked facts, accepted assets, or provenance receipts.
- Project-size reporting matches filesystem/database measurements within filesystem allocation rounding.

### UI and release

- Desktop audits cover 1440 px and 390 px-equivalent narrow windows, keyboard-only operation, 200% zoom, reduced motion, dark appearance, long chapters, long names, empty projects, provider failure, disk full, permission loss, and external-edit conflict.
- The public web trial never implies durable save and always exposes export before discard.
- Existing full verification remains green throughout staged migration; each subproject adds focused contract, integration, filesystem, migration, and UI audit gates before the legacy path is retired.

## 16. Explicit non-goals

- Cloud sync, accounts, and simultaneous multi-device editing are not part of the desktop foundation.
- Real-time multi-author collaboration and CRDT storage are not introduced.
- Arbitrary Word-style fonts, colors, tables, and deeply nested rich-text structures are not supported in canonical prose.
- Markdown is supported only as an import/export compatibility format, not as manuscript storage.
- AI reasoning and complete prompt archives are not retained for exact replay.
- Derived narrative state never silently overwrites author-locked facts.
- The first desktop release does not rewrite map rendering, image/video providers, or the narrative runtime unless required to pass the new repository/context interfaces.
