use super::{
    apply_remotes_to_status, list_remotes, parse_commit_log, reject_dash, require_repo, run_git,
    run_git_stdin, status, CommitInfo, RemoteInfo, RepoStatus,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    pub orig_path: Option<String>,
    /// "untracked" | "modified" | "added" | "deleted" | "renamed" | "copied" | "conflicted"
    pub kind: String,
    pub staged: bool,
    pub unstaged: bool,
    pub conflicted: bool,
    pub index_status: String,
    pub worktree_status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub status: RepoStatus,
    pub remotes: Vec<RemoteInfo>,
    /// "normal" | "merge" | "rebase" | "cherryPick" | "revert"
    pub operation: String,
    pub files: Vec<ChangedFile>,
    pub can_amend: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    /// "context" | "add" | "del"
    pub kind: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    pub header: String,
    pub old_start: u32,
    pub old_count: u32,
    pub new_start: u32,
    pub new_count: u32,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub header: String,
    pub binary: bool,
    pub hunks: Vec<DiffHunk>,
}

impl DiffLine {
    pub fn kind(kind: &str, text: String) -> Self {
        Self {
            kind: kind.into(),
            text,
        }
    }
}

pub fn clone_repo(url: &str, dest: &str) -> Result<String, String> {
    let url = url.trim();
    let dest = dest.trim();
    if url.is_empty() {
        return Err("Clone URL is required".into());
    }
    reject_dash(url, "Clone URL")?;
    if dest.is_empty() {
        return Err("Destination is required".into());
    }
    reject_dash(dest, "Destination")?;

    let dest_path = PathBuf::from(dest);
    if dest_path.exists() {
        if !dest_path.is_dir() {
            return Err(format!("Destination is not a directory: {dest}"));
        }
        if dest_path
            .read_dir()
            .map_err(|e| format!("Failed to read destination: {e}"))?
            .next()
            .is_some()
        {
            return Err(format!("Destination is not empty: {dest}"));
        }
    }

    let parent = dest_path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let name = dest_path
        .file_name()
        .ok_or_else(|| "Destination must include a folder name".to_string())?;

    run_git(
        &parent.to_string_lossy(),
        &["clone", "--", url, &name.to_string_lossy()],
    )?;

    let canonical = fs::canonicalize(&dest_path)
        .map_err(|e| format!("Cloned but failed to resolve path: {e}"))?;
    let path = canonical.to_string_lossy().to_string();
    if !crate::store::is_git_repo(&path) {
        return Err(format!("Clone did not produce a git repository: {path}"));
    }
    Ok(path)
}

pub fn init_repo(path: &str) -> Result<String, String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("Path is required".into());
    }
    reject_dash(path, "Path")?;
    let dest = PathBuf::from(path);
    if dest.exists() {
        if !dest.is_dir() {
            return Err(format!("Path is not a directory: {path}"));
        }
        if crate::store::is_git_repo(path) {
            return Err(format!("Already a git repository: {path}"));
        }
    } else {
        fs::create_dir_all(&dest).map_err(|e| format!("Failed to create directory: {e}"))?;
    }

    run_git(path, &["init"])?;
    let canonical =
        fs::canonicalize(&dest).map_err(|e| format!("Init succeeded but path invalid: {e}"))?;
    Ok(canonical.to_string_lossy().to_string())
}

pub fn workspace_snapshot(path: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    let mut status = status(path);
    let remotes = apply_remotes_to_status(path, &mut status, list_remotes(path));
    let files = list_changed_files_v2(path)?;
    let operation = detect_operation(path);
    let can_amend = status.ahead > 0 || status.upstream.is_none();
    Ok(WorkspaceSnapshot {
        status,
        remotes,
        operation,
        files,
        can_amend,
    })
}

pub fn detect_operation(path: &str) -> String {
    let git_dir = git_dir(path);
    if git_dir.join("MERGE_HEAD").is_file() {
        return "merge".into();
    }
    if git_dir.join("REBASE_HEAD").is_file()
        || git_dir.join("rebase-merge").is_dir()
        || git_dir.join("rebase-apply").is_dir()
    {
        return "rebase".into();
    }
    if git_dir.join("CHERRY_PICK_HEAD").is_file() {
        return "cherryPick".into();
    }
    if git_dir.join("REVERT_HEAD").is_file() {
        return "revert".into();
    }
    "normal".into()
}

