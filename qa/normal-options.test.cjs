'use strict';
const assert = require('node:assert/strict');
const m = require('../likelihood/normal-options.js');
const close = (a, b, tol, message) => assert.ok(Math.abs(a - b) <= tol, `${message}: ${a} vs ${b}`);
// Independent reference values from the Gaussian integral, including small tails.
for (const [z, tail] of [[0,.5],[1,.15865525393145707],[2,.02275013194817922],[3,.0013498980316300957],[8,6.220960574271819e-16],[12,1.776482112077702e-33]]) {
  close(m.normalSurvival(z), tail, Math.max(1e-300, tail*2e-14), 'Gaussian survival');
  close(m.normalCdf(-z), tail, Math.max(1e-300, tail*2e-14), 'Gaussian left tail');
}
close(m.callPrice(100,100,1,.2), 7.965567455405804, 1e-12, 'At-the-money call benchmark');
close(m.callPrice(100,100,1,.25), 9.94764496602258, 1e-12, 'Explorer default benchmark');
function simpson(f, lo, hi, n=8000) {
  if (!(hi>lo)) return 0;
  const h=(hi-lo)/n;
  let s=f(lo)+f(hi);
  for(let i=1;i<n;i++) s+=(i%2?4:2)*f(lo+i*h);
  return s*h/3;
}
let cases=0;
for(const strike of [70,100,130]) for(const sigma of [.15,.25,.45]) for(const time of [.5,1,3]) {
  const base={spot:100,strike,sigma,time};
  const call=m.blackScholes({...base,type:'call'}), put=m.blackScholes({...base,type:'put'});
  close(call.price-put.price,100-strike,2e-12,'Put-call parity');
  const dx=.001;
  close(call.delta,(m.callPrice(100+dx,strike,time,sigma)-m.callPrice(100-dx,strike,time,sigma))/(2*dx),2e-9,'Delta vs independent finite difference');
  for(const type of ['call','put','digital','straddle']) {
    const config={...base,type,reserve:.3};
    const bs=m.blackScholes(config), threshold=-bs.d2;
    assert.ok(bs.price>0 && Number.isFinite(bs.price));
    function density(z,side) {
      if(type==='digital' && Math.abs(z-threshold)<1e-12) z=threshold+(side==='left'?-1e-10:1e-10);
      return m.densityAt(z,config,bs).option;
    }
    const left=simpson(z=>density(z,'left'),-12,threshold);
    const right=simpson(z=>density(z,'right'),threshold,12);
    close(left+right,1,2e-10,`${type} full-density normalization`);
    const integral=simpson(z=>m.payoff(100*Math.exp(bs.a*z-bs.a**2/2),strike,type)*m.normalPdf(z),-12,threshold)
      +simpson(z=>m.payoff(100*Math.exp(bs.a*z-bs.a**2/2),strike,type)*m.normalPdf(z),threshold,12);
    if(type!=='digital') close(integral,bs.price,3e-8,`${type} price as independent payoff integral`);
    for(const z of [-5,-1,0,1,5]) {
      const d=m.densityAt(z,config,bs);
      close(d.asset/d.market,d.terminal/100,1e-10,'Underlying likelihood identity');
      close(d.mixture,.3*d.market+.7*d.option,2e-15,'Cost-weighted density mixture');
      assert.ok(Object.values(d).every(Number.isFinite));
    }
    cases++;
  }
}
assert.equal(m.callPrice(100,120,0,.2),0);
assert.equal(m.callPrice(100,80,0,.2),20);
assert.equal(m.callPrice(100,100,1,0),0);
assert.equal(m.densityAt(0,{spot:100,strike:120,sigma:0,time:1,type:'call'}).option,0);
for(const type of ['call','put','digital','straddle']) {
  const bs=m.blackScholes({spot:100,strike:130,sigma:.001,time:.01,type});
  assert.ok(Number.isFinite(bs.price) && Number.isFinite(bs.delta),'Deep-tail output finite');
}
console.log(`PASS: ${cases} normal-option configurations; prices, normalization, likelihood identity, deltas, mixtures and degenerate limits.`);
