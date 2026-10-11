/* Finite-state portfolio laboratories. No dependencies; all calculations run locally. */
(function () {
  'use strict';
  const sum = a => a.reduce((s, x) => s + x, 0);
  const dot = (a,b) => sum(a.map((x,i)=>x*b[i]));
  const normalize = a => { const s=sum(a); if (!(s>0) || a.some(x=>!Number.isFinite(x)||x<0)) throw Error('Each row needs nonnegative numbers and a positive total.'); return a.map(x=>x/s); };
  const mix = (P,w) => P[0].map((_,i)=>sum(P.map((p,j)=>w[j]*p[i])));
  const kl = (p,q) => { let d=0; for(let i=0;i<p.length;i++){if(p[i]===0)continue;if(q[i]<=0)return Infinity;d+=p[i]*Math.log(p[i]/q[i]);}return Math.abs(d)<1e-12?0:d; };
  const growth = (m,p,q) => {let g=0;for(let i=0;i<m.length;i++){if(!m[i])continue;if(p[i]<=0)return -Infinity;g+=m[i]*Math.log(p[i]/q[i]);}return Math.abs(g)<1e-12?0:g;};
  function stats(m,p,q) { const z=p.map((v,i)=>v/q[i]-1),mu=dot(m,z); return {z,mu,variance:Math.max(0,dot(m,z.map(x=>x*x))-mu*mu),quadratic:mu-.5*dot(q,z.map(x=>x*x)),taylor:mu-.5*dot(m,z.map(x=>x*x))}; }
  function objective(kind,m,p,q,gamma=1){const s=stats(m,p,q);return kind==='kl'?growth(m,p,q):kind==='quadratic'?s.quadratic:s.mu-.5*gamma*s.variance;}
  function scores(kind,m,p,q,P,gamma=1){const s=stats(m,p,q);return P.map(a=>sum(a.map((v,i)=>kind==='kl'?(m[i]===0?0:m[i]*v/p[i]):kind==='quadratic'?v*(m[i]/q[i]-s.z[i]):v*m[i]/q[i]*(1-gamma*(s.z[i]-s.mu)))));}
  /* Pairwise transfers on the simplex. The first-order gap bounds suboptimality
     for these concave objectives; exact log growth has gap max_j E_M[Pj/Pw]-1. */
  function optimize(P,m,q,kind='kl',gamma=1) {
    let w=P.map(()=>1/P.length), p=mix(P,w),gap=Infinity,iteration=0;
    for(;iteration<12000;iteration++){
      const s=scores(kind,m,p,q,P,gamma);let enter=0,leave=-1;
      s.forEach((v,j)=>{if(v>s[enter])enter=j;if(w[j]>1e-14&&(leave<0||v<s[leave]))leave=j;});
      gap=Math.max(0,s[enter]-dot(w,s)); if(gap<1e-9||leave<0||enter===leave)break;
      const d=P[enter].map((v,i)=>v-P[leave][i]);let delta;
      if(kind==='kl'){
        const deriv=t=>{let out=0;for(let i=0;i<m.length;i++){if(!m[i])continue;const v=p[i]+t*d[i];if(v<=0)return -Infinity;out+=m[i]*d[i]/v;}return out;};
        if(deriv(w[leave])>=0)delta=w[leave];
        else {let lo=0,hi=w[leave];for(let k=0;k<55;k++){const mid=(lo+hi)/2;if(deriv(mid)>0)lo=mid;else hi=mid;}delta=(lo+hi)/2;}
      } else {
        const dr=d.map((v,i)=>v/q[i]);
        const curvature=kind==='quadratic'?dot(q,dr.map(v=>v*v)):gamma*Math.max(0,dot(m,dr.map(v=>v*v))-dot(m,dr)**2);
        delta=curvature>1e-16?Math.min(w[leave],Math.max(0,(s[enter]-s[leave])/curvature)):w[leave];
      }
      if(!(delta>1e-16))break;
      w[enter]+=delta;w[leave]-=delta;p=mix(P,w);
    }
    const s=scores(kind,m,p,q,P,gamma);gap=Math.max(0,Math.max(...s)-dot(w,s));
    return {w,p,gap,iterations:iteration,value:objective(kind,m,p,q,gamma)};
  }
  function oneDim(fn){let a=0,b=1;for(let i=0;i<65;i++){const c=a+(b-a)/3,d=b-(b-a)/3;if(fn(c)<fn(d))a=c;else b=d;}const candidates=[0,1,(a+b)/2];return candidates.reduce((x,y)=>fn(y)>fn(x)?y:x);}
  function crra(m,q,gamma){return normalize(m.map((p,i)=>p===0?0:Math.exp(Math.log(p)/gamma+(1-1/gamma)*Math.log(q[i]))));}
  function fractional(m,q,f){return m.map((p,i)=>(1-f)*q[i]+f*p);}
  function simplexSet(a,i,v,floor=0){const b=a.slice();v=Math.max(floor,Math.min(1-floor*(a.length-1),v));const rest=1-v,old=sum(a.filter((_,j)=>i!==j)),spare=rest-floor*(a.length-1),base=sum(a.map((x,j)=>j===i?0:Math.max(0,x-floor)));b[i]=v;b.forEach((_,j)=>{if(j!==i)b[j]=floor+spare*(base>1e-15?Math.max(0,a[j]-floor)/base:1/(a.length-1));});return b;}
  const math={normalize,mix,kl,growth,stats,objective,optimize,crra,fractional,oneDim};
  if(typeof module!=='undefined'&&module.exports)module.exports=math;
  if(typeof window!=='undefined')window.PortfolioTools=math;
  if(typeof document==='undefined')return;
  const NS='http://www.w3.org/2000/svg';let seq=0;
  const fmt=(x,d=4)=>x===Infinity?'∞':x===-Infinity?'−∞':!Number.isFinite(x)?'—':(Math.abs(x)<1e-12?0:x).toFixed(d).replace('-','−');
  const colors={market:'var(--lrw-market,#3a64a0)',belief:'var(--lrw-belief,#a86b0c)',asset:'var(--lrw-asset,#2b7a55)',payoff:'var(--lrw-payoff,#7b4a95)',loss:'var(--lrw-loss,#b43f33)'};
  function el(tag,attrs={},children=[]){const n=document.createElement(tag);Object.entries(attrs).forEach(([k,v])=>{if(k==='text')n.textContent=v;else if(k==='html')n.innerHTML=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else if(v!==null)n.setAttribute(k,v);});[].concat(children).forEach(c=>n.appendChild(typeof c==='string'?document.createTextNode(c):c));return n;}
  function svgEl(tag,attrs,parent){const n=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>{if(k==='text')n.textContent=v;else n.setAttribute(k,v);});if(parent)parent.appendChild(n);return n;}
  const clear=n=>{while(n.firstChild)n.removeChild(n.firstChild);};
  const btn=(label,fn)=>el('button',{type:'button',class:'pt-btn',text:label,onclick:fn});
  function slider(label,min,max,step,value,fn,tone='payoff'){
    const id='pt-control-'+(++seq),out=el('output',{'for':id,text:fmt(value,2)}),input=el('input',{id,type:'range',min,max,step,value,'aria-label':label});
    const show=v=>{input.value=v;out.textContent=fmt(v,Math.abs(v*100-Math.round(v*100))>1e-8?3:2);input.setAttribute('aria-valuetext',fmt(v,3));};
    input.addEventListener('input',()=>{show(+input.value);fn(+input.value);});show(value);
    return {node:el('div',{class:'pt-slider',style:'--pt-tone:'+colors[tone]},[el('label',{'for':id,text:label}),input,out]),set:show,input};
  }
  function select(label,options,value,fn){const id='pt-select-'+(++seq),n=el('select',{id,'aria-label':label,onchange:()=>fn(n.value)},options.map(([v,t])=>el('option',{value:v,text:t})));n.value=value;return el('label',{class:'pt-select','for':id},[el('span',{text:label}),n]);}
  function legend(series){return el('div',{class:'pt-legend'},series.map(s=>el('span',{},[el('i',{style:'--pt-tone:'+colors[s.tone]+(s.dash?';border-style:dashed':'')}),s.label])));}
  function table(headers,rows,caption){return el('div',{class:'pt-table-wrap'},[el('table',{},[...(caption?[el('caption',{text:caption})]:[]),el('thead',{},[el('tr',{},headers.map(x=>el('th',{scope:'col',text:x})))]),el('tbody',{},rows.map(r=>el('tr',{},r.map((x,i)=>el(i===0?'th':'td',i===0?{scope:'row',text:String(x)}:{text:String(x)})))))])]);}
  function width(root){return Math.max(260,Math.min(850,root.clientWidth||680));}
  function svg(root,height,label){const w=width(root);return {s:svgEl('svg',{viewBox:`0 0 ${w} ${height}`,role:'img','aria-label':label,class:'pt-chart'}),w};}
  function bars(root,names,series,label){const {s,w}=svg(root,260,label),left=42,right=w-12,top=25,bottom=216,max=Math.max(.05,...series.flatMap(x=>x.values))*1.15;
    for(let i=0;i<=4;i++){const y=bottom-(bottom-top)*i/4;svgEl('line',{x1:left,y1:y,x2:right,y2:y,class:'pt-grid'},s);svgEl('text',{x:left-7,y:y+4,'text-anchor':'end',text:fmt(max*i/4,2),class:'pt-axis'},s);}
    const group=(right-left)/names.length,bw=Math.min(30,group*.74/series.length);
    names.forEach((name,i)=>{const cx=left+group*(i+.5);series.forEach((ser,j)=>{const h=ser.values[i]/max*(bottom-top);svgEl('rect',{x:cx+(j-series.length/2)*bw+1,y:bottom-h,width:Math.max(1,bw-2),height:Math.max(0,h),fill:ser.outline?'none':colors[ser.tone],stroke:colors[ser.tone],'stroke-width':ser.outline?2:0,'fill-opacity':.82},s);});svgEl('text',{x:cx,y:bottom+24,'text-anchor':'middle',text:names.length>7?String(i+1):name,class:'pt-axis'},s);});return s;}
  function lineChart(root,series,markers,label,xlabel='Cost weight in the asset'){
    const {s,w}=svg(root,280,label),l=48,r=w-16,t=20,b=225,finite=series.flatMap(a=>a.points.map(p=>p[1])).filter(Number.isFinite);let lo=Math.min(0,...finite),hi=Math.max(.01,...finite);const pad=.1*(hi-lo);lo-=pad;hi+=pad;const X=x=>l+x*(r-l),Y=y=>b-(y-lo)/(hi-lo)*(b-t);
    for(let i=0;i<=4;i++){let y=lo+(hi-lo)*i/4;svgEl('line',{x1:l,y1:Y(y),x2:r,y2:Y(y),class:'pt-grid'},s);svgEl('text',{x:l-6,y:Y(y)+4,'text-anchor':'end',text:fmt(y,2),class:'pt-axis'},s);let x=i/4;svgEl('text',{x:X(x),y:b+23,'text-anchor':'middle',text:fmt(x,2),class:'pt-axis'},s);}
    svgEl('text',{x:(l+r)/2,y:272,'text-anchor':'middle',text:xlabel,class:'pt-axis'},s);
    series.forEach(a=>svgEl('polyline',{points:a.points.filter(p=>Number.isFinite(p[1])).map(p=>`${X(p[0])},${Y(p[1])}`).join(' '),fill:'none',stroke:colors[a.tone],'stroke-width':2.5,'stroke-dasharray':a.dash?'6 4':'none'},s));
    markers.forEach(a=>{if(Number.isFinite(a.y)){svgEl('line',{x1:X(a.x),x2:X(a.x),y1:t,y2:b,stroke:colors[a.tone],'stroke-width':1,'stroke-dasharray':'2 4'},s);svgEl('circle',{cx:X(a.x),cy:Y(a.y),r:5,fill:colors[a.tone],stroke:'var(--pt-bg,#fff)','stroke-width':2},s);}});return s;
  }
  function notice(text){return el('p',{class:'pt-note',text});}
  function watch(root,draw){if(typeof ResizeObserver==='undefined')return;let w=width(root);new ResizeObserver(()=>{let n=width(root);if(Math.abs(n-w)>2){w=n;draw();}}).observe(root);}
  function utility(root){
    let m=[.6,.3,.1],q=[.5,.3,.2],gamma=2,f=.5,linked=true;const names=['Win','Draw','Loss'];
    const controls=el('div',{class:'pt-controls'}),charts=el('div'),read=el('div'),mSl=[],qSl=[];
    names.forEach((n,i)=>{mSl.push(slider('Belief: '+n,0,1,.01,m[i],v=>{m=simplexSet(m,i,v);draw();},'belief'));qSl.push(slider('Market: '+n,.01,.98,.01,q[i],v=>{q=simplexSet(q,i,v,.01);draw();},'market'));});
    const sg=slider('Risk aversion γ',1,10,.1,gamma,v=>{gamma=v;if(linked)f=1/v;draw();});
    const sf=slider('Kelly fraction f',0,1,.01,f,v=>{f=v;linked=false;link.checked=false;draw();});
    const link=el('input',{type:'checkbox',checked:'checked',onchange:()=>{linked=link.checked;if(linked)f=1/gamma;draw();}});
    controls.append(el('fieldset',{},[el('legend',{text:'Beliefs and market prices'}),...mSl.map(x=>x.node),...qSl.map(x=>x.node)]),el('fieldset',{},[el('legend',{text:'Two ways to reduce exposure'}),sg.node,sf.node,el('label',{class:'pt-check'},[link,' Link f = 1/γ']),el('div',{class:'pt-actions'},[btn('Book example',()=>{m=[.6,.3,.1];q=[.5,.3,.2];draw();}),btn('A zero-belief state',()=>{m=[.7,.3,0];q=[.5,.3,.2];draw();})])]));
    root.append(controls,charts,read);
    function draw(){mSl.forEach((s,i)=>s.set(m[i]));qSl.forEach((s,i)=>s.set(q[i]));sg.set(gamma);sf.set(f);const U=crra(m,q,gamma),F=fractional(m,q,f);clear(charts);clear(read);
      charts.append(legend([{label:'Belief Pᴹ',tone:'belief'},{label:'Market Pʸ',tone:'market'},{label:'Fractional Kelly · filled',tone:'payoff'},{label:'CRRA · outline',tone:'payoff',dash:true}]),bars(root,names,[{values:m,tone:'belief'},{values:q,tone:'market'},{values:F,tone:'payoff'},{values:U,tone:'payoff',outline:true}],'State probabilities for beliefs, market, fractional Kelly and CRRA'));
      const {s,w}=svg(root,265,'Three-state simplex: arithmetic fractional Kelly segment and geometric CRRA curve'),v=[[35,214],[w-35,214],[w/2,28]],pos=p=>[dot(p,v.map(a=>a[0])),dot(p,v.map(a=>a[1]))];
      svgEl('polygon',{points:v.map(p=>p.join(',')).join(' '),fill:'none',stroke:'var(--lrw-rule,#ccc)','stroke-width':1.5},s);
      const curve=[];for(let i=1;i<=100;i++)curve.push(pos(crra(m,q,100/i)));const supported=normalize(q.map((x,i)=>m[i]>0?x:0));curve.unshift(pos(supported));
      svgEl('polyline',{points:curve.map(p=>p.join(',')).join(' '),fill:'none',stroke:colors.payoff,'stroke-width':2.5,'stroke-dasharray':'5 4'},s);
      svgEl('line',{x1:pos(q)[0],y1:pos(q)[1],x2:pos(m)[0],y2:pos(m)[1],stroke:colors.payoff,'stroke-width':2},s);
      [[q,'market',5],[m,'belief',5],[F,'payoff',7],[U,'payoff',4]].forEach(([p,t,r],i)=>svgEl('circle',{cx:pos(p)[0],cy:pos(p)[1],r,fill:i===2?'var(--pt-bg,#fff)':colors[t],stroke:colors[t],'stroke-width':2},s));
      v.forEach((p,i)=>svgEl('text',{x:p[0],y:p[1]+(i===2?-10:22),'text-anchor':'middle',text:names[i],class:'pt-axis'},s));charts.append(s,notice('Simplex: the solid segment is fractional Kelly; the dashed curve is CRRA. The open ring and filled dot show the selected positions. Each corner puts all probability on one outcome.'));
      const util=p=>sum(m.map((a,i)=>a===0?0:a*(gamma===1?Math.log(p[i]/q[i]):(Math.pow(p[i]/q[i],1-gamma)-1)/(1-gamma))));
      read.append(table(['Measure','Kelly','Fractional','CRRA'],[
        ['Expected log growth',fmt(kl(m,q)),fmt(growth(m,F,q)),fmt(growth(m,U,q))],
        ['KL mismatch',fmt(0),fmt(kl(m,F)),fmt(kl(m,U))],
        ['Minimum gross payoff',fmt(Math.min(...m.map((x,i)=>x/q[i]))),fmt(Math.min(...F.map((x,i)=>x/q[i]))),fmt(Math.min(...U.map((x,i)=>x/q[i])))],
        ['Expected CRRA utility',fmt(util(m)),fmt(util(F)),fmt(util(U))]],'Each portfolio starts from one unit of the reference asset.'));
      read.append(table(['Outcome','Belief','Market','Fractional payoff','CRRA payoff'],names.map((n,i)=>[n,fmt(m[i],3),fmt(q[i],3),fmt(F[i]/q[i]),fmt(U[i]/q[i])])));
      read.append(notice(`Fractional Kelly guarantees a gross payoff of at least 1 − f = ${fmt(1-f,3)}. CRRA maximizes the displayed expected utility at γ = ${fmt(gamma,1)}; its displayed minimum is specific to these three states.`));
      if(m.some(x=>x===0))read.append(notice('A zero in Pᴹ stays zero under CRRA for every finite γ. As γ tends to infinity, CRRA approaches the market distribution conditioned on the support of Pᴹ. A cash reserve can still assign weight to the omitted state.'));
    }draw();watch(root,draw);
  }
  function meanVariance(root){
    const q=[.3,.4,.3],a=[.6,.3,.1],target=[.5,.35,.15],names=['1','2','3'];let strength=1,w=.5;
    const controls=el('div',{class:'pt-controls'}),chart=el('div'),read=el('div');
    const ss=slider('Belief strength',0,1,.01,strength,v=>{strength=v;draw();},'belief'),sw=slider('Cost weight w in X',0,1,.01,w,v=>{w=v;draw();});controls.append(ss.node,sw.node);root.append(controls,chart,read);
    function draw(){const m=fractional(target,q,strength),P=[q,a],get=x=>mix(P,[1-x,x]),g=x=>growth(m,get(x),q),j=x=>stats(m,get(x),q).quadratic,t=x=>stats(m,get(x),q).taylor;const best=[oneDim(g),oneDim(t),oneDim(j)],series=[{label:'Exact log growth',tone:'payoff',fn:g},{label:'Ordinary Taylor under Pᴹ',tone:'belief',fn:t,dash:true},{label:'Mixed quadratic with Pʸ risk',tone:'market',fn:j,dash:true}];clear(chart);clear(read);sw.set(w);
      chart.append(legend(series),lineChart(root,series.map(s=>({...s,points:Array.from({length:101},(_,i)=>[i/100,s.fn(i/100)])})),[{x:w,y:g(w),tone:'payoff'}],'Exact log growth and two quadratic approximations'));
      const acts=el('div',{class:'pt-actions'});series.forEach((s,i)=>acts.append(btn('Use '+['log optimum','Taylor optimum','mixed optimum'][i],()=>{w=best[i];draw();})));read.append(acts);
      read.append(table(['Objective','At selected w','Best w in [0,1]'],series.map((s,i)=>[s.label,fmt(s.fn(w)),fmt(best[i])])));
      const p=get(w),st=stats(m,p,q);read.append(table(['State','Pᴹ','Pʸ','Pˣ','Portfolio payoff'],names.map((n,i)=>[n,fmt(m[i],3),fmt(q[i],3),fmt(a[i],3),fmt(p[i]/q[i])])));
      read.append(notice(`Information ${fmt(kl(m,q))} − mismatch ${fmt(kl(m,p))} = exact growth ${fmt(g(w))}. Expected excess return: ${fmt(st.mu)}. Standard deviation under Pᴹ: ${fmt(Math.sqrt(st.variance))}. All optima here obey 0 ≤ w ≤ 1.`));
    }draw();watch(root,draw);
  }
  function mixture(root){
    let names=['1','2','3'],q=[1/3,1/3,1/3],m=[.5,1/6,1/3],assets=[[.5,1/3,1/6]],w=[.5,.5],kind='kl',gamma=1,certificate=null;
    const editor=el('div'),controls=el('div',{class:'pt-controls'}),weightUI=el('div'),chart=el('div'),read=el('div'),message=el('p',{class:'pt-status',role:'status','aria-live':'polite'});let fields=[],weightSliders=[];
    function preset(type){if(type==='book'){q=[1/3,1/3,1/3];m=[.5,1/6,1/3];assets=[[.5,1/3,1/6]];}else if(type==='football'){q=[.5,.3,.2];m=[.6,.3,.1];assets=[[1,0,0]];}else if(type==='four'){q=[.2,.3,.3,.2];m=[.12,.18,.35,.35];assets=[[.4,.3,.2,.1],[.1,.2,.3,.4],[.1,.4,.4,.1]];}else {if(q.length>8){message.textContent='The state-claim preset supports up to eight states. Reduce the state count or enter your chosen asset menu.';return;}assets=q.map((_,i)=>q.map((__,j)=>i===j?1:0));}names=type==='football'?['Win','Draw','Loss']:q.map((_,i)=>String(i+1));w=[q,...assets].map(()=>1/(assets.length+1));certificate=null;edit();draw();}
    const objectiveSelect=select('Optimization objective',[['kl','Exact KL / log growth'],['quadratic','Pearson quadratic (Pʸ risk)'],['mv','Mean–variance (Pᴹ risk)']],kind,v=>{kind=v;certificate=null;draw();});
    const risk=slider('Mean–variance penalty γ',.25,10,.25,gamma,v=>{gamma=v;certificate=null;draw();});
    controls.append(objectiveSelect,risk.node,btn('Find the best mixture',()=>{const result=optimize([q,...assets],m,q,kind,gamma);w=result.w;certificate=result;draw();}));
    root.append(el('div',{class:'pt-actions'},[btn('Columbia: Win claim + cash',()=>preset('football')),btn('Book: incomplete market',()=>preset('book')),btn('Four-state asset menu',()=>preset('four')),btn('Add all state claims',()=>preset('complete'))]),editor,message,controls,weightUI,chart,read);
    function edit(){clear(editor);fields=[];const rows=[['Market Pʸ',q],['Belief Pᴹ',m],...assets.map((p,j)=>['Asset '+(j+1),p])];
      const tbody=el('tbody');rows.forEach(([name,p],r)=>{const inputs=p.map((x,i)=>el('input',{type:'number',min:0,step:'any',value:Number(x.toPrecision(7)),'aria-label':name+', state '+(i+1),class:'pt-cell-input'}));fields.push(inputs);tbody.append(el('tr',{},[el('th',{scope:'row',text:name}),...inputs.map(n=>el('td',{},[n]))]));});
      editor.append(el('div',{class:'pt-table-wrap'},[el('table',{},[el('caption',{text:'Enter probabilities or nonnegative weights. Apply normalizes each row to sum to one.'}),el('thead',{},[el('tr',{},[el('th',{scope:'col',text:'Distribution'}),...names.map(x=>el('th',{scope:'col',text:'State '+x}))])]),tbody])]));
      const apply=()=>{try{const vals=fields.map(row=>row.map(n=>n.value.trim()===''?NaN:Number(n.value)));if(vals[0].some(x=>!(x>0)))throw Error('Every market state price must be strictly positive.');const ps=vals.map(normalize);q=ps[0];m=ps[1];assets=ps.slice(2);certificate=null;w=[q,...assets].map(()=>1/(assets.length+1));message.textContent='Applied. Every row has been normalized; cost weights start equally across cash and the assets.';edit();draw();return true;}catch(e){message.textContent=e.message;return false;}};
      editor.append(el('div',{class:'pt-actions'},[btn('Apply distributions',apply),btn('Add asset',()=>{if(assets.length>=8){message.textContent='The lab supports up to eight asset distributions plus cash.';return;}if(!apply())return;assets.push(q.slice());w=[q,...assets].map(()=>1/(assets.length+1));edit();draw();}),btn('Remove last asset',()=>{if(assets.length<=1){message.textContent='Keep at least one asset besides cash.';return;}if(!apply())return;assets.pop();w=[q,...assets].map(()=>1/(assets.length+1));edit();draw();}),btn('Add state',()=>{if(q.length>=12){message.textContent='The lab supports up to twelve states.';return;}if(!apply())return;const n=q.length;[q,m,...assets].forEach(p=>{p.forEach((x,i)=>p[i]=x*n/(n+1));p.push(1/(n+1));});names=q.map((_,i)=>String(i+1));edit();draw();}),btn('Remove last state',()=>{if(q.length<=2){message.textContent='Keep at least two states.';return;}if(!apply())return;const rows=[q,m,...assets].map(p=>p.slice(0,-1));if(rows.some(p=>sum(p)<=0)){message.textContent='Cannot remove a state that holds all the mass of a distribution.';return;}[q,m,...assets].forEach(p=>{p.pop();const n=sum(p);p.forEach((x,i)=>p[i]=x/n);});names=q.map((_,i)=>String(i+1));edit();draw();})]));
    }
    function draw(){clear(chart);clear(read);risk.node.hidden=kind!=='mv';
      const P=[q,...assets],p=mix(P,w),st=stats(m,p,q);
      if(weightSliders.length!==w.length){clear(weightUI);weightUI.append(el('h3',{text:'Portfolio cost weights'}));const weightGrid=el('div',{class:'pt-controls'});weightSliders=w.map((v,j)=>{const s=slider(j===0?'Cash / reference asset':'Asset '+j,0,1,.01,v,x=>{w=simplexSet(w,j,x);certificate=null;draw();});weightGrid.append(s.node);return s;});weightUI.append(weightGrid);}weightSliders.forEach((s,j)=>s.set(w[j]));
      chart.append(legend([{label:'Market Pʸ',tone:'market'},{label:'Belief Pᴹ',tone:'belief'},{label:'Mixture Pⱽ',tone:'payoff'}]),bars(root,names,[{values:q,tone:'market'},{values:m,tone:'belief'},{values:p,tone:'payoff'}],'Market, belief and implemented portfolio distributions'));
      read.append(table(['Quantity','Value'],[['Information D(Pᴹ∥Pʸ)',fmt(kl(m,q))],['Mismatch D(Pᴹ∥Pⱽ)',fmt(kl(m,p))],['Exact expected log growth',fmt(growth(m,p,q))],['Expected excess return under Pᴹ',fmt(st.mu)],['Standard deviation under Pᴹ',fmt(Math.sqrt(st.variance))],['Selected objective',fmt(objective(kind,m,p,q,gamma))]],'Information minus mismatch is exact expected log growth.'));
      read.append(table(['State','Pᴹ','Pⱽ','Gross payoff'],names.map((n,i)=>[n,fmt(m[i],4),fmt(p[i],4),fmt(p[i]/q[i],4)])));
      if(certificate)read.append(notice(`Solver: ${certificate.gap<1e-7?'converged':'stopped at numerical limit'}. The remaining objective gap is at most ${certificate.gap<1e-7?certificate.gap.toExponential(2):fmt(certificate.gap,7)} under the concave simplex problem (${certificate.iterations} transfers). ${kind==='kl'?'The certificate is in nats of expected log growth.':'The certificate uses the selected quadratic objective, not nats.'} The implemented distribution can be unique even when several weight vectors produce it.`));
      else read.append(notice('Move a weight to explore; the other weights rescale to keep the total at one. Click “Find the best mixture” to solve for the selected objective. Edited distribution cells take effect after “Apply distributions”.'));
    }edit();draw();watch(root,draw);
  }
  function options(root){
    const S=[60,80,100,120,160],q=[.1,.2,.4,.2,.1],m=[.05,.15,.35,.3,.15];let strike=100,type='call',reserve=0;
    const control=el('div',{class:'pt-controls'}),charts=el('div'),read=el('div');control.append(select('Payoff shape',[['call','Call'],['put','Put'],['straddle','Straddle'],['digital','Digital call']],type,v=>{type=v;draw();}),slider('Strike K',60,150,1,strike,v=>{strike=v;draw();},'asset').node,slider('Cash reserve fraction',0,1,.01,reserve,v=>{reserve=v;draw();},'market').node);root.append(control,charts,read);
    function draw(){const H=S.map(s=>type==='call'?Math.max(s-strike,0):type==='put'?Math.max(strike-s,0):type==='straddle'?Math.abs(s-strike):(s>strike?1:0)),price=dot(q,H);clear(charts);clear(read);if(price<=0){read.append(notice('This payoff is zero in every modeled state, so its price is zero and it does not induce a probability distribution. Move the strike or choose a different payoff.'));return;}
      const c=q.map((x,i)=>x*H[i]/price),v=fractional(c,q,1-reserve);
      charts.append(legend([{label:'Market Pʸ',tone:'market'},{label:'Option Pᶜ · outline',tone:'payoff',dash:true},{label:'Option + cash Pⱽ',tone:'payoff'}]),bars(root,S.map(String),[{values:q,tone:'market'},{values:c,tone:'payoff',outline:true},{values:v,tone:'payoff'}],'The option weights market probabilities by its payoff; cash fills zero-payoff states'));
      read.append(table(['Terminal S','Payoff H','Pᶜ','Portfolio return'],S.map((s,i)=>[s,fmt(H[i],2),fmt(c[i],4),fmt(v[i]/q[i],3)])));
      read.append(notice(`Option price Eʸ[H] = ${fmt(price,3)} in reference-asset units. The portfolio invests ${fmt(100*(1-reserve),1)}% of its initial cost in the option and the rest in cash. Its expected log growth under Pᴹ = (0.05, 0.15, 0.35, 0.30, 0.15) is ${fmt(growth(m,v,q))}.`));
      if(growth(m,v,q)===-Infinity)read.append(notice('Expected log growth is −∞ because the investor assigns positive probability to a state with zero total payoff. Add a cash reserve to give the total portfolio a positive floor.'));
    }draw();watch(root,draw);
  }
  const mounts={utility,'mean-variance':meanVariance,mixture,options};
  function init(){document.querySelectorAll('[data-portfolio-tool]').forEach(root=>{if(root.dataset.portfolioMounted)return;const fn=mounts[root.getAttribute('data-portfolio-tool')];if(!fn)return;root.dataset.portfolioMounted='true';root.classList.add('pt-lab');clear(root);try{fn(root);}catch(e){root.append(notice('The calculator could not load. Please reload the page.'));console.error(e);}});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
