# Legacy Project Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export browser-owned Pinax project data as a verifiable v3 migration bundle and import it into a new desktop project through a dry-runnable, idempotent, rollback-safe conversion.

**Architecture:** Keep the existing v1/v2 browser backup/restore API intact and add a migration-only v3 envelope that includes project-classified records, immutable byte/hash inventory, and no credentials or application preferences. Electron validates and converts the bundle in the main process, writes a sibling staging project, records deterministic source-to-target mappings in SQLite schema v2, validates all files and journal counts, then atomically renames the staging directory. Non-text domains that later phases own are preserved once in a typed compatibility table; manuscript chapters and reference prose are converted immediately to UTF-8 text plus `project_items`.

**Tech Stack:** Vue 3, Web Crypto API, Electron Forge, Node.js `crypto`/`fs`, better-sqlite3, Vitest, existing Pinax storage policy and desktop project repository.

---

## Fixed contracts and ownership

- `buildBackup()` and `restoreBackup()` remain the browser backup v2 compatibility path.
- `buildLegacyMigrationBundle()` produces schema v3 and includes only storage records classified as `project`.
- UTF-8 byte length and SHA-256 are computed over each raw localStorage string, before parsing or conversion.
- Bundle identity is SHA-256 over the canonical sorted inventory, so exporting unchanged source twice produces the same `bundleId`.
- IDs use `stableMigrationId(kind, sourceRecordId, nestedId)` and therefore do not depend on import time or destination path.
- Books/chapters become `volume`/`chapter` items and `manuscript/**/*.txt`; worldbook entries with prose become `reference` items and `reference/{characters,places,events,research}/**/*.txt`.
- Experience turns, writing-unit metadata, annotations, history, materials, media metadata, and canvas/storyboard records are preserved in `legacy_records` until their owning later phase converts them. They are not copied into a second desktop cache.
- A malformed project record is `rejected`; missing parent/source linkage is `orphaned`; derivative data without valid provenance is `detached`; directly mapped data is `converted`; recognized compatibility data is `supported`.
- Dry run does not create directories, databases, files, locks, recent-project entries, or journal rows.
- Import targets a new directory only. Existing completed destination + same `bundleId` returns `alreadyImported`; every other existing destination is rejected.

## File map

- Create `src/services/migration/legacyMigrationBundle.js`: browser-safe canonicalization, classification, SHA-256 inventory, v3 bundle construction.
- Create `src/services/migration/legacyMigrationBundle.test.js`: secret exclusion, hashes, deterministic IDs, v3 shape, dynamic project keys.
- Modify `src/utils/backupExport.js`: add explicit migration download while preserving backup v2.
- Modify `src/__tests__/backupExport.test.js`: v2 regression and migration export download coverage.
- Create `shared/legacyMigrationContract.js` and test: serialized v3 input/report/import validation and safe error enums.
- Create `electron/projects/migrations/002-legacy-import.sql`: import journal and compatibility records.
- Modify `shared/desktopProjectContract.js`, `electron/projects/projectDatabase.mjs`, and tests: schema v2 plus narrow prepared migration methods.
- Create `electron/migration/legacyProjectConverter.mjs`: verify inventory, parse records, build deterministic conversion operations and dry-run report.
- Create `electron/migration/legacyProjectImporter.mjs`: sibling staging project, operation application, validation, final rename, rollback, duplicate detection.
- Create `electron/__tests__/fixtures/legacy-migration-v2.json` and `legacy-migration-v3.json`: representative worldbooks, books/chapters, Experience, writing metadata, annotations/history, materials, and canvas/storyboard data.
- Create `electron/__tests__/legacyProjectConverter.test.mjs` and `legacyProjectImporter.test.mjs`.
- Modify `electron/ipc/channels.cjs`, `electron/preload.cjs`, `electron/ipc/registerProjectHandlers.mjs`, `electron/main.mjs`, and IPC tests: choose bundle, dry run, import.
- Modify `src/services/storage/desktopProjectRepository.js`, `src/composables/useDesktopProject.js`, `src/components/desktop/DesktopProjectGate.vue`, and UI tests: explicit desktop migration workflow.
- Create `scripts/desktop-legacy-migration-smoke.mjs` and add `smoke:desktop-migration` to `package.json`.
- Update `docs/STATUS.md`, `docs/PLAN.md`, and `docs/LOG.md` after verification.

