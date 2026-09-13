use super::{
    parse_commit_log, reject_dash, require_repo, run_git, workspace_snapshot, CommitInfo,
    WorkspaceSnapshot,
};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlameLine {
    pub hash: String,
    pub author: String,
    pub date: String,
    pub line: String,
    pub number: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDiff {
    pub from: String,
    pub to: String,
    pub patch: String,
}

pub fn file_history(
    path: &str,
    file_path: &str,
    skip: u32,
    limit: u32,
) -> Result<Vec<CommitInfo>, String> {
    require_repo(path)?;
    reject_dash(file_path, "Path")?;
    let limit = limit.clamp(1, 200);
    let out = run_git(
        path,
        &[
            "log",
            "--follow",
            "--topo-order",
            &format!("--skip={skip}"),
            &format!("-{limit}"),
            "--pretty=tformat:%H%x00%h%x00%s%x00%an%x00%aI%x00%P%x00%D",
            "--",
            file_path,
        ],
    )
    .unwrap_or_default();
    Ok(parse_commit_log(&out))
}

pub fn blame_file(path: &str, file_path: &str) -> Result<Vec<BlameLine>, String> {
    require_repo(path)?;
    reject_dash(file_path, "Path")?;
    let out = run_git(path, &["blame", "--line-porcelain", "--", file_path])?;
    Ok(parse_blame(&out))
}

pub fn parse_blame(out: &str) -> Vec<BlameLine> {
    let mut lines = Vec::new();
    let mut hash = String::new();
    let mut author = String::new();
    let mut date = String::new();
    let mut number = 0u32;

    for line in out.lines() {
        if let Some(rest) = line.strip_prefix('\t') {
            lines.push(BlameLine {
                hash: hash.clone(),
                author: author.clone(),
                date: date.clone(),
                line: rest.to_string(),
                number,
            });
            continue;
        }
        if line.len() >= 40
            && line
                .as_bytes()
                .iter()
                .take(40)
                .all(|c| c.is_ascii_hexdigit())
        {
            let mut parts = line.split_whitespace();
            hash = parts.next().unwrap_or("").to_string();
            let _orig = parts.next();
            number = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
            continue;
        }
        if let Some(rest) = line.strip_prefix("author ") {
            author = rest.to_string();
        } else if let Some(rest) = line.strip_prefix("author-time ") {
            if let Ok(ts) = rest.parse::<i64>() {
                date = ts.to_string();
            }
        } else if let Some(rest) = line.strip_prefix("author-mail ") {
            if author.is_empty() {
                author = rest.trim_matches(['<', '>']).to_string();
            }
        }
    }
    lines
}

pub fn commit_patch(path: &str, from: &str, to: &str) -> Result<CommitDiff, String> {
    require_repo(path)?;
    reject_dash(from, "From")?;
    reject_dash(to, "To")?;
    let patch =
        run_git(path, &["diff", "--no-color", "--no-ext-diff", from, to]).unwrap_or_default();
    Ok(CommitDiff {
        from: from.into(),
        to: to.into(),
        patch,
    })
}

pub fn cherry_pick(path: &str, hash: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    reject_dash(hash, "Commit")?;
    run_git(path, &["cherry-pick", hash])?;
    workspace_snapshot(path)
}

pub fn revert_commit(path: &str, hash: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    reject_dash(hash, "Commit")?;
    run_git(path, &["revert", "--no-edit", hash])?;
    workspace_snapshot(path)
}

pub fn reset_to(path: &str, hash: &str, mode: &str) -> Result<WorkspaceSnapshot, String> {
    require_repo(path)?;
    reject_dash(hash, "Commit")?;
    let flag = match mode {
        "soft" => "--soft",
        "hard" => "--hard",
        _ => "--mixed",
    };
    run_git(path, &["reset", flag, hash])?;
    workspace_snapshot(path)
}

#[cfg(test)]
mod tests {
    use super::parse_blame;

    #[test]
    fn parses_blame_porcelain() {
        let out = "\
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 1 1 1
author Ada
author-mail <ada@example.com>
author-time 1700000000
author-tz +0800
\thello
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 2 2 1
author Bob
author-mail <bob@example.com>
author-time 1700000001
\tworld
";
        let lines = parse_blame(out);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].author, "Ada");
        assert_eq!(lines[0].line, "hello");
        assert_eq!(lines[1].author, "Bob");
        assert_eq!(lines[1].number, 2);
    }
}
