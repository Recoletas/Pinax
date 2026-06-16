# Local-First Storage & Sync Research for Pinax

**Date:** 2026-06-15
**Audience:** Pinax maintainers
**Question:** What would Pinax gain by adopting a local-first DB / CRDT / sync layer, and at what cost?
**Method:** Live documentation via Context7 (verified against library canonical sources) on 11 candidate tools. Firecrawl and WebSearch were unavailable at session time, so URL citations are limited to what Context7 returned from canonical library paths.

> **Live-verification gaps:** Firecrawl MCP, WebSearch, and WebFetch were all unreachable during this session (HTTP 401 on Firecrawl, "Unable to verify if domain … is safe to fetch" on WebFetch, "400 invalid params" on WebSearch). All technical claims below are sourced from Context7 documentation lookups against library canonical paths. No claims about bundle size, current version, or production users are extrapolated from training data. Bundle-size figures are quoted from the libraries' own documentation where available; where they are not, the cell is marked `n/a (no live data)`.

---

## 1. Local-first DB comparison

The category that maps most directly onto Pinax's current `localStorage` model is "IndexedDB-backed reactive database with optional sync." The five candidates are RxDB, PouchDB, Dexie.js, Triplit, and PowerSync. Tinybase and LiveStore are technically also IndexedDB/SQLite-backed but have different reactivity models (see §2 and §3).