### Task 1: Browser-safe migration bundle v3

**Files:**
- Create: `src/services/migration/legacyMigrationBundle.js`
- Create: `src/services/migration/legacyMigrationBundle.test.js`
- Modify: `src/services/storage/storageKeyPolicy.js`

- [ ] **Step 1: Write failing tests for project-only inventory**

Test a storage fixture containing `writing_books`, `worldbooks_index`, `worldbook_wb-1`, provider configuration, UI preference, and diagnostics. Require sorted project records only, raw string byte lengths, 64-character SHA-256 values, and explicit record types.

```js
const bundle = await buildLegacyMigrationBundle(storage, { now: fixedNow })
expect(bundle.schemaVersion).toBe(3)
expect(bundle.records.map(record => record.sourceRecordId)).toEqual([
  'worldbook_wb-1', 'worldbooks_index', 'writing_books'
])
expect(bundle.records.some(record => record.sourceRecordId === 'api_settings')).toBe(false)
expect(bundle.sourceInventory.every(record => /^[a-f0-9]{64}$/.test(record.sha256))).toBe(true)
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/services/migration/legacyMigrationBundle.test.js`

Expected: FAIL because `buildLegacyMigrationBundle` does not exist.

- [ ] **Step 3: Implement canonical project-key classification and hashing**

Export these browser-safe functions:

```js
export const LEGACY_MIGRATION_SCHEMA_VERSION = 3
export function classifyLegacyStorageKey(key) {}
export function canonicalizeMigrationInventory(records) {}
export async function sha256Utf8(value, cryptoScope = globalThis.crypto) {}
export async function buildLegacyMigrationBundle(storage = localStorage, deps = {}) {}
```

Classify `worldbooks_index`, `active_worldbook_id`, `worldbook_*`, and `worldbook:brief:*` as project data in addition to named `STORAGE_KEY_POLICY` entries. Reject unknown keys and never include `preference`, `secret-config`, or `disposable` classes.

- [ ] **Step 4: Verify GREEN and regression tests**

Run: `npx vitest run src/services/migration/legacyMigrationBundle.test.js src/__tests__/desktopStorageInventory.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/migration/legacyMigrationBundle.js src/services/migration/legacyMigrationBundle.test.js src/services/storage/storageKeyPolicy.js
git commit -m "feat(migration): define browser migration bundle v3"
```

### Task 2: Preserve backup v2 and expose explicit migration export

**Files:**
- Modify: `src/utils/backupExport.js`
- Modify: `src/__tests__/backupExport.test.js`

- [ ] **Step 1: Write a failing export regression test**

Require `buildBackup()` to remain schema v2 and `exportLegacyMigrationBundle()` to download `pinax-desktop-migration-*.json` containing schema v3 without `API_SETTINGS`.

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run src/__tests__/backupExport.test.js`

Expected: FAIL because the migration export is absent.

- [ ] **Step 3: Add the migration export without changing restore semantics**

```js
export async function exportLegacyMigrationBundle(options = {}) {
  const bundle = await buildLegacyMigrationBundle(options.storage || localStorage, options)
  const filename = `pinax-desktop-migration-${timestampForFilename()}.json`
  downloadJsonFile(bundle, filename)
  return { filename, bundleId: bundle.bundleId, recordCount: bundle.records.length }
}
```

- [ ] **Step 4: Verify v1/v2 restore and v3 export**

Run: `npx vitest run src/__tests__/backupExport.test.js`

Expected: PASS, including all existing restore tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/backupExport.js src/__tests__/backupExport.test.js
git commit -m "feat(migration): export desktop migration bundles"
```

### Task 3: Serializable migration contracts

**Files:**
- Create: `shared/legacyMigrationContract.js`
- Create: `shared/legacyMigrationContract.test.js`

- [ ] **Step 1: Write failing validation tests**

