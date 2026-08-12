use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

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
    path.split(';')
        .any(|entry| entry.eq_ignore_ascii_case(dir))
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

fn git_command() -> Command {
    command_in_path("git")
}

fn gh_command() -> Command {
    if let Some(exe) = resolved_gh_exe() {
        #[cfg(windows)]
        {
            let mut cmd = Command::new(exe);
            cmd.creation_flags(CREATE_NO_WINDOW);
            return cmd;
        }
        #[cfg(not(windows))]
        {
            return Command::new(exe);
        }
    }
    command_in_path("gh")
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
        const CANDIDATES: &[&str] = &[
            "/opt/homebrew/bin/gh",
            "/usr/local/bin/gh",
            "/usr/bin/gh",
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub subject: String,
    pub author: String,
    pub date: String,
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
}

pub fn git_info() -> GitInfo {
    let version_output = git_command().arg("--version").output().ok();
    let available = version_output
        .as_ref()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !available {
        return GitInfo {
            available: false,
            version: None,
            path: None,
            exec_path: None,
            user_name: None,
            user_email: None,
        };
    }

    let version = version_output
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let path = resolve_git_path();
    let exec_path = run_git_global(&["--exec-path"]);
    let user_name = run_git_global(&["config", "--global", "--get", "user.name"]);
    let user_email = run_git_global(&["config", "--global", "--get", "user.email"]);

    GitInfo {
        available: true,
        version,
        path,
        exec_path,
        user_name,
        user_email,
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
    #[cfg(windows)]
    {
        let output = where_command().arg("git").output().ok()?;
        if !output.status.success() {
            return None;
        }
        let text = String::from_utf8(output.stdout).ok()?;
        text.lines()
            .next()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    }
    #[cfg(not(windows))]
    {
        let output = Command::new("which").arg("git").output().ok()?;
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

pub fn repo_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

pub fn status(path: &str) -> RepoStatus {
    let name = repo_name(path);
    if !crate::store::is_git_repo(path) {
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

    let remote_provider = detect_remote_provider(path);

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

fn parse_status(
    path: &str,
    name: &str,
    out: &str,
    remote_provider: Option<String>,
) -> RepoStatus {
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

    let (status, remotes, commits, changed_files) = std::thread::scope(|s| {
        let status_t = s.spawn(|| status(path));
        let remotes_t = s.spawn(|| list_remotes(path).unwrap_or_default());
        let commits_t = s.spawn(|| list_commits(path, 12).unwrap_or_default());
        let files_t = s.spawn(|| list_changed_files(path, 30).unwrap_or_default());
        (
            status_t.join().unwrap_or_else(|_| status(path)),
            remotes_t.join().unwrap_or_default(),
            commits_t.join().unwrap_or_default(),
            files_t.join().unwrap_or_default(),
        )
    });

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
    if let Some(id) = run_gh_global(&["api", "user", "-q", ".id"]).filter(|s| {
        !s.is_empty() && s != "null" && s.chars().all(|c| c.is_ascii_digit())
    }) {
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

fn primary_remote_url(path: &str) -> Option<String> {
    let remotes = list_remotes(path).ok()?;
    if remotes.is_empty() {
        return None;
    }
    remotes
        .iter()
        .find(|r| r.name == "origin")
        .or_else(|| remotes.first())
        .map(|r| r.url.clone())
}

fn detect_remote_provider(path: &str) -> Option<String> {
    let url = primary_remote_url(path)?;
    Some(provider_from_remote_url(&url).to_string())
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
    } else if host == "bitbucket.org" || host.ends_with(".bitbucket.org") || host.contains("bitbucket")
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

    let without_auth = without_scheme
        .rsplit('@')
        .next()
        .unwrap_or(without_scheme);

    let host = without_auth
        .split('/')
        .next()?
        .split(':')
        .next()?
        .trim();

    if host.is_empty() {
        None
    } else {
        Some(host.to_string())
    }
}

fn list_commits(path: &str, limit: usize) -> Result<Vec<CommitInfo>, String> {
    let out = run_git(
        path,
        &[
            "log",
            &format!("-{limit}"),
            "--pretty=format:%H%x00%h%x00%s%x00%an%x00%aI",
        ],
    )?;

    let mut commits = Vec::new();
    for line in out.lines() {
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split('\0').collect();
        if parts.len() < 5 {
            continue;
        }
        commits.push(CommitInfo {
            hash: parts[0].to_string(),
            short_hash: parts[1].to_string(),
            subject: parts[2].to_string(),
            author: parts[3].to_string(),
            date: parts[4].to_string(),
        });
    }
    Ok(commits)
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
    use super::{parse_status, provider_from_remote_url, remote_url_host};

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
        assert_eq!(
            provider_from_remote_url("git@gitlab.com:a/b.git"),
            "gitlab"
        );
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
}

pub fn fetch(path: &str) -> Result<(), String> {
    run_git(path, &["fetch", "--all", "--prune"]).map(|_| ())
}

pub fn pull_ff_only(path: &str) -> Result<(), String> {
    run_git(path, &["pull", "--ff-only"]).map(|_| ())
}

/// Fetch then FF-only pull when clean and behind. Returns (stage, message).
pub fn update_one(path: &str) -> Result<BatchProgress, BatchProgress> {
    if let Err(err) = fetch(path) {
        return Err(BatchProgress {
            path: path.to_string(),
            stage: "error".into(),
            message: Some(format!("fetch failed: {err}")),
        });
    }

    let st = status(path);
    if st.dirty {
        return Ok(BatchProgress {
            path: path.to_string(),
            stage: "skipped".into(),
            message: Some("Working tree is dirty".into()),
        });
    }
    if st.upstream.is_none() {
        return Ok(BatchProgress {
            path: path.to_string(),
            stage: "skipped".into(),
            message: Some("No upstream branch".into()),
        });
    }
    if st.behind == 0 {
        return Ok(BatchProgress {
            path: path.to_string(),
            stage: "skipped".into(),
            message: Some("Already up to date".into()),
        });
    }

    match pull_ff_only(path) {
        Ok(()) => Ok(BatchProgress {
            path: path.to_string(),
            stage: "done".into(),
            message: Some(format!("Fast-forwarded (was behind by {})", st.behind)),
        }),
        Err(err) => Err(BatchProgress {
            path: path.to_string(),
            stage: "error".into(),
            message: Some(format!("pull --ff-only failed: {err}")),
        }),
    }
}
