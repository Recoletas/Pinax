---
name: map-engine-workflow
description: Use when modifying world-map, geography, map renderer, or map worker code - anchors to canonical docs and current behavior classification
---

# map-engine-workflow

Workflow guardrail for world-map subsystem work.

1. **Read first** (as relevant to the change):
   - `docs/src/code-map.md §world-map`
   - `docs/src/decisions/ADR-0003-azgaar-pipeline.md`
   - `docs/src/known-issues.md §地图引擎`
   - `docs/src/rfcs/azgaar-pipeline/index.md`
2. **Identify the affected surface**: heightmap / tectonics / coast / rivers / nations / renderer / worker / AI adapter / UI.
3. **Status check**: is the current behavior `accepted` / `superseded` / `active issue` in the docs? Do not reintroduce behaviors marked `superseded` (e.g., `realism.level` is superseded — do not reintroduce).
4. **Keep changes scoped**: a bug fix is not a refactor. A new feature is not a "while I'm here" cleanup.
5. **For algorithm / perf rewrites**: use `?debug=perf` and the perf docs first; do not guess. If you cannot find a canonical reference, stop and ask the user.
6. **Verification**: run targeted map tests, then broader verification (`npm run verify`) if behavior changed.
7. Update `docs/STATUS.md` when behavior or known issues changed (delegate to `docs-status-handoff`).
