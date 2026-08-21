# Desktop Project Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a packageable Electron shell that safely creates, opens, writes, closes, checks, and backs up Pinax local-folder projects through a narrow repository API while leaving the current browser application functional.

**Architecture:** Electron main owns project selection, locking, filesystem access, SQLite, and cache. A sandboxed preload exposes individually named asynchronous methods; the Vue renderer calls a platform bridge and never imports Node/Electron/native modules. A browser repository remains available for compatibility, but new desktop project operations use the project repository. Text writes are staged and recorded so startup can recover interrupted file/metadata coordination.

**Tech Stack:** Electron Forge Vite plugin, Electron security fuses, Vue 3, Vite 5, better-sqlite3, Node.js `fs/promises`, Vitest node/jsdom environments, existing Vite/VitePress verification.

---

## Fixed contracts for this phase

### Project layout

```text
<chosen directory>/
├── manuscript/
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
    ├── project.sqlite
    ├── project.lock
    ├── backups/
    └── tmp/
```

### Renderer bridge

Only this serializable surface is exposed as `window.pinaxDesktop`:

```js
{
  platform: 'desktop',
  project: {
    chooseDirectory(),
    create({ directory, name }),
    open({ directory, mode: 'read-write' | 'read-only' }),
    getActive(),
    listText({ area, directory }),
    readText({ relativePath }),
    writeText({ itemId, relativePath, expectedRevision, text }),
    checkIntegrity(),
    createBackup({ destinationDirectory }),
    close()
  },
  cache: {
    getUsage(),
    setLimit({ bytes }),
    prune()
  }
}
```

Every call returns `{ ok: true, value }` or `{ ok: false, error: { code, message, details? } }`. Error details contain paths/IDs needed for repair but never secrets, manuscript content, SQL, or stack traces.

### Manifest

```json
{
  "schemaVersion": 1,
  "projectId": "uuid",
  "name": "My Novel",
  "createdAt": "2026-08-21T00:00:00.000Z",
  "updatedAt": "2026-08-21T00:00:00.000Z"
}
```

