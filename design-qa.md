# Design QA

- Scope: fund one-year return, stock intraday volume proportion, and responsive stock detail layout.
- References: Alipay fund screenshot for `014855`, `codex-clipboard-320f94ee-0f7e-449a-8647-985cadbce653.png` for intraday volume, and `codex-clipboard-1d6f18f0-7137-4381-b89b-3e74f942ad06.png` for the stretched detail window.
- Fund capture: `stock-widget-fund-year-fixed.png`, 916 x 489 application window; the header shows `+179.19%` for the trailing year.
- Compact stock capture: `stock-widget-responsive-final-916x489.png`, 916 x 489 application window.
- Tall stock capture: `stock-widget-responsive-final-900.png`, 900 x 900 application window.
- Volume comparison: the volume band occupies about one quarter of the available chart height. A robust upper display bound prevents isolated opening spikes from flattening the remaining red/green bars while preserving raw values for labels and tooltips.
- Responsive layout: the price and volume charts grow with the detail area, and all ten order-book levels distribute across the available right panel height. The stock header and statistics remain visible instead of shrinking when the viewport is short.
- Layout safety: compact windows retain the existing scroll behavior without overlap; tall windows use the available space instead of leaving the lower detail area empty.

final result: passed
