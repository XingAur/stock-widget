use reqwest::{header, Client, RequestBuilder};
use std::{sync::OnceLock, time::Duration};

type HttpResult<T> = Result<T, String>;

pub(crate) const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                         (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

static HTTP_CLIENT: OnceLock<HttpResult<Client>> = OnceLock::new();

/// 所有应用内 HTTP 请求共用直连客户端，包括行情、搜索、基金、更新检查和下载。
/// 禁用系统代理及 HTTP(S)_PROXY / ALL_PROXY 环境代理，不做代理回退。
pub(crate) fn http_client() -> HttpResult<&'static Client> {
    match HTTP_CLIENT.get_or_init(|| {
        Client::builder()
            .no_proxy()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(12))
            .pool_idle_timeout(Duration::from_secs(90))
            .tcp_keepalive(Duration::from_secs(30))
            .build()
            .map_err(|error| format!("初始化 HTTP 客户端失败：{error}"))
    }) {
        Ok(client) => Ok(client),
        Err(error) => Err(error.clone()),
    }
}

fn request(url: &str, referer: Option<&str>) -> HttpResult<RequestBuilder> {
    let mut request = http_client()?
        .get(url)
        .header(header::USER_AGENT, USER_AGENT)
        .header(header::ACCEPT, "*/*")
        .header(header::ACCEPT_LANGUAGE, "zh-CN,zh;q=0.9,en;q=0.8");
    if let Some(referer) = referer {
        request = request.header(header::REFERER, referer);
    }
    Ok(request)
}

async fn fetch_bytes(url: &str, referer: Option<&str>) -> HttpResult<Vec<u8>> {
    let response = request(url, referer)?
        .send()
        .await
        .map_err(|error| {
            let kind = if error.is_timeout() {
                "超时"
            } else {
                "失败"
            };
            format!("请求{kind} {url}：{error}")
        })?
        .error_for_status()
        .map_err(|error| format!("行情服务返回错误 {url}：{error}"))?;
    response
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|error| format!("读取响应失败 {url}：{error}"))
}

pub(crate) fn decode_utf8_text(bytes: &[u8]) -> String {
    let (text, _, _) = encoding_rs::UTF_8.decode(bytes);
    text.into_owned()
}

pub(crate) async fn fetch_text(url: &str, referer: Option<&str>) -> HttpResult<String> {
    let bytes = fetch_bytes(url, referer).await?;
    Ok(decode_utf8_text(&bytes))
}

pub(crate) async fn fetch_text_gbk(url: &str, referer: Option<&str>) -> HttpResult<String> {
    let bytes = fetch_bytes(url, referer).await?;
    let (text, _, _) = encoding_rs::GBK.decode(&bytes);
    Ok(text.into_owned())
}

#[cfg(test)]
mod network_tests {
    use super::*;

    #[tokio::test]
    #[ignore = "手动联网诊断，可在子进程中设置无效代理验证直连；CI 不依赖外部服务"]
    async fn live_direct_requests() {
        let url = "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=100&po=1&np=1&fltt=2&invt=2&fid=f62&fs=m:90+t:2&fields=f2,f3,f4,f12,f14,f104,f105,f124";
        let text = fetch_text(url, Some("https://quote.eastmoney.com/"))
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_str(&text).unwrap();
        let rows = json["data"]["diff"].as_array().unwrap();
        assert!(!rows.is_empty());
        println!("Eastmoney direct: {} rows", rows.len());

        let text = fetch_text_gbk("https://qt.gtimg.cn/q=sh000001", None)
            .await
            .unwrap();
        assert!(text.contains("v_sh000001="));
        println!("Tencent direct: valid quote");
    }
}
