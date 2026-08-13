# Changelog

All notable changes to this project are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/), and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.5.1] - 2026-08-13

### Changed

- Repo git status no longer refreshes on window focus; use Refresh, add, scan, or batch operations
- Cache remote-provider and `git` executable path to avoid extra subprocesses
- Windows: watch OS theme via the registry instead of polling; macOS: suspend the webview when the window is in the background
- Use opaque window chrome (no backdrop blur) and drop detail-modal data after close
- Generate GitHub Release notes from CHANGELOG plus per-platform download links

## [0.5.0] - 2026-08-13

### Added

- Commit graph in repo detail, with branch/tag/HEAD labels on recent history
- Settings → Git: edit global defaults (`init.defaultBranch`, `core.autocrlf`, `fetch.prune`, `pull.ff`, `push.default`, `color.ui`) with visual legends
- Apply GitHub name and email to local `user.name` / `user.email`
- Shared AI project knowledge (`.ai/`) and agent entry files for Claude Code, Cursor, and opencode

### Changed

- Refresh shadcn/ui primitives and repo-detail / settings layout

## [0.4.0] - 2026-08-12

### Added

- Full-page settings view replacing the modal, with General, Scanning, Git, and About tabs
- Windows 11 native title bar theming synced with app light/dark mode
- Git info section in settings (version, user, protocol, publish status)
- Async `spawn_blocking` wrappers for git and store commands to keep the UI responsive

### Changed

- Theme resolution uses OS dark-mode detection on Windows instead of WebView2 `prefers-color-scheme`
- Upgrade framer-motion, i18next, vitest, and other dependencies
- Release CI pins Node 24 and pnpm/action-setup v5

## [0.3.0] - 2026-08-11

### Added

- Remote provider detection (GitHub, GitLab, Bitbucket, Gitea, Codeberg, Azure DevOps) with icons on repo cards
- TanStack Query for repo and settings data; Sonner toasts for operation feedback
- i18next with JSON locale files (replacing the custom i18n module)
- Zod-validated settings schema with Vitest unit tests
- Drag-and-drop repo reordering via `@dnd-kit`
- Prettier formatting scripts

### Changed

- Replace Zustand stores with React hooks and `AppUiProvider` context
- Migrate package manager from npm to pnpm; release CI installs with pnpm
- Refactor settings modal with `react-hook-form`

### Removed

- Zustand dependency and store modules
- Custom i18n core/types and TypeScript locale modules

## [0.2.0] - 2026-08-10

### Added

- Rebuild the UI on Tailwind CSS, shadcn/ui, and Zustand stores (theme switch, virtualized repo grid, shared motion tokens)
- Parallel `list_repos` / batch status refresh with the configured concurrency limit
- Settings sections for Appearance, Scanning, and System; About links to GitHub and Releases

### Changed

- Align UI motion with mainstream practice: press scale feedback, ease-out curves, longer overlay/popover timings, and broader `prefers-reduced-motion` coverage
- Keep dialog enter/exit opacity-only (no scale/slide) so soft-shadow panels stay smooth on WebKit / Tauri
- Rename the app binary to `Giter` (`mainBinaryName`)

### Fixed

- Include macOS `app` bundle target so updater artifacts (`darwin-aarch64` / `darwin-x86_64`) are published to `latest.json`

## [0.1.2] - 2026-08-10

### Added

- In-app updates via the official Tauri updater (GitHub Releases `latest.json`)
- Settings → About: check for updates, download, install, and relaunch
- Startup check (at most once per day) with a dismissible banner when a newer version is available

## [0.1.1] - 2026-08-10

### Fixed

- Grant workflow-level `contents: write` so GitHub Releases can be created
- Bump `actions/checkout` and `actions/setup-node` to Node.js 24 runtimes

## [0.1.0] - 2026-08-10

### Added

- First public release of Giter, a desktop app for managing local Git repositories
- Add or scan repos, then batch **Fetch** or **Update** (`fetch` → `pull --ff-only`)
- Parallel jobs with per-repo progress; dirty trees / missing upstreams / non-FF are skipped with a reason
- Repo detail: remotes, recent commits, working-tree changes, reveal in Finder/Explorer
- EN / 中文 UI; light, dark, or system theme
- macOS (Apple Silicon / Intel) and Windows installers
