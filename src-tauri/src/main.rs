#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_log;
mod http;
mod ocr;

#[cfg(test)]
use http::decode_utf8_text;
use http::{fetch_text, fetch_text_gbk, http_client};
use ocr::ocr_image_bytes;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    io::Write,
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};
use tauri::{
    menu::{Menu, MenuItem},
    AppHandle, Emitter, Manager, WebviewWindow, WindowEvent,
};

type AppResult<T> = Result<T, String>;

const APP_STATE_FILE: &str = "app-state.json";
const WINDOW_STATE_FILE: &str = "window-state.json";
const WINDOW_SAVE_DEBOUNCE: Duration = Duration::from_millis(600);
const COMPACT_WINDOW_WIDTH: f64 = 280.0;
const EXPANDED_WINDOW_WIDTH_THRESHOLD: f64 = 560.0;
const MIN_VISIBLE_WINDOW_PX: i32 = 60;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Stock {
    code: String,
    name: String,
    price: f64,
    change: f64,
    change_percent: f64,
    high: f64,
    low: f64,
    open: f64,
    prev_close: f64,
    volume: i64,
    amount: f64,
    time: String,
    total_market_cap: f64,
    circulation_market_cap: f64,
    turnover_rate: f64,
    volume_ratio: f64,
    order_book: Option<OrderBook>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SearchResult {
    code: String,
    name: String,
    market: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct FundQuote {
    code: String,
    name: String,
    nav: Option<f64>,
    nav_date: String,
    change_percent: Option<f64>,
    estimate_nav: Option<f64>,
    estimate_change_percent: Option<f64>,
    estimate_time: String,
    sector: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
struct FundSearchResult {
    code: String,
    name: String,
    #[serde(rename = "type")]
    fund_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct FundNavPoint {
    date: String,
    nav: f64,
    accumulated_nav: f64,
    change_percent: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct FundRank {
    current: i64,
    total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct FundProfile {
    code: String,
    fund_type: String,
    risk_level: String,
    one_year_return: Option<f64>,
    rank: Option<FundRank>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct FundIndustry {
    name: String,
    percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct FundHolding {
    code: String,
    name: String,
    percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct FundAllocation {
    report_date: String,
    sector: String,
    industries: Vec<FundIndustry>,
    holdings: Vec<FundHolding>,
}

const FUND_ALLOCATION_CACHE_TTL: Duration = Duration::from_secs(6 * 60 * 60);

#[derive(Clone)]
struct CachedFundAllocation {
    fetched_at: Instant,
    value: FundAllocation,
}

impl CachedFundAllocation {
    fn is_fresh_at(&self, now: Instant) -> bool {
        now.saturating_duration_since(self.fetched_at) < FUND_ALLOCATION_CACHE_TTL
    }
}

static FUND_ALLOCATION_CACHE: OnceLock<Mutex<HashMap<String, CachedFundAllocation>>> =
    OnceLock::new();

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MinutePoint {
    time: String,
    price: f64,
    volume: i64,
    average_price: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KlinePoint {
    time: String,
    open: f64,
    close: f64,
    high: f64,
    low: f64,
    volume: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OrderLevel {
    price: f64,
    volume: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OrderBook {
    bids: Vec<OrderLevel>,
    asks: Vec<OrderLevel>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IndexData {
    code: String,
    name: String,
    price: f64,
    change: f64,
    change_percent: f64,
    volume: f64,
    sparkline: Vec<f64>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
struct GlobalIndex {
    code: String,
    name: String,
    price: f64,
    change: f64,
    change_percent: f64,
    time: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    gain_count: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    lose_count: Option<i64>,
}

const GLOBAL_INDEX_TENCENT_MARKETS: &[(&str, &[&str])] = &[
    (
        "cn",
        &["sh000001", "sz399001", "sz399006", "sh000688", "sh000300"],
    ),
    ("hk", &["hkHSI", "hkHSTECH", "hkHSCEI"]),
    ("us", &["usDJI", "usIXIC", "usINX"]),
];

const GLOBAL_INDEX_EASTMONEY_WORLD: &str =
    "100.N225,100.KS11,100.FTSE,100.GDAXI,100.FCHI,100.SENSEX";

fn parse_tencent_global_index(parts: &[&str], code: &str) -> Option<GlobalIndex> {
    if parts.len() < 33 {
        return None;
    }

    let price = parse_f64(parts.get(3).copied());
    let time = format_quote_time(parts.get(30).copied().unwrap_or_default());
    if price <= 0.0 || time.is_empty() {
        return None;
    }

    Some(GlobalIndex {
        code: code.to_string(),
        name: parts.get(1).copied().unwrap_or_default().trim().to_string(),
        price,
        change: parse_f64(parts.get(31).copied()),
        change_percent: parse_f64(parts.get(32).copied()),
        time,
        gain_count: None,
        lose_count: None,
    })
}

fn format_eastmoney_timestamp(timestamp_seconds: i64) -> Option<String> {
    let timestamp_ms = timestamp_seconds.checked_mul(1000)?;
    let date = unix_millis_to_china_date(timestamp_ms)?;
    let china_seconds = timestamp_seconds + 8 * 60 * 60;
    let seconds_of_day = china_seconds.rem_euclid(86_400);

    Some(format!(
        "{date} {:02}:{:02}:{:02}",
        seconds_of_day / 3600,
        (seconds_of_day % 3600) / 60,
        seconds_of_day % 60
    ))
}

fn parse_eastmoney_global_indices(text: &str) -> Vec<GlobalIndex> {
    parse_eastmoney_rows(text, false)
}

/// 统计/风格类条目（昨日连板、涨停复盘、大小盘风格等）不是概念板块，从榜单里剔除
fn is_statistics_style_sector(name: &str) -> bool {
    const KEYWORDS: &[&str] = &[
        "昨日",
        "连板",
        "涨停",
        "跌停",
        "风格",
        "大盘",
        "中盘",
        "小盘",
        "ST板块",
        "次新股",
        "破净",
        "高送转",
        "预盈预增",
        "预亏预减",
    ];

    KEYWORDS.iter().any(|keyword| name.contains(keyword))
}

fn parse_eastmoney_sectors(text: &str) -> Vec<GlobalIndex> {
    parse_eastmoney_rows(text, true)
        .into_iter()
        .filter(|index| !is_statistics_style_sector(&index.name))
        .collect()
}

fn parse_eastmoney_rows(text: &str, sectors: bool) -> Vec<GlobalIndex> {
    let Ok(json) = serde_json::from_str::<Value>(text) else {
        return Vec::new();
    };
    let Some(rows) = json["data"]["diff"].as_array() else {
        return Vec::new();
    };

    rows.iter()
        .filter_map(|row| {
            let number = |key: &str| row[key].as_f64().filter(|value| value.is_finite());
            let price = number("f2")?;
            let change_percent = number("f3").unwrap_or(0.0);
            let change = number("f4").unwrap_or(0.0);
            let code = row["f12"].as_str()?.trim().to_string();
            let name = row["f14"].as_str()?.trim().to_string();
            let timestamp = number("f124").map(|seconds| seconds as i64)?;
            let time = format_eastmoney_timestamp(timestamp)?;
            if price <= 0.0 || code.is_empty() || name.is_empty() {
                return None;
            }

            Some(GlobalIndex {
                code,
                name,
                price,
                change,
                change_percent,
                time,
                gain_count: if sectors {
                    row["f104"].as_i64().filter(|value| *value >= 0)
                } else {
                    None
                },
                lose_count: if sectors {
                    row["f105"].as_i64().filter(|value| *value >= 0)
                } else {
                    None
                },
            })
        })
        .collect()
}

async fn fetch_tencent_global_indices(market: &str) -> AppResult<Vec<GlobalIndex>> {
    let Some((_, codes)) = GLOBAL_INDEX_TENCENT_MARKETS
        .iter()
        .find(|(key, _)| *key == market)
    else {
        return Err(format!("不支持的市场分组：{market}"));
    };

    let url = format!("https://qt.gtimg.cn/q={}", codes.join(","));
    let text = fetch_text_gbk(&url, None).await?;
    Ok(parse_tencent_lines(&text, |code, payload| {
        let parts = payload.split('~').collect::<Vec<_>>();
        parse_tencent_global_index(&parts, code)
    }))
}

async fn fetch_world_global_indices() -> AppResult<Vec<GlobalIndex>> {
    let url = format!(
        "https://push2.eastmoney.com/api/qt/ulist.np/get?secids={GLOBAL_INDEX_EASTMONEY_WORLD}&fields=f2,f3,f4,f12,f14,f124&fltt=2"
    );
    let text = fetch_text(&url, Some("https://quote.eastmoney.com/")).await?;
    Ok(parse_eastmoney_global_indices(&text))
}

/// A股板块榜拉全量（用户要求不截断），分页 100 条直到取完；安全上限 8 页
const SECTOR_PAGE_SIZE: usize = 100;
const SECTOR_MAX_PAGES: usize = 8;

async fn fetch_cn_sector_list(sector_type: &str) -> AppResult<Vec<GlobalIndex>> {
    let mut all = Vec::new();
    let mut seen_codes = std::collections::HashSet::new();

    for page in 1..=SECTOR_MAX_PAGES {
        // fid=f62 按主力净流入降序：资金涌入最多的热门板块排最前
        let url = format!(
            "https://push2.eastmoney.com/api/qt/clist/get?pn={page}&pz={SECTOR_PAGE_SIZE}&po=1&np=1&fltt=2&invt=2&fid=f62&fs=m:90+t:{sector_type}&fields=f2,f3,f4,f12,f14,f104,f105,f124"
        );
        let text = fetch_text(&url, Some("https://quote.eastmoney.com/")).await?;
        let page_rows = parse_eastmoney_sectors(&text);
        let page_len = page_rows.len();
        for index in page_rows {
            if seen_codes.insert(index.code.clone()) {
                all.push(index);
            }
        }

        if page_len < SECTOR_PAGE_SIZE {
            break;
        }
    }

    Ok(all)
}

/// 美股行业板块：标普 500 的 11 个 SPDR 行业 ETF（GICS 官方行业分类）
const US_SECTOR_ETFS: &str =
    "107.XLK,107.XLF,107.XLE,107.XLV,107.XLI,107.XLY,107.XLP,107.XLB,107.XLU,107.XLRE,107.XLC";

fn simplify_us_sector_name(code: &str, fallback: &str) -> String {
    match code {
        "XLK" => "科技",
        "XLF" => "金融",
        "XLE" => "能源",
        "XLV" => "医疗",
        "XLI" => "工业",
        "XLY" => "可选消费",
        "XLP" => "日常消费",
        "XLB" => "原材料",
        "XLU" => "公用事业",
        "XLRE" => "房地产",
        "XLC" => "通信服务",
        _ => fallback,
    }
    .to_string()
}

async fn fetch_us_sector_indices() -> AppResult<Vec<GlobalIndex>> {
    let url = format!(
        "https://push2.eastmoney.com/api/qt/ulist.np/get?secids={US_SECTOR_ETFS}&fields=f2,f3,f4,f12,f14,f124&fltt=2"
    );
    let text = fetch_text(&url, Some("https://quote.eastmoney.com/")).await?;
    Ok(parse_eastmoney_global_indices(&text)
        .into_iter()
        .map(|mut index| {
            index.name = simplify_us_sector_name(&index.code, &index.name);
            index
        })
        .collect())
}

#[tauri::command]
async fn fetch_global_indices(market: String) -> AppResult<Vec<GlobalIndex>> {
    let market = market.trim();
    if market == "world" {
        return fetch_world_global_indices().await;
    }
    if market == "sectors" {
        // 概念板块（热点题材，约 500 个）
        return fetch_cn_sector_list("3").await;
    }
    if market == "industry-sectors" {
        // 行业板块（证监会行业分类，约 86 个，分类稳定，主流 App 板块页默认）
        return fetch_cn_sector_list("2").await;
    }
    if market == "us-sectors" {
        return fetch_us_sector_indices().await;
    }

    fetch_tencent_global_indices(market).await
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct WindowGeometry {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

fn app_data_file(app: &AppHandle, file_name: &str) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法定位应用数据目录：{error}"))?;
    Ok(dir.join(file_name))
}

fn write_atomic(path: &PathBuf, contents: &[u8]) -> AppResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| "状态文件缺少父目录".to_string())?;
    std::fs::create_dir_all(parent).map_err(|error| format!("创建应用数据目录失败：{error}"))?;

    let temp_path = path.with_extension("tmp");
    std::fs::File::create(&temp_path)
        .and_then(|mut file| file.write_all(contents).map(|_| file))
        .and_then(|mut file| file.sync_all())
        .map_err(|error| format!("写入状态临时文件失败：{error}"))?;

    std::fs::rename(&temp_path, path).map_err(|error| format!("落盘状态文件失败：{error}"))
}

fn read_state_file(app: &AppHandle, file_name: &str) -> Option<String> {
    let path = app_data_file(app, file_name).ok()?;
    std::fs::read_to_string(path)
        .ok()
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

#[tauri::command]
fn persist_app_state(app: AppHandle, state: String) -> AppResult<()> {
    if state.trim().is_empty() {
        return Err("应用状态内容为空，已拒绝覆盖持久化文件".to_string());
    }

    write_atomic(&app_data_file(&app, APP_STATE_FILE)?, state.as_bytes())
}

#[tauri::command]
fn load_app_state(app: AppHandle) -> AppResult<Option<String>> {
    Ok(read_state_file(&app, APP_STATE_FILE))
}

fn save_window_geometry(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let (Ok(position), Ok(size)) = (window.outer_position(), window.outer_size()) else {
        return;
    };

    let geometry = WindowGeometry {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    };
    let Ok(payload) = serde_json::to_string(&geometry) else {
        return;
    };

    if let Ok(path) = app_data_file(app, WINDOW_STATE_FILE) {
        let _ = write_atomic(&path, payload.as_bytes());
    }
}

fn is_geometry_visible_on_any_monitor(window: &WebviewWindow, geometry: &WindowGeometry) -> bool {
    let Ok(monitors) = window.available_monitors() else {
        return true;
    };
    if monitors.is_empty() {
        return true;
    }

    monitors.iter().any(|monitor| {
        let monitor_x = monitor.position().x;
        let monitor_y = monitor.position().y;
        let monitor_right = monitor_x + monitor.size().width as i32;
        let monitor_bottom = monitor_y + monitor.size().height as i32;
        let visible_x = geometry
            .x
            .saturating_add(geometry.width as i32)
            .min(monitor_right)
            .saturating_sub(geometry.x.max(monitor_x));
        let visible_y = geometry
            .y
            .saturating_add(geometry.height as i32)
            .min(monitor_bottom)
            .saturating_sub(geometry.y.max(monitor_y));
        visible_x >= MIN_VISIBLE_WINDOW_PX.min(geometry.width as i32)
            && visible_y >= MIN_VISIBLE_WINDOW_PX.min(geometry.height as i32)
    })
}

fn restore_window_geometry(window: &WebviewWindow) {
    let Some(payload) = read_state_file(window.app_handle(), WINDOW_STATE_FILE) else {
        return;
    };
    let Ok(saved) = serde_json::from_str::<WindowGeometry>(&payload) else {
        return;
    };
    if saved.width == 0 || saved.height == 0 {
        return;
    }

    let mut geometry = saved.clone();
    let Ok(scale_factor) = window.scale_factor() else {
        return;
    };
    let logical_width = saved.width as f64 / scale_factor;
    if logical_width > EXPANDED_WINDOW_WIDTH_THRESHOLD {
        // 上次退出时详情面板展开；重启后详情不会自动恢复，回到紧凑宽度。
        geometry.width = (COMPACT_WINDOW_WIDTH * scale_factor).round() as u32;
    }

    if !is_geometry_visible_on_any_monitor(window, &geometry) {
        let _ = window.center();
        return;
    }

    let _ = window.set_position(tauri::PhysicalPosition::new(geometry.x, geometry.y));
    let _ = window.set_size(tauri::PhysicalSize::new(geometry.width, geometry.height));
}

fn watch_window_geometry(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let (sender, mut receiver) = tokio::sync::mpsc::channel::<()>(1);
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Moved(_) | WindowEvent::Resized(_)) {
            let _ = sender.try_send(());
        }
    });

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while receiver.recv().await.is_some() {
            let settled = tokio::time::timeout(WINDOW_SAVE_DEBOUNCE, receiver.recv())
                .await
                .is_err();
            if !settled {
                continue;
            }
            save_window_geometry(&app_handle);
        }
    });
}

#[tauri::command]
async fn ocr_image(image_base64: String) -> AppResult<Vec<String>> {
    // OCR 的 WinRT 调用全程同步阻塞（数百毫秒到数秒），必须放到线程池执行；
    // 同步命令会占用 Tauri 主线程，导致窗口"未响应"并触发系统 ghost 窗口。
    tauri::async_runtime::spawn_blocking(move || {
        use base64::Engine;

        let cleaned = image_base64.trim();
        let payload = cleaned
            .strip_prefix("data:image")
            .and_then(|rest| rest.split_once(','))
            .map(|(_, data)| data)
            .unwrap_or(cleaned);

        let bytes = base64::engine::general_purpose::STANDARD
            .decode(payload)
            .map_err(|error| format!("图片数据解码失败：{error}"))?;
        if bytes.is_empty() {
            return Err("图片内容为空".to_string());
        }

        ocr_image_bytes(&bytes)
    })
    .await
    .map_err(|error| format!("图片识别任务失败：{error}"))?
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UpdateCheckResult {
    current_version: String,
    latest_version: String,
    has_update: bool,
    release_url: String,
    download_url: Option<String>,
    notes: String,
}

const GITHUB_LATEST_RELEASE_API: &str =
    "https://api.github.com/repos/XingAur/stock-widget/releases/latest";

fn normalize_version(tag: &str) -> String {
    tag.trim().trim_start_matches('v').to_string()
}

fn version_is_newer(latest: &str, current: &str) -> bool {
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

fn parse_latest_release(body: &str, current_version: &str) -> UpdateCheckResult {
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

#[tauri::command]
async fn check_update() -> AppResult<UpdateCheckResult> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let client = http_client()?;
    let response = client
        .get(GITHUB_LATEST_RELEASE_API)
        .header("Accept", "application/vnd.github+json")
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|error| format!("检查更新失败：{error}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("读取更新信息失败：{error}"))?;
    if !status.is_success() {
        return Err(format!("更新服务返回 {status}"));
    }

    Ok(parse_latest_release(&body, &current_version))
}

#[tauri::command]
async fn download_update(url: String) -> AppResult<String> {
    let trimmed = url.trim().to_string();
    if !trimmed.starts_with("https://") {
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

    let file_name = trimmed
        .rsplit('/')
        .next()
        .filter(|name| name.ends_with(".exe"))
        .unwrap_or("APlus_update_setup.exe");
    let path = std::env::temp_dir().join(file_name);
    std::fs::write(&path, &bytes).map_err(|error| format!("保存更新包失败：{error}"))?;

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn run_installer(app: AppHandle, path: String) -> AppResult<()> {
    let installer = std::path::Path::new(&path);
    if !installer.is_file() {
        return Err("更新包不存在或已损坏".to_string());
    }

    app_log::append_log(&app, "INFO", &format!("启动更新安装程序：{path}"));
    std::process::Command::new(installer)
        .spawn()
        .map_err(|error| format!("启动安装程序失败：{error}"))?;

    app.exit(0);
    Ok(())
}

#[tauri::command]
fn append_log(app: AppHandle, level: String, message: String) -> AppResult<()> {
    app_log::append_log(&app, &level, &message);
    Ok(())
}

#[tauri::command]
fn open_log_file(app: AppHandle) -> AppResult<()> {
    let path = app_log::log_file_path(&app)?;
    if !path.exists() {
        std::fs::write(&path, "").map_err(|error| format!("创建日志文件失败：{error}"))?;
    }

    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|error| format!("打开日志失败：{error}"))?;
    Ok(())
}

#[tauri::command]
fn close_window(window: WebviewWindow) -> AppResult<()> {
    window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
fn minimize_window(window: WebviewWindow) -> AppResult<()> {
    window.minimize().map_err(|error| error.to_string())
}

#[tauri::command]
fn minimize_to_tray(window: WebviewWindow) -> AppResult<()> {
    window.hide().map_err(|error| error.to_string())
}

const WEBVIEW_RESTORE_SCRIPT: &str = r#"
(() => {
  try {
    const root = document.documentElement;
    if (root) {
      root.style.transform = 'translateZ(0)';
      void root.offsetHeight;
      root.style.transform = '';
    }
    const app = document.getElementById('app');
    if (!app || app.childElementCount === 0) {
      const key = 'webviewRecoveryAt';
      const last = Number(sessionStorage.getItem(key) || '0');
      const now = Date.now();
      if (now - last > 15000) {
        sessionStorage.setItem(key, String(now));
        location.reload();
      }
    }
  } catch (error) {
    location.reload();
  }
})();
"#;

fn restore_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.eval(WEBVIEW_RESTORE_SCRIPT);
    let _ = window.emit("window-restored", ());
}

#[tauri::command]
fn set_always_on_top(window: WebviewWindow, enabled: bool) -> AppResult<()> {
    window
        .set_always_on_top(enabled)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn start_drag(window: WebviewWindow) -> AppResult<()> {
    window.start_dragging().map_err(|error| error.to_string())
}

#[tauri::command]
async fn set_auto_start(app: AppHandle, enabled: bool) -> AppResult<()> {
    let manager = app.state::<tauri_plugin_autostart::AutoLaunchManager>();

    if enabled {
        manager.enable().map_err(|error| error.to_string())?;
    } else {
        manager.disable().map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn to_tencent_code(code: &str) -> String {
    if code.starts_with("sh") || code.starts_with("sz") || code.starts_with("bj") {
        return code.to_string();
    }

    if code.starts_with('4') || code.starts_with('8') || code.starts_with("92") {
        return format!("bj{code}");
    }

    if code.starts_with('5') || code.starts_with('6') || code.starts_with('9') {
        format!("sh{code}")
    } else {
        format!("sz{code}")
    }
}

fn parse_f64(value: Option<&str>) -> f64 {
    value
        .and_then(|item| item.parse::<f64>().ok())
        .unwrap_or(0.0)
}

fn parse_i64(value: Option<&str>) -> i64 {
    value.and_then(|item| item.parse::<i64>().ok()).unwrap_or(0)
}

fn parse_optional_f64(value: Option<&str>) -> Option<f64> {
    value.and_then(|item| item.trim().parse::<f64>().ok())
}

fn json_string(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn is_six_digit_code(code: &str) -> bool {
    code.len() == 6 && code.bytes().all(|byte| byte.is_ascii_digit())
}

fn is_category_700(value: Option<&Value>) -> bool {
    match value {
        Some(item) => {
            item.as_i64()
                .or_else(|| item.as_str().and_then(|text| text.parse::<i64>().ok()))
                == Some(700)
        }
        None => true,
    }
}

fn is_buyable_fund(value: Option<&Value>) -> bool {
    match value {
        Some(item) => {
            item.as_i64()
                .or_else(|| item.as_str().and_then(|text| text.parse::<i64>().ok()))
                == Some(1)
        }
        None => true,
    }
}

fn is_unsupported_exchange_traded_fund_name(name: &str) -> bool {
    let upper_name = name.to_ascii_uppercase();
    let is_etf = upper_name.contains("ETF");
    let is_etf_link = upper_name.contains("ETF LINK") || name.contains("\u{8054}\u{63a5}");

    upper_name.contains("LOF")
        || name.contains("\u{573a}\u{5185}")
        || name.contains("\u{5c01}\u{95ed}")
        || (is_etf && !is_etf_link)
}

fn is_supported_fund_search_item(item: &Value) -> bool {
    let code = json_string(item, "CODE");
    if !is_six_digit_code(&code) || !is_category_700(item.get("CATEGORY")) {
        return false;
    }

    let Some(base) = item.get("FundBaseInfo") else {
        return false;
    };
    if !base.is_object() || !is_buyable_fund(base.get("ISBUY")) {
        return false;
    }

    let name = json_string(item, "NAME");
    let short_name = json_string(base, "SHORTNAME");

    !name.is_empty()
        && !is_unsupported_exchange_traded_fund_name(&name)
        && !is_unsupported_exchange_traded_fund_name(&short_name)
}

fn percent_encode(value: &str) -> String {
    value
        .as_bytes()
        .iter()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (*byte as char).to_string()
            }
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

fn extract_jsonp_payload(text: &str) -> Option<&str> {
    let trimmed = text.trim();
    let start = trimmed.find('(')?;
    let end = trimmed.rfind(')')?;

    (start < end).then_some(trimmed[start + 1..end].trim())
}

fn parse_json_or_jsonp(text: &str) -> Option<Value> {
    serde_json::from_str::<Value>(text.trim()).ok().or_else(|| {
        extract_jsonp_payload(text).and_then(|payload| serde_json::from_str::<Value>(payload).ok())
    })
}

fn parse_tencent_fund_quote(parts: &[&str]) -> Option<FundQuote> {
    if parts.len() < 9 {
        return None;
    }

    let code = parts.first()?.trim();
    let name = parts.get(1)?.trim();
    let nav = parse_optional_f64(parts.get(5).copied());
    let nav_date = parts.get(8).copied().unwrap_or_default().trim();

    if !is_six_digit_code(code)
        || name.is_empty()
        || nav.is_none()
        || is_unsupported_exchange_traded_fund_name(name)
    {
        return None;
    }

    Some(FundQuote {
        code: code.to_string(),
        name: name.to_string(),
        nav,
        nav_date: nav_date.to_string(),
        change_percent: parse_optional_f64(parts.get(7).copied()),
        estimate_nav: None,
        estimate_change_percent: None,
        estimate_time: String::new(),
        sector: String::new(),
    })
}

fn parse_fund_sector(text: &str) -> Option<String> {
    let json = parse_json_or_jsonp(text)?;
    let fund = json
        .get("Datas")
        .and_then(Value::as_array)
        .and_then(|items| items.first())?;

    fund.get("ZTJJInfo")
        .and_then(Value::as_array)
        .and_then(|themes| themes.first())
        .and_then(|theme| theme.get("TTYPENAME"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string)
}

fn parse_fund_search_results(text: &str) -> Vec<FundSearchResult> {
    let Some(json) = parse_json_or_jsonp(text) else {
        return Vec::new();
    };
    let Some(items) = json.get("Datas").and_then(Value::as_array) else {
        return Vec::new();
    };

    let mut results = Vec::new();

    for item in items {
        if !is_supported_fund_search_item(item) {
            continue;
        }

        let code = json_string(item, "CODE");
        let name = json_string(item, "NAME");
        if code.is_empty() || name.is_empty() {
            continue;
        }

        let fund_type = item
            .get("FundBaseInfo")
            .and_then(|base| base.get("FTYPE"))
            .and_then(Value::as_str)
            .or_else(|| item.get("CATEGORYDESC").and_then(Value::as_str))
            .unwrap_or("基金")
            .to_string();

        results.push(FundSearchResult {
            code,
            name,
            fund_type,
        });
    }

    results.truncate(10);
    results
}

fn extract_js_array_assignment<'a>(text: &'a str, variable: &str) -> AppResult<&'a str> {
    let marker = format!("var {variable}");
    let assignment = text
        .find(&marker)
        .map(|index| &text[index + marker.len()..])
        .ok_or_else(|| format!("基金完整历史净值响应缺少 {variable}"))?;
    let start = assignment
        .find('[')
        .ok_or_else(|| format!("基金完整历史净值 {variable} 缺少数组"))?;
    let array = &assignment[start..];
    let mut depth = 0_u32;
    let mut in_string = false;
    let mut escaped = false;

    for (index, character) in array.char_indices() {
        if in_string {
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == '"' {
                in_string = false;
            }
            continue;
        }

        match character {
            '"' => in_string = true,
            '[' => depth += 1,
            ']' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    return Ok(&array[..=index]);
                }
            }
            _ => {}
        }
    }

    Err(format!("基金完整历史净值 {variable} 数组不完整"))
}

fn unix_millis_to_china_date(timestamp_ms: i64) -> Option<String> {
    let china_timestamp_ms = timestamp_ms.checked_add(8 * 60 * 60 * 1000)?;
    let days = china_timestamp_ms.div_euclid(86_400_000);
    let shifted = days.checked_add(719_468)?;
    let era = if shifted >= 0 {
        shifted
    } else {
        shifted - 146_096
    } / 146_097;
    let day_of_era = shifted - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    year += if month <= 2 { 1 } else { 0 };

    Some(format!("{year:04}-{month:02}-{day:02}"))
}

fn parse_pingzhong_fund_history(text: &str) -> AppResult<Vec<FundNavPoint>> {
    let payload = extract_js_array_assignment(text, "Data_netWorthTrend")?;
    let rows: Vec<Value> = serde_json::from_str(payload)
        .map_err(|error| format!("解析基金完整历史净值失败: {error}"))?;
    let accumulated_by_date = extract_js_array_assignment(text, "Data_ACWorthTrend")
        .ok()
        .and_then(|payload| serde_json::from_str::<Vec<Value>>(payload).ok())
        .unwrap_or_default()
        .iter()
        .filter_map(|row| {
            let values = row.as_array()?;
            let date = unix_millis_to_china_date(values.first()?.as_i64()?)?;
            let nav = values.get(1)?.as_f64()?;
            (nav.is_finite() && nav > 0.0).then_some((date, nav))
        })
        .collect::<std::collections::HashMap<_, _>>();
    let mut points = rows
        .iter()
        .filter_map(|row| {
            let timestamp = row.get("x")?.as_i64()?;
            let nav = row.get("y")?.as_f64()?;
            if !nav.is_finite() || nav <= 0.0 {
                return None;
            }
            let date = unix_millis_to_china_date(timestamp)?;

            Some(FundNavPoint {
                accumulated_nav: accumulated_by_date.get(&date).copied().unwrap_or(nav),
                date,
                nav,
                change_percent: row
                    .get("equityReturn")
                    .and_then(Value::as_f64)
                    .filter(|value| value.is_finite()),
            })
        })
        .collect::<Vec<_>>();
    points.sort_by(|left, right| left.date.cmp(&right.date));

    if points.is_empty() {
        Err("基金完整历史净值没有有效数据".to_string())
    } else {
        Ok(points)
    }
}

fn parse_fund_nav_history(text: &str) -> AppResult<Vec<FundNavPoint>> {
    let json: Value =
        serde_json::from_str(text).map_err(|error| format!("解析基金历史净值失败: {error}"))?;
    if json.get("ErrCode").and_then(Value::as_i64).unwrap_or(-1) != 0 {
        let message = json
            .get("ErrMsg")
            .and_then(Value::as_str)
            .unwrap_or("基金历史净值服务返回错误");
        return Err(message.to_string());
    }

    let rows = json
        .get("Data")
        .and_then(|data| data.get("LSJZList"))
        .and_then(Value::as_array)
        .ok_or_else(|| "基金历史净值响应缺少 Data.LSJZList".to_string())?;
    let mut points = rows
        .iter()
        .filter_map(|row| {
            let date = row.get("FSRQ")?.as_str()?.trim();
            let nav = row.get("DWJZ")?.as_str()?.trim().parse::<f64>().ok()?;
            if date.is_empty() || nav <= 0.0 {
                return None;
            }

            Some(FundNavPoint {
                date: date.to_string(),
                nav,
                accumulated_nav: row
                    .get("LJJZ")
                    .and_then(Value::as_str)
                    .and_then(|value| value.trim().parse::<f64>().ok())
                    .unwrap_or(nav),
                change_percent: row
                    .get("JZZZL")
                    .and_then(Value::as_str)
                    .and_then(|value| value.trim().parse::<f64>().ok()),
            })
        })
        .collect::<Vec<_>>();
    points.sort_by(|left, right| left.date.cmp(&right.date));
    Ok(points)
}

fn strip_html(value: &str) -> String {
    let mut result = String::new();
    let mut inside_tag = false;
    for character in value.chars() {
        match character {
            '<' => inside_tag = true,
            '>' => inside_tag = false,
            _ if !inside_tag => result.push(character),
            _ => {}
        }
    }

    result
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&#37;", "%")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn parse_js_number(text: &str, variable: &str) -> Option<f64> {
    let marker = format!("var {variable}=\"");
    let rest = text.split_once(&marker)?.1;
    rest.split_once('"')?.0.trim().parse::<f64>().ok()
}

fn parse_fund_base_one_year_return(text: &str) -> Option<f64> {
    let json: Value = serde_json::from_str(text).ok()?;
    let value = json.get("Datas")?.get("SYL_1N")?;
    let parsed = value.as_f64().or_else(|| {
        value
            .as_str()
            .and_then(|text| text.trim().parse::<f64>().ok())
    })?;
    parsed.is_finite().then_some(parsed)
}

fn parse_rank(value: &str) -> Option<FundRank> {
    let mut parts = value.split('|').map(str::trim);
    let current = parts.next()?.parse::<i64>().ok()?;
    let total = parts.next()?.parse::<i64>().ok()?;
    (current > 0 && total > 0).then_some(FundRank { current, total })
}

fn collect_html_class_values(text: &str, class_name: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut remaining = text;

    while let Some(class_index) = remaining.find(class_name) {
        let after_class = &remaining[class_index + class_name.len()..];
        let Some(open_end) = after_class.find('>') else {
            break;
        };
        let content = &after_class[open_end + 1..];
        let Some(close) = content.find("</div>") else {
            break;
        };
        values.push(strip_html(&content[..close]));
        remaining = &content[close + "</div>".len()..];
    }

    values
}

fn parse_fund_profile(code: &str, html: &str) -> AppResult<FundProfile> {
    if !is_six_digit_code(code) {
        return Err("基金代码必须为六位数字".to_string());
    }

    let type_text = html
        .find("类型：")
        .map(|start| &html[start + "类型：".len()..])
        .map(|tail| {
            let end = tail
                .find("基金规模")
                .or_else(|| tail.find("规模"))
                .or_else(|| tail.find("基金经理"))
                .or_else(|| tail.find("</div>"))
                .unwrap_or(tail.len());
            strip_html(&tail[..end])
        })
        .unwrap_or_default();
    let mut type_parts = type_text.split('|').map(str::trim);
    let fund_type = type_parts.next().unwrap_or_default().to_string();
    let risk_level = type_parts.next().unwrap_or_default().to_string();
    let ranks = collect_html_class_values(html, "Rdata")
        .into_iter()
        .filter_map(|value| parse_rank(&value))
        .collect::<Vec<_>>();

    Ok(FundProfile {
        code: code.to_string(),
        fund_type,
        risk_level,
        one_year_return: parse_js_number(html, "syl_1n"),
        rank: ranks.get(5).cloned(),
    })
}

fn parse_fund_industries(text: &str) -> AppResult<(String, Vec<FundIndustry>)> {
    let json: Value =
        serde_json::from_str(text).map_err(|error| format!("解析基金行业配置失败: {error}"))?;
    if json.get("ErrCode").and_then(Value::as_i64).unwrap_or(-1) != 0 {
        return Err("基金行业配置服务返回错误".to_string());
    }

    let quarters = json
        .get("Data")
        .and_then(|data| data.get("QuarterInfos"))
        .and_then(Value::as_array)
        .ok_or_else(|| "基金行业配置响应缺少季度数据".to_string())?;
    let latest = quarters
        .iter()
        .filter_map(|quarter| {
            let date = quarter.get("JZRQ")?.as_str()?.trim();
            (!date.is_empty()).then_some((date, quarter))
        })
        .max_by(|(left, _), (right, _)| left.cmp(right))
        .ok_or_else(|| "基金暂无行业配置".to_string())?;
    let rows = latest
        .1
        .get("HYPZInfo")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let name = item.get("HYMC")?.as_str()?.trim();
                    let percent = item.get("ZJZBL")?.as_str()?.trim().parse::<f64>().ok()?;
                    (!name.is_empty() && percent >= 0.0).then_some(FundIndustry {
                        name: name.to_string(),
                        percent,
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok((latest.0.to_string(), rows))
}

fn parse_table_cells(row: &str) -> Vec<String> {
    row.split("<td")
        .skip(1)
        .filter_map(|cell| {
            let start = cell.find('>')? + 1;
            let end = cell[start..].find("</td>")? + start;
            Some(strip_html(&cell[start..end]))
        })
        .collect()
}

fn parse_fund_holdings(text: &str) -> Vec<FundHolding> {
    let mut holdings = Vec::new();

    for row in text.split("<tr").skip(1) {
        let Some(end) = row.find("</tr>") else {
            continue;
        };
        let cells = parse_table_cells(&row[..end]);
        if cells.len() < 7 || !is_six_digit_code(cells[1].trim()) {
            continue;
        }
        let Some(percent) = cells[6].trim_end_matches('%').trim().parse::<f64>().ok() else {
            continue;
        };

        holdings.push(FundHolding {
            code: cells[1].trim().to_string(),
            name: cells[2].trim().to_string(),
            percent,
        });
        if holdings.len() == 10 {
            break;
        }
    }

    holdings
}

fn quote_date_key(value: &str) -> String {
    let digits = value
        .chars()
        .filter(|character| character.is_ascii_digit())
        .take(8)
        .collect::<String>();
    if digits.len() != 8 {
        return String::new();
    }

    format!("{}-{}-{}", &digits[0..4], &digits[4..6], &digits[6..8])
}

fn format_quote_time(value: &str) -> String {
    let digits = value
        .chars()
        .filter(|character| character.is_ascii_digit())
        .take(14)
        .collect::<String>();
    if digits.len() < 8 {
        return String::new();
    }
    if digits.len() < 14 {
        return quote_date_key(&digits);
    }

    format!(
        "{}-{}-{} {}:{}:{}",
        &digits[0..4],
        &digits[4..6],
        &digits[6..8],
        &digits[8..10],
        &digits[10..12],
        &digits[12..14]
    )
}

fn round4(value: f64) -> f64 {
    (value * 10_000.0).round() / 10_000.0
}

fn apply_holding_estimate(quote: &mut FundQuote, holdings: &[FundHolding], stocks: &[Stock]) {
    let stock_by_code = stocks
        .iter()
        .map(|stock| (stock.code.as_str(), stock))
        .collect::<HashMap<_, _>>();
    let newest_time = holdings
        .iter()
        .filter_map(|holding| stock_by_code.get(holding.code.as_str()))
        .filter(|stock| stock.change_percent.is_finite() && !quote_date_key(&stock.time).is_empty())
        .map(|stock| stock.time.as_str())
        .max()
        .unwrap_or_default();
    let newest_date = quote_date_key(newest_time);
    if newest_date.is_empty() {
        return;
    }

    let mut valid_quotes = 0;
    let weighted_change = holdings
        .iter()
        .filter_map(|holding| {
            let stock = stock_by_code.get(holding.code.as_str())?;
            if quote_date_key(&stock.time) != newest_date
                || !stock.change_percent.is_finite()
                || !holding.percent.is_finite()
                || holding.percent < 0.0
            {
                return None;
            }
            valid_quotes += 1;
            Some(holding.percent * stock.change_percent / 100.0)
        })
        .sum::<f64>();

    let Some(nav) = quote.nav.filter(|value| value.is_finite() && *value > 0.0) else {
        return;
    };
    if valid_quotes == 0 {
        return;
    }

    quote.estimate_change_percent = Some(round4(weighted_change));
    quote.estimate_nav = Some(round4(nav * (1.0 + weighted_change / 100.0)));
    quote.estimate_time = format_quote_time(newest_time);
}

fn format_minute_time(value: &str) -> String {
    if value.len() == 4 {
        format!("{}:{}", &value[0..2], &value[2..4])
    } else {
        value.to_string()
    }
}

fn is_a_share_trading_minute(value: &str) -> bool {
    let Ok(minute) = value.parse::<u16>() else {
        return false;
    };
    (930..=1130).contains(&minute) || (1300..=1500).contains(&minute)
}

fn parse_order_book(parts: &[&str]) -> Option<OrderBook> {
    if parts.len() < 29 {
        return None;
    }

    let bid_price_indices = [9, 11, 13, 15, 17];
    let bid_volume_indices = [10, 12, 14, 16, 18];
    let ask_price_indices = [19, 21, 23, 25, 27];
    let ask_volume_indices = [20, 22, 24, 26, 28];

    let bids = bid_price_indices
        .iter()
        .zip(bid_volume_indices.iter())
        .filter_map(|(price_index, volume_index)| {
            let price = parse_f64(parts.get(*price_index).copied());
            let volume = parse_i64(parts.get(*volume_index).copied());
            (price > 0.0).then_some(OrderLevel { price, volume })
        })
        .collect::<Vec<_>>();

    let asks = ask_price_indices
        .iter()
        .zip(ask_volume_indices.iter())
        .filter_map(|(price_index, volume_index)| {
            let price = parse_f64(parts.get(*price_index).copied());
            let volume = parse_i64(parts.get(*volume_index).copied());
            (price > 0.0).then_some(OrderLevel { price, volume })
        })
        .collect::<Vec<_>>();

    if bids.is_empty() && asks.is_empty() {
        None
    } else {
        Some(OrderBook { bids, asks })
    }
}

fn parse_stock_from_parts(parts: &[&str], code: &str) -> Option<Stock> {
    if parts.len() < 46 {
        return None;
    }

    let name = parts.get(1)?;
    let price = parse_f64(parts.get(3).copied());
    let change = parse_f64(parts.get(31).copied());
    let change_percent = parse_f64(parts.get(32).copied());
    let high = parse_f64(parts.get(33).copied());
    let low = parse_f64(parts.get(34).copied());
    let open = parse_f64(parts.get(5).copied());
    let prev_close = parse_f64(parts.get(4).copied());
    let time = parts.get(30).copied().unwrap_or_default().to_string();

    let (volume, amount) = if let Some(composite) = parts.get(35) {
        let segments: Vec<&str> = composite.split('/').collect();
        if segments.len() >= 3 {
            (
                segments[1].parse::<i64>().unwrap_or(0),
                segments[2].parse::<f64>().unwrap_or(0.0),
            )
        } else {
            (
                parse_i64(parts.get(36).copied()),
                parse_f64(parts.get(37).copied()) * 10_000.0,
            )
        }
    } else {
        (
            parse_i64(parts.get(36).copied()),
            parse_f64(parts.get(37).copied()) * 10_000.0,
        )
    };

    let turnover_rate = parse_f64(parts.get(38).copied());
    let circulation_market_cap = parse_f64(parts.get(44).copied());
    let total_market_cap = parse_f64(parts.get(45).copied());
    let volume_ratio = parse_f64(parts.get(49).copied());

    Some(Stock {
        code: code.replace("sh", "").replace("sz", ""),
        name: name.to_string(),
        price,
        change,
        change_percent,
        high,
        low,
        open,
        prev_close,
        volume,
        amount,
        time,
        total_market_cap,
        circulation_market_cap,
        turnover_rate,
        volume_ratio,
        order_book: parse_order_book(parts),
    })
}

fn parse_tencent_lines<T, F>(text: &str, mut parser: F) -> Vec<T>
where
    F: FnMut(&str, &str) -> Option<T>,
{
    let mut items = Vec::new();

    for line in text.lines().filter(|line| !line.trim().is_empty()) {
        let Some(start) = line.find("v_") else {
            continue;
        };
        let Some(eq_pos) = line[start..].find('=') else {
            continue;
        };
        let code_end = start + eq_pos;
        let code = &line[start + 2..code_end];
        let rest_after_code = &line[code_end..];
        let Some(quote_start) = rest_after_code.find('"') else {
            continue;
        };
        let quote_start_abs = code_end + quote_start;
        let Some(quote_end) = line.rfind('"') else {
            continue;
        };
        if quote_start_abs >= quote_end {
            continue;
        }

        let payload = &line[quote_start_abs + 1..quote_end];
        if let Some(item) = parser(code, payload) {
            items.push(item);
        }
    }

    items
}

#[tauri::command]
async fn fetch_stocks(codes: Vec<String>) -> AppResult<Vec<Stock>> {
    if codes.is_empty() {
        return Ok(Vec::new());
    }

    let tencent_codes = codes
        .iter()
        .map(|code| to_tencent_code(code))
        .collect::<Vec<_>>();
    let url = format!("https://qt.gtimg.cn/q={}", tencent_codes.join(","));
    let text = fetch_text_gbk(&url, None).await?;

    Ok(parse_tencent_lines(&text, |code, payload| {
        let parts = payload.split('~').collect::<Vec<_>>();
        parse_stock_from_parts(&parts, code)
    }))
}

#[tauri::command]
async fn search_stock(keyword: String) -> AppResult<Vec<SearchResult>> {
    if keyword.trim().is_empty() {
        return Ok(Vec::new());
    }

    let url = format!(
        "https://suggest3.sinajs.cn/suggest/type=11,12,13,14,15,22&key={}",
        keyword.trim()
    );
    let text = fetch_text_gbk(&url, None).await?;
    let mut results = Vec::new();

    for line in text.lines().filter(|line| line.contains("suggestvalue=")) {
        let Some(start) = line.find('"') else {
            continue;
        };
        let Some(end) = line.rfind('"') else {
            continue;
        };
        if start >= end {
            continue;
        }

        for item in line[start + 1..end].split(';') {
            let parts = item.split(',').collect::<Vec<_>>();
            if parts.len() < 5 {
                continue;
            }

            let full_code = parts[0];
            let type_id = parts[1];
            let code = parts[2];
            let name = parts[4];

            if ["11", "12", "15", "22"].contains(&type_id) {
                results.push(SearchResult {
                    code: code.to_string(),
                    name: name.to_string(),
                    market: if full_code.starts_with("sh") {
                        "上海".to_string()
                    } else {
                        "深圳".to_string()
                    },
                });
            }
        }
    }

    results.truncate(10);
    Ok(results)
}

#[tauri::command]
async fn search_funds(keyword: String) -> AppResult<Vec<FundSearchResult>> {
    let keyword = keyword.trim();
    if keyword.is_empty() {
        return Ok(Vec::new());
    }

    let url = format!(
        "https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=9&key={}",
        percent_encode(keyword)
    );
    let text = fetch_text(&url, Some("https://fund.eastmoney.com/")).await?;

    Ok(parse_fund_search_results(&text))
}

#[tauri::command]
async fn fetch_funds(codes: Vec<String>) -> AppResult<Vec<FundQuote>> {
    let tencent_codes = codes
        .iter()
        .map(|code| code.trim())
        .filter(|code| is_six_digit_code(code))
        .map(|code| format!("jj{code}"))
        .collect::<Vec<_>>();

    if tencent_codes.is_empty() {
        return Ok(Vec::new());
    }

    let url = format!("https://qt.gtimg.cn/q={}", tencent_codes.join(","));
    let text = fetch_text_gbk(&url, None).await?;
    let mut quotes = parse_tencent_lines(&text, |_code, payload| {
        let parts = payload.split('~').collect::<Vec<_>>();
        parse_tencent_fund_quote(&parts)
    });

    let allocations =
        load_fund_allocations(quotes.iter().map(|quote| quote.code.clone()).collect()).await;

    for quote in &mut quotes {
        if let Some(allocation) = allocations.get(&quote.code) {
            quote.sector = if allocation.sector.is_empty() {
                allocation
                    .industries
                    .first()
                    .map(|industry| industry.name.clone())
                    .unwrap_or_default()
            } else {
                allocation.sector.clone()
            };
        }
    }

    let holding_codes = allocations
        .values()
        .flat_map(|allocation| allocation.holdings.iter())
        .map(|holding| holding.code.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    if holding_codes.is_empty() {
        return Ok(quotes);
    }

    let stocks = fetch_stocks(holding_codes).await.unwrap_or_default();
    for quote in &mut quotes {
        if let Some(allocation) = allocations.get(&quote.code) {
            apply_holding_estimate(quote, &allocation.holdings, &stocks);
        }
    }

    Ok(quotes)
}

fn validate_fund_code(code: &str) -> AppResult<&str> {
    let code = code.trim();
    if is_six_digit_code(code) {
        Ok(code)
    } else {
        Err("基金代码必须为六位数字".to_string())
    }
}

fn resolve_fund_history_attempts(
    primary: AppResult<Vec<FundNavPoint>>,
    fallback: AppResult<Vec<FundNavPoint>>,
) -> AppResult<Vec<FundNavPoint>> {
    match (primary, fallback) {
        (Ok(points), _) => Ok(points),
        (Err(_), Ok(points)) => Ok(points),
        (Err(primary_error), Err(fallback_error)) => Err(format!(
            "基金完整历史净值不可用：{primary_error}；最近净值回退失败：{fallback_error}"
        )),
    }
}

#[tauri::command]
async fn fetch_fund_history(code: String) -> AppResult<Vec<FundNavPoint>> {
    let code = validate_fund_code(&code)?;
    let primary_url = format!("https://fund.eastmoney.com/pingzhongdata/{code}.js");
    let primary_referer = format!("https://fund.eastmoney.com/{code}.html");
    let primary = match fetch_text(&primary_url, Some(&primary_referer)).await {
        Ok(text) => parse_pingzhong_fund_history(&text),
        Err(error) => Err(error),
    };
    let primary_error = match primary {
        Ok(points) => return Ok(points),
        Err(error) => error,
    };

    let fallback_url = format!(
        "https://api.fund.eastmoney.com/f10/lsjz?fundCode={code}&pageIndex=1&pageSize=20&startDate=&endDate="
    );
    let fallback_referer = format!("https://fundf10.eastmoney.com/jjjz_{code}.html");
    let fallback = match fetch_text(&fallback_url, Some(&fallback_referer)).await {
        Ok(text) => parse_fund_nav_history(&text),
        Err(error) => Err(error),
    };

    resolve_fund_history_attempts(Err(primary_error), fallback)
}

#[tauri::command]
async fn fetch_fund_profile(code: String) -> AppResult<FundProfile> {
    let code = validate_fund_code(&code)?;
    let url = format!("https://fund.eastmoney.com/{code}.html");
    let base_url = format!(
        "https://fundmobapi.eastmoney.com/FundMApi/FundBaseTypeInformation.ashx?FCODE={code}&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0"
    );
    let (html_result, base_result) = tokio::join!(
        fetch_text_gbk(&url, Some("https://fund.eastmoney.com/")),
        fetch_text(&base_url, Some("https://fund.eastmoney.com/"))
    );
    let mut profile = parse_fund_profile(code, &html_result?)?;
    if profile.one_year_return.is_none() {
        profile.one_year_return = base_result
            .ok()
            .and_then(|text| parse_fund_base_one_year_return(&text));
    }
    Ok(profile)
}

fn read_cached_fund_allocation(code: &str, now: Instant) -> Option<FundAllocation> {
    let cache = FUND_ALLOCATION_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let entries = cache.lock().ok()?;
    let cached = entries.get(code)?;
    cached.is_fresh_at(now).then(|| cached.value.clone())
}

fn write_cached_fund_allocation(code: &str, value: &FundAllocation, fetched_at: Instant) {
    let cache = FUND_ALLOCATION_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(mut entries) = cache.lock() {
        entries.insert(
            code.to_string(),
            CachedFundAllocation {
                fetched_at,
                value: value.clone(),
            },
        );
    }
}

async fn load_fund_allocation_remote(code: &str) -> AppResult<FundAllocation> {
    let industry_url = format!("https://api.fund.eastmoney.com/f10/HYPZ/?fundCode={code}&year=");
    let referer = format!("https://fundf10.eastmoney.com/hytz_{code}.html");
    let sector_url = format!(
        "https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=9&key={code}"
    );
    let (industry_result, sector_result) = tokio::join!(
        fetch_text(&industry_url, Some(&referer)),
        fetch_text(&sector_url, Some("https://fund.eastmoney.com/"))
    );
    let industry_text = industry_result?;
    let (report_date, industries) = parse_fund_industries(&industry_text)?;
    let sector = sector_result
        .ok()
        .and_then(|text| parse_fund_sector(&text))
        .or_else(|| industries.first().map(|industry| industry.name.clone()))
        .unwrap_or_default();
    let date_parts = report_date.split('-').collect::<Vec<_>>();
    let holdings = if date_parts.len() >= 2 {
        let holdings_url = format!(
            "https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code={code}&topline=10&year={}&month={}",
            date_parts[0], date_parts[1]
        );
        let holdings_referer = format!("https://fundf10.eastmoney.com/ccmx_{code}.html");
        let holdings_text = fetch_text(&holdings_url, Some(&holdings_referer)).await?;
        parse_fund_holdings(&holdings_text)
    } else {
        Vec::new()
    };

    Ok(FundAllocation {
        report_date,
        sector,
        industries,
        holdings,
    })
}

async fn load_fund_allocation_cached(code: &str) -> AppResult<FundAllocation> {
    let now = Instant::now();
    if let Some(allocation) = read_cached_fund_allocation(code, now) {
        return Ok(allocation);
    }

    let allocation = load_fund_allocation_remote(code).await?;
    write_cached_fund_allocation(code, &allocation, now);
    Ok(allocation)
}

async fn load_fund_allocations(codes: Vec<String>) -> HashMap<String, FundAllocation> {
    let concurrency = Arc::new(tokio::sync::Semaphore::new(4));
    let mut tasks = tokio::task::JoinSet::new();

    for code in codes.into_iter().collect::<HashSet<_>>() {
        let concurrency = Arc::clone(&concurrency);
        tasks.spawn(async move {
            let Ok(_permit) = concurrency.acquire_owned().await else {
                return (code, Err("基金持仓刷新任务已取消".to_string()));
            };
            let result =
                tokio::time::timeout(Duration::from_secs(8), load_fund_allocation_cached(&code))
                    .await
                    .map_err(|_| "基金持仓估算请求超时".to_string())
                    .and_then(|result| result);
            (code, result)
        });
    }

    let mut allocations = HashMap::new();
    while let Some(task) = tasks.join_next().await {
        if let Ok((code, Ok(allocation))) = task {
            allocations.insert(code, allocation);
        }
    }

    allocations
}

#[tauri::command]
async fn fetch_fund_allocation(code: String) -> AppResult<FundAllocation> {
    let code = validate_fund_code(&code)?;
    load_fund_allocation_cached(code).await
}

#[tauri::command]
async fn fetch_index_history(code: String) -> AppResult<Vec<KlinePoint>> {
    if code != "sh000300" {
        return Err("仅支持沪深300指数".to_string());
    }
    fetch_kline_data(code, "day".to_string()).await
}

fn parse_minute_points(text: &str, tencent_code: &str) -> Vec<MinutePoint> {
    let Ok(json) = serde_json::from_str::<Value>(text) else {
        return Vec::new();
    };
    let Some(rows) = json["data"][tencent_code]["data"]["data"].as_array() else {
        return Vec::new();
    };

    let mut points = Vec::new();
    let mut previous_cumulative_volume = 0_i64;

    for row in rows {
        let Some(line) = row.as_str() else {
            continue;
        };
        let fields = line.split_whitespace().collect::<Vec<_>>();
        if fields.len() < 3 {
            continue;
        }
        if !is_a_share_trading_minute(fields[0]) {
            continue;
        }

        let price = fields[1].parse::<f64>().unwrap_or(0.0);
        let cumulative_volume = fields[2].parse::<i64>().unwrap_or(0).max(0);
        if !price.is_finite() || price <= 0.0 {
            continue;
        }
        let average_price = fields
            .get(3)
            .and_then(|amount| amount.parse::<f64>().ok())
            .filter(|amount| amount.is_finite() && *amount >= 0.0 && cumulative_volume > 0)
            .map(|amount| round4(amount / (cumulative_volume as f64 * 100.0)))
            .unwrap_or(price);

        points.push(MinutePoint {
            time: format_minute_time(fields[0]),
            price,
            volume: cumulative_volume.saturating_sub(previous_cumulative_volume),
            average_price,
        });
        previous_cumulative_volume = cumulative_volume;
    }

    points
}

#[tauri::command]
async fn fetch_minute_data(code: String) -> AppResult<Vec<MinutePoint>> {
    let tencent_code = to_tencent_code(&code);
    let url = format!("https://ifzq.gtimg.cn/appstock/app/minute/query?code={tencent_code}");
    let text = fetch_text(&url, None).await?;

    Ok(parse_minute_points(&text, &tencent_code))
}

#[tauri::command]
async fn fetch_kline_data(code: String, ktype: String) -> AppResult<Vec<KlinePoint>> {
    let period = match ktype.as_str() {
        "week" => "week",
        "month" => "month",
        _ => "day",
    };
    let tencent_code = to_tencent_code(&code);
    let url = format!(
        "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={tencent_code},{period},,,120,qfq"
    );
    let text = fetch_text(&url, None).await?;

    let Ok(json) = serde_json::from_str::<Value>(&text) else {
        return Ok(Vec::new());
    };

    let Some(stock_data) = json["data"][&tencent_code].as_object() else {
        return Ok(Vec::new());
    };

    let fallback_key = format!("qfq{period}");
    let rows = stock_data
        .get(period)
        .and_then(Value::as_array)
        .or_else(|| stock_data.get(&fallback_key).and_then(Value::as_array));

    let Some(rows) = rows else {
        return Ok(Vec::new());
    };

    Ok(rows
        .iter()
        .filter_map(|row| {
            let fields = row.as_array()?;
            let get_text = |index: usize| fields.get(index)?.as_str();

            Some(KlinePoint {
                time: get_text(0)?.to_string(),
                open: get_text(1)?.parse::<f64>().ok()?,
                close: get_text(2)?.parse::<f64>().ok()?,
                high: get_text(3)?.parse::<f64>().ok()?,
                low: get_text(4)?.parse::<f64>().ok()?,
                volume: get_text(5)?.parse::<f64>().ok()? as i64,
            })
        })
        .collect())
}

#[tauri::command]
async fn fetch_indices() -> AppResult<Vec<IndexData>> {
    let url = "https://qt.gtimg.cn/q=sh000001,sz399001,sz399006,sh000688,hkHSI";
    let text = fetch_text_gbk(url, None).await?;

    Ok(parse_tencent_lines(&text, |code, payload| {
        let parts = payload.split('~').collect::<Vec<_>>();
        if parts.len() < 33 {
            return None;
        }

        let sparkline = parts
            .get(50)
            .copied()
            .unwrap_or_default()
            .split(',')
            .filter_map(|value| value.parse::<f64>().ok())
            .collect::<Vec<_>>();

        Some(IndexData {
            code: code.to_string(),
            name: parts.get(1).unwrap_or(&"").to_string(),
            price: parse_f64(parts.get(3).copied()),
            change: parse_f64(parts.get(31).copied()),
            change_percent: parse_f64(parts.get(32).copied()),
            volume: parse_f64(parts.get(36).copied()),
            sparkline,
        })
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_release_versions() {
        assert!(version_is_newer("1.0.8", "1.0.7"));
        assert!(version_is_newer("1.1.0", "1.0.9"));
        assert!(version_is_newer("2.0", "1.9.9"));
        assert!(!version_is_newer("1.0.7", "1.0.7"));
        assert!(!version_is_newer("1.0.6", "1.0.7"));
        assert!(!version_is_newer("", "1.0.7"));
    }

    #[test]
    fn parses_latest_release_payload() {
        let body = r#"{"tag_name":"v1.0.8","html_url":"https://github.com/XingAur/stock-widget/releases/tag/v1.0.8","body":"修复与优化","assets":[{"name":"latest.json","browser_download_url":"https://example.com/latest.json"},{"name":"APlus_Assistant_1.0.8_x64-setup.exe","browser_download_url":"https://example.com/APlus_Assistant_1.0.8_x64-setup.exe"}]}"#;

        let result = parse_latest_release(body, "1.0.7");
        assert!(result.has_update);
        assert_eq!(result.latest_version, "1.0.8");
        assert_eq!(
            result.download_url.as_deref(),
            Some("https://example.com/APlus_Assistant_1.0.8_x64-setup.exe")
        );

        let same = parse_latest_release(body, "1.0.8");
        assert!(!same.has_update);
    }

    #[test]
    fn converts_plain_codes_to_tencent_codes() {
        assert_eq!(to_tencent_code("600000"), "sh600000");
        assert_eq!(to_tencent_code("588870"), "sh588870");
        assert_eq!(to_tencent_code("159915"), "sz159915");
        assert_eq!(to_tencent_code("000001"), "sz000001");
        assert_eq!(to_tencent_code("sh000001"), "sh000001");
    }

    #[test]
    fn converts_beijing_exchange_codes_to_bj_prefix() {
        assert_eq!(to_tencent_code("430047"), "bj430047");
        assert_eq!(to_tencent_code("830799"), "bj830799");
        assert_eq!(to_tencent_code("920002"), "bj920002");
        assert_eq!(to_tencent_code("bj920002"), "bj920002");
        // 沪市 B 股与深市代码不受影响
        assert_eq!(to_tencent_code("900901"), "sh900901");
        assert_eq!(to_tencent_code("002594"), "sz002594");
    }

    #[test]
    fn window_geometry_serializes_with_camel_case() {
        let geometry = WindowGeometry {
            x: -120,
            y: 88,
            width: 280,
            height: 480,
        };
        let payload = serde_json::to_string(&geometry).expect("geometry should serialize");
        assert_eq!(payload, r#"{"x":-120,"y":88,"width":280,"height":480}"#);

        let parsed: WindowGeometry =
            serde_json::from_str(&payload).expect("geometry should deserialize");
        assert_eq!(parsed, geometry);
    }

    #[test]
    fn parses_tencent_global_index_payload() {
        let mut parts = vec![""; 36];
        parts[1] = "上证指数";
        parts[3] = "3342.66";
        parts[30] = "20260922150000";
        parts[31] = "40.12";
        parts[32] = "1.21";

        let index =
            parse_tencent_global_index(&parts, "sh000001").expect("valid index should parse");
        assert_eq!(index.code, "sh000001");
        assert_eq!(index.name, "上证指数");
        assert_eq!(index.price, 3342.66);
        assert_eq!(index.change_percent, 1.21);
        assert_eq!(index.time, "2026-09-22 15:00:00");
    }

    #[test]
    fn rejects_global_index_payloads_without_valid_price_or_time() {
        assert!(parse_tencent_global_index(&[""; 36], "sh000001").is_none());

        let mut stale = vec![""; 36];
        stale[1] = "上证指数";
        stale[3] = "3342.66";
        stale[30] = "";
        assert!(parse_tencent_global_index(&stale, "sh000001").is_none());
    }

    #[test]
    fn parses_eastmoney_world_indices() {
        let body = r#"{"data":{"diff":[
            {"f2":65018.95,"f3":1.38,"f4":884.11,"f12":"N225","f14":"日经225","f124":1789458600},
            {"f2":0.0,"f3":0.0,"f4":0.0,"f12":"BAD","f14":"无效","f124":1789458600},
            {"f2":7117.18,"f3":1.56,"f4":109.4,"f12":"KS11","f14":"韩国KOSPI","f124":1789458600}
        ]}}"#;

        let indices = parse_eastmoney_global_indices(body);

        assert_eq!(indices.len(), 2);
        assert_eq!(indices[0].code, "N225");
        assert_eq!(indices[0].name, "日经225");
        assert_eq!(indices[0].price, 65018.95);
        assert_eq!(indices[0].change_percent, 1.38);
        assert_eq!(indices[0].time, "2026-09-15 15:50:00");
        assert_eq!(indices[1].code, "KS11");
    }

    #[test]
    fn eastmoney_timestamp_uses_china_timezone() {
        // 1784563200 = 北京时间 2026-07-21 00:00:00
        assert_eq!(
            format_eastmoney_timestamp(1_784_563_200).as_deref(),
            Some("2026-07-21 00:00:00")
        );
    }

    #[test]
    fn rejects_malformed_eastmoney_payloads() {
        assert!(parse_eastmoney_global_indices("not json").is_empty());
        assert!(parse_eastmoney_global_indices(r#"{"data":null}"#).is_empty());
    }

    #[test]
    fn parses_concept_sectors_with_member_counts_and_filters_statistics() {
        let body = r#"{"data":{"diff":[
            {"f2":1944.81,"f3":3.10,"f4":58.5,"f12":"BK1127","f14":"AI芯片","f104":86,"f105":4,"f124":1789458600},
            {"f2":54580.89,"f3":2.55,"f4":1358.1,"f12":"BK0816","f14":"昨日连板","f104":10,"f105":2,"f124":1789458600},
            {"f2":962.77,"f3":2.01,"f4":19.0,"f12":"BK1713","f14":"科技风格","f104":40,"f105":20,"f124":1789458600},
            {"f2":1189.19,"f3":2.23,"f4":25.9,"f12":"BK0885","f14":"VPN","f104":12,"f105":3,"f124":1789458600}
        ]}}"#;

        let sectors = parse_eastmoney_sectors(body);

        assert_eq!(sectors.len(), 2);
        assert_eq!(sectors[0].name, "AI芯片");
        assert_eq!(sectors[0].gain_count, Some(86));
        assert_eq!(sectors[0].lose_count, Some(4));
        assert_eq!(sectors[1].name, "VPN");
        // 世界指数分支不应带涨跌家数
        assert!(parse_eastmoney_global_indices(body)[0].gain_count.is_none());
    }

    #[test]
    fn world_indices_do_not_expose_member_counts() {
        let body = r#"{"data":{"diff":[
            {"f2":65018.95,"f3":1.38,"f4":884.11,"f12":"N225","f14":"日经225","f104":99,"f105":1,"f124":1789458600}
        ]}}"#;

        let indices = parse_eastmoney_global_indices(body);
        assert_eq!(indices.len(), 1);
        assert_eq!(indices[0].gain_count, None);
        assert_eq!(indices[0].lose_count, None);
    }

    #[test]
    fn simplifies_us_sector_etf_names() {
        assert_eq!(
            simplify_us_sector_name("XLK", "科技行业精选指数ETF-SPDR"),
            "科技"
        );
        assert_eq!(
            simplify_us_sector_name("XLC", "通讯服务行业精选指数ETF-SPDR"),
            "通信服务"
        );
        assert_eq!(simplify_us_sector_name("UNKNOWN", "原始名称"), "原始名称");
    }

    #[test]
    fn rejects_short_stock_payloads() {
        let parts = vec![""; 35];
        assert!(parse_stock_from_parts(&parts, "sh600000").is_none());
    }

    #[test]
    fn parses_valid_stock_payload_with_order_book() {
        let mut parts = vec![""; 50];
        parts[1] = "PF Bank";
        parts[3] = "10.12";
        parts[4] = "9.90";
        parts[5] = "10.00";
        parts[9] = "10.10";
        parts[10] = "100";
        parts[19] = "10.20";
        parts[20] = "200";
        parts[30] = "20260630150000";
        parts[31] = "0.22";
        parts[32] = "2.22";
        parts[33] = "10.50";
        parts[34] = "9.80";
        parts[35] = "ignored/123456/7890.5";
        parts[38] = "1.23";
        parts[44] = "6500";
        parts[45] = "3200";
        parts[49] = "0.88";

        let stock = parse_stock_from_parts(&parts, "sh600000").expect("valid payload should parse");

        assert_eq!(stock.code, "600000");
        assert_eq!(stock.name, "PF Bank");
        assert_eq!(stock.price, 10.12);
        assert_eq!(stock.volume, 123456);
        assert_eq!(stock.amount, 7890.5);
        assert_eq!(stock.total_market_cap, 3200.0);
        assert_eq!(stock.circulation_market_cap, 6500.0);
        assert_eq!(stock.turnover_rate, 1.23);
        assert_eq!(stock.volume_ratio, 0.88);

        let order_book = stock.order_book.expect("order book should parse");
        assert_eq!(order_book.bids[0].price, 10.10);
        assert_eq!(order_book.bids[0].volume, 100);
        assert_eq!(order_book.asks[0].price, 10.20);
        assert_eq!(order_book.asks[0].volume, 200);
    }

    #[test]
    fn parse_tencent_lines_ignores_malformed_lines() {
        let items = parse_tencent_lines::<String, _>(
            "not a quote line\nv_sh600000_without_equals",
            |code, payload| Some(format!("{code}:{payload}")),
        );

        assert!(items.is_empty());
    }

    #[test]
    fn parses_tencent_fund_quote_payload() {
        let parts = "001186~Open Fund A~0.0000~0.0000~~2.3760~2.3760~1.5385~2026-07-21~"
            .split('~')
            .collect::<Vec<_>>();
        let quote =
            parse_tencent_fund_quote(&parts).expect("valid Tencent fund quote should parse");

        assert_eq!(quote.code, "001186");
        assert_eq!(quote.name, "Open Fund A");
        assert_eq!(quote.nav, Some(2.3760));
        assert_eq!(quote.change_percent, Some(1.5385));
        assert_eq!(quote.estimate_nav, None);
        assert_eq!(quote.estimate_change_percent, None);
        assert_eq!(quote.nav_date, "2026-07-21");
        assert_eq!(quote.estimate_time, "");
    }

    fn stock_with_change(code: &str, change_percent: f64, time: &str) -> Stock {
        Stock {
            code: code.to_string(),
            name: format!("Stock {code}"),
            price: 10.0,
            change: 0.0,
            change_percent,
            high: 10.0,
            low: 10.0,
            open: 10.0,
            prev_close: 10.0,
            volume: 0,
            amount: 0.0,
            time: time.to_string(),
            total_market_cap: 0.0,
            circulation_market_cap: 0.0,
            turnover_rate: 0.0,
            volume_ratio: 0.0,
            order_book: None,
        }
    }

    fn official_fund_quote() -> FundQuote {
        let parts = "001186~Open Fund A~0~0~~2.0000~2.0000~1.0000~2026-07-21~"
            .split('~')
            .collect::<Vec<_>>();
        parse_tencent_fund_quote(&parts).expect("valid fund quote")
    }

    #[test]
    fn calculates_holding_estimate_from_live_constituents() {
        let mut quote = official_fund_quote();
        let holdings = vec![
            FundHolding {
                code: "600000".to_string(),
                name: "Stock A".to_string(),
                percent: 10.0,
            },
            FundHolding {
                code: "000001".to_string(),
                name: "Stock B".to_string(),
                percent: 20.0,
            },
        ];
        let stocks = vec![
            stock_with_change("600000", 2.0, "20260722103000"),
            stock_with_change("000001", -1.0, "20260722103000"),
        ];

        apply_holding_estimate(&mut quote, &holdings, &stocks);

        assert_eq!(quote.estimate_change_percent, Some(0.0));
        assert_eq!(quote.estimate_nav, Some(2.0));
        assert_eq!(quote.estimate_time, "2026-07-22 10:30:00");
    }

    #[test]
    fn holding_estimate_uses_valid_current_batch_quotes_only() {
        let mut quote = official_fund_quote();
        let holdings = vec![
            FundHolding {
                code: "600000".to_string(),
                name: "Stock A".to_string(),
                percent: 10.0,
            },
            FundHolding {
                code: "000001".to_string(),
                name: "Stock B".to_string(),
                percent: 20.0,
            },
        ];
        let stocks = vec![
            stock_with_change("600000", 2.0, "20260722103100"),
            stock_with_change("000001", 9.0, "20260721150000"),
        ];

        apply_holding_estimate(&mut quote, &holdings, &stocks);

        assert_eq!(quote.estimate_change_percent, Some(0.2));
        assert_eq!(quote.estimate_nav, Some(2.004));
        assert_eq!(quote.estimate_time, "2026-07-22 10:31:00");
    }

    #[test]
    fn holding_estimate_stays_empty_without_valid_constituent_quotes() {
        let mut quote = official_fund_quote();
        let holdings = vec![FundHolding {
            code: "600000".to_string(),
            name: "Stock A".to_string(),
            percent: 10.0,
        }];

        apply_holding_estimate(&mut quote, &holdings, &[]);

        assert_eq!(quote.estimate_change_percent, None);
        assert_eq!(quote.estimate_nav, None);
        assert_eq!(quote.estimate_time, "");
    }

    #[test]
    fn fund_allocation_cache_expires_after_six_hours() {
        let fetched_at = std::time::Instant::now();
        let cached = CachedFundAllocation {
            fetched_at,
            value: FundAllocation {
                report_date: "2026-06-30".to_string(),
                sector: "半导体".to_string(),
                industries: Vec::new(),
                holdings: Vec::new(),
            },
        };

        assert!(cached.is_fresh_at(fetched_at + std::time::Duration::from_secs(21_599)));
        assert!(!cached.is_fresh_at(fetched_at + std::time::Duration::from_secs(21_600)));
    }

    #[test]
    fn tencent_fund_quote_parser_rejects_invalid_payloads() {
        assert!(parse_tencent_fund_quote(&["001186", "Fund"]).is_none());

        let bad_code = "1186~Fund~0~0~~2.3760~2.3760~1.5~2026-07-21~"
            .split('~')
            .collect::<Vec<_>>();
        assert!(parse_tencent_fund_quote(&bad_code).is_none());

        let missing_nav = "001186~Fund~0~0~~~~1.5~2026-07-21~"
            .split('~')
            .collect::<Vec<_>>();
        assert!(parse_tencent_fund_quote(&missing_nav).is_none());

        let exchange_traded = "510300~CSI 300 ETF~0~0~~4.8311~4.8311~1.43~2026-07-21~"
            .split('~')
            .collect::<Vec<_>>();
        assert!(parse_tencent_fund_quote(&exchange_traded).is_none());
    }

    #[test]
    fn parses_valid_tencent_fund_lines_while_ignoring_invalid_ones() {
        let text = concat!(
            "v_jj001186=\"001186~Open Fund A~0~0~~2.3760~2.3760~1.5385~2026-07-21~\";\n",
            "v_jj_bad=\"bad~Bad Fund~0~0~~1.0~1.0~0.0~2026-07-21~\";"
        );
        let quotes = parse_tencent_lines(text, |_code, payload| {
            let parts = payload.split('~').collect::<Vec<_>>();
            parse_tencent_fund_quote(&parts)
        });

        assert_eq!(quotes.len(), 1);
        assert_eq!(quotes[0].code, "001186");
    }

    #[test]
    fn parses_fund_search_results() {
        let results = parse_fund_search_results(
            r#"{"ErrCode":0,"Datas":[{"CODE":"001186","NAME":"富国文体健康股票A","CATEGORYDESC":"基金","FundBaseInfo":{"FTYPE":"股票型"}},{"CODE":"","NAME":"bad"}]}"#,
        );

        assert_eq!(
            results,
            vec![FundSearchResult {
                code: "001186".to_string(),
                name: "富国文体健康股票A".to_string(),
                fund_type: "股票型".to_string(),
            }]
        );
    }

    #[test]
    fn fund_search_results_only_keep_otc_open_funds() {
        let results = parse_fund_search_results(
            r#"{"ErrCode":0,"Datas":[
                {"CODE":"014855","NAME":"Open Fund C","CATEGORY":700,"CATEGORYDESC":"Fund","FundBaseInfo":{"FTYPE":"Index","ISBUY":"1"}},
                {"CODE":"510300","NAME":"CSI 300 ETF","CATEGORY":700,"CATEGORYDESC":"Fund","FundBaseInfo":{"FTYPE":"Index","ISBUY":""}},
                {"CODE":"160641","NAME":"Bond LOF","CATEGORY":700,"CATEGORYDESC":"Fund","FundBaseInfo":{"FTYPE":"Bond","ISBUY":"1"}},
                {"CODE":"12345","NAME":"Bad Code","CATEGORY":700,"CATEGORYDESC":"Fund","FundBaseInfo":{"FTYPE":"Mixed","ISBUY":"1"}},
                {"CODE":"024424","NAME":"No Base","CATEGORY":700,"CATEGORYDESC":"Fund"},
                {"CODE":"600000","NAME":"Stock","CATEGORY":11,"CATEGORYDESC":"Stock","FundBaseInfo":{"FTYPE":"Stock","ISBUY":"1"}}
            ]}"#,
        );

        assert_eq!(
            results,
            vec![FundSearchResult {
                code: "014855".to_string(),
                name: "Open Fund C".to_string(),
                fund_type: "Index".to_string(),
            }]
        );
    }

    #[test]
    fn parses_fund_nav_history_in_ascending_order() {
        let body = r#"{
            "Data": {"LSJZList": [
                {"FSRQ":"2026-07-21","DWJZ":"2.0576","LJJZ":"2.0576","JZZZL":"17.93"},
                {"FSRQ":"2026-07-20","DWJZ":"1.7448","LJJZ":"1.7448","JZZZL":"-6.17"}
            ]},
            "ErrCode": 0
        }"#;

        let rows = parse_fund_nav_history(body).expect("history should parse");

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].date, "2026-07-20");
        assert_eq!(rows[1].nav, 2.0576);
        assert_eq!(rows[1].change_percent, Some(17.93));
    }

    #[test]
    fn parses_pingzhong_history_in_ascending_order() {
        let body = "\u{feff}var fS_name = 'Demo';\n\
            var Data_netWorthTrend = [\
            {\"x\":1704153600000,\"y\":1.12,\"equityReturn\":1.82,\"unitMoney\":\"\"},\
            {\"x\":1704067200000,\"y\":1.10,\"equityReturn\":null,\"unitMoney\":\"\"},\
            {\"x\":1704240000000,\"y\":0,\"equityReturn\":-100.0}\
            ]; var Data_ACWorthTrend = [[1704153600000,1.32]];";

        let rows = parse_pingzhong_fund_history(body).expect("history should parse");

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].date, "2024-01-01");
        assert_eq!(rows[0].accumulated_nav, 1.10);
        assert_eq!(rows[0].change_percent, None);
        assert_eq!(rows[1].date, "2024-01-02");
        assert_eq!(rows[1].nav, 1.12);
        assert_eq!(rows[1].accumulated_nav, 1.32);
        assert_eq!(rows[1].change_percent, Some(1.82));
    }

    #[test]
    fn converts_eastmoney_midnight_timestamp_to_china_calendar_date() {
        assert_eq!(
            unix_millis_to_china_date(1_784_563_200_000).as_deref(),
            Some("2026-07-21")
        );
    }

    #[test]
    fn parses_primary_fund_theme_as_sector() {
        let body = r#"{
            "Datas": [{
                "ZTJJInfo": [
                    {"TTYPE":"BK000054","TTYPENAME":"半导体"},
                    {"TTYPE":"BK000053","TTYPENAME":"电子"}
                ]
            }]
        }"#;

        assert_eq!(parse_fund_sector(body).as_deref(), Some("半导体"));
    }

    #[test]
    fn converts_cumulative_minute_volume_to_per_minute_bars() {
        let body = r#"{
            "data": {"sz002409": {"data": {"data": [
                "0930 10.00 100 100000.00",
                "0931 10.10 130 130300.00",
                "0932 10.05 130 130300.00",
                "1501 10.05 130 130300.00"
            ]}}}
        }"#;

        let points = parse_minute_points(body, "sz002409");

        assert_eq!(points.len(), 3);
        assert_eq!(points[0].volume, 100);
        assert_eq!(points[1].volume, 30);
        assert_eq!(points[2].volume, 0);
        assert_eq!(points[1].average_price, 10.0231);
    }

    #[test]
    fn rejects_pingzhong_history_without_trend_variable() {
        assert!(parse_pingzhong_fund_history("var other = [];").is_err());
    }

    #[test]
    fn rejects_empty_pingzhong_history() {
        assert!(parse_pingzhong_fund_history("var Data_netWorthTrend = [];").is_err());
    }

    #[test]
    fn rejects_fund_nav_provider_errors() {
        let body = r#"{"Data":null,"ErrCode":1,"ErrMsg":"bad request"}"#;
        assert!(parse_fund_nav_history(body).is_err());
    }

    #[test]
    fn fund_history_source_prefers_primary_result() {
        let primary = vec![FundNavPoint {
            date: "2024-01-01".to_string(),
            nav: 1.1,
            accumulated_nav: 1.1,
            change_percent: None,
        }];
        let fallback = vec![FundNavPoint {
            date: "2026-07-21".to_string(),
            nav: 2.0576,
            accumulated_nav: 2.0576,
            change_percent: Some(17.93),
        }];

        assert_eq!(
            resolve_fund_history_attempts(Ok(primary.clone()), Ok(fallback)),
            Ok(primary)
        );
    }

    #[test]
    fn fund_history_source_uses_fallback_after_primary_failure() {
        let fallback = vec![FundNavPoint {
            date: "2026-07-21".to_string(),
            nav: 2.0576,
            accumulated_nav: 2.0576,
            change_percent: Some(17.93),
        }];

        assert_eq!(
            resolve_fund_history_attempts(Err("primary failed".to_string()), Ok(fallback.clone())),
            Ok(fallback)
        );
    }

    #[test]
    fn fund_history_source_reports_both_failures() {
        let error = resolve_fund_history_attempts(
            Err("primary failed".to_string()),
            Err("fallback failed".to_string()),
        )
        .expect_err("both failures should be reported");

        assert!(error.contains("primary failed"));
        assert!(error.contains("fallback failed"));
    }

    #[test]
    fn parses_fund_profile_and_one_year_rank() {
        let html = r#"
            <script>var syl_1n="104.59";</script>
            <div>类型：<a>混合型-偏股</a> |&nbsp;&nbsp;中高风险</div><div>基金规模</div>
            <div class="Rdata">4541 | 5323</div>
            <div class="Rdata">288 | 5339</div>
            <div class="Rdata">14 | 5234</div>
            <div class="Rdata">50 | 5043</div>
            <div class="Rdata">14 | 5009</div>
            <div class="Rdata">339 | 4613</div>
        "#;

        let profile = parse_fund_profile("024424", html).expect("profile should parse");

        assert_eq!(profile.fund_type, "混合型-偏股");
        assert_eq!(profile.risk_level, "中高风险");
        assert_eq!(profile.one_year_return, Some(104.59));
        assert_eq!(profile.rank.as_ref().map(|rank| rank.current), Some(339));
        assert_eq!(profile.rank.as_ref().map(|rank| rank.total), Some(4613));
    }

    #[test]
    fn parses_fund_base_one_year_return() {
        let body = r#"{"Datas":{"SYL_1N":"179.19"},"ErrCode":0}"#;

        assert_eq!(parse_fund_base_one_year_return(body), Some(179.19));
    }

    #[test]
    fn parses_latest_fund_industry_allocation() {
        let body = r#"{
            "Data": {
                "QuarterInfos": [{
                    "JZRQ":"2026-06-30",
                    "HYPZInfo":[
                        {"HYMC":"制造业","ZJZBL":"77.84"},
                        {"HYMC":"信息传输、软件和信息技术服务业","ZJZBL":"12.80"}
                    ]
                }]
            },
            "ErrCode":0
        }"#;

        let (report_date, rows) = parse_fund_industries(body).expect("industries should parse");

        assert_eq!(report_date, "2026-06-30");
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].name, "制造业");
        assert_eq!(rows[0].percent, 77.84);
    }

    #[test]
    fn parses_fund_holding_rows_from_archive_html() {
        let body = r#"var apidata={ content:"<table><tbody>
          <tr><td>1</td><td><a href='//quote/1.688361'>688361</a></td><td class='tol'><a>中科飞测</a></td><td></td><td></td><td></td><td class='tor'>7.88%</td></tr>
          <tr><td>2</td><td><a href='//quote/1.688012'>688012</a></td><td class='tol'><a>中微公司</a></td><td></td><td></td><td></td><td class='tor'>7.41%</td></tr>
        </tbody></table>",arryear:[2026],curyear:2026};"#;

        let rows = parse_fund_holdings(body);

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].code, "688361");
        assert_eq!(rows[0].name, "中科飞测");
        assert_eq!(rows[0].percent, 7.88);
    }

    #[test]
    fn decodes_utf8_fund_holding_names_without_mojibake() {
        let body = r#"var apidata={ content:"<table><tbody>
          <tr><td>1</td><td>688012</td><td class='tol'><a>中微公司</a></td><td></td><td></td><td></td><td class='tor'>9.67%</td></tr>
        </tbody></table>"};"#;

        let decoded = decode_utf8_text(body.as_bytes());
        let rows = parse_fund_holdings(&decoded);

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].name, "中微公司");
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 已有实例在运行：唤起它而不是再开一个进程，
            // 避免两个 WebView2 实例争抢同一数据目录导致界面空白与本地存储写入丢失。
            restore_main_window(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            app_log::install_panic_hook(app.handle());

            let restore = MenuItem::with_id(app, "restore", "恢复窗口", true, None::<&str>)?;
            let check_update_item =
                MenuItem::with_id(app, "check-update", "检查更新", true, None::<&str>)?;
            let open_log_item = MenuItem::with_id(app, "open-log", "运行日志", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu =
                Menu::with_items(app, &[&restore, &check_update_item, &open_log_item, &quit])?;

            let tray = app.tray_by_id("main").expect("tray icon not found");
            if let Some(icon) = app.default_window_icon().cloned() {
                if let Some(window) = app.get_webview_window("main") {
                    window.set_icon(icon.clone())?;
                }
                tray.set_icon(Some(icon))?;
            }
            tray.set_menu(Some(menu))?;
            let _ = tray.set_show_menu_on_left_click(true);
            tray.on_menu_event(|app, event| match event.id.as_ref() {
                "restore" => restore_main_window(app),
                "check-update" => {
                    app_log::append_log(app, "INFO", "托盘触发检查更新");
                    restore_main_window(app);
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.emit("tray-check-update", ());
                    }
                }
                "open-log" => {
                    if let Err(error) = open_log_file(app.clone()) {
                        app_log::append_log(app, "ERROR", &format!("打开日志失败：{error}"));
                    }
                }
                "quit" => {
                    save_window_geometry(app);
                    app.exit(0);
                }
                _ => {}
            });

            if let Some(window) = app.get_webview_window("main") {
                restore_window_geometry(&window);
                watch_window_geometry(app.handle());
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            close_window,
            minimize_window,
            minimize_to_tray,
            set_always_on_top,
            start_drag,
            set_auto_start,
            persist_app_state,
            load_app_state,
            fetch_stocks,
            search_stock,
            search_funds,
            fetch_funds,
            fetch_fund_history,
            fetch_fund_profile,
            fetch_fund_allocation,
            fetch_index_history,
            fetch_minute_data,
            fetch_kline_data,
            fetch_indices,
            fetch_global_indices,
            ocr_image,
            check_update,
            download_update,
            run_installer,
            append_log,
            open_log_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
