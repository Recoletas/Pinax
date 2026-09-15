# Service ownership and lifecycle

`src/services` contains business contracts and side-effect owners. Route pages
may call these modules, but services must not import route pages or Vue UI.

## Stable domains

| Directory | Owner boundary |
| --- | --- |
| `agents/` | evidence, session, model runtime and adoption contracts |
| `authoring/` | pure Authoring projections and commands |
| `canvas/` | canvas geometry, scene-board projection and durable canvas document |
| `collaboration/` | collaboration protocol and transports |
| `experience/` | legacy Experience sessions, turn transaction and runtime projections |
| `media/` | media metadata, binary references and generation adapters |
| `notes/` | note/material text and illustration presentation |
| `storage/` | storage adapters and the shared durable mutation result |
| `workspace/` | tabs, route snapshots and project navigation context |
| `worldbook/` | low-fan-in worldbook creation, research, maintenance and source parsing |
| `writing/` | manuscript schema, repositories, history and editor-neutral transforms |

Root-level files are retained only when they are genuinely cross-domain or
still have high fan-in. New root files are not allowed without updating
`docs/engineering/current-architecture.md`.

## Lifecycle classes

| Class | Meaning | Current modules / exit condition |
| --- | --- | --- |
| `production` | Used by a shipped route or a production owner | All stable-domain modules unless listed below |
| `migration` | Reads or translates persisted legacy data; no new features | `migration/legacyMigrationBundle.js`; `migration/playableWorldEntry.js` may be removed after public builds no longer contain `playable_world_entry_intent_v1` and the migration window is documented closed |
| `experimental` | Contract is kept for evaluation and tests, not a shipped route | `experimental/promptBuilder.js` and `experimental/memoryReceipt.js`; promotion requires a production consumer and an owner decision, retirement removes module and assertions together |
| `compatibility` | Production adapter for an explicitly supported older surface | `agents/legacyAdapter.js`, `collaboration/experienceV1Compatibility.js`; removal requires the corresponding Experience/collaboration compatibility gate to close |
| `retire` | No production, migration or experimental responsibility | `markdownWrap.js` was removed on 2026-09-15 after the import graph showed zero consumers |

Tests may verify migration and experimental contracts, but a test import alone
does not promote a module to production. Production code must not import from
`experimental/`; CI/build imports are the audit boundary.

## Mutation rules

- Durable owners return `{ ok, reason, retryable }` and domain payloads.
- Multi-key writes capture the previous durable state and restore it after a
  partial failure. A UI must not clear drafts or selection until `ok === true`.
- Compatibility methods may preserve old exception/payload behavior, but must
  delegate to the durable owner rather than implementing another write path.
- Cross-domain transactions state which part committed when full atomicity is
  impossible; they never infer success from a write followed by a read.
