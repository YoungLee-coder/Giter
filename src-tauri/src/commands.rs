use crate::git::{
    self, BatchProgress, BatchResult, GithubPublishInfo, HunkLineInput, RefreshResult,
    RemoteRename, RemovedRepo, RepoDetail, RepoStatus,
};
use crate::scan;
use crate::settings::{self, AppInfo, AppSettings};
use crate::store::{self, RepoEntry};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{Mutex, Semaphore};

pub struct AppState {
    pub batch_running: Mutex<bool>,
    pub repo_locks: RepoLocks,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            batch_running: Mutex::new(false),
            repo_locks: RepoLocks::default(),
        }
    }
}

/// Per-repository serialization for commands that touch one working tree.
///
/// Requests queue behind the in-flight command for the same path instead of
/// failing fast, so the several `useQuery` calls that fire when a workspace
/// opens (`workspace_snapshot`, `repo_refs`, …) all wait their turn rather than
/// making the loser pay a client-side retry backoff.
#[derive(Default)]
pub struct RepoLocks {
    locks: Mutex<HashMap<String, Arc<Mutex<()>>>>,
}

impl RepoLocks {
    /// Waits until `path` is free, then returns its guard. The `Arc` keeps the
    /// entry alive while waiters hold it, so [`Self::release`] can drop the map
    /// entry safely when nobody is left.
    async fn acquire(&self, path: &str) -> tokio::sync::OwnedMutexGuard<()> {
        let lock = {
            let mut locks = self.locks.lock().await;
            locks.entry(path.to_string()).or_default().clone()
        };
        lock.lock_owned().await
    }

    async fn release(&self, path: &str) {
        let mut locks = self.locks.lock().await;
        let idle = locks
            .get(path)
            .is_some_and(|lock| Arc::strong_count(lock) <= 2);
        if idle {
            locks.remove(path);
        }
    }

    /// Number of repos with a claim in flight. Test-only.
    #[cfg(test)]
    async fn active(&self) -> usize {
        self.locks.lock().await.len()
    }
}

async fn run_blocking<T, F>(label: &str, f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| format!("{label} join error: {e}"))?
}

async fn status_many(app: &AppHandle, paths: Vec<String>) -> Result<Vec<RepoStatus>, String> {
    if paths.is_empty() {
        return Ok(Vec::new());
    }

    let order = paths.clone();
    let concurrency = settings::load(app)?.concurrency.max(1) as usize;
    let semaphore = Arc::new(Semaphore::new(concurrency));
    let mut handles = Vec::with_capacity(paths.len());

    for path in paths {
        let permit = semaphore
            .clone()
            .acquire_owned()
            .await
            .map_err(|e| format!("semaphore error: {e}"))?;
        handles.push(tokio::spawn(async move {
            let _permit = permit;
            tokio::task::spawn_blocking(move || git::status(&path))
                .await
                .map_err(|e| format!("status join error: {e}"))
        }));
    }

    let mut repos = Vec::with_capacity(handles.len());
    for handle in handles {
        match handle.await {
            Ok(Ok(status)) => repos.push(status),
            Ok(Err(e)) => return Err(e),
            Err(e) => return Err(format!("status join error: {e}")),
        }
    }

    let index: std::collections::HashMap<&str, usize> = order
        .iter()
        .enumerate()
        .map(|(i, path)| (path.as_str(), i))
        .collect();
    repos.sort_by_key(|r| index.get(r.path.as_str()).copied().unwrap_or(usize::MAX));
    Ok(repos)
}

#[tauri::command]
pub async fn check_git() -> bool {
    tokio::task::spawn_blocking(git::git_available)
        .await
        .unwrap_or(false)
}

#[tauri::command]
pub async fn list_repos(app: AppHandle) -> Result<Vec<RepoStatus>, String> {
    let app_store = app.clone();
    let paths = tokio::task::spawn_blocking(move || {
        let store = store::load(&app_store)?;
        Ok::<_, String>(
            store
                .repos
                .iter()
                .map(|r| r.path.clone())
                .collect::<Vec<_>>(),
        )
    })
    .await
    .map_err(|e| format!("list join error: {e}"))??;

    status_many(&app, paths).await
}

