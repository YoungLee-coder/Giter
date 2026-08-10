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

#[tauri::command]
pub fn check_git() -> bool {
    git::git_available()
}

#[tauri::command]
pub fn list_repos(app: AppHandle) -> Result<Vec<RepoStatus>, String> {
    let store = store::load(&app)?;
    Ok(store.repos.iter().map(|r| git::status(&r.path)).collect())
}

#[tauri::command]
pub fn add_repo(app: AppHandle, path: String) -> Result<RepoStatus, String> {
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
}

#[tauri::command]
pub fn remove_repo(app: AppHandle, path: String) -> Result<(), String> {
    let mut store = store::load(&app)?;
    store.repos.retain(|r| r.path != path);
    store::save(&app, &store)
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
            let _ = app2.emit(
                "batch-progress",
                BatchProgress {
                    path: path.clone(),
                    stage: "refreshing".into(),
                    message: None,
                },
            );

            let path_for_status = path.clone();
            let status = tokio::task::spawn_blocking(move || git::status(&path_for_status))
                .await
                .map_err(|e| format!("status join error: {e}"))?;

            let _ = app2.emit(
                "batch-progress",
                BatchProgress {
                    path,
                    stage: "done".into(),
                    message: None,
                },
            );

            Ok::<RepoStatus, String>(status)
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
        repos.sort_by(|a, b| a.name.cmp(&b.name));
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
pub fn scan_folder(
    app: AppHandle,
    path: String,
    max_depth: Option<u32>,
) -> Result<Vec<RepoStatus>, String> {
    let depth = match max_depth {
        Some(d) => d,
        None => settings::load(&app)?.scan_depth,
    };
    let found = scan::scan_folder(&path, depth)?;
    let mut store = store::load(&app)?;
    let mut added = Vec::new();

    for repo_path in found {
        if store.repos.iter().any(|r| r.path == repo_path) {
            continue;
        }
        store.repos.push(RepoEntry {
            path: repo_path.clone(),
        });
        added.push(git::status(&repo_path));
    }

    store::save(&app, &store)?;
    Ok(added)
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
) -> Result<Vec<BatchProgress>, String> {
    with_batch_lock(&state, async { run_batch(app, paths, false).await }).await
}

#[tauri::command]
pub async fn batch_update(
    app: AppHandle,
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<Vec<BatchProgress>, String> {
    with_batch_lock(&state, async { run_batch(app, paths, true).await }).await
}

async fn run_batch(
    app: AppHandle,
    paths: Vec<String>,
    do_update: bool,
) -> Result<Vec<BatchProgress>, String> {
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

            let result = tokio::task::spawn_blocking(move || {
                if do_update {
                    match git::update_one(&path) {
                        Ok(p) | Err(p) => p,
                    }
                } else {
                    match git::fetch(&path) {
                        Ok(()) => BatchProgress {
                            path,
                            stage: "done".into(),
                            message: Some("Fetched".into()),
                        },
                        Err(err) => BatchProgress {
                            path,
                            stage: "error".into(),
                            message: Some(err),
                        },
                    }
                }
            })
            .await
            .unwrap_or_else(|e| BatchProgress {
                path: path_for_emit,
                stage: "error".into(),
                message: Some(format!("task join error: {e}")),
            });

            let _ = app2.emit("batch-progress", result.clone());
            result
        }));
    }

    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        match handle.await {
            Ok(p) => results.push(p),
            Err(e) => results.push(BatchProgress {
                path: String::new(),
                stage: "error".into(),
                message: Some(format!("join error: {e}")),
            }),
        }
    }

    Ok(results)
}

#[tauri::command]
pub fn repo_detail(path: String) -> Result<RepoDetail, String> {
    git::detail(&path)
}

#[tauri::command]
pub fn add_remote(path: String, name: String, url: String) -> Result<RepoDetail, String> {
    git::add_remote(&path, &name, &url)
}

#[tauri::command]
pub fn github_publish_info() -> GithubPublishInfo {
    git::github_publish_info()
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
pub fn get_settings(app: AppHandle) -> Result<AppSettings, String> {
    settings::load(&app)
}

#[tauri::command]
pub fn update_settings(app: AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    let sanitized = settings.sanitize();
    settings::save(&app, &sanitized)?;
    Ok(sanitized)
}

#[tauri::command]
pub fn get_app_info(app: AppHandle) -> Result<AppInfo, String> {
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        git_available: git::git_available(),
    })
}

#[tauri::command]
pub fn get_git_info() -> git::GitInfo {
    git::git_info()
}
