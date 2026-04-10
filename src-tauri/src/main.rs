// Prevents additional console windows on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    Manager, WebviewWindow, AppHandle,
    menu::{Menu, MenuItem},
};
use serde::{Deserialize, Serialize};

// 股票数据结构
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stock {
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
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    code: String,
    name: String,
    market: String,
}

// 分时数据点
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinutePoint {
    time: String,
    price: f64,
    volume: i64,
}

// K线数据点
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KlinePoint {
    time: String,
    open: f64,
    close: f64,
    high: f64,
    low: f64,
    volume: i64,
}

// 指数数据
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexData {
    code: String,
    name: String,
    price: f64,
    change: f64,
    change_percent: f64,
    volume: f64,
    // 用于 sparkline 的分时价格点
    sparkline: Vec<f64>,
}

// 关闭窗口（隐藏到托盘）
#[tauri::command]
fn close_window(window: WebviewWindow) {
    window.hide().ok();
}

// 最小化窗口
#[tauri::command]
fn minimize_window(window: WebviewWindow) {
    window.minimize().ok();
}

// 最小化到托盘
#[tauri::command]
fn minimize_to_tray(window: WebviewWindow) {
    window.hide().ok();
}

// 恢复窗口
#[tauri::command]
fn restore_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        window.show().ok();
        window.set_focus().ok();
    }
}

// 设置窗口置顶
#[tauri::command]
fn set_always_on_top(window: WebviewWindow, enabled: bool) {
    window.set_always_on_top(enabled).ok();
}

// 开始拖动窗口
#[tauri::command]
fn start_drag(window: WebviewWindow) {
    window.start_dragging().ok();
}

// 设置开机自启
#[tauri::command]
async fn set_auto_start(app: AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.state::<tauri_plugin_autostart::AutoLaunchManager>();

    if enabled {
        manager.enable().map_err(|e| e.to_string())?;
    } else {
        manager.disable().map_err(|e| e.to_string())?;
    }

    Ok(())
}

// 转换股票代码为腾讯格式
fn to_tencent_code(code: &str) -> String {
    if code.starts_with("sh") || code.starts_with("sz") {
        return code.to_string();
    }
    if code.starts_with("6") {
        format!("sh{}", code)
    } else if code.starts_with("0") || code.starts_with("3") {
        format!("sz{}", code)
    } else if code.starts_with("68") {
        format!("sh{}", code)
    } else {
        format!("sz{}", code)
    }
}

// 解析腾讯股票数据
// 字段索引（从API实际响应分析，0-based）:
// 3=现价 4=昨收 5=今开 30=时间 31=涨跌 32=涨跌幅 33=最高 34=最低
// 35=复合字符串"现价/成交量/成交额" 36=成交量(手) 37=成交额(万元)
// 44=总市值(亿) 45=流通市值(亿)
fn parse_stock_data(data: &str, code: &str) -> Option<Stock> {
    let parts: Vec<&str> = data.split('~').collect();
    if parts.len() < 50 {
        return None;
    }

    // 从复合字符串解析成交量和成交额: "72.68/279423/2063431053" (idx 35)
    let (volume, amount) = if let Some(composite) = parts.get(35) {
        let segs: Vec<&str> = composite.split('/').collect();
        if segs.len() >= 3 {
            (
                segs[1].parse::<i64>().unwrap_or(0),
                segs[2].parse::<f64>().unwrap_or(0.0),
            )
        } else {
            (
                parts[36].parse().unwrap_or(0),
                parts[37].parse::<f64>().unwrap_or(0.0) * 10000.0, // 万元转元
            )
        }
    } else {
        (
            parts[36].parse().unwrap_or(0),
            parts[37].parse::<f64>().unwrap_or(0.0) * 10000.0,
        )
    };

    Some(Stock {
        code: code.replace("sh", "").replace("sz", ""),
        name: parts[1].to_string(),
        price: parts[3].parse().unwrap_or(0.0),
        change: parts[31].parse().unwrap_or(0.0),
        change_percent: parts[32].parse().unwrap_or(0.0),
        high: parts[33].parse().unwrap_or(0.0),
        low: parts[34].parse().unwrap_or(0.0),
        open: parts[5].parse().unwrap_or(0.0),
        prev_close: parts[4].parse().unwrap_or(0.0),
        volume,
        amount, // 单位: 元
        time: parts[30].to_string(),
        total_market_cap: parts[44].parse().unwrap_or(0.0), // 单位: 亿
        circulation_market_cap: parts[45].parse().unwrap_or(0.0), // 单位: 亿
    })
}