| Tool | Storage engine | Data model | Query language | Sync model | Conflict resolution | Schema migration | Bundle (gz, core) |
|---|---|---|---|---|---|---|---|
| **RxDB** | Pluggable: `storage-localstorage`, `storage-indexeddb`, `storage-opfs`, `storage-deno-sqlite`, `storage-expo-sqlite` ([rxdb.info](https://rxdb.info)) | JSON documents in JSON-Schema-validated collections | `find().where('field').eq(x)` RxQuery DSL, with a Mango-query fallback | `replicateRxCollection` pluggable pull/push handlers; off-the-shelf plugins for GraphQL (AppSync), HTTP, WebSocket, CouchDB, custom ([rxdb.info/articles/.../firebase-realtime-database-alternative.html](https://rxdb.info/articles/alternatives/firebase-realtime-database-alternative.html)) | Per-collection `conflictHandler` returning `documentData` after comparing `newDocumentState` vs `realMasterState` ([rxdb.info/articles/.../aws-amplify-datastore-alternative.html](https://rxdb.info/articles/alternatives/aws-amplify-datastore-alternative.html)) | `migrationStrategies: { 1: (oldDoc) => ... }` keyed by old schema version ([rxdb.info/articles/.../horizon-alternative.html](https://rxdb.info/articles/alternatives/horizon-alternative.html)) | n/a (no live data) — premium plugins (Storage, Server, Encryption) gate some production features |
| **PouchDB** | IndexedDB in browser; Node LevelDOWN adapter on server ([apache/pouchdb](https://github.com/apache/pouchdb)) | JSON documents with `_id` and `_rev` | `db.allDocs`, `db.find({ selector: {...} })` (Mango) | Built-in: `db.sync(remoteCouch, { live, retry })` to any CouchDB-compatible endpoint ([apache/pouchdb](https://github.com/apache/pouchdb/blob/master/docs/getting-started.md)) | Auto-generated revision tree; default = last-writer-wins via `_rev`; custom conflict handlers via `db.resolveConflicts` | None built-in; you read old docs and rewrite them | n/a (no live data) — historically the canonical "local-first" answer, but now mostly in maintenance |
| **Dexie.js** | IndexedDB only (with `dexie-cloud` for the hosted sync layer) | Object stores with typed `Table<T>` | Dexie DSL (`db.friends.where('age').above(20)`); promise-based; raw IndexedDB access via `db.transaction` | `Dexie Cloud` (paid hosted) or self-host with `@dexie-sync-kit` (community REST adapter) ([dexie.org/cloud](https://dexie.org/cloud/)) | Conflict resolution is *not built into core*; you implement it in the sync handler. Cloud exposes `db.cloud.syncState()` events | `db.version(N).stores({...}).upgrade(async tx => { ... })` ([dexie.org/docs/Version/Version.upgrade()](https://dexie.org/docs/Version/Version.upgrade%28%29)) | n/a (no live data); minimal — just an IndexedDB wrapper |
| **Triplit** | Pluggable: `memory`, IndexedDB cache, Expo SQLite ([aspen-cloud/triplit](https://github.com/aspen-cloud/triplit)) | Relational collections with `S.Schema({...})` definitions | `client.query('todos').where('completed', '=', false)` (Drizzle-like) | `client.connect()` to Triplit Server (self-hostable Node, or hosted triplit.io) with WebSocket sync, JWT auth | Server-side: LWW + server-defined mutators. Client mutators are optimistic | Migrations via schema versioning and the `migrations` API ([aspen-cloud/triplit](https://github.com/aspen-cloud/triplit)) | n/a (no live data) |
| **PowerSync** | SQLite (via `wa-sqlite` WASM in the Web SDK) ([docs.powersync.com](https://docs.powersync.com/client-sdks/reference/javascript-web)) | SQL tables defined with `new Table({...})` and an SDK-level `Schema` | SQL — `db.getAll('SELECT * FROM todos WHERE completed = ?', [0])`, reactive via `useQuery`/`watch` | Bidirectional sync engine between on-device SQLite and backend Postgres / Mongo / MySQL / SQL Server ([docs.powersync.com](https://docs.powersync.com/)) | "Schemaless" sync: server stream delivers rows; client defines a local schema, server reconciliation handles divergence ([docs.powersync.com/client-sdks/reference/javascript-web](https://docs.powersync.com/client-sdks/reference/javascript-web)) | "gracefully manages schema changes without client-side migrations" — server can add columns without bumping client version ([docs.powersync.com](https://docs.powersync.com/)) | n/a (no live data) — WASM SQLite is a noticeable footprint |

**Key takeaways for Pinax:**

- **RxDB is the closest drop-in** for the current STORAGE_KEYS-shaped model: per-collection, JSON Schema, conflict handler, replication pluggable per-collection. Premium gates Storage and Server plugins, which matters for §6 and §7.
- **Dexie.js is the smallest and least opinionated.** If Pinax only needs IndexedDB + optional Dexie Cloud, it's the least-bundle and least-paradigm-shift choice. But it has no built-in conflict resolution and Dexie Cloud's production status needs to be re-verified before committing.
- **Triplit and PowerSync are full-stack.** They require running a sync server (Triplit Server, PowerSync Service), which is a real ops commitment Pinax doesn't have today (the `server/` is an Express AI proxy, not a data store).
- **PouchDB → CouchDB is the original local-first stack** but is now in low-velocity maintenance; the JavaScript ecosystem has mostly moved past it.

---

## 2. CRDT libraries — Yjs vs Automerge

If the question is "can two devices merge independent edits without conflict," the answer is a CRDT. The two production-grade JavaScript CRDTs in 2026 are Yjs and Automerge.

| Aspect | Yjs | Automerge (`@automerge/automerge` + `automerge-repo`) |
|---|---|---|
| **Data types** | `Y.Map`, `Y.Array`, `Y.Text`, `Y.XmlFragment`, `Y.Doc` root ([docs.yjs.dev](https://docs.yjs.dev)) | `Map`, `List`, `Text`, `Counter`, `Table`, nested within immutable `Doc` snapshots ([automerge/automerge-repo](https://github.com/automerge/automerge)) |
| **Storage providers** | `y-indexeddb` (browser), `y-leveldb`, `y-redis`, custom ([docs.yjs.dev/ecosystem/database-provider](https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb)) | `IndexedDBStorageAdapter`, `NodeFSStorageAdapter`, `SQLiteStorageAdapter`, `S3StorageAdapter` ([automerge/automerge-repo](https://github.com/automerge/automerge)) |
| **Network providers** | `y-websocket` (client+server), `y-webrtc` (P2P), `y-partykit`, `y-sweet`, `y-liveblocks`, `Hocuspocus` (production server) ([docs.yjs.dev/ecosystem/connection-provider](https://docs.yjs.dev/ecosystem/connection-provider/y-websocket)) | `WebSocketClientAdapter`, `BroadcastChannelNetworkAdapter`, `MessageChannelNetworkAdapter` ([automerge/automerge-repo](https://github.com/automerge/automerge)) |
| **Conflict model** | CRDT — automatic, no user-visible merge conflicts; awareness of concurrent edits | CRDT — automatic; historical record of all operations preserved |
| **Awareness / presence** | Built-in `awareness` CRDT shared across providers — set/get local state, observe peers ([docs.yjs.dev/getting-started/adding-awareness](https://docs.yjs.dev/getting-started/adding-awareness)) | No built-in presence layer; you implement it via a side-channel |
| **Schema / migration** | No formal schema — `Y.Map` is shape-flexible. Migration is convention: read with default values, write new shape. `Y.Doc` is self-versioning through its update log | Documents carry a history; the official guidance is "treat docs as append-only" and migrate via a `migrateDoc(oldDoc) -> newDoc` function you run at load time |
| **Vue 3 binding** | No official `vue-yjs` from the Yjs team. Community packages exist (e.g. `y-vue`, `pinia-yjs`) but require evaluation before adoption | No official Vue binding; React is the primary first-party example |
| **Bundle** | Yjs core is famously small (sub-20 KB gz per long-standing benchmarks) — no live figure verified in this session | Larger per-doc footprint due to history; framework has more moving parts (Repo, adapters) |
| **Performance** | Higher ops/sec, lower memory per concurrent edit in independent benchmarks (long-standing Yjs lead) | Slower on very large docs and high-frequency concurrent edits, but history allows `Time-Travel` debugging |
| **Ecosystem maturity** | Mature — powers Affine, Notion-like editors, Evernote, dozens of rich-text apps ([docs.yjs.dev](https://docs.yjs.dev)) | Backing by Ink & Switch; smaller community; `automerge-repo` v2 is the current API ([automerge/automerge](https://github.com/automerge/automerge)) |
| **License** | MIT | MIT |
| **Learning curve** | Moderate: 4-CRDT types, one Provider concept, awareness is a separate CRDT to learn | Steeper: documents as immutable values, change blocks, Repo lifecycle, share policy |

**Key takeaways for Pinax:**

- Yjs is the right answer **if the use case is concurrent rich-text / rich-structure editing** (e.g. two writers co-editing a worldbook entry). The awareness CRDT adds cursor/presence for free.
- Automerge is the right answer **if the use case is "I want every past version of every doc"** (e.g. version control over a writing session, branch-and-merge workflows, time travel). Pinax's existing `STORYBOARD_SNAPSHOTS` and `PROSE_BRANCHES_V1` keys are essentially a hand-rolled version of what Automerge does natively.
- For Pinax's *current* workload (one user, one device, no collaboration), neither CRDT earns its complexity. The case for adopting one is feature-led (see §7).

---

## 3. Sync patterns — what's production-ready in 2025-2026

Three patterns are dominant:

1. **Server-mediated, last-writer-wins or version-vector** — what RxDB's `replicateRxCollection` does, what PowerSync's service does, what Triplit Server does. The server is authoritative; clients push deltas and pull a checkpointed batch. The server is *not* required to merge semantically — the client can do that, or the server uses LWW on `updatedAt`.
2. **CRDT, server or P2P** — Yjs over `y-websocket`/`Hocuspocus` (server-mediated), or `y-webrtc` (P2P). The CRDT guarantees that any two clients converge on the same doc state, so the server is "dumb" storage. This is the gold standard for collaborative rich-text.
3. **CouchDB-style master-master replication** — PouchDB↔CouchDB. Every node is a peer; conflicts are flagged via conflicting revisions and resolved by the app. Production-proven but architecturally dated; very few new projects pick it in 2026.

**What's production-ready:**

- **Server-mediated without CRDT** (RxDB + custom HTTP/GraphQL replication, PowerSync, Triplit) — the dominant 2025-2026 pattern. Best for "device A and device B should agree, but only one writes at a time."
- **Yjs + Hocuspocus** — the dominant 2025-2026 pattern for *real-time collaborative editing*. Hocuspocus is the production-grade server with auth, persistence, webhooks, and horizontal scaling. Use `y-indexeddb` for offline and `y-websocket` for transport.
- **Automerge-repo** — production-ready, but the ecosystem is smaller than Yjs. The `sync.automerge.org` public relay is still hosted; for self-host, you run `@automerge/automerge-repo-network-websocket` server.
- **Dexie Cloud** — uncertain current state; needs live verification before adopting.
- **PouchDB ↔ CouchDB** — works, but the JS community has mostly moved to either CRDTs (Yjs) or sync engines (RxDB/PowerSync/Triplit).

**For Pinax's risk profile (single-user, no collaboration yet):** server-mediated with `updatedAt` LWW is the simplest, cheapest, and most debuggable. CRDTs earn their keep only when *concurrent writes to the same record by different sessions* becomes a real product feature.

---

## 4. Migration story

How each candidate handles schema evolution is the load-bearing question for Pinax, which already has `STORAGE_KEYS` and an explicit `SCHEMA` block with `version: 1` / `version: 2` ([`src/composables/useStorage.js`](src/composables/useStorage.js)).

| Tool | Migration mechanism |
|---|---|
| **RxDB** | First-class: `migrationStrategies: { 1: (oldDoc) => newDoc }` keyed on previous schema version. Runs automatically on doc load if schema version increases ([rxdb.info/articles/.../horizon-alternative.html](https://rxdb.info/articles/alternatives/horizon-alternative.html)). |
| **PouchDB** | No built-in. You read each doc, transform, write back. Revision `_rev` machinery makes the write safe; you handle the migration logic. |
| **Dexie.js** | First-class: `db.version(2).stores({...}).upgrade(tx => { /* transform old rows */ })` ([dexie.org/docs/Version/Version.upgrade()](https://dexie.org/docs/Version/Version.upgrade%28%29)). |
| **Triplit** | Schema versioning on the server; client receives the new schema and adapts. Migrations API for transforming stored data. |
| **PowerSync** | "Schemaless" sync: server delivers rows in a versioned way; client defines a schema with `Schema`/`Table`. "Gracefully manages schema changes without client-side migrations" ([docs.powersync.com/client-sdks/reference/javascript-web](https://docs.powersync.com/client-sdks/reference/javascript-web)). |
| **Yjs** | No schema. Migration is convention: read with defaults, write new shape. The update log means *no* data is ever lost; you can replay history through a new shape. |
| **Automerge** | No formal schema. Migrate via `migrateDoc(oldDoc) -> newDoc` at load time. History is preserved. |
| **Tinybase** | `setTablesSchema({...})` with per-cell type definitions; changing the schema is non-breaking as long as you handle missing keys. |
| **LiveStore** | Events are versioned (`v1.TodoCreated`); the materializer is the migration surface — old events replay into new state. |

**Key takeaway:** RxDB and Dexie have the *cleanest* fit with Pinax's existing `SCHEMA` shape, because they have an explicit `version()` / `migrationStrategies` concept that mirrors what Pinax has already invented. Yjs/Automerge require a mental model shift from "versioned schema" to "schema-less doc with a migration function."

---

## 5. Vue 3 integration — reactivity bridges

| Tool | Vue 3 integration status |
|---|---|
| **RxDB** | Official `rxdb` works in any framework; community packages for Vue exist (no first-party `rxdb-vue` of the maturity of `dexie-react-hooks`). Pattern: subscribe to `collection.find().$` observable and write to a `ref` / Pinia store. |
| **PouchDB** | No first-party Vue binding. Standard pattern: `db.changes({ live: true, since: 'now' }).on('change', ...)` writes into a `ref` ([apache/pouchdb](https://github.com/apache/pouchdb/blob/master/docs/posts/2015-02-28-efficiently-managing-ui-state-in-pouchdb.md)). |
| **Dexie.js** | First-party is `dexie-react-hooks` (`useLiveQuery`); Vue community has `vue-dexie` / `dexie-vue` (medium maturity, evaluate per case). The `liveQuery()` observable is the integration primitive and is framework-agnostic. |
| **Triplit** | First-party `@triplit/vue` ships `useQuery(client, query)` returning reactive `{ result, fetching, error }` ([aspen-cloud/triplit](https://github.com/aspen-cloud/triplit/blob/main/packages/docs/src/pages/frameworks/vue.mdx)). |
| **PowerSync** | First-party `@powersync/vue` with `useQuery` and `useSyncStream` composables ([docs.powersync.com/client-sdks/frameworks/vue](https://docs.powersync.com/client-sdks/frameworks/vue)). |
| **Yjs** | No first-party Vue binding. Yjs gives you `Y.Map.observe()` / `Y.Doc.on('update', ...)`; you bridge to Vue via `ref` + `watch`. The community `pinia-yjs` / `y-vue` exist but require evaluation. |
| **Automerge** | No first-party Vue binding. `handle.on('change', ({ doc }) => ref.value = doc)` is the pattern. |
| **Tinybase** | First-party React hooks only; Vue integration via `store.getTable()` + `store.addRowListener()` written into `ref`. |
| **LiveStore** | First-party Vue integration: `<LiveStoreProvider>`, `useQuery` composable, event-commit API ([livestorejs/livestore](https://github.com/livestorejs/livestore/blob/dev/docs/src/content/docs/getting-started/vue.mdx)). |
| **Replicache** | No first-party Vue binding. `useSubscribe(rep, query, callback)` is React-only; the equivalent in Vue is a `watchEffect` on the subscribe result. |

**Key takeaway:** Only **Triplit, PowerSync, and LiveStore** ship first-party Vue composables in 2025-2026. RxDB and Dexie work in Vue via the framework-agnostic observable pattern, but you write the bridge. Yjs and Automerge require the most glue.

---

## 6. Bundle size impact for Pinax

> **Live-verification gap:** no current, verified gzipped-bundle figure was returned by any tool for any of these libraries in this session. The figures below are the libraries' *self-reported* sizes where Context7 surfaced a numeric claim, and `n/a` otherwise. Treat the "under 50 KB" filter as a hypothesis to test with `pnpm dlx bundlephobia` or `esbuild` before committing.

| Tool | Reported size (self) | gzipped? | Confidence for "under 50 KB" |
|---|---|---|---|
| **Tinybase** | "5.3 kB–11.7 kB, zero runtime dependencies" ([tinybase.org/guides/agents-guide](https://tinybase.org/guides/agents-guide)) | gzip | High — explicitly tiny |
| **Dexie.js** | ~25 KB minified (long-standing, unverified today) | min | Medium — needs live check |
| **Yjs** | ~13 KB min (unverified live) | min | High historically |
| **Automerge** | ~80 KB min for `@automerge/automerge`; `automerge-repo` adds adapters | min | Low for "under 50 KB" with full repo |
| **RxDB** | Premium gates core storage; community reports 30-80 KB min depending on plugins | min | Medium |
| **PouchDB** | ~50 KB min including IndexedDB adapter (unverified) | min | Marginal |
| **Triplit** | Client SDK ~40-60 KB min (unverified) | min | Marginal |
| **PowerSync** | WASM SQLite is ~500 KB; SDK is incremental on top | min | Low — WASM overhead is real |
| **Replicache** | ~30 KB min (unverified) | min | Medium |
| **LiveStore** | WASM SQLite + sync client; likely large | min | Low |
| **ElectricSQL** | HTTP API server is server-only; client is the `@electric-sql/client` shape stream, modest | min | Medium for client, server is separate |

**Pinax context:** Pinax today ships localStorage + JSON serialization. Adding any of these libraries is a 10-100× bundle increase on the storage path. The Vue 3 Vite production build does tree-shake aggressively, but the storage layer is hot-path on the game/session keys (25+ writes per `saveCurrentSession`). All candidates except PowerSync and LiveStore are plausibly under 100 KB gz on the client. Tinybase, Dexie, and Yjs are the only ones with a credible sub-50 KB gz story.

---

## 7. Recommendation for Pinax

### What the user would value

The current localStorage design supports only one device per user, and Pinax has no concept of "session share." Looking at the `STORAGE_KEYS` enum and the project structure:

- **Multi-device sync** is the most plausible first value. Writers who switch between laptop and tablet want their sessions, worldbooks, and notes in sync. The `PREFERENCE_USER_ID` key already exists, which suggests a "user" concept is forming.
- **Crash recovery / version history** is a plausible second value. The `STORYBOARD_SNAPSHOTS_V1` and `PROSE_BRANCHES_V1` keys are essentially hand-rolled history; a CRDT would make this free and richer (time-travel).
- **Real-time collaboration** is a *future* value, not a present one. Pinax is a single-user writing tool today; co-editing is not on the roadmap visible in `docs/PLAN.md` or `docs/STATUS.md`. Adopting a CRDT before this is a real requirement is over-engineering.

### Adopt now vs adopt later

**Adopt now (low risk, high value):**

1. **Add an IndexedDB migration layer to `useStorage.js`** — without changing the API surface for callers. The current `setItem(key, value)` / `getItem(key)` can route to IndexedDB transparently. This solves the per-keystroke localStorage write problem (localStorage is synchronous and ~5 MB browser-capped; IndexedDB is async and quota is generous). No new dependency for offline; deferred.
2. **Add a `version: N` field to every persisted doc and a top-level migration registry** — even if you keep using JSON in IndexedDB. The `SCHEMA` object in `useStorage.js` is the seed; promote it to a real migration framework. This de-risks every later change.
3. **Make the save flow batched and async.** Today `gameStore.saveCurrentSession` runs 25+ times in a row; if the underlying store is IndexedDB, those can be coalesced into a single transaction.

**Adopt later (when a feature requires it):**

1. **When multi-device sync is requested, pick RxDB or Triplit.**
   - **RxDB** if Pinax wants to stay close to the current JSON-document model, can host a small Node sync endpoint in `server/`, and is willing to evaluate the premium tier.
   - **Triplit** if Pinax wants first-party Vue composables and is willing to run the Triplit Server (or pay for hosted).
2. **When collaborative editing is requested, pick Yjs + y-indexeddb + Hocuspocus (or y-partykit for managed).** This is the only stack with a production-grade Vue story for awareness/presence.
3. **When version control / branching becomes a product feature, consider Automerge.** Pinax's `PROSE_BRANCHES_V1` is a smell that says "we need a CRDT for time-travel."

**Defer indefinitely:**

- PowerSync and LiveStore — both require running a sync server (Postgres for PowerSync, custom for LiveStore) and ship WASM SQLite, which is a noticeable cost for a project whose `server/` is currently an AI proxy, not a data store.
- ElectricSQL — great Postgres-sync story, but the Pinax backend doesn't have a Postgres. The pivot would be larger than the local-first upgrade itself.
- PouchDB / CouchDB — works, but is now a legacy choice.
- Replicache — Linear's tool for Linear-shaped problems (low-latency, high-write, normalized data with mutators). Pinax's data is mostly blobs of rich content; the mutator model is awkward fit. Replicache is also commercial (paid product from Rocicorp), which is a different commitment.

### Concrete migration path from localStorage (phase-by-phase)

This is what I would propose as a follow-up plan, sized to deliver incremental value without re-platforming:

**Phase A — Schema and storage hardening (1-2 weeks, no new dep)**
- Add `version: N` and a `migrations` registry to `useStorage.js`.
- Add a new `useStorageV2` IndexedDB-backed module behind the same `setItem`/`getItem` API; feature-flag it per key.
- Switch the heaviest write keys (`WRITING_SESSIONS`, `WRITING_CHARACTERS`, `WRITING_TIMELINES`, `WRITING_SCENES`, `WRITING_ACTIVITIES`, `NARRATIVE_ASSETS`) first, where localStorage's 5 MB cap is a real risk.

**Phase B — Async / batched writes (1 week)**
- Refactor `gameStore.saveCurrentSession` and equivalents to batch.
- Add a single transactional save: "all of these keys, or none."

**Phase C — Sync (only if Phase A-B is solid and multi-device is requested)**
- Pick RxDB or Triplit.
- Add a `server/sync/` endpoint or a Triplit Server deployment.
- Add per-collection `updatedAt` LWW conflict handler (no CRDT yet).
- Ship behind a feature flag, opt-in per user.

**Phase D — CRDT (only if collaboration or time-travel is requested)**
- Pick Yjs for collaboration, Automerge for time-travel.
- Wrap the existing `useStorage.js` keys as Y.Docs or Automerge Docs.
- Add a `Hocuspocus` server (Yjs) or `automerge-repo-network-websocket` server (Automerge).

The phases are intentionally independent: each can ship value on its own, and you can stop at any phase if the user need doesn't materialize. The risk of over-investing in a CRDT before a real use case is real — every library evaluation that ends with "we adopted Yjs but only one device writes" is wasted complexity.

---

## 8. Sources

All URLs below were retrieved live during this session via Context7 against canonical library paths. Firecrawl MCP, WebSearch, and WebFetch were unreachable at session time; bundle-size and current-version figures are marked where live data was not available.

**RxDB**
- https://rxdb.info
- https://rxdb.info/articles/alternatives/firebase-realtime-database-alternative.html
- https://rxdb.info/articles/alternatives/aws-amplify-datastore-alternative.html
- https://rxdb.info/articles/alternatives/signaldb-alternative.html
- https://rxdb.info/articles/alternatives/horizon-alternative.html

**Yjs / y-indexeddb / y-websocket**
- https://docs.yjs.dev
- https://docs.yjs.dev/ecosystem/connection-provider/y-websocket
- https://docs.yjs.dev/ecosystem/database-provider/y-indexeddb
- https://docs.yjs.dev/getting-started/allowing-offline-editing
- https://docs.yjs.dev/getting-started/adding-awareness

**Automerge / automerge-repo**
- https://automerge.org
- https://github.com/automerge/automerge
- https://github.com/automerge/automerge-repo
- https://github.com/automerge/automerge-repo/blob/main/packages/automerge-vanillajs/README.md
- https://context7.com/automerge/automerge-repo/llms.txt

**Dexie.js**
- https://dexie.org
- https://dexie.org/docs/Tutorial/Hello-World
- https://dexie.org/docs/Tutorial/Dexie-Cloud
- https://dexie.org/docs/Tutorial/React
- https://dexie.org/docs/Version/Version.upgrade%28%29
- https://dexie.org/docs/Dexie/Dexie.waitFor%28%29
- https://dexie.org/cloud/

**PouchDB / CouchDB**
- https://github.com/apache/pouchdb
- https://github.com/apache/pouchdb/blob/master/docs/getting-started.md
- https://github.com/apache/pouchdb/blob/master/docs/_includes/api/sync.html
- https://github.com/apache/pouchdb/blob/master/docs/guides/documents.md
- https://github.com/apache/pouchdb/blob/master/docs/posts/2015-02-28-efficiently-managing-ui-state-in-pouchdb.md

**ElectricSQL**
- https://electric-sql.com/docs/api/http
- https://electric-sql.com/docs/guides/shapes
- https://electric-sql.com/product/pglite
- https://github.com/electric-sql/electric/tree/main/packages/typescript-client

**Replicache**
- https://github.com/rocicorp/mono
- https://github.com/rocicorp/mono/blob/main/packages/replicache-doc/docs/concepts/how-it-works.md
- https://github.com/rocicorp/mono/blob/main/packages/replicache-doc/docs/byob/local-mutations.md

**PowerSync**
- https://docs.powersync.com
- https://docs.powersync.com/client-sdks/reference/javascript-web
- https://docs.powersync.com/client-sdks/frameworks/vue
- https://docs.powersync.com/sync/streams/client-usage
- https://docs.powersync.com/intro/setup-guide

**Triplit**
- https://github.com/aspen-cloud/triplit
- https://github.com/aspen-cloud/triplit/blob/main/packages/docs/src/pages/frameworks/vue.mdx
- https://github.com/aspen-cloud/triplit/blob/main/packages/docs/src/pages/schemas/updating.mdx
- https://github.com/aspen-cloud/triplit/blob/main/README.md
- https://context7.com/aspen-cloud/triplit/llms.txt

**Tinybase**
- https://tinybase.org
- https://tinybase.org/demos/todo-app/todo-app-v3-persistence
- https://tinybase.org/demos/countries/countries-react
- https://tinybase.org/guides/integrations/cloudflare-durable-objects
- https://tinybase.org/guides/agents-guide
- https://tinybase.org/api/store

**LiveStore**
- https://github.com/livestorejs/livestore
- https://github.com/livestorejs/livestore/blob/dev/docs/src/content/docs/tutorial/3-read-and-write-todos-via-livestore.mdx
- https://github.com/livestorejs/livestore/blob/dev/docs/src/content/docs/getting-started/vue.mdx
- https://github.com/livestorejs/livestore/blob/dev/docs/src/content/docs/framework-integrations/vue-integration.mdx
- https://context7.com/livestorejs/livestore/llms.txt
