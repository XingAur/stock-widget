use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OrderLevel {
    pub price: f64,
    pub volume: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OrderBook {
    pub bids: Vec<OrderLevel>,
    pub asks: Vec<OrderLevel>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stock {
    pub code: String,
    pub name: String,
    pub price: f64,
    pub change: f64,
    pub change_percent: f64,
    pub high: f64,
    pub low: f64,
    pub open: f64,
    pub prev_close: f64,
    pub volume: i64,
    pub amount: f64,
    pub time: String,
    pub total_market_cap: f64,
    pub circulation_market_cap: f64,
    pub turnover_rate: f64,
    pub volume_ratio: f64,
    pub order_book: Option<OrderBook>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub code: String,
    pub name: String,
    pub market: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FundQuote {
    pub code: String,
    pub name: String,
    pub nav: Option<f64>,
    pub nav_date: String,
    pub change_percent: Option<f64>,
    pub estimate_nav: Option<f64>,
    pub estimate_change_percent: Option<f64>,
    pub estimate_time: String,
    pub sector: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct FundSearchResult {
    pub code: String,
    pub name: String,
    #[serde(rename = "type")]
    pub fund_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FundNavPoint {
    pub date: String,
    pub nav: f64,
    pub accumulated_nav: f64,
    pub change_percent: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FundRank {
    pub current: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FundProfile {
    pub code: String,
    pub fund_type: String,
    pub risk_level: String,
    pub one_year_return: Option<f64>,
    pub rank: Option<FundRank>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FundIndustry {
    pub name: String,
    pub percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FundHolding {
    pub code: String,
    pub name: String,
    pub percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FundAllocation {
    pub report_date: String,
    pub sector: String,
    pub industries: Vec<FundIndustry>,
    pub holdings: Vec<FundHolding>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinutePoint {
    pub time: String,
    pub price: f64,
    pub volume: i64,
    pub average_price: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KlinePoint {
    pub time: String,
    pub open: f64,
    pub close: f64,
    pub high: f64,
    pub low: f64,
    pub volume: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexData {
    pub code: String,
    pub name: String,
    pub price: f64,
    pub change: f64,
    pub change_percent: f64,
    pub volume: f64,
    pub sparkline: Vec<f64>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GlobalIndex {
    pub code: String,
    pub name: String,
    pub price: f64,
    pub change: f64,
    pub change_percent: f64,
    pub time: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gain_count: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lose_count: Option<i64>,
}
