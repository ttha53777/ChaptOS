/* Current production structure, with landing-page materials. Sample-only state. */
let paperRail = localStorage.getItem(KEY+'-rail') === 'true';
let paperNeeds = true;
const originalSidebar = sidebar;
sidebar = function () {
  originalSidebar();
  const side = $('#sidebar');
  const settings = route === 'settings';
  document.documentElement.dataset.paperRail = paperRail && !settings ? 'true' : 'false';
  document.documentElement.dataset.paperSettings = String(settings);
  if (settings) {
    side.innerHTML = `<div class="paper-settings-head"><a href="#/dashboard">← Back to app</a><p class="eyebrow">${esc(DB.org.name)}</p><h2>Settings</h2></div><label class="paper-settings-search">${icon('search')}<input id="paper-setting-search" placeholder="FIND A SETTING…" aria-label="Find a setting"></label><nav class="nav paper-settings-nav"><a href="#/settings" class="${U.setting==='index'?'on':''}">${icon('Settings')}Index</a>${Object.entries(settingGroups).map(([group,items])=>`<p class="nav-h">${group}</p>${items.map(id=>`<a href="${settingHref(id)}" class="${U.setting===id?'on':''}">${icon(settingMeta[id]?.[2]||'Settings')}<span>${settingMeta[id]?.[0]||settingTitle(id)}</span></a>`).join('')}`).join('')}</nav>`;
    return;
  }
  const queue = [
    [DB.joins.length,'Join requests','brothers','rose'],
    [DB.excuses.length,'Excuse requests','timeline','butter'],
    [DB.reimbursements.filter(x=>x.status==='pending').length,'Reimbursements','treasury','mint'],
    [DB.events.filter(e=>e.stage==='confirmed'&&e.date<TODAY&&!['chapter','party'].includes(e.category)).length,'Event wrap-ups','events','peach']
  ].filter(x=>x[0]);
  const org = side.querySelector('.org');
  org.insertAdjacentHTML('afterend', `<section class="paper-needs"><button class="paper-needs-toggle" data-paper="needs" aria-expanded="${paperNeeds}">${icon('flag')}<span>Needs you</span><b>${queue.reduce((n,x)=>n+x[0],0)}</b></button><div ${paperNeeds?'':'hidden'}>${queue.map(([n,label,path,tone])=>`<a href="#/${path}"><b style="${tint(tone)}">${n}</b><span>${label}</span></a>`).join('')}</div></section>`);
  side.querySelectorAll('.nav a').forEach(a=>{a.title=a.textContent.trim();a.setAttribute('aria-label',a.title);const svg=a.querySelector('svg');const label=document.createElement('span');label.className='paper-nav-label';while(svg.nextSibling)label.append(svg.nextSibling);a.append(label)});
  side.querySelector('.side__foot').innerHTML=`<button class="me" data-paper="profile" aria-label="Open profile menu" aria-expanded="false"><span class="me__av">MR</span><span class="me__n"><b>Marcus Reyes</b><span>President</span></span></button><button class="paper-collapse" data-paper="rail" aria-label="${paperRail?'Expand':'Collapse'} sidebar">${icon('chevron')}</button><div class="paper-profile" id="paper-profile" hidden><b>Marcus Reyes</b><p>marcus@example.com</p><button data-action="invite">${icon('Brotherhood')}Invite people</button><a href="#/settings">${icon('Settings')}Settings</a><button data-paper="appearance">${icon('spark')}Appearance <small>Paper</small></button><button data-paper="signout">Sign out</button><button data-paper="leave" class="muted">Leave ${esc(DB.org.name)}</button></div>`;
};
const previousDashboard = dashboardPage;
dashboardPage = function () {
  const template = document.createElement('div');
  template.innerHTML = previousDashboard();
  const measure = template.querySelector('.metrics');
  while (measure.children.length > 4) measure.lastElementChild.remove();
  measure.classList.remove('six');
  const main = template.querySelector('.grid > .stack');
  const rail = template.querySelector('.rail');
  const ballot = main.lastElementChild;
  rail.prepend(ballot);
  [...rail.children].find(c=>c.querySelector('.card-head')?.textContent.includes('Social content'))?.remove();
  const actions = template.querySelector('.heading + .actions');
  actions?.querySelector('[data-action="quick"]')?.insertAdjacentHTML('beforebegin',btn('Open check-in','','','','data-paper="checkin"'));
  const roster = [...main.children].find(c=>c.querySelector('.card-head')?.textContent.includes('Roster'));
  if (roster) {
    const members = liveMembers().filter(m=>(U.filter==='All'||memberStatus(m)===U.filter)&&m.name.toLowerCase().includes(U.query.toLowerCase()));
    roster.querySelector('.table-scroll').outerHTML=`<div class="paper-roster-tools">${tabs(['All','Good','Watch','At Risk'],U.filter,'filter')}${search('Find a brother…')}</div>${rosterTable(members,true)}`;
    roster.querySelector('.card-head').insertAdjacentHTML('beforeend',btn('Invite','invite','','small ghost'));
  }
  template.querySelector('.grid').classList.add('paper-dashboard-grid');
  main.children[0].classList.add('paper-attention');
  roster?.classList.add('paper-roster');
  return template.innerHTML;
};
const previousRender = render;
render = function () {
  previousRender();
  $('#app').dataset.route=route;
  if(route==='settings') {
    $('#page .settings-nav')?.remove();
    $('#page .settings-grid')?.classList.add('paper-settings-single');
  }
  if(route==='docs') {
    const measures=$('#page > .metrics');
    if(measures) {measures.classList.add('paper-doc-meta');}
  }
  if(route==='service') {
    const toolbar=$('#page > .toolbar');
    if(toolbar?.querySelector('.search'))toolbar.prepend(toolbar.querySelector('.search'));
  }
  if(route==='parties') {
    const notice=$('#page > .note');
    if(notice)$('#page > .metrics').before(notice);
  }
};
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-paper]');
  if(!el){if(!e.target.closest('.paper-profile'))$('#paper-profile')?.setAttribute('hidden','');return}
  const action=el.dataset.paper;
  if(action==='rail'){paperRail=!paperRail;localStorage.setItem(KEY+'-rail',paperRail);render()}
  if(action==='needs'){paperNeeds=!paperNeeds;sidebar()}
  if(action==='profile'){const pop=$('#paper-profile');pop.hidden=!pop.hidden;el.setAttribute('aria-expanded',String(!pop.hidden))}
  if(action==='appearance')modal('Landing-page appearance',`<div class="modal-content"><p>This mock uses the landing page’s cream paper, brown ink, and six pastel accents.</p><div class="paper-swatches">${['peach','sky','mint','butter','lilac','rose'].map(t=>`<span style="background:var(--${t})" title="${t}"></span>`).join('')}</div><p class="field-help">The existing dark mock is preserved separately.</p></div>`);
  if(action==='checkin')modal('Open check-in',`<div class="modal-content stack"><p>Choose a required event to open its attendance window.</p>${DB.events.filter(e=>e.category==='chapter').map(e=>btn(esc(e.title)+' · '+fmt(e.date),'','','','data-paper="checkin-event" data-event="'+e.id+'"')).join('')}</div>`);
  if(action==='checkin-event'){DB.checkInId=Number(el.dataset.event);save('Check-in window opened');$('#modal').close()}
  if(action==='signout'||action==='leave')modal(action==='signout'?'Sign out':'Leave organization',`<div class="modal-content"><p>This is a local design mock. No account is signed in, and no organization membership will change.</p>${btn('Back to workspace','close-modal','','primary')}</div>`);
});
document.addEventListener('input',e=>{if(e.target.id==='paper-setting-search'){const term=e.target.value.toLowerCase();$$('.paper-settings-nav a').forEach(a=>a.hidden=!a.textContent.toLowerCase().includes(term))}});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('#paper-profile')?.setAttribute('hidden','');if(e.key==='['&&!e.target.closest('input,textarea,[contenteditable]')){paperRail=!paperRail;localStorage.setItem(KEY+'-rail',paperRail);render()}});
render();

