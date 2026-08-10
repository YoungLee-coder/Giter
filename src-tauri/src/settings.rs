use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub const SCAN_DEPTH_MIN: u32 = 1;
pub const SCAN_DEPTH_MAX: u32 = 10;
pub const CONCURRENCY_MIN: u32 = 1;
pub const CONCURRENCY_MAX: u32 = 16;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub scan_depth: u32,
    pub concurrency: u32,
    pub theme: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            scan_depth: 3,
            concurrency: 4,
            theme: "system".into(),
        }
    }
}

impl AppSettings {
    pub fn sanitize(mut self) -> Self {
        self.scan_depth = self.scan_depth.clamp(SCAN_DEPTH_MIN, SCAN_DEPTH_MAX);
        self.concurrency = self.concurrency.clamp(CONCURRENCY_MIN, CONCURRENCY_MAX);
        self.theme = match self.theme.as_str() {
            "light" | "dark" | "system" => self.theme,
            _ => "system".into(),
        };
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub git_available: bool,
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app data dir: {e}"))?;
    Ok(dir.join("settings.json"))
}

pub fn load(app: &AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("Failed to read settings: {e}"))?;
    let settings: AppSettings =
        serde_json::from_str(&raw).map_err(|e| format!("Failed to parse settings: {e}"))?;
    Ok(settings.sanitize())
}

pub fn save(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let sanitized = settings.clone().sanitize();
    let raw = serde_json::to_string_pretty(&sanitized)
        .map_err(|e| format!("Failed to serialize settings: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("Failed to write settings: {e}"))
}
