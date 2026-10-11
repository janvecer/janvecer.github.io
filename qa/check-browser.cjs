#!/usr/bin/env node
/* Run after `quarto render`: node qa/check-browser.cjs [output-directory]
   Requires Playwright: npm install --no-save playwright && npx playwright install chromium */
'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),{createRequire}=require('module');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,process.argv[2]||'docs');
const widgetSelector='[data-lrw], [data-discrete-model], [data-continuous-model], [data-portfolio-tool], [data-entropy-lab], [data-normal-options], [data-hedging-lab], [data-hedging-comparison]';
const controlSelector=control=>widgetSelector.split(', ').map(selector=>`${selector} ${control}`).join(', ');
const widgetScreenshotStyle='#quarto-header, .quarto-secondary-nav { opacity: 0 !important; }';
function playwright(){try{return require('playwright');}catch(e){if(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)return createRequire(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright','package.json'))('playwright');throw Error('Playwright is missing. Run npm install --no-save playwright, then npx playwright install chromium.');}}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()&& !['site_libs'].includes(e.name)&&!e.name.endsWith('_files')?walk(path.join(dir,e.name)):e.isFile()?[path.join(dir,e.name)]:[]);}
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff':'font/woff','.woff2':'font/woff2','.json':'application/json'};
(async()=>{
 if(!fs.existsSync(out))throw Error(`Rendered output absent: ${out}. Run quarto render first.`);
 const pages=walk(out).filter(f=>f.endsWith('.html')).map(f=>path.relative(out,f).split(path.sep).join('/')).filter(f=>!process.env.QA_PAGES||process.env.QA_PAGES.split(',').includes(f));
 const viewports=process.env.QA_WIDTHS?process.env.QA_WIDTHS.split(',').map(Number):[390,1024,1440];
 if(!pages.length)throw Error('No rendered HTML pages found.');
 const server=http.createServer((req,res)=>{let target;try{const uri=decodeURIComponent(new URL(req.url,'http://localhost').pathname);target=path.resolve(out,'.'+uri);if(!target.startsWith(out+path.sep)&&target!==out)throw Error('Outside output');if(fs.statSync(target).isDirectory())target=path.join(target,'index.html');const data=fs.readFileSync(target);res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream'});res.end(data);}catch(e){res.writeHead(404);res.end('Not found');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;const results=[],failures=[];const screenshots=path.join(root,'qa','screenshots');fs.mkdirSync(screenshots,{recursive:true});
 try{
  browser=await playwright().chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const origin=`http://127.0.0.1:${server.address().port}`;
  for(const width of viewports)for(const pageName of pages){
   const page=await browser.newPage({viewport:{width,height:1000},deviceScaleFactor:1});const errors=[],requests=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(origin))requests.push(`${r.status()} ${r.url()}`);});page.on('requestfailed',r=>requests.push(`${r.failure()?.errorText} ${r.url()}`));
   await page.goto(`${origin}/${pageName}`,{waitUntil:'networkidle'});
   await page.evaluate(async()=>{await Promise.all([...document.images].map(el=>{el.loading='eager';return el.decode().catch(()=>{});}));if(window.MathJax?.startup?.promise)await window.MathJax.startup.promise;if(document.fonts?.ready)await document.fonts.ready;});
   const initial=await inspect(page);
   const requiredMounts={'likelihood/hedging-comparison.html':'[data-hedging-comparison]','likelihood/options.html':'[data-normal-options]','likelihood/hedging.html':'[data-hedging-lab]','likelihood/relative-entropy.html':'[data-entropy-lab]'};
   if(requiredMounts[pageName]&&await page.locator(requiredMounts[pageName]).count()!==1)errors.push(`Missing expected interactive mount ${requiredMounts[pageName]}`);
   const interactions=[];
   for(const slider of await page.locator(controlSelector('input[type=range]')).all()){
    const state=await slider.evaluate(el=>({min:Number(el.min),max:Number(el.max),initial:Number(el.value),step:Number(el.step)||1,label:el.closest('.lrw-ctl')?.textContent?.trim()||el.id}));
    for(const fraction of [.2,.8]){const val=state.min+(state.max-state.min)*fraction;await slider.evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},val);const invalid=await nonfiniteSVG(page);if(invalid.length)errors.push(`Slider ${state.label}: nonfinite SVG ${invalid.join(', ')}`);}
    interactions.push(state.label);await slider.evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},state.initial);
   }
   const selects=[];
   for(const select of await page.locator(controlSelector('select')).all()){
    const state=await select.evaluate(el=>({initial:el.value,label:el.getAttribute('aria-label')||el.id||el.name,values:[...el.options].filter(option=>!option.disabled).map(option=>option.value)}));
    for(const value of state.values){await select.selectOption(value);const invalid=await nonfiniteSVG(page);if(invalid.length)errors.push(`Select ${state.label}=${value}: nonfinite SVG ${invalid.join(', ')}`);}
    await select.selectOption(state.initial);selects.push(state.label);
   }
   for(const pathButton of await page.getByRole('button',{name:/Draw new paths|Generate new paths|New paths/i}).all()){const panel=page.locator('main');const before=await panel.innerHTML();await pathButton.click();const after=await panel.innerHTML();if(before===after)errors.push('New paths button did not change the panel');}
   for(const callout of await page.locator('.callout-header[data-bs-toggle=collapse]').all())if(await callout.getAttribute('aria-expanded')==='false')await callout.click();
   await page.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});
   if(await page.locator('[data-entropy-lab]').count())await testEntropy(page,errors,width,screenshots);
   if(await page.locator('[data-normal-options]').count())await testOptions(page,errors,width,screenshots);
   if(await page.locator('[data-hedging-lab]').count())await testHedging(page,errors,width,screenshots);
   if(pageName==='likelihood/negative-binomial.html')await page.locator('[data-discrete-model]').screenshot({path:path.join(screenshots,`negative-binomial-widget-${width}.png`),style:widgetScreenshotStyle});
   if(pageName==='likelihood/index.html'){await testSearch(page,errors);if(width<992)await testChapterMenu(page,errors);}
   const final=await inspect(page);
   if(pageName.startsWith('likelihood/')&&Math.abs(initial.readingColumn.centerOffset)>1)errors.push(`Reading column is off center by ${initial.readingColumn.centerOffset.toFixed(2)} px`);
   if(initial.documentOverflow||final.documentOverflow)errors.push('Document has horizontal overflow');
   for(const inspection of [initial,final]){if(inspection.unmounted.length)errors.push(`Unmounted widgets: ${inspection.unmounted.join(', ')}`);if(inspection.equationOverflow.length)errors.push(`Equations exceed content width: ${inspection.equationOverflow.join(', ')}`);if(inspection.tableOverflow.length)errors.push(`Tables exceed viewport: ${inspection.tableOverflow.join(', ')}`);if(inspection.nonfiniteSVG.length)errors.push(`Nonfinite SVG: ${inspection.nonfiniteSVG.join(', ')}`);if(inspection.unrenderedMath)errors.push(`${inspection.unrenderedMath} math elements are not typeset`);if(inspection.mathErrors.length)errors.push(`Mathematical typesetting errors: ${inspection.mathErrors.join(', ')}`);if(inspection.brokenImages.length)errors.push(`Broken images: ${inspection.brokenImages.join(', ')}`);}
   await page.evaluate(()=>window.scrollTo(0,0));
   if(['index.html','likelihood/binomial.html','likelihood/index.html','likelihood/relative-entropy.html','likelihood/options.html','likelihood/hedging.html','likelihood/negative-binomial.html','likelihood/hedging-comparison.html','likelihood/bayesian-learning.html','resources.html'].includes(pageName))await page.screenshot({path:path.join(screenshots,`${pageName.replace(/\//g,'-')}-${width}.png`),fullPage:true});
   const result={page:pageName,width,widgets:initial.widgets,sliderCount:interactions.length,selectCount:selects.length,readingColumn:initial.readingColumn,errors:[...new Set(errors)],requests:[...new Set(requests)],overflow:initial.overflow};results.push(result);if(result.errors.length||result.requests.length)failures.push(result);
   console.log(`${result.errors.length||result.requests.length?'FAIL':'PASS'} ${width} ${pageName} (${initial.widgets} widgets, ${interactions.length} sliders)`);if(result.errors.length||result.requests.length)console.log(JSON.stringify({errors:result.errors,requests:result.requests}));await page.close();
  }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
 const report={created:new Date().toISOString(),outputDirectory:out,viewports,pages:pages.length,results,failures};fs.writeFileSync(path.join(root,'qa',process.env.QA_REPORT||'browser-report.json'),JSON.stringify(report,null,2));if(failures.length)process.exitCode=1;
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
async function inspect(page){return page.evaluate(widgetSelector=>{
 const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
 const containedOverflow=el=>{for(let parent=el.parentElement;parent&&parent.tagName!=='MAIN';parent=parent.parentElement)if(['auto','scroll','hidden','clip'].includes(getComputedStyle(parent).overflowX))return true;return false;};
 const widgets=[...document.querySelectorAll(widgetSelector)];const main=document.querySelector('main')||document.body;const r=main.getBoundingClientRect();
 return {widgets:widgets.length,readingColumn:{left:r.left,right:r.right,width:r.width,centerOffset:(r.left+r.right-innerWidth)/2},documentOverflow:document.documentElement.scrollWidth>innerWidth+2,overflow:[...document.querySelectorAll('body *')].filter(el=>visible(el)&&el.getBoundingClientRect().right>innerWidth+2).slice(0,8).map(el=>`${el.tagName}.${el.className?.baseVal||el.className}`),unmounted:widgets.filter(el=>!el.querySelector('svg')||el.textContent.includes('could not be drawn')||el.textContent.trim()==='Interactive figure. It needs JavaScript.').map(el=>el.dataset.lrw||el.dataset.discreteModel||el.dataset.continuousModel||el.dataset.portfolioTool||el.dataset.entropyLab||el.dataset.normalOptions||el.dataset.hedgingLab||'interactive lab'),equationOverflow:[...document.querySelectorAll('.math.display,mjx-container[display="true"]')].filter(el=>visible(el)&&(el.getBoundingClientRect().width>main.getBoundingClientRect().width+2||el.scrollWidth>el.clientWidth+2)).map(el=>el.textContent?.trim().slice(0,80)||'display equation'),tableOverflow:[...document.querySelectorAll('main table')].filter(el=>visible(el)&&el.getBoundingClientRect().right>innerWidth+2&&!containedOverflow(el)).map(el=>el.textContent.trim().slice(0,80)),nonfiniteSVG:[...document.querySelectorAll('svg,svg *')].flatMap(el=>[...el.attributes].filter(a=>/\b(?:NaN|Infinity)\b/.test(a.value)).map(a=>`${el.tagName}.${a.name}`)),mathErrors:[...document.querySelectorAll('mjx-merror,[data-mjx-error]')].map(el=>el.textContent||el.getAttribute('data-mjx-error')),unrenderedMath:[...document.querySelectorAll('.math')].filter(el=>el.textContent.includes('\\')&&!el.querySelector('mjx-container,.katex,svg')&&!el.closest('mjx-container,.katex')).length,brokenImages:[...document.images].filter(el=>!el.complete||!el.naturalWidth).map(el=>el.src)};
 },widgetSelector);}
