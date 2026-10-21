#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![allow(clippy::items_after_test_module)]

mod app_log;
mod codes;
mod eastmoney;
mod fund;
mod fund_api;
mod http;
mod kline;
mod market;
mod models;
mod ocr;
mod paths;
mod tencent;
mod update_guard;
mod updates;
mod window_state;

#[cfg(test)]
use eastmoney::format_eastmoney_timestamp;
#[cfg(test)]
use eastmoney::{
    parse_eastmoney_global_indices, parse_eastmoney_sectors, unix_millis_to_china_date,
};
#[cfg(test)]
use fund::*;
#[cfg(test)]
use fund_api::{resolve_fund_history_attempts, CachedFundAllocation};
use models::*;
use tencent::fetch_stocks_from_network;
#[cfg(test)]
use tencent::{parse_minute_points, parse_stock_from_parts};

#[cfg(test)]
use codes::{parse_tencent_lines, to_tencent_code};
#[cfg(test)]
use market::{parse_tencent_global_index, simplify_us_sector_name};
#[cfg(test)]
use updates::{parse_latest_release, version_is_newer};

#[cfg(test)]
use http::decode_utf8_text;
use http::fetch_text_gbk;
use ocr::ocr_image_bytes;
use paths::{read_state_file, APP_STATE_FILE, QUOTE_CACHE_FILE};
use std::collections::HashSet;
use tauri::{
    menu::{Menu, MenuItem},
    AppHandle, Emitter, Manager, WebviewWindow,
};
#[cfg(test)]
use window_state::WindowGeometry;
use window_state::{restore_window_geometry, save_window_geometry, watch_window_geometry};

type AppResult<T> = Result<T, String>;

#[tauri::command]
fn persist_app_state(app: AppHandle, state: String) -> AppResult<()> {
    if state.trim().is_empty() {
        return Err("应用状态内容为空，已拒绝覆盖持久化文件".to_string());
    }

    paths::write_atomic(
        &paths::app_data_file(&app, APP_STATE_FILE)?,
        state.as_bytes(),
    )
}

#[tauri::command]
fn load_app_state(app: AppHandle) -> AppResult<Option<String>> {
    Ok(read_state_file(&app, APP_STATE_FILE))
}

#[tauri::command]
async fn ocr_image(image_base64: String) -> AppResult<Vec<String>> {
    // OCR 的 WinRT 调用全程同步阻塞（数百毫秒到数秒），必须放到线程池执行；
    // 同步命令会占用 Tauri 主线程，导致窗口"未响应"并触发系统 ghost 窗口。
    tauri::async_runtime::spawn_blocking(move || {
        use base64::Engine;

        let cleaned = image_base64.trim();
        let payload = cleaned
            .strip_prefix("data:image")
            .and_then(|rest| rest.split_once(','))
            .map(|(_, data)| data)
            .unwrap_or(cleaned);

        let bytes = base64::engine::general_purpose::STANDARD
            .decode(payload)
            .map_err(|error| format!("图片数据解码失败：{error}"))?;
        if bytes.is_empty() {
            return Err("图片内容为空".to_string());
        }

        ocr_image_bytes(&bytes)
    })
    .await
    .map_err(|error| format!("图片识别任务失败：{error}"))?
}

#[tauri::command]
fn append_log(app: AppHandle, level: String, message: String) -> AppResult<()> {
    app_log::append_log(&app, &level, &message);
    Ok(())
}

#[tauri::command]
fn open_log_file(app: AppHandle) -> AppResult<()> {
    let path = app_log::log_file_path(&app)?;
    if !path.exists() {
        std::fs::write(&path, "").map_err(|error| format!("创建日志文件失败：{error}"))?;
    }

    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|error| format!("打开日志失败：{error}"))?;
    Ok(())
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

const WEBVIEW_RESTORE_SCRIPT: &str = r#"
(() => {
  try {
    const root = document.documentElement;
    if (root) {
      root.style.transform = 'translateZ(0)';
      void root.offsetHeight;
      root.style.transform = '';
    }
    const app = document.getElementById('app');
    if (!app || app.childElementCount === 0) {
      const key = 'webviewRecoveryAt';
      const last = Number(sessionStorage.getItem(key) || '0');
      const now = Date.now();
      if (now - last > 15000) {
        sessionStorage.setItem(key, String(now));
        location.reload();
      }
    }
  } catch (error) {
    location.reload();
  }
})();
"#;

