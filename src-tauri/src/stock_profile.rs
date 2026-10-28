//! 个股详情页的“公司资料”：所属板块、公司简介、主营业务和最新公告。
//! 数据来自东方财富 F10 与公告中心的公开接口，任一接口失败只影响对应区块。

use serde::Serialize;
use serde_json::Value;

use crate::codes::to_tencent_code;
use crate::http::fetch_text;
use crate::paths::AppResult;

const F10_REFERER: &str = "https://emweb.securities.eastmoney.com/";
const NOTICE_REFERER: &str = "https://data.eastmoney.com/";
const MAX_BOARDS: usize = 24;
const MAX_ANNOUNCEMENTS: usize = 12;

#[derive(Debug, Serialize, Default, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StockAnnouncement {
    pub title: String,
    pub date: String,
    pub category: String,
    pub url: String,
}

#[derive(Debug, Serialize, Default, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StockProfile {
    pub code: String,
    pub full_name: String,
    pub industry: String,
    pub region: String,
    pub listing_date: String,
    pub profile: String,
    pub main_business: String,
    pub boards: Vec<String>,
    pub announcements: Vec<StockAnnouncement>,
}

/// 600698 -> SH600698，供东方财富 F10 接口使用
pub fn to_f10_code(code: &str) -> String {
    to_tencent_code(code.trim()).to_uppercase()
}

fn plain_code(code: &str) -> String {
    let trimmed = code.trim();
    let lower = trimmed.to_lowercase();
    if lower.starts_with("sh") || lower.starts_with("sz") || lower.starts_with("bj") {
        trimmed[2..].to_string()
    } else {
        trimmed.to_string()
    }
}

fn text_of(value: &Value) -> String {
    value
        .as_str()
        .map(|text| text.trim().to_string())
        .unwrap_or_default()
}

fn date_of(value: &Value) -> String {
    text_of(value).chars().take(10).collect()
}

pub fn parse_core_conception(text: &str) -> (Vec<String>, String) {
    let Ok(json) = serde_json::from_str::<Value>(text) else {
        return (Vec::new(), String::new());
    };

    let mut boards: Vec<String> = Vec::new();
    if let Some(rows) = json["ssbk"].as_array() {
        for row in rows {
            let name = text_of(&row["BOARD_NAME"]);
            if !name.is_empty() && !boards.contains(&name) {
                boards.push(name);
            }
            if boards.len() >= MAX_BOARDS {
                break;
            }
        }
    }

    let main_business = json["hxtc"]
        .as_array()
        .and_then(|rows| {
            rows.iter()
                .find(|row| text_of(&row["KEY_CLASSIF"]) == "主营业务")
                .map(|row| text_of(&row["MAINPOINT_CONTENT"]))
        })
        .unwrap_or_default();

    (boards, main_business)
}

pub fn apply_company_survey(text: &str, profile: &mut StockProfile) {
    let Ok(json) = serde_json::from_str::<Value>(text) else {
        return;
    };
    let basic = &json["jbzl"][0];
    profile.full_name = text_of(&basic["ORG_NAME"]);
    profile.industry = text_of(&basic["EM2016"]);
    profile.region = text_of(&basic["PROVINCE"]);
    profile.profile = text_of(&basic["ORG_PROFILE"]);
    profile.listing_date = date_of(&json["fxxg"][0]["LISTING_DATE"]);
}

pub fn parse_announcements(text: &str, code: &str) -> Vec<StockAnnouncement> {
    let Ok(json) = serde_json::from_str::<Value>(text) else {
        return Vec::new();
    };
    let Some(rows) = json["data"]["list"].as_array() else {
        return Vec::new();
    };

    rows.iter()
        .filter_map(|row| {
            let art_code = text_of(&row["art_code"]);
            let raw_title = text_of(&row["title"]);
            if art_code.is_empty() || raw_title.is_empty() {
                return None;
            }
            // 标题通常带“简称:”前缀，详情页已显示股票名，去掉更易读
            let title = match raw_title
                .split_once(':')
                .or_else(|| raw_title.split_once('：'))
            {
                Some((prefix, rest)) if prefix.chars().count() <= 8 && !rest.trim().is_empty() => {
                    rest.trim().to_string()
                }
                _ => raw_title.clone(),
            };
            let category = row["columns"]
                .as_array()
                .and_then(|columns| columns.first())
                .map(|column| text_of(&column["column_name"]))
                .unwrap_or_default();
            Some(StockAnnouncement {
                title,
                date: date_of(&row["notice_date"]),
                category,
                url: format!("https://data.eastmoney.com/notices/detail/{code}/{art_code}.html"),
            })
        })
        .take(MAX_ANNOUNCEMENTS)
        .collect()
}

