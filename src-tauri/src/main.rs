#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
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

    if code.starts_with('5') || code.starts_with('6') {
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

fn unix_millis_to_date(timestamp_ms: i64) -> Option<String> {
    let days = timestamp_ms.div_euclid(86_400_000);
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
            let date = unix_millis_to_date(values.first()?.as_i64()?)?;
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
            let date = unix_millis_to_date(timestamp)?;

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

fn decode_utf8_text(bytes: &[u8]) -> String {
    let (text, _, _) = encoding_rs::UTF_8.decode(bytes);
    text.into_owned()
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
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    Ok(decode_utf8_text(&bytes))
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

    let mut allocations = HashMap::new();
    for quote in &quotes {
        if let Ok(allocation) = load_fund_allocation_cached(&quote.code).await {
            allocations.insert(quote.code.clone(), allocation);
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
    let text = fetch_text_gbk(&url, Some("https://fund.eastmoney.com/")).await?;
    parse_fund_profile(code, &text)
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
    let industry_text = fetch_text(&industry_url, Some(&referer)).await?;
    let (report_date, industries) = parse_fund_industries(&industry_text)?;
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
        assert_eq!(to_tencent_code("588870"), "sh588870");
        assert_eq!(to_tencent_code("159915"), "sz159915");
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
            fetch_fund_history,
            fetch_fund_profile,
            fetch_fund_allocation,
            fetch_index_history,
            fetch_minute_data,
            fetch_kline_data,
            fetch_indices,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
