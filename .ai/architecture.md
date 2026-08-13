# Architecture

## Repository Map

- `src/main.tsx` — 前端入口：QueryClient + AppUiProvider + App。
- `src/App.tsx` — 主界面：仓库网格、批量栏、详情弹窗、设置页切换、更新提示。
- `src/components/` — UI。`repo/` 为仓库卡片/网格/批量栏；`ui/` 为 shadcn（radix-nova）；`SettingsPage.tsx`、`RepoDetailModal.tsx` 为整页/弹窗。
- `src/hooks/` — `useRepos` / `useSettings` / `useI18n` / `useRepoDragSort`；`AppUiProvider` 管选中态、设置开关、批量进度。
- `src/lib/tauri.ts` — 唯一 IPC 封装：`api.*` 对应 Tauri commands，类型与 Rust `camelCase` serde 对齐。
- `src/lib/query/` — TanStack Query 的 `queryClient` 与 `queryKeys`。
- `src/lib/updater.ts` — 应用内更新（检查 / 下载安装 / 忽略版本）。
- `src/i18n/` — i18next；文案在 `locales/en.json` 与 `locales/zh-CN.json`，键必须同步。
- `src-tauri/src/lib.rs` — Tauri 入口：注册 plugins、commands、macOS 菜单、Windows 标题栏主题。
- `src-tauri/src/commands.rs` — IPC 命令层：并发、`spawn_blocking`、批量任务互斥。
- `src-tauri/src/git.rs` — 系统 `git` / `gh` 调用、状态解析、远程 provider、FF-only 更新、GitHub 发布。
- `src-tauri/src/store.rs` — `repos.json`（仅路径）；`is_git_repo` 校验真实 work tree。
- `src-tauri/src/scan.rs` — 浅扫描；跳过 `node_modules`/`target`/`dist`/`build`/隐藏目录；不进入嵌套仓库。
- `src-tauri/src/settings.rs` — 设置读写与 clamp（scanDepth 1–10，concurrency 1–16）。
- `src-tauri/tauri.conf.json` — 窗口、打包、updater pubkey / `latest.json` endpoint。
- `.github/workflows/release.yml` — 版本三处一致时在 `main` 上打 tag `v*` 并发布；notes 由 `.github/scripts/build-release-notes.sh` 生成（CHANGELOG + 各平台安装包直链）。
- `tests/` — Vitest（jsdom）：settings schema、queryKeys、i18n 键同步。

## Hotspot Ownership

- `src-tauri/src/git.rs` 拥有全部 git/gh CLI、状态解析、provider 检测、`update_one` 跳过规则。改动后跑 `cargo test --manifest-path src-tauri/Cargo.toml`。
- `src-tauri/src/store.rs` 拥有仓库根判定（含 `.git` 文件 / 空 stub 拒绝）。改动后跑同一 `cargo test`。