### SQLite schema v1

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE project_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('volume', 'chapter', 'reference')),
  relative_path TEXT UNIQUE,
  parent_id TEXT REFERENCES project_items(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT,
  byte_length INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE file_transactions (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  staged_path TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  resulting_hash TEXT NOT NULL,
  resulting_bytes INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('staged', 'file_committed', 'complete', 'aborted')),
  created_at TEXT NOT NULL,
  committed_at TEXT
);
```

Use `PRAGMA journal_mode=WAL`, `foreign_keys=ON`, `synchronous=FULL`, and a 5-second busy timeout. A managed backup checkpoints WAL before copying. Copying an open database directly is not a supported backup operation.

## Task 1: Record the storage boundary and install desktop tooling

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `docs/agent-runs/desktop-authoring-transition/current.md`
- Create: `docs/agent-runs/desktop-authoring-transition/storage-inventory.md`
- Test: `src/__tests__/desktopStorageInventory.test.js`

- [ ] **Step 1: Write a failing inventory contract test**

Create a test that imports `STORAGE_KEYS` and a checked-in classification object from `src/services/storage/storageKeyPolicy.js`. Assert that every declared key is classified exactly once as `project`, `preference`, `secret-config`, or `disposable`, and that `API_SETTINGS`, provider configs, theme/zoom, and runtime metrics are not `project`.

```js
expect(Object.keys(STORAGE_KEYS).sort()).toEqual(Object.keys(STORAGE_KEY_POLICY).sort())
expect(STORAGE_KEY_POLICY.API_SETTINGS).toBe('secret-config')
expect(STORAGE_KEY_POLICY.WRITING_BOOKS).toBe('project')
expect(STORAGE_KEY_POLICY.NARRATIVE_PRODUCTION_METRICS).toBe('disposable')
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
npm run test:run -- src/__tests__/desktopStorageInventory.test.js
```

Expected: FAIL because `storageKeyPolicy.js` does not exist.

- [ ] **Step 3: Add the complete policy and human-readable inventory**

Create `src/services/storage/storageKeyPolicy.js` with one frozen entry for every `STORAGE_KEYS` property. Mirror the decisions and direct-write exceptions in `storage-inventory.md`; include `Writing.vue`, `Notes.vue`, `gameStore.js`, worldbook drafts, settings, media stores, traces, and demo state from an `rg localStorage` scan.

- [ ] **Step 4: Install and lock desktop dependencies**

```bash
npm install better-sqlite3
npm install --save-dev electron @electron-forge/cli @electron-forge/maker-squirrel @electron-forge/maker-zip @electron-forge/plugin-auto-unpack-natives @electron-forge/plugin-fuses @electron-forge/plugin-vite @electron/fuses
```

Add scripts:

```json
{
  "desktop:dev": "electron-forge start",
  "desktop:package": "electron-forge package",
  "desktop:make": "electron-forge make",
  "test:desktop": "vitest run electron shared/desktopProjectContract.test.js src/__tests__/desktopPlatformBridge.test.js"
}
```

Set `main` to `.vite/build/main.js`. Do not remove current `dev`, `build`, `server`, or web verification scripts.

- [ ] **Step 5: Verify GREEN and commit**

```bash
npm run test:run -- src/__tests__/desktopStorageInventory.test.js
git diff --check
git add package.json package-lock.json src/services/storage/storageKeyPolicy.js src/__tests__/desktopStorageInventory.test.js docs/agent-runs/desktop-authoring-transition
git commit -m "build(desktop): add project storage foundation"
```

## Task 2: Add shared validation and typed result contracts

**Files:**
- Create: `shared/desktopProjectContract.js`
- Create: `shared/desktopProjectContract.test.js`

- [ ] **Step 1: Write failing tests for all public inputs**

Cover manifest validation, project name trimming, open mode, relative paths, text-write payloads, cache limits, and result shape. Required failures:

```js
expect(validateRelativeProjectPath('../outside.txt')).toMatchObject({ valid: false })
expect(validateRelativeProjectPath('/absolute.txt')).toMatchObject({ valid: false })
expect(validateRelativeProjectPath('.pinax/project.sqlite')).toMatchObject({ valid: false })
expect(validateRelativeProjectPath('manuscript/第一章.txt').valid).toBe(true)
expect(validateWriteTextInput({
  itemId: 'chapter-1', relativePath: 'manuscript/第一章.txt',
  expectedRevision: 3, text: '正文\n'
}).valid).toBe(true)
```

- [ ] **Step 2: Run and verify RED**

```bash
npm run test:run -- shared/desktopProjectContract.test.js
```

- [ ] **Step 3: Implement dependency-free validators**

Export:

```js
export const DESKTOP_PROJECT_SCHEMA_VERSION = 1
export const DESKTOP_ERROR_CODES = Object.freeze({
  INVALID_INPUT: 'DESKTOP_INVALID_INPUT',
  PROJECT_NOT_OPEN: 'DESKTOP_PROJECT_NOT_OPEN',
  PROJECT_LOCKED: 'DESKTOP_PROJECT_LOCKED',
  PATH_OUTSIDE_PROJECT: 'DESKTOP_PATH_OUTSIDE_PROJECT',
  STALE_REVISION: 'DESKTOP_STALE_REVISION',
  INTEGRITY_FAILED: 'DESKTOP_INTEGRITY_FAILED',
  IO_FAILED: 'DESKTOP_IO_FAILED'
})
```

Provide `validateProjectManifest`, `validateCreateProjectInput`, `validateOpenProjectInput`, `validateRelativeProjectPath`, `validateWriteTextInput`, `validateCacheLimitInput`, `success(value)`, and `failure(code, message, details)`. Validators return normalized values and never touch filesystem/global state.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:run -- shared/desktopProjectContract.test.js
git add shared/desktopProjectContract.js shared/desktopProjectContract.test.js
git commit -m "feat(desktop): define project bridge contracts"
```