fn git_dir(path: &str) -> PathBuf {
    let git = Path::new(path).join(".git");
    if git.is_dir() {
        return git;
    }
    if git.is_file() {
        if let Ok(raw) = fs::read_to_string(&git) {
            if let Some(target) = raw.lines().next().and_then(|l| l.strip_prefix("gitdir:")) {
                let target = target.trim();
                let dir = if Path::new(target).is_absolute() {
                    PathBuf::from(target)
                } else {
                    Path::new(path).join(target)
                };
                return dir;
            }
        }
    }
    git
}

pub fn list_changed_files_v2(path: &str) -> Result<Vec<ChangedFile>, String> {
    let out = run_git(
        path,
        &["status", "--porcelain=v2", "-z", "--untracked-files=all"],
    )?;
    Ok(parse_porcelain_v2(&out))
}

pub fn parse_porcelain_v2(out: &str) -> Vec<ChangedFile> {
    let mut files = Vec::new();
    // `-z` uses NUL between records; fields inside a record are space-separated
    // except the path which is the remainder. We also accept newline-separated
    // output from tests.
    let records: Vec<&str> = if out.contains('\0') {
        out.split('\0').filter(|s| !s.is_empty()).collect()
    } else {
        out.lines().filter(|s| !s.is_empty()).collect()
    };

    for rec in records {
        if rec.starts_with('#') {
            continue;
        }
        if let Some(file) = parse_porcelain_record(rec) {
            files.push(file);
        }
    }
    files
}

fn parse_porcelain_record(rec: &str) -> Option<ChangedFile> {
    let kind_ch = rec.chars().next()?;
    match kind_ch {
        '?' => {
            let path = rec
                .strip_prefix("? ")
                .unwrap_or(rec.trim_start_matches('?'))
                .trim();
            if path.is_empty() {
                return None;
            }
            Some(ChangedFile {
                path: path.to_string(),
                orig_path: None,
                kind: "untracked".into(),
                staged: false,
                unstaged: true,
                conflicted: false,
                index_status: ".".into(),
                worktree_status: "?".into(),
            })
        }
        '!' => None,
        'u' => parse_unmerged(rec),
        '1' => parse_ordinary(rec, false),
        '2' => parse_ordinary(rec, true),
        _ => None,
    }
}

fn parse_unmerged(rec: &str) -> Option<ChangedFile> {
    // u XY sub m1 m2 m3 mW h1 h2 h3 path
    let rest = rec.strip_prefix("u ")?;
    let xy = rest.get(..2)?;
    let path = rest
        .split_once(' ')
        .and_then(|(_, rest)| rest.splitn(8, ' ').nth(7).map(str::to_string))?;
    Some(ChangedFile {
        path,
        orig_path: None,
        kind: "conflicted".into(),
        staged: false,
        unstaged: true,
        conflicted: true,
        index_status: xy.chars().next().unwrap_or('U').to_string(),
        worktree_status: xy.chars().nth(1).unwrap_or('U').to_string(),
    })
}

fn parse_ordinary(rec: &str, renamed: bool) -> Option<ChangedFile> {
    // 1 XY sub mH mI mW hH hI hW path
    // Some Git versions omit hW when it matches hI.
    let prefix = if renamed { "2 " } else { "1 " };
    let rest = rec.strip_prefix(prefix)?;
    let xy = rest.get(..2)?;
    let index = xy.chars().next().unwrap_or('.');
    let worktree = xy.chars().nth(1).unwrap_or('.');
    let after_xy = rest.get(3..)?;
    let path_part = split_status_path(after_xy)?;
    if path_part.is_empty() {
        return None;
    }

    let (orig_path, path) = if renamed {
        if let Some((score_and_orig, new_path)) = path_part.split_once('\t') {
            let orig = score_and_orig
                .split_once(' ')
                .map(|(_, orig)| orig.to_string())
                .unwrap_or_else(|| score_and_orig.to_string());
            (Some(orig), new_path.to_string())
        } else if let Some((orig, new_path)) = path_part.split_once(" -> ") {
            (Some(orig.to_string()), new_path.to_string())
        } else {
            (None, path_part.to_string())
        }
    } else {
        (None, path_part.to_string())
    };

    let kind = if renamed {
        "renamed"
    } else {
        match (index, worktree) {
            ('A', _) | (_, 'A') => "added",
            ('D', _) | (_, 'D') => "deleted",
            ('C', _) | (_, 'C') => "copied",
            _ => "modified",
        }
    };

    Some(ChangedFile {
        path,
        orig_path,
        kind: kind.into(),
        staged: index != '.',
        unstaged: worktree != '.',
        conflicted: false,
        index_status: index.to_string(),
        worktree_status: worktree.to_string(),
    })
}

