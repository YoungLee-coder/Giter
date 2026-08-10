# Changelog

All notable changes to this project are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/), and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
