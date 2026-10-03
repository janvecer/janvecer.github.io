#!/usr/bin/env python3
"""Independent SciPy audit of the normal-option and discrete-hedging math.

Run from any directory: python qa/normal-hedging-audit.py
Requires Python with NumPy/SciPy and Node.js (or CODEX_PRIMARY_RUNTIME_NODE).
Writes qa/normal-hedging-audit-v4.json. No browser or Quarto is required.

Option prices use SciPy normal tails; density masses use split Gauss-Legendre
quadrature. Hedge KL and first-order conditions use adaptive SciPy quadrature,
with a strike breakpoint at expiry and analytic endpoint-derivative checks.
"""
import json, math, itertools, subprocess, os, shutil
from pathlib import Path
import numpy as np
from scipy.special import ndtr
from scipy.integrate import quad
from scipy.optimize import minimize_scalar
ROOT=Path(__file__).resolve().parents[1]
NODE=os.environ.get('CODEX_PRIMARY_RUNTIME_NODE') or shutil.which('node')
if not NODE:
    raise SystemExit('Node.js is required; set CODEX_PRIMARY_RUNTIME_NODE if it is not on PATH.')
OPTION=ROOT/'likelihood/normal-options.js'

def bs(x,k,sigma,t,typ='call'):
    if t<=0 or sigma<=0:
        return max(x-k,0) if typ=='call' else max(k-x,0) if typ=='put' else float(x>k) if typ=='digital' else abs(x-k)
    a=sigma*math.sqrt(t); d1=math.log(x/k)/a+a/2; d2=d1-a
    call=x*ndtr(d1)-k*ndtr(d2)
    put=k*ndtr(-d2)-x*ndtr(-d1)
    return {'call':call,'put':put,'digital':ndtr(d2),'straddle':call+put}[typ]

configs=[dict(spot=100,strike=k,sigma=s,time=t,type=typ,reserve=.35) for k,s,t,typ in itertools.product([70,100,130],[.15,.45],[.5,3],['call','put','digital','straddle'])]
configs += [dict(spot=100,strike=100,sigma=.25,time=1,type=typ,reserve=.35) for typ in ['call','put','digital','straddle']]
u,ww=np.polynomial.legendre.leggauss(120)
requests=[]; weights=[]
for c in configs:
    a=c['sigma']*math.sqrt(c['time']); threshold=math.log(c['strike']/c['spot'])/a+a/2
    edges=[-12,threshold,12]
    zs=np.concatenate([lo+(u+1)*(hi-lo)/2 for lo,hi in zip(edges[:-1],edges[1:])])
    w=np.concatenate([ww*(hi-lo)/2 for lo,hi in zip(edges[:-1],edges[1:])])
    requests.append({'c':c,'z':zs.tolist()}); weights.append(w)
script="const fs=require('fs'),m=require(process.argv[1]),x=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(x.map(r=>({price:m.blackScholes(r.c).price,rows:r.z.map(z=>m.densityAt(z,r.c))}))));"
raw=subprocess.run([NODE,'-e',script,str(OPTION)],input=json.dumps(requests),text=True,capture_output=True,check=True)
results=json.loads(raw.stdout)
price_err=0; mass_err=0; density_err=0
for c,req,w,rr in zip(configs,requests,weights,results):
    expected=bs(c['spot'],c['strike'],c['sigma'],c['time'],c['type'])
    price_err=max(price_err,abs(rr['price']-expected))
    for key in ['market','asset','option','mixture']:
        mass_err=max(mass_err,abs(float(np.dot(w,[r[key] for r in rr['rows']]))-1))
    a=c['sigma']*math.sqrt(c['time'])
    for z,r in zip(req['z'],rr['rows']):
        phi=math.exp(-z*z/2)/math.sqrt(2*math.pi); x=c['spot']*math.exp(a*z-a*a/2)
        pay=max(x-c['strike'],0) if c['type']=='call' else max(c['strike']-x,0) if c['type']=='put' else float(x>c['strike']) if c['type']=='digital' else abs(x-c['strike'])
        density_err=max(density_err,abs(r['option']-pay*phi/expected))
report={'option_cases':len(configs),'max_price_absolute_error':price_err,'max_density_mass_error':mass_err,'max_pointwise_option_density_error':density_err}
assert price_err<1e-10 and mass_err<1e-10 and density_err<1e-10,report

