# P1 desktop project foundation handoff

Date: 2026-08-21
Branch: `feature/desktop-project-foundation`
Worktree: `/home/recoletas/jiuguan/worktrees/desktop-project-foundation`

## Delivered

- Electron Forge/Vite host with ASAR/native unpacking, disabled unsafe fuses, sandboxed/context-isolated renderer, denied navigation/window creation/permissions, and a fixed preload bridge.
- Local-folder project manifest, nonce lock with stale recovery/read-only mode, SQLite schema v1 and owner-only prepared APIs.
- UTF-8/LF text primitives with containment checks, revision conflicts before staging, fsynced staging, injected atomic replace adapter, and typed interrupted-write recovery.
- Independent project integrity report and managed WAL-checkpointed backup with an allowlist, fsynced manifest, byte/SHA-256 verification, and owned-staging-only cleanup.
- Global rebuildable cache with a 1 GiB default, validated 64 MiB–100 GiB limits, atomic index, pinned preservation, oldest-accessed-first pruning, and project-root/symlink escape rejection.
- Sender-bound validated IPC, explicit browser/desktop renderer repositories, and a minimal desktop project gate. Browser mode and the existing browser backup remain unchanged.

## Phase boundaries confirmed

- No existing project content was migrated.
- No direct localStorage caller was redirected to SQLite; the inventory remains documentation/policy only.
- Source and production renderer bundles contain no `electron`, `node:fs`, or `better-sqlite3` imports.
- Preload exposes named promise methods, not raw IPC/database/native objects; failure details are allowlist-sanitized and stack/text/secret fields are blocked.
- `server/` and provider behavior are unchanged.
- Backup/cache deletion resolves explicit contained targets; project and accepted asset roots are not pruning targets.
- No manuscript-format, unified-workbench, Experience/Writing merge, or AI direct-edit behavior was folded into P1.
- Root-worktree `docs/superpowers/**` WIP was neither edited nor staged from this worktree.

## Verification evidence

- `npm run test:desktop`: exit 0, 10 files / 36 tests.
- `npm run desktop:package`: exit 0, Linux x64 artifact at `out/pinax-linux-x64/pinax`, Electron 43.4.1, native dependencies prepared.
- `npm run smoke:desktop-foundation`: exit 0 on Linux / Node v22.22.3; temporary non-ASCII `雾港计划`; create, close/reopen, revision 1 TXT write/reopen, second writer blocked, read-only open, 3-file managed backup, and owned-lock cleanup verified.
- `npm run verify:full`: exit 0, 37 files / 481 tests, Vite build, `git diff --check`, and VitePress build.
- Desktop gate component/UI contract: 2 files / 18 tests.

## External gates not claimed

- The existing `127.0.0.1:5173` Vite process serves `/home/recoletas/jiuguan/text-game-framework`, not this feature worktree. It was not restarted, so `desktop-project-empty`, `desktop-project-error`, and `desktop-project-readonly` live audit captures at 1440/390 remain unrun.
- Windows clean-machine install/start, native SQLite load, OS dialogs, filesystem replacement semantics, and close-time lock cleanup remain unrun.
- Host-service smoke validates the packaged code paths and artifact presence; it is not described as automated packaged-GUI interaction.

## Next dependency

P2 legacy migration bundle and P3 plain-text editor may begin only after this branch is merged into `main`. Windows release acceptance remains independent and must not be inferred from Linux host packaging.
