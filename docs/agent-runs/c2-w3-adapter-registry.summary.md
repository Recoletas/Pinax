# C2-3 F3 adapter / host-local registry handoff

## Result

- Moved the pure `toCollaborableArtifact()` owner into F3 at
  `src/services/agents/authoring/authoringCollaborationArtifact.js`.
- All four artifact kinds require the same ready intervention session and a
  canonical frozen rehearsal scope. Direction sets contain no selection;
  impact groups must be established members of that scope; rehearsal branches
  must match the canonical selection and canonical F3 request/result.
- Seven F3 evidence locator kinds map exactly to the neutral C2 locator schema.
  Raw `sourceRef`/`targetRef`/relation refs, `projectId`, provider state and the
  memory locator's provenance `sourceRef` never enter the artifact. Revision
  keys are typed-locator fingerprints. Network branch data is a read-only
  `preview`, has `derived-plausible` authority, and is not a Ghost/result owner.
- Direction proposals can only bind an existing `directionId` and the frozen
  direction-set artifact fingerprint. The direction set also binds the exact
  intervention artifact, typed scope constraints, target groups and evidence
  assignments. `registerSource()` turns the original local session/scope into
  an opaque registry handle; generation never accepts caller-supplied F3
  objects. The host registry derives and validates the canonical F3 selection
  and request before the provider, invokes the injected F3 runner at most once
  per selected proposal, and retains the original local identities.
- Branch publication proves a one-to-one match between every canonical request
  target and draft, including role/title/original text and exact target locator.
  Missing, duplicate, invented or swapped targets fail closed.
- Promotion request creation and preflight read the complete live revision set
  through a branded field-by-field reader backed by local target/evidence
  owners on both passes. Main and branch document/unit/node revisions plus each
  evidence source revision are independently covered. Reconnect accepts
  canonical room/proposal/binding/artifact clones only when the original opaque
  local record remains. Promotion returns only the original local objects plus
  Ghost ids; the bridge creates no adoption, patch, write or history operation.

The registry is deliberately an in-memory local owner. After a page reload its
records are gone: a network preview must never reconstruct the F3 result. The
room must mark that branch stale or start a new local rehearsal.

## Verification (Node 20.20.2)

- `collaboration-authoring-bridge-matrix.mjs`: 14/14, exit 0.
- `collaboration-rehearsal-contract-matrix.mjs`: 8/8, exit 0.
- `collaboration-fault-matrix.mjs`: 33/33, exit 0.
- `collaboration-transport-matrix.mjs`: 43/43, exit 0.
- Scoped ESLint: 0 errors (four expected `no-console` warnings in the smoke
  script), exit 0.
- `node --check` for the adapter, bridge and matrix: exit 0.
- Scoped `git diff --check`: exit 0.

Per integration-owner instruction this worker did not run `verify:full`; the
integration owner retains that final gate and the shared STATUS/task-board
updates.