## Task 3: Configure a hardened Electron shell

**Files:**
- Create: `forge.config.cjs`
- Create: `vite.main.config.mjs`
- Create: `vite.preload.config.mjs`
- Create: `vite.renderer.config.mjs`
- Create: `electron/main.mjs`
- Create: `electron/preload.cjs`
- Create: `electron/ipc/channels.cjs`
- Create: `electron/__tests__/securityContract.test.mjs`

- [ ] **Step 1: Add a failing static security contract**

Read the config/main/preload files as text and assert:

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`;
- the value passed to `contextBridge.exposeInMainWorld` does not expose raw `ipcRenderer`, event listeners, methods named `send`/`invoke`, or arbitrary channel arguments (the preload may call `ipcRenderer.invoke` internally behind fixed method names);
- Forge uses ASAR, native-module unpacking, and fuses disabling `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, and `EnableNodeCliInspectArguments`;
- navigation and new-window requests are denied unless they match the app's own dev/production origin.

- [ ] **Step 2: Run and verify RED**

```bash
npm run test:run -- electron/__tests__/securityContract.test.mjs
```

- [ ] **Step 3: Add Forge/Vite configuration**

Use the Forge Vite plugin with one main entry, one bundled CommonJS preload entry, and one renderer. Use `plugin-auto-unpack-natives` for better-sqlite3 and `FusesPlugin` for production hardening. Preserve the renderer's Vue alias, worker ES-module setting, and `/api`/`/ws` development proxies from `vite.config.js`.

- [ ] **Step 4: Create the BrowserWindow boundary**

`electron/main.mjs` creates one window only after `app.whenReady()`. Pass the window instance into IPC registration later; deny arbitrary navigation, external windows, permission requests, and untrusted IPC senders. Do not start Express/provider processes in this phase.

- [ ] **Step 5: Expose named preload methods only**

`electron/preload.cjs` binds each method in the fixed bridge contract to a fixed channel constant. The caller can supply data, never a channel name.

- [ ] **Step 6: Run GREEN and package smoke**

```bash
npm run test:run -- electron/__tests__/securityContract.test.mjs
npm run desktop:package
```

Expected: the host-platform package is created under `out/`; packaging completes with the native module unpacked.

- [ ] **Step 7: Commit**

```bash
git add forge.config.cjs vite.main.config.mjs vite.preload.config.mjs vite.renderer.config.mjs electron/main.mjs electron/preload.cjs electron/ipc/channels.cjs electron/__tests__/securityContract.test.mjs
git commit -m "feat(desktop): add hardened electron shell"
```

## Task 4: Create and validate project directories

**Files:**
- Create: `electron/projects/projectPaths.mjs`
- Create: `electron/projects/projectManifest.mjs`
- Create: `electron/projects/projectLock.mjs`
- Create: `electron/__tests__/projectLifecycle.test.mjs`

- [ ] **Step 1: Write lifecycle tests against temporary directories**

Use `mkdtemp` under the OS temp directory and dependency-injected clock/UUID/host/PID-liveness functions. Cover:

- creation produces exactly the fixed directory layout and valid manifest;
- existing non-empty folder without `.pinax/project.json` is rejected;
- invalid/corrupt manifest is rejected without mutation;
- resolved paths cannot escape the root through `..`, absolute paths, or symlinks;
- a live lock blocks read-write open but permits explicit read-only open;
- a stale lock is replaced and reported as recovered;
- close removes only the lock nonce owned by this process.

- [ ] **Step 2: Run RED**

```bash
npm run test:run -- electron/__tests__/projectLifecycle.test.mjs
```

- [ ] **Step 3: Implement project path containment**