#[tauri::command]
pub async fn add_repo(app: AppHandle, path: String) -> Result<RepoStatus, String> {
    run_blocking("add_repo", move || {
        let path = store::normalize_path(&path)?;
        if !store::is_git_repo(&path) {
            return Err(format!("Not a git repository: {path}"));
        }

        let mut store = store::load(&app)?;
        if store.repos.iter().any(|r| r.path == path) {
            return Ok(git::status(&path));
        }
        store.repos.push(RepoEntry { path: path.clone() });
        store::save(&app, &store)?;
        Ok(git::status(&path))
    })
    .await
}

#[tauri::command]
pub async fn remove_repo(app: AppHandle, path: String) -> Result<(), String> {
    remove_repos(app, vec![path]).await
}

#[tauri::command]
pub async fn remove_repos(app: AppHandle, paths: Vec<String>) -> Result<(), String> {
    run_blocking("remove_repos", move || {
        if paths.is_empty() {
            return Ok(());
        }
        let remove: HashSet<String> = paths.into_iter().collect();
        for path in &remove {
            git::forget_remote_provider(path);
            git::forget_pending_renames(path);
        }
        let mut store = store::load(&app)?;
        store.repos.retain(|r| !remove.contains(&r.path));
        store::save(&app, &store)
    })
    .await
}

#[tauri::command]
pub async fn reorder_repos(app: AppHandle, paths: Vec<String>) -> Result<(), String> {
    run_blocking("reorder_repos", move || {
        let mut store = store::load(&app)?;
        if paths.len() != store.repos.len() {
            return Err("Path count mismatch".into());
        }

        let existing: HashSet<String> = store.repos.iter().map(|r| r.path.clone()).collect();
        let mut seen = HashSet::new();
        for path in &paths {
            if !existing.contains(path) {
                return Err(format!("Unknown path: {path}"));
            }
            if !seen.insert(path.clone()) {
                return Err(format!("Duplicate path: {path}"));
            }
        }

        store.repos = paths.into_iter().map(|path| RepoEntry { path }).collect();
        store::save(&app, &store)
    })
    .await
}

#[tauri::command]
pub async fn refresh_status(
    paths: Option<Vec<String>>,
    app: AppHandle,
) -> Result<RefreshResult, String> {
    let app_store = app.clone();
    let prepared = tokio::task::spawn_blocking(move || prepare_refresh(app_store, paths))
        .await
        .map_err(|e| format!("refresh join error: {e}"))??;

    let RefreshPrep {
        partial,
        targets,
        removed,
        removed_paths,
    } = prepared;

    let to_check: Vec<String> = targets
        .into_iter()
        .filter(|p| !removed_paths.contains(p))
        .collect();

    if to_check.is_empty() {
        return Ok(RefreshResult {
            repos: Vec::new(),
            removed,
            remote_renames: Vec::new(),
        });
    }

    let order = to_check.clone();
    let concurrency = settings::load(&app)?.concurrency.max(1) as usize;
    let semaphore = Arc::new(Semaphore::new(concurrency));
    let mut handles = Vec::with_capacity(to_check.len());

    for path in to_check {
        let permit = semaphore
            .clone()
            .acquire_owned()
            .await
            .map_err(|e| format!("semaphore error: {e}"))?;
        let app2 = app.clone();
        handles.push(tokio::spawn(async move {
            let _permit = permit;
            // Emit start only — skip "done" to cut IPC traffic; UI clears on invoke return.
            let _ = app2.emit(
                "batch-progress",
                BatchProgress {
                    path: path.clone(),
                    stage: "refreshing".into(),
                    message: None,
                },
            );

            tokio::task::spawn_blocking(move || git::status_fresh(&path))
                .await
                .map_err(|e| format!("status join error: {e}"))
        }));
    }

    let mut repos = Vec::with_capacity(handles.len());
    for handle in handles {
        match handle.await {
            Ok(Ok(status)) => repos.push(status),
            Ok(Err(e)) => return Err(e),
            Err(e) => return Err(format!("refresh join error: {e}")),
        }
    }

    if !partial {
        let index: std::collections::HashMap<&str, usize> = order
            .iter()
            .enumerate()
            .map(|(i, path)| (path.as_str(), i))
            .collect();
        repos.sort_by_key(|r| index.get(r.path.as_str()).copied().unwrap_or(usize::MAX));
    }

    Ok(RefreshResult {
        repos,
        removed,
        // Refresh stays offline; surface renames an earlier fetch already found.
        remote_renames: git::pending_renames_for(&order),
    })
}

