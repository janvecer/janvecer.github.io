# Optional verification tools

Normal editing needs only Quarto. These scripts are included for future development and do not run on the public website.

## Option, hedge and price-path mathematics

These checks use Node.js without additional packages:

```sh
node qa/normal-options.test.cjs
node qa/hedging.test.cjs
node qa/discrete-v4.test.cjs
```

The independent audit uses Python with NumPy and SciPy, plus Node.js:

```sh
python qa/normal-hedging-audit.py
```

It compares prices, density integrals, KL values and optimal hedge weights with
separate SciPy calculations. Its report is `qa/normal-hedging-audit-v4.json`.

## Render and check links

From the project folder:

```sh
quarto render
python qa/check-source.py docs
```

The source checker validates local source links, explicit identifiers and JavaScript syntax. It also rejects stale rendered HTML beside the source files. If PyYAML is installed, it parses the YAML configuration. After a render it verifies local HTML links, anchors, scripts, styles and images in `docs/`. Reports are written to `qa/source-report.json`; set `QA_SOURCE_REPORT` to preserve a separate named report.

## New information-theory examples

```sh
node qa/information-revision.test.cjs
```

This checks the Columbia clock identities, analytical quadratic optima, pricing-law invariance, growth decomposition, and the Win-only football preset.

## Browser checks

The new relative-entropy laboratory also has a dependency-free numerical check:

```sh
node qa/entropy.test.cjs
```

It verifies the worked example, 35 probability pairs, the pricing normalization,
the reverse expected-log identity, and the zero-payoff boundaries.

Install Node.js and Playwright once:

```sh
npm install --prefix qa --no-save playwright
npx --prefix qa playwright install chromium
```

Then run:

```sh
node qa/check-browser.cjs docs
```

This starts a temporary local web server and visits every page at 390, 1024 and 1440 pixels. It checks horizontal overflow, display equations, tables, widget mounting, finite SVG coordinates, JavaScript errors and missing resources; moves each interactive slider; exercises each dropdown; and regenerates simulation paths. Chapter pages must have a reading column centered to within one pixel. The framework page also exercises the search overlay. The option laboratory is checked across all four contract types and the allowed strike, volatility and horizon endpoints, including the reserve mixture. The hedging laboratory checks fitted and manually selected weights, its presets, the call-only constraint and parameter endpoints. It writes `qa/browser-report.json` and selected screenshots under `qa/screenshots/`. A failing check returns a nonzero exit status.

The browser uses Playwright's bundled Chromium by default. To use another installed compatible browser, set the `CHROMIUM_PATH` environment variable to its executable. The script also understands the `CODEX_PRIMARY_RUNTIME_NODE_MODULES` environment variable when run in ChatGPT's development environment.

MathJax and its fonts are bundled in `assets/vendor/mathjax/`, so mathematical rendering works offline. Any failed resource request is reported rather than silently treated as a successful visual check. Set `QA_PAGES` to comma-separated relative HTML paths or `QA_WIDTHS` to comma-separated pixel widths for a focused rerun; the defaults check all pages at all three widths. Set `QA_REPORT` to choose a report filename within `qa/`, so a focused rerun can be kept separately from an earlier full-site baseline. A focused report counts only the pages and widths actually tested.

## Reports for this revision

The optional static MathJax validator checks TeX parsing and SVG typesetting
without a browser. Installation and invocation are documented at the top of
`check-math.cjs`. The latest result is `math-typesetting-2026-10-19.json`.

`source-report-2026-10-19.json` covers the rendered 19 October 2026 build.
`source-report-v5.json` and `math-typesetting-summary.json` describe the earlier
11 October build. Older JSON reports are retained for reference; they do not
certify the current layout. The browser runner is included for a future local
preview. Browser QA was not available for the 19 October build; see
`../VALIDATION.md` for the completed checks and limits.