from scipy.optimize import brentq
HEDGE=ROOT/'likelihood/hedging.js'
def hedge_case(strike=100,sigma=.3,tau=1,reserve=100,h=None):
    return dict(spot=100,strike=strike,sigma=sigma,tau=tau,reserve=reserve,h=tau/12 if h is None else h)
hconfigs=[hedge_case(strike=110,reserve=110,h=1/12),hedge_case(strike=110,reserve=110,h=1/252),hedge_case(strike=110,reserve=110,h=1),hedge_case(reserve=0,h=1/12),hedge_case(reserve=0,h=1/252),hedge_case(reserve=0,h=1),hedge_case(strike=120,sigma=.15,tau=.25,reserve=150,h=.25),hedge_case(strike=120,sigma=.15,tau=.25,reserve=150,h=.25/252),hedge_case(strike=80,sigma=.45,tau=2,reserve=150,h=2),hedge_case(strike=80,sigma=.45,tau=2,reserve=150,h=2/12),hedge_case(strike=120,sigma=.45,tau=2,reserve=30,h=1),hedge_case(strike=80,sigma=.15,tau=.25,reserve=0,h=.25)]
script="const fs=require('fs'),m=require(process.argv[1]),x=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(x.map(p=>{const pr=m.buildProblem(p),o=m.optimize(pr);return {opt:o,mass:m.masses(pr,o.w),d0:m.derivative(pr,0),d1:m.derivative(pr,1),chosen:m.objective(pr,.4)}})));"
raw=subprocess.run([NODE,'-e',script,str(HEDGE)],input=json.dumps(hconfigs),text=True,capture_output=True,check=True)
hresults=json.loads(raw.stdout)
rows=[]
for c,r in zip(hconfigs,hresults):
    x,k,sig,tau,B,h=[c[t] for t in ['spot','strike','sigma','tau','reserve','h']]
    H=bs(x,k,sig,tau)+B; a=sig*math.sqrt(h)
    strikeZ=math.log(k/x)/a+a/2
    cuts=[-12,strikeZ,12] if h==tau else [-12,12]
    def integrate(fun):
        return sum(quad(fun,l,u,epsabs=3e-13,epsrel=3e-12,limit=200)[0] for l,u in zip(cuts[:-1],cuts[1:]))
    def terms(z):
        R=math.exp(a*z-a*a/2)
        g=(max(0,bs(x*R,k,sig,tau-h))+B)/H
        return math.exp(-z*z/2)/math.sqrt(2*math.pi),R,g
    def deriv(w):
        def fn(z):
            q,R,g=terms(z); return -q*g*(R-1)/(1+w*(R-1))
        return integrate(fn)
    def obj(w):
        def fn(z):
            q,R,g=terms(z); v=1-w+w*R
            if g==0: return q*v
            e=(g-v)/v
            term=v*e*e*(.5+e*(-1/6+e*(1/12-e/20))) if abs(e)<1e-4 else g*math.log(g/v)-g+v
            return q*term
        return integrate(fn)
    d0,d1=deriv(0),deriv(1)
    w=0. if d0>=0 else 1. if d1<=0 else brentq(deriv,0,1,xtol=1e-13)
    kl=obj(w)
    exact_d1=math.exp(a*a)*(bs(x*math.exp(-a*a),k,sig,tau)+B)/H-1
    rows.append({'params':c,'js_optimal_weight':r['opt']['w'],'scipy_optimal_weight':w,'weight_error':abs(r['opt']['w']-w),'js_min_kl':r['opt']['kl'],'scipy_min_kl':kl,'kl_error':abs(r['opt']['kl']-kl),'mass_error':max(abs(v-1) for v in r['mass'].values()),'boundary_derivative_error':abs(r['d1']-exact_d1),'scipy_derivative_analytic_error':abs(d1-exact_d1),'chosen_kl_error':abs(r['chosen']-obj(.4))})
report['hedging_cases']=len(rows)
for key in ['weight_error','kl_error','mass_error','boundary_derivative_error','scipy_derivative_analytic_error','chosen_kl_error']:
    report['hedging_max_'+key]=max(r[key] for r in rows)
report['hedging_results']=rows
print(json.dumps({k:v for k,v in report.items() if k!='hedging_results'},indent=2))
(ROOT/'qa/normal-hedging-audit-v4.json').write_text(json.dumps(report,indent=2)+'\n')
assert report['hedging_max_weight_error']<2e-7 and report['hedging_max_kl_error']<2e-8 and report['hedging_max_mass_error']<2e-8,report
