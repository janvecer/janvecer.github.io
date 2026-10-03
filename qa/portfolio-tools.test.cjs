const assert=require('node:assert/strict');
const M=require('../likelihood/portfolio-tools.js');
const close=(a,b,eps=1e-8)=>assert(Math.abs(a-b)<eps,String(a)+' differs from '+b);
let q=[1/3,1/3,1/3],m=[.5,1/6,1/3],P=[q,[.5,1/3,1/6]];
let r=M.optimize(P,m,q);
close(r.w[1],.4);assert(r.gap<1e-8);
close(M.growth(m,r.p,q),M.kl(m,q)-M.kl(m,r.p));
const full=[q,[1,0,0],[0,1,0],[0,0,1]];
for(const belief of [[.6,.3,.1],[1,0,0],[0,.2,.8],q]){
  for(const kind of ['kl','quadratic']){
    r=M.optimize(full,belief,q,kind);assert(r.gap<1e-7);
    belief.forEach((x,i)=>close(x,r.p[i],3e-6));
  }
}
let state=847221;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
const generated=[];
for(let trial=0;trial<40;trial++){
  const n=2+trial%7,k=1+trial%6;
  q=M.normalize(Array.from({length:n},()=>.05+rand()));
  m=M.normalize(Array.from({length:n},()=>rand()));
  P=[q,...Array.from({length:k},()=>M.normalize(Array.from({length:n},()=>rand())))];
  for(const kind of ['kl','quadratic','mv']){
    r=M.optimize(P,m,q,kind,3);
    close(r.w.reduce((a,b)=>a+b,0),1);
    assert(r.w.every(v=>v>=0));assert(r.gap<1e-7,'gap '+r.gap+' kind '+kind+' trial '+trial);
    const baseline=M.objective(kind,m,q,q,3);
    assert(r.value>=baseline-1e-8);
    close(M.growth(m,r.p,q),M.kl(m,q)-M.kl(m,r.p));
    generated.push({q,m,P,kind,gamma:3,value:r.value,w:r.w,gap:r.gap});
  }
}
const Q=[.5,.3,.2],B=[.7,.3,0];
for(const gamma of [1,2,10]){
  const U=M.crra(B,Q,gamma),F=M.fractional(B,Q,1/gamma);
  close(U.reduce((a,b)=>a+b,0),1);close(U[2],0);
  if(gamma>1)assert(F[2]>0);
  F.forEach((v,i)=>assert(v/Q[i]>=1-1/gamma-1e-12));
}
assert.equal(M.growth([.5,.5],[1,0],[.5,.5]),-Infinity);
assert.equal(M.kl([1,0],[1,0]),0);
assert.throws(()=>M.normalize([0,0]));
if(process.env.PORTFOLIO_CROSSCHECK_PATH)require('node:fs').writeFileSync(process.env.PORTFOLIO_CROSSCHECK_PATH,JSON.stringify(generated));
console.log('PASS: book optimum, state-claim exactness including zeros, 120 optimizer certificates, 120 decomposition checks, CRRA and cash-floor boundaries.');
