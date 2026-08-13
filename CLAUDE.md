<!-- ai-init-version: 6 -->
# Giter — Claude Code Instructions

Project knowledge is distributed across `.ai/` (shared with opencode). Read these files before non-trivial work:

- `.ai/project.md` — project background, response language
- `.ai/architecture.md` — tech stack, repository map, entry points
- `.ai/coding-style.md` — conventions, helpers, gotchas
- `.ai/workflow.md` — commands, verification, release flow
- `.ai/testing.md` — test strategy, per-change verification
- `.ai/security.md` — safety rules, destructive-op guardrails

Claude-specific notes:
- Prefer Edit over Write for existing files. Frontend IPC goes through `api` in `src/lib/tauri.ts`; git/gh work stays in `src-tauri/src/git.rs`. Verify with `pnpm typecheck` / `pnpm test:unit` or `cargo test --manifest-path src-tauri/Cargo.toml` per `.ai/workflow.md`.
- **Persistent memory:** when you notice a stable convention, command, or gotcha missing from `.ai/`, propose saving it and ask for confirmation before writing. Use `/giter-remember` or route per `.ai/project.md` Persistent memory section.
- Put personal overrides in `CLAUDE.local.md` (gitignored).
