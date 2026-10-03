'use strict';
const assert = require('node:assert/strict');
const h = require('../likelihood/hedging.js');
const n = require('../likelihood/normal-options.js');
const near = (a, b, tol, label) => assert.ok(Math.abs(a - b) <= tol, label + ': ' + a + ' vs ' + b);
let checked = 0;
for (const strike of [80, 100, 120]) for (const sigma of [.15, .3, .45]) for (const tau of [.25, 2]) for (const reserve of [0, strike, 150]) for (const step of [0, 2, 5]) {
  const p = { ...h.defaults(), strike, sigma, tau, reserve, step };
  const problem = h.buildProblem(p), fit = h.optimize(problem);
  assert.ok(Number.isFinite(fit.kl) && fit.kl >= 0 && fit.w >= 0 && fit.w <= 1, 'finite positive KL / admissible fit');
  for (const [name, mass] of Object.entries(h.masses(problem, fit.w))) near(mass, 1, 2e-7, name + ' normalization');
  for (const w of [0, .25, .5, .75, 1]) assert.ok(h.objective(problem, w) + 2e-12 >= fit.kl, 'fit beats candidate grid');
  if (fit.w > 1e-8 && fit.w < 1 - 1e-8) near(h.derivative(problem, fit.w), 0, 2e-11, 'interior first order condition');
  if (reserve === 0) near(fit.w, 1, 1e-12, 'naked call constrained optimum');
  const H = h.targetPrice(p), a = sigma * sigma * h.interval(p);
  const d0 = -(n.callPrice(p.spot * Math.exp(a), strike, tau, sigma) - n.callPrice(p.spot, strike, tau, sigma)) / H;
  const d1 = Math.exp(a) * (n.callPrice(p.spot * Math.exp(-a), strike, tau, sigma) + reserve) / H - 1;
  near(h.derivative(problem, 0), d0, 2e-7, 'analytic derivative at zero');
  near(h.derivative(problem, 1), d1, 2e-7, 'analytic derivative at one');
  for (const z of [-10, -3, 0, 3, 10]) {
    const point = h.point(p, z, fit.w);
    for (const value of Object.values(point)) assert.ok(Number.isFinite(value), 'finite density calculation');
    assert.ok(point.market >= 0 && point.stock >= 0 && point.target >= 0 && point.hedge >= 0, 'nonnegative density');
  }
  checked++;
}
// Exact symmetry benchmark: an at-the-money protected stock has w=1/2.
for (let step = 0; step < 6; step++) {
  const p = { ...h.defaults(), strike: 100, reserve: 100, step };
  near(h.optimize(h.buildProblem(p)).w, .5, 2e-9, 'protected-stock symmetry');
}
// A vanishing interval is an exact density match, not a division by zero.
const zero = h.buildProblem({ ...h.defaults(), h: 0 });
for (const w of [0, .3, 1]) near(h.objective(zero, w), 0, 1e-28, 'zero interval');
// At expiry, a call's zero-density states contribute finite forward KL.
const expiry = h.buildProblem({ ...h.defaults(), reserve: 0, h: 1 });
assert.equal(h.point({ ...h.defaults(), reserve: 0, h: 1 }, -3, 1).target, 0);
assert.ok(Number.isFinite(h.objective(expiry, 1)));
// Away from the symmetric case the interior fit converges to delta.
const p = { ...h.defaults(), strike: 110, reserve: 110 };
const bsWeight = p.spot * n.callDelta(p.spot, p.strike, p.tau, p.sigma) / h.targetPrice(p);
const coarse = h.optimize(h.buildProblem(p, .25)).w;
const fine = h.optimize(h.buildProblem(p, .0001)).w;
assert.ok(Math.abs(fine - bsWeight) < Math.abs(coarse - bsWeight) / 100, 'interior delta convergence');
near(fine, bsWeight, 1e-5, 'short-interval delta');
console.log('PASS: ' + checked + ' hedging parameter cases; normalization, convex optimum, exact boundary derivatives, positivity, expiry support, zero interval and delta limit.');
