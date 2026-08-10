# Changelog

All notable changes to this project are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/), and this project uses [Semantic Versioning](https://semver.org/).

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
