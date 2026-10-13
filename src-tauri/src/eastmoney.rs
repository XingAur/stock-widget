use serde_json::Value;

use crate::models::GlobalIndex;

pub fn unix_millis_to_china_date(timestamp_ms: i64) -> Option<String> {
    let china_timestamp_ms = timestamp_ms.checked_add(8 * 60 * 60 * 1000)?;
    let days = china_timestamp_ms.div_euclid(86_400_000);
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

pub fn format_eastmoney_timestamp(timestamp_seconds: i64) -> Option<String> {
    let timestamp_ms = timestamp_seconds.checked_mul(1000)?;
    let date = unix_millis_to_china_date(timestamp_ms)?;
    let china_seconds = timestamp_seconds + 8 * 60 * 60;
    let seconds_of_day = china_seconds.rem_euclid(86_400);

    Some(format!(
        "{date} {:02}:{:02}:{:02}",
        seconds_of_day / 3600,
        (seconds_of_day % 3600) / 60,
        seconds_of_day % 60
    ))
}

pub fn parse_eastmoney_global_indices(text: &str) -> Vec<GlobalIndex> {
    parse_eastmoney_rows(text, false)
}

fn is_statistics_style_sector(name: &str) -> bool {
    const KEYWORDS: &[&str] = &[
        "昨日",
        "连板",
        "涨停",
        "跌停",
        "风格",
        "大盘",
        "中盘",
        "小盘",
        "ST板块",
        "次新股",
        "破净",
        "高送转",
        "预盈预增",
        "预亏预减",
    ];
    KEYWORDS.iter().any(|keyword| name.contains(keyword))
}

pub fn parse_eastmoney_sectors(text: &str) -> Vec<GlobalIndex> {
    parse_eastmoney_rows(text, true)
        .into_iter()
        .filter(|index| !is_statistics_style_sector(&index.name))
        .collect()
}

fn parse_eastmoney_rows(text: &str, sectors: bool) -> Vec<GlobalIndex> {
    let Ok(json) = serde_json::from_str::<Value>(text) else {
        return Vec::new();
    };
    let Some(rows) = json["data"]["diff"].as_array() else {
        return Vec::new();
    };

    rows.iter()
        .filter_map(|row| {
            let number = |key: &str| row[key].as_f64().filter(|value| value.is_finite());
            let price = number("f2")?;
            let change_percent = number("f3").unwrap_or(0.0);
            let change = number("f4").unwrap_or(0.0);
            let code = row["f12"].as_str()?.trim().to_string();
            let name = row["f14"].as_str()?.trim().to_string();
            let timestamp = number("f124").map(|seconds| seconds as i64)?;
            let time = format_eastmoney_timestamp(timestamp)?;
            if price <= 0.0 || code.is_empty() || name.is_empty() {
                return None;
            }

            Some(GlobalIndex {
                code,
                name,
                price,
                change,
                change_percent,
                time,
                gain_count: if sectors {
                    row["f104"].as_i64().filter(|value| *value >= 0)
                } else {
                    None
                },
                lose_count: if sectors {
                    row["f105"].as_i64().filter(|value| *value >= 0)
                } else {
                    None
                },
            })
        })
        .collect()
}
