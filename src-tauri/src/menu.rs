use tauri::{
    menu::{AboutMetadata, Menu, MenuItemBuilder, MenuItemKind, SubmenuBuilder},
    AppHandle, Emitter, Manager, Runtime,
};

pub const SETTINGS_MENU_ID: &str = "settings";
pub const OPEN_SETTINGS_EVENT: &str = "open-settings";

pub fn build_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let app_name = app.package_info().name.clone();

    let settings = MenuItemBuilder::with_id(SETTINGS_MENU_ID, "Settings…")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;

    let app_menu = SubmenuBuilder::new(app, &app_name)
        .about_with_text(
            format!("About {app_name}"),
            Some(AboutMetadata {
                name: Some(app_name.clone()),
                version: Some(app.package_info().version.to_string()),
                ..Default::default()
            }),
        )
        .separator()
        .item(&settings)
        .separator()
        .services()
        .separator()
        .hide_with_text(format!("Hide {app_name}"))
        .hide_others()
        .show_all()
        .separator()
        .quit_with_text(format!("Quit {app_name}"))
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;

    Menu::with_items(app, &[&app_menu, &edit_menu, &window_menu])
}

pub fn emit_open_settings<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    let _ = app.emit(OPEN_SETTINGS_EVENT, ());
}

pub fn set_settings_label<R: Runtime>(app: &AppHandle<R>, label: &str) -> Result<(), String> {
    let menu = app.menu().ok_or_else(|| "menu unavailable".to_string())?;
    match menu.get(SETTINGS_MENU_ID) {
        Some(MenuItemKind::MenuItem(item)) => item.set_text(label).map_err(|e| e.to_string()),
        _ => Err("settings menu item not found".to_string()),
    }
}
