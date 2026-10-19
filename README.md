# Jan Vecer — Prices as Information

An information-theoretic perspective on finance.

This complete package contains the editable Quarto website and a freshly rendered
`docs/` directory. This 19 October 2026 update includes five presentation PDFs
(two Columbia lectures, Cornell, Bloomberg and Oxford), plus the forthcoming
Quantitative Finance author manuscript and DOI.
The top navigation is **Home | Information Theory & Finance | Resources | Jan Vecer**.

## Quick preview

1. Extract the ZIP to a new folder.
2. In VS Code, open the extracted `janvecer-site` folder. `_quarto.yml` should be
   directly inside that folder.
3. Open a terminal and run:

       quarto preview

Stop the preview with Ctrl+C. Quarto serves the website locally; it does not
publish it. Open the website through this server, rather than double-clicking
HTML files, so navigation, search, and local resources work correctly.

The already rendered site is in `docs/`. If Python is installed, it can also be
previewed without rebuilding:

    python -m http.server 8000 --directory docs

Then open http://localhost:8000 in your browser.

## Update your existing GitHub Pages repository

Make a backup of your current publishing folder first. Use the repository you
normally push, for example `janvecer-publish`.

1. Copy the **contents** of the extracted `janvecer-site` folder into the root of
   the existing repository, replacing matching files and folders. Do not place
   `janvecer-site` inside it as an extra nested directory.
2. Keep the repository's `.git` folder and its GitHub configuration. This package
   contains no Git history or credentials. Do not empty the repository first.
3. The included `docs/` is ready to publish. Before rebuilding an older checkout,
   close any running preview and delete its generated `.quarto` cache folder
   if present (keep `.git`). Then rebuild after source edits:

       quarto render

4. Review `git status` and the website. Then use your usual workflow:

       git add -- . ":!.quarto"
       git commit -m "Add October talks and QF paper; restore linear information flows chapter"
       git push

The staging command excludes Quarto's temporary cache folder, including caches
tracked by an older version of the repository. Stage only the changes you intend
to publish if the repository also contains unrelated work. The custom domain
remains `janvecer.com`. This package keeps the
existing GitHub Pages convention of serving `docs/` from the publishing branch.

If an earlier package left HTML files beside the root `.qmd` source files or
inside the source `likelihood/` or `research/` folders, remove those stale HTML copies only.
Keep the rendered HTML inside `docs/`. If an older Quarto version leaves these
intermediates after rendering, run `quarto run scripts/finalize-html.ts` once.
The configuration automatically renders `.qmd` pages in the project root,
`likelihood/`, and `research/`; underscore-prefixed notation includes are excluded.
New pages in those folders no longer need to be added one by one to a render list.
If you create a new source folder, add its render pattern to `_quarto.yml`.
Existing tutorial URL paths are retained.

## What changed

- New homepage: **Prices as Information**, with an information-theory subtitle.
- Navigation organized by Start here, Portfolio choice, Pricing and hedging,
  Linear information flows, Dynamics and learning, and Research and resources.
- Linear information flows restored as its own chapter category, with the six
  models directly below it and a prominent homepage entry.
- A common Columbia binary/geometric-shock example, replication weights,
  incomplete-market information gaps, and a new three-criteria comparison.
- Exact KL, target-centered KL2, and market-weighted quadratic error distinguished;
  pricing-law invariance explained with its appropriate scope.
- Utility-selected laws explained after log optimality, with a clear distinction
  between full-market utility and constrained utility optimization.
- An incomplete football-market preset in the portfolio laboratory.
- A Bayesian-learning page covering clearing, partial commitment, capital lock-in,
  and prefunded restart accounts.
- A resources page with five original presentation PDFs and suggested reading routes.
- A forthcoming Quantitative Finance paper page, unchanged author-manuscript PDF,
  DOI link, BibTeX download, and links from the homepage and academic profile.
- Distinct homepage/framework titles, consistent unhalved quadratic loss Q,
  shared notation on the hedging pages, and linked binomial parameterizations.

See `CHANGES.md` for the content changes and `VALIDATION.md` for checks and limits.

## Main files

- `_quarto.yml`: navigation, render patterns, local resources, and output configuration.
- `index.qmd`: homepage, books, selected papers, and presentation links.
- `resources.qmd`: Columbia, Cornell, Bloomberg and Oxford slides and reading routes.
- `research/`: forthcoming-paper overview, citation and download links.
- `jan-vecer.qmd`: academic profile and contact.
- `likelihood/`: tutorials, laboratories, and their JavaScript/CSS.
- `assets/slides/`: original presentation PDFs and title-slide thumbnails.
- `assets/papers/`: author manuscript and BibTeX citation.
- `assets/`: local artwork, book covers, MathJax, and math fonts.
- `styles.css`: shared editorial styling and responsive layouts.
- `offline-theme.scss`: avoids remote theme-font downloads.
- `scripts/finalize-html.ts`: removes an obsolete remote polyfill after rendering
  and removes generated intermediate HTML with matching Quarto identity beside
  source files, while preserving handwritten or unmatched HTML.
- `docs/`: complete rendered website, including slides and search data.
- `qa/`: optional development checks; not required to edit the website.

All interactive figures run locally in plain JavaScript. Quarto is the only
requirement for normal rendering and preview. External book/publication links
require internet access; mathematical rendering and the laboratories do not.

## Models and conventions

Prices and payoffs are expressed in reference-asset units. The associated pricing
law is kept distinct from investor beliefs. Expected growth is model-dependent,
measured in natural-log units over the stated horizon, and is not a promised
return. Model controls are educational examples rather than fitted market inputs.

The portfolio laboratory uses nonnegative cost weights summing to one. The
normal-model hedging laboratory solves one conditional trading interval under
its displayed constraints. The new geometric-shock comparison holds the payoff
and beliefs fixed when changing the pricing law. Bayesian learning and restart
results are presented under their stated market and statistical assumptions.
