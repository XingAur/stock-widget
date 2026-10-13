use std::collections::HashMap;
use serde_json::Value;

use crate::codes::parse_optional_f64;
use crate::eastmoney::unix_millis_to_china_date;
use crate::models::{
    FundHolding, FundIndustry, FundNavPoint, FundProfile, FundQuote, FundRank, FundSearchResult, Stock,
};
use crate::paths::AppResult;
pub fn json_string(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

pub fn is_six_digit_code(code: &str) -> bool {
    code.len() == 6 && code.bytes().all(|byte| byte.is_ascii_digit())
}

pub fn is_category_700(value: Option<&Value>) -> bool {
    match value {
        Some(item) => {
            item.as_i64()
                .or_else(|| item.as_str().and_then(|text| text.parse::<i64>().ok()))
                == Some(700)
        }
        None => true,
    }
}

pub fn is_buyable_fund(value: Option<&Value>) -> bool {
    match value {
        Some(item) => {
            item.as_i64()
                .or_else(|| item.as_str().and_then(|text| text.parse::<i64>().ok()))
                == Some(1)
        }
        None => true,
    }
}

pub fn is_unsupported_exchange_traded_fund_name(name: &str) -> bool {
    let upper_name = name.to_ascii_uppercase();
    let is_etf = upper_name.contains("ETF");
    let is_etf_link = upper_name.contains("ETF LINK") || name.contains("\u{8054}\u{63a5}");

    upper_name.contains("LOF")
        || name.contains("\u{573a}\u{5185}")
        || name.contains("\u{5c01}\u{95ed}")
        || (is_etf && !is_etf_link)
}

pub fn is_supported_fund_search_item(item: &Value) -> bool {
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

pub fn percent_encode(value: &str) -> String {
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

pub fn extract_jsonp_payload(text: &str) -> Option<&str> {
    let trimmed = text.trim();
    let start = trimmed.find('(')?;
    let end = trimmed.rfind(')')?;

    (start < end).then_some(trimmed[start + 1..end].trim())
}

pub fn parse_json_or_jsonp(text: &str) -> Option<Value> {
    serde_json::from_str::<Value>(text.trim()).ok().or_else(|| {
        extract_jsonp_payload(text).and_then(|payload| serde_json::from_str::<Value>(payload).ok())
    })
}

pub fn parse_tencent_fund_quote(parts: &[&str]) -> Option<FundQuote> {
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

pub fn parse_fund_sector(text: &str) -> Option<String> {
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

pub fn parse_fund_search_results(text: &str) -> Vec<FundSearchResult> {
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

pub fn extract_js_array_assignment<'a>(text: &'a str, variable: &str) -> AppResult<&'a str> {
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

pub fn parse_pingzhong_fund_history(text: &str) -> AppResult<Vec<FundNavPoint>> {
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

pub fn parse_fund_nav_history(text: &str) -> AppResult<Vec<FundNavPoint>> {
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

pub fn strip_html(value: &str) -> String {
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

pub fn parse_js_number(text: &str, variable: &str) -> Option<f64> {
    let marker = format!("var {variable}=\"");
    let rest = text.split_once(&marker)?.1;
    rest.split_once('"')?.0.trim().parse::<f64>().ok()
}

pub fn parse_fund_base_one_year_return(text: &str) -> Option<f64> {
    let json: Value = serde_json::from_str(text).ok()?;
    let value = json.get("Datas")?.get("SYL_1N")?;
    let parsed = value.as_f64().or_else(|| {
        value
            .as_str()
            .and_then(|text| text.trim().parse::<f64>().ok())
    })?;
    parsed.is_finite().then_some(parsed)
}

pub fn parse_rank(value: &str) -> Option<FundRank> {
    let mut parts = value.split('|').map(str::trim);
    let current = parts.next()?.parse::<i64>().ok()?;
    let total = parts.next()?.parse::<i64>().ok()?;
    (current > 0 && total > 0).then_some(FundRank { current, total })
}

pub fn collect_html_class_values(text: &str, class_name: &str) -> Vec<String> {
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

pub fn parse_fund_profile(code: &str, html: &str) -> AppResult<FundProfile> {
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

pub fn parse_fund_industries(text: &str) -> AppResult<(String, Vec<FundIndustry>)> {
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

pub fn parse_table_cells(row: &str) -> Vec<String> {
    row.split("<td")
        .skip(1)
        .filter_map(|cell| {
            let start = cell.find('>')? + 1;
            let end = cell[start..].find("</td>")? + start;
            Some(strip_html(&cell[start..end]))
        })
        .collect()
}

pub fn parse_fund_holdings(text: &str) -> Vec<FundHolding> {
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

pub fn quote_date_key(value: &str) -> String {
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

pub fn format_quote_time(value: &str) -> String {
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

pub fn round4(value: f64) -> f64 {
    (value * 10_000.0).round() / 10_000.0
}

pub fn apply_holding_estimate(quote: &mut FundQuote, holdings: &[FundHolding], stocks: &[Stock]) {
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