async function nonfiniteSVG(page){return page.evaluate(()=>[...document.querySelectorAll('svg,svg *')].flatMap(el=>[...el.attributes].filter(a=>/\b(?:NaN|Infinity)\b/.test(a.value)).map(a=>`${el.tagName}.${a.name}`)));}
async function testSearch(page,errors){
 try{
  await page.locator('#quarto-search .aa-DetachedSearchButton').click();
  const input=page.locator('.aa-DetachedContainer input.aa-Input');await input.waitFor({state:'visible'});await input.fill('normal');
  await page.waitForFunction(()=>[...document.querySelectorAll('.aa-Item')].some(el=>/normal/i.test(el.textContent)),null,{timeout:10000});
  const layout=await page.evaluate(()=>{const el=document.querySelector('.aa-DetachedContainer');const r=el.getBoundingClientRect();return{left:r.left,right:r.right,overflow:document.documentElement.scrollWidth>innerWidth+2};});
  if(layout.left< -2||layout.right>await page.evaluate(()=>innerWidth+2)||layout.overflow)errors.push('Search overlay exceeds viewport');
  await input.press('Escape');
 }catch(e){errors.push(`Search interaction: ${e.message.split('\n')[0]}`);await page.keyboard.press('Escape');}
}
async function testChapterMenu(page,errors){
 try{
  const toggle=page.getByRole('button',{name:'Toggle sidebar navigation',exact:true});await toggle.click();
  await page.waitForFunction(()=>document.querySelector('#quarto-sidebar')?.classList.contains('show'));
  const option=page.locator('#quarto-sidebar a[href$="options.html"]');
  await option.evaluate(el=>{for(let p=el.parentElement;p&&p.id!=='quarto-sidebar';p=p.parentElement){if(p.classList.contains('collapse'))p.classList.add('show');}});
  if(!await option.isVisible())errors.push('Mobile chapter menu did not reveal the options page after opening its section');
  await toggle.click();await page.waitForFunction(()=>!document.querySelector('#quarto-sidebar')?.classList.contains('show'));
 }catch(e){errors.push(`Mobile chapter menu: ${e.message.split('\n')[0]}`);}
}
async function testOptions(page,errors,width,screenshots){
 const host=page.locator('[data-normal-options]');const contract=host.locator('[data-input=type]');
 const set=async(key,value)=>host.locator(`[data-input=${key}]`).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
 for(const type of ['call','put','digital','straddle']){
  await contract.selectOption(type);
  for(const strike of [70,130])for(const sigma of [.15,.45])for(const time of [.5,3]){
   await set('strike',strike);await set('sigma',sigma);await set('time',time);
   const price=Number(await host.locator('[data-metric=price]').textContent());
   if(!(price>0&&Number.isFinite(price)))errors.push(`Option ${type}, K=${strike}, sigma=${sigma}, T=${time}: invalid price`);
   if(await host.locator('.no-density path.no-line').count()!==3)errors.push(`Option ${type}: expected market, asset and option density curves`);
   const invalid=await nonfiniteSVG(page);if(invalid.length)errors.push(`Option ${type} boundary: nonfinite SVG ${invalid.join(', ')}`);
  }
 }
 await contract.selectOption('call');await set('strike',100);await set('sigma',.25);await set('time',1);
 if(Math.abs(Number(await host.locator('[data-metric=price]').textContent())-9.948)>.00051)errors.push('Option default call price does not match Black–Scholes benchmark');
 await set('reserve',.8);
 if(!await host.locator('[data-mixture-key]').isVisible()||await host.locator('.no-density path.no-line-v').count()!==1)errors.push('Option reserve did not display its mixture density');
 await host.screenshot({path:path.join(screenshots,`options-widget-${width}.png`),style:widgetScreenshotStyle});await set('reserve',0);
}
async function testHedging(page,errors,width,screenshots){
 const host=page.locator('[data-hedging-lab]');
 const set=async(key,value)=>host.locator(`[data-name=${key}]`).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
 const metric=async key=>Number.parseFloat(await host.locator(`[data-result=${key}]`).textContent());
 const before=await metric('kl');await host.locator('[data-action=fit]').click();
 if(await metric('kl')>before+1e-7||await host.locator('[data-result=kl]').textContent()!==await host.locator('[data-result=best]').textContent())errors.push('Hedging fit did not reach the displayed optimum');
 await set('strike',120);
 if(await host.locator('[data-result=kl]').textContent()!==await host.locator('[data-result=best]').textContent())errors.push('Hedging automatic fit did not follow a changed strike');
 await set('w',0);
 if(!(await host.locator('[data-status]').textContent()).includes('set manually'))errors.push('Hedging manual weight did not disable automatic fitting');
 await host.locator('[data-action=call]').click();
 if(Number(await host.locator('[data-name=reserve]').inputValue())!==0||Number(await host.locator('[data-name=w]').inputValue())!==1||!(await host.locator('[data-status]').textContent()).includes('positivity constraint'))errors.push('Call-only hedge did not explain its all-stock positivity boundary');
 await host.locator('[data-action=protected]').click();
 if(await host.locator('[data-name=reserve]').inputValue()!==await host.locator('[data-name=strike]').inputValue())errors.push('Protected-call preset did not set reserve equal to strike');
 for(const reserve of [0,150])for(const step of [0,5])for(const high of [false,true]){
  await set('reserve',reserve);await set('step',step);await set('strike',high?120:80);await set('sigma',high?.45:.15);await set('tau',high?2:.25);
  if(!Number.isFinite(await metric('kl'))||await metric('kl')<0||!Number.isFinite(await metric('best'))||await metric('best')<0)errors.push('Hedging boundary produced invalid KL readout');
  const invalid=await nonfiniteSVG(page);if(invalid.length)errors.push(`Hedging boundary: nonfinite SVG ${invalid.join(', ')}`);
 }
 await host.locator('[data-action=reset]').click();
 if(Number(await host.locator('[data-name=reserve]').inputValue())!==110||Number(await host.locator('[data-name=w]').inputValue())!==.7)errors.push('Hedging reset failed');
 await host.screenshot({path:path.join(screenshots,`hedging-widget-${width}.png`),style:widgetScreenshotStyle});
}

