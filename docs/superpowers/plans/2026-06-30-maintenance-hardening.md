# Maintenance Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a maintainable verification baseline and reduce reliability risk in the Tauri stock widget without redesigning the UI.

**Architecture:** Extract pure frontend formatting and chart functions into utility modules tested by Vitest. Keep Vue components responsible for rendering and event wiring. Add Rust unit tests beside parser code in `src-tauri/src/main.rs` and tighten parser bounds.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vite, Vitest, Tauri 2, Rust.

---

## File Structure

- Create `src/utils/format.ts`: signed numbers, percentages, volume, amount, market cap, price, and order book display helpers.
- Create `src/utils/chart.ts`: chart date parsing, K-line period buckets, K-line aggregation, moving averages, numeric range calculation, and polyline point generation.
- Create `src/utils/format.test.ts`: Vitest coverage for formatting helpers.
- Create `src/utils/chart.test.ts`: Vitest coverage for chart helpers.
- Modify `src/views/Home.vue`: use `createSparklinePoints` from chart helpers.
- Modify `src/views/Detail.vue`: import formatting/chart helpers and remove duplicated pure logic.
- Modify `src/views/Settings.vue`: rollback settings when Tauri side-effect calls fail.
- Modify `src/App.vue`: re-apply persisted always-on-top setting after settings load.
- Modify `src/stores/stock.ts`: remove debug logs.
- Modify `src-tauri/src/main.rs`: tighten parser bounds and add Rust parser tests.
- Modify `package.json` and `package-lock.json`: add Vitest and scripts.
- Modify `README.md`: document verification workflow.

## Tasks

### Task 1: Add Frontend Test Harness

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install Vitest**

Run:

```bash
npm install -D vitest
```

Expected: `package.json` and `package-lock.json` include `vitest`.

- [ ] **Step 2: Add scripts**

Set scripts in `package.json` to include:

```json
{
  "test": "vitest run",
  "check": "npm run test && npm run build"
}
```

Keep existing `dev`, `build`, `tauri`, `tauri:dev`, and `tauri:build`.

- [ ] **Step 3: Verify missing tests produce a clear baseline**

Run:

```bash
npm run test
```

Expected: Vitest runs and reports no test files or an empty-suite status. If Vitest exits non-zero due no tests, continue to Task 2 and use the first real test as the red check.

### Task 2: Add Formatting Helpers With Tests

**Files:**
- Create: `src/utils/format.test.ts`
- Create: `src/utils/format.ts`
- Modify: `src/views/Detail.vue`

- [ ] **Step 1: Write failing tests**

Create `src/utils/format.test.ts` with tests for this API:

```ts
import { describe, expect, it } from 'vitest'
import {
  formatAmount,
  formatMarketCap,
  formatOrderBookVolume,
  formatPrice,
  formatSigned,
  formatSignedPercent,
  formatVolume
} from './format'

describe('format helpers', () => {
  it('formats signed values and percentages', () => {
    expect(formatSigned(1.23)).toBe('+1.23')
    expect(formatSigned(-1.23)).toBe('-1.23')
    expect(formatSignedPercent(2.5)).toBe('+2.50%')
  })

  it('formats price and missing moving averages', () => {
    expect(formatPrice(12.345)).toBe('12.35')
    expect(formatPrice(Number.NaN)).toBe('--')
  })

  it('formats volume and amount units', () => {
    expect(formatVolume(120_000_000)).toBe('1.20亿')
    expect(formatVolume(12_000)).toBe('1.20万')
    expect(formatAmount(120_000_000)).toBe('1.20亿')
    expect(formatMarketCap(6_500)).toBe('6500.00亿')
  })

  it('formats order book volume in lots', () => {
    expect(formatOrderBookVolume(2300)).toBe('23手')
  })
})
```

- [ ] **Step 2: Run red check**

Run:

```bash
npm run test -- src/utils/format.test.ts
```

Expected: fail because `src/utils/format.ts` does not exist.

- [ ] **Step 3: Implement minimal helpers**

Create `src/utils/format.ts` exporting the functions used by the test.

- [ ] **Step 4: Run green check**

Run:

```bash
npm run test -- src/utils/format.test.ts
```

Expected: all tests in `format.test.ts` pass.

- [ ] **Step 5: Wire Detail.vue**

Replace local formatting helpers in `src/views/Detail.vue` with imports from `../utils/format`, keeping function names that the template already uses.

### Task 3: Add Chart Helpers With Tests

**Files:**
- Create: `src/utils/chart.test.ts`
- Create: `src/utils/chart.ts`
- Modify: `src/views/Home.vue`
- Modify: `src/views/Detail.vue`

- [ ] **Step 1: Write failing tests**

Create `src/utils/chart.test.ts` with tests for this API:

