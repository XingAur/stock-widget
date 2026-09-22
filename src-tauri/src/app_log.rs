//! 简单文件日志：前端与 Rust 侧的关键错误都落到 app-data/logs/app.log，
//! 超过 512KB 轮转为 app.old，托盘菜单可直接打开。

use std::io::Write;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const LOG_FILE: &str = "app.log";
const ROTATED_LOG_FILE: &str = "app.old";
const MAX_LOG_BYTES: u64 = 512 * 1024;

pub fn log_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法定位应用数据目录：{error}"))?
        .join("logs");
    std::fs::create_dir_all(&dir).map_err(|error| format!("创建日志目录失败：{error}"))?;
    Ok(dir.join(LOG_FILE))
}

fn china_timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or_default();
    super::unix_millis_to_china_date(now).unwrap_or_default()
}

pub fn append_log(app: &AppHandle, level: &str, message: &str) {
    let Ok(path) = log_file_path(app) else {
        return;
    };

    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() > MAX_LOG_BYTES {
            let rotated = path.with_file_name(ROTATED_LOG_FILE);
            let _ = std::fs::rename(&path, rotated);
        }
    }

    let entry = format!(
        "[{}] [{}] {}\n",
        china_timestamp(),
        level.trim().to_uppercase(),
        message.trim().replace('\n', " | ")
    );
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let _ = file.write_all(entry.as_bytes());
    }
}

pub fn install_panic_hook(app_handle: &AppHandle) {
    let app = app_handle.clone();
    std::panic::set_hook(Box::new(move |info| {
        append_log(&app, "PANIC", &info.to_string());
    }));
}
