use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;
use tauri::AppHandle;

use crate::http::{self, http_client};
use crate::paths::AppResult;
use crate::update_guard;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub release_url: String,
    pub download_url: Option<String>,
    pub notes: String,
}

const GITHUB_LATEST_RELEASE_API: &str =
    "https://api.github.com/repos/XingAur/stock-widget/releases/latest";

fn normalize_version(tag: &str) -> String {
    tag.trim().trim_start_matches('v').to_string()
}

pub fn version_is_newer(latest: &str, current: &str) -> bool {
    let parse = |value: &str| -> Vec<u64> {
        value
            .split('.')
            .map(|part| part.trim().parse::<u64>().unwrap_or(0))
            .collect()
    };
    let latest_parts = parse(latest);
    let current_parts = parse(current);
    for index in 0..latest_parts.len().max(current_parts.len()) {
        let left = latest_parts.get(index).copied().unwrap_or(0);
        let right = current_parts.get(index).copied().unwrap_or(0);
        if left != right {
            return left > right;
        }
    }
    false
}

pub fn parse_latest_release(body: &str, current_version: &str) -> UpdateCheckResult {
    let Ok(json) = serde_json::from_str::<Value>(body) else {
        return UpdateCheckResult {
            current_version: current_version.to_string(),
            latest_version: current_version.to_string(),
            has_update: false,
            release_url: String::new(),
            download_url: None,
            notes: "解析更新信息失败".to_string(),
        };
    };
    let tag = json
        .get("tag_name")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let release_url = json
        .get("html_url")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let notes: String = json
        .get("body")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .chars()
        .take(600)
        .collect();
    let download_url = json
        .get("assets")
        .and_then(Value::as_array)
        .and_then(|assets| {
            assets
                .iter()
                .filter_map(|asset| {
                    let name = asset.get("name")?.as_str()?;
                    let url = asset.get("browser_download_url")?.as_str()?;
                    (name.ends_with("_x64-setup.exe")).then_some(url.to_string())
                })
                .next_back()
        });
    let latest_version = normalize_version(tag);
    UpdateCheckResult {
        current_version: current_version.to_string(),
        latest_version: latest_version.clone(),
        has_update: !latest_version.is_empty()
            && version_is_newer(&latest_version, current_version),
        release_url,
        download_url,
        notes,
    }
}

fn app_log_buffer(message: &str) {
    eprintln!("[update] {message}");
}

#[tauri::command]
pub async fn check_update() -> AppResult<UpdateCheckResult> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let client = http_client()?;
    let mut last_error = String::new();
    for attempt in 1..=3u32 {
        let request = client
            .get(GITHUB_LATEST_RELEASE_API)
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", http::USER_AGENT)
            .timeout(Duration::from_secs(15));
        match request.send().await {
            Ok(response) => {
                let status = response.status();
                let body = response
                    .text()
                    .await
                    .map_err(|error| format!("读取更新信息失败：{error}"))?;
                if status.is_success() {
                    return Ok(parse_latest_release(&body, &current_version));
                }
                last_error = format!("更新服务返回 {status}");
                if status.as_u16() == 403 || status.is_server_error() {
                    app_log_buffer(&format!("检查更新第 {attempt} 次尝试被拒：{status}"));
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    continue;
                }
                return Err(last_error);
            }
            Err(error) => {
                last_error = format!("网络无法访问更新服务：{error}");
                if attempt < 3 {
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
            }
        }
    }
    Err(format!(
        "{last_error}（可稍后再试，或在更新窗口手动打开下载页）"
    ))
}

#[tauri::command]
pub async fn download_update(url: String) -> AppResult<String> {
    let trimmed = url.trim().to_string();
    if !update_guard::is_allowed_update_url(&trimmed) {
        return Err("更新下载地址不合法".to_string());
    }
    let client = http_client()?;
    let response = client
        .get(&trimmed)
        .timeout(Duration::from_secs(300))
        .send()
        .await
        .map_err(|error| format!("下载更新失败：{error}"))?
        .error_for_status()
        .map_err(|error| format!("下载更新失败：{error}"))?;
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取更新包失败：{error}"))?;
    let dir = update_guard::update_dir();
    std::fs::create_dir_all(&dir).map_err(|error| format!("创建更新目录失败：{error}"))?;
    let file_name = update_guard::installer_file_name(&trimmed);
    let path = dir.join(file_name);
    std::fs::write(&path, &bytes).map_err(|error| format!("保存更新包失败：{error}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn run_installer(app: AppHandle, path: String) -> AppResult<()> {
    let installer = update_guard::validate_installer_path(&path)?;
    crate::app_log::append_log(&app, "INFO", &format!("启动更新安装程序：{}", installer.display()));
    std::process::Command::new(&installer)
        .spawn()
        .map_err(|error| format!("启动安装程序失败：{error}"))?;
    app.exit(0);
    Ok(())
}

#[cfg(windows)]
fn spawn_hidden(program: &str, args: &[&str]) -> Result<std::process::Child, String> {
    use std::os::windows::process::CommandExt;
    std::process::Command::new(program)
        .args(args)
        .creation_flags(0x0800_0000)
        .spawn()
        .map_err(|error| error.to_string())
}

#[cfg(not(windows))]
fn spawn_hidden(program: &str, args: &[&str]) -> Result<std::process::Child, String> {
    std::process::Command::new(program)
        .args(args)
        .spawn()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_release_page(url: String) -> AppResult<()> {
    let trimmed = url.trim().to_string();
    if !trimmed.starts_with("https://") {
        return Err("下载页地址不合法".to_string());
    }
    #[allow(clippy::zombie_processes)]
    spawn_hidden("cmd", &["/C", "start", "", &trimmed])
        .map_err(|error| format!("打开下载页失败：{error}"))?;
    Ok(())
}