fn split_status_path(after_xy: &str) -> Option<&str> {
    let mut rest = after_xy;
    // submodule state
    rest = rest.split_once(' ')?.1;
    // three modes
    for _ in 0..3 {
        rest = rest.split_once(' ')?.1;
    }
    while let Some((tok, next)) = rest.split_once(' ') {
        if tok.len() >= 4 && tok.chars().all(|c| c.is_ascii_hexdigit()) {
            rest = next;
        } else {
            break;
        }
    }
    if rest.is_empty() {
        return None;
    }
    Some(rest)
}

pub fn stage_paths(path: &str, files: &[String]) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    if files.is_empty() {
        return workspace_snapshot(path);
    }
    let mut args = vec!["add".to_string(), "--".to_string()];
    for file in files {
        reject_dash(file, "Path")?;
        args.push(file.clone());
    }
    let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();
    run_git(path, &args_ref)?;
    workspace_snapshot(path)
}

pub fn unstage_paths(path: &str, files: &[String]) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    if files.is_empty() {
        return workspace_snapshot(path);
    }
    let mut args = vec![
        "restore".to_string(),
        "--staged".to_string(),
        "--".to_string(),
    ];
    for file in files {
        reject_dash(file, "Path")?;
        args.push(file.clone());
    }
    let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();
    run_git(path, &args_ref)?;
    workspace_snapshot(path)
}

pub fn discard_paths(path: &str, files: &[String]) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    let changed = list_changed_files_v2(path)?;
    for file in files {
        reject_dash(file, "Path")?;
        let entry = changed.iter().find(|f| f.path == *file);
        match entry {
            Some(f) if f.kind == "untracked" => {
                let full = Path::new(path).join(file);
                if full.is_dir() {
                    fs::remove_dir_all(&full)
                        .map_err(|e| format!("Failed to discard {file}: {e}"))?;
                } else if full.exists() {
                    fs::remove_file(&full).map_err(|e| format!("Failed to discard {file}: {e}"))?;
                }
            }
            Some(f) if f.conflicted => {
                return Err(format!("Resolve conflicts in {file} before discarding"));
            }
            _ => {
                run_git(
                    path,
                    &["restore", "--worktree", "--source=HEAD", "--", file],
                )?;
            }
        }
    }
    workspace_snapshot(path)
}

pub fn commit(path: &str, message: &str, amend: bool) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    let message = message.trim();
    if !amend && message.is_empty() {
        return Err("Commit message is required".into());
    }
    let snap = workspace_snapshot(path)?;
    if amend && !snap.can_amend {
        return Err("Cannot amend: HEAD has already been pushed".into());
    }
    if amend {
        if message.is_empty() {
            run_git(path, &["commit", "--amend", "--no-edit"])?;
        } else {
            run_git_stdin(path, &["commit", "--amend", "-F", "-"], message)?;
        }
    } else {
        run_git_stdin(path, &["commit", "-F", "-"], message)?;
    }
    workspace_snapshot(path)
}

pub fn push_repo(path: &str, force_with_lease: bool) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    let st = status(path);
    let branch = st
        .branch
        .as_deref()
        .ok_or_else(|| "Detached HEAD cannot be pushed from Giter".to_string())?;
    reject_dash(branch, "Branch")?;

    if force_with_lease {
        if st.upstream.is_some() {
            run_git(path, &["push", "--force-with-lease"])?;
        } else {
            let remote = default_remote(path)?;
            run_git(path, &["push", "--force-with-lease", "-u", &remote, branch])?;
        }
    } else if st.upstream.is_some() {
        run_git(path, &["push"])?;
    } else {
        let remote = default_remote(path)?;
        run_git(path, &["push", "-u", &remote, branch])?;
    }
    workspace_snapshot(path)
}

pub fn pull_ff(path: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    let (fetched, _renames) = super::fetch_detecting_renames(path);
    fetched?;
    super::pull_ff_only(path)?;
    workspace_snapshot(path)
}