`resolveProjectPath(root, relativePath, { allowPinax = false })` must normalize separators, validate the relative contract, resolve the real parent/root when present, and reject any relative result beginning with `..` or becoming absolute. File operations repeat containment after resolving symlinks; validation at the renderer boundary alone is insufficient.

- [ ] **Step 4: Implement atomic manifest creation**

Create directories first, write JSON to `.pinax/tmp/<uuid>.project.json`, flush the file, rename to `.pinax/project.json`, and flush `.pinax` where supported. If the final manifest already exists, abort instead of overwriting it.

- [ ] **Step 5: Implement owned project locks**

The lock contains `projectId`, PID, hostname, `startedAt`, and random nonce. Opening checks PID liveness only when hostname matches; a foreign-host lock is treated as active unless the user explicitly opens read-only. Closing compares nonce before unlinking.

- [ ] **Step 6: Run GREEN and commit**

```bash
npm run test:run -- electron/__tests__/projectLifecycle.test.mjs
git add electron/projects/projectPaths.mjs electron/projects/projectManifest.mjs electron/projects/projectLock.mjs electron/__tests__/projectLifecycle.test.mjs
git commit -m "feat(desktop): create locked local projects"
```

## Task 5: Add SQLite schema migration and integrity services

**Files:**
- Create: `electron/projects/projectDatabase.mjs`
- Create: `electron/projects/migrations/001-foundation.sql`
- Create: `electron/__tests__/projectDatabase.test.mjs`

- [ ] **Step 1: Write failing database tests**

Cover first open, repeat open, exact schema version, required pragmas, migration transaction rollback, project item revision update, quick/integrity check, WAL checkpoint, and close. Tests use a temp database, never the user's project.

- [ ] **Step 2: Run RED**

```bash
npm run test:run -- electron/__tests__/projectDatabase.test.mjs
```

- [ ] **Step 3: Implement the database owner**

Only `projectDatabase.mjs` imports `better-sqlite3`. Export `openProjectDatabase`, `runMigrations`, `checkDatabaseIntegrity`, `checkpointDatabase`, and `closeProjectDatabase`. Apply each migration and its `schema_migrations` row in one transaction. Reject a database whose schema version is newer than the application.

- [ ] **Step 4: Add prepared repository primitives**

Expose methods, not raw database objects: `getItemById`, `getItemByPath`, `insertItem`, `updateItemRevision`, `insertFileTransaction`, `updateFileTransactionState`, and `listRecoverableFileTransactions`. Every mutation is a prepared statement inside a transaction chosen by the repository service.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:run -- electron/__tests__/projectDatabase.test.mjs
git add electron/projects/projectDatabase.mjs electron/projects/migrations/001-foundation.sql electron/__tests__/projectDatabase.test.mjs
git commit -m "feat(desktop): add project sqlite foundation"
```

## Task 6: Implement atomic text I/O and interrupted-write recovery

**Files:**
- Create: `electron/projects/projectFiles.mjs`
- Create: `electron/projects/projectRepository.mjs`
- Create: `electron/__tests__/projectFiles.test.mjs`
- Create: `electron/__tests__/projectRepository.test.mjs`

- [ ] **Step 1: Write failing pure file tests**

Cover UTF-8, LF normalization, empty text, non-ASCII paths, hashes, byte length, containment, missing files, and injected failures before/after rename. A write with `expectedRevision !== item.revision` returns `DESKTOP_STALE_REVISION` and does not create a staged file.

- [ ] **Step 2: Run RED**

```bash
npm run test:run -- electron/__tests__/projectFiles.test.mjs electron/__tests__/projectRepository.test.mjs
```

- [ ] **Step 3: Implement read/list primitives**

`readText` returns `{ itemId, relativePath, revision, text, contentHash, byteLength }`. `listText` accepts only `manuscript` or `reference` plus an optional contained directory. It does not return `.pinax`, binary assets, hidden temporary files, or arbitrary filesystem metadata.

- [ ] **Step 4: Implement the write state machine**

For one `writeText` call:

1. validate input and active read-write project;
2. load item and compare `expectedRevision`;
3. normalize text to LF, compute SHA-256 and bytes;
4. create a `staged` DB transaction and write/fsync `.pinax/tmp/<transactionId>.txt`;
5. rename the staged file to a temporary sibling of the target, then atomically replace the target using a platform adapter that preserves the old target on failure;
6. mark `file_committed`;
7. update item hash/bytes/revision and mark `complete` in one SQLite transaction;
8. return the new revision and hash.

The filesystem adapter must be dependency-injected in tests. On startup, recover `staged` by deleting its owned temp if the target hash is unchanged; recover `file_committed` by verifying target hash and completing metadata. Any mismatch remains a typed repair case and never overwrites a file.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm run test:run -- electron/__tests__/projectFiles.test.mjs electron/__tests__/projectRepository.test.mjs
git add electron/projects/projectFiles.mjs electron/projects/projectRepository.mjs electron/__tests__/projectFiles.test.mjs electron/__tests__/projectRepository.test.mjs
git commit -m "feat(desktop): write project text atomically"
```

