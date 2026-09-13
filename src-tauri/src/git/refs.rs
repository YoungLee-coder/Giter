use super::{reject_dash, require_repo, run_git, workspace_snapshot, WorkspaceSnapshot};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub hash: String,
    pub current: bool,
    pub upstream: Option<String>,
    pub remote: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagInfo {
    pub name: String,
    pub hash: String,
    pub subject: String,
}

pub fn list_branches(path: &str) -> Result<Vec<BranchInfo>, String> {
    require_repo(path)?;
    let mut branches = Vec::new();
    let local = run_git(
        path,
        &[
            "for-each-ref",
            "--format=%(refname:short)%00%(objectname:short)%00%(HEAD)%00%(upstream:short)",
            "refs/heads",
        ],
    )
    .unwrap_or_default();
    for line in local.lines() {
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split('\0').collect();
        if parts.is_empty() || parts[0].is_empty() {
            continue;
        }
        branches.push(BranchInfo {
            name: parts[0].to_string(),
            hash: parts.get(1).unwrap_or(&"").to_string(),
            current: parts.get(2).copied() == Some("*"),
            upstream: parts
                .get(3)
                .copied()
                .filter(|s| !s.is_empty())
                .map(str::to_string),
            remote: false,
        });
    }

    let remote = run_git(
        path,
        &[
            "for-each-ref",
            "--format=%(refname:short)%00%(objectname:short)",
            "refs/remotes",
        ],
    )
    .unwrap_or_default();
    for line in remote.lines() {
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split('\0').collect();
        let name = parts.first().copied().unwrap_or("");
        if name.is_empty() || name.ends_with("/HEAD") {
            continue;
        }
        branches.push(BranchInfo {
            name: name.to_string(),
            hash: parts.get(1).unwrap_or(&"").to_string(),
            current: false,
            upstream: None,
            remote: true,
        });
    }
    Ok(branches)
}

pub fn list_tags(path: &str) -> Result<Vec<TagInfo>, String> {
    require_repo(path)?;
    let out = run_git(
        path,
        &[
            "for-each-ref",
            "--format=%(refname:short)%00%(objectname:short)%00%(contents:subject)",
            "refs/tags",
        ],
    )
    .unwrap_or_default();
    let mut tags = Vec::new();
    for line in out.lines() {
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split('\0').collect();
        if parts.is_empty() || parts[0].is_empty() {
            continue;
        }
        tags.push(TagInfo {
            name: parts[0].to_string(),
            hash: parts.get(1).unwrap_or(&"").to_string(),
            subject: parts.get(2).unwrap_or(&"").to_string(),
        });
    }
    Ok(tags)
}

fn validate_ref_name(name: &str, label: &str) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(format!("{label} is required"));
    }
    reject_dash(name, label)?;
    if name.contains("..")
        || name.contains(' ')
        || name.contains('~')
        || name.contains('^')
        || name.contains(':')
        || name.contains('?')
        || name.contains('*')
        || name.contains('[')
        || name.contains('\\')
        || name == "HEAD"
        || name.ends_with('.')
        || name.ends_with(".lock")
    {
        return Err(format!("Invalid {label}"));
    }
    Ok(())
}

pub fn create_branch(path: &str, name: &str, checkout: bool) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    validate_ref_name(name, "Branch name")?;
    if checkout {
        run_git(path, &["checkout", "-b", name])?;
    } else {
        run_git(path, &["branch", "--", name])?;
    }
    workspace_snapshot(path)
}

pub fn checkout_ref(path: &str, name: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    let name = name.trim();
    validate_ref_name(name, "Ref")?;
    run_git(path, &["switch", "--guess", "--", name])
        .or_else(|_| run_git(path, &["checkout", name]))?;
    workspace_snapshot(path)
}

pub fn rename_branch(path: &str, from: &str, to: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    validate_ref_name(from, "Branch name")?;
    validate_ref_name(to, "Branch name")?;
    run_git(path, &["branch", "-m", from, to])?;
    workspace_snapshot(path)
}

pub fn delete_branch(path: &str, name: &str, force: bool) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    validate_ref_name(name, "Branch name")?;
    if force {
        run_git(path, &["branch", "-D", "--", name])?;
    } else {
        run_git(path, &["branch", "-d", "--", name])?;
    }
    workspace_snapshot(path)
}

pub fn set_upstream(path: &str, branch: &str, upstream: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    validate_ref_name(branch, "Branch name")?;
    validate_ref_name(upstream, "Upstream")?;
    run_git(
        path,
        &["branch", &format!("--set-upstream-to={upstream}"), branch],
    )?;
    workspace_snapshot(path)
}

pub fn create_tag(
    path: &str,
    name: &str,
    message: Option<&str>,
    target: Option<&str>,
) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    validate_ref_name(name, "Tag name")?;
    let mut args = vec!["tag".to_string()];
    if let Some(msg) = message.map(str::trim).filter(|s| !s.is_empty()) {
        args.push("-a".into());
        args.push(name.into());
        args.push("-m".into());
        args.push(msg.into());
    } else {
        args.push(name.into());
    }
    if let Some(target) = target.map(str::trim).filter(|s| !s.is_empty()) {
        reject_dash(target, "Target")?;
        args.push(target.into());
    }
    let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();
    run_git(path, &args_ref)?;
    workspace_snapshot(path)
}

pub fn delete_tag(path: &str, name: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    validate_ref_name(name, "Tag name")?;
    run_git(path, &["tag", "-d", "--", name])?;
    workspace_snapshot(path)
}

pub fn push_tags(path: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    run_git(path, &["push", "--tags"])?;
    workspace_snapshot(path)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoRefs {
    pub branches: Vec<BranchInfo>,
    pub tags: Vec<TagInfo>,
    pub stashes: Vec<super::StashEntry>,
}

pub fn repo_refs(path: &str) -> Result<RepoRefs, String> {
    Ok(RepoRefs {
        branches: list_branches(path)?,
        tags: list_tags(path)?,
        stashes: super::list_stash(path)?,
    })
}
