# Development Workflow

## Commands

```bash
pnpm install
pnpm tauri dev
pnpm tauri build
pnpm typecheck
pnpm format
pnpm format:check
pnpm test:unit
pnpm exec vitest run tests/settingsSchema.test.ts
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml git::tests::parses_branch_ahead_behind_and_dirty -- --nocapture
```

需要 Node 18+、Rust stable、PATH 上的 Git，以及 [Tauri 2 平台依赖](https://v2.tauri.app/start/prerequisites/)。发布签名用仓库 Secrets，不要本地提交私钥。

## Verification

- 前端 UI / hooks / i18n：`pnpm typecheck` + `pnpm test:unit`。
- 仅样式/格式：`pnpm format:check`。
- Rust git/store/scan/commands：`cargo test --manifest-path src-tauri/Cargo.toml`。
- 改 IPC 类型：同时改 `src-tauri` 结构体与 `src/lib/tauri.ts`，再跑 typecheck + cargo test。
- 文档-only：核对 README 命令与链接。

## Release

- 触发：`main` 上 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 任一变更；或 `workflow_dispatch`。三处 version 必须相同，否则 CI 失败。
- Tag：`v{version}`（如 `v0.4.0`）。已存在则跳过。
- 必须在 `CHANGELOG.md` 有 `## [{version}]` 段（Keep a Changelog）。
- 产物：macOS aarch64/x86_64 `.dmg`，Windows NSIS + MSI；另上传签名 updater 包与 `latest.json`。
- Secrets：`TAURI_SIGNING_PRIVATE_KEY` 必填；`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 可选。公钥在 `tauri.conf.json`。切勿提交 `.tauri-keys/`。
