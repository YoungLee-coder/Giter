# Coding Style & Conventions

- 前端格式化：Prettier（`.prettierrc.json`：semi、双引号、trailingComma all、printWidth 90）。命令：`pnpm format`。
- Rust：`rustfmt`。IPC 结构体用 `#[serde(rename_all = "camelCase")]`，与 `src/lib/tauri.ts` 对齐。
- 前端调后端只用 `api`（`src/lib/tauri.ts`），不要在组件里直接 `invoke`。窗口主题同步是例外：`src/lib/theme.ts` 可直接 invoke `sync_window_chrome`。跟随系统必须 `setTheme(null)`，不要强制 light/dark，否则会钉死 WebView2 PreferredColorScheme、弄脏 `matchMedia`。Windows 标题栏颜色仍走 `sync_window_chrome`。
- 样式用 `cn()`（`src/lib/utils.ts`）。UI 优先复用 `src/components/ui/`，不要新造一套 primitive。
- 仓库/设置数据走 TanStack Query，key 用 `queryKeys`（`src/lib/query/keys.ts`），不要手写字符串 key。
- 用户可见文案走 i18next。改文案必须同时改 `en.json` 与 `zh-CN.json`（测试会断言键集合一致）。后端进度英文消息在 `src/i18n/messages.ts` 映射，不要只改 UI 字符串。
- 包管理只用 pnpm。版本号必须同时改 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`。
- 提交说明用中文或英文均可，写清原因；不要加 AI 署名 trailer。
