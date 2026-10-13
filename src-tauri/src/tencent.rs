use serde_json::Value;

use crate::codes::{parse_f64, parse_i64};
use crate::models::{MinutePoint, OrderBook, OrderLevel, Stock};

pub fn parse_order_book(parts: &[&str]) -> Option<OrderBook> {
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

pub fn parse_stock_from_parts(parts: &[&str], code: &str) -> Option<Stock> {
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

fn round4(value: f64) -> f64 {
    (value * 10_000.0).round() / 10_000.0
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

pub fn parse_minute_points(text: &str, tencent_code: &str) -> Vec<MinutePoint> {
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

pub async fn fetch_stocks_from_network(codes: &[String]) -> crate::paths::AppResult<Vec<Stock>> {
    if codes.is_empty() {
        return Ok(Vec::new());
    }
    let tencent_codes = codes
        .iter()
        .map(|code| crate::codes::to_tencent_code(code))
        .collect::<Vec<_>>();
    let url = format!("https://qt.gtimg.cn/q={}", tencent_codes.join(","));
    let text = crate::http::fetch_text_gbk(&url, None).await?;
    Ok(crate::codes::parse_tencent_lines(&text, |code, payload| {
        let parts = payload.split('~').collect::<Vec<_>>();
        parse_stock_from_parts(&parts, code)
    }))
}
