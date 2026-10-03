# Jan Vecer — Likelihood Finance

A complete Quarto website for local use and later GitHub Pages publication.
The top navigation is **Home | Likelihood Finance | Jan Vecer**.

## Open it locally

1. Extract this ZIP to a new folder.
2. In VS Code, choose **File → Open Folder** and select the extracted
   `janvecer-site` folder. You should see `_quarto.yml` directly in that folder.
3. Open **Terminal → New Terminal** and run:

       quarto preview

Keep that terminal open while viewing the site. Press **Ctrl+C** to stop the
preview. This command does not publish anything.

Only Quarto is needed to build or preview the site. All interactive figures are
plain JavaScript. Book covers, chart assets, MathJax, and its fonts are included
locally. The book and publication links naturally require an internet connection.

## Replace the existing janvecer.github.io site

First make a backup copy of your current `janvecer.github.io` folder.

Copy the **contents** of the extracted `janvecer-site` folder into
`janvecer.github.io`, accepting replacement of matching files and folders.
In particular, `_quarto.yml` must be directly inside `janvecer.github.io`,
not inside an extra nested folder.

Keep the repository's `.git` folder and any existing GitHub configuration.
The download contains neither credentials nor a replacement Git history.

The configuration lists the new pages explicitly, so unrelated old tutorial
source files are not rendered. The former `about.qmd` now provides a short link
to the Jan Vecer profile, keeping the old About address useful.

This package keeps rendered HTML inside `docs/`. If an earlier package left
`index.html`, `about.html`, or `jan-vecer.html` beside the root `.qmd` files,
remove those three old HTML copies. Also remove old `.html` files directly
inside the source `likelihood/` folder. Keep its `.qmd`, `.js`, and `.css`
files, and keep the rendered files inside `docs/`.

From the `janvecer.github.io` terminal, run:

    quarto preview

The archive also includes a rendered `docs/` directory for reference. Preview
through Quarto; opening an HTML file directly in the browser is not the same
as serving a website and may prevent resources or search from loading.

## Main files

- `_quarto.yml` — title, navigation, sidebar, search, output directory, resources.
- `index.qmd` — Home: project introduction, two books, four selected papers.
- `jan-vecer.qmd` — academic profile and contact.
- `styles.css` — the shared design.
- `offline-theme.scss` — disables external theme-font downloads.
- `scripts/finalize-html.ts` — a Quarto post-render step that removes an obsolete
  external browser polyfill and matching intermediate HTML copies beside the
  sources. Quarto runs it with its included runtime.
- `likelihood/` — all explanations, interactive figures, scripts, and local styles.
- `assets/` — book covers, original SVG artwork, favicon, bundled math renderer.
- `SOURCE-NOTES.md` — sources for public biographical and publication details.
- `CNAME` — the existing domain, `janvecer.com`.
- `docs/` — the rendered website.

## The guide

Start with `likelihood/index.qmd`, the framework. The guide includes:

- A guided introduction to reference units, stakes, payoffs, and log performance.
- Relative entropy: a worked example and an interactive two-outcome calculation.
- Likelihood versus dynamics; finite fundamental theorem of asset pricing.
- Binomial: both numeraire martingales and inversion between probabilities and moves.
- Trinomial: pricing families, incompleteness, attainable payoff measures.
- Linear information flow: additive drivers and expected information rates.
- Negative binomial: failure-count time, likelihood principle, Wald factorization.
- Normal: the likelihood ratio of two normals and the exact GBM solution.
- Poisson, gamma, and inverse Gaussian models with generated paths.
- Utility maximization and static fractional Kelly with a three-state laboratory.
- Mean–variance, ordinary log Taylor approximation, and the Pearson quadratic.
- An editable finite-state portfolio lab with up to eight asset densities plus cash
  and two to twelve states; exact KL, Pearson, and classical mean–variance solvers.
- Options as payoff-induced distributions, including a cash reserve.
- Black–Scholes from two normal tail probabilities, with continuous market,
  stock, option, and reserve-portfolio density plots.
- Discrete normal-model hedging as a local KL projection onto stock and cash
  densities; compare interval lengths and the Black–Scholes delta limit.

Continuous-model path tools use bounded forward KL information rates and bounded
event/shape parameters. They report the derived parameters, reverse KL, and exact
expected log-price lines. Gamma and inverse Gaussian paths show exact sampled
increments on a grid; they do not resolve all infinitely many jumps.

The portfolio lab uses nonnegative cost weights summing to one. Its solver reports
a first-order objective-gap bound. Bayesian portfolios are intentionally deferred.

The discrete hedge also keeps stock/cash cost weights between zero and one, so
the portfolio value is nonnegative for every possible next stock price. It solves
one conditional trading interval. A protected-stock target (call plus its strike
in reserve) illustrates the short-interval delta limit; the call-only target shows
when the constraint binds. This distinction is explained beside the tool.

## Publishing later

The site is still local until you commit and push it.

The configuration renders to `docs/`, matching the GitHub Pages convention used
by your existing repository. Before a future publication, run:

    quarto render

Then review the result and commit/push the source changes and the regenerated
`docs/` directory using your usual Git workflow. If GitHub Pages currently serves
the repository's `docs` folder on its main branch, that setting can stay as it is.

This package does not change GitHub settings, push a commit, or publish the site.

## Checks

See `VALIDATION.md` for the checks performed on this version.
The optional developer scripts under `qa/` are not needed for normal editing.
