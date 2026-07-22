use reqwest::{header, Client, RequestBuilder};
use std::{sync::OnceLock, time::Duration};

type HttpResult<T> = Result<T, String>;

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                         (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

static HTTP_CLIENT: OnceLock<HttpResult<Client>> = OnceLock::new();

fn http_client() -> HttpResult<&'static Client> {
    match HTTP_CLIENT.get_or_init(|| {
        Client::builder()
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
        .map_err(|error| format!("请求失败 {url}：{error}"))?
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