#[tauri::command]
pub async fn fetch_stock_profile(code: String) -> AppResult<StockProfile> {
    let code = plain_code(&code);
    if code.is_empty() || !code.chars().all(|ch| ch.is_ascii_digit()) {
        return Err("股票代码不合法".to_string());
    }
    let f10_code = to_f10_code(&code);

    let survey_url = format!(
        "https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax?code={f10_code}"
    );
    let concept_url = format!(
        "https://emweb.securities.eastmoney.com/PC_HSF10/CoreConception/PageAjax?code={f10_code}"
    );
    let notice_url = format!(
        "https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size={MAX_ANNOUNCEMENTS}&page_index=1&ann_type=A&client_source=web&stock_list={code}"
    );

    let (survey, concept, notices) = tokio::join!(
        fetch_text(&survey_url, Some(F10_REFERER)),
        fetch_text(&concept_url, Some(F10_REFERER)),
        fetch_text(&notice_url, Some(NOTICE_REFERER)),
    );

    if survey.is_err() && concept.is_err() && notices.is_err() {
        return Err(survey
            .err()
            .unwrap_or_else(|| "公司资料加载失败".to_string()));
    }

    let mut profile = StockProfile {
        code: code.clone(),
        ..Default::default()
    };
    if let Ok(text) = survey {
        apply_company_survey(&text, &mut profile);
    }
    if let Ok(text) = concept {
        let (boards, main_business) = parse_core_conception(&text);
        profile.boards = boards;
        profile.main_business = main_business;
    }
    if let Ok(text) = notices {
        profile.announcements = parse_announcements(&text, &code);
    }
    Ok(profile)
}

fn is_allowed_external_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else {
        return false;
    };
    // cmd start 会解释这些字符，公告地址本身不包含它们
    if url
        .chars()
        .any(|ch| ch.is_whitespace() || "\"&|<>^%".contains(ch))
    {
        return false;
    }
    let host = rest.split(['/', '?', '#']).next().unwrap_or_default();
    host == "eastmoney.com" || host.ends_with(".eastmoney.com")
}

/// 在系统浏览器中打开公告原文，只允许东方财富域名
#[tauri::command]
pub fn open_external_url(url: String) -> AppResult<()> {
    let trimmed = url.trim().to_string();
    if !is_allowed_external_url(&trimmed) {
        return Err("链接地址不合法".to_string());
    }
    #[allow(clippy::zombie_processes)]
    crate::updates::spawn_hidden("cmd", &["/C", "start", "", &trimmed])
        .map_err(|error| format!("打开链接失败：{error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_f10_codes() {
        assert_eq!(to_f10_code("600698"), "SH600698");
        assert_eq!(to_f10_code("002185"), "SZ002185");
        assert_eq!(to_f10_code("830799"), "BJ830799");
        assert_eq!(plain_code("sh600698"), "600698");
    }

    #[test]
    fn parses_boards_and_main_business() {
        let text = r#"{"ssbk":[{"BOARD_NAME":"汽车"},{"BOARD_NAME":"汽车零部件"},{"BOARD_NAME":"汽车"}],
            "hxtc":[{"KEY_CLASSIF":"经营范围","MAINPOINT_CONTENT":"范围"},{"KEY_CLASSIF":"主营业务","MAINPOINT_CONTENT":"涡轮增压器"}]}"#;
        let (boards, main) = parse_core_conception(text);
        assert_eq!(boards, vec!["汽车", "汽车零部件"]);
        assert_eq!(main, "涡轮增压器");
        assert_eq!(parse_core_conception("oops"), (Vec::new(), String::new()));
    }

    #[test]
    fn applies_company_survey() {
        let text = r#"{"jbzl":[{"ORG_NAME":"湖南天雁机械股份有限公司","EM2016":"交运设备-汽车-汽车零部件","PROVINCE":"湖南","ORG_PROFILE":"简介"}],
            "fxxg":[{"LISTING_DATE":"1993-12-06 00:00:00"}]}"#;
        let mut profile = StockProfile::default();
        apply_company_survey(text, &mut profile);
        assert_eq!(profile.full_name, "湖南天雁机械股份有限公司");
        assert_eq!(profile.industry, "交运设备-汽车-汽车零部件");
        assert_eq!(profile.listing_date, "1993-12-06");
    }

    #[test]
    fn parses_announcements() {
        let text = r#"{"data":{"list":[{"art_code":"AN1","title":"湖南天雁:关于业绩说明会的公告","notice_date":"2026-09-02 00:00:00","columns":[{"column_name":"调研活动"}]},{"art_code":"","title":"x"}]}}"#;
        let items = parse_announcements(text, "600698");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "关于业绩说明会的公告");
        assert_eq!(items[0].date, "2026-09-02");
        assert_eq!(items[0].category, "调研活动");
        assert_eq!(
            items[0].url,
            "https://data.eastmoney.com/notices/detail/600698/AN1.html"
        );
    }

    #[test]
    fn restricts_external_urls() {
        assert!(is_allowed_external_url(
            "https://data.eastmoney.com/notices/detail/600698/AN1.html"
        ));
        assert!(!is_allowed_external_url("https://evil.com/eastmoney.com"));
        assert!(!is_allowed_external_url("http://data.eastmoney.com/x"));
        assert!(!is_allowed_external_url("https://eastmoney.com.evil.com/"));
        assert!(!is_allowed_external_url(
            "https://data.eastmoney.com/a&calc"
        ));
    }
}
