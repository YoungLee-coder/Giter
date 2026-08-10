use serde::Serialize;
use std::path::Path;
use std::process::Command;

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
    Command::new("git")
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
    let version_output = Command::new("git").arg("--version").output().ok();
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
    let output = Command::new("git").args(args).output().ok()?;
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

fn resolve_git_path() -> Option<String> {
    #[cfg(windows)]
    {
        let output = Command::new("where").arg("git").output().ok()?;
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
    let output = Command::new("git")
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
        };
    }

    match run_git(path, &["status", "--porcelain=v2", "--branch"]) {
        Ok(out) => parse_status(path, &name, &out),
        Err(err) => RepoStatus {
            path: path.to_string(),
            name,
            branch: None,
            upstream: None,
            ahead: 0,
            behind: 0,
            dirty: false,
            last_error: Some(err),
        },
    }
}

fn parse_status(path: &str, name: &str, out: &str) -> RepoStatus {
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
    }
}

pub fn detail(path: &str) -> Result<RepoDetail, String> {
    if !crate::store::is_git_repo(path) {
        return Err(format!("Not a git repository: {path}"));
    }

    let status = status(path);
    let remotes = list_remotes(path).unwrap_or_default();
    let commits = list_commits(path, 12).unwrap_or_default();
    let changed_files = list_changed_files(path, 30).unwrap_or_default();

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
}

pub fn github_publish_info() -> GithubPublishInfo {
    if !gh_available() {
        return GithubPublishInfo {
            available: false,
            login: None,
        };
    }
    GithubPublishInfo {
        available: true,
        login: run_gh_global(&["api", "user", "-q", ".login"]),
    }
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
    Command::new("gh")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn run_gh_global(args: &[&str]) -> Option<String> {
    let output = Command::new("gh").args(args).output().ok()?;
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
    let output = Command::new("gh")
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
    use super::parse_status;

    #[test]
    fn parses_branch_ahead_behind_and_dirty() {
        let out = "\
# branch.head main
# branch.upstream origin/main
# branch.ab +1 -2
? untracked.txt
";
        let st = parse_status("/tmp/demo", "demo", out);
        assert_eq!(st.branch.as_deref(), Some("main"));
        assert_eq!(st.upstream.as_deref(), Some("origin/main"));
        assert_eq!(st.ahead, 1);
        assert_eq!(st.behind, 2);
        assert!(st.dirty);
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
