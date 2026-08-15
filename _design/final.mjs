import { chromium } from '/Users/thalhat/figurints/node_modules/playwright/index.mjs';
const F='file:///Users/thalhat/figurints/_design/Events%20Production%20Mock%20v3.html';
const b=await chromium.launch();
let fail=0;
for (const w of [1600,1440,1180,900,640,390]) {
  for (const theme of ['dusk','ivory']) {
    const p=await b.newPage({viewport:{width:w,height:1000}});
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    p.on('console',m=>{if(m.type()==='error')errs.push('console:'+m.text())});
    await p.goto(F); await p.waitForTimeout(250);
    if(theme==='ivory'){ await p.evaluate(()=>document.documentElement.dataset.theme='ivory'); await p.waitForTimeout(250); }
    await p.click('.views button[data-view="calendar"]'); await p.waitForTimeout(250);
    const o=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    const pills=await p.locator('.cev').count();
    const key=await p.isVisible('.cal-key');
    const ok = errs.length===0 && pills>0 && key && (o===0);
    if(!ok) fail++;
    console.log(`${w}/${theme}: pills=${pills} legend=${key} overflowX=${o} ${errs.length?'ERR '+errs[0]:''} ${ok?'✓':'✗'}`);
    await p.close();
  }
}
console.log(fail?`\n${fail} FAILING`:'\nall pass');
await b.close();
