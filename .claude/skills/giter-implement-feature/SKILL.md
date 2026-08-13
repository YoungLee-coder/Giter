---
name: giter-implement-feature
description: Implement a new feature in Giter, following project conventions from .ai/ files. Use when asked to add a feature / implement something / build X.
---

# Implement Feature

Implement a new feature following the conventions defined in `.ai/`:

1. **Read project context**: `.ai/project.md` (what this is), `.ai/architecture.md` (where things go), `.ai/coding-style.md` (how to write), `.ai/workflow.md` (commands and verification).
2. **Plan the change**: identify which files to modify, which layers are involved, which conventions apply.
3. **Implement**: write the code following `.ai/coding-style.md` conventions. Use the helpers and patterns documented there, not raw alternatives.
4. **Verify**: run the commands from `.ai/workflow.md` Verification section for the change type you made. If there are tests in `.ai/testing.md` for the area you touched, run those too.
5. **Review**: if the change is non-trivial, invoke the code-reviewer and/or architect subagent before considering it done.
6. **Memory**: if you discovered a stable convention or gotcha missing from `.ai/`, propose saving it (confirm before writing — see `/giter-remember`).

New IPC: add the command in `src-tauri/src/commands.rs`, register it in `src-tauri/src/lib.rs`, and expose it on `api` in `src/lib/tauri.ts` with matching camelCase types. User-facing copy must land in both `src/i18n/locales/en.json` and `zh-CN.json`. Git work stays in `git.rs` — no stash / merge / rebase. Do not delete user repos on disk.