Cover valid v3, v2 backup compatibility, duplicate source IDs, inventory/record mismatch, invalid hashes, unsafe absolute destination paths, and report status enums.

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run shared/legacyMigrationContract.test.js`

Expected: FAIL because the contract module is missing.

- [ ] **Step 3: Implement bounded contracts**

Export:

```js
export const MIGRATION_RECORD_STATUSES = Object.freeze([
  'supported', 'converted', 'detached', 'orphaned', 'rejected'
])
export function validateLegacyMigrationBundle(input) {}
export function validateMigrationBundlePathInput(input) {}
export function validateLegacyImportInput(input) {}
export function validateMigrationReport(input) {}
```

Validation must reject unexpected non-serializable values, duplicate IDs, record sizes above the declared inventory, and v3 bundles whose inventory does not correspond one-to-one with records. v2 compatibility accepts the legacy `{app:'Pinax', keys:{...}}` envelope for conversion but never treats it as a v3 verified bundle.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run shared/legacyMigrationContract.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/legacyMigrationContract.js shared/legacyMigrationContract.test.js
git commit -m "feat(migration): validate legacy import contracts"
```

### Task 4: SQLite schema v2 migration journal

**Files:**
- Create: `electron/projects/migrations/002-legacy-import.sql`
- Modify: `shared/desktopProjectContract.js`
- Modify: `electron/projects/projectDatabase.mjs`
- Modify: `electron/__tests__/projectDatabase.test.mjs`

- [ ] **Step 1: Write failing schema and transaction tests**

