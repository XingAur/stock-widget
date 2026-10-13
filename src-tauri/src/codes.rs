pub fn to_tencent_code(code: &str) -> String {
    if code.starts_with("sh") || code.starts_with("sz") || code.starts_with("bj") {
        return code.to_string();
    }

    if code.starts_with('4') || code.starts_with('8') || code.starts_with("92") {
        return format!("bj{code}");
    }

    if code.starts_with('5') || code.starts_with('6') || code.starts_with('9') {
        format!("sh{code}")
    } else {
        format!("sz{code}")
    }
}

pub fn parse_f64(value: Option<&str>) -> f64 {
    value
        .and_then(|item| item.parse::<f64>().ok())
        .unwrap_or(0.0)
}

pub fn parse_i64(value: Option<&str>) -> i64 {
    value.and_then(|item| item.parse::<i64>().ok()).unwrap_or(0)
}

pub fn parse_optional_f64(value: Option<&str>) -> Option<f64> {
    value.and_then(|item| item.trim().parse::<f64>().ok())
}

pub fn parse_tencent_lines<T, F>(text: &str, mut parser: F) -> Vec<T>
where
    F: FnMut(&str, &str) -> Option<T>,
{
    let mut items = Vec::new();
    for line in text.lines().filter(|line| !line.trim().is_empty()) {
        let Some(start) = line.find("v_") else {
            continue;
        };
        let Some(eq_pos) = line[start..].find('=') else {
            continue;
        };
        let code_end = start + eq_pos;
        let code = &line[start + 2..code_end];
        let rest_after_code = &line[code_end..];
        let Some(quote_start) = rest_after_code.find('"') else {
            continue;
        };
        let quote_start_abs = code_end + quote_start;
        let Some(quote_end) = line.rfind('"') else {
            continue;
        };
        if quote_start_abs >= quote_end {
            continue;
        }
        let payload = &line[quote_start_abs + 1..quote_end];
        if let Some(item) = parser(code, payload) {
            items.push(item);
        }
    }
    items
}
