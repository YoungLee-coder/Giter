# Giter

桌面端本地 Git 仓库管理器（macOS / Windows）。用户添加或扫描仓库后，可批量 Fetch 或 Update。走系统 `git`（以及 GitHub 相关操作用 `gh`），不内嵌 git 实现。产品约束：只做 `fetch` 与 `pull --ff-only`；工作区脏、无上游、无法快进则跳过并给出原因；不做 stash / merge / rebase；「移除」只删应用数据目录里 `repos.json` 的列表项，永不删磁盘文件。

## Language

用中文（zh-CN）回复。代码、标识符、命令保持原样。

## Persistent memory

跨会话应保留的共享事实写在 `.ai/`（不要写进 `AGENTS.md` 或 `CLAUDE.md`）。用 `/giter-remember` 或说「记住这个」来增改。Agent 发现稳定约定时应提议写入，确认后再改文件。
