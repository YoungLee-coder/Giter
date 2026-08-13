# Testing Strategy

前端：Vitest + Testing Library + jsdom。`pnpm test:unit`；单文件：`pnpm exec vitest run tests/settingsSchema.test.ts`。配置在 `vitest.config.ts`，setup 为 `tests/setupTests.ts`。

Rust：`cargo test --manifest-path src-tauri/Cargo.toml`。单测示例：`cargo test --manifest-path src-tauri/Cargo.toml store::tests::accepts_normal_git_dir`。测试在 `git.rs`（status/provider 解析）与 `store.rs`（`.git` 合法性）。

目前没有前端组件 E2E；没有 ESLint 脚本。

## Per-change verification

- 设置 schema / queryKeys / i18n 键：`pnpm test:unit`。
- git 状态解析、远程 provider、FF-only 规则：`cargo test --manifest-path src-tauri/Cargo.toml git::`。
- 仓库根判定 / 扫描跳过规则：`cargo test --manifest-path src-tauri/Cargo.toml store::`。
- 仅 UI 文案：确认 en/zh-CN 键同步（`pnpm test:unit` 已覆盖）。
