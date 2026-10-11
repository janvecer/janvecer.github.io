'use strict';
const assert = require('node:assert/strict');
const compare = require('../likelihood/hedging-comparison.js');
const portfolio = require('../likelihood/portfolio-tools.js');
const near = (a,b,tol=1e-11) => assert.ok(Math.abs(a-b)<tol, `${a} != ${b}`);

// Analytical geometric sums supply checks independent of the chart's finite sums.
const binary = (2/3)*Math.log(4/3)+(1/3)*Math.log(2/3);
const shock = Math.log(4/3)+.5*Math.log(2/3);
near(shock,1.5*binary);
near(shock-binary,shock/3);
const qPrime = [17/32,5/32,3/16];
near(qPrime.reduce((a,b)=>a+b,0)+1/8,1);
near(qPrime[0]*1.5+qPrime[1]*.75+qPrime[2]*.375+1/64,1);
const altInformation = shock + [2/3,2/9,2/27].reduce((s,m,g)=>s+m*Math.log(Math.pow(.5,g+1)/qPrime[g]),0);
for(const alternative of [false,true]) {
  const best=compare.optimizers(alternative);
  near(best.kl,.745330847297473,1e-10);
  if(!alternative){near(best.quadratic,.7);near(best.kl2,13/16);}
  else near(best.quadratic,(1/5)/(2/7+(17/32-1/2)*(.5)**2+(5/32-1/4)*(-.25)**2+(3/16-1/8)*(-.625)**2));
  for(const w of [0,2/3,.7,best.kl,13/16,1]){
    const v=compare.losses(w,alternative);
    assert.ok(Object.values(v).every(Number.isFinite));
    near(v.kl+v.growth,alternative?altInformation:shock);
    near(v.growth,compare.losses(w,!alternative).growth);
    if(!alternative)near(v.kl2,(24/65)*w*w-.6*w+.25);
    assert.ok(v.kl>=0 && v.kl2>=0 && v.quadratic>=0);
  }
  for(const [objective,key] of [['kl','kl'],['kl2','kl2'],['quadratic','quadratic']]){
    const w=best[key],h=1e-5;
    const slope=(compare.losses(w+h,alternative)[objective]-compare.losses(w-h,alternative)[objective])/(2*h);
    assert.ok(Math.abs(slope)<1e-8);
  }
}
near(compare.losses(compare.optimizers(false).kl,false).growth,.081462349657880,1e-11);
// The Win-only preset retains the market's conditional Draw/Loss split.
const q=[.5,.3,.2],m=[.6,.3,.1],claim=[1,0,0];
const optimum=portfolio.optimize([q,claim],m,q);
near(optimum.w[1],.2);
[.6,.24,.16].forEach((v,i)=>near(optimum.p[i],v));
near(portfolio.growth(m,optimum.p,q),.020135513550689,1e-12);
near(portfolio.kl(m,q),portfolio.growth(m,optimum.p,q)+portfolio.kl(m,optimum.p));
console.log('PASS: Columbia clock identities, three analytical/ numerical optima, pricing-law invariance, boundary values, and incomplete football preset.');
