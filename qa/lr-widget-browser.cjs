const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright');
const root = path.join(__dirname, '..');
const out = process.env.QA_OUTPUT || '/tmp/lr-widget-qa';
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
  const reports=[];
  for (const width of [320,390,1280]) {
    const page=await browser.newPage({viewport:{width,height:1000}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main>'+['three-state','payoff-first','binomial-step','binomial-growth','binomial-time'].map(n=>`<section data-lrw="${n}"></section>`).join('')+'</main></body></html>');
    await page.addStyleTag({content:'html{font-size:16px}body{margin:16px;color:#26313d;font-family:Arial,sans-serif}main{max-width:800px;margin:auto}section{margin:2rem 0}p{line-height:1.5}'});
    await page.addStyleTag({path:path.join(root,'likelihood/lr-widgets.css')});
    await page.addScriptTag({path:path.join(root,'likelihood/lr-widgets.js')});
    assert.equal(await page.locator('[data-lrw-mounted="1"]').count(),5);
    assert.equal(await page.locator('.lrw-marker-lane').count(),6);
    const initial=await page.evaluate(()=>({vw:innerWidth,sw:document.documentElement.scrollWidth,
      overflowingText:[...document.querySelectorAll('.lrw-chart svg text')].map(t=>{
        const b=t.getBoundingClientRect(),s=t.ownerSVGElement.getBoundingClientRect();
        return {text:t.textContent,left:b.left-s.left,right:b.right-s.right,top:b.top-s.top,bottom:b.bottom-s.bottom};
      }).filter(x=>x.left < -1 || x.right > 1 || x.top < -1 || x.bottom > 1)
    }));
    assert.equal(initial.sw,initial.vw,'document has no horizontal overflow at '+width);
    if(width<600) assert.equal(await page.locator('.lrw-bar-label').count(),0);
    await page.getByRole('button',{name:'Start from multipliers',exact:true}).click();
    await page.locator('[data-lrw="binomial-growth"] input').nth(1).fill('0.4');
    assert.equal(await page.getByRole('button',{name:'Start from probabilities',exact:true}).getAttribute('aria-pressed'),'true');
    await page.getByRole('button',{name:'Start from multipliers',exact:true}).click();
    await page.locator('[data-lrw="binomial-time"] input').nth(0).fill('0.4');
    assert.equal(await page.getByRole('button',{name:'Start from probabilities',exact:true}).getAttribute('aria-pressed'),'true');
    await page.locator('[data-lrw="binomial-growth"] input').nth(0).fill('0.4');
    await page.locator('[data-lrw="binomial-growth"] input').nth(2).fill('0.4');
    await page.locator('[data-lrw="binomial-growth"] input').nth(3).fill('1');
    const lanes=await page.locator('.lrw-marker-lane').evaluateAll(ns=>ns.map(n=>{
      const glyph=n.querySelector('circle,path'),b=glyph.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};
    }));
    assert.equal(lanes.length,6);assert.equal(new Set(lanes.map(p=>p.y)).size,6);
    assert(lanes.every(p=>Math.abs(p.x-lanes[0].x)<.5),'all equal positions share their x coordinate');
    if(width===320){
      for(const name of ['three-state','payoff-first','binomial-step','binomial-growth','binomial-time'])
        await page.locator(`[data-lrw="${name}"]`).screenshot({path:path.join(out,name+'-320.png')});
    }
    assert.equal(errors.length,0);
    reports.push({width,...initial,errors});
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));
  console.log(JSON.stringify(reports,null,2));
})().catch(e=>{console.error(e);process.exit(1);});