struct RefreshPrep {
    partial: bool,
    targets: Vec<String>,
    removed: Vec<RemovedRepo>,
    removed_paths: HashSet<String>,
}

fn prepare_refresh(app: AppHandle, paths: Option<Vec<String>>) -> Result<RefreshPrep, String> {
    let mut store = store::load(&app)?;
    let partial = paths.as_ref().map(|p| !p.is_empty()).unwrap_or(false);
    let targets: Vec<String> = if partial {
        paths.unwrap()
    } else {
        store.repos.iter().map(|r| r.path.clone()).collect()
    };

    let mut removed = Vec::new();
    let mut removed_paths = HashSet::new();

    for path in &targets {
        if !store::is_git_repo(path) {
            removed_paths.insert(path.clone());
            removed.push(RemovedRepo {
                path: path.clone(),
                name: git::repo_name(path),
            });
        }
    }

    if !removed_paths.is_empty() {
        for path in &removed_paths {
            git::forget_remote_provider(path);
            git::forget_pending_renames(path);
        }
        store.repos.retain(|r| !removed_paths.contains(&r.path));
        store::save(&app, &store)?;
    }

    Ok(RefreshPrep {
        partial,
        targets,
        removed,
        removed_paths,
    })
}

#[tauri::command]
pub async fn scan_folder(
    app: AppHandle,
    path: String,
    max_depth: Option<u32>,
) -> Result<Vec<RepoStatus>, String> {
    let app_scan = app.clone();
    let added_paths = tokio::task::spawn_blocking(move || {
        let depth = match max_depth {
            Some(d) => d,
            None => settings::load(&app_scan)?.scan_depth,
        };
        let found = scan::scan_folder(&path, depth)?;
        let mut store = store::load(&app_scan)?;
        let mut added = Vec::new();

        for repo_path in found {
            if store.repos.iter().any(|r| r.path == repo_path) {
                continue;
            }
            store.repos.push(RepoEntry {
                path: repo_path.clone(),
            });
            added.push(repo_path);
        }

        store::save(&app_scan, &store)?;
        Ok::<_, String>(added)
    })
    .await
    .map_err(|e| format!("scan join error: {e}"))??;

    status_many(&app, added_paths).await
}

async fn with_batch_lock<F, T>(
    state: &State<'_, AppState>,
    paths: &[String],
    f: F,
) -> Result<T, String>
where
    F: std::future::Future<Output = Result<T, String>>,
{
    {
        let mut running = state.batch_running.lock().await;
        if *running {
            return Err("A batch operation is already running".into());
        }
        *running = true;
    }
    let _guards = lock_repos(state, paths).await;
    let result = f.await;
    unlock_repos(state, paths).await;
    *state.batch_running.lock().await = false;
    result
}

async fn lock_repos(
    state: &State<'_, AppState>,
    paths: &[String],
) -> Vec<tokio::sync::OwnedMutexGuard<()>> {
    let mut guards = Vec::with_capacity(paths.len());
    for path in paths {
        guards.push(state.repo_locks.acquire(path).await);
    }
    guards
}

async fn unlock_repos(state: &State<'_, AppState>, paths: &[String]) {
    for path in paths {
        state.repo_locks.release(path).await;
    }
}

