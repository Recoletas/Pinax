# Desktop authoring transition task board

Baseline: `f5a6b01`; `npm run verify:full` passed with 25 files / 436 tests before implementation.

| Task | Owner | Worktree / branch | Exclusive write set | Dependency | Focused verification | Status |
|---|---|---|---|---|---|---|
| 1. Storage boundary/tooling | Codex | `desktop-project-foundation` / `feature/desktop-project-foundation` | package files, `src/services/storage/storageKeyPolicy.js`, this run directory | none | `desktopStorageInventory.test.js` | in progress |
| 2. Shared contracts | Codex | same | `shared/desktopProjectContract*` | task 1 inventory | shared contract test | pending |
| 3. Electron shell | Codex | same | Forge/Vite config, Electron main/preload/channels | task 2 | security contract + package | pending |
| 4. Project lifecycle | Codex | same | `electron/projects/projectPaths`, manifest, lock | task 2 | lifecycle test | pending |
| 5. SQLite foundation | Codex | same | database owner and migration | task 1 dependencies | database test | pending |
| 6. Atomic text I/O | Codex | same | files and repository services | tasks 4-5 | files/repository tests | pending |
| 7. Backup/integrity | Codex | same | backup service, repository integration | task 6 | backup test | pending |
| 8. Cache | Codex | same | cache manager | task 2 | cache test | pending |
| 9. IPC/adapters | Codex | same | IPC handlers and renderer repositories | tasks 3, 6, 8 | IPC/bridge tests | pending |
| 10. Project gate UI | Codex | same | desktop gate/composable/App/UI audit | task 9 | component/UI contracts | pending |
| 11. Handoff | Codex | same | status/plan/log/known issues/summary | all | desktop package + full verify + smoke | pending |

No parallel worker is active. The root worktree's research files remain out of scope.
