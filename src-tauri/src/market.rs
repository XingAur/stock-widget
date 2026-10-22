use crate::codes::{parse_f64, parse_tencent_lines};
use crate::eastmoney::{parse_eastmoney_global_indices, parse_eastmoney_sectors};
use crate::fund::format_quote_time;
use crate::http::{fetch_text, fetch_text_gbk};
use crate::models::GlobalIndex;
use crate::paths::AppResult;

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

const SECTOR_PAGE_SIZE: usize = 100;
const SECTOR_MAX_PAGES: usize = 8;

const US_SECTOR_ETFS: &str =
    "107.XLK,107.XLF,107.XLE,107.XLV,107.XLI,107.XLY,107.XLP,107.XLB,107.XLU,107.XLRE,107.XLC";

fn parse_market_response(text: &str, sectors: bool) -> AppResult<(Vec<GlobalIndex>, usize)> {
    let json: serde_json::Value = serde_json::from_str(text)
        .map_err(|_| "东方财富返回非 JSON 数据，请稍后重试".to_string())?;
    if json["rc"].as_i64().is_some_and(|code| code != 0) {
        return Err(format!("东方财富返回业务错误（rc={}）", json["rc"]));
    }
    let rows = json["data"]["diff"]
        .as_array()
        .ok_or_else(|| "东方财富行情数据结构异常或未返回数据".to_string())?;
    let valid = parse_eastmoney_global_indices(text);
    if !rows.is_empty() && valid.is_empty() {
        return Err("东方财富响应中无有效行情，请稍后重试".to_string());
    }
    let data = if sectors {
        parse_eastmoney_sectors(text)
    } else {
        valid
    };
    Ok((data, rows.len()))
}

pub fn parse_tencent_global_index(parts: &[&str], code: &str) -> Option<GlobalIndex> {
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
    parse_market_response(&text, false).map(|(data, _)| data)
}

async fn fetch_cn_sector_list(sector_type: &str) -> AppResult<Vec<GlobalIndex>> {
    let mut all = Vec::new();
    let mut seen_codes = std::collections::HashSet::new();
    for page in 1..=SECTOR_MAX_PAGES {
        let url = format!(
            "https://push2.eastmoney.com/api/qt/clist/get?pn={page}&pz={SECTOR_PAGE_SIZE}&po=1&np=1&fltt=2&invt=2&fid=f62&fs=m:90+t:{sector_type}&fields=f2,f3,f4,f12,f14,f104,f105,f124"
        );
        let text = fetch_text(&url, Some("https://quote.eastmoney.com/")).await?;
        let (page_rows, page_len) = parse_market_response(&text, true)?;
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

pub fn simplify_us_sector_name(code: &str, fallback: &str) -> String {
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
    Ok(parse_market_response(&text, false)?
        .0
        .into_iter()
        .map(|mut index| {
            index.name = simplify_us_sector_name(&index.code, &index.name);
            index
        })
        .collect())
}

#[tauri::command]
pub async fn fetch_global_indices(market: String) -> AppResult<Vec<GlobalIndex>> {
    let market = market.trim();
    if market == "world" {
        return fetch_world_global_indices().await;
    }
    if market == "sectors" {
        return fetch_cn_sector_list("3").await;
    }
    if market == "industry-sectors" {
        return fetch_cn_sector_list("2").await;
    }
    if market == "us-sectors" {
        return fetch_us_sector_indices().await;
    }
    fetch_tencent_global_indices(market).await
}

#[cfg(test)]
mod response_tests {
    use super::parse_market_response;

    #[test]
    fn reports_gateway_pages_and_provider_errors() {
        assert!(parse_market_response("<html>Bad Gateway</html>", true)
            .unwrap_err()
            .contains("JSON"));
        assert!(parse_market_response(r#"{"rc":429,"data":null}"#, true)
            .unwrap_err()
            .contains("429"));
        assert!(parse_market_response(r#"{"rc":0,"data":null}"#, true).is_err());
    }

    #[test]
    fn distinguishes_empty_pages_from_invalid_quotes() {
        assert_eq!(
            parse_market_response(r#"{"data":{"diff":[]}}"#, true).unwrap(),
            (vec![], 0)
        );
        assert!(parse_market_response(r#"{"data":{"diff":[{"f2":"-"}]}}"#, true).is_err());
    }

    #[test]
    fn counts_raw_rows_before_filtering_for_pagination() {
        let text = r#"{"rc":0,"data":{"diff":[{"f2":100,"f3":1,"f4":1,"f12":"BK1","f14":"银行","f124":1792645200},{"f2":100,"f12":"BK2","f14":"昨日涨停","f124":1792645200}]}}"#;
        let (data, count) = parse_market_response(text, true).unwrap();
        assert_eq!(count, 2);
        assert_eq!(data.len(), 1);
        assert_eq!(data[0].name, "银行");
    }
}
