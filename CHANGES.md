# Website revision — 11 October 2026

## Positioning and structure

The website now leads with **Prices as Information** and **An information-theoretic
perspective on finance**. Likelihood ratios remain the central representation.

The navigation separates foundational ideas, portfolio choice, pricing/hedging,
and dynamics/learning. Linear information flow is a subsection of Dynamics and
learning; its six families remain available in a model catalogue. Existing page
paths are preserved. New hub pages explain the financial question before sending
readers into individual examples.

## Teaching sequence

The framework preserves the football example, adds the one-dollar bet, proves
log optimality through the information decomposition, and introduces incomplete
trading using cash plus the Win claim. General utility follows these ideas.

The binary example uses pricing probability 1/2, stock-induced probability 3/4,
and belief 2/3 for an up move. It connects delta shares, cost weight 2/3, and the
payoff (4/3, 2/3). The negative-binomial page counts down moves before the first
up move and retains all three probability laws. It distinguishes random-duration
information scaling, coarsening loss, and the loss from unavailable rebalancing.

## Portfolio and hedging content

The new comparison page explains exact KL, target-centered KL2, and pricing-law
squared error, with an interactive loss chart and a pricing-law switch. It shows
why exact optimal growth is invariant while quadratic choices can move. The
mean–variance page now includes the target-centered expansion and consistent
belief-ratio notation. The trinomial page explains the interior-optimum dual
with its conditions; the hedging page adds the discrete call example.

The utility pages distinguish the own-law representation from the original
constrained expected-utility problem. No general equivalence between constrained
utility and projection of an unconstrained utility target is asserted.

## Learning and resources

The Bayesian page introduces full and partial commitment, model-fund wealth
updates, recovery after a regime switch, and prefunded restart evidence. The
new resources page includes the original Columbia (9 October 2026) and Oxford
(3 September 2026) PDFs, unchanged, plus title-slide thumbnails.

## Delivery

Both the editable source and rendered `docs/` are included. The package does not
push a Git commit or change the live website. See README.md for the update steps
and VALIDATION.md for the actual checks completed on this revision.
