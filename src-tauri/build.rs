fn main() {
    // Dev Dock icon on macOS is compile-time embedded via generate_context!.
    // tauri-codegen caches the .icns into OUT_DIR and only include_bytes! that
    // cache — so icon file changes won't rebuild unless we declare them here.
    for icon in [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.png",
        "icons/icon.icns",
        "icons/icon.ico",
    ] {
        println!("cargo:rerun-if-changed={icon}");
    }

    tauri_build::build()
}
