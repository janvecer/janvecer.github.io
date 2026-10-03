'use strict';
const assert = require('node:assert/strict');
const m = require('../likelihood/discrete-models.js');
const close = (a,b,tol=1e-12) => assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)), `${a} ≠ ${b}`);

// A single sampled count path supplies both price and log-price charts.
const draws = [.01,.5,.9,.99,.2,.75];
for (const [p,q] of [[.6,.4],[.4,.6],[.5,.5]]) {
  for (const probability of [p,q]) {
    const logs = m.logPath(draws,p,q,probability,draws.length);
    let price = 1;
    close(logs[0],0);
    for (let t=1;t<=draws.length;t++) {
      const count = m.geometric(draws[t-1],probability);
      price *= Math.pow(p/q,count)*(1-p)/(1-q);
      close(Math.exp(logs[t]),price);
      close(m.plotPrice(logs[t]),price);
    }
  }
}

// The geometric series gives E^Y[price] = 1, regardless of the negative
// expected log price. Sum independently from the sampled-path calculation.
for (const [p,q] of [[.6,.4],[.4,.6],[.9,.05],[.05,.9]]) {
  let mean = 0;
  for(let k=0;k<1000;k++) mean += (1-p)*Math.pow(p,k);
  close(mean,1,1e-11);
  assert.ok(m.rate(q,p)>0);
}
close(Math.exp(m.logMeanPriceX(1,.6,.4)),8/3);
close(m.logMeanPriceX(5,.6,.4),5*Math.log(8/3));
assert.equal(m.logMeanPriceX(1,.6,.36),Infinity);
assert.equal(m.logMeanPriceX(30,.9,.05),Infinity);
close(m.logMeanPriceX(30,.5,.5),0);

// An extreme but permitted simulation can exceed machine exponentiation;
// the price chart clips visibly while keeping all SVG coordinates finite.
const extreme = m.logPath(Array(30).fill(.999999),.9,.05,.9,30);
assert.ok(extreme.at(-1)>709);
const range = m.priceScale(extreme);
assert.equal(range.clipped,true);
assert.equal(range.max,1e12);
for (const logPrice of extreme.concat([-10000,0,1,700,10000])) {
  const value = m.plotPrice(logPrice);
  assert.ok(Number.isFinite(value) && value>=0);
}
assert.ok(m.plotPrice(10000)>range.max); // Not a false flat line at the cap.
assert.equal(m.priceScale([0,.5,1]).clipped,false);
close(m.priceScale([0,.5,1]).max,Math.E*1.08);
console.log('Discrete model checks pass: shared price/log paths, means, and explicit extreme-price clipping.');
