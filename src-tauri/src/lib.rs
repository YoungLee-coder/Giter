mod commands;
mod git;
mod scan;
mod settings;
mod store;
mod window_chrome;

#[cfg(target_os = "macos")]
mod menu;

use commands::AppState;
use tauri::{Manager, Theme};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::check_git,
            commands::list_repos,
            commands::add_repo,
            commands::remove_repo,
            commands::remove_repos,
            commands::reorder_repos,
            commands::refresh_status,
            commands::scan_folder,
            commands::batch_fetch,
            commands::batch_update,
            commands::repo_detail,
            commands::add_remote,
            commands::apply_remote_rename,
            commands::dismiss_remote_rename,
            commands::github_publish_info,
            commands::start_github_login,
            commands::sync_git_identity_from_github,
            commands::publish_to_github,
            commands::set_settings_menu_label,
            commands::get_settings,
            commands::update_settings,
            commands::get_app_info,
            commands::get_git_info,
            commands::set_git_identity_field,
            commands::set_git_config_field,
            window_chrome::sync_window_chrome,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let handle = app.handle().clone();
                let menu = menu::build_app_menu(&handle)?;
                app.set_menu(menu)?;
                app.on_menu_event(move |app, event| {
                    if event.id() == menu::SETTINGS_MENU_ID {
                        menu::emit_open_settings(app);
                    }
                });
            }

            // Native theme + Windows caption before the webview hydrates.
            // `None` keeps WebView2 PreferredColorScheme Auto so matchMedia follows OS.
            if let Some(window) = app.get_webview_window("main") {
                match settings::load(app.handle())
                    .ok()
                    .as_ref()
                    .map(|s| s.theme.as_str())
                {
                    Some("dark") => {
                        let _ = window.set_theme(Some(Theme::Dark));
                        window_chrome::apply_window_chrome(&window, true);
                    }
                    Some("light") => {
                        let _ = window.set_theme(Some(Theme::Light));
                        window_chrome::apply_window_chrome(&window, false);
                    }
                    _ => {
                        let _ = window.set_theme(None);
                        window_chrome::apply_window_chrome(
                            &window,
                            window_chrome::os_prefers_dark(),
                        );
                    }
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
