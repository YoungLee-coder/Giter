# Giter

桌面端本地 Git 客户端（macOS / Windows）。首页是多仓库舱队仪表盘：添加、扫描、批量 Fetch / 快进 Update。点进仓库进入单仓库工作区，做日常 Git（暂存提交、分支、历史、merge / rebase / stash、冲突解决）。走系统 `git`（GitHub 相关操作用 `gh`），不内嵌 git 实现。

## 双车道

- **舱队车道（仪表盘批量栏）**：只做 `fetch --all --prune` 与 `pull --ff-only`。工作区脏、无上游、无法快进则跳过并给出原因。批量路径永不 stash / merge / rebase / reset / clean。
- **工作区车道（用户主动打开的单个仓库）**：允许用户发起的写入。破坏性操作必须确认；禁止 `push --force`（无 `--force-with-lease`）、`clean -fd`、交互式 `rebase -i`。

「移除」只删应用数据目录里 `repos.json` 的列表项，永不删磁盘上的仓库目录。

## Language

用中文（zh-CN）回复。代码、标识符、命令保持原样。

## Persistent memory

跨会话应保留的共享事实写在 `.ai/`（不要写进 `AGENTS.md` 或 `CLAUDE.md`）。用 `/giter-remember` 或说「记住这个」来增改。Agent 发现稳定约定时应提议写入，确认后再改文件。
