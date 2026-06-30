# Stock Widget Maintenance Hardening Design

## Context

The project is a Windows desktop stock widget built with Tauri 2, Vue 3, TypeScript, Pinia, Vite, and Rust. The current app builds successfully, but maintenance risk is concentrated in external market data parsing, a large detail view component, missing automated tests, and settings that can drift from actual window or OS state.

## Goals

- Add a repeatable test baseline for frontend pure logic and Rust market data parsing.
- Improve reliability around external API parsing, settings side effects, and release metadata.
- Reduce `Detail.vue` complexity by extracting pure chart and formatting logic without changing the visual layout.
- Add project scripts and README guidance so future changes can be verified consistently.

## Non-Goals

- Do not redesign the UI.
- Do not replace the public Tencent or Sina data sources.
- Do not add trading, alerts, notifications, or new market coverage.
- Do not perform a full component rewrite of the detail page.

## Architecture

Frontend maintainability will be improved by extracting pure helpers into `src/utils/format.ts` and `src/utils/chart.ts`. Vue components will keep rendering, event wiring, and store integration, while tests target the extracted helpers directly.

Rust reliability will be improved in `src-tauri/src/main.rs` by tightening parser bounds and adding unit tests for code normalization, stock quote parsing, Tencent line parsing, and graceful handling of short payloads.

Settings behavior will keep the current Pinia and `localStorage` model, but Tauri side effects should fail visibly in the console and rollback the changed setting when the command fails. Startup should re-apply persisted `alwaysOnTop`.

## Frontend Test Plan

- Add `vitest` and a `test` script.
- Test formatting helpers for signed values, price formatting, volume and amount display.
- Test chart helpers for moving averages, K-line aggregation, date buckets, and range handling.
- Prefer pure function tests over mounting full Vue components.

## Rust Test Plan

- Add `#[cfg(test)]` tests in `src-tauri/src/main.rs`.
- Cover `to_tencent_code`.
- Cover `parse_stock_from_parts` with a representative payload containing high, low, amount, market cap, and order book fields.
- Cover short quote payloads returning `None` rather than partially populated invalid data.
- Cover `parse_tencent_lines` ignoring malformed lines.

## Reliability Changes

- Make `parse_stock_from_parts` require enough fields for every field it reads directly.
- Remove debug `console.log` statements from stock adding.
- Align app versions across `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
- Roll back `alwaysOnTop` and `autoStart` setting values if the Tauri command fails.
- Apply persisted `alwaysOnTop` when settings load at app startup.

## Scripts And Documentation

- Add `npm run test` for Vitest.
- Add `npm run check` to run frontend tests and production build.
- Keep `npm run build`, `npm run tauri:dev`, and `npm run tauri:build` intact.
- Update `README.md` with the new verification commands and clarify that Rust checks/tests are run from `src-tauri`.

## Verification

Before completion, run:

```bash
npm run test
npm run build
cargo test
cargo check
```

`cargo test` and `cargo check` are run from `src-tauri`.

## Acceptance Criteria

- Frontend tests exist and pass.
- Rust parser tests exist and pass.
- Production frontend build passes.
- Rust check passes.
- Version metadata is consistent.
- No debug logs remain in `src/stores/stock.ts`.
- `Detail.vue` delegates pure formatting and chart calculation work to utility modules while keeping existing UI behavior.
- README documents the new maintenance workflow.
