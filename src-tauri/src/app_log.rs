//! 简单文件日志：前端与 Rust 侧的关键错误都落到 app-data/logs/app-YYYY-MM-DD.log，
//! 只保留最近 1 天（写入时顺带清理过期文件），托盘菜单可直接打开。

use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const LOG_DIR_NAME: &str = "logs";
/// 日志保留窗口：24 小时内的文件保留，更早的删除
const LOG_RETENTION_SECS: u64 = 24 * 60 * 60;

pub fn log_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法定位应用数据目录：{error}"))?
        .join(LOG_DIR_NAME);
    std::fs::create_dir_all(&dir).map_err(|error| format!("创建日志目录失败：{error}"))?;
    Ok(dir)
}

fn today_date_key() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or_default();
    super::unix_millis_to_china_date(millis).unwrap_or_default()
}

fn cleanup_expired_logs(dir: &PathBuf) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let is_log = path
            .file_name()
            .map(|name| name.to_string_lossy().starts_with("app"))
            .unwrap_or(false);
        if !is_log {
            continue;
        }

        let expired = std::fs::metadata(&path)
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|modified| modified.elapsed().ok())
            .map(|age| age.as_secs() > LOG_RETENTION_SECS)
            .unwrap_or(false);
        if expired {
            let _ = std::fs::remove_file(&path);
        }
    }
}

pub fn log_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = log_dir(app)?;
    Ok(dir.join(format!("app-{}.log", today_date_key())))
}

pub fn append_log(app: &AppHandle, level: &str, message: &str) {
    let Ok(dir) = log_dir(app) else {
        return;
    };
    cleanup_expired_logs(&dir);

    let path = dir.join(format!("app-{}.log", today_date_key()));
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or_default();
    let time_of_day = format!(
        "{:02}:{:02}:{:02}",
        (now % 86400) / 3600,
        (now % 3600) / 60,
        now % 60
    );

    let entry = format!(
        "[{} {}] [{}] {}\n",
        today_date_key(),
        time_of_day,
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
