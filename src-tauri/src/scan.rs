use crate::store;
use std::fs;
use std::path::{Path, PathBuf};

/// Shallow scan for git repos under `root`, up to `max_depth` directory levels.
pub fn scan_folder(root: &str, max_depth: u32) -> Result<Vec<String>, String> {
    let root_path = Path::new(root);
    if !root_path.is_dir() {
        return Err(format!("Not a directory: {root}"));
    }

    let mut found = Vec::new();
    walk(root_path, 0, max_depth, &mut found)?;
    found.sort();
    found.dedup();
    Ok(found)
}

fn walk(dir: &Path, depth: u32, max_depth: u32, out: &mut Vec<String>) -> Result<(), String> {
    // Only treat as a repo when `.git` is structurally valid (rejects empty/stub dirs).
    if store::is_git_repo_at(dir) {
        let canonical = fs::canonicalize(dir)
            .map_err(|e| format!("canonicalize {}: {e}", dir.display()))?;
        out.push(canonical.to_string_lossy().to_string());
        // Do not descend into nested repos
        return Ok(());
    }

    if depth >= max_depth {
        return Ok(());
    }

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };

    for entry in entries.flatten() {
        let path: PathBuf = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let name = name.to_string_lossy();
        // Skip dependency/build dirs and hidden dirs (including bogus `.git` stubs)
        if name == "node_modules"
            || name == "target"
            || name == "dist"
            || name == "build"
            || name == ".git"
            || name.starts_with('.')
        {
            continue;
        }
        walk(&path, depth + 1, max_depth, out)?;
    }

    Ok(())
}
