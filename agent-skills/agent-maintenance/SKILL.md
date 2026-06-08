---
name: agent-maintenance
description: Use when modifying AGENTS.md, CLAUDE.md, agent-skills, .agents shim, .claude shim, or docs/STATUS.md structure - keeps agent infrastructure healthy
---

# agent-maintenance

Meta-skill for agent infrastructure changes. Run when touching any of: `AGENTS.md`, `CLAUDE.md`, `agent-skills/`, `.agents/` shim, `.claude/` shim, `docs/STATUS.md` structure.

1. **Symlink integrity**: verify every `.agents/skills/<name>` and `.claude/skills/<name>` symlink target exists in `agent-skills/<name>/SKILL.md`. Run `readlink -f .agents/skills/*/SKILL.md` and `.claude/skills/*/SKILL.md` and confirm all paths point inside `agent-skills/`.
2. **Frontmatter completeness**: verify every `SKILL.md` has YAML frontmatter with `name` and `description`. No exceptions.
3. **No drift**: confirm `docs/STATUS.md` / `docs/PLAN.md` / `docs/LOG.md` reflect current behavior, not stale state.
4. **Platform-specific rules**: a new rule that applies to multiple agents should go in `AGENTS.md`. A rule that is truly Claude-Code-specific goes in `CLAUDE.md`. Do not duplicate; do not leave empty placeholder sections in either file.
5. **Renamed or removed skill**: update both the `AGENTS.md` Hard-rules table and the corresponding shim symlinks. A removed skill = remove both symlinks; a renamed skill = re-link under the new name.