async fn with_repo_lock<F, T>(state: &State<'_, AppState>, path: &str, f: F) -> Result<T, String>
where
    F: std::future::Future<Output = Result<T, String>>,
{
    let paths = vec![path.to_string()];
    let _guards = lock_repos(state, &paths).await;
    let result = f.await;
    unlock_repos(state, &paths).await;
    result
}

#[tauri::command]
pub async fn batch_fetch(
    app: AppHandle,
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<BatchResult, String> {
    let lock_paths = paths.clone();
    with_batch_lock(&state, &lock_paths, async move {
        run_batch(app, paths, false).await
    })
    .await
}

#[tauri::command]
pub async fn batch_update(
    app: AppHandle,
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<BatchResult, String> {
    let lock_paths = paths.clone();
    with_batch_lock(&state, &lock_paths, async move {
        run_batch(app, paths, true).await
    })
    .await
}

async fn run_batch(
    app: AppHandle,
    paths: Vec<String>,
    do_update: bool,
) -> Result<BatchResult, String> {
    if !git::git_available() {
        return Err("git is not available in PATH".into());
    }
    if paths.is_empty() {
        return Ok(BatchResult {
            repos: Vec::new(),
            remote_renames: Vec::new(),
        });
    }

    let concurrency = settings::load(&app)?.concurrency.max(1) as usize;
    let semaphore = Arc::new(Semaphore::new(concurrency));
    let mut handles = Vec::with_capacity(paths.len());

    for path in paths {
        let permit = semaphore
            .clone()
            .acquire_owned()
            .await
            .map_err(|e| format!("semaphore error: {e}"))?;
        let app2 = app.clone();
        handles.push(tokio::spawn(async move {
            let _permit = permit;
            let path_for_emit = path.clone();
            let _ = app2.emit(
                "batch-progress",
                BatchProgress {
                    path: path_for_emit.clone(),
                    stage: "fetching".into(),
                    message: None,
                },
            );

            let (progress, status, renames) = tokio::task::spawn_blocking(move || {
                if do_update {
                    git::update_one(&path)
                } else {
                    let (result, renames) = git::fetch_detecting_renames(&path);
                    let progress = match result {
                        Ok(()) => BatchProgress {
                            path: path.clone(),
                            stage: "done".into(),
                            message: Some("Fetched".into()),
                        },
                        Err(err) => BatchProgress {
                            path: path.clone(),
                            stage: "error".into(),
                            message: Some(err),
                        },
                    };
                    (progress, git::status(&path), renames)
                }
            })
            .await
            .unwrap_or_else(|e| {
                (
                    BatchProgress {
                        path: path_for_emit.clone(),
                        stage: "error".into(),
                        message: Some(format!("task join error: {e}")),
                    },
                    RepoStatus {
                        path: path_for_emit.clone(),
                        name: git::repo_name(&path_for_emit),
                        branch: None,
                        upstream: None,
                        ahead: 0,
                        behind: 0,
                        dirty: false,
                        last_error: Some(format!("task join error: {e}")),
                        remote_provider: None,
                    },
                    Vec::new(),
                )
            });

            let _ = app2.emit("batch-progress", progress);
            (status, renames)
        }));
    }

    let mut repos = Vec::with_capacity(handles.len());
    let mut remote_renames: Vec<RemoteRename> = Vec::new();
    for handle in handles {
        match handle.await {
            Ok((status, renames)) => {
                repos.push(status);
                remote_renames.extend(renames);
            }
            Err(e) => {
                return Err(format!("batch join error: {e}"));
            }
        }
    }

    Ok(BatchResult {
        repos,
        remote_renames,
    })
}

#[tauri::command]
pub async fn repo_detail(path: String) -> Result<RepoDetail, String> {
    run_blocking("repo_detail", move || git::detail(&path)).await
}

#[tauri::command]
pub async fn add_remote(path: String, name: String, url: String) -> Result<RepoDetail, String> {
    run_blocking("add_remote", move || git::add_remote(&path, &name, &url)).await
}

#[tauri::command]
pub async fn apply_remote_rename(
    path: String,
    remote: String,
    url: String,
) -> Result<RepoStatus, String> {
    run_blocking("apply_remote_rename", move || {
        git::apply_remote_rename(&path, &remote, &url)
    })
    .await
}

#[tauri::command]
pub async fn dismiss_remote_rename(path: String, remote: String) -> Result<(), String> {
    run_blocking("dismiss_remote_rename", move || {
        git::dismiss_remote_rename(&path, &remote);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn github_publish_info() -> GithubPublishInfo {
    tokio::task::spawn_blocking(git::github_publish_info)
        .await
        .unwrap_or(GithubPublishInfo {
            available: false,
            login: None,
            git_protocol: None,
        })
}

#[tauri::command]
pub async fn start_github_login(protocol: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || git::start_github_login(&protocol))
        .await
        .map_err(|e| format!("start_github_login join error: {e}"))?
}

#[tauri::command]
pub async fn sync_git_identity_from_github(
    overwrite: Option<bool>,
) -> Result<git::GitIdentitySync, String> {
    let overwrite = overwrite.unwrap_or(false);
    tokio::task::spawn_blocking(move || git::sync_git_identity_from_github(overwrite))
        .await
        .map_err(|e| format!("sync_git_identity_from_github join error: {e}"))?
}

#[tauri::command]
pub async fn publish_to_github(
    path: String,
    name: String,
    private: bool,
) -> Result<RepoDetail, String> {
    tokio::task::spawn_blocking(move || git::publish_to_github(&path, &name, private))
        .await
        .map_err(|e| format!("publish join error: {e}"))?
}

#[tauri::command]
pub fn set_settings_menu_label(app: AppHandle, label: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        crate::menu::set_settings_label(&app, &label)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, label);
        Ok(())
    }
}

#[tauri::command]
pub async fn get_settings(app: AppHandle) -> Result<AppSettings, String> {
    run_blocking("get_settings", move || settings::load(&app)).await
}

#[tauri::command]
pub async fn update_settings(app: AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    run_blocking("update_settings", move || {
        let sanitized = settings.sanitize();
        crate::settings::save(&app, &sanitized)?;
        Ok(sanitized)
    })
    .await
}

#[tauri::command]
pub async fn get_app_info(app: AppHandle) -> Result<AppInfo, String> {
    let name = app.package_info().name.clone();
    let version = app.package_info().version.to_string();
    let git_available = tokio::task::spawn_blocking(git::git_available)
        .await
        .unwrap_or(false);
    Ok(AppInfo {
        name,
        version,
        git_available,
    })
}

#[tauri::command]
pub async fn get_git_info() -> git::GitInfo {
    tokio::task::spawn_blocking(git::git_info)
        .await
        .unwrap_or_else(|_| git::GitInfo::unavailable())
}

#[tauri::command]
pub async fn set_git_identity_field(field: String, value: String) -> Result<git::GitInfo, String> {
    tokio::task::spawn_blocking(move || git::set_git_identity_field(&field, &value))
        .await
        .map_err(|e| format!("set_git_identity_field join error: {e}"))?
}

#[tauri::command]
pub async fn set_git_config_field(field: String, value: String) -> Result<git::GitInfo, String> {
    tokio::task::spawn_blocking(move || git::set_git_config_field(&field, &value))
        .await
        .map_err(|e| format!("set_git_config_field join error: {e}"))?
}

fn store_add_path(app: &AppHandle, path: String) -> Result<RepoStatus, String> {
    let path = store::normalize_path(&path)?;
    if !store::is_git_repo(&path) {
        return Err(format!("Not a git repository: {path}"));
    }
    let mut store = store::load(app)?;
    if !store.repos.iter().any(|r| r.path == path) {
        store.repos.push(RepoEntry { path: path.clone() });
        store::save(app, &store)?;
    }
    Ok(git::status(&path))
}

#[tauri::command]
pub async fn clone_repo(app: AppHandle, url: String, dest: String) -> Result<RepoStatus, String> {
    run_blocking("clone_repo", move || {
        let path = git::clone_repo(&url, &dest)?;
        store_add_path(&app, path)
    })
    .await
}

#[tauri::command]
pub async fn init_repo(app: AppHandle, path: String) -> Result<RepoStatus, String> {
    run_blocking("init_repo", move || {
        let path = git::init_repo(&path)?;
        store_add_path(&app, path)
    })
    .await
}

#[tauri::command]
pub async fn workspace_snapshot(
    state: State<'_, AppState>,
    path: String,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("workspace_snapshot", move || git::workspace_snapshot(&path)).await
    })
    .await
}

#[tauri::command]
pub async fn repo_refs(state: State<'_, AppState>, path: String) -> Result<git::RepoRefs, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("repo_refs", move || git::repo_refs(&path)).await
    })
    .await
}