pub fn fetch_repo(path: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    let (fetched, _renames) = super::fetch_detecting_renames(path);
    fetched?;
    workspace_snapshot(path)
}

fn default_remote(path: &str) -> Result<String, String> {
    let remotes = list_remotes(path)?;
    if remotes.iter().any(|r| r.name == "origin") {
        return Ok("origin".into());
    }
    remotes
        .into_iter()
        .next()
        .map(|r| r.name)
        .ok_or_else(|| "No remotes configured".to_string())
}

pub fn file_diff(path: &str, file_path: &str, staged: bool) -> Result<FileDiff, String> {
    require_repo(path)?;
    reject_dash(file_path, "Path")?;
    let files = list_changed_files_v2(path)?;
    let entry = files.iter().find(|f| f.path == file_path);

    if entry.is_some_and(|f| f.kind == "untracked") && !staged {
        return untracked_diff(path, file_path);
    }

    let mut args = vec!["diff", "--no-color", "--no-ext-diff"];
    if staged {
        args.push("--cached");
    }
    args.push("--");
    args.push(file_path);
    let out = run_git(path, &args).unwrap_or_default();
    Ok(parse_unified_diff(file_path, &out))
}

fn untracked_diff(path: &str, file_path: &str) -> Result<FileDiff, String> {
    let full = Path::new(path).join(file_path);
    if full.is_dir() {
        return Ok(FileDiff {
            path: file_path.into(),
            header: String::new(),
            binary: false,
            hunks: Vec::new(),
        });
    }
    let contents = fs::read(&full).map_err(|e| format!("Failed to read {file_path}: {e}"))?;
    if contents.contains(&0) {
        return Ok(FileDiff {
            path: file_path.into(),
            header: String::new(),
            binary: true,
            hunks: Vec::new(),
        });
    }
    let text = String::from_utf8_lossy(&contents);
    let mut lines = Vec::new();
    let mut new_count = 0u32;
    for line in text.lines() {
        new_count += 1;
        lines.push(DiffLine::kind("add", line.to_string()));
    }
    Ok(FileDiff {
        path: file_path.into(),
        header: format!("diff --git a/{file_path} b/{file_path}\nnew file mode 100644\n--- /dev/null\n+++ b/{file_path}"),
        binary: false,
        hunks: vec![DiffHunk {
            header: format!("@@ -0,0 +1,{new_count} @@"),
            old_start: 0,
            old_count: 0,
            new_start: 1,
            new_count,
            lines,
        }],
    })
}

pub fn parse_unified_diff(path: &str, diff: &str) -> FileDiff {
    if diff.contains("Binary files") || diff.contains("GIT binary patch") {
        return FileDiff {
            path: path.into(),
            header: diff.trim().into(),
            binary: true,
            hunks: Vec::new(),
        };
    }

    let mut header_lines = Vec::new();
    let mut hunks = Vec::new();
    let mut current: Option<DiffHunk> = None;
    let mut in_hunk = false;

    for line in diff.lines() {
        if line.starts_with("@@ ") {
            if let Some(hunk) = current.take() {
                hunks.push(hunk);
            }
            in_hunk = true;
            let (old_start, old_count, new_start, new_count) = parse_hunk_header(line);
            current = Some(DiffHunk {
                header: line.to_string(),
                old_start,
                old_count,
                new_start,
                new_count,
                lines: Vec::new(),
            });
            continue;
        }
        if !in_hunk {
            header_lines.push(line);
            continue;
        }
        if let Some(hunk) = current.as_mut() {
            if let Some(rest) = line.strip_prefix('+') {
                hunk.lines.push(DiffLine::kind("add", rest.to_string()));
            } else if let Some(rest) = line.strip_prefix('-') {
                hunk.lines.push(DiffLine::kind("del", rest.to_string()));
            } else if let Some(rest) = line.strip_prefix(' ') {
                hunk.lines.push(DiffLine::kind("context", rest.to_string()));
            } else if line == "\\ No newline at end of file" {
                hunk.lines.push(DiffLine::kind("context", line.to_string()));
            }
        }
    }
    if let Some(hunk) = current {
        hunks.push(hunk);
    }

    FileDiff {
        path: path.into(),
        header: header_lines.join("\n"),
        binary: false,
        hunks,
    }
}

