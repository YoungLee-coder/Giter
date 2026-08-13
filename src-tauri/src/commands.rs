use crate::git::{
    self, BatchProgress, GithubPublishInfo, RefreshResult, RemovedRepo, RepoDetail, RepoStatus,
};
use crate::scan;
use crate::settings::{self, AppInfo, AppSettings};
use crate::store::{self, RepoEntry};
use std::collections::HashSet;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{Mutex, Semaphore};

pub struct AppState {
    pub batch_running: Mutex<bool>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            batch_running: Mutex::new(false),
        }
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

    Ok(RefreshResult { repos, removed })
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

async fn with_batch_lock<F, T>(state: &State<'_, AppState>, f: F) -> Result<T, String>
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
    let result = f.await;
    *state.batch_running.lock().await = false;
    result
}

#[tauri::command]
pub async fn batch_fetch(
    app: AppHandle,
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<Vec<RepoStatus>, String> {
    with_batch_lock(&state, async { run_batch(app, paths, false).await }).await
}

#[tauri::command]
pub async fn batch_update(
    app: AppHandle,
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<Vec<RepoStatus>, String> {
    with_batch_lock(&state, async { run_batch(app, paths, true).await }).await
}

async fn run_batch(
    app: AppHandle,
    paths: Vec<String>,
    do_update: bool,
) -> Result<Vec<RepoStatus>, String> {
    if !git::git_available() {
        return Err("git is not available in PATH".into());
    }
    if paths.is_empty() {
        return Ok(vec![]);
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

            let (progress, status) = tokio::task::spawn_blocking(move || {
                if do_update {
                    git::update_one(&path)
                } else {
                    match git::fetch(&path) {
                        Ok(()) => (
                            BatchProgress {
                                path: path.clone(),
                                stage: "done".into(),
                                message: Some("Fetched".into()),
                            },
                            git::status(&path),
                        ),
                        Err(err) => (
                            BatchProgress {
                                path: path.clone(),
                                stage: "error".into(),
                                message: Some(err),
                            },
                            git::status(&path),
                        ),
                    }
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
                )
            });

            let _ = app2.emit("batch-progress", progress);
            status
        }));
    }

    let mut repos = Vec::with_capacity(handles.len());
    for handle in handles {
        match handle.await {
            Ok(status) => repos.push(status),
            Err(e) => {
                return Err(format!("batch join error: {e}"));
            }
        }
    }

    Ok(repos)
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
pub async fn update_settings(app: AppHandle, next: AppSettings) -> Result<AppSettings, String> {
    run_blocking("update_settings", move || {
        let sanitized = next.sanitize();
        settings::save(&app, &sanitized)?;
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