#[tauri::command]
pub async fn commits_page(
    path: String,
    skip: Option<u32>,
    limit: Option<u32>,
    search: Option<String>,
) -> Result<Vec<git::CommitInfo>, String> {
    run_blocking("commits_page", move || {
        git::commits_page(
            &path,
            skip.unwrap_or(0),
            limit.unwrap_or(50),
            search.as_deref(),
        )
    })
    .await
}

#[tauri::command]
pub async fn file_diff(
    path: String,
    file_path: String,
    staged: Option<bool>,
) -> Result<git::FileDiff, String> {
    run_blocking("file_diff", move || {
        git::file_diff(&path, &file_path, staged.unwrap_or(false))
    })
    .await
}

#[tauri::command]
pub async fn stage_paths(
    state: State<'_, AppState>,
    path: String,
    files: Vec<String>,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("stage_paths", move || git::stage_paths(&path, &files)).await
    })
    .await
}

#[tauri::command]
pub async fn unstage_paths(
    state: State<'_, AppState>,
    path: String,
    files: Vec<String>,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("unstage_paths", move || git::unstage_paths(&path, &files)).await
    })
    .await
}

#[tauri::command]
pub async fn discard_paths(
    state: State<'_, AppState>,
    path: String,
    files: Vec<String>,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("discard_paths", move || git::discard_paths(&path, &files)).await
    })
    .await
}

