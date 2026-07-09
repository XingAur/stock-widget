#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{
    menu::{Menu, MenuItem},
    AppHandle, Manager, WebviewWindow,
};

type AppResult<T> = Result<T, String>;

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
    estimate_nav: Option<f64>,
    estimate_change_percent: Option<f64>,
    estimate_time: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
struct FundSearchResult {
    code: String,
    name: String,
    #[serde(rename = "type")]
    fund_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MinutePoint {
    time: String,
    price: f64,
    volume: i64,
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
    if code.starts_with("sh") || code.starts_with("sz") {
        return code.to_string();
    }

    if code.starts_with('6') {
        format!("sh{code}")
    } else {
        format!("sz{code}")
    }
}

fn parse_f64(value: Option<&str>) -> f64 {
    value.and_then(|item| item.parse::<f64>().ok()).unwrap_or(0.0)
}

fn parse_i64(value: Option<&str>) -> i64 {
    value.and_then(|item| item.parse::<i64>().ok()).unwrap_or(0)
}

fn parse_optional_json_f64(value: Option<&Value>) -> Option<f64> {
    value.and_then(|item| {
        item.as_f64()
            .or_else(|| item.as_str().and_then(|text| text.parse::<f64>().ok()))
    })
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
        Some(item) => item
            .as_i64()
            .or_else(|| item.as_str().and_then(|text| text.parse::<i64>().ok()))
            == Some(700),
        None => true,
    }
}

