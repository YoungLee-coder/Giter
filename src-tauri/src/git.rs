use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Suppress transient console windows when spawning git/gh from a GUI process.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(windows)]
fn command_in_path(program: &str) -> Command {
    let mut cmd = Command::new(program);
    cmd.creation_flags(CREATE_NO_WINDOW);
    augment_windows_path(&mut cmd);
    cmd
}

#[cfg(not(windows))]
fn command_in_path(program: &str) -> Command {
    Command::new(program)
}

/// GUI apps on Windows often inherit a stale/reduced PATH (e.g. after installing
/// Git or GitHub CLI without restarting the app).
#[cfg(windows)]
fn augment_windows_path(cmd: &mut Command) {
    let Ok(path) = std::env::var("PATH") else {
        return;
    };

    let mut prefix = String::new();
    for dir in windows_tool_dirs() {
        let dir_str = dir.to_string_lossy();
        if dir.is_dir() && !path_contains_dir(&path, &dir_str) {
            if !prefix.is_empty() {
                prefix.push(';');
            }
            prefix.push_str(&dir_str);
        }
    }

    if prefix.is_empty() {
        return;
    }

    let _ = cmd.env("PATH", format!("{prefix};{path}"));
}

#[cfg(windows)]
fn path_contains_dir(path: &str, dir: &str) -> bool {
    path.split(';').any(|entry| entry.eq_ignore_ascii_case(dir))
}

#[cfg(windows)]
fn windows_tool_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![
        PathBuf::from(r"C:\Program Files\Git\cmd"),
        PathBuf::from(r"C:\Program Files (x86)\Git\cmd"),
        PathBuf::from(r"C:\Program Files\GitHub CLI"),
        PathBuf::from(r"C:\Program Files (x86)\GitHub CLI"),
    ];

    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        dirs.push(PathBuf::from(&local).join("GitHub CLI"));
        dirs.push(PathBuf::from(&local).join(r"Programs\GitHub CLI"));
    }
    if let Ok(pf) = std::env::var("ProgramFiles") {
        let candidate = PathBuf::from(&pf).join("GitHub CLI");
        if !dirs.iter().any(|d| d == &candidate) {
            dirs.push(candidate);
        }
    }
    if let Ok(pf86) = std::env::var("ProgramFiles(x86)") {
        let candidate = PathBuf::from(pf86).join("GitHub CLI");
        if !dirs.iter().any(|d| d == &candidate) {
            dirs.push(candidate);
        }
    }

    dirs
}

fn command_for_exe(exe: &Path) -> Command {
    #[cfg(windows)]
    {
        let mut cmd = Command::new(exe);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    }
    #[cfg(not(windows))]
    {
        Command::new(exe)
    }
}

fn git_command() -> Command {
    if let Some(exe) = resolved_git_exe() {
        return command_for_exe(exe);
    }
    command_in_path("git")
}

fn gh_command() -> Command {
    if let Some(exe) = resolved_gh_exe() {
        return command_for_exe(exe);
    }
    command_in_path("gh")
}

/// Cached absolute `git` path. Misses are not stored so a later install is picked up.
fn resolved_git_exe() -> Option<&'static Path> {
    static GIT_EXE: OnceLock<PathBuf> = OnceLock::new();
    if let Some(path) = GIT_EXE.get() {
        return Some(path.as_path());
    }
    let found = find_git_exe()?;
    Some(GIT_EXE.get_or_init(|| found).as_path())
}

fn find_git_exe() -> Option<PathBuf> {
    if let Some(path) = which_program("git") {
        return Some(path);
    }

    #[cfg(windows)]
    {
        const CANDIDATES: &[&str] = &[
            r"C:\Program Files\Git\cmd\git.exe",
            r"C:\Program Files\Git\bin\git.exe",
            r"C:\Program Files (x86)\Git\cmd\git.exe",
            r"C:\Program Files (x86)\Git\bin\git.exe",
        ];
        for candidate in CANDIDATES {
            let path = PathBuf::from(candidate);
            if path.is_file() {
                return Some(path);
            }
        }
    }

    #[cfg(not(windows))]
    {
        const CANDIDATES: &[&str] = &[
            "/opt/homebrew/bin/git",
            "/usr/local/bin/git",
            "/usr/bin/git",
        ];
        for candidate in CANDIDATES {
            let path = PathBuf::from(candidate);
            if path.is_file() {
                return Some(path);
            }
        }
    }

    None
}

/// Absolute path to `gh` when resolved from PATH or known install locations.
fn resolved_gh_exe() -> Option<&'static Path> {
    static GH_EXE: OnceLock<Option<PathBuf>> = OnceLock::new();
    GH_EXE
        .get_or_init(find_gh_exe)
        .as_ref()
        .map(|p| p.as_path())
}

