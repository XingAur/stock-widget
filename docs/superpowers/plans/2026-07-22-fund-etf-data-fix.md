# Fund And ETF Data Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore fund list data with Tencent's latest published NAV feed and make Shanghai/Shenzhen ETFs addable from stock mode.

**Architecture:** Keep the existing Vue/Pinia data contracts unchanged. Update the Rust Tauri backend to map `5xxxxx` securities to Shanghai, parse Tencent `jj` fund quotes into the existing `FundQuote`, and batch fund requests through the same GBK Tencent transport already used for stocks. Add parser, routing, and Store regression tests before production changes.

**Tech Stack:** Rust, Tauri 2, reqwest, encoding_rs, Vue 3, Pinia, TypeScript, Vitest

---

## File Map

- Modify `src-tauri/src/main.rs`: ETF market routing, Tencent fund quote parser, batched fund fetch command, and Rust unit tests.
- Modify `src/stores/stock.test.ts`: fund empty-refresh regression coverage for the existing cache-preservation behavior.

### Task 1: Route Shanghai ETFs To The Correct Tencent Market

**Files:**
- Modify: `src-tauri/src/main.rs:147-157`
- Test: `src-tauri/src/main.rs:760-765`

- [ ] **Step 1: Extend the routing unit test first**

Replace `converts_plain_codes_to_tencent_codes` with assertions that cover Shanghai stocks, Shanghai ETFs, Shenzhen ETFs, and already-prefixed codes:

```rust
#[test]
fn converts_plain_codes_to_tencent_codes() {
    assert_eq!(to_tencent_code("600000"), "sh600000");
    assert_eq!(to_tencent_code("588870"), "sh588870");
    assert_eq!(to_tencent_code("159915"), "sz159915");
    assert_eq!(to_tencent_code("000001"), "sz000001");
    assert_eq!(to_tencent_code("sh000001"), "sh000001");
}
```

