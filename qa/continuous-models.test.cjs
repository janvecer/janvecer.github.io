/* Run: node qa/continuous-models.test.cjs */
'use strict';
const assert = require('node:assert/strict');
const m = require('../likelihood/continuous-models.js');
const close = (x, y, tolerance, label) => assert.ok(Math.abs(x - y) <= tolerance, `${label}: ${x} vs ${y}, tolerance ${tolerance}`);
let specifications = 0;
for (const kind of ['normal', 'poisson', 'gamma', 'inverse-gaussian']) {
  const activities = kind === 'normal' ? [1] : kind === 'poisson' ? [1, 3, 8] : kind === 'gamma' ? [2, 3, 6] : [1, 2, 4];
  for (const activity of activities) for (const direction of ['up', 'down']) for (const k of [0, .0025, .05, .15]) {
    const p = m.parameters(kind, k, activity, direction);
    for (const t of [.5, 2, 5]) {
      const x = m.moments(p, t, 'X'), y = m.moments(p, t, 'Y');
      close(p.a * x.mean + p.b * t, k * t, 2e-12, `${kind} forward KL`);
      close(p.a * y.mean + p.b * t, -p.rateY * t, 2e-12, `${kind} reverse KL`);
      assert.ok(p.rateY >= -1e-12);
      const zs = kind === 'poisson' ? [0, 1, 5, 25] : kind === 'normal' ? [-3, 0, 2, 6] : [.01, .3, 2, 9];
      for (const z of zs) close(m.logDensity(p, t, z, 'X') - m.logDensity(p, t, z, 'Y'), p.a * z + p.b * t, 2e-11, `${kind} density ratio`);
      let logNormalization;
      if (kind === 'normal') logNormalization = p.b + p.a * p.y + .5 * p.a * p.a;
      if (kind === 'poisson') logNormalization = p.b + p.y * Math.expm1(p.a);
      if (kind === 'gamma') logNormalization = p.b + activity * Math.log(p.y / (p.y - p.a));
      if (kind === 'inverse-gaussian') logNormalization = p.b + activity * (p.y - Math.sqrt(p.y * p.y - 2 * p.a));
      close(logNormalization, 0, 2e-12, `${kind} likelihood normalization`);
      for (const measure of ['X', 'Y']) {
        const paths = m.simulate(p, t, measure, 101, 2);
        assert.equal(paths.length, 2);
        for (const path of paths) {
          close(path.at(-1)[0], t, 1e-12, 'path endpoint');
          assert.ok(path.flat().every(Number.isFinite), `${kind} finite paths`);
          if (k === 0) assert.ok(path.every(pair => pair[1] === 0));
        }
      }
      specifications++;
    }
  }
}
// Sampling tests use theoretical standard errors, including heavy small-time
// increment kurtosis. These do not assume a Monte Carlo martingale mean is exact.
let samplers = 0;
for (const kind of ['normal', 'poisson', 'gamma', 'inverse-gaussian']) {
  const activity = kind === 'normal' ? 1 : kind === 'poisson' ? 3 : 2;
  const p = m.parameters(kind, .15, activity, 'up');
  for (const dt of [1 / 96, 1]) for (const measure of ['X', 'Y']) {
    const count = 120000, random = m.rng(172901 + samplers * 771);
    const expected = m.moments(p, dt, measure);
    let sum = 0, sum2 = 0;
    for (let i = 0; i < count; i++) {
      const v = m.increment(p, dt, measure, random);
      assert.ok(Number.isFinite(v), `${kind} sampler finite`);
      if (kind !== 'normal') assert.ok(v >= 0, `${kind} nonnegative increment`);
      sum += v; sum2 += v * v;
    }
    const mean = sum / count, variance = (sum2 - sum * sum / count) / (count - 1);
    close(mean, expected.mean, 7 * Math.sqrt(expected.variance / count), `${kind} sampled mean (${dt}, ${measure})`);
    const rate = measure === 'X' ? p.x : p.y;
    let kurtosis = 3;
    if (kind === 'poisson') kurtosis += 1 / expected.mean;
    if (kind === 'gamma') kurtosis += 6 / (activity * dt);
    if (kind === 'inverse-gaussian') kurtosis += 15 / (activity * dt * rate);
    const varianceSE = expected.variance * Math.sqrt((kurtosis - (count - 3) / (count - 1)) / count);
    close(variance, expected.variance, 7 * varianceSE, `${kind} sampled variance (${dt}, ${measure})`);
    samplers++;
  }
}
console.log(`PASS: ${specifications} horizon specifications; likelihood identities, normalization, zero-information paths; ${samplers} exact-increment moment tests.`);
