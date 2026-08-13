---
name: giter-review-pr
description: Review a pull request for Giter using code-reviewer and security-auditor agents. Use before merging / when asked to review a PR / 看看PR.
---

# Review PR

Review a pull request against project conventions and security rules.

## Steps

1. **Get the diff**: `git diff` against the branch base, or read the PR description and changed files.
2. **Run code-reviewer**: invoke the `code-reviewer` subagent on the diff. It checks against `.ai/coding-style.md` and `.ai/workflow.md`.
3. **Run security-auditor** (if applicable): invoke the `security-auditor` subagent on the diff. It checks against `.ai/security.md`. Skip if the change is documentation-only or has no security-relevant code.
4. **Run architect** (if structural): invoke the `architect` subagent on the diff. It checks against `.ai/architecture.md`. Skip if the change is a small fix with no cross-layer impact.
5. **Synthesize**: combine the findings from all agents. Present a summary with P0/P1/P2 items and a final verdict.
6. **Verification check**: confirm the commands from `.ai/workflow.md` Verification section were run for the change types involved.

If the PR bumps version, all three of `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` must match, and `CHANGELOG.md` needs a `## [{version}]` section. Confirm `en.json` / `zh-CN.json` keys stay in sync. Flag any disk-deleting remove path or non-ff git write.
