---
name: ui-style-check
description: Use when adding or modifying a UI component, style, interaction, or responsive layout - verifies alignment with existing component patterns, dark-mode tokens, and responsive breakpoints
---

# ui-style-check

Pre-merge guardrail for UI work. Run before claiming a UI change done.

1. Read 2-3 sibling components in the same module under `src/components/` for the local pattern (props shape, slot usage, naming).
2. Verify dark-mode tokens are used (no hard-coded colors); cross-check `src/styles/` for the canonical token names.
3. Verify responsive breakpoints match the existing components in the same view; do not introduce a new breakpoint without reason.
4. Reuse primitives in `src/components/` (button, input, modal, etc.) instead of duplicating markup.
5. If the change is behaviorally new (new state, new interaction), add or update a visual snapshot test under `src/__tests__/`.
