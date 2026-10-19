# Validation — 19 October 2026

This complete package contains 26 rendered website pages and editable Quarto
source, including the new forthcoming-paper page. It has not been pushed or
published. The starting source was the public GitHub repository at commit
`259d72c02f99f039ce30732b6e69b9cfdde82642`, the author's 11 October deployment.

## Build and source checks

- Official Quarto **1.9.38**, matching the author's installed version, with
  Pandoc 3.8.3 rendered all 26 pages successfully.
- A clean full build followed clearing the generated `.quarto` cache. This
  resolved stale cached links found during the first checks.
- `qa/check-source.py docs` passed **119 checks with zero failures**, recorded
  in `qa/source-report-2026-10-19.json`. It counts 27 source units because the
  shared notation include is not a standalone page.
- Checks cover source links, YAML, JavaScript syntax, and rendered local links,
  anchors, images, PDF downloads, scripts and styles. No generated HTML remains
  beside the source QMD files.
- All 26 pages have distinct browser titles. The framework title is distinct
  from the homepage.
- The render patterns include root, `likelihood/`, and `research/` QMD files;
  the underscore-prefixed notation include is not rendered as a page.

## Structure and resources

- Linear information flows is a top-level sidebar chapter with all six models
  as direct children. Rendered model sidebars expand this chapter at depth 1.
- The homepage has a direct entry for the chapter. Existing page URLs are kept.
- Columbia continuous (54 pages), Cornell (66 pages), and Bloomberg (9 pages)
  are added alongside the existing Columbia discrete and Oxford decks.
- All four newly supplied PDFs match their uploaded originals by SHA-256. All
  six PDF assets match byte-for-byte between `assets/` and rendered `docs/assets/`.
- New title-slide thumbnails were rendered from the PDFs and visually inspected.
- The new research page and talk descriptions appear in the site search index;
  the research page appears in the sitemap. `docs/CNAME` remains `janvecer.com`.
- Release checks are recorded in `qa/release-check-2026-10-19.json`.

## Mathematics and interactive code

All eight dependency-free `qa/*.test.cjs` suites pass. Source/QA JavaScript syntax
checks and `git diff --check` also pass.

The ordinary quadratic loss Q is consistently unhalved in the mean-variance
summary, comparison equations, graph and readout. An independent geometric-sum
check verifies Q(w) = 2w²/7 − 2w/5 + 1/7, including Q(0.7) = 1/350. KL2 keeps
its Taylor-expansion factor of 1/2. Portfolio optima, growth and gaps are unchanged.

Shared notation is included on the two additional hedging pages. Binomial
parameterizations are linked by v = wp + (1−w)q; CRRA weights no longer reuse w.

## Static math typesetting

MathJax 3.2.2 in Node, using its TeX parser and SVG output with a lightweight
adaptor, typeset **1,306 formulas**: 1,032 inline and 274 display formulas across
21 pages. There were **zero parser or typesetting failures**. Error-suppression
packages were disabled; an intentionally undefined macro failed the validator's
control check. The reusable validator and report are:

- `qa/check-math.cjs`
- `qa/math-typesetting-2026-10-19.json`

This validates static TeX, not browser layout or dynamically generated widget math.
The optional MathJax test dependency was installed outside the website; normal
rendering still requires only Quarto.

## Generated-file cleanup

Quarto 1.9 can leave intermediate HTML whose links/navigation differ from the
finished output. Cleanup now recognizes a matching explicit Quarto generator
and page title, as well as identical copies, and requires both QMD source and
finished output. An isolated fixture check confirmed that generated copies are
removed while handwritten, orphan, and differently titled HTML are preserved.

## Bibliographic scope

Forthcoming status and DOI `10.1080/14697688.2026.2749693` come from the author.
The title and paper summary follow the supplied author manuscript. Automated DOI
retrieval was unavailable and Crossref returned no record during this build;
final journal metadata has not been independently verified. No volume, issue,
page range or publication date is invented. The PDF is labeled author manuscript,
and links point to the DOI for the final journal record.

## Browser verification limitation

Browser preview was unavailable with the current environment capabilities, so
no current browser screenshots, phone-layout result, or successful browser test
is claimed. Responsive table/math overflow handling is present in the source.
Before publishing, run `quarto preview` locally and inspect the comparison page's
controls and tables, the negative-binomial table, the chapter sidebar, and the
resource cards at a narrow phone width.

Earlier JSON reports, including `source-report-v5.json` and
`math-typesetting-summary.json`, describe previous builds and do not certify
this revision's browser layout.
