# Validation of this local website build

Checked 3 October 2026. No website was published and no repository was pushed.

## Render and browser

- Quarto 1.10.18 rendered all 19 pages without warnings.
- Chromium 154 checked every page at 390, 1024, and 1440 CSS pixels: 57 cases.
  The first run found two overwide hedging equations on the phone layout.
  Both displays were split, and that page was checked again at all three widths.
  The final report preserves the initial run and focused rerun as provenance.
- No document overflow, overwide display equations, unrendered math, missing
  local resources, absent widgets, nonfinite SVG coordinates, or JavaScript errors.
- Chapter columns were centered within 0.01 CSS pixels in the tested layouts.
- Expandable derivations were opened before checking their equations.
- Sliders, dropdowns, path generation, option types and reserves, and the hedge
  fitting/manual/preset controls were exercised. New widget mounts are required
  explicitly, so missing markup cannot silently pass.
- Search and the mobile chapter menu were exercised. Home and the new option,
  hedge, and negative-binomial figures were visually inspected.
- Source links, rendered links and anchors, scripts, styles, and images were
  checked across the whole site. No rendered HTML copies remain beside sources.

The rendered report is `qa/browser-report-v4.json`. MathJax and its fonts are
included locally; the site needs no external math or font downloads. The
post-render script removes the obsolete polyfill and safely removes matching
intermediate HTML after confirming the completed output is present.

## New option and hedging calculations

- `qa/normal-options.test.cjs`: 108 configurations covering call, put, digital,
  straddle, price/payoff identities, parity, density normalization, and reserves.
- `qa/hedging.test.cjs`: 162 parameter cases covering density normalization,
  derivative identities, constrained optimality, expiry, zero intervals, and
  the admissible short-interval delta limit.
- Independent SciPy audit: 52 option cases had maximum price error below
  3e-14 and density-mass error below 9e-14.
- The independent audit of 12 hedge cases had maximum optimal-weight error
  below 4e-10, KL-value error below 1e-9, and density-mass error below 1.1e-10.
  It included pure calls at expiry and the parameter-range endpoints.
- That audit found an expiry quadrature error near the call's strike. A change
  of integration variable corrected the endpoint behavior; the rerun passed.
- The independent script and its detailed report are
  `qa/normal-hedging-audit.py` and `qa/normal-hedging-audit-v4.json`.

The hedge is a one-interval conditional KL projection onto nonnegative stock/cash
mixtures. It is not presented as a full simulated replication strategy. The
protected-stock target and call-only constraint are explained on the page.

## Negative-binomial price charts

`qa/discrete-v4.test.cjs` checks that price and log charts use the same sampled
paths, verifies the pricing-measure mean and asset-measure moment boundary, and
checks finite plotting coordinates at extreme settings. A focused Chromium
check also covered probability endpoints, equal measures, both count-chart
modes, horizon endpoints, and new-path generation at all three screen widths.

Prices above 10^12 are explicitly marked outside the ordinary price plot. The
complete sampled log paths remain available. No clipped path is shown as a
false flat price at the boundary.

## Retained checks from earlier builds

The unchanged entropy and portfolio calculations retain their earlier numerical
checks: the 0.02013551-nat two-state example; 35 entropy probability pairs; the
football example at approximately 0.0401 and -0.0475; the KL decomposition;
zero-payoff support; the binomial inverse map; and the trinomial optimum.

The continuous-family implementation previously passed 240 parameter/horizon
cases and 16 increment-moment checks. The portfolio solvers previously passed
120 cases and an independent SciPy SLSQP comparison with maximum objective
error below 5e-13. Their mathematical implementations are unchanged here.
Earlier numerical and browser reports remain in `qa/`; current layout and
control coverage comes from the full v4 browser run.

## Limits and reproducibility

Physical touch devices, Safari/iOS, a separate Edge installation, and a complete
screen-reader audit were not tested. Controls have labels and keyboard support,
and figures have explanatory readouts. The theme is light; Bayesian portfolios
and unrestricted short selling in the portfolio laboratory remain deferred.

These are educational models with explicitly bounded controls, rather than
empirical market calibrations. `qa/README.md` lists optional verification tools.
Only Quarto is required to render or preview the website.
