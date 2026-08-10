mod commands;
mod git;
mod scan;
mod settings;
mod store;

#[cfg(target_os = "macos")]
mod menu;

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::check_git,
            commands::list_repos,
            commands::add_repo,
            commands::remove_repo,
            commands::refresh_status,
            commands::scan_folder,
            commands::batch_fetch,
            commands::batch_update,
            commands::repo_detail,
            commands::add_remote,
            commands::github_publish_info,
            commands::publish_to_github,
            commands::set_settings_menu_label,
            commands::get_settings,
            commands::update_settings,
            commands::get_app_info,
            commands::get_git_info,
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
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
