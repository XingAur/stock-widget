use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};

use crate::codes::parse_tencent_lines;
use crate::fund::{
    apply_holding_estimate, is_six_digit_code, parse_fund_base_one_year_return, parse_fund_holdings,
    parse_fund_industries, parse_fund_nav_history, parse_fund_profile, parse_fund_search_results,
    parse_fund_sector, parse_pingzhong_fund_history, parse_tencent_fund_quote, percent_encode,
};
use crate::http::{fetch_text, fetch_text_gbk};
use crate::models::{FundAllocation, FundNavPoint, FundProfile, FundQuote, FundSearchResult};
use crate::paths::AppResult;
use crate::tencent::fetch_stocks_from_network;

const FUND_ALLOCATION_CACHE_TTL: Duration = Duration::from_secs(6 * 60 * 60);

#[derive(Clone)]
pub(crate) struct CachedFundAllocation {
    pub fetched_at: Instant,
    pub value: FundAllocation,
}

impl CachedFundAllocation {
    pub fn is_fresh_at(&self, now: Instant) -> bool {
        now.saturating_duration_since(self.fetched_at) < FUND_ALLOCATION_CACHE_TTL
    }
}

static FUND_ALLOCATION_CACHE: OnceLock<Mutex<HashMap<String, CachedFundAllocation>>> =
    OnceLock::new();

fn validate_fund_code(code: &str) -> AppResult<&str> {
    let code = code.trim();
    if is_six_digit_code(code) {
        Ok(code)
    } else {
        Err("基金代码必须为六位数字".to_string())
    }
}

pub fn resolve_fund_history_attempts(
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
pub async fn search_funds(keyword: String) -> AppResult<Vec<FundSearchResult>> {
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
pub async fn fetch_funds(codes: Vec<String>) -> AppResult<Vec<FundQuote>> {
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
    let stocks = fetch_stocks_from_network(&holding_codes)
        .await
        .unwrap_or_default();
    for quote in &mut quotes {
        if let Some(allocation) = allocations.get(&quote.code) {
            apply_holding_estimate(quote, &allocation.holdings, &stocks);
        }
    }
    Ok(quotes)
}

#[tauri::command]
pub async fn fetch_fund_history(code: String) -> AppResult<Vec<FundNavPoint>> {
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
pub async fn fetch_fund_profile(code: String) -> AppResult<FundProfile> {
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
pub async fn fetch_fund_allocation(code: String) -> AppResult<FundAllocation> {
    let code = validate_fund_code(&code)?;
    load_fund_allocation_cached(code).await
}
