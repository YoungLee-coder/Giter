# Giter

[English](#english) · [中文](#中文)

## English

Desktop app for managing local Git repositories on macOS and Windows. Add or scan repos, then batch **Fetch** or **Update** (`fetch` → `pull --ff-only`).

It shells out to your system `git`, so SSH agents, Keychain, and Credential Manager work as usual. Dirty trees, missing upstreams, and non-fast-forward cases are skipped with a visible reason. No stash, merge, or rebase automation.

### Install

[Git](https://git-scm.com/) must be on `PATH`.

Grab a build from [Releases](../../releases/latest):

| Platform | Artifact |
|----------|----------|
| macOS Apple Silicon | `.dmg` (aarch64) |
| macOS Intel | `.dmg` (x86_64) |
| Windows | NSIS (`.exe`) or MSI |

Builds are unsigned. On modern macOS the app may show as “damaged” after download because of the quarantine flag. Clear it once, then open normally:

```bash
xattr -cr /Applications/Giter.app
```

### What it does

- **Add** a folder that contains a real `.git`, or **Scan** a parent folder for repos
- **Fetch**: `git fetch --all --prune` on the selection
- **Update**: fetch, then `git pull --ff-only` only when the tree is clean, an upstream exists, and the branch is behind
- Parallel jobs (default 4, configurable 1-16) with per-repo progress
- Repo detail: remotes, recent commits, working-tree changes, reveal in Finder/Explorer
- EN / 中文 UI; light, dark, or system theme
- In-app updates: Settings → About → **Check for updates**, or a startup banner when a newer release is available

Scan depth defaults to 3 (1-10). It skips `node_modules`, `target`, `dist`, `build`, and hidden directories, and does not walk into nested repos.

The app stores paths only in `repos.json` under the app data directory. **Remove** drops the list entry; it never deletes files on disk. Invalid paths are cleaned up on refresh.

### Update rules

| Situation | Result |
|-----------|--------|
| Dirty working tree | Skipped |
| No upstream | Skipped |
| Already up to date | Skipped |
| Clean, has upstream, behind &gt; 0 | Fast-forward |
| Fetch / `pull --ff-only` failure | Error shown in the UI |

### Develop

Prerequisites: [Node.js](https://nodejs.org/) 18+, [Rust](https://rustup.rs/) stable, Git on `PATH`, and [Tauri 2 platform tooling](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

Artifacts: macOS `.dmg`; Windows NSIS / MSI. CI publishes the same when the version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` bumps on `main`. Releases also upload signed updater bundles and `latest.json` for in-app updates.

Release CI needs repository secrets `TAURI_SIGNING_PRIVATE_KEY` (required) and optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

### Stack

Tauri 2 (Rust) · Vite + React + TypeScript · system `git` CLI

---

## 中文

macOS / Windows 上管理本地 Git 仓库的桌面应用。添加或扫描仓库后，可批量 **Fetch** 或 **更新**（`fetch` → `pull --ff-only`）。

走系统里的 `git`，SSH agent、钥匙串、Credential Manager 都照常可用。工作区不干净、没有上游、无法快进时会跳过，并给出原因。不做 stash / merge / rebase。

### 安装

需要 [Git](https://git-scm.com/) 在 `PATH` 中。

从 [Releases](../../releases/latest) 下载：

| 平台 | 产物 |
|------|------|
| macOS Apple Silicon | `.dmg`（aarch64） |
| macOS Intel | `.dmg`（x86_64） |
| Windows | NSIS（`.exe`）或 MSI |

构建未签名。较新的 macOS 下载后可能提示「已损坏」，是隔离属性导致的。先清除一次，再正常打开：

```bash
xattr -cr /Applications/Giter.app
```

### 能做什么

- **添加** 含真实 `.git` 的文件夹，或 **扫描** 父目录下的仓库
- **Fetch**：对选中仓库执行 `git fetch --all --prune`
- **更新**：先 fetch，仅在工作区干净、有上游、且落后时再执行 `git pull --ff-only`
- 并行任务（默认 4，可调 1-16），每个仓库单独显示进度
- 仓库详情：远程、最近提交、工作区改动，可在 Finder / 资源管理器中显示
- 界面 EN / 中文；浅色、深色或跟随系统
- 应用内更新：设置 → 关于 → **检查更新**；启动时若有新版本会显示可关闭提示条

扫描深度默认 3（1-10）。会跳过 `node_modules`、`target`、`dist`、`build` 和隐藏目录，也不会钻进嵌套仓库。

应用只在应用数据目录的 `repos.json` 里存路径。**移除** 只删列表项，不删磁盘文件。刷新时会清掉失效路径。

### 更新规则

| 情况 | 结果 |
|------|------|
| 工作区有未提交更改 | 跳过 |
| 无上游分支 | 跳过 |
| 已是最新 | 跳过 |
| 干净、有上游、落后 &gt; 0 | 快进 |
| Fetch / `pull --ff-only` 失败 | 界面显示错误 |

### 开发

依赖：[Node.js](https://nodejs.org/) 18+、[Rust](https://rustup.rs/) stable、`PATH` 中的 Git，以及 [Tauri 2 平台工具](https://v2.tauri.app/start/prerequisites/)。

```bash
npm install
npm run tauri dev
```

### 构建

```bash
npm run tauri build
```

产物：macOS `.dmg`；Windows NSIS / MSI。当 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 三者版本一致并在 `main` 上递增时，CI 会发布同样的包。发布还会上传签名的更新包与 `latest.json`，供应用内更新使用。

发布 CI 需要仓库 Secret：`TAURI_SIGNING_PRIVATE_KEY`（必填），以及可选的 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。

### 技术栈

Tauri 2（Rust）· Vite + React + TypeScript · 系统 `git` CLI
