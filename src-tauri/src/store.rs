use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoEntry {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RepoStore {
    pub repos: Vec<RepoEntry>,
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app data dir: {e}"))?;
    Ok(dir.join("repos.json"))
}

pub fn load(app: &AppHandle) -> Result<RepoStore, String> {
    let path = store_path(app)?;
    if !path.exists() {
        return Ok(RepoStore::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("Failed to read store: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse store: {e}"))
}

pub fn save(app: &AppHandle, store: &RepoStore) -> Result<(), String> {
    let path = store_path(app)?;
    let raw = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Failed to serialize store: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("Failed to write store: {e}"))
}

pub fn normalize_path(path: &str) -> Result<String, String> {
    let p = Path::new(path);
    let canonical = fs::canonicalize(p).map_err(|e| format!("Invalid path '{path}': {e}"))?;
    Ok(canonical.to_string_lossy().to_string())
}

/// True only for a real Git work tree root (not a bare leftover `.git` stub).
pub fn is_git_repo(path: &str) -> bool {
    is_git_repo_at(Path::new(path))
}

pub fn is_git_repo_at(path: &Path) -> bool {
    let git = path.join(".git");
    if git.is_file() {
        return is_valid_gitdir_file(&git);
    }
    if git.is_dir() {
        return is_valid_git_dir(&git);
    }
    false
}

/// `.git` as a file (linked worktree / submodule): must be `gitdir: <path>`
/// pointing at a directory that itself looks like a git dir.
fn is_valid_gitdir_file(git_file: &Path) -> bool {
    let Ok(raw) = fs::read_to_string(git_file) else {
        return false;
    };
    let line = raw.lines().next().unwrap_or("").trim();
    let Some(target) = line.strip_prefix("gitdir:") else {
        return false;
    };
    let target = target.trim();
    if target.is_empty() {
        return false;
    }

    let git_dir = if Path::new(target).is_absolute() {
        PathBuf::from(target)
    } else {
        match git_file.parent() {
            Some(parent) => parent.join(target),
            None => return false,
        }
    };

    is_valid_git_dir(&git_dir)
}

/// A usable `.git` directory has `HEAD` plus either a normal `objects`/`refs`
/// layout or a worktree link via `commondir`.
fn is_valid_git_dir(git_dir: &Path) -> bool {
    if !git_dir.is_dir() {
        return false;
    }
    if !git_dir.join("HEAD").is_file() {
        return false;
    }

    let has_objects = git_dir.join("objects").is_dir();
    let has_refs = git_dir.join("refs").is_dir();
    if has_objects && has_refs {
        return true;
    }

    // Linked worktree git dir: HEAD + commondir (+ usually gitdir)
    git_dir.join("commondir").is_file()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn tmp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "giter-repo-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn rejects_missing_git() {
        let dir = tmp_dir();
        assert!(!is_git_repo_at(&dir));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_empty_git_dir() {
        let dir = tmp_dir();
        fs::create_dir(dir.join(".git")).unwrap();
        assert!(!is_git_repo_at(&dir));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_git_dir_with_only_head() {
        let dir = tmp_dir();
        let git = dir.join(".git");
        fs::create_dir(&git).unwrap();
        fs::write(git.join("HEAD"), "ref: refs/heads/main\n").unwrap();
        assert!(!is_git_repo_at(&dir));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn accepts_normal_git_dir() {
        let dir = tmp_dir();
        let git = dir.join(".git");
        fs::create_dir(&git).unwrap();
        fs::write(git.join("HEAD"), "ref: refs/heads/main\n").unwrap();
        fs::create_dir(git.join("objects")).unwrap();
        fs::create_dir(git.join("refs")).unwrap();
        assert!(is_git_repo_at(&dir));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_bogus_git_file() {
        let dir = tmp_dir();
        fs::write(dir.join(".git"), "not a gitdir\n").unwrap();
        assert!(!is_git_repo_at(&dir));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn accepts_valid_gitdir_file() {
        let root = tmp_dir();
        let main_git = root.join("main.git");
        fs::create_dir(&main_git).unwrap();
        fs::write(main_git.join("HEAD"), "ref: refs/heads/main\n").unwrap();
        fs::create_dir(main_git.join("objects")).unwrap();
        fs::create_dir(main_git.join("refs")).unwrap();

        let worktree = root.join("worktree");
        fs::create_dir(&worktree).unwrap();
        let mut f = fs::File::create(worktree.join(".git")).unwrap();
        writeln!(f, "gitdir: {}", main_git.display()).unwrap();

        assert!(is_git_repo_at(&worktree));
        let _ = fs::remove_dir_all(&root);
    }
}
