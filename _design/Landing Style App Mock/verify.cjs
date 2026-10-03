const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base='http://127.0.0.1:8772/';
 await page.goto(base);
 const routes=['dashboard','timeline','brothers','chapter','tasks','docs','instagram','events','service','parties','treasury','settings','billing'];
 const report=[];
 for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});
   for(const route of routes){
     await page.goto(base+'#/'+route);await page.waitForTimeout(300);
     assert(await page.locator('#page h1').count(),route+' missing heading');
     const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
     assert(!overflow,route+' overflow at '+width);
     report.push({route,width,heading:await page.locator('#page h1').first().innerText()});
     if(['dashboard','events','settings','treasury','tasks'].includes(route))await page.screenshot({path:path.join(__dirname,'qa',`${route}-${width}.png`),fullPage:true});
   }
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(base+'#/dashboard');
 await page.locator('[data-paper="rail"]').click();assert.equal(await page.locator('#sidebar').evaluate(el=>Math.round(el.getBoundingClientRect().width)),60);
 await page.locator('[data-paper="rail"]').click();
 await page.locator('[data-paper="profile"]').click();await page.locator('#paper-profile a').click();assert.equal(await page.locator('.paper-settings-head h2').innerText(),'Settings');
 for(const id of ['general','vocabulary','accounts','invitations','roles','member-fields','thresholds','semesters','custom-metrics','event-types','event-fields','calendar','money-categories','workflows','activity-log']){
  await page.goto(base+'#/settings/'+id);await page.waitForTimeout(40);assert(await page.locator('#page h1').count(),'Settings '+id);
 }
 await page.goto(base+'#/tasks');
 await page.locator('[data-action="new"][data-id="task"]').click();
 await page.locator('#generic-form [name="title"]').fill('Design review follow-up');
 await page.locator('#generic-form button[type="submit"]').click();
 assert(await page.getByText('Design review follow-up',{exact:true}).count());
 await page.reload();assert(await page.getByText('Design review follow-up',{exact:true}).count());
 await page.goto(base+'#/dashboard');await page.locator('[data-paper="checkin"]').click();await page.locator('[data-paper="checkin-event"]').first().click();assert(await page.locator('.paper-checkin').count());await page.locator('[data-paper="close-checkin"]').click();assert.equal(await page.locator('.paper-checkin').count(),0);
 await page.goto(base+'#/treasury');for(const name of ['Transactions','Reports','Reimbursements','Overview']){await page.locator('#page > .toolbar [data-action="tab"]').filter({hasText:new RegExp('^'+name+'$')}).click();assert((await page.locator('#page').innerText()).length>200)}
 await page.goto(base+'#/events');await page.locator('[data-action="tab"][data-id="Calendar"]').click();assert(await page.locator('.calendar').count());
 await page.locator('.ask-fab').click();assert(await page.locator('#ask-dialog').isVisible());await page.screenshot({path:path.join(__dirname,'qa','ask-1440.png')});await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});await page.goto(base+'#/dashboard');await page.locator('[data-action="menu"]').click();await page.locator('#sidebar a[href="#/events"]').click();await page.waitForFunction(()=>document.querySelector('#mobile-title').textContent==='Programming');assert.equal(await page.locator('#mobile-title').innerText(),'Programming');
 assert.deepEqual(errors,[]);
 require('node:fs').writeFileSync(path.join(__dirname,'qa','results.json'),JSON.stringify({routes:report,checks:['Sidebar collapse','Profile → Settings','15 settings sections','Task creation and persistence','Check-in window lifecycle','Four Treasury tabs','Programming calendar','Ask dialog','Mobile navigation'],errors},null,2));
 console.log('PASS: 26 route/viewport checks, 15 settings sections, interactive checks; no runtime errors.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