Require an existing v1 database to upgrade to v2 with `legacy_imports`, `legacy_import_records`, and `legacy_records`; require a failed v2 migration to roll back; require journal writes and target records to commit in one database transaction.

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run electron/__tests__/projectDatabase.test.mjs`

Expected: FAIL with schema version 1 and missing migration methods.

- [ ] **Step 3: Add schema v2 and prepared owner methods**

The SQL tables are:

```sql
CREATE TABLE legacy_imports (
  bundle_id TEXT PRIMARY KEY,
  source_schema_version INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('staging','complete','failed')),
  source_count INTEGER NOT NULL,
  imported_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE legacy_import_records (
  bundle_id TEXT NOT NULL REFERENCES legacy_imports(bundle_id),
  source_record_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  status TEXT NOT NULL,
  target_kind TEXT,
  target_id TEXT,
  PRIMARY KEY (bundle_id, source_record_id)
);
CREATE TABLE legacy_records (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  json_payload TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

Expose only prepared methods: `getLegacyImport`, `beginLegacyImport`, `insertLegacyImportRecord`, `insertLegacyRecord`, `completeLegacyImport`, and `withTransaction`.

- [ ] **Step 4: Verify GREEN and all desktop database tests**

Run: `npx vitest run electron/__tests__/projectDatabase.test.mjs electron/__tests__/projectRepository.test.mjs`

Expected: PASS with schema v2.

- [ ] **Step 5: Commit**

```bash
git add electron/projects/migrations/002-legacy-import.sql shared/desktopProjectContract.js electron/projects/projectDatabase.mjs electron/__tests__/projectDatabase.test.mjs
git commit -m "feat(migration): add import journal schema"
```

### Task 5: Deterministic dry-run converter and fixtures

**Files:**
- Create: `electron/migration/legacyProjectConverter.mjs`
- Create: `electron/__tests__/legacyProjectConverter.test.mjs`
- Create: `electron/__tests__/fixtures/legacy-migration-v2.json`
- Create: `electron/__tests__/fixtures/legacy-migration-v3.json`

- [ ] **Step 1: Add representative failing fixtures and report assertions**

The v3 fixture must include worldbook entries, books with legacy Markdown and schema-v3 writing units, annotations/history, Experience turns, narrative materials, media metadata, relation canvas, and storyboard data. Include one orphan and one derivative with absent provenance.

Require dry run to return counts by all five statuses, target relative paths, stable IDs, chapter normalized-text hashes/character counts, and zero filesystem/database writes.

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run electron/__tests__/legacyProjectConverter.test.mjs`

Expected: FAIL because the converter is missing.

- [ ] **Step 3: Implement verification, v2 normalization, and operation planning**

Export:

```js
export function stableMigrationId(kind, sourceRecordId, nestedId = '') {}
export function normalizeLegacyBundle(input) {}
export async function verifyLegacyBundle(bundle) {}
export async function createLegacyMigrationPlan(bundle) {}
```

The plan contains serializable operations only: `textItems[]`, `legacyRecords[]`, `journalRecords[]`, `report`, and `bundle`. Convert chapter text using existing writing document projections where valid; preserve unsupported constructs in one compatibility record and report them instead of silently dropping content.

- [ ] **Step 4: Verify GREEN, deterministic order, and no-write behavior**

Run: `npx vitest run electron/__tests__/legacyProjectConverter.test.mjs`

Expected: PASS and repeated plans deep-equal.

- [ ] **Step 5: Commit**

```bash
git add electron/migration/legacyProjectConverter.mjs electron/__tests__/legacyProjectConverter.test.mjs electron/__tests__/fixtures/legacy-migration-v2.json electron/__tests__/fixtures/legacy-migration-v3.json
git commit -m "feat(migration): plan deterministic legacy conversion"
```

### Task 6: Staging import, validation, idempotency, and rollback

**Files:**
- Create: `electron/migration/legacyProjectImporter.mjs`
- Create: `electron/__tests__/legacyProjectImporter.test.mjs`
- Modify: `electron/projects/projectFiles.mjs`

- [ ] **Step 1: Write failing filesystem integration tests**

Cover successful import, same bundle imported twice, cancellation before finalization, injected failure after text writes, count/hash mismatch, Unicode paths, and an existing unrelated destination. Assert failed/cancelled runs leave no final project and remove only the owned staging directory.

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run electron/__tests__/legacyProjectImporter.test.mjs`

Expected: FAIL because the importer is missing.

- [ ] **Step 3: Implement sibling staging and atomic finalization**

Export:

```js
export async function dryRunLegacyProjectMigration({ bundlePath }, deps = {}) {}
export async function importLegacyProject({ bundlePath, destinationDirectory, name }, deps = {}) {}
```

Read and parse the bundle in the main process. Create `<destination>.pinax-import-<bundle-prefix>` as a sibling, initialize a project there, apply all database rows in transactions, write normalized text through contained paths, checkpoint/close SQLite, reopen for integrity/count/hash validation, and rename the complete staging directory to the final destination. On any failure or cancellation, close handles and remove only that exact staging path.

- [ ] **Step 4: Verify GREEN and project integrity**

Run: `npx vitest run electron/__tests__/legacyProjectImporter.test.mjs electron/__tests__/projectLifecycle.test.mjs electron/__tests__/projectDatabase.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/migration/legacyProjectImporter.mjs electron/__tests__/legacyProjectImporter.test.mjs electron/projects/projectFiles.mjs
git commit -m "feat(migration): import through validated staging projects"
```

### Task 7: Narrow desktop migration IPC and renderer adapter

**Files:**
- Modify: `electron/ipc/channels.cjs`
- Modify: `electron/preload.cjs`
- Modify: `electron/ipc/registerProjectHandlers.mjs`
- Modify: `electron/main.mjs`
- Modify: `electron/__tests__/ipcProjectHandlers.test.mjs`
- Modify: `electron/__tests__/securityContract.test.mjs`
- Modify: `src/services/storage/desktopProjectRepository.js`
- Modify: `src/__tests__/desktopPlatformBridge.test.js`

- [ ] **Step 1: Write failing bridge and security tests**

Require named `migration.chooseBundle`, `migration.chooseDestination`, `migration.dryRun`, `migration.importProject`, and `migration.cancelImport` methods; main owns selected paths behind bounded opaque tokens. Reject renderer-supplied raw paths/bundles, invalid tokens/names, untrusted frames, and non-serializable responses.

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run electron/__tests__/ipcProjectHandlers.test.mjs electron/__tests__/securityContract.test.mjs src/__tests__/desktopPlatformBridge.test.js`

Expected: FAIL because migration methods/channels are absent.

- [ ] **Step 3: Implement the narrow bridge**

The renderer sends only opaque selection tokens and the validated project name. `chooseBundle` uses an open-file dialog restricted to JSON; `chooseDestination` selects an existing parent directory; dry run/import resolve paths only inside the main-process migration service. Add matching typed repository methods without exposing raw paths, filesystem, or database handles, and keep cancel available while import is active.

- [ ] **Step 4: Verify GREEN**

Run the same focused command; expected PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/channels.cjs electron/preload.cjs electron/ipc/registerProjectHandlers.mjs electron/main.mjs electron/__tests__/ipcProjectHandlers.test.mjs electron/__tests__/securityContract.test.mjs src/services/storage/desktopProjectRepository.js src/__tests__/desktopPlatformBridge.test.js
git commit -m "feat(migration): expose narrow desktop import bridge"
```

### Task 8: Explicit migration UI slice

**Files:**
- Modify: `src/composables/useDesktopProject.js`
- Modify: `src/components/desktop/DesktopProjectGate.vue`
- Modify: `src/__tests__/desktopProjectGate.test.js`

- [ ] **Step 1: Write failing interaction tests**

Require “迁移浏览器旧项目” to select a bundle, display dry-run status/counts before any import, require a separate destination selection and confirmation, preserve report details on failure, and enter the imported project only after successful finalization. Cancellation must restore focus and controls.

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run src/__tests__/desktopProjectGate.test.js`

Expected: FAIL because the migration action is absent.

- [ ] **Step 3: Implement the minimum accessible flow**

Keep the existing restrained gate. Add one tertiary text action, an inline report with five status counts and rejected/orphan details, and explicit “选择父目录并迁移” / “取消” actions. Move focus to the report confirmation after preview and expose “停止迁移” during an active import. Do not add a second global navigation layer or hide read-only/open errors.

- [ ] **Step 4: Verify GREEN and UI contracts**

Run: `npx vitest run src/__tests__/desktopProjectGate.test.js src/__tests__/uiControlContract.test.js`

Expected: PASS with keyboard focus restoration.

- [ ] **Step 5: Run the project UI style checklist**

Use `ui-style-check`; inspect 1440 and 390 fixtures without starting or restarting an existing user server. If no compatible server is available, record live audit as an external gate rather than substituting component tests.

- [ ] **Step 6: Commit**

```bash
git add src/composables/useDesktopProject.js src/components/desktop/DesktopProjectGate.vue src/__tests__/desktopProjectGate.test.js
git commit -m "feat(migration): add desktop legacy import flow"
```

### Task 9: End-to-end migration smoke and phase handoff

**Files:**
- Create: `scripts/desktop-legacy-migration-smoke.mjs`
- Modify: `package.json`
- Modify: `docs/STATUS.md`
- Modify: `docs/PLAN.md`
- Modify: `docs/LOG.md`

- [ ] **Step 1: Write the smoke script against the public importer**

The script creates a Unicode temporary source bundle and destination, runs dry-run, imports, re-imports the same bundle, opens the project, verifies chapter/reference bytes and journal counts, then removes only its temp root.

- [ ] **Step 2: Run focused migration gates**

Run:

```bash
npm run test:desktop
npm run smoke:desktop-migration
```

Expected: both exit 0; duplicate import reports `alreadyImported: true` and no duplicate logical records.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run verify:full
npm run desktop:package
git diff --check
```

Expected: all exit 0. Packaging on the current Linux host does not replace the Windows clean-machine gate.

- [ ] **Step 4: Update shared status and handoff docs**

Record code/test/package evidence, v2 compatibility, immutable browser source behavior, temporary compatibility ownership, UI audit status, and remaining Windows/manual gates. Use `docs-status-handoff` and `testing-verification` before claiming completion.

- [ ] **Step 5: Commit the verified handoff**

```bash
git add scripts/desktop-legacy-migration-smoke.mjs package.json docs/STATUS.md docs/PLAN.md docs/LOG.md
git commit -m "docs(migration): record legacy import handoff"
```

## Phase acceptance checklist

- [ ] Browser export leaves every source localStorage key unchanged.
- [ ] Migration bundles contain project data and exclude provider credentials, application preferences, and disposable diagnostics.
- [ ] Every v3 source record has immutable type, UTF-8 byte length, and SHA-256 inventory metadata.
- [ ] Desktop dry run performs no filesystem or SQLite writes.
- [ ] v2 backups and v3 migration bundles both produce deterministic conversion plans.
- [ ] Re-importing the same bundle produces no duplicate logical records.
- [ ] Cancellation, conversion failure, count mismatch, or hash mismatch leaves no partially openable final project.
- [ ] Worldbooks, books/chapters, Experience turns, writing units, annotations, history, materials, and canvas/storyboard fixtures are all converted or explicitly reported; none disappear silently.
- [ ] The imported project passes manifest, schema, SQLite, file-count, and content-hash integrity checks.
- [ ] Existing browser backup v1/v2 restore behavior remains green.
