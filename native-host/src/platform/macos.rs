use std::ffi::c_void;
use std::ptr;
use std::thread;
use std::time::Duration;

type CGEventRef = *mut c_void;

#[repr(C)]
#[derive(Clone, Copy)]
struct CGPoint {
    x: f64,
    y: f64,
}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
    fn AXIsProcessTrustedWithOptions(options: *const c_void) -> bool;
    fn CGEventCreate(source: *mut c_void) -> CGEventRef;
    fn CGEventCreateKeyboardEvent(
        source: *mut c_void,
        virtual_key: u16,
        key_down: bool,
    ) -> CGEventRef;
    fn CGEventKeyboardSetUnicodeString(event: CGEventRef, length: usize, text: *const u16);
    fn CGEventCreateMouseEvent(
        source: *mut c_void,
        event_type: u32,
        position: CGPoint,
        button: u32,
    ) -> CGEventRef;
    fn CGEventGetLocation(event: CGEventRef) -> CGPoint;
    fn CGEventPost(tap: u32, event: CGEventRef);
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    static kAXTrustedCheckOptionPrompt: *const c_void;
    static kCFBooleanTrue: *const c_void;
    fn CFDictionaryCreate(
        allocator: *const c_void,
        keys: *const *const c_void,
        values: *const *const c_void,
        count: isize,
        key_callbacks: *const c_void,
        value_callbacks: *const c_void,
    ) -> *const c_void;
    fn CFRelease(value: *const c_void);
}

pub fn name() -> &'static str {
    "macos"
}

pub fn accessibility_available(prompt: bool) -> bool {
    unsafe {
        if !prompt {
            return AXIsProcessTrusted();
        }
        let keys = [kAXTrustedCheckOptionPrompt];
        let values = [kCFBooleanTrue];
        let options = CFDictionaryCreate(
            ptr::null(),
            keys.as_ptr(),
            values.as_ptr(),
            1,
            ptr::null(),
            ptr::null(),
        );
        if options.is_null() {
            return AXIsProcessTrusted();
        }
        let trusted = AXIsProcessTrustedWithOptions(options);
        CFRelease(options);
        trusted
    }
}

fn post(event: CGEventRef) -> Result<(), String> {
    if event.is_null() {
        return Err("macOS could not create an input event".into());
    }
    unsafe {
        CGEventPost(0, event);
        CFRelease(event);
    }
    Ok(())
}

pub fn type_text(text: &str) -> Result<(), String> {
    if !accessibility_available(false) {
        return Err("macOS Accessibility permission is required".into());
    }
    for character in text.chars() {
        let units: Vec<u16> = character.to_string().encode_utf16().collect();
        unsafe {
            let down = CGEventCreateKeyboardEvent(ptr::null_mut(), 0, true);
            if down.is_null() {
                return Err("macOS could not create a keyboard event".into());
            }
            CGEventKeyboardSetUnicodeString(down, units.len(), units.as_ptr());
            post(down)?;
            let up = CGEventCreateKeyboardEvent(ptr::null_mut(), 0, false);
            if up.is_null() {
                return Err("macOS could not create a keyboard event".into());
            }
            CGEventKeyboardSetUnicodeString(up, units.len(), units.as_ptr());
            post(up)?;
        }
    }
    Ok(())
}

pub fn press_arrow_right() -> Result<(), String> {
    if !accessibility_available(false) {
        return Err("macOS Accessibility permission is required".into());
    }
    unsafe {
        post(CGEventCreateKeyboardEvent(ptr::null_mut(), 124, true))?;
        post(CGEventCreateKeyboardEvent(ptr::null_mut(), 124, false))?;
    }
    Ok(())
}

pub fn move_pointer(
    x: f64,
    y: f64,
    duration_ms: u64,
    steps: u32,
    cancelled: impl Fn() -> bool,
) -> Result<(), String> {
    if !accessibility_available(false) {
        return Err("macOS Accessibility permission is required".into());
    }
    let probe = unsafe { CGEventCreate(ptr::null_mut()) };
    if probe.is_null() {
        return Err("macOS could not read the pointer position".into());
    }
    let start = unsafe {
        let point = CGEventGetLocation(probe);
        CFRelease(probe);
        point
    };
    let delay = Duration::from_micros(duration_ms * 1000 / steps as u64);
    for step in 1..=steps {
        if cancelled() {
            return Ok(());
        }
        let t = step as f64 / steps as f64;
        let eased = t * t * (3.0 - 2.0 * t);
        let point = CGPoint {
            x: start.x + (x - start.x) * eased,
            y: start.y + (y - start.y) * eased,
        };
        let event = unsafe { CGEventCreateMouseEvent(ptr::null_mut(), 5, point, 0) };
        post(event)?;
        thread::sleep(delay);
    }
    Ok(())
}