// Keep the current app's single task ledger: polls precede deadline groups.
tasksPage = function () {
  const all=DB.tasks, list=all.filter(t=>U.filter!=='Mine'||t.owner==='Marcus Reyes');
  const open=list.filter(t=>t.status!=='done');
  const groups=[['Overdue',open.filter(t=>t.date<TODAY),'peach'],['Due soon',open.filter(t=>t.date>=TODAY&&t.date<='2026-09-17'),'butter'],['Later',open.filter(t=>t.date>'2026-09-17'),'sky']];
  return header('Tasks · Today September 10','Things to get <em>done</em>.','Hand out assignments and deadlines, and put questions to the chapter with polls.',btn('＋ New poll','new','poll')+btn('＋ New task','new','task','primary'))+
    metrics([metric('Overdue',overdueTasks().length,'Needs a follow-up','peach','flag'),metric('Due soon',all.filter(t=>t.status!=='done'&&t.date>=TODAY&&t.date<='2026-09-17').length,'Within 7 days','butter','Timeline'),metric('Open',all.filter(t=>t.status!=='done').length,'Across '+new Set(open.map(t=>t.owner)).size+' owners','sky','Tasks'),metric('Done',all.filter(t=>t.status==='done').length,'This semester','mint','check')])+
    `<div class="toolbar">${tabs([['All','All tasks'],['Mine','Assigned to me']],U.filter,'filter')}<label class="check end"><input type="checkbox" data-change="show-done" ${U.showDone?'checked':''}>Show done</label></div><div class="stack">`+
    (DB.polls.length?card('Polls',DB.polls.map(p=>`<button class="row" data-paper="poll" data-id="${p.id}"><span class="grow"><b>${esc(p.title)}</b><span class="meta" style="display:block">Closes ${fmt(p.date)} · ${p.options.reduce((n,o)=>n+o.votes,0)} votes</span></span>${pill(p.closed?'Closed':'Open','butter')}${icon('chevron')}</button>`).join(''),'butter','Tasks'):'')+
    groups.filter(g=>g[1].length).map(([title,items,tone])=>card(title,taskRows(items),tone,'Tasks',pill(items.length,tone))).join('')+
    (U.showDone?card('Done',taskRows(list.filter(t=>t.status==='done')),'mint','check'):'')+(open.length?'':empty('You’re all caught up.','No open tasks in this view.'))+'</div>';
};
const chapterBefore=chapterPage;
chapterPage=function(){const div=document.createElement('div');div.innerHTML=chapterBefore();div.querySelector('.metrics')?.remove();div.querySelector('.rail')?.remove();div.querySelector('.grid').classList.add('paper-single');const next=DB.events.filter(e=>e.category==='chapter'&&e.date>=TODAY).sort((a,b)=>a.date.localeCompare(b.date))[0];if(next)div.querySelector('[data-action="edit-event"]')?.replaceWith(Object.assign(document.createElement('span'),{innerHTML:btn('Take attendance','attendance',next.id)}));return div.innerHTML};
// Production settings groups and the additional calendar section.
for(const key of Object.keys(settingGroups))delete settingGroups[key];
Object.assign(settingGroups,{Identity:['general','vocabulary'],Membership:['accounts','invitations','roles','member-fields'],Operations:['thresholds','semesters','custom-metrics','event-types','event-fields','calendar','money-categories','workflows'],System:['activity-log','billing']});
settingMeta.calendar=['Calendar subscription','Add chapter events to your own calendar.','Timeline'];
settingsOverview=function(){return header('Configuration','Everything, <em>arranged</em>.','Your chapter’s identity, membership, operations and system controls — grouped by what you’re trying to do.',`<div class="paper-org-strip"><span class="org__mk">${esc(DB.org.initials)}</span><div><b>${esc(DB.org.name)}</b><p class="meta">${liveMembers().length} Brothers · ${DB.tasks.length} Tasks</p></div></div>`)+Object.entries(settingGroups).map(([group,items],i)=>`<section class="paper-setting-group"><p class="eyebrow">${group}</p><div class="card">${items.map(id=>`<a href="${settingHref(id)}" class="row paper-setting-row"><span class="settings-entry-icon" style="${tint(['lilac','sky','mint','butter'][i])}">${icon(settingMeta[id][2])}</span><span class="grow"><b>${settingMeta[id][0]}</b><p class="meta">${settingMeta[id][1]}</p></span>${icon('chevron')}</a>`).join('')}</div></section>`).join('')};
const settingsBefore=settingsPage;
settingsPage=function(){if(U.setting==='calendar')return header('Operations','Calendar <em>subscription</em>.','Keep chapter events alongside your personal calendar.')+card('Your calendar',`<div class="card-body"><p>Pick a calendar provider to preview subscription setup.</p><div class="actions" style="margin-top:16px">${['Google','Apple','Other'].map(p=>btn(p+' Calendar','','','','data-warm="provider" data-id="'+p+'"')).join('')}</div><p class="field-help">Local mock · No live feed or external account connection.</p></div>`,'mint','Timeline');return settingsBefore()};
treasuryTabs.splice(0,treasuryTabs.length,'Overview','Transactions','Reports','Reimbursements');
const treasuryBefore=treasuryPage;
treasuryPage=function(){
 const div=document.createElement('div');div.innerHTML=treasuryBefore();
 const add=div.querySelector('[data-action="new"][data-id="transaction"]');if(add)add.textContent='＋ New txn';
 const reimb=div.querySelector('[data-action="new"][data-id="reimbursement"]');if(reimb)reimb.textContent='＋ Add Reimbursement';
 if((U.tab||'Overview')==='Overview'){
   const grid=div.querySelector('.grid');const balanceCard=grid.querySelector('.stack').children[0];const log=grid.querySelector('.stack').children[1];const dues=grid.querySelector('.rail').children[0];const upcomingCard=grid.querySelector('.rail').children[1];
   const categories={};DB.transactions.filter(t=>t.type==='expense'&&t.status==='posted').forEach(t=>categories[t.category]=(categories[t.category]||0)+t.amount);
   const total=Object.values(categories).reduce((a,b)=>a+b,0);let cursor=0;const stops=Object.values(categories).map((amount,i)=>{const start=cursor;cursor+=amount/Math.max(total,1)*100;return `var(--${['peach','butter','mint','lilac','sky','rose'][i%6]}) ${start}% ${cursor}%`});
   grid.outerHTML=`<div class="grid equal paper-treasury-hero">${balanceCard.outerHTML}${card('Breakdown',`<div class="card-body"><div class="paper-donut" style="background:conic-gradient(${stops.join(',')})"><span><b>${money(total)}</b><small>EXPENSES</small></span></div>${Object.entries(categories).map(([name,amount])=>`<div class="row"><span>${esc(name)}</span><b>${money(amount)}</b></div>`).join('')}</div>`,'peach','Treasury')}</div><div class="grid thirds paper-treasury-lower">${dues.outerHTML}${upcomingCard.outerHTML}${card('Reports',`<div class="card-body"><p>${esc(DB.org.term)}</p><p class="balance">${money(balance())}</p><p class="field-help">Net balance this semester</p>${btn('View report','tab','Reports','small')}${btn('Export','export','report','small ghost')}</div>`,'sky','Docs')}</div>${log.outerHTML}`;
 }
 return div.innerHTML;
};
const dashboardWithLayout=dashboardPage;
dashboardPage=function(){let html=dashboardWithLayout();if(DB.checkInId){const ev=DB.events.find(e=>e.id===DB.checkInId);if(ev){const div=document.createElement('div');div.innerHTML=html;div.querySelector('.sticky').insertAdjacentHTML('beforebegin',`<div class="paper-checkin"><div>${pill('Check-in open','mint')}<b>${esc(ev.title)}</b><p class="meta">${esc(ev.location)} · Attendance window is open</p></div><div class="actions">${btn('Take attendance','attendance',ev.id,'small')}${btn('Close window','','','small ghost','data-paper="close-checkin"')}</div></div>`);html=div.innerHTML}}return html};
document.addEventListener('click',e=>{const el=e.target.closest('[data-paper]');if(!el)return;if(el.dataset.paper==='poll'){const p=DB.polls.find(p=>p.id===Number(el.dataset.id));modal('Chapter poll',`<div class="modal-content">${pollCard(p)}</div>`)}if(el.dataset.paper==='close-checkin'){delete DB.checkInId;save('Check-in window closed')}});
render();