## Task 7: Add integrity checks and managed backups

**Files:**
- Create: `electron/projects/projectBackup.mjs`
- Create: `electron/__tests__/projectBackup.test.mjs`
- Modify: `electron/projects/projectRepository.mjs`

- [ ] **Step 1: Write failing backup and integrity tests**

Assert that backup:

- refuses a destination inside the source project;
- checkpoints WAL before copying;
- excludes `.pinax/tmp` and `project.lock`;
- includes manifest, SQLite, manuscript/reference text, and accepted assets;
- writes a backup manifest with file-relative paths, byte lengths, and SHA-256 values;
- validates every copied hash before reporting success;
- deletes only its own incomplete staging directory on failure.

Integrity checks must report manifest validity, schema version, SQLite integrity, recoverable transactions, missing item files, and hash mismatches separately.

- [ ] **Step 2: Run RED**

```bash
npm run test:run -- electron/__tests__/projectBackup.test.mjs
```

- [ ] **Step 3: Implement staged managed backup**

Create `<destination>/<project-name>-<timestamp>.pinax-backup.staging`, checkpoint SQLite, copy allowed files, write/flush `backup-manifest.json`, verify, then rename to `.pinax-backup`. Never instruct users or code paths to copy the live SQLite file without checkpointing.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:run -- electron/__tests__/projectBackup.test.mjs
git add electron/projects/projectBackup.mjs electron/projects/projectRepository.mjs electron/__tests__/projectBackup.test.mjs
git commit -m "feat(desktop): add managed project backups"
```

## Task 8: Add bounded global cache management

**Files:**
- Create: `electron/cache/cacheManager.mjs`
- Create: `electron/__tests__/cacheManager.test.mjs`

- [ ] **Step 1: Write failing cache tests**

Use a temp cache root. Cover the 1 GiB default, validated minimum/maximum limits, byte accounting, oldest-accessed-first pruning, pinned entry preservation, symlink/path escape rejection, and the invariant that no configured project root can be passed as a cache root.

- [ ] **Step 2: Run RED**

```bash
npm run test:run -- electron/__tests__/cacheManager.test.mjs
```

- [ ] **Step 3: Implement cache metadata and pruning**

Keep cache metadata under `app.getPath('userData')/cache/index.json`; records contain relative path, bytes, last access, content hash, kind, and `pinned`. Write the index atomically. `prune()` deletes only validated unpinned cache entries until usage is within the configured limit.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm run test:run -- electron/__tests__/cacheManager.test.mjs
git add electron/cache/cacheManager.mjs electron/__tests__/cacheManager.test.mjs
git commit -m "feat(desktop): bound rebuildable cache usage"
```

