use serde_json::Value;

use crate::codes::{parse_f64, parse_tencent_lines, to_tencent_code};
use crate::http::{fetch_text, fetch_text_gbk};
use crate::models::{IndexData, KlinePoint, MinutePoint};
use crate::paths::AppResult;
use crate::tencent::parse_minute_points;

#[tauri::command]
pub async fn fetch_index_history(code: String) -> AppResult<Vec<KlinePoint>> {
    if code != "sh000300" {
        return Err("仅支持沪深300指数".to_string());
    }
    fetch_kline_data(code, "day".to_string()).await
}

#[tauri::command]
pub async fn fetch_minute_data(code: String) -> AppResult<Vec<MinutePoint>> {
    let tencent_code = to_tencent_code(&code);
    let url = format!("https://ifzq.gtimg.cn/appstock/app/minute/query?code={tencent_code}");
    let text = fetch_text(&url, None).await?;
    Ok(parse_minute_points(&text, &tencent_code))
}

#[tauri::command]
pub async fn fetch_kline_data(code: String, ktype: String) -> AppResult<Vec<KlinePoint>> {
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
pub async fn fetch_indices() -> AppResult<Vec<IndexData>> {
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