#[tauri::command]
pub async fn commit_repo(
    state: State<'_, AppState>,
    path: String,
    message: String,
    amend: Option<bool>,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("commit_repo", move || {
            git::commit(&path, &message, amend.unwrap_or(false))
        })
        .await
    })
    .await
}

#[tauri::command]
pub async fn push_repo(
    state: State<'_, AppState>,
    path: String,
    force_with_lease: Option<bool>,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("push_repo", move || {
            git::push_repo(&path, force_with_lease.unwrap_or(false))
        })
        .await
    })
    .await
}

#[tauri::command]
pub async fn pull_repo(
    state: State<'_, AppState>,
    path: String,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("pull_repo", move || git::pull_ff(&path)).await
    })
    .await
}

#[tauri::command]
pub async fn fetch_repo(
    state: State<'_, AppState>,
    path: String,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("fetch_repo", move || git::fetch_repo(&path)).await
    })
    .await
}

#[tauri::command]
pub async fn apply_hunk(
    state: State<'_, AppState>,
    path: String,
    file_path: String,
    file_header: String,
    hunk_header: String,
    lines: Vec<HunkLineInput>,
    reverse: Option<bool>,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("apply_hunk", move || {
            git::apply_hunk(
                &path,
                &file_path,
                &file_header,
                &hunk_header,
                &lines,
                reverse.unwrap_or(false),
            )
        })
        .await
    })
    .await
}

#[tauri::command]
pub async fn create_branch(
    state: State<'_, AppState>,
    path: String,
    name: String,
    checkout: Option<bool>,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("create_branch", move || {
            git::create_branch(&path, &name, checkout.unwrap_or(true))
        })
        .await
    })
    .await
}

#[tauri::command]
pub async fn checkout_ref(
    state: State<'_, AppState>,
    path: String,
    name: String,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("checkout_ref", move || git::checkout_ref(&path, &name)).await
    })
    .await
}

#[tauri::command]
pub async fn rename_branch(
    state: State<'_, AppState>,
    path: String,
    from: String,
    to: String,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("rename_branch", move || {
            git::rename_branch(&path, &from, &to)
        })
        .await
    })
    .await
}

#[tauri::command]
pub async fn delete_branch(
    state: State<'_, AppState>,
    path: String,
    name: String,
    force: Option<bool>,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("delete_branch", move || {
            git::delete_branch(&path, &name, force.unwrap_or(false))
        })
        .await
    })
    .await
}

#[tauri::command]
pub async fn set_upstream(
    state: State<'_, AppState>,
    path: String,
    branch: String,
    upstream: String,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("set_upstream", move || {
            git::set_upstream(&path, &branch, &upstream)
        })
        .await
    })
    .await
}

#[tauri::command]
pub async fn create_tag(
    state: State<'_, AppState>,
    path: String,
    name: String,
    message: Option<String>,
    target: Option<String>,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("create_tag", move || {
            git::create_tag(&path, &name, message.as_deref(), target.as_deref())
        })
        .await
    })
    .await
}

#[tauri::command]
pub async fn delete_tag(
    state: State<'_, AppState>,
    path: String,
    name: String,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("delete_tag", move || git::delete_tag(&path, &name)).await
    })
    .await
}

#[tauri::command]
pub async fn push_tags(
    state: State<'_, AppState>,
    path: String,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("push_tags", move || git::push_tags(&path)).await
    })
    .await
}

#[tauri::command]
pub async fn merge_ref(
    state: State<'_, AppState>,
    path: String,
    name: String,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("merge_ref", move || git::merge_ref(&path, &name)).await
    })
    .await
}

#[tauri::command]
pub async fn rebase_onto(
    state: State<'_, AppState>,
    path: String,
    onto: String,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("rebase_onto", move || git::rebase_onto(&path, &onto)).await
    })
    .await
}

#[tauri::command]
pub async fn stash_push(
    state: State<'_, AppState>,
    path: String,
    message: Option<String>,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("stash_push", move || {
            git::stash_push(&path, message.as_deref())
        })
        .await
    })
    .await
}

