#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "macos")]
pub use macos::*;
#[cfg(target_os = "windows")]
pub use windows::*;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn name() -> &'static str {
    "unsupported"
}
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn accessibility_available(_: bool) -> bool {
    false
}
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn type_text(_: &str) -> Result<(), String> {
    Err("only macOS and Windows are supported".into())
}
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn press_arrow_right() -> Result<(), String> {
    Err("only macOS and Windows are supported".into())
}
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn move_pointer(_: f64, _: f64, _: u64, _: u32, _: impl Fn() -> bool) -> Result<(), String> {
    Err("only macOS and Windows are supported".into())
}
