use super::{reject_dash, require_repo, run_git, workspace_snapshot, WorkspaceSnapshot};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StashEntry {
    pub index: u32,
    pub selector: String,
    pub subject: String,
}

pub fn merge_ref(path: &str, name: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    let name = name.trim();
    reject_dash(name, "Ref")?;
    run_git(path, &["merge", "--no-edit", "--", name])?;
    workspace_snapshot(path)
}

pub fn merge_abort(path: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    run_git(path, &["merge", "--abort"])?;
    workspace_snapshot(path)
}

pub fn rebase_onto(path: &str, onto: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    let onto = onto.trim();
    reject_dash(onto, "Ref")?;
    if onto == "-i" || onto.starts_with("--interactive") {
        return Err("Interactive rebase is not supported".into());
    }
    run_git(path, &["rebase", onto])?;
    workspace_snapshot(path)
}

pub fn rebase_abort(path: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    run_git(path, &["rebase", "--abort"])?;
    workspace_snapshot(path)
}

pub fn rebase_continue(path: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    run_git(path, &["rebase", "--continue"])?;
    workspace_snapshot(path)
}

pub fn list_stash(path: &str) -> Result<Vec<StashEntry>, String> {
    require_repo(path)?;
    let out = run_git(path, &["stash", "list", "--pretty=format:%gd%x00%s"]).unwrap_or_default();
    let mut entries = Vec::new();
    for (index, line) in out.lines().enumerate() {
        if line.is_empty() {
            continue;
        }
        let mut parts = line.splitn(2, '\0');
        let selector = parts.next().unwrap_or("").to_string();
        let subject = parts.next().unwrap_or("").to_string();
        entries.push(StashEntry {
            index: index as u32,
            selector,
            subject,
        });
    }
    Ok(entries)
}

pub fn stash_push(path: &str, message: Option<&str>) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    if let Some(msg) = message.map(str::trim).filter(|s| !s.is_empty()) {
        run_git(path, &["stash", "push", "-m", msg])?;
    } else {
        run_git(path, &["stash", "push"])?;
    }
    workspace_snapshot(path)
}

pub fn stash_apply(path: &str, selector: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    let selector = stash_selector(selector)?;
    run_git(path, &["stash", "apply", "--", &selector])?;
    workspace_snapshot(path)
}

pub fn stash_pop(path: &str, selector: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    let selector = stash_selector(selector)?;
    run_git(path, &["stash", "pop", "--", &selector])?;
    workspace_snapshot(path)
}

pub fn stash_drop(path: &str, selector: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    let selector = stash_selector(selector)?;
    run_git(path, &["stash", "drop", "--", &selector])?;
    workspace_snapshot(path)
}

fn stash_selector(selector: &str) -> Result<String, String> {
    let selector = selector.trim();
    if selector.is_empty() {
        return Ok("stash@{0}".into());
    }
    if selector
        .strip_prefix("stash@{")
        .and_then(|s| s.strip_suffix('}'))
        .and_then(|n| n.parse::<u32>().ok())
        .is_some()
    {
        return Ok(selector.to_string());
    }
    if selector.parse::<u32>().is_ok() {
        return Ok(format!("stash@{{{selector}}}"));
    }
    Err("Invalid stash selector".into())
}

pub fn conflict_take(path: &str, file_path: &str, side: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    reject_dash(file_path, "Path")?;
    let flag = match side {
        "theirs" => "--theirs",
        _ => "--ours",
    };
    run_git(path, &["checkout", flag, "--", file_path])?;
    run_git(path, &["add", "--", file_path])?;
    workspace_snapshot(path)
}

pub fn mark_resolved(path: &str, file_path: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    reject_dash(file_path, "Path")?;
    run_git(path, &["add", "--", file_path])?;
    workspace_snapshot(path)
}

pub fn continue_operation(path: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    match super::detect_operation(path).as_str() {
        "rebase" => rebase_continue(path),
        "cherryPick" => {
            run_git(path, &["cherry-pick", "--continue"])?;
            workspace_snapshot(path)
        }
        "revert" => {
            run_git(path, &["revert", "--continue"])?;
            workspace_snapshot(path)
        }
        "merge" => {
            run_git(path, &["commit", "--no-edit"])?;
            workspace_snapshot(path)
        }
        _ => Err("No merge or rebase in progress".into()),
    }
}

pub fn abort_operation(path: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    match super::detect_operation(path).as_str() {
        "rebase" => rebase_abort(path),
        "cherryPick" => {
            run_git(path, &["cherry-pick", "--abort"])?;
            workspace_snapshot(path)
        }
        "revert" => {
            run_git(path, &["revert", "--abort"])?;
            workspace_snapshot(path)
        }
        "merge" => merge_abort(path),
        _ => Err("No merge or rebase in progress".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::stash_selector;

    #[test]
    fn accepts_stash_selectors() {
        assert_eq!(stash_selector("stash@{2}").unwrap(), "stash@{2}");
        assert_eq!(stash_selector("0").unwrap(), "stash@{0}");
        assert!(stash_selector("rebase -i").is_err());
    }
}
