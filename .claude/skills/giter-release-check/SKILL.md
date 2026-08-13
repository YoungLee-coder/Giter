---
name: giter-release-check
description: Verify release readiness for Giter — run checks, confirm version, validate changelog. Use before release / 发布前检查 / release readiness.
---

# Release Check

Verify that Giter is ready for release. Follow the release process defined in `.ai/workflow.md` Release section.

## Steps

1. **Read release process**: check `.ai/workflow.md` for the tag convention, release workflow trigger, notes format, and pre-flight checklist.
2. **Run full test suite**: execute the test command from `.ai/workflow.md` Commands section. All tests must pass.
3. **Run lint**: execute the lint command. No errors.
4. **Check version**: verify the version number in the relevant config file (package.json, pyproject.toml, Cargo.toml, etc.) matches the expected release version.
5. **Check changelog**: verify that the changelog/release notes exist and document all significant changes since the last release.
6. **Check breaking changes**: if there are breaking changes, verify they are documented and the migration path is clear.
7. **Security scan**: if `.ai/security.md` exists, invoke the `security-auditor` subagent on changes since the last release tag.
8. **Dry run**: if the release process has a dry-run or preview command, run it.
9. **Report**: summarize the results. If any check fails, report what failed and the fix needed before release can proceed.

Confirm `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` share the same version. `CHANGELOG.md` must have `## [{version}]`. Run `pnpm typecheck`, `pnpm test:unit`, and `cargo test --manifest-path src-tauri/Cargo.toml`. Do not commit `.tauri-keys/` or signing private keys. Tag will be `v{version}` via `.github/workflows/release.yml` on `main`.
