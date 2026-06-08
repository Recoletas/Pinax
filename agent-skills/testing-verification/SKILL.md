---
name: testing-verification
description: Use when about to claim any code or documentation task done - requires running verification commands and confirming output before making any success claims
---

# testing-verification

Pre-claim guardrail. Evidence before assertions, always.

1. Run `npm run test:run` and confirm exit code 0. Capture the output line count if relevant.
2. Run `npm run build` and confirm exit code 0.
3. If UI changed, run the visual snapshot tests (`npm run test:run -- src/__tests__/visual-verification.test.js`) and confirm no unintended diff.
4. State the verification commands and their results in the completion message — paste the exit codes, not a vague "tests pass".
5. If any check fails, do not claim completion. Either fix the failure or report the failure to the user with the exact error.
