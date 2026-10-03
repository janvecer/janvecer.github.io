const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// A DOM harness for event/state/numeric checks, not a browser layout test.
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.events = {}; this.clientWidth = 640; this._text = ''; this._html = ''; }
  setAttribute(k,v) { this.attributes[k] = String(v); this[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  removeChild(c) { this.children.splice(this.children.indexOf(c),1); }
  get firstChild() { return this.children[0]; }
  set textContent(v) { this._text=String(v); this.children=[]; this._html=''; }
  get textContent() { return this._text + this._html.replace(/<[^>]*>/g, '') + this.children.map(x=>x.textContent).join(''); }
  set innerHTML(v) { this._html=String(v); this.children=[]; this._text=''; }
  get innerHTML() { return this._html; }
  addEventListener(event, fn) { (this.events[event] ||= []).push(fn); }
  emit(event, detail={}) { for (const fn of this.events[event] || []) fn(detail); }
}
const names=['three-state','payoff-first','binomial-step','binomial-growth','binomial-time'];
const roots=Object.fromEntries(names.map(name=> {const el=new Element('div');el.setAttribute('data-lrw',name);return [name,el];}));
const document={readyState:'complete',createElement:t=>new Element(t),createElementNS:(_,t)=>new Element(t),createTextNode:t=>{const n=new Element('#text');n.textContent=t;return n;},querySelectorAll:()=>Object.values(roots)};
const errors=[];
const window={console:{error:e=>errors.push(e)}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../likelihood/lr-widgets.js'),'utf8'),{window,document,console:window.console,Float32Array,Float64Array});
function all(root,pred) {return [root,...root.children.flatMap(c=>all(c,()=>true))].filter(pred);}
function inputs(name) {return all(roots[name],e=>e.tag==='input');}
function set(name,i,v) {const input=inputs(name)[i];input.value=String(v);input.emit('input');}
function click(name,text) {const b=all(roots[name],e=>e.tag==='button' && e.textContent===text)[0];assert(b,text);b.emit('click');}
function text(name) {return roots[name].textContent;}
function near(a,b,eps=1e-10) {assert(Math.abs(a-b)<eps,`${a} != ${b}`);}
const math=window.LRW._test;
assert.equal(errors.length,0,'all five widgets mount');
assert.match(text('three-state'),/0\.0401/);
assert.match(text('three-state'),/−0\.0475/);
assert.equal(math.kl([.5000001,.4999999],[.5,.5]),0,'tiny roundoff divergences are zero');
click('payoff-first','Set V to the likelihood-ratio payoff');
[1200,1000,500].forEach((v,i)=>near(+inputs('payoff-first')[i].value,v));
assert.match(text('payoff-first'),/Price: V\(0\).*1,000/);
set('three-state',3,.01);
click('payoff-first','Set V to the likelihood-ratio payoff');
near(Math.max(...inputs('payoff-first').map(i=>+i.value)),3000);
assert(inputs('payoff-first').every(i=>+i.value<=3000+1e-8));
click('three-state','Restore the Chapter 1 example');
near(math.expLogReturn([.6,.3,.1],[.7,.2,.1],[.5,.3,.2]),math.kl([.6,.3,.1],[.5,.3,.2])-math.kl([.6,.3,.1],[.7,.2,.1]));
assert.equal(math.expLogReturn([.6,.3,.1],[0,.5,.5],[.5,.3,.2]),-Infinity);
assert.equal(math.kl([1,0],[0,1]),Infinity);
for (const p of [0,.01,.3,.9,.99,1]) {
  const pmf=math.binomPMF(250,p);near(pmf.reduce((a,b)=>a+b,0),1,1e-10);
}
for (const p of [.1,.3,.6,.9]) for (const q of [.2,.5,.8]) {
  near(math.kl(math.binomPMF(20,p),math.binomPMF(20,q)),20*math.klB(p,q));
}
// p=q cannot identify the inverse, and mode switching keeps u=d=1.
set('binomial-step',0,.5);
assert.match(text('binomial-step'),/inverse formula is undefined/);
click('binomial-step','Start from multipliers');
near(+inputs('binomial-step')[2].value,1);near(+inputs('binomial-step')[3].value,1);
assert.doesNotMatch(text('binomial-step'),/Martingale check:[^]*1\.100/);
// Equal multipliers different from 1 are arbitrage; 1,1 is fairly priced.
set('binomial-step',2,1.2);set('binomial-step',3,1.2);
assert.match(text('binomial-step'),/certain return different from 1/);
set('binomial-step',2,.8);set('binomial-step',3,.8);
assert.match(text('binomial-step'),/certain return different from 1/);
set('binomial-step',2,1);set('binomial-step',3,1);
assert.match(text('binomial-step'),/inverse formula is undefined/);
// Boundary dominance and reversed success/failure directions.
set('binomial-step',2,1.2);
assert.match(text('binomial-step'),/weakly dominates/);
set('binomial-step',2,.8);set('binomial-step',3,1.2);
assert.match(text('binomial-step'),/Martingale check/);
assert.match(text('binomial-step'),/Reciprocal martingale/);
// Valid derived multipliers outside the initial range stay synchronized.
click('binomial-step','Start from probabilities');set('binomial-step',0,.99);set('binomial-step',1,.01);
click('binomial-step','Start from multipliers');
near(+inputs('binomial-step')[2].value,99);assert(+inputs('binomial-step')[2].max>=99);
near(+inputs('binomial-step')[3].value,.01/.99);
// Inverse probabilities outside initial slider limits are not clamped.
set('binomial-step',2,3);set('binomial-step',3,.99);
near(+inputs('binomial-step')[1].value,.01/2.01);
assert(+inputs('binomial-step')[1].min<=+inputs('binomial-step')[1].value);
// Keyboard access uses the stated .01 increment on exact programmatic values.
click('binomial-step','Start from probabilities');
const before=+inputs('binomial-step')[0].value;
inputs('binomial-step')[0].emit('keydown',{key:'ArrowRight',preventDefault(){}});
near(+inputs('binomial-step')[0].value,before+.01,1e-11);
assert.match(inputs('binomial-step')[0].getAttribute('aria-valuetext'),/^0\.\d{3}$/,'off-grid probability uses three decimals');
click('binomial-step','Start from multipliers');
set('binomial-growth',1,.42);
assert.match(text('binomial-step'),/has switched to probability mode/);
assert.equal(all(roots['binomial-step'],e=>e.tag==='button' && e.textContent==='Start from probabilities')[0].getAttribute('aria-pressed'),'true');
click('binomial-step','Start from multipliers');
set('binomial-time',0,.65);
assert.match(text('binomial-step'),/has switched to probability mode/);
assert.equal(all(roots['binomial-step'],e=>e.tag==='button' && e.textContent==='Start from probabilities')[0].getAttribute('aria-pressed'),'true');
// Zero-payoff/zero-belief extended-real cases remain usable.
set('three-state',0,1);
assert.match(text('three-state'),/−∞/);
click('payoff-first','Set V to the likelihood-ratio payoff');
assert.doesNotMatch(text('payoff-first'),/expected log return is −∞/);
set('payoff-first',0,0);set('payoff-first',1,0);set('payoff-first',2,0);
assert.match(text('payoff-first'),/price is zero/);
for (const pm of [0,1]) {set('binomial-growth',0,pm);assert.doesNotMatch(text('binomial-growth'),/could not be drawn|NaN/);}
set('binomial-time',0,.5);set('binomial-time',1,.5);set('binomial-time',2,250);
assert.match(text('binomial-time'),/true crossing probability/);
assert.match(text('binomial-time'),/simulated fraction can fluctuate/);
assert.match(text('binomial-time'),/at n = 250: 250 ×/);
const xBars=all(roots['binomial-time'],e=>e.class==='lrw-hist-asset');
const yBars=all(roots['binomial-time'],e=>e.class==='lrw-hist-market');
assert.equal(xBars.length,251);assert.equal(yBars.length,251);
for(let i=0;i<xBars.length;i++)near(+xBars[i].height,+yBars[i].height);
assert.equal(all(roots['binomial-growth'],e=>e.class==='lrw-marker-lane').length,6);
assert.equal(all(roots['binomial-growth'],e=>e.class==='lrw-marker-key-item').length,6);
assert.equal(errors.length,0);
// Every slider has its own explicit label and formatted value for AT.
for (const root of Object.values(roots)) for (const i of all(root,e=>e.tag==='input')) {
  assert(i.id);assert(i.getAttribute('aria-valuetext'));
  assert(all(root,e=>e.tag==='label' && e.getAttribute('for')===i.id).length===1);
}
assert.equal(all(roots['three-state'],e=>e.class==='lrw-table-wrap').length,1);
console.log('PASS: five widget mounts; book values; KL tolerance/decomposition/binomial aggregation; LR payoff scaling; zero payoffs; both martingale checks; inverse boundaries; automatic mode synchronization; slider precision/keyboard access; six marker lanes; equal-law histogram layers; explicit horizon arithmetic; Ville wording.');