```ts
import { describe, expect, it } from 'vitest'
import {
  aggregateKlines,
  createMovingAverage,
  createSparklinePoints,
  getPeriodBucket,
  getRange
} from './chart'

const points = [
  { time: '2026-01-02', open: 10, close: 11, high: 12, low: 9, volume: 100 },
  { time: '2026-01-03', open: 11, close: 13, high: 14, low: 10, volume: 200 },
  { time: '2026-04-01', open: 13, close: 12, high: 15, low: 11, volume: 300 }
]

describe('chart helpers', () => {
  it('aggregates kline points by month and quarter', () => {
    expect(aggregateKlines(points, 'month')).toEqual([
      { time: '2026-01-03', open: 10, close: 13, high: 14, low: 9, volume: 300 },
      { time: '2026-04-01', open: 13, close: 12, high: 15, low: 11, volume: 300 }
    ])
    expect(getPeriodBucket('2026-04-01', 'quarter')).toBe('2026-Q2')
  })

  it('creates moving averages with NaN until enough points exist', () => {
    const values = createMovingAverage([1, 2, 3, 4], 3)
    expect(Number.isNaN(values[0])).toBe(true)
    expect(values[2]).toBe(2)
    expect(values[3]).toBe(3)
  })

  it('expands flat ranges and creates sparkline points', () => {
    expect(getRange([5, 5])).toEqual([4.95, 5.05])
    expect(createSparklinePoints([1, 2, 3], 120, 24)).toBe('0.00,24.00 60.00,12.00 120.00,0.00')
  })
})
```

- [ ] **Step 2: Run red check**

Run:

```bash
npm run test -- src/utils/chart.test.ts
```

Expected: fail because `src/utils/chart.ts` does not exist.

- [ ] **Step 3: Implement chart helpers**

Create `src/utils/chart.ts` with exported helpers used by the test and matching the behavior currently embedded in `Detail.vue` and `Home.vue`.

- [ ] **Step 4: Run green check**

Run:

```bash
npm run test -- src/utils/chart.test.ts
```

Expected: all tests in `chart.test.ts` pass.

- [ ] **Step 5: Wire components**

Update `src/views/Home.vue` to use `createSparklinePoints`. Update `src/views/Detail.vue` to use imported `aggregateKlines`, `createMovingAverage`, `getPeriodBucket`, and `getRange`.

### Task 4: Harden Rust Parsing With Tests

**Files:**
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Add failing Rust tests**

Add a `#[cfg(test)] mod tests` block in `src-tauri/src/main.rs` that checks:

```rust
#[test]
fn converts_plain_codes_to_tencent_codes() {
    assert_eq!(to_tencent_code("600000"), "sh600000");
    assert_eq!(to_tencent_code("000001"), "sz000001");
    assert_eq!(to_tencent_code("sh000001"), "sh000001");
}

#[test]
fn rejects_short_stock_payloads() {
    let parts = vec!["".to_string(); 35];
    let refs = parts.iter().map(String::as_str).collect::<Vec<_>>();
    assert!(parse_stock_from_parts(&refs, "sh600000").is_none());
}
```

Also add a representative valid stock payload test with at least 46 fields and order book prices at the indices used by `parse_order_book`.

- [ ] **Step 2: Run red check**

Run from `src-tauri`:

```bash
cargo test
```

Expected: at least `rejects_short_stock_payloads` fails if current parser accepts a too-short payload.

- [ ] **Step 3: Tighten parser bounds**

Change `parse_stock_from_parts` to require at least 46 fields before reading high, low, amount, and market cap positions.

- [ ] **Step 4: Run green check**

Run from `src-tauri`:

```bash
cargo test
```

Expected: Rust tests pass.

### Task 5: Improve Settings Side Effects

**Files:**
- Modify: `src/views/Settings.vue`
- Modify: `src/App.vue`

- [ ] **Step 1: Update Settings.vue**

Change `toggleAlwaysOnTop` and `toggleAutoStart` so each stores the previous value, updates optimistically, and rolls back with `settings.updateSettings(...)` in `catch`.

- [ ] **Step 2: Update App.vue startup**

After `settingsStore.load()` in `onMounted`, call `invoke('set_always_on_top', { enabled: settingsStore.settings.alwaysOnTop })` inside a `try/catch`.

- [ ] **Step 3: Verify typecheck through build**

Run:

```bash
npm run build
```

Expected: Vue typecheck and Vite build pass.

### Task 6: Remove Debug Logs And Align Versions

**Files:**
- Modify: `src/stores/stock.ts`
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Remove debug logs**

Delete `console.log` statements from `addStock` while keeping `console.warn` for empty fetch results.

- [ ] **Step 2: Align versions**

Set `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` to the same version, using `1.0.1`.

- [ ] **Step 3: Verify no debug logs remain**

Run:

```bash
rg -n "console\\.log" src/stores/stock.ts
```

Expected: no matches.

### Task 7: Update README And Run Full Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document verification workflow**

Add commands:

```bash
npm run test
npm run build
npm run check
cd src-tauri
cargo test
cargo check
```

Mention that frontend pure logic is tested with Vitest and Rust parser behavior is tested with `cargo test`.

- [ ] **Step 2: Run frontend tests**

Run:

```bash
npm run test
```

Expected: all Vitest tests pass.

- [ ] **Step 3: Run frontend build**

Run:

```bash
npm run build
```

Expected: `vue-tsc --noEmit && vite build` exits 0.

- [ ] **Step 4: Run Rust tests**

Run from `src-tauri`:

```bash
cargo test
```

Expected: all Rust tests pass.

- [ ] **Step 5: Run Rust check**

Run from `src-tauri`:

```bash
cargo check
```

Expected: Rust check exits 0.

- [ ] **Step 6: Review diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and only intended files changed.