#[tauri::command]
pub async fn stash_apply(
    state: State<'_, AppState>,
    path: String,
    selector: String,
    pop: Option<bool>,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("stash_apply", move || {
            if pop.unwrap_or(false) {
                git::stash_pop(&path, &selector)
            } else {
                git::stash_apply(&path, &selector)
            }
        })
        .await
    })
    .await
}

#[tauri::command]
pub async fn stash_drop(
    state: State<'_, AppState>,
    path: String,
    selector: String,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("stash_drop", move || git::stash_drop(&path, &selector)).await
    })
    .await
}

#[tauri::command]
pub async fn conflict_take(
    state: State<'_, AppState>,
    path: String,
    file_path: String,
    side: String,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("conflict_take", move || {
            git::conflict_take(&path, &file_path, &side)
        })
        .await
    })
    .await
}

#[tauri::command]
pub async fn mark_resolved(
    state: State<'_, AppState>,
    path: String,
    file_path: String,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("mark_resolved", move || {
            git::mark_resolved(&path, &file_path)
        })
        .await
    })
    .await
}

#[tauri::command]
pub async fn continue_operation(
    state: State<'_, AppState>,
    path: String,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("continue_operation", move || git::continue_operation(&path)).await
    })
    .await
}

#[tauri::command]
pub async fn abort_operation(
    state: State<'_, AppState>,
    path: String,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("abort_operation", move || git::abort_operation(&path)).await
    })
    .await
}

#[tauri::command]
pub async fn file_history(
    path: String,
    file_path: String,
    skip: Option<u32>,
    limit: Option<u32>,
) -> Result<Vec<git::CommitInfo>, String> {
    run_blocking("file_history", move || {
        git::file_history(&path, &file_path, skip.unwrap_or(0), limit.unwrap_or(50))
    })
    .await
}

#[tauri::command]
pub async fn blame_file(path: String, file_path: String) -> Result<Vec<git::BlameLine>, String> {
    run_blocking("blame_file", move || git::blame_file(&path, &file_path)).await
}

#[tauri::command]
pub async fn commit_patch(
    path: String,
    from: String,
    to: String,
) -> Result<git::CommitDiff, String> {
    run_blocking("commit_patch", move || git::commit_patch(&path, &from, &to)).await
}

#[tauri::command]
pub async fn cherry_pick(
    state: State<'_, AppState>,
    path: String,
    hash: String,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("cherry_pick", move || git::cherry_pick(&path, &hash)).await
    })
    .await
}

#[tauri::command]
pub async fn revert_commit(
    state: State<'_, AppState>,
    path: String,
    hash: String,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("revert_commit", move || git::revert_commit(&path, &hash)).await
    })
    .await
}

#[tauri::command]
pub async fn reset_to(
    state: State<'_, AppState>,
    path: String,
    hash: String,
    mode: String,
) -> Result<git::WorkspaceSnapshot, String> {
    let lock_path = path.clone();
    with_repo_lock(&state, &lock_path, async move {
        run_blocking("reset_to", move || git::reset_to(&path, &hash, &mode)).await
    })
    .await
}

#[cfg(test)]
mod repo_lock_tests {
    use super::*;

    fn repo(path: &str) -> String {
        path.to_string()
    }

    #[tokio::test]
    async fn same_repo_requests_queue_instead_of_failing() {
        let state = AppState::default();
        let locks = &state.repo_locks;
        let path = repo("/tmp/queued");

        let first = locks.acquire(&path).await;
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(50), locks.acquire(&path))
                .await
                .is_err(),
            "second claim must wait for the first instead of failing"
        );

        drop(first);
        let second = tokio::time::timeout(
            std::time::Duration::from_millis(500),
            locks.acquire(&path),
        )
        .await
        .expect("second claim should be granted once the first is released");
        drop(second);

        locks.release(&path).await;
        locks.release(&path).await;
        assert_eq!(locks.active().await, 0, "idle repos are dropped again");
    }

    #[tokio::test]
    async fn different_repos_do_not_block_each_other() {
        let state = AppState::default();
        let locks = &state.repo_locks;

        let a = locks.acquire(&repo("/tmp/a")).await;
        let b = tokio::time::timeout(
            std::time::Duration::from_millis(200),
            locks.acquire(&repo("/tmp/b")),
        )
        .await
        .expect("a busy repo must not hold up another repo");
        drop(a);
        drop(b);
    }
}
