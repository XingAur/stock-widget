use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub type AppResult<T> = Result<T, String>;

#[allow(dead_code)]
pub const APP_STATE_FILE: &str = "app-state.json";
#[allow(dead_code)]
pub const WINDOW_STATE_FILE: &str = "window-state.json";
pub const QUOTE_CACHE_FILE: &str = "quote-cache.json";

pub fn app_data_file(app: &AppHandle, file_name: &str) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法定位应用数据目录：{error}"))?;
    Ok(dir.join(file_name))
}

pub fn write_atomic(path: &PathBuf, contents: &[u8]) -> AppResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| "状态文件缺少父目录".to_string())?;
    std::fs::create_dir_all(parent).map_err(|error| format!("创建应用数据目录失败：{error}"))?;

    let temp_path = path.with_extension("tmp");
    std::fs::File::create(&temp_path)
        .and_then(|mut file| {
            use std::io::Write;
            file.write_all(contents).map(|_| file)
        })
        .and_then(|file| file.sync_all())
        .map_err(|error| format!("写入状态临时文件失败：{error}"))?;

    std::fs::rename(temp_path, path).map_err(|error| format!("落盘状态文件失败：{error}"))
}

pub fn read_state_file(app: &AppHandle, file_name: &str) -> Option<String> {
    let path = app_data_file(app, file_name).ok()?;
    std::fs::read_to_string(path)
        .ok()
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}
