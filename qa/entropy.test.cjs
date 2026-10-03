'use strict';
const assert = require('node:assert/strict');
const {evaluate} = require('../likelihood/entropy.js');
function near(a, b, tolerance = 1e-12) { assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`); }
const example = evaluate(.6, .5);
near(example.forward, .020135513550688863);
near(example.reverse, .020410997260127586);
near(example.ratios[0], 1.2);
near(example.ratios[1], .8);
near(example.assetGross, 1.04);
for (const p of [0, .01, .1, .5, .6, .99, 1]) {
  for (const q of [.01, .1, .5, .6, .99]) {
    const r = evaluate(p, q);
    near(r.marketGross, 1);
    near(r.contributions.reduce((a, b) => a + b, 0), r.forward);
    assert.ok(r.forward >= 0 && Number.isFinite(r.forward));
    assert.ok(r.contributions.every(Number.isFinite));
    if (p === 0 || p === 1) { assert.equal(r.marketLog, -Infinity); assert.equal(r.reverse, Infinity); }
    else {
      near(r.Q.reduce((s, v, i) => s + v * r.logs[i], 0), -r.reverse);
      near(evaluate(q, p).forward, r.reverse);
    }
    if (p === q) { assert.equal(r.forward, 0); assert.equal(r.reverse, 0); assert.equal(r.marketLog, 0); }
  }
}
assert.throws(() => evaluate(.5, 0), RangeError);
assert.throws(() => evaluate(.5, 1), RangeError);
console.log('Entropy: worked example, 35 probability pairs, reverse expectation, normalization and zero-payoff boundaries pass.');