## Task 9: Register validated IPC and add renderer adapters

**Files:**
- Create: `electron/ipc/registerProjectHandlers.mjs`
- Modify: `electron/main.mjs`
- Create: `electron/__tests__/ipcProjectHandlers.test.mjs`
- Create: `src/services/platform/platformBridge.js`
- Create: `src/services/storage/browserStorageRepository.js`
- Create: `src/services/storage/desktopProjectRepository.js`
- Create: `src/services/storage/storageRepository.js`
- Create: `src/__tests__/desktopPlatformBridge.test.js`

- [ ] **Step 1: Write failing IPC tests**

Mock Electron event/window/repository. Assert that every channel validates the sender frame and payload, converts exceptions to typed failures, serializes no native object, and calls one repository method. Untrusted sender, unknown mode, escaped path, stale revision, and closed project must fail before side effects.

- [ ] **Step 2: Write failing renderer-adapter tests**

Assert:

```js
expect(resolvePlatformBridge({})).toMatchObject({ platform: 'browser' })
expect(resolvePlatformBridge({ pinaxDesktop: fakeDesktop })).toBe(fakeDesktop)
expect(createStorageRepository({ bridge: fakeDesktop }).kind).toBe('desktop-project')
expect(createStorageRepository({ bridge: browserBridge }).kind).toBe('browser-compatibility')
```

The desktop adapter propagates typed failures and never falls back to localStorage after a desktop write fails.

- [ ] **Step 3: Run RED**

```bash
npm run test:run -- electron/__tests__/ipcProjectHandlers.test.mjs src/__tests__/desktopPlatformBridge.test.js
```

- [ ] **Step 4: Implement sender-bound handlers**

Register one `ipcMain.handle` per fixed channel. Compare `event.senderFrame` with the active window's main frame and validate its URL against the active dev server or packaged app origin. Inject the dialog, repository, and cache manager; do not import renderer stores.

- [ ] **Step 5: Implement compatibility repositories**

`browserStorageRepository` wraps the existing JSON/text get/set/remove semantics for current code. `desktopProjectRepository` implements only the fixed project bridge in this phase. `storageRepository.js` selects explicitly from the platform bridge; it does not pretend legacy key-value records are already mapped to desktop project tables.

- [ ] **Step 6: Run GREEN and commit**

```bash
npm run test:run -- electron/__tests__/ipcProjectHandlers.test.mjs src/__tests__/desktopPlatformBridge.test.js
git add electron/ipc/registerProjectHandlers.mjs electron/main.mjs electron/__tests__/ipcProjectHandlers.test.mjs src/services/platform src/services/storage src/__tests__/desktopPlatformBridge.test.js
git commit -m "feat(desktop): connect validated project bridge"
```

## Task 10: Add the smallest project-open UI slice

**Files:**
- Create: `src/components/desktop/DesktopProjectGate.vue`
- Create: `src/composables/useDesktopProject.js`
- Modify: `src/App.vue`
- Modify: `scripts/ui-audit.mjs`
- Modify: `src/__tests__/uiControlContract.test.js`
- Create: `src/__tests__/desktopProjectGate.test.js`

- [ ] **Step 1: Write failing component and UI contract tests**

Cover browser pass-through, desktop welcome state, choose/create/open, validation error, locked-project read-only choice, busy state, initial focus, keyboard operation, and recovery after dialog cancellation. Assert the gate uses existing color/type/spacing tokens and existing responsive breakpoints.

- [ ] **Step 2: Run RED**

```bash
npm run test:run -- src/__tests__/desktopProjectGate.test.js src/__tests__/uiControlContract.test.js
```

- [ ] **Step 3: Implement a restrained gate, not a new dashboard**

In desktop mode with no active project, show only product identity, “新建项目”, “打开项目”, and recent-project repair text when relevant. Once a project is open, render the existing application unchanged beneath the gate. Browser mode renders the current application immediately.

