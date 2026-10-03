/* Assumptions: signed-in warm mock; use existing chapter data and identity.
   Direction: a welcoming paper workspace, question-first entry, legible source-backed answers.
   This remains a local interactive prototype, not an AI/backend integration. */
(() => {
  const dialog = $('#ask-dialog');
  let turns = [], draft = null;
  const starter = (title, subtitle, query, tone, glyph) => `<button class="ask-starter" style="${tint(tone)}" data-action="ask-question" data-id="${esc(query)}">${icon(glyph)}<span><b>${title}</b><small>${subtitle}</small></span><span class="ask-starter-arrow" aria-hidden="true">↗</span></button>`;
  dialog.innerHTML = `<header class="ask-top"><span class="ask-brand-mark">${icon('spark')}</span><div class="ask-top-copy"><h2 id="ask-title">Ask Chapt</h2><p>A little help, right here.</p></div><div class="ask-top-actions"><button class="ask-new" data-ask="new" hidden>＋ New conversation</button><button class="icon-btn" data-action="close-ask" aria-label="Close Ask Chapt">×</button></div></header><div id="ask-body"></div><div class="ask-composer-wrap"><form id="ask-form"><label class="sr-only" for="ask-question-input">Your question for Ask Chapt</label><textarea id="ask-question-input" name="question" rows="2" maxlength="2000" placeholder="What would make your day a little easier?" required></textarea><div class="ask-composer-bottom"><span class="ask-scope">${icon('check')} Your chapter’s records</span><button class="ask-send" type="submit" disabled>Ask Chapt <span aria-hidden="true">↑</span></button></div></form></div><section class="ask-starters"><div class="ask-starter-label">A good place to start</div><div class="ask-starter-grid">${starter('Get my bearings','What’s coming up for us?','What’s coming up?','butter','Timeline')}${starter('Check in on people','Who could use a little support?','Who needs a check-in?','mint','Brotherhood')}${starter('Make sense of dues','See what’s still outstanding.','Who still owes dues?','lilac','Treasury')}</div></section><p class="ask-note">Interactive preview · Answers use the sample chapter records.</p>`;
  // Keep the accessible textarea label visually hidden without relying on the host app.
  const label = dialog.querySelector('.sr-only');
  label.style.cssText='position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap';
  function source(title, route, glyph) { return `<a class="ask-source" href="#/${route}">${icon(glyph)} ${esc(title)} <span aria-hidden="true">↗</span></a>`; }
  function row(title, detail, value, leading='') { return `<div class="ask-record-row">${leading}<div><b>${esc(title)}</b><small>${esc(detail)}</small></div><span class="num">${esc(value)}</span></div>`; }
  function answer(q) {
    let content, followup, draftTitle;
    if (/dues|owe|money|balance|treasury/i.test(q)) {
      const members = liveMembers().filter(m=>m.dues>0).sort((a,b)=>b.dues-a.dues);
      content=`<h3>${members.length ? `${money(sum(members,'dues'))} still to collect.` : 'Everyone is all paid up.'}</h3><p>${members.length ? `${members.length} members have an outstanding balance. Here’s the breakdown, starting with the largest amounts.` : 'There are no outstanding dues in the active roster.'}</p><div class="ask-records">${members.map(m=>row(m.name,m.role,money(m.dues),avatar(m))).join('')}</div>${source('Dues · '+members.length+' member records','treasury','Treasury')}`;
      followup='What’s coming up?'; draftTitle='Review outstanding chapter dues';
    } else if (/risk|standing|attendance|check.in|support/i.test(q)) {
      const members=liveMembers().filter(m=>memberStatus(m)==='At Risk');
      content=`<h3>${members.length ? 'A check-in could go a long way.' : 'No members are currently at risk.'}</h3><p>${members.length ? `${members.length} members fall below the chapter’s standing thresholds. Start with a conversation to understand how they’re doing.` : 'Everyone is above the current at-risk thresholds.'}</p><div class="ask-records">${members.map(m=>row(m.name,`Attendance ${m.attendance}% · GPA ${m.gpa}`,memberStatus(m),avatar(m))).join('')}</div>${source('Standing · current chapter thresholds','brothers','Brotherhood')}`;
      followup='Who still owes dues?'; draftTitle='Check in with members who need support';
    } else if (/coming|week|next|event|task|catch|priorit|happening/i.test(q)) {
      const events=upcoming().slice(0,3), overdue=overdueTasks();
      content=`<h3>Here’s what’s on the horizon.</h3><p>${events.length ? 'Your next chapter events, all in one place.' : 'There are no upcoming events on the calendar.'} ${overdue.length ? `There ${overdue.length===1?'is':'are'} also ${overdue.length} overdue ${overdue.length===1?'task':'tasks'} worth checking on.` : 'You’re up to date on task deadlines.'}</p><div class="ask-records">${events.map(e=>row(e.title,e.location||'Location to be decided',fmt(e.date))).join('')}</div>${source('Timeline · upcoming events and tasks','timeline','Timeline')}`;
      followup='Who needs a check-in?'; draftTitle='Review chapter events and overdue tasks';
    } else {
      content=`<h3>Let’s find a starting point.</h3><p>This preview can help with upcoming events, member standing, and outstanding dues. Try one of those below, or ask in your own words.</p>`;
      return `<div class="ask-byline">${icon('spark')} Chapt</div>${content}<div class="ask-followups">${['What’s coming up?','Who still owes dues?'].map(t=>`<button data-action="ask-question" data-id="${esc(t)}">${esc(t)} ↗</button>`).join('')}</div>`;
    }
    return `<div class="ask-byline">${icon('spark')} Chapt</div>${content}<div class="ask-followups"><button data-ask="draft" data-title="${esc(draftTitle)}">＋ Make a follow-up task</button><button data-action="ask-question" data-id="${esc(followup)}">${esc(followup)} ↗</button></div>`;
  }
  function paint() {
    dialog.classList.toggle('ask-thread',!!turns.length);
    dialog.querySelector('.ask-new').hidden=!turns.length;
    $('#ask-body').innerHTML=turns.length ? turns.map(t=>`<div class="ask-question">${esc(t.q)}</div><div class="ask-answer">${t.html}</div>`).join('') : `<section class="ask-welcome"><div class="ask-context"><span class="dot"></span>${esc(DB.org.name)}<span> / </span>${esc(DB.org.term)}</div><h3>A little clarity.<br>A little more <em>headspace.</em></h3><p>The dates, the dues, the little things on your mind.<br>Let’s work through them together.</p></section>`;
    $('#ask-body').scrollTop=$('#ask-body').scrollHeight;
    $('#ask-question-input').placeholder=turns.length?'Ask a follow-up…':'What would make your day a little easier?';
  }
  ask = function(q) {
    const text=String(q||'').trim();
    draft=null;
    if(text){turns.push({q:text,html:answer(text)});draft=null;}
    paint();
    if(!dialog.open)dialog.showModal();
    $('#ask-question-input').focus({preventScroll:true});
  };
  dialog.addEventListener('click',e=>{
    if(e.target.closest('a[href^="#/"]'))dialog.close();
    const b=e.target.closest('[data-ask]');if(!b)return;
    if(b.dataset.ask==='new'){turns=[];draft=null;$('#ask-form').reset();dialog.querySelector('.ask-send').disabled=true;ask();}
    if(b.dataset.ask==='draft'){
      if(draft) return;
      draft={title:b.dataset.title,date:TODAY,owner:'Marcus Reyes',status:'open',description:'Follow up on the chapter records reviewed in Ask Chapt.'};
      $('#ask-body').insertAdjacentHTML('beforeend',`<section class="ask-draft" tabindex="-1"><p class="eyebrow">Review before adding</p><h3>${esc(draft.title)}</h3><p>Assigned to Marcus Reyes · Due ${fmt(TODAY)}<br>This will add one task to your chapter’s task list.</p><div class="actions"><button class="btn primary" data-ask="approve">Add task</button><button class="btn ghost" data-ask="cancel">Never mind</button></div></section>`);
      dialog.querySelector('.ask-draft').focus();$('#ask-body').scrollTop=$('#ask-body').scrollHeight;
    }
    if(b.dataset.ask==='cancel'){draft=null;dialog.querySelector('.ask-draft')?.remove();$('#ask-question-input').focus();}
    if(b.dataset.ask==='approve'&&draft){
      DB.tasks.push({id:nextId(DB.tasks),...draft});draft=null;
      const confirmation=`<section class="ask-draft"><p class="eyebrow">${icon('check')} Added to tasks</p><h3>One less thing to keep in your head.</h3><p>Your follow-up is ready for Marcus.</p>${source('Open tasks','tasks','Tasks')}</section>`;
      turns[turns.length-1].html+=confirmation;save('Follow-up task created');paint();$('#ask-question-input').focus();
    }
  });
  dialog.addEventListener('input',()=>{dialog.querySelector('.ask-send').disabled=!$('#ask-question-input').value.trim();});
  dialog.addEventListener('submit',e=>{if(e.target.id!=='ask-form')return;e.preventDefault();e.stopPropagation();const q=$('#ask-question-input').value.trim();if(!q)return;ask(q);e.target.reset();dialog.querySelector('.ask-send').disabled=true;});
  dialog.addEventListener('keydown',e=>{if(e.target.id==='ask-question-input'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(e.target.value.trim())$('#ask-form').requestSubmit();}});
  paint();
  if(new URLSearchParams(location.search).has('ask'))ask();
})();
