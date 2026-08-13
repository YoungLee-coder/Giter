//! Sync native window chrome colors with the app theme (Windows 11+).
//!
//! `setTheme(Light)` alone still leaves the system caption tint (grey/blue).
//! `DWMWA_CAPTION_COLOR` paints the title bar to match our white / dark canvas.
//!
//! Also exposes OS dark-mode detection that is independent of WebView2's
//! `PreferredColorScheme` (which `Window.setTheme` mutates and can poison
//! `prefers-color-scheme` / `matchMedia` on Windows).

#![allow(dead_code)]

use tauri::WebviewWindow;

#[cfg(windows)]
#[link(name = "dwmapi")]
unsafe extern "system" {
    fn DwmSetWindowAttribute(
        hwnd: isize,
        dw_attribute: u32,
        pv_attribute: *const core::ffi::c_void,
        cb_attribute: u32,
    ) -> i32;
}

#[cfg(windows)]
#[link(name = "advapi32")]
unsafe extern "system" {
    fn RegGetValueW(
        hkey: isize,
        lp_sub_key: *const u16,
        lp_value: *const u16,
        dw_flags: u32,
        pdw_type: *mut u32,
        pv_data: *mut core::ffi::c_void,
        pcb_data: *mut u32,
    ) -> i32;
}

#[cfg(windows)]
const DWMWA_USE_IMMERSIVE_DARK_MODE: u32 = 20;
#[cfg(windows)]
const DWMWA_BORDER_COLOR: u32 = 34;
#[cfg(windows)]
const DWMWA_CAPTION_COLOR: u32 = 35;
#[cfg(windows)]
const DWMWA_TEXT_COLOR: u32 = 36;

#[cfg(windows)]
const HKEY_CURRENT_USER: isize = 0x80000001u32 as isize;
#[cfg(windows)]
const RRF_RT_REG_DWORD: u32 = 0x00000010;

/// Apply caption / border / title-text colors for `dark` or light chrome.
#[allow(unused_variables)]
pub fn apply_window_chrome(window: &WebviewWindow, dark: bool) {
    #[cfg(windows)]
    {
        let Ok(hwnd) = window.hwnd() else {
            return;
        };
        let hwnd = hwnd.0 as isize;

        // COLORREF = 0x00BBGGRR
        let caption: u32 = if dark {
            // Match --background #121417
            colorref(0x12, 0x14, 0x17)
        } else {
            colorref(0xff, 0xff, 0xff)
        };
        let border = caption;
        let text: u32 = if dark {
            colorref(0xff, 0xff, 0xff)
        } else {
            colorref(0x1a, 0x1a, 0x1a)
        };
        let immersive: i32 = if dark { 1 } else { 0 };

        unsafe {
            set_dwm_attr(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, &immersive);
            set_dwm_attr(hwnd, DWMWA_CAPTION_COLOR, &caption);
            set_dwm_attr(hwnd, DWMWA_BORDER_COLOR, &border);
            set_dwm_attr(hwnd, DWMWA_TEXT_COLOR, &text);
        }
    }
}

#[cfg(windows)]
const fn colorref(r: u8, g: u8, b: u8) -> u32 {
    ((b as u32) << 16) | ((g as u32) << 8) | (r as u32)
}

#[cfg(windows)]
unsafe fn set_dwm_attr<T>(hwnd: isize, attr: u32, value: &T) {
    let _ = DwmSetWindowAttribute(
        hwnd,
        attr,
        (value as *const T).cast::<core::ffi::c_void>(),
        core::mem::size_of::<T>() as u32,
    );
}

/// Whether the OS apps theme is dark (Windows: AppsUseLightTheme == 0).
///
/// Independent of WebView2 PreferredColorScheme / `prefers-color-scheme`.
pub fn os_prefers_dark() -> bool {
    #[cfg(windows)]
    {
        apps_use_light_theme().map(|light| !light).unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[cfg(windows)]
fn apps_use_light_theme() -> Option<bool> {
    let sub_key: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize\0"
        .encode_utf16()
        .collect();
    let value_name: Vec<u16> = "AppsUseLightTheme\0".encode_utf16().collect();
    let mut data: u32 = 1;
    let mut size = std::mem::size_of::<u32>() as u32;
    let mut ty = 0u32;
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            sub_key.as_ptr(),
            value_name.as_ptr(),
            RRF_RT_REG_DWORD,
            &mut ty,
            (&mut data as *mut u32).cast::<core::ffi::c_void>(),
            &mut size,
        )
    };
    if status == 0 {
        Some(data != 0)
    } else {
        None
    }
}

/// Frontend-facing: `dark` when the resolved UI theme is dark.
#[tauri::command]
pub fn sync_window_chrome(window: WebviewWindow, dark: bool) {
    apply_window_chrome(&window, dark);
}

/// Frontend-facing: OS app dark mode (not WebView prefers-color-scheme).
#[tauri::command]
pub fn system_prefers_dark() -> bool {
    #[cfg(windows)]
    {
        os_prefers_dark()
    }
    #[cfg(not(windows))]
    {
        // Non-Windows: frontend should use matchMedia; this is a harmless fallback.
        false
    }
}