fn restore_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.eval(WEBVIEW_RESTORE_SCRIPT);
    let _ = window.emit("window-restored", ());
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

#[tauri::command]
async fn fetch_stocks(app: AppHandle, codes: Vec<String>) -> AppResult<Vec<Stock>> {
    if codes.is_empty() {
        return Ok(Vec::new());
    }
    let fetched = fetch_stocks_from_network(&codes).await;

    match fetched {
        Ok(stocks) if !stocks.is_empty() => {
            if let Ok(payload) = serde_json::to_string(&stocks) {
                if let Ok(path) = paths::app_data_file(&app, QUOTE_CACHE_FILE) {
                    let _ = paths::write_atomic(&path, payload.as_bytes());
                }
            }
            Ok(stocks)
        }
        other => {
            let cached = load_cached_stocks(&app, &codes);
            if cached.is_empty() {
                other
            } else {
                Ok(cached)
            }
        }
    }
}

fn load_cached_stocks(app: &AppHandle, codes: &[String]) -> Vec<Stock> {
    let Some(raw) = paths::read_state_file(app, QUOTE_CACHE_FILE) else {
        return Vec::new();
    };
    let Ok(all) = serde_json::from_str::<Vec<Stock>>(&raw) else {
        return Vec::new();
    };
    let wanted: HashSet<String> = codes
        .iter()
        .map(|code| code.replace("sh", "").replace("sz", "").replace("bj", ""))
        .collect();
    all.into_iter()
        .filter(|stock| wanted.contains(&stock.code))
        .collect()
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
    let text = fetch_text_gbk(&url, None).await?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_release_versions() {
        assert!(version_is_newer("1.0.8", "1.0.7"));
        assert!(version_is_newer("1.1.0", "1.0.9"));
        assert!(version_is_newer("2.0", "1.9.9"));
        assert!(!version_is_newer("1.0.7", "1.0.7"));
        assert!(!version_is_newer("1.0.6", "1.0.7"));
        assert!(!version_is_newer("", "1.0.7"));
    }

    #[test]
    fn parses_latest_release_payload() {
        let body = r#"{"tag_name":"v1.0.8","html_url":"https://github.com/XingAur/stock-widget/releases/tag/v1.0.8","body":"修复与优化","assets":[{"name":"latest.json","browser_download_url":"https://example.com/latest.json"},{"name":"APlus_Assistant_1.0.8_x64-setup.exe","browser_download_url":"https://example.com/APlus_Assistant_1.0.8_x64-setup.exe"}]}"#;

        let result = parse_latest_release(body, "1.0.7");
        assert!(result.has_update);
        assert_eq!(result.latest_version, "1.0.8");
        assert_eq!(
            result.download_url.as_deref(),
            Some("https://example.com/APlus_Assistant_1.0.8_x64-setup.exe")
        );

        let same = parse_latest_release(body, "1.0.8");
        assert!(!same.has_update);
    }

    #[test]
    fn converts_plain_codes_to_tencent_codes() {
        assert_eq!(to_tencent_code("600000"), "sh600000");
        assert_eq!(to_tencent_code("588870"), "sh588870");
        assert_eq!(to_tencent_code("159915"), "sz159915");
        assert_eq!(to_tencent_code("000001"), "sz000001");
        assert_eq!(to_tencent_code("sh000001"), "sh000001");
    }

    #[test]
    fn converts_beijing_exchange_codes_to_bj_prefix() {
        assert_eq!(to_tencent_code("430047"), "bj430047");
        assert_eq!(to_tencent_code("830799"), "bj830799");
        assert_eq!(to_tencent_code("920002"), "bj920002");
        assert_eq!(to_tencent_code("bj920002"), "bj920002");
        // 沪市 B 股与深市代码不受影响
        assert_eq!(to_tencent_code("900901"), "sh900901");
        assert_eq!(to_tencent_code("002594"), "sz002594");
    }

    #[test]
    fn window_geometry_serializes_with_camel_case() {
        let geometry = WindowGeometry {
            x: -120,
            y: 88,
            width: 280,
            height: 480,
        };
        let payload = serde_json::to_string(&geometry).expect("geometry should serialize");
        assert_eq!(payload, r#"{"x":-120,"y":88,"width":280,"height":480}"#);

        let parsed: WindowGeometry =
            serde_json::from_str(&payload).expect("geometry should deserialize");
        assert_eq!(parsed, geometry);
    }

    #[test]
    fn parses_tencent_global_index_payload() {
        let mut parts = vec![""; 36];
        parts[1] = "上证指数";
        parts[3] = "3342.66";
        parts[30] = "20260922150000";
        parts[31] = "40.12";
        parts[32] = "1.21";

        let index =
            parse_tencent_global_index(&parts, "sh000001").expect("valid index should parse");
        assert_eq!(index.code, "sh000001");
        assert_eq!(index.name, "上证指数");
        assert_eq!(index.price, 3342.66);
        assert_eq!(index.change_percent, 1.21);
        assert_eq!(index.time, "2026-09-22 15:00:00");
    }

    #[test]
    fn rejects_global_index_payloads_without_valid_price_or_time() {
        assert!(parse_tencent_global_index(&[""; 36], "sh000001").is_none());

        let mut stale = vec![""; 36];
        stale[1] = "上证指数";
        stale[3] = "3342.66";
        stale[30] = "";
        assert!(parse_tencent_global_index(&stale, "sh000001").is_none());
    }

    #[test]
    fn parses_eastmoney_world_indices() {
        let body = r#"{"data":{"diff":[
            {"f2":65018.95,"f3":1.38,"f4":884.11,"f12":"N225","f14":"日经225","f124":1789458600},
            {"f2":0.0,"f3":0.0,"f4":0.0,"f12":"BAD","f14":"无效","f124":1789458600},
            {"f2":7117.18,"f3":1.56,"f4":109.4,"f12":"KS11","f14":"韩国KOSPI","f124":1789458600}
        ]}}"#;

        let indices = parse_eastmoney_global_indices(body);

        assert_eq!(indices.len(), 2);
        assert_eq!(indices[0].code, "N225");
        assert_eq!(indices[0].name, "日经225");
        assert_eq!(indices[0].price, 65018.95);
        assert_eq!(indices[0].change_percent, 1.38);
        assert_eq!(indices[0].time, "2026-09-15 15:50:00");
        assert_eq!(indices[1].code, "KS11");
    }

    #[test]
    fn eastmoney_timestamp_uses_china_timezone() {
        // 1784563200 = 北京时间 2026-07-21 00:00:00
        assert_eq!(
            format_eastmoney_timestamp(1_784_563_200).as_deref(),
            Some("2026-07-21 00:00:00")
        );
    }

    #[test]
    fn rejects_malformed_eastmoney_payloads() {
        assert!(parse_eastmoney_global_indices("not json").is_empty());
        assert!(parse_eastmoney_global_indices(r#"{"data":null}"#).is_empty());
    }

    #[test]
    fn parses_concept_sectors_with_member_counts_and_filters_statistics() {
        let body = r#"{"data":{"diff":[
            {"f2":1944.81,"f3":3.10,"f4":58.5,"f12":"BK1127","f14":"AI芯片","f104":86,"f105":4,"f124":1789458600},
            {"f2":54580.89,"f3":2.55,"f4":1358.1,"f12":"BK0816","f14":"昨日连板","f104":10,"f105":2,"f124":1789458600},
            {"f2":962.77,"f3":2.01,"f4":19.0,"f12":"BK1713","f14":"科技风格","f104":40,"f105":20,"f124":1789458600},
            {"f2":1189.19,"f3":2.23,"f4":25.9,"f12":"BK0885","f14":"VPN","f104":12,"f105":3,"f124":1789458600}
        ]}}"#;

        let sectors = parse_eastmoney_sectors(body);

        assert_eq!(sectors.len(), 2);
        assert_eq!(sectors[0].name, "AI芯片");
        assert_eq!(sectors[0].gain_count, Some(86));
        assert_eq!(sectors[0].lose_count, Some(4));
        assert_eq!(sectors[1].name, "VPN");
        // 世界指数分支不应带涨跌家数
        assert!(parse_eastmoney_global_indices(body)[0].gain_count.is_none());
    }

    #[test]
    fn world_indices_do_not_expose_member_counts() {
        let body = r#"{"data":{"diff":[
            {"f2":65018.95,"f3":1.38,"f4":884.11,"f12":"N225","f14":"日经225","f104":99,"f105":1,"f124":1789458600}
        ]}}"#;

        let indices = parse_eastmoney_global_indices(body);
        assert_eq!(indices.len(), 1);
        assert_eq!(indices[0].gain_count, None);
        assert_eq!(indices[0].lose_count, None);
    }

    #[test]
    fn simplifies_us_sector_etf_names() {
        assert_eq!(
            simplify_us_sector_name("XLK", "科技行业精选指数ETF-SPDR"),
            "科技"
        );
        assert_eq!(
            simplify_us_sector_name("XLC", "通讯服务行业精选指数ETF-SPDR"),
            "通信服务"
        );
        assert_eq!(simplify_us_sector_name("UNKNOWN", "原始名称"), "原始名称");
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
                sector: "半导体".to_string(),
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
    fn converts_eastmoney_midnight_timestamp_to_china_calendar_date() {
        assert_eq!(
            unix_millis_to_china_date(1_784_563_200_000).as_deref(),
            Some("2026-07-21")
        );
    }

    #[test]
    fn parses_primary_fund_theme_as_sector() {
        let body = r#"{
            "Datas": [{
                "ZTJJInfo": [
                    {"TTYPE":"BK000054","TTYPENAME":"半导体"},
                    {"TTYPE":"BK000053","TTYPENAME":"电子"}
                ]
            }]
        }"#;

        assert_eq!(parse_fund_sector(body).as_deref(), Some("半导体"));
    }

    #[test]
    fn converts_cumulative_minute_volume_to_per_minute_bars() {
        let body = r#"{
            "data": {"sz002409": {"data": {"data": [
                "0930 10.00 100 100000.00",
                "0931 10.10 130 130300.00",
                "0932 10.05 130 130300.00",
                "1501 10.05 130 130300.00"
            ]}}}
        }"#;

        let points = parse_minute_points(body, "sz002409");

        assert_eq!(points.len(), 3);
        assert_eq!(points[0].volume, 100);
        assert_eq!(points[1].volume, 30);
        assert_eq!(points[2].volume, 0);
        assert_eq!(points[1].average_price, 10.0231);
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
    fn parses_fund_base_one_year_return() {
        let body = r#"{"Datas":{"SYL_1N":"179.19"},"ErrCode":0}"#;

        assert_eq!(parse_fund_base_one_year_return(body), Some(179.19));
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
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 已有实例在运行：唤起它而不是再开一个进程，
            // 避免两个 WebView2 实例争抢同一数据目录导致界面空白与本地存储写入丢失。
            restore_main_window(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            app_log::install_panic_hook(app.handle());

            let restore = MenuItem::with_id(app, "restore", "恢复窗口", true, None::<&str>)?;
            let check_update_item =
                MenuItem::with_id(app, "check-update", "检查更新", true, None::<&str>)?;
            let open_log_item = MenuItem::with_id(app, "open-log", "运行日志", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu =
                Menu::with_items(app, &[&restore, &check_update_item, &open_log_item, &quit])?;

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
                "restore" => restore_main_window(app),
                "check-update" => {
                    app_log::append_log(app, "INFO", "托盘触发检查更新");
                    restore_main_window(app);
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.emit("tray-check-update", ());
                    }
                }
                "open-log" => {
                    if let Err(error) = open_log_file(app.clone()) {
                        app_log::append_log(app, "ERROR", &format!("打开日志失败：{error}"));
                    }
                }
                "quit" => {
                    save_window_geometry(app);
                    app.exit(0);
                }
                _ => {}
            });

            if let Some(window) = app.get_webview_window("main") {
                restore_window_geometry(&window);
                watch_window_geometry(app.handle());
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            close_window,
            minimize_window,
            minimize_to_tray,
            set_always_on_top,
            start_drag,
            set_auto_start,
            persist_app_state,
            load_app_state,
            fetch_stocks,
            search_stock,
            fund_api::search_funds,
            fund_api::fetch_funds,
            fund_api::fetch_fund_history,
            fund_api::fetch_fund_profile,
            fund_api::fetch_fund_allocation,
            kline::fetch_index_history,
            kline::fetch_minute_data,
            kline::fetch_kline_data,
            kline::fetch_indices,
            market::fetch_global_indices,
            ocr_image,
            updates::check_update,
            updates::download_update,
            updates::run_installer,
            append_log,
            open_log_file,
            updates::open_release_page,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
