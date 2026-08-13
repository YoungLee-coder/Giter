# Security Boundaries

## Critical Safety Rules

- 「移除」仓库只改 `repos.json` 列表，永远不要 `rm` / 删除用户磁盘上的仓库目录。
- Update 只允许 `git fetch --all --prune` 然后在干净、有上游、behind > 0 时 `git pull --ff-only`。禁止 stash、merge、rebase、`reset --hard`、`clean -fd`。
- 只通过现有 `git.rs` 封装调用系统 `git` / `gh`，不要新造会改写历史或工作区的 git 参数。
- 扫描必须跳过 `node_modules`、`target`、`dist`、`build`、隐藏目录，且不进入嵌套仓库；`is_git_repo` 必须拒绝空 `.git` stub。
- 不要提交 updater 私钥或 `.tauri-keys/`。`TAURI_SIGNING_PRIVATE_KEY` 只存在于 CI Secrets。
- GitHub 登录/发布走系统 `gh`；不要在仓库里存 token，不要把凭据写进 `repos.json` 或设置文件。
- `repos.json` 只存路径。不要把 git 输出、token、用户邮箱写入该文件。