fn find_gh_exe() -> Option<PathBuf> {
    if let Some(path) = which_program("gh") {
        return Some(path);
    }

    #[cfg(windows)]
    {
        for dir in windows_tool_dirs() {
            let candidate = dir.join("gh.exe");
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    #[cfg(not(windows))]
    {
        const CANDIDATES: &[&str] = &["/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/usr/bin/gh"];
        for candidate in CANDIDATES {
            let path = PathBuf::from(candidate);
            if path.is_file() {
                return Some(path);
            }
        }
    }

    None
}

fn which_program(program: &str) -> Option<PathBuf> {
    #[cfg(windows)]
    {
        let output = where_command().arg(program).output().ok()?;
        if !output.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let first = text.lines().next()?.trim();
        if first.is_empty() {
            return None;
        }
        let path = PathBuf::from(first);
        path.is_file().then_some(path)
    }

    #[cfg(not(windows))]
    {
        let output = Command::new("which").arg(program).output().ok()?;
        if !output.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let first = text.lines().next()?.trim();
        if first.is_empty() {
            return None;
        }
        let path = PathBuf::from(first);
        path.is_file().then_some(path)
    }
}

#[cfg(windows)]
fn where_command() -> Command {
    command_in_path("where")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoStatus {
    pub path: String,
    pub name: String,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub dirty: bool,
    pub last_error: Option<String>,
    /// Detected remote host provider: github, gitlab, bitbucket, gitea, codeberg, azure, other.
    /// `None` when the repo has no remotes configured.
    pub remote_provider: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemovedRepo {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshResult {
    pub repos: Vec<RepoStatus>,
    pub removed: Vec<RemovedRepo>,
    pub remote_renames: Vec<RemoteRename>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchResult {
    pub repos: Vec<RepoStatus>,
    pub remote_renames: Vec<RemoteRename>,
}

/// A remote whose repository was renamed or transferred on the host, detected
/// while fetching. Applying it is always the user's call — see `apply_remote_rename`.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteRename {
    pub path: String,
    pub repo_name: String,
    /// Remote name, e.g. `origin`.
    pub remote: String,
    pub old_url: String,
    pub new_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchProgress {
    pub path: String,
    pub stage: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInfo {
    pub name: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitRef {
    pub name: String,
    /// "head" | "local" | "remote" | "tag"
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub subject: String,
    pub author: String,
    pub date: String,
    pub parents: Vec<String>,
    pub refs: Vec<CommitRef>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoDetail {
    pub status: RepoStatus,
    pub remotes: Vec<RemoteInfo>,
    pub commits: Vec<CommitInfo>,
    pub changed_files: Vec<String>,
}

pub fn git_available() -> bool {
    git_command()
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    pub available: bool,
    pub version: Option<String>,
    pub path: Option<String>,
    pub exec_path: Option<String>,
    pub user_name: Option<String>,
    pub user_email: Option<String>,
    pub default_branch: Option<String>,
    pub autocrlf: Option<String>,
    pub fetch_prune: Option<bool>,
    pub pull_ff: Option<String>,
    pub push_default: Option<String>,
    pub color_ui: Option<String>,
}

impl GitInfo {
    pub fn unavailable() -> Self {
        Self {
            available: false,
            version: None,
            path: None,
            exec_path: None,
            user_name: None,
            user_email: None,
            default_branch: None,
            autocrlf: None,
            fetch_prune: None,
            pull_ff: None,
            push_default: None,
            color_ui: None,
        }
    }
}

pub fn git_info() -> GitInfo {
    let version_output = git_command().arg("--version").output().ok();
    let available = version_output
        .as_ref()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !available {
        return GitInfo::unavailable();
    }

    let version = version_output
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let path = resolve_git_path();
    let exec_path = run_git_global(&["--exec-path"]);
    let user_name = git_config_get("user.name");
    let user_email = git_config_get("user.email");
    let default_branch = git_config_get("init.defaultBranch");
    let autocrlf = git_config_get_lower("core.autocrlf");
    let fetch_prune = git_config_get("fetch.prune").and_then(|s| parse_git_bool(&s));
    let pull_ff = git_config_get_lower("pull.ff");
    let push_default = git_config_get_lower("push.default");
    let color_ui = git_config_get_lower("color.ui");

    GitInfo {
        available: true,
        version,
        path,
        exec_path,
        user_name,
        user_email,
        default_branch,
        autocrlf,
        fetch_prune,
        pull_ff,
        push_default,
        color_ui,
    }
}

fn run_git_global(args: &[&str]) -> Option<String> {
    let output = git_command().args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8(output.stdout).ok()?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn git_config_get(key: &str) -> Option<String> {
    run_git_global(&["config", "--global", "--get", key])
}

fn git_config_get_lower(key: &str) -> Option<String> {
    git_config_get(key).map(|s| s.to_ascii_lowercase())
}

fn parse_git_bool(raw: &str) -> Option<bool> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "true" | "yes" | "on" | "1" => Some(true),
        "false" | "no" | "off" | "0" => Some(false),
        _ => None,
    }
}

fn is_valid_default_branch(name: &str) -> bool {
    if name.is_empty() || name.len() > 255 {
        return false;
    }
    if name == "." || name == ".." || name.eq_ignore_ascii_case("HEAD") {
        return false;
    }
    if name.starts_with('/') || name.starts_with('.') || name.starts_with('-') {
        return false;
    }
    if name.ends_with('/') || name.ends_with('.') || name.ends_with(".lock") {
        return false;
    }
    if name.contains("..") || name.contains("//") || name.contains("@{") {
        return false;
    }
    !name.chars().any(|c| {
        c.is_ascii_control()
            || c.is_whitespace()
            || matches!(c, '~' | '^' | ':' | '?' | '*' | '[' | '\\')
    })
}

fn normalize_git_config_key(field: &str) -> Result<&'static str, String> {
    match field.trim() {
        "init.defaultBranch" => Ok("init.defaultBranch"),
        "core.autocrlf" => Ok("core.autocrlf"),
        "fetch.prune" => Ok("fetch.prune"),
        "pull.ff" => Ok("pull.ff"),
        "push.default" => Ok("push.default"),
        "color.ui" => Ok("color.ui"),
        _ => Err("Unsupported git config field".into()),
    }
}

fn normalize_git_config_value(key: &str, value: &str) -> Result<String, String> {
    let value = value.trim();
    match key {
        "init.defaultBranch" => {
            if is_valid_default_branch(value) {
                Ok(value.to_string())
            } else {
                Err("init.defaultBranch must be a valid branch name".into())
            }
        }
        "core.autocrlf" => match value.to_ascii_lowercase().as_str() {
            "true" | "false" | "input" => Ok(value.to_ascii_lowercase()),
            _ => Err("core.autocrlf must be true, false, or input".into()),
        },
        "fetch.prune" => match parse_git_bool(value) {
            Some(true) => Ok("true".into()),
            Some(false) => Ok("false".into()),
            None => Err("fetch.prune must be true or false".into()),
        },
        "pull.ff" => match value.to_ascii_lowercase().as_str() {
            "true" | "false" | "only" => Ok(value.to_ascii_lowercase()),
            _ => Err("pull.ff must be true, false, or only".into()),
        },
        "push.default" => match value.to_ascii_lowercase().as_str() {
            "nothing" | "current" | "upstream" | "simple" | "matching" => {
                Ok(value.to_ascii_lowercase())
            }
            _ => Err("push.default must be nothing, current, upstream, simple, or matching".into()),
        },
        "color.ui" => match value.to_ascii_lowercase().as_str() {
            "true" | "false" | "auto" | "always" | "never" => Ok(value.to_ascii_lowercase()),
            _ => Err("color.ui must be true, false, auto, always, or never".into()),
        },
        _ => Err("Unsupported git config field".into()),
    }
}

fn set_git_global(key: &str, value: &str) -> Result<(), String> {
    let output = git_command()
        .args(["config", "--global", key, value])
        .output()
        .map_err(|e| format!("Failed to set {key}: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            format!("Failed to set {key}")
        } else {
            stderr
        })
    }
}

fn unset_git_global(key: &str) -> Result<(), String> {
    let output = git_command()
        .args(["config", "--global", "--unset", key])
        .output()
        .map_err(|e| format!("Failed to unset {key}: {e}"))?;
    if output.status.success() || output.status.code() == Some(5) {
        return Ok(());
    }
    let retry = git_command()
        .args(["config", "--global", "--unset-all", key])
        .output()
        .map_err(|e| format!("Failed to unset {key}: {e}"))?;
    if retry.status.success() || retry.status.code() == Some(5) {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&retry.stderr).trim().to_string();
    Err(if stderr.is_empty() {
        format!("Failed to unset {key}")
    } else {
        stderr
    })
}

/// Set or unset an allowlisted global git config key. Empty `value` unsets.
pub fn set_git_config_field(field: &str, value: &str) -> Result<GitInfo, String> {
    if !git_available() {
        return Err("Git was not found in PATH".into());
    }

    let key = normalize_git_config_key(field)?;
    let value = value.trim();
    if value.chars().any(|c| c == '\n' || c == '\r' || c == '\0') {
        return Err(format!("{key} contains invalid characters"));
    }
    if value.is_empty() {
        unset_git_global(key)?;
        return Ok(git_info());
    }

    let normalized = normalize_git_config_value(key, value)?;
    set_git_global(key, &normalized)?;
    Ok(git_info())
}

/// Set global `user.name` or `user.email`.
pub fn set_git_identity_field(field: &str, value: &str) -> Result<GitInfo, String> {
    if !git_available() {
        return Err("Git was not found in PATH".into());
    }

    let key = match field.trim() {
        "user.name" | "name" => "user.name",
        "user.email" | "email" => "user.email",
        _ => return Err("Field must be user.name or user.email".into()),
    };

    let value = value.trim();
    if value.is_empty() {
        return Err(format!("{key} cannot be empty"));
    }
    if key == "user.email" && !value.contains('@') {
        return Err("user.email must look like an email address".into());
    }
    if value.chars().any(|c| c == '\n' || c == '\r' || c == '\0') {
        return Err(format!("{key} contains invalid characters"));
    }

    set_git_global(key, value)?;
    Ok(git_info())
}

fn resolve_git_path() -> Option<String> {
    resolved_git_exe().map(|p| p.to_string_lossy().into_owned())
}

fn run_git(cwd: &str, args: &[&str]) -> Result<String, String> {
    let output = git_command()
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let msg = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("git {:?} failed", args)
        };
        Err(msg)
    }
}

/// Like [`run_git`], but also hands back stderr on success. `git fetch` reports
/// HTTP redirects there ("warning: redirecting to …"), which is how a renamed
/// remote repository shows up.
fn run_git_capture(cwd: &str, args: &[&str]) -> (Result<(), String>, String) {
    let output = match git_command().args(args).current_dir(cwd).output() {
        Ok(output) => output,
        Err(e) => return (Err(format!("Failed to run git: {e}")), String::new()),
    };

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if output.status.success() {
        return (Ok(()), stderr);
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let trimmed = stderr.trim();
    let msg = if !trimmed.is_empty() {
        trimmed.to_string()
    } else if !stdout.is_empty() {
        stdout
    } else {
        format!("git {:?} failed", args)
    };
    (Err(msg), stderr)
}

pub fn repo_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

pub fn status(path: &str) -> RepoStatus {
    collect_status(path, ProviderLookup::Cached)
}

/// Like [`status`], but re-reads remotes (user Refresh / remotes changed outside the app).
pub fn status_fresh(path: &str) -> RepoStatus {
    collect_status(path, ProviderLookup::Refresh)
}

enum ProviderLookup {
    Cached,
    Refresh,
    Skip,
}

fn collect_status(path: &str, provider: ProviderLookup) -> RepoStatus {
    let name = repo_name(path);
    if !crate::store::is_git_repo(path) {
        if matches!(provider, ProviderLookup::Refresh) {
            forget_remote_provider(path);
        }
        return RepoStatus {
            path: path.to_string(),
            name,
            branch: None,
            upstream: None,
            ahead: 0,
            behind: 0,
            dirty: false,
            last_error: Some("Not a git repository".into()),
            remote_provider: None,
        };
    }

    let remote_provider = match provider {
        ProviderLookup::Cached => remote_provider_for(path, false),
        ProviderLookup::Refresh => remote_provider_for(path, true),
        ProviderLookup::Skip => None,
    };

    match run_git(path, &["status", "--porcelain=v2", "--branch"]) {
        Ok(out) => parse_status(path, &name, &out, remote_provider),
        Err(err) => RepoStatus {
            path: path.to_string(),
            name,
            branch: None,
            upstream: None,
            ahead: 0,
            behind: 0,
            dirty: false,
            last_error: Some(err),
            remote_provider,
        },
    }
}

fn parse_status(path: &str, name: &str, out: &str, remote_provider: Option<String>) -> RepoStatus {
    let mut branch = None;
    let mut upstream = None;
    let mut ahead = 0u32;
    let mut behind = 0u32;
    let mut dirty = false;

    for line in out.lines() {
        if let Some(rest) = line.strip_prefix("# branch.head ") {
            branch = Some(rest.to_string());
        } else if let Some(rest) = line.strip_prefix("# branch.upstream ") {
            upstream = Some(rest.to_string());
        } else if let Some(rest) = line.strip_prefix("# branch.ab ") {
            // format: +N -M
            for part in rest.split_whitespace() {
                if let Some(n) = part.strip_prefix('+') {
                    ahead = n.parse().unwrap_or(0);
                } else if let Some(n) = part.strip_prefix('-') {
                    behind = n.parse().unwrap_or(0);
                }
            }
        } else if line.starts_with('1')
            || line.starts_with('2')
            || line.starts_with('u')
            || line.starts_with('?')
            || line.starts_with('!')
        {
            dirty = true;
        }
    }

    RepoStatus {
        path: path.to_string(),
        name: name.to_string(),
        branch,
        upstream,
        ahead,
        behind,
        dirty,
        last_error: None,
        remote_provider,
    }
}

pub fn detail(path: &str) -> Result<RepoDetail, String> {
    if !crate::store::is_git_repo(path) {
        return Err(format!("Not a git repository: {path}"));
    }

    let (mut status, remotes_result, commits, changed_files) = std::thread::scope(|s| {
        let status_t = s.spawn(|| collect_status(path, ProviderLookup::Skip));
        let remotes_t = s.spawn(|| list_remotes(path));
        let commits_t = s.spawn(|| list_commits(path, 20).unwrap_or_default());
        let files_t = s.spawn(|| list_changed_files(path, 30).unwrap_or_default());
        (
            status_t
                .join()
                .unwrap_or_else(|_| collect_status(path, ProviderLookup::Skip)),
            remotes_t.join().unwrap_or_else(|_| list_remotes(path)),
            commits_t.join().unwrap_or_default(),
            files_t.join().unwrap_or_default(),
        )
    });

    let remotes = apply_remotes_to_status(path, &mut status, remotes_result);

    Ok(RepoDetail {
        status,
        remotes,
        commits,
        changed_files,
    })
}

pub fn add_remote(path: &str, name: &str, url: &str) -> Result<RepoDetail, String> {
    if !crate::store::is_git_repo(path) {
        return Err(format!("Not a git repository: {path}"));
    }

    let name = name.trim();
    let url = url.trim();
    if name.is_empty() {
        return Err("Remote name is required".into());
    }
    if name.chars().any(|c| c.is_whitespace()) {
        return Err("Remote name cannot contain whitespace".into());
    }
    if url.is_empty() {
        return Err("Remote URL is required".into());
    }

    run_git(path, &["remote", "add", name, url])?;
    detail(path)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubPublishInfo {
    pub available: bool,
    pub login: Option<String>,
    /// Preferred git protocol for github.com: `https` or `ssh`.
    pub git_protocol: Option<String>,
}

pub fn github_publish_info() -> GithubPublishInfo {
    if !gh_available() {
        return GithubPublishInfo {
            available: false,
            login: None,
            git_protocol: None,
        };
    }
    let login = run_gh_global(&["api", "user", "-q", ".login"]);
    let git_protocol = login
        .as_ref()
        .and_then(|_| run_gh_global(&["config", "get", "-h", "github.com", "git_protocol"]))
        .map(|p| p.to_ascii_lowercase());
    GithubPublishInfo {
        available: true,
        login,
        git_protocol,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitIdentitySync {
    pub user_name: Option<String>,
    pub user_email: Option<String>,
    pub name_updated: bool,
    pub email_updated: bool,
}

/// Apply GitHub account profile to global `user.name` / `user.email`.
/// When `overwrite` is false, only empty values are filled.
pub fn sync_git_identity_from_github(overwrite: bool) -> Result<GitIdentitySync, String> {
    if !git_available() {
        return Err("Git was not found in PATH".into());
    }
    if !gh_available() {
        return Err(
            "GitHub CLI (gh) was not found in PATH. Install it from https://cli.github.com/".into(),
        );
    }

    let login = run_gh_global(&["api", "user", "-q", ".login"])
        .ok_or_else(|| "Not signed in to GitHub CLI. Run gh auth login first.".to_string())?;

    let existing_name = run_git_global(&["config", "--global", "--get", "user.name"]);
    let existing_email = run_git_global(&["config", "--global", "--get", "user.email"]);

    let github_name = run_gh_global(&["api", "user", "-q", ".name"])
        .filter(|s| !s.is_empty() && s != "null")
        .unwrap_or_else(|| login.clone());
    let github_email = github_account_email(&login)?;

    let mut name_updated = false;
    let mut email_updated = false;
    let mut user_name = existing_name.clone();
    let mut user_email = existing_email.clone();

    if overwrite || existing_name.is_none() {
        if existing_name.as_deref() != Some(github_name.as_str()) {
            set_git_global("user.name", &github_name)?;
            name_updated = true;
        }
        user_name = Some(github_name);
    }

    if overwrite || existing_email.is_none() {
        if existing_email.as_deref() != Some(github_email.as_str()) {
            set_git_global("user.email", &github_email)?;
            email_updated = true;
        }
        user_email = Some(github_email);
    }

    Ok(GitIdentitySync {
        user_name,
        user_email,
        name_updated,
        email_updated,
    })
}

fn github_account_email(login: &str) -> Result<String, String> {
    if let Some(email) = run_gh_global(&["api", "user", "-q", ".email"])
        .filter(|s| !s.is_empty() && s != "null" && s.contains('@'))
    {
        return Ok(email);
    }

    if let Some(email) = run_gh_global(&[
        "api",
        "user/emails",
        "-q",
        ".[] | select(.primary == true) | .email",
    ])
    .filter(|s| !s.is_empty() && s.contains('@'))
    {
        return Ok(email);
    }

    if let Some(email) = run_gh_global(&[
        "api",
        "user/emails",
        "-q",
        ".[] | select(.verified == true) | .email",
    ])
    .filter(|s| !s.is_empty() && s.contains('@'))
    {
        return Ok(email);
    }

    // Private email / missing user scope: stable GitHub noreply address.
    if let Some(id) = run_gh_global(&["api", "user", "-q", ".id"])
        .filter(|s| !s.is_empty() && s != "null" && s.chars().all(|c| c.is_ascii_digit()))
    {
        return Ok(format!("{id}+{login}@users.noreply.github.com"));
    }

    Ok(format!("{login}@users.noreply.github.com"))
}

/// Opens a system terminal so the user can complete `gh auth login --web`.
/// `protocol` must be `https` or `ssh`. The one-time device code must be visible,
/// so this cannot run headless.
pub fn start_github_login(protocol: &str) -> Result<(), String> {
    if !gh_available() {
        return Err(
            "GitHub CLI (gh) was not found in PATH. Install it from https://cli.github.com/".into(),
        );
    }

    let protocol = protocol.trim().to_ascii_lowercase();
    if protocol != "https" && protocol != "ssh" {
        return Err("Protocol must be https or ssh".into());
    }

    #[cfg(windows)]
    {
        return open_windows_gh_login(&protocol);
    }

    #[cfg(not(windows))]
    {
        let gh = resolved_gh_exe()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|| "gh".into());
        let login = format!("{gh} auth login --web -h github.com -p {protocol}");
        open_login_terminal(&login)
    }
}

/// Windows `cmd /K` + `CreateProcess` quoting breaks nested quotes around paths
/// with spaces. Pass one raw `/C` string using cmd's `""exe" args"` convention.
#[cfg(windows)]
fn open_windows_gh_login(protocol: &str) -> Result<(), String> {
    let gh = resolved_gh_exe()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| "gh".into());

    // cmd /K ""C:\Program Files\GitHub CLI\gh.exe" auth login ..."
    let cmdline = format!(
        "/C start \"Giter GitHub Login\" cmd /K \"\"{gh}\" auth login --web -h github.com -p {protocol}\""
    );

    let mut cmd = Command::new("cmd");
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.raw_arg(cmdline);
    cmd.spawn()
        .map_err(|e| format!("Failed to open login terminal: {e}"))?;
    Ok(())
}

#[cfg(not(windows))]
fn open_login_terminal(login: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let script = format!(
            "tell application \"Terminal\" to do script \"{}\"",
            login.replace('\\', "\\\\").replace('"', "\\\"")
        );
        Command::new("osascript")
            .args(["-e", &script])
            .spawn()
            .map_err(|e| format!("Failed to open Terminal: {e}"))?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let shell_cmd = format!("{login}; echo; read -r -p 'Press Enter to close…'");
        let candidates: &[(&str, &[&str])] = &[
            ("x-terminal-emulator", &["-e", "bash", "-lc"]),
            ("gnome-terminal", &["--", "bash", "-lc"]),
            ("konsole", &["-e", "bash", "-lc"]),
            ("xfce4-terminal", &["-e", "bash", "-lc"]),
            ("xterm", &["-e", "bash", "-lc"]),
        ];

        for (program, prefix) in candidates {
            let mut cmd = Command::new(program);
            cmd.args(*prefix).arg(&shell_cmd);
            if cmd.spawn().is_ok() {
                return Ok(());
            }
        }

        return Err(format!(
            "Could not open a terminal. Run this manually: {login}"
        ));
    }

    #[allow(unreachable_code)]
    Err(format!("Unsupported platform. Run this manually: {login}"))
}

pub fn publish_to_github(path: &str, name: &str, private: bool) -> Result<RepoDetail, String> {
    if !crate::store::is_git_repo(path) {
        return Err(format!("Not a git repository: {path}"));
    }
    if !gh_available() {
        return Err(
            "GitHub CLI (gh) was not found in PATH. Install it from https://cli.github.com/".into(),
        );
    }

    let name = name.trim();
    if name.is_empty() {
        return Err("Repository name is required".into());
    }
    if name.chars().any(|c| c.is_whitespace()) {
        return Err("Repository name cannot contain whitespace".into());
    }

    let remotes = list_remotes(path).unwrap_or_default();
    if !remotes.is_empty() {
        return Err("Repository already has a remote configured".into());
    }

    let visibility = if private { "--private" } else { "--public" };
    let has_commits = run_git(path, &["rev-parse", "--verify", "HEAD"]).is_ok();

    let mut args = vec![
        "repo", "create", name, visibility, "--source", ".", "--remote", "origin",
    ];
    if has_commits {
        args.push("--push");
    }

    run_gh(path, &args)?;
    detail(path)
}

fn gh_available() -> bool {
    gh_command()
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn run_gh_global(args: &[&str]) -> Option<String> {
    let output = gh_command().args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8(output.stdout).ok()?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn run_gh(cwd: &str, args: &[&str]) -> Result<String, String> {
    let output = gh_command()
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run gh: {e}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let msg = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("gh {:?} failed", args)
        };
        Err(msg)
    }
}

static PROVIDER_CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();

fn provider_cache() -> &'static Mutex<HashMap<String, Option<String>>> {
    PROVIDER_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn remember_remote_provider(path: &str, provider: Option<String>) {
    if let Ok(mut cache) = provider_cache().lock() {
        cache.insert(path.to_string(), provider);
    }
}

pub fn forget_remote_provider(path: &str) {
    if let Ok(mut cache) = provider_cache().lock() {
        cache.remove(path);
    }
}

fn cached_remote_provider(path: &str) -> Option<Option<String>> {
    provider_cache().lock().ok()?.get(path).cloned()
}

fn remote_provider_for(path: &str, refresh: bool) -> Option<String> {
    if !refresh {
        if let Some(cached) = cached_remote_provider(path) {
            return cached;
        }
    }
    let provider = detect_remote_provider(path);
    remember_remote_provider(path, provider.clone());
    provider
}

fn provider_from_remotes(remotes: &[RemoteInfo]) -> Option<String> {
    let url = remotes
        .iter()
        .find(|r| r.name == "origin")
        .or_else(|| remotes.first())
        .map(|r| r.url.as_str())?;
    Some(provider_from_remote_url(url).to_string())
}

fn apply_remotes_to_status(
    path: &str,
    status: &mut RepoStatus,
    remotes: Result<Vec<RemoteInfo>, String>,
) -> Vec<RemoteInfo> {
    match remotes {
        Ok(list) => {
            let provider = provider_from_remotes(&list);
            remember_remote_provider(path, provider.clone());
            status.remote_provider = provider;
            list
        }
        Err(_) => {
            if let Some(cached) = cached_remote_provider(path) {
                status.remote_provider = cached;
            }
            Vec::new()
        }
    }
}

fn list_remotes(path: &str) -> Result<Vec<RemoteInfo>, String> {
    let out = run_git(path, &["remote", "-v"])?;
    let mut remotes = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for line in out.lines() {
        let mut parts = line.split_whitespace();
        let Some(name) = parts.next() else { continue };
        let Some(url) = parts.next() else { continue };
        let Some(kind) = parts.next() else { continue };
        if kind != "(fetch)" {
            continue;
        }
        if seen.insert(name.to_string()) {
            remotes.push(RemoteInfo {
                name: name.to_string(),
                url: url.to_string(),
            });
        }
    }

    Ok(remotes)
}

fn detect_remote_provider(path: &str) -> Option<String> {
    provider_from_remotes(&list_remotes(path).ok()?)
}

fn provider_from_remote_url(url: &str) -> &'static str {
    let Some(host) = remote_url_host(url) else {
        return "other";
    };
    let host = host.to_ascii_lowercase();

    if host == "github.com" || host.ends_with(".github.com") {
        "github"
    } else if host == "gitlab.com" || host.ends_with(".gitlab.com") || host.contains("gitlab") {
        "gitlab"
    } else if host == "bitbucket.org"
        || host.ends_with(".bitbucket.org")
        || host.contains("bitbucket")
    {
        "bitbucket"
    } else if host == "codeberg.org" || host.ends_with(".codeberg.org") {
        "codeberg"
    } else if host.contains("gitea") || host == "gitea.com" {
        "gitea"
    } else if host == "dev.azure.com"
        || host.ends_with(".visualstudio.com")
        || host.contains("azure.com")
    {
        "azure"
    } else {
        "other"
    }
}

/// Extract host from common git remote URL forms:
/// - https://github.com/user/repo.git
/// - git@github.com:user/repo.git
/// - ssh://git@gitlab.com/user/repo.git
fn remote_url_host(url: &str) -> Option<String> {
    let url = url.trim();
    if url.is_empty() {
        return None;
    }

    if let Some(rest) = url.strip_prefix("git@") {
        let host = rest.split(':').next()?.trim();
        return if host.is_empty() {
            None
        } else {
            Some(host.to_string())
        };
    }

    let without_scheme = if let Some(idx) = url.find("://") {
        &url[idx + 3..]
    } else {
        url
    };

    let without_auth = without_scheme.rsplit('@').next().unwrap_or(without_scheme);

    let host = without_auth.split('/').next()?.split(':').next()?.trim();

    if host.is_empty() {
        None
    } else {
        Some(host.to_string())
    }
}

/// `owner/repo` part of a remote URL, stripped of `.git` and any trailing
/// slash. Case is preserved: GitHub renames that only change capitalization are
/// real renames, so the caller decides whether to compare case-sensitively.
fn remote_url_repo_path(url: &str) -> Option<String> {
    let url = url.trim();
    if url.is_empty() {
        return None;
    }

    let rest = if let Some(rest) = url.strip_prefix("git@") {
        // scp-like: git@host:owner/repo.git
        rest.split_once(':')?.1.to_string()
    } else {
        let without_scheme = if let Some(idx) = url.find("://") {
            &url[idx + 3..]
        } else {
            url
        };
        let without_auth = without_scheme.rsplit('@').next().unwrap_or(without_scheme);
        without_auth.split_once('/')?.1.to_string()
    };

    let trimmed = rest.trim().trim_matches('/');
    let trimmed = trimmed.strip_suffix(".git").unwrap_or(trimmed);
    let trimmed = trimmed.trim_end_matches('/');
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// (host, owner/repo) identity used to tell "same repository, different URL"
/// from "different repository". Both parts are case-folded, so this only sees
/// URL spelling differences — not a capitalization-only rename.
fn remote_url_repo_key(url: &str) -> Option<(String, String)> {
    let host = remote_url_host(url)?.to_ascii_lowercase();
    let repo = remote_url_repo_path(url)?.to_ascii_lowercase();
    Some((host, repo))
}

/// Swap the `owner/repo` part of a remote URL while keeping its scheme, host,
/// port and `.git` suffix, so an SSH remote stays an SSH remote.
fn rewrite_remote_url_repo_path(url: &str, new_repo_path: &str) -> Option<String> {
    let url = url.trim();
    let suffix = if url.trim_end_matches('/').ends_with(".git") {
        ".git"
    } else {
        ""
    };

    if let Some(rest) = url.strip_prefix("git@") {
        let (host, _) = rest.split_once(':')?;
        if host.is_empty() {
            return None;
        }
        return Some(format!("git@{host}:{new_repo_path}{suffix}"));
    }

    let idx = url.find("://")?;
    let (scheme, after) = url.split_at(idx + 3);
    let authority_end = after.find('/')?;
    let authority = &after[..authority_end];
    if authority.is_empty() {
        return None;
    }
    Some(format!("{scheme}{authority}/{new_repo_path}{suffix}"))
}

/// Targets of `warning: redirecting to <url>` lines, in order and deduplicated.
fn redirect_targets(stderr: &str) -> Vec<String> {
    let mut targets: Vec<String> = Vec::new();
    for line in stderr.lines() {
        let Some(rest) = line.trim().strip_prefix("warning: redirecting to ") else {
            continue;
        };
        let url = rest.trim().trim_end_matches('/');
        if url.is_empty() || targets.iter().any(|t| t == url) {
            continue;
        }
        targets.push(url.to_string());
    }
    targets
}

/// Map redirect targets back onto configured remotes. A redirect only counts as
/// a rename when the `owner/repo` part actually changed; scheme-only or
/// trailing-slash redirects are ignored, and an ambiguous match (several remotes
/// on the same host) is skipped rather than guessed.
fn renames_from_redirects(path: &str, remotes: &[RemoteInfo], stderr: &str) -> Vec<RemoteRename> {
    let mut renames: Vec<RemoteRename> = Vec::new();

    for target in redirect_targets(stderr) {
        let Some((new_host, new_repo)) = remote_url_repo_key(&target) else {
            continue;
        };
        let mut candidates = remotes.iter().filter(|remote| {
            remote_url_repo_key(&remote.url)
                .map(|(host, repo)| host == new_host && repo != new_repo)
                .unwrap_or(false)
        });
        let Some(remote) = candidates.next() else {
            continue;
        };
        if candidates.next().is_some() {
            continue;
        }
        if renames.iter().any(|r| r.remote == remote.name) {
            continue;
        }
        renames.push(RemoteRename {
            path: path.to_string(),
            repo_name: repo_name(path),
            remote: remote.name.clone(),
            old_url: remote.url.clone(),
            new_url: target,
        });
    }

    renames
}

/// GitHub renames that leave no `warning: redirecting to …` trail: SSH never
/// emits one, and the smart-HTTP endpoint answers `200` for a capitalization-only
/// rename instead of a `301`. The API is the only signal in both cases, so every
/// github.com remote is checked, not just SSH ones. Best-effort: needs `gh`
/// installed and signed in, and stays quiet otherwise.
fn github_rename_via_gh(path: &str, remote: &RemoteInfo) -> Option<RemoteRename> {
    resolved_gh_exe()?;

    let (host, _) = remote_url_repo_key(&remote.url)?;
    let repo_path = remote_url_repo_path(&remote.url)?;
    if host != "github.com" || repo_path.matches('/').count() != 1 {
        return None;
    }

    let endpoint = format!("repos/{repo_path}");
    let full_name = run_gh_global(&["api", endpoint.as_str(), "-q", ".full_name"])?;
    // Case-sensitive on purpose: `owner/repo` -> `owner/Repo` is a real rename.
    if full_name.matches('/').count() != 1 || full_name == repo_path {
        return None;
    }

    Some(RemoteRename {
        path: path.to_string(),
        repo_name: repo_name(path),
        remote: remote.name.clone(),
        old_url: remote.url.clone(),
        new_url: rewrite_remote_url_repo_path(&remote.url, &full_name)?,
    })
}

static PENDING_RENAMES: OnceLock<Mutex<HashMap<String, Vec<RemoteRename>>>> = OnceLock::new();

fn pending_renames() -> &'static Mutex<HashMap<String, Vec<RemoteRename>>> {
    PENDING_RENAMES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn remember_pending_renames(path: &str, renames: &[RemoteRename]) {
    if let Ok(mut cache) = pending_renames().lock() {
        if renames.is_empty() {
            cache.remove(path);
        } else {
            cache.insert(path.to_string(), renames.to_vec());
        }
    }
}

/// Renames detected during an earlier fetch that the user has not answered yet.
/// Refresh is deliberately offline, so it replays these instead of re-checking.
pub fn pending_renames_for(paths: &[String]) -> Vec<RemoteRename> {
    let Ok(cache) = pending_renames().lock() else {
        return Vec::new();
    };
    paths
        .iter()
        .filter_map(|path| cache.get(path))
        .flat_map(|renames| renames.iter().cloned())
        .collect()
}

pub fn dismiss_remote_rename(path: &str, remote: &str) {
    if let Ok(mut cache) = pending_renames().lock() {
        let Some(renames) = cache.get_mut(path) else {
            return;
        };
        renames.retain(|r| r.remote != remote);
        if renames.is_empty() {
            cache.remove(path);
        }
    }
}

pub fn forget_pending_renames(path: &str) {
    if let Ok(mut cache) = pending_renames().lock() {
        cache.remove(path);
    }
}

/// Point a remote at its new URL. Only touches remote configuration — never the
/// working tree or history.
pub fn apply_remote_rename(path: &str, remote: &str, url: &str) -> Result<RepoStatus, String> {
    if !crate::store::is_git_repo(path) {
        return Err(format!("Not a git repository: {path}"));
    }

    let remote = remote.trim();
    let url = url.trim();
    if remote.is_empty() {
        return Err("Remote name is required".into());
    }
    if url.is_empty() {
        return Err("Remote URL is required".into());
    }
    if remote.starts_with('-') || url.starts_with('-') {
        return Err("Remote name and URL cannot start with '-'".into());
    }
    if remote.chars().any(|c| c.is_whitespace()) {
        return Err("Remote name cannot contain whitespace".into());
    }
    if url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("Remote URL cannot contain whitespace".into());
    }
    if !list_remotes(path)?.iter().any(|r| r.name == remote) {
        return Err(format!("Unknown remote: {remote}"));
    }

    run_git(path, &["remote", "set-url", remote, url])?;
    dismiss_remote_rename(path, remote);
    Ok(status_fresh(path))
}

fn list_commits(path: &str, limit: usize) -> Result<Vec<CommitInfo>, String> {
    let out = run_git(
        path,
        &[
            "log",
            "--exclude=refs/stash",
            "--all",
            "--topo-order",
            &format!("-{limit}"),
            "--pretty=tformat:%H%x00%h%x00%s%x00%an%x00%aI%x00%P%x00%D",
        ],
    )?;
    Ok(parse_commit_log(&out))
}

fn parse_commit_log(out: &str) -> Vec<CommitInfo> {
    let mut commits = Vec::new();
    for line in out.lines() {
        if line.is_empty() {
            continue;
        }
        if let Some(commit) = parse_commit_line(line) {
            commits.push(commit);
        }
    }
    commits
}

fn parse_commit_line(line: &str) -> Option<CommitInfo> {
    let parts: Vec<&str> = line.split('\0').collect();
    if parts.len() < 7 {
        return None;
    }
    let parents = if parts[5].is_empty() {
        Vec::new()
    } else {
        parts[5].split_whitespace().map(|h| h.to_string()).collect()
    };
    Some(CommitInfo {
        hash: parts[0].to_string(),
        short_hash: parts[1].to_string(),
        subject: parts[2].to_string(),
        author: parts[3].to_string(),
        date: parts[4].to_string(),
        parents,
        refs: parse_decorations(parts[6]),
    })
}

fn parse_decorations(raw: &str) -> Vec<CommitRef> {
    if raw.is_empty() {
        return Vec::new();
    }

    let mut refs = Vec::new();
    for part in raw.split(',') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        if part == "stash" || part.starts_with("refs/stash") || part.starts_with("notes/") {
            continue;
        }
        if part != "HEAD" && part.ends_with("/HEAD") {
            continue;
        }

        if let Some(branch) = part.strip_prefix("HEAD -> ") {
            refs.push(CommitRef {
                name: "HEAD".into(),
                kind: "head".into(),
            });
            if !branch.is_empty() {
                refs.push(CommitRef {
                    name: branch.to_string(),
                    kind: "local".into(),
                });
            }
        } else if part == "HEAD" {
            refs.push(CommitRef {
                name: "HEAD".into(),
                kind: "head".into(),
            });
        } else if let Some(tag) = part.strip_prefix("tag: ") {
            if !tag.is_empty() {
                refs.push(CommitRef {
                    name: tag.to_string(),
                    kind: "tag".into(),
                });
            }
        } else if part.contains('/') {
            refs.push(CommitRef {
                name: part.to_string(),
                kind: "remote".into(),
            });
        } else {
            refs.push(CommitRef {
                name: part.to_string(),
                kind: "local".into(),
            });
        }
    }
    refs
}

fn list_changed_files(path: &str, limit: usize) -> Result<Vec<String>, String> {
    let out = run_git(path, &["status", "--porcelain"])?;
    let mut files = Vec::new();
    for line in out.lines() {
        if line.len() < 4 {
            continue;
        }
        // "XY path" or "XY orig -> path"
        let entry = line[3..].trim().to_string();
        if entry.is_empty() {
            continue;
        }
        files.push(entry);
        if files.len() >= limit {
            break;
        }
    }
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::{
        apply_remotes_to_status, cached_remote_provider, dismiss_remote_rename, find_git_exe,
        forget_pending_renames, forget_remote_provider, is_valid_default_branch,
        normalize_git_config_key, normalize_git_config_value, parse_commit_log, parse_decorations,
        parse_git_bool, parse_status, pending_renames_for, provider_from_remote_url,
        provider_from_remotes, redirect_targets, remember_pending_renames,
        remember_remote_provider, remote_url_host, remote_url_repo_key, remote_url_repo_path,
        renames_from_redirects, rewrite_remote_url_repo_path, CommitInfo, CommitRef, RemoteInfo,
        RemoteRename, RepoStatus,
    };

    #[test]
    fn finds_git_executable() {
        let path = find_git_exe().expect("git should be available in the test environment");
        assert!(path.is_file(), "{}", path.display());
    }

    #[test]
    fn parses_branch_ahead_behind_and_dirty() {
        let out = "\
# branch.head main
# branch.upstream origin/main
# branch.ab +1 -2
? untracked.txt
";
        let st = parse_status("/tmp/demo", "demo", out, Some("github".into()));
        assert_eq!(st.branch.as_deref(), Some("main"));
        assert_eq!(st.upstream.as_deref(), Some("origin/main"));
        assert_eq!(st.ahead, 1);
        assert_eq!(st.behind, 2);
        assert!(st.dirty);
        assert_eq!(st.remote_provider.as_deref(), Some("github"));
    }

    #[test]
    fn parses_https_and_ssh_hosts() {
        assert_eq!(
            remote_url_host("https://github.com/user/repo.git").as_deref(),
            Some("github.com")
        );
        assert_eq!(
            remote_url_host("git@github.com:user/repo.git").as_deref(),
            Some("github.com")
        );
        assert_eq!(
            remote_url_host("ssh://git@gitlab.com/user/repo.git").as_deref(),
            Some("gitlab.com")
        );
        assert_eq!(
            remote_url_host("https://user@bitbucket.org/user/repo.git").as_deref(),
            Some("bitbucket.org")
        );
    }

    #[test]
    fn detects_common_providers() {
        assert_eq!(
            provider_from_remote_url("https://github.com/a/b.git"),
            "github"
        );
        assert_eq!(provider_from_remote_url("git@gitlab.com:a/b.git"), "gitlab");
        assert_eq!(
            provider_from_remote_url("https://bitbucket.org/a/b.git"),
            "bitbucket"
        );
        assert_eq!(
            provider_from_remote_url("https://codeberg.org/a/b.git"),
            "codeberg"
        );
        assert_eq!(
            provider_from_remote_url("https://gitea.example.com/a/b.git"),
            "gitea"
        );
        assert_eq!(
            provider_from_remote_url("https://dev.azure.com/org/project/_git/repo"),
            "azure"
        );
        assert_eq!(
            provider_from_remote_url("https://git.example.com/a/b.git"),
            "other"
        );
    }

    #[test]
    fn prefers_origin_when_deriving_provider() {
        let remotes = vec![
            RemoteInfo {
                name: "upstream".into(),
                url: "https://gitlab.com/a/b.git".into(),
            },
            RemoteInfo {
                name: "origin".into(),
                url: "https://github.com/a/b.git".into(),
            },
        ];
        assert_eq!(provider_from_remotes(&remotes).as_deref(), Some("github"));
        assert_eq!(provider_from_remotes(&[]).as_deref(), None);
    }

    #[test]
    fn remote_provider_cache_roundtrip() {
        const PATH: &str = "/tmp/giter-provider-cache-test";
        forget_remote_provider(PATH);
        remember_remote_provider(PATH, Some("github".into()));
        assert_eq!(cached_remote_provider(PATH), Some(Some("github".into())));
        forget_remote_provider(PATH);
        assert_eq!(cached_remote_provider(PATH), None);
    }

    #[test]
    fn detail_remote_failure_keeps_cached_provider() {
        const PATH: &str = "/tmp/giter-provider-cache-detail-fail";
        forget_remote_provider(PATH);
        remember_remote_provider(PATH, Some("github".into()));
        let mut status = RepoStatus {
            path: PATH.into(),
            name: "demo".into(),
            branch: None,
            upstream: None,
            ahead: 0,
            behind: 0,
            dirty: false,
            last_error: None,
            remote_provider: None,
        };
        let remotes = apply_remotes_to_status(PATH, &mut status, Err("git failed".into()));
        assert!(remotes.is_empty());
        assert_eq!(status.remote_provider.as_deref(), Some("github"));
        assert_eq!(cached_remote_provider(PATH), Some(Some("github".into())));
        forget_remote_provider(PATH);
    }

    #[test]
    fn empty_remotes_cache_none_provider() {
        const PATH: &str = "/tmp/giter-provider-cache-empty-remotes";
        forget_remote_provider(PATH);
        remember_remote_provider(PATH, Some("gitlab".into()));
        let mut status = RepoStatus {
            path: PATH.into(),
            name: "demo".into(),
            branch: None,
            upstream: None,
            ahead: 0,
            behind: 0,
            dirty: false,
            last_error: None,
            remote_provider: Some("gitlab".into()),
        };
        apply_remotes_to_status(PATH, &mut status, Ok(Vec::new()));
        assert_eq!(status.remote_provider, None);
        assert_eq!(cached_remote_provider(PATH), Some(None));
        forget_remote_provider(PATH);
    }

    #[test]
    fn parses_commit_log_parents_and_refs() {
        let out = "\
aaa111\0aaa\0merge feat\0Ada\02026-01-02T03:04:05+08:00\0bbb222 ccc333\0HEAD -> main, origin/main, origin/HEAD, tag: v1.0
bbb222\0bbb\0on main\0Ada\02026-01-01T03:04:05+08:00\0ddd444\0
ccc333\0ccc\0on feat\0Ada\02026-01-01T04:04:05+08:00\0ddd444\0origin/feat
ddd444\0ddd\0root\0Ada\02026-01-01T00:00:00+08:00\0\0
";
        let commits = parse_commit_log(out);
        assert_eq!(commits.len(), 4);
        assert_eq!(
            commits[0],
            CommitInfo {
                hash: "aaa111".into(),
                short_hash: "aaa".into(),
                subject: "merge feat".into(),
                author: "Ada".into(),
                date: "2026-01-02T03:04:05+08:00".into(),
                parents: vec!["bbb222".into(), "ccc333".into()],
                refs: vec![
                    CommitRef {
                        name: "HEAD".into(),
                        kind: "head".into(),
                    },
                    CommitRef {
                        name: "main".into(),
                        kind: "local".into(),
                    },
                    CommitRef {
                        name: "origin/main".into(),
                        kind: "remote".into(),
                    },
                    CommitRef {
                        name: "v1.0".into(),
                        kind: "tag".into(),
                    },
                ],
            }
        );
        assert_eq!(commits[3].parents, [] as [String; 0]);
        assert!(commits[3].refs.is_empty());
    }

    #[test]
    fn rejects_unknown_git_config_keys() {
        assert!(normalize_git_config_key("alias.st").is_err());
        assert!(normalize_git_config_key("user.name").is_err());
        assert!(normalize_git_config_key("core.editor").is_err());
        assert!(normalize_git_config_key("pull.rebase").is_err());
        assert_eq!(
            normalize_git_config_key("init.defaultBranch").unwrap(),
            "init.defaultBranch"
        );
    }

    #[test]
    fn normalizes_allowlisted_git_config_values() {
        assert_eq!(
            normalize_git_config_value("core.autocrlf", "Input").unwrap(),
            "input"
        );
        assert_eq!(
            normalize_git_config_value("fetch.prune", "yes").unwrap(),
            "true"
        );
        assert_eq!(
            normalize_git_config_value("pull.ff", "ONLY").unwrap(),
            "only"
        );
        assert_eq!(
            normalize_git_config_value("push.default", "Simple").unwrap(),
            "simple"
        );
        assert_eq!(
            normalize_git_config_value("color.ui", "AUTO").unwrap(),
            "auto"
        );
        assert!(normalize_git_config_value("core.autocrlf", "lf").is_err());
        assert!(normalize_git_config_value("pull.ff", "rebase").is_err());
        assert!(normalize_git_config_value("init.defaultBranch", "HEAD").is_err());
    }

    #[test]
    fn validates_default_branch_names() {
        assert!(is_valid_default_branch("main"));
        assert!(is_valid_default_branch("trunk"));
        assert!(is_valid_default_branch("release/1.0"));
        assert!(!is_valid_default_branch(""));
        assert!(!is_valid_default_branch("HEAD"));
        assert!(!is_valid_default_branch("-bad"));
        assert!(!is_valid_default_branch("foo..bar"));
        assert!(!is_valid_default_branch("has space"));
        assert!(!is_valid_default_branch("weird^{}"));
    }

    #[test]
    fn parses_git_bool_synonyms() {
        assert_eq!(parse_git_bool("true"), Some(true));
        assert_eq!(parse_git_bool("ON"), Some(true));
        assert_eq!(parse_git_bool("0"), Some(false));
        assert_eq!(parse_git_bool("maybe"), None);
    }

    #[test]
    fn skips_noisy_commit_decorations() {
        let refs = parse_decorations("HEAD, origin/HEAD, stash, notes/commits, tag: v2");
        assert_eq!(
            refs,
            vec![
                CommitRef {
                    name: "HEAD".into(),
                    kind: "head".into(),
                },
                CommitRef {
                    name: "v2".into(),
                    kind: "tag".into(),
                },
            ]
        );
    }

    #[test]
    fn parses_remote_url_repo_paths_preserving_case() {
        assert_eq!(
            remote_url_repo_path("https://github.com/Acme/Repo.git").as_deref(),
            Some("Acme/Repo")
        );
        assert_eq!(
            remote_url_repo_path("git@github.com:acme/repo.git").as_deref(),
            Some("acme/repo")
        );
        assert_eq!(
            remote_url_repo_path("ssh://git@github.com:22/acme/repo").as_deref(),
            Some("acme/repo")
        );
        assert_eq!(
            remote_url_repo_path("https://user:pw@github.com/acme/repo/").as_deref(),
            Some("acme/repo")
        );
        assert_eq!(remote_url_repo_path("https://github.com/"), None);
    }

    #[test]
    fn folds_case_when_building_repo_keys() {
        assert_eq!(
            remote_url_repo_key("https://GitHub.com/Acme/Repo.git"),
            remote_url_repo_key("git@github.com:acme/repo")
        );
    }

    #[test]
    fn collects_deduplicated_redirect_targets() {
        let stderr = "\
warning: redirecting to https://github.com/new/name.git/
Fetching origin
warning: redirecting to https://github.com/new/name.git/
";
        assert_eq!(
            redirect_targets(stderr),
            vec!["https://github.com/new/name.git".to_string()]
        );
        assert!(redirect_targets("fatal: repository not found").is_empty());
    }

    #[test]
    fn detects_renamed_remote_from_redirect() {
        let remotes = vec![RemoteInfo {
            name: "origin".into(),
            url: "https://github.com/old/name.git".into(),
        }];
        let renames = renames_from_redirects(
            "/tmp/demo",
            &remotes,
            "warning: redirecting to https://github.com/new/name.git/\n",
        );
        assert_eq!(
            renames,
            vec![RemoteRename {
                path: "/tmp/demo".into(),
                repo_name: "demo".into(),
                remote: "origin".into(),
                old_url: "https://github.com/old/name.git".into(),
                new_url: "https://github.com/new/name.git".into(),
            }]
        );
    }

    #[test]
    fn ignores_redirects_that_keep_the_same_repository() {
        let remotes = vec![RemoteInfo {
            name: "origin".into(),
            url: "http://github.com/old/name".into(),
        }];
        // http -> https and a .git suffix are not a rename.
        assert!(renames_from_redirects(
            "/tmp/demo",
            &remotes,
            "warning: redirecting to https://github.com/old/name.git/\n",
        )
        .is_empty());
    }

    #[test]
    fn skips_ambiguous_redirect_matches() {
        let remotes = vec![
            RemoteInfo {
                name: "origin".into(),
                url: "https://github.com/old/name.git".into(),
            },
            RemoteInfo {
                name: "upstream".into(),
                url: "https://github.com/other/name.git".into(),
            },
        ];
        assert!(renames_from_redirects(
            "/tmp/demo",
            &remotes,
            "warning: redirecting to https://github.com/new/name.git/\n",
        )
        .is_empty());
    }

    #[test]
    fn rewrites_repo_path_keeping_url_shape() {
        assert_eq!(
            rewrite_remote_url_repo_path("git@github.com:old/name.git", "new/name").as_deref(),
            Some("git@github.com:new/name.git")
        );
        assert_eq!(
            rewrite_remote_url_repo_path("ssh://git@github.com/old/name", "new/name").as_deref(),
            Some("ssh://git@github.com/new/name")
        );
        assert_eq!(
            rewrite_remote_url_repo_path("https://github.com/old/name.git", "new/name").as_deref(),
            Some("https://github.com/new/name.git")
        );
        assert_eq!(
            rewrite_remote_url_repo_path("https://github.com/acme/giter.git", "acme/Giter")
                .as_deref(),
            Some("https://github.com/acme/Giter.git"),
            "a capitalization-only rename must still produce a new URL"
        );
    }

    #[test]
    fn pending_renames_are_dismissed_per_remote() {
        const PATH: &str = "/tmp/giter-pending-rename-test";
        let rename = |remote: &str| RemoteRename {
            path: PATH.into(),
            repo_name: "demo".into(),
            remote: remote.into(),
            old_url: "https://github.com/old/name.git".into(),
            new_url: "https://github.com/new/name.git".into(),
        };
        let paths = vec![PATH.to_string()];

        forget_pending_renames(PATH);
        remember_pending_renames(PATH, &[rename("origin"), rename("upstream")]);
        assert_eq!(pending_renames_for(&paths).len(), 2);

        dismiss_remote_rename(PATH, "origin");
        assert_eq!(
            pending_renames_for(&paths),
            vec![rename("upstream")],
            "dismissing one remote must keep the others pending"
        );

        dismiss_remote_rename(PATH, "upstream");
        assert!(pending_renames_for(&paths).is_empty());

        remember_pending_renames(PATH, &[]);
        assert!(pending_renames_for(&paths).is_empty());
        forget_pending_renames(PATH);
    }
}

/// `git fetch --all --prune`, plus detection of remotes whose repository was
/// renamed on the host. Detection is a byproduct of the fetch that already
/// happened; nothing is changed without the user applying it.
pub fn fetch_detecting_renames(path: &str) -> (Result<(), String>, Vec<RemoteRename>) {
    let remotes = list_remotes(path).unwrap_or_default();
    let (result, stderr) = run_git_capture(path, &["fetch", "--all", "--prune"]);

    let mut renames = renames_from_redirects(path, &remotes, &stderr);
    for remote in &remotes {
        if renames.iter().any(|r| r.remote == remote.name) {
            continue;
        }
        if let Some(rename) = github_rename_via_gh(path, remote) {
            renames.push(rename);
        }
    }

    remember_pending_renames(path, &renames);
    (result, renames)
}

pub fn pull_ff_only(path: &str) -> Result<(), String> {
    run_git(path, &["pull", "--ff-only"]).map(|_| ())
}

/// Fetch then FF-only pull when clean and behind.
pub fn update_one(path: &str) -> (BatchProgress, RepoStatus, Vec<RemoteRename>) {
    let (fetched, renames) = fetch_detecting_renames(path);
    if let Err(err) = fetched {
        return (
            BatchProgress {
                path: path.to_string(),
                stage: "error".into(),
                message: Some(format!("fetch failed: {err}")),
            },
            status(path),
            renames,
        );
    }

    let st = status(path);
    if st.dirty {
        return (
            BatchProgress {
                path: path.to_string(),
                stage: "skipped".into(),
                message: Some("Working tree is dirty".into()),
            },
            st,
            renames,
        );
    }
    if st.upstream.is_none() {
        return (
            BatchProgress {
                path: path.to_string(),
                stage: "skipped".into(),
                message: Some("No upstream branch".into()),
            },
            st,
            renames,
        );
    }
    if st.behind == 0 {
        return (
            BatchProgress {
                path: path.to_string(),
                stage: "skipped".into(),
                message: Some("Already up to date".into()),
            },
            st,
            renames,
        );
    }

    match pull_ff_only(path) {
        Ok(()) => (
            BatchProgress {
                path: path.to_string(),
                stage: "done".into(),
                message: Some(format!("Fast-forwarded (was behind by {})", st.behind)),
            },
            status(path),
            renames,
        ),
        Err(err) => (
            BatchProgress {
                path: path.to_string(),
                stage: "error".into(),
                message: Some(format!("pull --ff-only failed: {err}")),
            },
            st,
            renames,
        ),
    }
}