fn parse_hunk_header(header: &str) -> (u32, u32, u32, u32) {
    // @@ -old_start,old_count +new_start,new_count @@
    let mut old_start = 0;
    let mut old_count = 1;
    let mut new_start = 0;
    let mut new_count = 1;
    if let Some(at) = header.split_whitespace().nth(1) {
        parse_range(at.trim_start_matches('-'), &mut old_start, &mut old_count);
    }
    if let Some(at) = header.split_whitespace().nth(2) {
        parse_range(at.trim_start_matches('+'), &mut new_start, &mut new_count);
    }
    (old_start, old_count, new_start, new_count)
}

fn parse_range(spec: &str, start: &mut u32, count: &mut u32) {
    if let Some((s, c)) = spec.split_once(',') {
        *start = s.parse().unwrap_or(0);
        *count = c.parse().unwrap_or(0);
    } else {
        *start = spec.parse().unwrap_or(0);
        *count = 1;
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HunkLineInput {
    pub kind: String,
    pub text: String,
    pub selected: bool,
}

pub fn apply_hunk(
    path: &str,
    file_path: &str,
    file_header: &str,
    hunk_header: &str,
    lines: &[HunkLineInput],
    reverse: bool,
) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    reject_dash(file_path, "Path")?;
    let patch = build_hunk_patch(file_path, file_header, hunk_header, lines)?;
    let mut args = vec!["apply", "--cached", "--unidiff-zero"];
    if reverse {
        args.push("--reverse");
    }
    args.push("-");
    run_git_stdin(path, &args, &patch)?;
    workspace_snapshot(path)
}

pub fn build_hunk_patch(
    file_path: &str,
    file_header: &str,
    hunk_header: &str,
    lines: &[HunkLineInput],
) -> Result<String, String> {
    let rebuilt = rebuild_hunk(hunk_header, lines)?;
    if rebuilt.lines.is_empty() || rebuilt.lines.iter().all(|l| l.kind == "context") {
        return Err("No selected changes in hunk".into());
    }
    let mut header = file_header.trim().to_string();
    if header.is_empty() {
        header =
            format!("diff --git a/{file_path} b/{file_path}\n--- a/{file_path}\n+++ b/{file_path}");
    }
    let mut patch = header;
    patch.push('\n');
    patch.push_str(&hunk_to_text(&rebuilt));
    if !patch.ends_with('\n') {
        patch.push('\n');
    }
    Ok(patch)
}

pub fn rebuild_hunk(hunk_header: &str, lines: &[HunkLineInput]) -> Result<DiffHunk, String> {
    let (old_start, _, new_start, _) = parse_hunk_header(hunk_header);
    let mut out_lines = Vec::new();
    let mut old_count = 0u32;
    let mut new_count = 0u32;

    for line in lines {
        match line.kind.as_str() {
            "context" => {
                out_lines.push(DiffLine::kind("context", line.text.clone()));
                old_count += 1;
                new_count += 1;
            }
            "add" => {
                if line.selected {
                    out_lines.push(DiffLine::kind("add", line.text.clone()));
                    new_count += 1;
                }
            }
            "del" => {
                if line.selected {
                    out_lines.push(DiffLine::kind("del", line.text.clone()));
                    old_count += 1;
                } else {
                    out_lines.push(DiffLine::kind("context", line.text.clone()));
                    old_count += 1;
                    new_count += 1;
                }
            }
            _ => {}
        }
    }

    Ok(DiffHunk {
        header: format!("@@ -{old_start},{old_count} +{new_start},{new_count} @@"),
        old_start,
        old_count,
        new_start,
        new_count,
        lines: out_lines,
    })
}

fn hunk_to_text(hunk: &DiffHunk) -> String {
    let mut out = hunk.header.clone();
    out.push('\n');
    for line in &hunk.lines {
        let prefix = match line.kind.as_str() {
            "add" => '+',
            "del" => '-',
            _ => ' ',
        };
        out.push(prefix);
        out.push_str(&line.text);
        out.push('\n');
    }
    out
}

pub fn commits_page(
    path: &str,
    skip: u32,
    limit: u32,
    search: Option<&str>,
) -> Result<Vec<CommitInfo>, String> {
    require_repo(path)?;
    let limit = limit.clamp(1, 200);
    let mut args = vec![
        "log".into(),
        "--exclude=refs/stash".into(),
        "--all".into(),
        "--topo-order".into(),
        format!("--skip={skip}"),
        format!("-{limit}"),
        "--pretty=tformat:%H%x00%h%x00%s%x00%an%x00%aI%x00%P%x00%D".into(),
    ];
    if let Some(q) = search.map(str::trim).filter(|s| !s.is_empty()) {
        reject_dash(q, "Search")?;
        args.push("--regexp-ignore-case".into());
        args.push(format!("--grep={q}"));
        args.push(format!("--author={q}"));
        args.push("--extended-regexp".into());
        // git log ANDs grep+author by default; use --all-match off by using
        // two-pass if empty. Prefer message/author OR via --grep on both is
        // not possible; call without author if grep-only is intended.
        // Use `--grep` only plus hash shortcut below.
        args.retain(|a| !a.starts_with("--author="));
        if q.chars().all(|c| c.is_ascii_hexdigit()) && q.len() >= 4 {
            args.push(q.to_string());
            args.retain(|a| !a.starts_with("--grep=") && *a != "--regexp-ignore-case");
        }
    }
    let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();
    let out = run_git(path, &args_ref).unwrap_or_default();
    Ok(parse_commit_log(&out))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn parses_porcelain_modified_and_untracked() {
        let out = "\
1 MM N... 100644 100644 100644 abcdefabcdefabcdefabcdefabcdefabcdefabcd abcdefabcdefabcdefabcdefabcdefabcdefabcd abcdefabcdefabcdefabcdefabcdefabcdefabcd src/app.ts
? notes.txt
";
        let files = parse_porcelain_v2(out);
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].path, "src/app.ts");
        assert!(files[0].staged && files[0].unstaged);
        assert_eq!(files[0].kind, "modified");
        assert_eq!(files[1].kind, "untracked");
        assert_eq!(files[1].path, "notes.txt");
    }

    #[test]
    fn parses_unified_diff_hunks() {
        let diff = "\
diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1,3 +1,4 @@
 keep
-old
+new
+extra
 keep2
";
        let parsed = parse_unified_diff("a.txt", diff);
        assert_eq!(parsed.hunks.len(), 1);
        assert_eq!(parsed.hunks[0].lines.len(), 5);
        assert_eq!(parsed.hunks[0].old_start, 1);
        assert_eq!(parsed.hunks[0].new_count, 4);
    }

    #[test]
    fn rebuilds_hunk_with_unselected_deletion_as_context() {
        let lines = vec![
            HunkLineInput {
                kind: "context".into(),
                text: "keep".into(),
                selected: true,
            },
            HunkLineInput {
                kind: "del".into(),
                text: "old".into(),
                selected: false,
            },
            HunkLineInput {
                kind: "add".into(),
                text: "new".into(),
                selected: true,
            },
        ];
        let hunk = rebuild_hunk("@@ -1,2 +1,2 @@", &lines).unwrap();
        assert_eq!(hunk.old_count, 2);
        assert_eq!(hunk.new_count, 3);
        assert_eq!(hunk.lines[1].kind, "context");
        assert_eq!(hunk.lines[2].kind, "add");
    }

    #[test]
    fn stages_and_commits_in_temp_repo() {
        let root = std::env::temp_dir().join(format!(
            "giter-ws-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.to_string_lossy().to_string();
        run_git(&path, &["init"]).unwrap();
        run_git(&path, &["config", "user.email", "giter@example.com"]).unwrap();
        run_git(&path, &["config", "user.name", "Giter Test"]).unwrap();
        fs::write(root.join("hello.txt"), "hello\n").unwrap();
        run_git(&path, &["add", "--", "hello.txt"]).unwrap();
        let raw = run_git(
            &path,
            &["status", "--porcelain=v2", "-z", "--untracked-files=all"],
        )
        .unwrap();
        let parsed = parse_porcelain_v2(&raw);
        assert!(
            parsed
                .iter()
                .any(|f| f.path.ends_with("hello.txt") && f.staged),
            "raw={raw:?} parsed={:?}",
            parsed
                .iter()
                .map(|f| (f.path.clone(), f.staged, f.kind.clone()))
                .collect::<Vec<_>>(),
        );
        let committed = commit(&path, "add hello", false).unwrap();
        assert!(!committed.status.dirty);
        let _ = fs::remove_dir_all(&root);
    }
}
