/* Landing-page motion vocabulary; progressive, bounded, and reduced-motion aware. */
(() => {
  const calm=matchMedia('(prefers-reduced-motion: reduce)');
  const motion=new Set();
  let lastRoute='', observer=null;
  const glyph=(name,cls='')=>`<svg class="life-doodle ${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="doodles.svg#d-${name}"/></svg>`;
  const pageGlyph={dashboard:'hand',timeline:'cal',brothers:'people',chapter:'chat',tasks:'check',docs:'link',instagram:'spark',events:'board',service:'heart',parties:'star',treasury:'wallet',settings:'key',billing:'receipt'};
  function animate(el,frames,options={}) {
    if(calm.matches||!el?.isConnected)return;
    const a=el.animate(frames,{duration:520,easing:'cubic-bezier(.16,1,.3,1)',...options});
    motion.add(a);a.finished.catch(()=>{}).finally(()=>motion.delete(a));return a;
  }
  function illustrate() {
    const heading=$('#page .heading');
    if(heading&&!heading.querySelector('.life-greeting')){
      const title=heading.querySelector('h1');
      title?.insertAdjacentHTML('beforeend',glyph(pageGlyph[route]||'spark','life-greeting'));
    }
    $$('#page .card-head').forEach((head,i)=>{
      // Keep existing icon slot and its dimensions; swap in the landing artwork.
      const old=head.querySelector('.icon');
      if(old){const label=head.textContent.toLowerCase();const name=label.includes('treasury')||label.includes('balance')?'wallet':(label.includes('poll')||label.includes('question'))?'chat':label.includes('attention')?'star':label.includes('roster')?'people':label.includes('week')?'cal':pageGlyph[route]||'spark';old.outerHTML=glyph(name,'life-card-glyph')}
      head.style.setProperty('--life-rot',`${i%2?5:-5}deg`);
    });
    const ring=$('#page .ring');if(ring)ring.style.setProperty('--life-sweep',ring.style.getPropertyValue('--score')+'%');
    const note=$('#page .sticky');if(note&&!note.querySelector('.life-note-pin'))note.insertAdjacentHTML('beforeend','<span class="life-note-pin" aria-hidden="true"></span>');
  }
  function reveal(el,index) {
    animate(el,[{opacity:.2,transform:'translateY(15px)'},{opacity:1,transform:'translateY(0)'}],{delay:Math.min(index*55,240),duration:650});
    el.querySelectorAll('.inline-bar i,.bar>i').forEach(bar=>animate(bar,[{transform:'scaleX(0)'},{transform:'scaleX(1)'}],{duration:850,delay:150}));
    el.querySelectorAll('.chart path[stroke="var(--mint-ink)"]').forEach(path=>{
      const len=path.getTotalLength();animate(path,[{strokeDasharray:`${len} ${len}`,strokeDashoffset:len},{strokeDasharray:`${len} ${len}`,strokeDashoffset:0}],{duration:1200,delay:180});
    });
  }
  function entrance() {
    observer?.disconnect();motion.forEach(a=>a.cancel());
    if(calm.matches)return;
    const heading=$('#page .heading');
    if(heading){heading.classList.remove('life-arriving');void heading.offsetWidth;heading.classList.add('life-arriving');reveal(heading,0)}
    const els=$$('#page > .actions,#page > .sticky,#page > .metrics,#page > .toolbar,#page .card,#page .lane,#page .paper-setting-group');
    let n=1;
    observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){reveal(entry.target,n++);observer.unobserve(entry.target)}})},{threshold:.08});
    els.filter(el=>!el.parentElement.closest('.card,.paper-setting-group')).forEach(el=>observer.observe(el));
    const ring=$('#page .ring');if(ring){const score=ring.style.getPropertyValue('--score');animate(ring,[{'--life-sweep':'0%'},{'--life-sweep':`${score}%`}],{duration:1100,delay:200})}
  }
  const renderBase=render;
  render=function(){renderBase();illustrate();const key=route+(route==='settings'?'/'+U.setting:'');if(key!==lastRoute){lastRoute=key;entrance()}};
  // Tiny paper burst appears only on a deliberate task completion.
  document.addEventListener('click',e=>{
    const control=e.target.closest('[data-action="task-toggle"]');
    if(!control||control.classList.contains('done')||calm.matches)return;
    const r=control.getBoundingClientRect();
    for(let i=0;i<9;i++){
      const bit=document.createElement('span');bit.className='life-confetti';bit.setAttribute('aria-hidden','true');
      const angle=i*Math.PI*2/9;bit.style.cssText=`left:${r.x+r.width/2}px;top:${r.y+r.height/2}px;background:var(--${['mint','butter','lilac','peach'][i%4]});`;
      $('#app').append(bit);
      const a=animate(bit,[{transform:'translate(-50%,-50%) scale(.4)',opacity:1},{transform:`translate(${Math.cos(angle)*45}px,${Math.sin(angle)*40-14}px) rotate(${i*65}deg) scale(.8)`,opacity:0}],{duration:650,easing:'cubic-bezier(.2,.7,.3,1)'});
      if(a)a.finished.catch(()=>{}).finally(()=>bit.remove());else bit.remove();
    }
  },true);
  const overlays=new MutationObserver(entries=>entries.forEach(({target,attributeName})=>{
    if(attributeName==='open'&&target.open)animate(target,[{opacity:0,transform:target.id==='drawer'?'translateX(24px)':'translateY(12px) scale(.98)'},{opacity:1,transform:'none'}],{duration:320});
    if(target.id==='toast'&&!target.hidden)animate(target,[{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'none'}],{duration:280});
  }));
  $$('dialog,#toast').forEach(el=>overlays.observe(el,{attributes:true,attributeFilter:['open','hidden']}));
  calm.addEventListener('change',()=>{if(calm.matches){motion.forEach(a=>a.cancel());observer?.disconnect()}});
  render();
})();