// 获取股票实时数据 (Rust后端绕过CORS)
#[tauri::command]
async fn fetch_stocks(codes: Vec<String>) -> Result<Vec<Stock>, String> {
    if codes.is_empty() {
        return Ok(vec![]);
    }

    let tencent_codes: Vec<String> = codes.iter().map(|c| to_tencent_code(c)).collect();
    let url = format!("https://qt.gtimg.cn/q={}", tencent_codes.join(","));

    let client = reqwest::Client::new();
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let text = response.text().await.map_err(|e| e.to_string())?;

    let mut stocks: Vec<Stock> = Vec::new();

    for line in text.lines() {
        if line.trim().is_empty() {
            continue;
        }
        // 解析 v_sz000001="..." 格式
        if let Some(start) = line.find("v_") {
            if let Some(eq_pos) = line[start..].find('=') {
                let code_part = &line[start + 2..start + eq_pos];
                if let Some(quote_start) = line.find('"') {
                    if let Some(quote_end) = line.rfind('"') {
                        if quote_start < quote_end {
                            let data = &line[quote_start + 1..quote_end];
                            if let Some(stock) = parse_stock_data(data, code_part) {
                                stocks.push(stock);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(stocks)
}

// 搜索股票 (Rust后端绕过CORS)
#[tauri::command]
async fn search_stock(keyword: String) -> Result<Vec<SearchResult>, String> {
    if keyword.trim().is_empty() {
        return Ok(vec![]);
    }

    let url = format!(
        "https://suggest3.sinajs.cn/suggest/type=11,12,13,14,15,22&key={}",
        keyword.trim()
    );

    let client = reqwest::Client::new();
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let text = response.text().await.map_err(|e| e.to_string())?;

    let mut results: Vec<SearchResult> = Vec::new();

    // 解析 var suggestvalue="..."
    // 格式: sh600030,11,600030,sh600030,中信证券,,中信证券,99,1,ESG,,;...
    for line in text.lines() {
        if line.contains("suggestvalue=") {
            if let Some(start) = line.find('"') {
                if let Some(end) = line.rfind('"') {
                    if start < end {
                        let content = &line[start + 1..end];
                        for item in content.split(';') {
                            let parts: Vec<&str> = item.split(',').collect();
                            if parts.len() >= 5 {
                                let full_code = parts[0];  // sh600030
                                let type_id = parts[1];     // 11
                                let code = parts[2];        // 600030
                                // parts[3] 是完整代码重复
                                let name = parts[4];        // 股票名称

                                // 只返回A股 (11=上海A股, 12=深圳A股, 15=创业板, 22=科创板)
                                if ["11", "12", "15", "22"].contains(&type_id) {
                                    results.push(SearchResult {
                                        code: code.to_string(),
                                        name: name.to_string(),
                                        market: if full_code.starts_with("sh") { "上海" } else { "深圳" }.to_string(),
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 最多返回10条
    if results.len() > 10 {
        results = results.into_iter().take(10).collect();
    }

    Ok(results)
}

// 获取分时数据 (Rust后端绕过CORS)
#[tauri::command]
async fn fetch_minute_data(code: String) -> Result<Vec<MinutePoint>, String> {
    let tencent_code = to_tencent_code(&code);

    let url = format!("https://ifzq.gtimg.cn/appstock/app/minute/query?code={}", tencent_code);

    let client = reqwest::Client::new();
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let text = response.text().await.map_err(|e| e.to_string())?;

    // 返回格式: {"data":{"sh603629":{"data":{"data":["0930 74.00 4731 35009400.00",...]}}}}
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
        if let Some(rows) = json["data"][&tencent_code]["data"]["data"].as_array() {
            let mut points: Vec<MinutePoint> = Vec::new();
            for row in rows {
                if let Some(line) = row.as_str() {
                    let fields: Vec<&str> = line.split_whitespace().collect();
                    if fields.len() >= 3 {
                        let time_str = fields[0];
                        let price = fields[1].parse::<f64>().unwrap_or(0.0);
                        let volume = fields[2].parse::<i64>().unwrap_or(0);

                        // "0930" -> "09:30", "1430" -> "14:30"
                        let formatted = if time_str.len() == 4 {
                            format!("{}:{}", &time_str[0..2], &time_str[2..4])
                        } else {
                            time_str.to_string()
                        };

                        points.push(MinutePoint {
                            time: formatted,
                            price,
                            volume,
                        });
                    }
                }
            }
            return Ok(points);
        }
    }

    Ok(vec![])
}

// 获取K线数据 (Rust后端绕过CORS)
#[tauri::command]
async fn fetch_kline_data(code: String, ktype: String) -> Result<Vec<KlinePoint>, String> {
    let tencent_code = to_tencent_code(&code);
    // ktype: day, week, month, quarter, year
    // Sina API scale: 240=day, 1200=week, 14400=month
    let scale = match ktype.as_str() {
        "day" => "240",
        "week" => "1200",
        "month" => "14400",
        _ => "240", // default to day
    };

    let url = format!(
        "https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol={}&scale={}&ma=no&datalen=120",
        tencent_code, scale
    );

    let client = reqwest::Client::new();
    let response = client.get(&url)
        .header("Referer", "https://finance.sina.com.cn")
        .send().await.map_err(|e| e.to_string())?;
    let text = response.text().await.map_err(|e| e.to_string())?;

    // 返回格式: [{"day":"2026-02-27","open":"51.310","high":"58.520","low":"51.310","close":"58.520","volume":"38912280"},...]
    if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(&text) {
        let mut points: Vec<KlinePoint> = Vec::new();
        for item in arr {
            points.push(KlinePoint {
                time: item["day"].as_str().unwrap_or("").to_string(),
                open: item["open"].as_str().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0),
                close: item["close"].as_str().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0),
                high: item["high"].as_str().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0),
                low: item["low"].as_str().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0),
                volume: item["volume"].as_str().and_then(|s| s.parse::<i64>().ok()).unwrap_or(0),
            });
        }
        return Ok(points);
    }

    Ok(vec![])
}

// 获取三大指数数据 (Rust后端绕过CORS)
#[tauri::command]
async fn fetch_indices() -> Result<Vec<IndexData>, String> {
    let codes = vec!["sh000001", "sz399001", "sz399006"];
    let url = format!("https://qt.gtimg.cn/q={}", codes.join(","));

    let client = reqwest::Client::new();
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let text = response.text().await.map_err(|e| e.to_string())?;

    let mut indices: Vec<IndexData> = Vec::new();

    for line in text.lines() {
        if line.trim().is_empty() {
            continue;
        }
        if let Some(start) = line.find("v_") {
            if let Some(eq_pos) = line[start..].find('=') {
                let code_part = &line[start + 2..start + eq_pos];
                if let Some(quote_start) = line.find('"') {
                    if let Some(quote_end) = line.rfind('"') {
                        if quote_start < quote_end {
                            let data = &line[quote_start + 1..quote_end];
                            let parts: Vec<&str> = data.split('~').collect();
                            if parts.len() >= 50 {
                                let price = parts[3].parse::<f64>().unwrap_or(0.0);
                                let change = parts[31].parse::<f64>().unwrap_or(0.0);
                                let change_percent = parts[32].parse::<f64>().unwrap_or(0.0);
                                // 指数用 index 36 成交量
                                let volume = parts[36].parse::<f64>().unwrap_or(0.0);
                                // 解析分时数据: index 50 是 "价格1,价格2,..." 格式
                                let sparkline: Vec<f64> = parts[50]
                                    .split(',')
                                    .filter_map(|s| s.parse::<f64>().ok())
                                    .collect();

                                indices.push(IndexData {
                                    code: code_part.to_string(),
                                    name: parts[1].to_string(),
                                    price,
                                    change,
                                    change_percent,
                                    volume,
                                    sparkline,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(indices)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--flag1", "--flag2"])
        ))
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            // 创建托盘菜单
            let restore = MenuItem::with_id(app, "restore", "恢复窗口", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&restore, &quit])?;

            // 创建托盘图标
            let _tray = tauri::tray::TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "restore" => {
                            if let Some(window) = app.get_webview_window("main") {
                                window.show().ok();
                                window.set_focus().ok();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            close_window,
            minimize_window,
            minimize_to_tray,
            restore_window,
            set_always_on_top,
            start_drag,
            set_auto_start,
            fetch_stocks,
            search_stock,
            fetch_minute_data,
            fetch_kline_data,
            fetch_indices,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}