- [ ] **Step 2: Run the focused Rust test and verify RED**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml converts_plain_codes_to_tencent_codes
```

Expected: FAIL because `to_tencent_code("588870")` currently returns `sz588870`.

- [ ] **Step 3: Implement the minimal prefix rule**

Update `to_tencent_code`:

```rust
fn to_tencent_code(code: &str) -> String {
    if code.starts_with("sh") || code.starts_with("sz") {
        return code.to_string();
    }

    if code.starts_with('5') || code.starts_with('6') {
        format!("sh{code}")
    } else {
        format!("sz{code}")
    }
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml converts_plain_codes_to_tencent_codes
```

Expected: PASS.

- [ ] **Step 5: Commit the ETF routing fix**

```powershell
git add src-tauri/src/main.rs
git commit -m "fix: route Shanghai ETFs correctly"
```

### Task 2: Parse Tencent Fund Quotes And Replace The Retired Feed

**Files:**
- Modify: `src-tauri/src/main.rs:3-5`
- Modify: `src-tauri/src/main.rs:159-171`
- Modify: `src-tauri/src/main.rs:266-287`
- Modify: `src-tauri/src/main.rs:616-640`
- Test: `src-tauri/src/main.rs:824-857`
- Test: `src-tauri/src/main.rs:898-909`

- [ ] **Step 1: Replace the obsolete JSONP parser tests with failing Tencent payload tests**

Add these tests in the existing `tests` module:

```rust
#[test]
fn parses_tencent_fund_quote_payload() {
    let parts = "001186~Open Fund A~0.0000~0.0000~~2.3760~2.3760~1.5385~2026-07-21~"
        .split('~')
        .collect::<Vec<_>>();
    let quote = parse_tencent_fund_quote(&parts).expect("valid Tencent fund quote should parse");

    assert_eq!(quote.code, "001186");
    assert_eq!(quote.name, "Open Fund A");
    assert_eq!(quote.nav, Some(2.3760));
    assert_eq!(quote.estimate_nav, Some(2.3760));
    assert_eq!(quote.estimate_change_percent, Some(1.5385));
    assert_eq!(quote.nav_date, "2026-07-21");
    assert_eq!(quote.estimate_time, "2026-07-21");
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
```

Delete the tests that call `parse_fund_quote_jsonp`, because that retired response format is no longer used.

- [ ] **Step 2: Run the new parser tests and verify RED**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml tencent_fund
```

Expected: compilation FAIL because `parse_tencent_fund_quote` does not exist.

- [ ] **Step 3: Add the minimal Tencent fund parser**

Replace `parse_optional_json_f64` with a string parser:

```rust
fn parse_optional_f64(value: Option<&str>) -> Option<f64> {
    value.and_then(|item| item.trim().parse::<f64>().ok())
}
```

Replace `parse_fund_quote_jsonp` with:

```rust
fn parse_tencent_fund_quote(parts: &[&str]) -> Option<FundQuote> {
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
        estimate_nav: nav,
        estimate_change_percent: parse_optional_f64(parts.get(7).copied()),
        estimate_time: nav_date.to_string(),
    })
}
```

Keep `parse_json_or_jsonp` because fund search still consumes JSON and supports JSONP defensively.

- [ ] **Step 4: Run the parser tests and verify GREEN**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml tencent_fund
```

Expected: all tests whose names contain `tencent_fund` PASS.

- [ ] **Step 5: Replace `fetch_funds` with one batched Tencent request**

Replace the old timestamped request loop:

```rust
#[tauri::command]
async fn fetch_funds(codes: Vec<String>) -> AppResult<Vec<FundQuote>> {
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

    Ok(parse_tencent_lines(&text, |_code, payload| {
        let parts = payload.split('~').collect::<Vec<_>>();
        parse_tencent_fund_quote(&parts)
    }))
}
```

Remove the now-unused `std::time::{SystemTime, UNIX_EPOCH}` import.

- [ ] **Step 6: Run all Rust tests**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all Rust tests PASS.

- [ ] **Step 7: Commit the fund data source fix**

```powershell
git add src-tauri/src/main.rs
git commit -m "fix: restore fund quotes from Tencent"
```

### Task 3: Lock In Fund Cache Preservation

**Files:**
- Modify: `src/stores/stock.test.ts:1-70`

- [ ] **Step 1: Add a fund quote test fixture and cache-preservation test**

Extend imports:

```typescript
import { fetchFunds, fetchStocks, type FundQuote, type Stock } from '../api/stock'
```

Add a fixture:

```typescript
function createFundQuote(overrides: Partial<FundQuote> = {}): FundQuote {
  return {
    code: '001186',
    name: 'Open Fund A',
    nav: 2.376,
    navDate: '2026-07-21',
    estimateNav: 2.376,
    estimateChangePercent: 1.5385,
    estimateTime: '2026-07-21',
    ...overrides
  }
}
```

Add this test beside the stock empty-refresh test:

```typescript
it('keeps existing fund quotes when a refresh returns no data', async () => {
  const existingFund = createFundQuote()
  const store = useStockStore()
  store.fundWatchList = [existingFund.code]
  store.funds = new Map([[existingFund.code, existingFund]])
  vi.mocked(fetchFunds).mockResolvedValueOnce([])

  await store.refreshFunds()

  expect(store.fundList).toEqual([existingFund])
  expect(store.funds.get(existingFund.code)).toEqual(existingFund)
})
```

- [ ] **Step 2: Run the focused Store test**

Run:

```powershell
npm run test -- src/stores/stock.test.ts
```

Expected: both stock and fund cache-preservation tests PASS. This is a characterization test for behavior already present in the Store; no production TypeScript change is needed.

- [ ] **Step 3: Commit the regression test**

```powershell
git add src/stores/stock.test.ts
git commit -m "test: preserve cached fund quotes on empty refresh"
```

### Task 4: Full Verification And Live Endpoint Check

**Files:**
- Verify: `src-tauri/src/main.rs`
- Verify: `src/stores/stock.test.ts`

- [ ] **Step 1: Run the complete frontend test suite**

```powershell
npm run test
```

Expected: all Vitest test files and tests PASS with zero failures.

- [ ] **Step 2: Run the production frontend build**

```powershell
npm run build
```

Expected: `vue-tsc --noEmit` and `vite build` both exit with code 0.

- [ ] **Step 3: Run Rust tests and compilation checks**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: both commands exit with code 0 and no failed tests.

- [ ] **Step 4: Verify live source payloads**

Run:

```powershell
$headers = @{ 'User-Agent' = 'Mozilla/5.0' }
(Invoke-WebRequest -Uri 'https://qt.gtimg.cn/q=sh588870,jj001186' -Headers $headers -UseBasicParsing -TimeoutSec 30).Content
```

Expected: output contains both `v_sh588870=` and `v_jj001186=` with non-empty quote payloads.

- [ ] **Step 5: Check whitespace and final diff**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; only intentional files are changed or the worktree is clean after the planned commits.