fn is_buyable_fund(value: Option<&Value>) -> bool {
    match value {
        Some(item) => item
            .as_i64()
            .or_else(|| item.as_str().and_then(|text| text.parse::<i64>().ok()))
            == Some(1),
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
    serde_json::from_str::<Value>(text.trim())
        .ok()
        .or_else(|| extract_jsonp_payload(text).and_then(|payload| serde_json::from_str::<Value>(payload).ok()))
}

fn parse_fund_quote_jsonp(text: &str) -> Option<FundQuote> {
    let json = parse_json_or_jsonp(text)?;
    let code = json_string(&json, "fundcode");
    let name = json_string(&json, "name");

    if !is_six_digit_code(&code)
        || name.is_empty()
        || is_unsupported_exchange_traded_fund_name(&name)
    {
        return None;
    }

    Some(FundQuote {
        code,
        name,
        nav: parse_optional_json_f64(json.get("dwjz")),
        nav_date: json_string(&json, "jzrq"),
        estimate_nav: parse_optional_json_f64(json.get("gsz")),
        estimate_change_percent: parse_optional_json_f64(json.get("gszzl")),
        estimate_time: json_string(&json, "gztime"),
    })
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

fn format_minute_time(value: &str) -> String {
    if value.len() == 4 {
        format!("{}:{}", &value[0..2], &value[2..4])
    } else {
        value.to_string()
    }
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

    let total_market_cap = parse_f64(parts.get(44).copied());
    let circulation_market_cap = parse_f64(parts.get(45).copied());

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

async fn fetch_text(url: &str, referer: Option<&str>) -> AppResult<String> {
    let client = reqwest::Client::new();
    let request = if let Some(referer) = referer {
        client
            .get(url)
            .header(
                reqwest::header::USER_AGENT,
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            )
            .header("Accept", "*/*")
            .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
            .header("Referer", referer)
    } else {
        client
            .get(url)
            .header(
                reqwest::header::USER_AGENT,
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            )
            .header("Accept", "*/*")
            .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
    };

    let response = request.send().await.map_err(|error| error.to_string())?;
    response.text().await.map_err(|error| error.to_string())
}

async fn fetch_text_gbk(url: &str, referer: Option<&str>) -> AppResult<String> {
    let client = reqwest::Client::new();
    let request = if let Some(referer) = referer {
        client
            .get(url)
            .header(
                reqwest::header::USER_AGENT,
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            )
            .header("Accept", "*/*")
            .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
            .header("Referer", referer)
    } else {
        client
            .get(url)
            .header(
                reqwest::header::USER_AGENT,
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            )
            .header("Accept", "*/*")
            .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
    };

    let response = request.send().await.map_err(|error| error.to_string())?;
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    let (text, _, _) = encoding_rs::GBK.decode(&bytes);
    Ok(text.into_owned())
}

#[tauri::command]
async fn fetch_stocks(codes: Vec<String>) -> AppResult<Vec<Stock>> {
    if codes.is_empty() {
        return Ok(Vec::new());
    }

    let tencent_codes = codes.iter().map(|code| to_tencent_code(code)).collect::<Vec<_>>();
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
    let text = fetch_text(&url, None).await?;
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
    if codes.is_empty() {
        return Ok(Vec::new());
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let mut funds = Vec::new();

    for code in codes.iter().map(|code| code.trim()).filter(|code| !code.is_empty()) {
        let url = format!("https://fundgz.1234567.com.cn/js/{code}.js?rt={timestamp}");
        let Ok(text) = fetch_text(&url, Some("https://fund.eastmoney.com/")).await else {
            continue;
        };

        if let Some(fund) = parse_fund_quote_jsonp(&text) {
            funds.push(fund);
        }
    }

    Ok(funds)
}

#[tauri::command]
async fn fetch_minute_data(code: String) -> AppResult<Vec<MinutePoint>> {
    let tencent_code = to_tencent_code(&code);
    let url = format!("https://ifzq.gtimg.cn/appstock/app/minute/query?code={tencent_code}");
    let text = fetch_text(&url, None).await?;

    let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else {
        return Ok(Vec::new());
    };
    let Some(rows) = json["data"][&tencent_code]["data"]["data"].as_array() else {
        return Ok(Vec::new());
    };

    let mut points = Vec::new();

    for row in rows {
        let Some(line) = row.as_str() else {
            continue;
        };
        let fields = line.split_whitespace().collect::<Vec<_>>();
        if fields.len() < 3 {
            continue;
        }

        points.push(MinutePoint {
            time: format_minute_time(fields[0]),
            price: fields[1].parse::<f64>().unwrap_or(0.0),
            volume: fields[2].parse::<i64>().unwrap_or(0),
        });
    }

    Ok(points)
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
    fn converts_plain_codes_to_tencent_codes() {
        assert_eq!(to_tencent_code("600000"), "sh600000");
        assert_eq!(to_tencent_code("000001"), "sz000001");
        assert_eq!(to_tencent_code("sh000001"), "sh000001");
    }

    #[test]
    fn rejects_short_stock_payloads() {
        let parts = vec![""; 35];
        assert!(parse_stock_from_parts(&parts, "sh600000").is_none());
    }

    #[test]
    fn parses_valid_stock_payload_with_order_book() {
        let mut parts = vec![""; 46];
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
        parts[44] = "6500";
        parts[45] = "3200";

        let stock = parse_stock_from_parts(&parts, "sh600000").expect("valid payload should parse");

        assert_eq!(stock.code, "600000");
        assert_eq!(stock.name, "PF Bank");
        assert_eq!(stock.price, 10.12);
        assert_eq!(stock.volume, 123456);
        assert_eq!(stock.amount, 7890.5);
        assert_eq!(stock.total_market_cap, 6500.0);
        assert_eq!(stock.circulation_market_cap, 3200.0);

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
    fn parses_fund_quote_jsonp() {
        let quote = parse_fund_quote_jsonp(
            r#"jsonpgz({"fundcode":"001186","name":"富国文体健康股票A","jzrq":"2026-07-06","dwjz":"2.4390","gsz":"2.4068","gszzl":"-1.32","gztime":"2026-07-07 15:00"});"#,
        )
        .expect("valid fund quote should parse");

        assert_eq!(quote.code, "001186");
        assert_eq!(quote.name, "富国文体健康股票A");
        assert_eq!(quote.nav, Some(2.4390));
        assert_eq!(quote.estimate_nav, Some(2.4068));
        assert_eq!(quote.estimate_change_percent, Some(-1.32));
        assert_eq!(quote.estimate_time, "2026-07-07 15:00");
    }

    #[test]
    fn fund_quote_parser_keeps_safe_values_for_bad_numbers() {
        let quote = parse_fund_quote_jsonp(
            r#"jsonpgz({"fundcode":"001186","name":"Fund","jzrq":"","dwjz":"","gsz":"bad","gszzl":null,"gztime":""});"#,
        )
        .expect("fund quote with bad optional numbers should still parse");

        assert_eq!(quote.nav, None);
        assert_eq!(quote.estimate_nav, None);
        assert_eq!(quote.estimate_change_percent, None);
        assert_eq!(quote.nav_date, "");
    }

    #[test]
    fn fund_quote_parser_rejects_empty_payloads() {
        assert!(parse_fund_quote_jsonp("").is_none());
        assert!(parse_fund_quote_jsonp("jsonpgz({});").is_none());
        assert!(parse_fund_quote_jsonp("not-json").is_none());
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
    fn fund_quote_parser_rejects_exchange_traded_fund_names() {
        assert!(parse_fund_quote_jsonp(
            r#"jsonpgz({"fundcode":"510300","name":"CSI 300 ETF","jzrq":"2026-07-06","dwjz":"4.8311","gsz":"4.9000","gszzl":"1.43","gztime":"2026-07-07 15:00"});"#,
        )
        .is_none());

        assert!(parse_fund_quote_jsonp(
            r#"jsonpgz({"fundcode":"160641","name":"Bond LOF","jzrq":"2026-07-06","dwjz":"108.5896","gsz":"108.6000","gszzl":"0.01","gztime":"2026-07-07 15:00"});"#,
        )
        .is_none());
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            let restore = MenuItem::with_id(app, "restore", "恢复窗口", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&restore, &quit])?;

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
                "restore" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => app.exit(0),
                _ => {}
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            close_window,
            minimize_window,
            minimize_to_tray,
            set_always_on_top,
            start_drag,
            set_auto_start,
            fetch_stocks,
            search_stock,
            search_funds,
            fetch_funds,
            fetch_minute_data,
            fetch_kline_data,
            fetch_indices,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