- [ ] **Step 4: Add audit states**

Add `desktop-project-empty`, `desktop-project-error`, and `desktop-project-readonly` mocked states at 1440 and 390 widths. Do not require a real OS directory dialog in the browser audit.

- [ ] **Step 5: Run GREEN and UI audit**

```bash
npm run test:run -- src/__tests__/desktopProjectGate.test.js src/__tests__/uiControlContract.test.js
npm run audit:ui
```

Expected: zero console errors and zero accessibility failures for the new states. Visually confirm one clear primary action, readable long paths/errors, no horizontal clipping, and equivalent keyboard access.

- [ ] **Step 6: Commit**

```bash
git add src/components/desktop/DesktopProjectGate.vue src/composables/useDesktopProject.js src/App.vue scripts/ui-audit.mjs src/__tests__/uiControlContract.test.js src/__tests__/desktopProjectGate.test.js
git commit -m "feat(desktop): add local project entry gate"
```

## Task 11: Full verification, documentation, and handoff

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/PLAN.md`
- Modify: `docs/LOG.md`
- Modify: `docs/src/known-issues.md`
- Create: `docs/agent-runs/desktop-authoring-transition/desktop-foundation-summary.md`

- [ ] **Step 1: Run desktop-focused verification**

```bash
npm run test:desktop
npm run desktop:package
```

Expected: all desktop contract/lifecycle/database/file/backup/cache/IPC/bridge tests pass and host packaging exits 0.

- [ ] **Step 2: Run full repository verification**

```bash
npm run verify:full
git diff --check
```

Expected: Vitest, web Vite build, documentation build, and diff check all exit 0.

- [ ] **Step 3: Perform a clean temporary-project smoke**

Using the packaged application and a new temporary directory:

1. create a project with a non-ASCII name;
2. close and reopen it;
3. write and reopen one TXT file;
4. verify a second read-write open is blocked and read-only is allowed;
5. create and validate a managed backup;
6. close the app and confirm no owned lock remains.

Record the OS, Electron version, artifact path, project path class, result, and any unrun Windows-only checks. Do not use the user's real novel directory.

- [ ] **Step 4: Self-review against phase boundaries**

Confirm:

- no existing project content has been migrated yet;
- no direct localStorage caller was silently redirected to SQLite;
- renderer bundles contain no `electron`, `node:fs`, or `better-sqlite3` import;
- raw IPC/database objects and stack traces do not cross preload;
- provider process behavior is unchanged;
- cache and backup deletion targets are explicitly contained;
- browser build and browser backup remain functional;
- user research/WIP files are not staged.

- [ ] **Step 5: Update status and commit the phase handoff**

Document actual test counts and distinguish host-package smoke from Windows clean-machine acceptance. Mark P2/P3 unblocked only if the repository API and schema v1 are merged.

```bash
git add docs/STATUS.md docs/PLAN.md docs/LOG.md docs/src/known-issues.md docs/agent-runs/desktop-authoring-transition/desktop-foundation-summary.md
git commit -m "docs(desktop): record project foundation handoff"
```

## Final phase acceptance

The foundation is complete only when all statements are true:

- [ ] A packaged desktop app can create/open/close a local-folder project without granting Node access to the renderer.
- [ ] Text writes are revision-checked, contained, atomic where the platform supports it, and recoverable after injected interruption.
- [ ] SQLite schema creation/migration is repeatable and integrity failures are typed rather than hidden.
- [ ] Managed backup excludes locks/temp/cache and validates copied content.
- [ ] Cache pruning cannot reach project roots or accepted media.
- [ ] Browser mode still builds and behaves through its compatibility adapter.
- [ ] No manuscript-format, unified-workbench, or AI-direct-edit behavior was prematurely folded into this phase.
- [ ] P2 legacy migration and P3 plain-text editor have stable interfaces to plan against.
