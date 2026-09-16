#!/usr/bin/env node

// CI entrypoint for the no-key synthetic workspace backup round trip.
// The production browser gate owns process cleanup, network isolation,
// failure injection and idempotency assertions.
await import('../authoring-ui/workspace-backup-check.mjs')
