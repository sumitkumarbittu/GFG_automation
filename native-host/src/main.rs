mod platform;

use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{self, Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

const VERSION: &str = env!("CARGO_PKG_VERSION");
const MAX_MESSAGE_BYTES: usize = 1024 * 1024;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Command {
    id: String,
    action: String,
    #[serde(default)]
    text: String,
    #[serde(default)]
    key: String,
    #[serde(default)]
    prompt: bool,
    #[serde(default)]
    x: f64,
    #[serde(default)]
    y: f64,
    #[serde(default)]
    duration_ms: u64,
    #[serde(default)]
    steps: u32,
}

fn read_message(input: &mut impl Read) -> io::Result<Option<Vec<u8>>> {
    let mut size = [0u8; 4];
    match input.read_exact(&mut size) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(error) => return Err(error),
    }
    let length = u32::from_le_bytes(size) as usize;
    if length == 0 || length > MAX_MESSAGE_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "invalid native message size",
        ));
    }
    let mut body = vec![0u8; length];
    input.read_exact(&mut body)?;
    Ok(Some(body))
}

fn write_message(output: &Arc<Mutex<io::Stdout>>, value: &Value) -> io::Result<()> {
    let body = serde_json::to_vec(value)?;
    let mut output = output
        .lock()
        .map_err(|_| io::Error::other("stdout lock poisoned"))?;
    output.write_all(&(body.len() as u32).to_le_bytes())?;
    output.write_all(&body)?;
    output.flush()
}

fn response(id: &str, result: Result<Value, String>) -> Value {
    match result {
        Ok(result) => json!({ "id": id, "ok": true, "result": result }),
        Err(error) => json!({ "id": id, "ok": false, "error": error }),
    }
}

fn handle(command: &Command, motion_epoch: &AtomicU64) -> Result<Value, String> {
    match command.action.as_str() {
        "hello" => Ok(json!({
            "version": VERSION,
            "platform": platform::name(),
            "accessibility": platform::accessibility_available(command.prompt)
        })),
        "type" => {
            if !command.key.is_empty() {
                if !command.text.is_empty() || command.key != "ArrowRight" {
                    return Err("only the ArrowRight navigation key is supported".into());
                }
                platform::press_arrow_right()?;
                return Ok(json!({ "key": command.key }));
            }
            if command.text.is_empty() || command.text.chars().count() > 64 {
                return Err("type command must contain 1 to 64 characters".into());
            }
            platform::type_text(&command.text)?;
            Ok(json!({ "characters": command.text.chars().count() }))
        }
        "move" => {
            if !command.x.is_finite() || !command.y.is_finite() {
                return Err("pointer coordinates must be finite".into());
            }
            let duration = command.duration_ms.clamp(50, 950);
            let steps = command.steps.clamp(2, 120);
            let epoch = motion_epoch.load(Ordering::SeqCst);
            platform::move_pointer(command.x, command.y, duration, steps, || {
                motion_epoch.load(Ordering::SeqCst) != epoch
            })?;
            Ok(json!({ "x": command.x, "y": command.y, "durationMs": duration }))
        }
        "stop" => {
            motion_epoch.fetch_add(1, Ordering::SeqCst);
            Ok(json!({ "stopped": true }))
        }
        _ => Err("unsupported native command".into()),
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let output = Arc::new(Mutex::new(io::stdout()));
    let motion_epoch = Arc::new(AtomicU64::new(0));
    let mut input = io::stdin();
    while let Some(body) = read_message(&mut input)? {
        let command: Command = match serde_json::from_slice(&body) {
            Ok(command) => command,
            Err(error) => {
                write_message(
                    &output,
                    &json!({ "id": null, "ok": false, "error": format!("invalid command: {error}") }),
                )?;
                continue;
            }
        };
        let output = Arc::clone(&output);
        let motion_epoch = Arc::clone(&motion_epoch);
        thread::spawn(move || {
            let result = handle(&command, &motion_epoch);
            let _ = write_message(&output, &response(&command.id, result));
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn command(action: &str) -> Command {
        Command {
            id: "test".into(),
            action: action.into(),
            text: String::new(),
            key: String::new(),
            prompt: false,
            x: 0.0,
            y: 0.0,
            duration_ms: 0,
            steps: 0,
        }
    }

    #[test]
    fn rejects_click_commands() {
        let epoch = AtomicU64::new(0);
        assert!(handle(&command("click"), &epoch)
            .unwrap_err()
            .contains("unsupported"));
    }

    #[test]
    fn hello_reports_platform_and_version() {
        let epoch = AtomicU64::new(0);
        let result = handle(&command("hello"), &epoch).unwrap();
        assert_eq!(result["version"], VERSION);
        assert!(result["platform"].is_string());
    }
}
