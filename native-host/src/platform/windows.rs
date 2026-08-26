use std::mem::size_of;
use std::thread;
use std::time::Duration;

#[repr(C)]
#[derive(Clone, Copy)]
struct Point {
    x: i32,
    y: i32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct MouseInput {
    dx: i32,
    dy: i32,
    mouse_data: u32,
    flags: u32,
    time: u32,
    extra_info: usize,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct KeyboardInput {
    virtual_key: u16,
    scan: u16,
    flags: u32,
    time: u32,
    extra_info: usize,
}

#[repr(C)]
union InputData {
    mouse: MouseInput,
    keyboard: KeyboardInput,
}

#[repr(C)]
struct Input {
    kind: u32,
    data: InputData,
}

#[link(name = "user32")]
extern "system" {
    fn SendInput(count: u32, inputs: *const Input, size: i32) -> u32;
    fn GetCursorPos(point: *mut Point) -> i32;
    fn GetSystemMetrics(index: i32) -> i32;
}

const INPUT_MOUSE: u32 = 0;
const INPUT_KEYBOARD: u32 = 1;
const KEYEVENTF_KEYUP: u32 = 0x0002;
const KEYEVENTF_UNICODE: u32 = 0x0004;
const MOUSEEVENTF_MOVE: u32 = 0x0001;
const MOUSEEVENTF_VIRTUALDESK: u32 = 0x4000;
const MOUSEEVENTF_ABSOLUTE: u32 = 0x8000;

pub fn name() -> &'static str {
    "windows"
}
pub fn accessibility_available(_: bool) -> bool {
    true
}

fn send(input: Input) -> Result<(), String> {
    let sent = unsafe { SendInput(1, &input, size_of::<Input>() as i32) };
    if sent == 1 {
        Ok(())
    } else {
        Err("Windows SendInput failed".into())
    }
}

pub fn type_text(text: &str) -> Result<(), String> {
    for unit in text.encode_utf16() {
        for flags in [KEYEVENTF_UNICODE, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP] {
            send(Input {
                kind: INPUT_KEYBOARD,
                data: InputData {
                    keyboard: KeyboardInput {
                        virtual_key: 0,
                        scan: unit,
                        flags,
                        time: 0,
                        extra_info: 0,
                    },
                },
            })?;
        }
    }
    Ok(())
}

pub fn press_arrow_right() -> Result<(), String> {
    for flags in [0, KEYEVENTF_KEYUP] {
        send(Input {
            kind: INPUT_KEYBOARD,
            data: InputData {
                keyboard: KeyboardInput {
                    virtual_key: 0x27,
                    scan: 0,
                    flags,
                    time: 0,
                    extra_info: 0,
                },
            },
        })?;
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
    let mut start = Point { x: 0, y: 0 };
    if unsafe { GetCursorPos(&mut start) } == 0 {
        return Err("Windows could not read the pointer position".into());
    }
    let left = unsafe { GetSystemMetrics(76) };
    let top = unsafe { GetSystemMetrics(77) };
    let width = unsafe { GetSystemMetrics(78) }.max(2);
    let height = unsafe { GetSystemMetrics(79) }.max(2);
    let delay = Duration::from_micros(duration_ms * 1000 / steps as u64);
    for step in 1..=steps {
        if cancelled() {
            return Ok(());
        }
        let t = step as f64 / steps as f64;
        let eased = t * t * (3.0 - 2.0 * t);
        let px = start.x as f64 + (x - start.x as f64) * eased;
        let py = start.y as f64 + (y - start.y as f64) * eased;
        let dx = (((px - left as f64) * 65535.0) / (width - 1) as f64).round() as i32;
        let dy = (((py - top as f64) * 65535.0) / (height - 1) as f64).round() as i32;
        send(Input {
            kind: INPUT_MOUSE,
            data: InputData {
                mouse: MouseInput {
                    dx,
                    dy,
                    mouse_data: 0,
                    flags: MOUSEEVENTF_MOVE | MOUSEEVENTF_VIRTUALDESK | MOUSEEVENTF_ABSOLUTE,
                    time: 0,
                    extra_info: 0,
                },
            },
        })?;
        thread::sleep(delay);
    }
    Ok(())
}
