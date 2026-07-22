# Design QA

- Scope: fund one-year return and stock intraday volume proportion.
- References: Alipay fund screenshot for `014855` and `codex-clipboard-320f94ee-0f7e-449a-8647-985cadbce653.png` for intraday volume.
- Fund capture: `stock-widget-fund-year-fixed.png`, 916 x 489 application window; the header shows `+179.19%` for the trailing year.
- Stock capture: `stock-widget-volume-height-fixed.png`, 916 x 489 application window.
- Comparison: the volume band now occupies about one quarter of the chart, with prominent red/green bars and a clear divider from the price chart.
- Layout: the price chart, four time ticks, volume label/value, volume bars, and five-level order book remain visible without overlap or clipping after scrolling the detail pane to the chart.

final result: passed
