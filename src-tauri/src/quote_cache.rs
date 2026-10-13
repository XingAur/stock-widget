use std::collections::HashSet;
use tauri::AppHandle;

use crate::models::Stock;
use crate::paths::{app_data_file, read_state_file, write_atomic, QUOTE_CACHE_FILE};

pub fn save_quotes(app: &AppHandle, stocks: &[Stock]) {
    if stocks.is_empty() {
        return;
    }
    let Ok(payload) = serde_json::to_string(stocks) else {
        return;
    };
    if let Ok(path) = app_data_file(app, QUOTE_CACHE_FILE) {
        let _ = write_atomic(&path, payload.as_bytes());
    }
}

pub fn load_quotes(app: &AppHandle, codes: &[String]) -> Vec<Stock> {
    let Some(raw) = read_state_file(app, QUOTE_CACHE_FILE) else {
        return Vec::new();
    };
    let Ok(all) = serde_json::from_str::<Vec<Stock>>(&raw) else {
        return Vec::new();
    };
    let wanted: HashSet<String> = codes
        .iter()
        .map(|code| code.replace("sh", "").replace("sz", "").replace("bj", ""))
        .collect();
    all.into_iter()
        .filter(|stock| wanted.contains(&stock.code))
        .collect()
}