async function testEntropy(page,errors,width,screenshots){
 const host=page.locator('[data-entropy-lab]');
 const p=host.locator('input[data-prob=p]'),q=host.locator('input[data-prob=q]'),swap=host.locator('[data-preset=swap]');
 const set=async(el,v)=>el.evaluate((n,x)=>{n.value=String(x);n.dispatchEvent(new Event('input',{bubbles:true}));},v);
 const forward=()=>host.locator('[data-metric=forward]').textContent();
 async function geometry(state){
  const issue=await host.evaluate(el=>({overflow:document.documentElement.scrollWidth>innerWidth+2,bad:[...el.querySelectorAll('svg,svg *')].flatMap(n=>[...n.attributes].filter(a=>/\b(?:NaN|Infinity)\b/.test(a.value)).map(a=>n.tagName+'.'+a.name+'='+a.value))}));
  if(issue.overflow)errors.push(`Entropy ${state}: document overflow`);if(issue.bad.length)errors.push(`Entropy ${state}: nonfinite SVG ${issue.bad.join(', ')}`);
 }
 for(const pv of [0,1])for(const qv of [.01,.99]){
  await set(p,pv);await set(q,qv);
  if(!await swap.isDisabled())errors.push(`Entropy p=${pv}: swap must be disabled`);
  const f=Number.parseFloat(await forward()),expected=-Math.log(pv===1?qv:1-qv);
  if(!Number.isFinite(f)||Math.abs(f-expected)>0.000051)errors.push(`Entropy boundary p=${pv},q=${qv}: incorrect forward display`);
  if(!(await host.locator('[data-metric=reverse]').textContent()).includes('∞')||!(await host.locator('[data-metric=market-log]').textContent()).includes('−∞'))errors.push('Entropy zero-payoff boundary: infinite reverse/market displays missing');
  await geometry(`p=${pv},q=${qv}`);
 }
 await host.locator('[data-preset=same]').click();
 if(Number(await p.inputValue())!==.5||Number(await q.inputValue())!==.5||Number.parseFloat(await forward())!==0||await swap.isDisabled())errors.push('Entropy Same model preset failed');
 await geometry('same');
 await host.locator('[data-preset=strong]').click();
 const beforeForward=await forward(),beforeReverse=await host.locator('[data-metric=reverse]').textContent();
 if(Number(await p.inputValue())!==.8||Number(await q.inputValue())!==.3)errors.push('Entropy Stronger disagreement preset failed');
 await geometry('strong');await swap.click();
 if(Number(await p.inputValue())!==.3||Number(await q.inputValue())!==.8||(await forward())!==beforeReverse||(await host.locator('[data-metric=reverse]').textContent())!==beforeForward)errors.push('Entropy swapping did not exchange distributions and divergences');
 await geometry('swap');
 await host.locator('[data-preset=small]').click();
 const contribution=await host.locator('tbody tr').last().locator('td').allTextContents();
 if(contribution.length!==2||Number.parseFloat(contribution[1].replace('−','-'))>=0||Math.abs(Number.parseFloat(await forward())-.0201)>1e-6)errors.push('Entropy small example missing negative contribution or expected KL');
 await geometry('small');
 await host.screenshot({path:path.join(screenshots,`entropy-widget-${width}.png`),style:widgetScreenshotStyle});
}
