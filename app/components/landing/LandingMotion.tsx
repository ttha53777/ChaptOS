"use client";

/**
 * Everything that moves on the landing page, ported 1:1 from the script in
 * _design/Landing Motion Mock.html.
 *
 * The page is server-rendered markup (LandingPage.tsx); this mounts once, finds
 * its nodes by id and drives them imperatively — the same shape as the mock, so
 * the timing and feel stay identical. It renders nothing.
 *
 * One rAF loop reads a lerped scroll value and hands it to every scene; native
 * scrolling is never taken over. Scenes, top to bottom:
 *   · the bottom bar on phones (the top bar moves itself: SiteNavMotion)
 *   · hero: eight loose ends dock into one dashboard, the headline swaps
 *     "loose ends" for "one page", then the dashboard re-forms per org type
 *   · race: the group chat vs Ask Chapt, scrubbed by scroll (scroll back rewinds)
 *   · how it works: one card morphing Timeline → ticket → tasks → budget
 *   · the page wash, the handoff board, fits-your-org, FAQ, the close
 *   · the thread sewn through every section, and the travellers that carry an
 *     object out of one section into the next
 *   · scroll-linked depth
 *
 * Differences from the mock, all forced by living inside the app:
 *   · it tears itself down on unmount (listeners, rAF, timers, observers, the
 *     nodes it added), and its one-time DOM rewrites are idempotent, so React's
 *     dev double-mount and client navigation away and back both work
 *   · the colour probe lives inside .lm, so it reads this page's tokens rather
 *     than the app's paper palette on <body>
 */

import { useEffect } from "react";

export function LandingMotion() {
  useEffect(() => mount(), []);
  return null;
}

type Scene = { measure?(): void; update(y: number): void };
type Pose = { d: number[]; m: number[] };
type Piece = {
  el: HTMLElement; k: string; i: number; mi: HTMLElement; ci: HTMLElement; m: HTMLElement; c: HTMLElement; slot: HTMLElement;
  w0: number; h0: number; pose: Pose; docked: boolean; ox: number; oy: number; w1: number; h1: number;
};
type OrgView = {
  logo: string; c: string; name: string; meta: string; word: string; nav: [string, string, number?][];
  bud: number; mod: number; [k: string]: unknown;
};
type Traveller = {
  src: HTMLElement; dst: HTMLElement; el: HTMLElement; state: number; y0: number; y1: number;
  init(o: Traveller): void; paint(o: Traveller, t: number): void; range(): [number, number];
  measure?(o: Traveller): void; enabled?(): boolean; land?(): void;
  arc: number; rot: number; fade: number; fs: HTMLElement[]; ws: number[];
  sp: HTMLElement; ty: HTMLElement; ph: HTMLElement; kb: HTMLElement;
};
type CarryOpts = Partial<Traveller> & Pick<Traveller, "range">;

function mount(): () => void {
  const root = document.querySelector<HTMLElement>(".lm");
  if (!root) return () => {};

  const ac = new AbortController();
  const on = { signal: ac.signal };
  const timeouts = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => { timeouts.delete(id); fn(); }, ms);
    timeouts.add(id);
    return id;
  };
  const cancel = (id: number) => { clearTimeout(id); timeouts.delete(id); };
  let raf = 0, alive = true;
  const cleanups: (() => void)[] = [];

  const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
  const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll(s)] as T[];
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // a touch screen already eases its own scroll (momentum), and its browser bar
  // changes innerHeight mid-scroll; neither should move the motion
  const TOUCH = matchMedia("(pointer: coarse)").matches;
  const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const ease = (t: number) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const eo = (t: number) => 1 - Math.pow(1 - t, 3);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const absTop = (el: Element) => el.getBoundingClientRect().top + scrollY;
  // an in-page target for an href, or null for one that leaves the page
  const section = (h: string | null) => (h && h.length > 1 && h[0] === "#" ? $(h) : null);

  let W = innerWidth, H = innerHeight, cur = scrollY, vel = 0, now = 0, MOB = W < 760;
  // How it works stacks (card pinned on top, steps scrolling under it) on narrow portrait screens;
  // a phone on its side is too short for that, so it keeps the side-by-side layout
  const walkMob = () => W <= 900 && H > 500;
  // layout position, ignoring any transform or translate the motion has applied
  const docTop = (el: HTMLElement) => { let t = 0; for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) t += e.offsetTop; return t; };
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  const scenes: Scene[] = [];

  /* page colours the wash blends between, read off the live tokens */
  const probe = document.createElement("i"); probe.style.display = "none"; root.append(probe);
  cleanups.push(() => probe.remove());
  const rgba = (v: string) => { probe.style.color = v; const m = getComputedStyle(probe).color.match(/[\d.]+/g)!.map(Number); return [m[0], m[1], m[2], m[3] ?? 1]; };
  let PAPER = [255, 252, 246], WASH: number[][] = [], TINT: Record<string, number[]> = {}, howTint = [255, 252, 246];
  function readWash() {
    PAPER = rgba("var(--paper)").slice(0, 3);
    const flat = (v: string) => { const [r, g, b, a] = rgba(`var(${v})`); return [r, g, b].map((c, j) => c * a + PAPER[j] * (1 - a)); };
    WASH = ["--sky-soft", "--butter-soft", "--peach-soft", "--mint-soft"].map(flat);
    TINT = { peach: flat("--peach-soft"), mint: flat("--mint-soft") };
  }
  readWash();

  /* the bottom bar on phones: up once the hero's done, down near the end (the top bar is <SiteNav>'s) */
  const mbar = $("#mbar");
  scenes.push({ update() {
    const nearEnd = scrollY + H > document.documentElement.scrollHeight - 500;
    mbar.classList.toggle("on", scrollY > $("#top").offsetHeight - H * .5 && !nearEnd);
  }});

  /* word split + reveal. Rewrites the heading once; a remount finds it split. */
  $$("[data-split]").forEach(el => {
    if (el.dataset.split === "done") return;
    el.dataset.split = "done";
    const nodes = [...el.childNodes]; el.textContent = ""; let i = 0;
    const word = (c: string | Node) => { const w = document.createElement("span"); w.className = "sw"; const s = document.createElement("span"); s.style.transitionDelay = (i++ * 55) + "ms";
      if (typeof c === "string") s.textContent = c; else s.append(c); w.append(s); el.append(w); };
    nodes.forEach(n => {
      if (n.nodeType === 3) (n.textContent ?? "").split(/(\s+)/).forEach(t => { if (!t) return; if (/^\s+$/.test(t)) el.append(" "); else word(t); });
      else if ((n as Element).tagName === "BR") el.append(n);
      else if ((n as Element).classList.contains("hi") && /\s/.test((n.textContent ?? "").trim())) {
        // a highlighted phrase becomes one highlight per word, so it can wrap on a phone
        (n.textContent ?? "").trim().split(/\s+/).forEach((t, j) => { if (j) el.append(" "); const h = n.cloneNode(false); h.textContent = t; word(h); });
      } else word(n);
    });
  });
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -12% 0px" });
  $$("[data-split],[data-rv]").forEach(el => io.observe(el));
  cleanups.push(() => io.disconnect());

  /* ── 1 · HERO ────────────────────────────────────────────────────────── */
  const ORG: Record<string, OrgView> = {
    club: { logo: "RC", c: "var(--mint)", name: "Robotics Club", meta: "FALL ’26 · 38", word: "club",
      nav: [["Dashboard", "butter"], ["Timeline", "sky"], ["Members", "lilac"], ["Meetings", "butter"], ["Tasks", "peach"], ["Docs", "paper-3"], ["Budget", "mint"]],
      nextT: "General meeting · Wed 6:00", nextS: "Union 210 · moved from Tue · on everyone’s calendar",
      budK: "Budget left", budBig: "$1,240 <small>/ 2,000</small>", budS: "Student gov allocation · 1 reimbursement", bud: 62,
      attN: "32<small>/38</small>", memK: "Members", memN: "38 <small>members</small>", memS: "2 requests to join",
      minT: "Fall trip approved · 3 action items", modK: "Docs", modBig: "Officer handbook", modS: "updated by this year’s board", mod: 0 },
    team: { logo: "DT", c: "var(--rose)", name: "Dance Team", meta: "FALL ’26 · 24", word: "team",
      nav: [["Dashboard", "butter"], ["Timeline", "sky"], ["Members", "lilac"], ["Tasks", "peach"], ["Budget", "mint"], ["Fundraising", "butter", 1], ["Instagram", "peach", 1]],
      nextT: "Rehearsal · Thu 8:00", nextS: "Studio B · costume fitting after",
      budK: "Budget left", budBig: "$860 <small>/ 1,500</small>", budS: "Showcase costs · 2 receipts", bud: 57,
      attN: "22<small>/24</small>", memK: "Members", memN: "24 <small>dancers</small>", memS: "1 request to join",
      minT: "Showcase setlist locked · 2 action items", modK: "Fundraising", modBig: "$820 raised", modS: "Spring showcase · goal $1,500", mod: 55 },
    chapter: { logo: "ΔH", c: "var(--butter)", name: "Delta House", meta: "FALL ’26 · 52", word: "chapter",
      nav: [["Dashboard", "butter"], ["Timeline", "sky"], ["Brotherhood", "lilac"], ["Chapter", "butter"], ["Treasury", "mint"], ["Dues", "mint", 1], ["Service", "sky", 1], ["Parties", "rose", 1]],
      nextT: "Chapter meeting · Thu 7:00", nextS: "Room 204 · moved from Wed",
      budK: "Treasury", budBig: "$12,480", budS: "+$1,320 this month", bud: 78,
      attN: "46<small>/52</small>", memK: "Roster", memN: "52 <small>brothers</small>", memS: "3 requests to join",
      minT: "Formal budget approved · 4 action items", modK: "Dues collected", modBig: "83%", modS: "$4,180 of $5,040 · 6 still owe", mod: 83 },
    council: { logo: "EC", c: "var(--sky)", name: "Eng. Student Council", meta: "FALL ’26 · 19", word: "council",
      nav: [["Dashboard", "butter"], ["Timeline", "sky"], ["Members", "lilac"], ["Meetings", "butter"], ["Tasks", "peach"], ["Docs", "paper-3"], ["Programming", "lilac", 1]],
      nextT: "General assembly · Mon 6:30", nextS: "Union 210 · agenda posted",
      budK: "Budget left", budBig: "$6,400 <small>/ 9,000</small>", budS: "4 funding requests open", bud: 71,
      attN: "17<small>/19</small>", memK: "Members", memN: "19 <small>reps</small>", memS: "from 11 clubs",
      minT: "Bylaws amendment passed · 2 action items", modK: "Programming", modBig: "5 events planned", modS: "2 confirmed on the Timeline", mod: 40 },
  };
  const ORDER = ["club", "team", "chapter", "council"];
  let orgType = "club", autoOrg = true;
  const dfNav = $("#dfNav"), oword = $("#oword"), brandMark = $("#df .df-org .mark");
  const renderNav = (o: OrgView) => { dfNav.innerHTML = o.nav.map(([l, c, m], i) => `<div class="df-it${i === 0 ? " on" : ""}${m ? " mod" : ""}" style="--d:${i * 40}ms"><i style="--c:var(--${c})"></i>${l}</div>`).join(""); };
  // eslint-disable-next-line prefer-const -- assigned below; rollWord needs it first
  let hero: Scene & { measure(): void; pageY(): number; reswap(): void };
  function setOrg(t: string, user?: boolean) {
    if (user) autoOrg = false;
    if (t === orgType) return; orgType = t; const o = ORG[t];
    $$(".ot").forEach(b => b.classList.toggle("on", b.dataset.t === t));
    const els = $$("[data-o]");
    els.forEach(e => e.classList.add("osw"));
    later(() => {
      els.forEach(e => { const v = o[e.dataset.o!]; if (v != null) e.innerHTML = String(v); e.classList.remove("osw"); });
      brandMark.style.background = o.c;
      $('[data-bar="bud"]').style.setProperty("--v", o.bud + "%");
      $('[data-bar="mod"]').style.setProperty("--v", o.mod + "%"); ($('[data-bar="mod"]').parentNode as HTMLElement).style.opacity = o.mod ? "1" : "0";
      renderNav(o);
      rollWord(o.word);
    }, 240);
  }
  // the headline's org word rolls: the old one lifts out, the new one rises in, and the gap eases to its width
  const WORDS = ["club", "council", "org", "fraternity", "sorority", "chapter"];
  let curWord = "club", rollT = 0;
  function rollWord(w: string) {
    if (w === curWord) return; curWord = w;
    const old = $$(".ow", oword), nw = document.createElement("span");
    nw.className = "ow in"; nw.textContent = w;
    oword.style.width = oword.offsetWidth + "px";
    oword.appendChild(nw);
    const to = nw.offsetWidth;
    requestAnimationFrame(() => {
      oword.style.width = to + "px"; nw.classList.remove("in");
      old.forEach(e => e.classList.add("out"));
    });
    cancel(rollT);
    rollT = later(() => {
      $$(".ow.out", oword).forEach(e => e.remove()); oword.style.width = "";
      // a wider word can rewrap the headline, so the copy and the docked size are re-fit
      hero.measure();
    }, 560);
  }
  // a remount starts from the mock's opening state: one word, the club's dashboard
  $$(".ow", oword).forEach((e, i) => { if (i) e.remove(); else { e.className = "ow"; e.textContent = "club"; } });
  oword.style.width = "";
  renderNav(ORG.club);
  $$(".ot").forEach(b => b.addEventListener("click", () => setOrg(b.dataset.t!, true), on));

  hero = (() => {
    const sec = $("#top"), stage = $("#heroStage"), df = $("#df"), copy = $("#heroCopy"), h1 = $("#heroH1"), ots = $("#otypes");
    const fades = $$(".fade-a", copy);
    const swap = $("#swap"), swA = $(".a", swap), swB = $(".b", swap);
    // the loose ends frame the headline from the margins; nothing sits over the copy
    const POSE: Record<string, Pose> = {
      ask:     { d: [-.354, -.278, -6, .8], m: [-.36, -.33, -7, .8] },
      next:    { d: [ .354, -.283,  4, .5], m: [ .34, -.32,  5, .5] },
      budget:  { d: [ .417,  .033, -4, .9], m: [ .42,  .35, -4, .9] },
      att:     { d: [-.417,  .022,  3, .6], m: [-.38,  .36,  3, .6] },
      tasks:   { d: [-.405,  .400, -8, 1 ], m: [-.15,  .46, -8, 1 ] },
      members: { d: [ .425,  .450,  3, .7], m: [ .30,  .48,  3, .7] },
      minutes: { d: [ .310,  .265,  3, .45], m: [ .08,  .38,  2, .45] },
      mod:     { d: [-.306,  .262, -3, .4], m: [-.01, -.37, -3, .4] },
    };
    const pcs: Piece[] = $$(".pc", sec).map((el, i) => {
      const k = el.dataset.k!, mi = $(".pc-mi", el), ci = $(".pc-ci", el);
      return { el, k, i, mi, ci, m: $(".pc-m", el), c: $(".pc-c", el), slot: $(`.slot[data-k="${k}"]`, df),
        w0: parseFloat(mi.style.width), h0: parseFloat(mi.style.height), pose: POSE[k], docked: false, ox: 0, oy: 0, w1: 0, h1: 0 };
    });
    // SH is the stage's own height, which follows a phone's browser bar (100dvh) while the rest of the page holds H
    let SH = H, top = 0, len = 1, mob = false, k = 1, dfL = 0, dfT = 0, copyTop = 0, endDy = 0, endS = 1, s0 = 1, low = 0, wA = 0, wB = 0, lastCycle = 0, wordAt = 0;
    const api = {
      reswap() { swap.style.width = "auto"; wA = swA.offsetWidth; wB = swB.offsetWidth; },
      // the scroll position where the headline reads "runs on one page" and the dashboard has docked
      pageY() { return top + .84 * len; },
      measure() {
        SH = stage.clientHeight || H;
        top = absTop(sec); len = sec.offsetHeight - SH; mob = W < 760;
        k = W >= 1280 ? .9 : W >= 1000 ? .74 : W >= 760 ? .64 : .5;
        df.style.transform = "none";
        const fw = df.offsetWidth, fh = df.offsetHeight;
        dfL = (W - fw) / 2; dfT = Math.min(SH * (mob ? .33 : .3), SH - fh - 74);
        df.style.left = dfL + "px"; df.style.top = dfT + "px";
        ots.style.top = (dfT + fh + 18) + "px";
        const dr = df.getBoundingClientRect();
        pcs.forEach(pc => {
          const r = pc.slot.getBoundingClientRect();
          pc.ox = r.left - dr.left; pc.oy = r.top - dr.top; pc.w1 = r.width; pc.h1 = r.height;
          pc.ci.style.width = pc.w1 + "px"; pc.ci.style.height = pc.h1 + "px";
        });
        copy.style.transform = "none";
        api.reswap();
        // a short screen (a phone on its side) shrinks the opening copy so the buttons aren't pinned below the fold
        const ch = copy.offsetHeight; s0 = Math.min(1, (SH - 84) / ch);
        copyTop = Math.max(70, (SH - ch * s0) / 2 - (mob ? 0 : 10)); copy.style.top = copyTop + "px";
        // on a short phone the copy runs into the lower notes; drop them below it (the stage crops them)
        low = mob ? Math.max(0, copyTop + ch * s0 - SH * .84) : 0;
        const h1H = h1.offsetHeight, h1Off = h1.offsetTop, bandT = 72, bandH = dfT - 14 - bandT;
        endS = Math.min(mob ? .72 : .58, bandH / h1H);
        endDy = bandT + (bandH - h1H * endS) / 2 - copyTop - h1Off * endS;
      },
      update(y: number) {
        const p = clamp((y - top) / len);
        const cp = ease(clamp((p - .04) / .44));
        copy.style.transform = `translate3d(0, ${endDy * cp}px, 0) scale(${lerp(s0, endS, cp)})`;
        fades.forEach(f => { const o = 1 - clamp(p / .16); f.style.opacity = String(o); f.style.pointerEvents = o < .5 ? "none" : ""; });
        const sp = smooth(clamp((p - .44) / .16));
        swap.style.width = lerp(wA, wB, sp) + "px";
        swA.style.cssText = `opacity:${1 - sp}; transform:translateY(${-sp * .5}em); filter:blur(${sp * 8}px)`;
        swB.style.cssText = `opacity:${sp}; transform:translateY(${(1 - sp) * .5}em); filter:blur(${(1 - sp) * 8}px); --mx:${clamp((p - .54) / .1)}`;
        const rp = eo(clamp((p - .1) / .42));
        const rise = (1 - rp) * (SH - dfT + 60);
        df.style.transform = `translate3d(0, ${rise}px, 0)`;
        df.style.opacity = String(clamp(rp * 2.5));
        pcs.forEach(pc => {
          const [X, Y, R, Z] = mob ? pc.pose.m : pc.pose.d;
          const t = ease(clamp((p - (.1 + pc.i * .032)) / .4));
          const w0 = pc.w0 * k, h0 = pc.h0 * k, live = 1 - t;
          const fl = RM ? 0 : Math.sin(now / 1100 + pc.i * 1.7) * 5 * live;
          const sx = W / 2 + X * W - w0 / 2 + mouse.x * 26 * Z * live;
          const sy = SH / 2 + Y * SH - h0 / 2 + (Y > .3 ? low : 0) - p * 220 * Z * live + mouse.y * 20 * Z * live + fl;
          const tx = dfL + pc.ox, ty = dfT + rise + pc.oy;
          const x = lerp(sx, tx, t), yy = lerp(sy, ty, t) - Math.sin(t * Math.PI) * 70;
          const w = lerp(w0, pc.w1, t), h = lerp(h0, pc.h1, t);
          const rot = lerp(R + (RM ? 0 : Math.sin(now / 1500 + pc.i) * live), 0, t);
          const st = pc.el.style;
          st.transform = `translate3d(${x}px, ${yy}px, 0) rotate(${rot}deg)`;
          st.width = w + "px"; st.height = h + "px";
          st.borderRadius = lerp(pc.k === "ask" ? 4 : 10, 12, t) + "px";
          st.boxShadow = `0 ${lerp(18, 0, t)}px ${lerp(36, 0, t)}px -12px rgba(38,33,27,${lerp(.28, 0, t)})`;
          st.zIndex = t > 0 && t < 1 ? "5" : "1";
          pc.mi.style.transform = `scale(${w / pc.w0})`;
          pc.m.style.opacity = String(1 - clamp(t / .5));
          pc.ci.style.transform = `scale(${w / pc.w1})`;
          pc.c.style.opacity = String(clamp((t - .42) / .4));
          const d = t >= .999;
          if (d !== pc.docked) { pc.docked = d; pc.slot.style.opacity = d ? "0" : "1"; }
        });
        // once it's one page: show the org types, and cycle them while the reader lingers
        const done = p > .8;
        ots.classList.toggle("on", done);
        if (done && autoOrg && !RM) {
          if (!lastCycle) lastCycle = now;
          else if (now - lastCycle > 2600) { setOrg(ORDER[(ORDER.indexOf(orgType) + 1) % ORDER.length]); lastCycle = now; }
        } else lastCycle = 0;
        // before it's one page the headline cycles every kind of org; docked, it names the dashboard's
        if (done) { wordAt = 0; rollWord(ORG[orgType].word); }
        else if (!RM) {
          if (!wordAt) wordAt = now;
          else if (now - wordAt > 2000) { rollWord(WORDS[(WORDS.indexOf(curWord) + 1) % WORDS.length]); wordAt = now; }
        }
      }
    };
    return api;
  })();
  scenes.push(hero);
  $("#seeHow").addEventListener("click", e => { e.preventDefault(); scrollTo({ top: hero.pageY(), behavior: RM ? "auto" : "smooth" }); }, on);

  /* ── 2 · RACE ────────────────────────────────────────────────────────── */
  const race = { pinned: false, end: 0, top: (el: HTMLElement) => docTop(el), pre: (el: HTMLElement) => docTop(el) };
  /* Scrubbed by scroll, not played: both lanes run on one clock (ms of the old
     playback) read off the scroll position, so scrolling back rewinds them.
     Where the race fits on screen it pins while the clock runs; where it
     doesn't (phones, short windows) each lane runs as it passes through. */
  scenes.unshift((() => {
    const run = $("#raceRun"), box = $("#raceBox"), lanes = $$(".lane", box);
    const msgs = $$("#slowFeed > *"), steps = $$("#fastSteps .step"), verdict = $("#fastVerdict"), turn2 = $("#turn2"), step2 = $("#step2"), writ = $("#writ"), ok = $("#wrOk");
    const tS = $("#tSlow"), tF = $("#tFast"), fS = $("#slowFoot"), fF = $("#fastFoot");
    const SLOW = [300, 1100, 1900, 2700, 3500, 3700, 4700, 5300, 6100], END = 6600;
    const fmt = (m: number) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, "0")}m`;
    const CHK = '<svg class="ic" style="color:var(--mint-ink)"><use href="#i-check"/></svg>';
    const FOOT_F = ["", `${CHK}<span><b>Answered in 3.2 s.</b> Owners and dates included.</span>`, `${CHK}<span><b>Answered and done in 5.6 s.</b> Logged in the Budget, on everyone’s calendar.</span>`];
    const FOOT_S = ['<span class="typing"><i></i><i></i><i></i></span>', "<span><b>A day later:</b> the time, maybe. The trip and the van, nobody knows.</span>"];
    let win: number[][] = [[0, 1], [0, 1]], pt = 0, extra = 0, runTop = 0, fStage = -1, sStage = -1;
    const off = (el: HTMLElement) => docTop(el) - docTop(box);
    // where an element sits in the page once the pin lets go (or always, unpinned)
    race.top = el => race.pinned ? runTop + extra + off(el) : docTop(el);
    // where it sits on the way in, before the pin catches it
    race.pre = el => runTop + off(el);
    const tog = (el: Element, c: string, v: boolean) => el.classList.toggle(c, v);
    return {
      measure() {
        const bh = box.offsetHeight;
        race.pinned = !RM && W > 860 && bh + 96 <= H;
        tog(run, "pin", race.pinned);
        pt = Math.max(84, (H - bh) / 2); extra = race.pinned ? Math.round(H * 1.5) : 0;
        run.style.setProperty("--pt", pt + "px"); run.style.height = race.pinned ? bh + extra + "px" : "";
        runTop = docTop(run);
        const land = race.pre($("#askQ")) - H * .5; // the question arriving from the hero starts the clock
        if (race.pinned) { const w = [land, runTop - pt + extra]; win = [w, w]; }
        else win = lanes.map((l, i) => { const t = docTop(l), y0 = Math.max(t - H * .7, i ? land : -1e9); return [y0, Math.max(y0 + 300, t + l.offsetHeight - H * .8)]; });
        race.end = win[1][1];
      },
      update(y: number) {
        const [s, f] = win.map(([a, b]) => RM ? END : clamp((y - a) / (b - a)) * END);
        // the group chat
        msgs.forEach((m, i) => tog(m, "on", s >= SLOW[i]));
        tS.textContent = fmt(clamp(s / 6100) * 1381);
        const ss = s >= 6400 ? 1 : 0; if (ss !== sStage) { sStage = ss; fS.innerHTML = FOOT_S[ss]; }
        // Ask Chapt: the answer, then the follow-up, approved by a person
        tF.textContent = (f < 2700 ? clamp(f / 2600) * 3.2 : 3.2 + clamp((f - 3300) / 1500) * 2.4).toFixed(1) + " s";
        steps.forEach((st, i) => { tog(st, "on", f >= 200 + i * 650); tog(st, "done", f >= 700 + i * 650); });
        tog(verdict, "on", f >= 2650); tog(turn2, "on", f >= 3300);
        tog(step2, "on", f >= 3700); tog(step2, "done", f >= 4200); tog(writ, "on", f >= 4200);
        tog(ok, "press", f >= 4950 && f < 5150); tog(writ, "ok", f >= 5150); ok.textContent = f >= 5150 ? "Done" : "Approve";
        const fs = f >= 5500 ? 2 : f >= 2650 ? 1 : 0; if (fs !== fStage) { fStage = fs; fF.innerHTML = FOOT_F[fs]; }
      }
    };
  })());

  /* ── 3 · HOW IT WORKS ────────────────────────────────────────────────── */
  scenes.push((() => {
    const sec = $("#how"), steps = $$("#steps .st"), dv = $("#dv"), scale = $("#dvScale");
    const bgs = $$(".dv-bg", dv), ls = $$(".dv-l", dv), rail = $$("#rail i");
    const S = [
      { w: 420, h: 520, r: 24, rot: 0,    hs: "var(--sky)" },
      { w: 520, h: 290, r: 16, rot: 1.5,  hs: "var(--peach)" },
      { w: 390, h: 440, r: 6,  rot: -2.5, hs: "var(--butter)" },
      { w: 460, h: 400, r: 30, rot: 0,    hs: "var(--mint)" },
    ];
    const notches = $$(".notch", dv), arr = $("#tkArr"), tkN = $("#tkN"), segs = $$("#ntSeg span"), rows = $$("#ntList li"), nBar = $("#ntBar"), nCnt = $("#ntCnt"), stack = $$("#bdStack i");
    let top = 0, len = 1, active = -1, mob = false, timers: number[] = [], stT: number[] = [];
    const stepLater = (fn: () => void, ms: number) => timers.push(later(fn, ms));
    const stopTimers = () => { timers.forEach(cancel); timers = []; };
    function enter(i: number) {
      stopTimers();
      stack.forEach(s => s.style.width = "0");
      if (i === 1) {
        const AV = ["peach", "sky", "mint", "butter", "rose", "lilac"];
        let n = 26; tkN.textContent = String(n); arr.innerHTML = "";
        for (let j = 0; j < 14; j++) arr.insertAdjacentHTML("beforeend", `<i class="av" style="--a:var(--${AV[j % 6]})"></i>`);
        const add = () => { if (n >= 32) return; n++; tkN.textContent = String(n); arr.insertAdjacentHTML("beforeend", `<i class="av new" style="--a:var(--${AV[n % 6]})"></i>`); stepLater(add, 420); };
        stepLater(add, 400);
      }
      if (i === 2) {
        let n = 18; nBar.style.setProperty("--v", "75%"); nCnt.textContent = "18 of 24";
        const cyc = (j: number) => { segs.forEach((s, q) => s.classList.toggle("on", q === j)); rows.forEach((r, q) => r.classList.toggle("hl", q === j)); stepLater(() => cyc((j + 1) % 3), 1500); };
        cyc(0);
        const tick = () => { if (n >= 22) return; n++; nBar.style.setProperty("--v", (n / 24 * 100) + "%"); nCnt.textContent = n + " of 24"; stepLater(tick, 700); };
        stepLater(tick, 900);
      }
      if (i === 3) stepLater(() => stack.forEach(s => s.style.width = s.dataset.w!), 300);
    }
    // on a phone each step holds its own card face, still: no pin, no morph, nothing counting up
    const clip = $(".dv-clip", dv);
    const holds = steps.map((st, j) => {
      const h = document.createElement("div"); h.className = "st-card"; h.setAttribute("aria-hidden", "true");
      h.style.setProperty("--hs", S[j].hs); h.style.borderRadius = S[j].r + "px";
      h.append(bgs[j].cloneNode()); if (j === 1) notches.forEach(n => { const c = n.cloneNode() as HTMLElement; c.style.opacity = "1"; h.append(c); });
      st.prepend(h); return h;
    });
    function place() {
      stopTimers(); active = -1;
      ls.forEach((l, j) => {
        const h = holds[j]; if (l.parentNode !== h) h.append(l);
        const k = Math.min(1, h.clientWidth / S[j].w);
        h.style.height = S[j].h * k + "px";
        l.style.opacity = l.style.visibility = l.style.filter = "";
        l.style.transform = `scale(${k})`;
      });
      // each card shows its settled state
      tkN.textContent = "32"; arr.innerHTML = "";
      const AV = ["peach", "sky", "mint", "butter", "rose", "lilac"];
      for (let j = 0; j < 20; j++) arr.insertAdjacentHTML("beforeend", `<i class="av" style="--a:var(--${AV[j % 6]})"></i>`);
      segs.forEach((g, q) => g.classList.toggle("on", !q)); rows.forEach((r, q) => r.classList.toggle("hl", !q));
      nBar.style.setProperty("--v", "75%"); nCnt.textContent = "18 of 24";
      stack.forEach(t => { t.style.transition = "none"; t.style.width = t.dataset.w!; });
    }
    function unplace() {
      if (ls[0].parentNode === clip) return;
      ls.forEach(l => clip.append(l)); stack.forEach(t => t.style.transition = ""); active = -1;
    }
    // the card faces go back where the server put them, so a remount finds the markup it expects
    cleanups.push(() => { stopTimers(); unplace(); holds.forEach(h => h.remove()); });
    return {
      measure() {
        top = docTop(sec); len = Math.max(1, sec.offsetHeight - H); mob = walkMob();
        stT = steps.map(docTop);
        const avail = mob ? Math.min(W - 40, 560) : Math.min($(".dv-col", sec).offsetWidth - 30, 560);
        const vs = mob ? Math.min(avail / 540, (H * .54 - 78) / 520) : Math.min(1, avail / 540, (H - 110) / 520);
        // stacked, each card is fitted on its own (a tall list and a wide ticket want different scales)
        if (mob) place(); else unplace();
        scale.style.transform = `scale(${vs})`;
      },
      update(y: number) {
        // stacked, the page tint follows the step you're reading
        let f: number;
        if (mob) {
          const line = y + H * .5; let j = 0;
          while (j < 3 && line >= stT[j + 1]) j++;
          f = j < 3 ? clamp(j + (line - stT[j]) / (stT[j + 1] - stT[j]) - .25, 0, 3) : 3;
        } else f = clamp(clamp((y - top) / len) * 4 - .5, 0, 3);
        const i = Math.min(2, Math.floor(f)), m = smooth(clamp((f - i - .3) / .4));
        const wt = [0, 0, 0, 0]; wt[i] = 1 - m; wt[i + 1] = m;
        // fade the colour in as the section arrives and back to paper as it leaves
        howTint = [0, 1, 2].map(j => WASH.reduce((a, w, q) => a + w[j] * wt[q], 0));
        if (mob) return;
        const a = S[i], b = S[i + 1];
        dv.style.width = lerp(a.w, b.w, m) + "px"; dv.style.height = lerp(a.h, b.h, m) + "px";
        dv.style.borderRadius = lerp(a.r, b.r, m) + "px";
        dv.style.transform = `rotate(${lerp(a.rot, b.rot, m)}deg) translateY(${Math.sin(m * Math.PI) * -12}px)`;
        const ct = [0, 0, 0, 0]; ct[i] = smooth(clamp(1 - m * 1.8)); ct[i + 1] = smooth(clamp(m * 1.8 - .8));
        bgs.forEach((g, j) => g.style.opacity = String(wt[j]));
        notches.forEach(n => n.style.opacity = String(wt[1]));
        ls.forEach((l, j) => {
          const w = ct[j], dir = j <= i ? -1 : 1;
          l.style.opacity = String(w); l.style.visibility = w < .01 ? "hidden" : "visible";
          l.style.transform = `translate(-50%, -50%) translateY(${(1 - w) * 22 * dir}px) scale(${.94 + .06 * w})`;
          l.style.filter = w > .98 ? "none" : `blur(${(1 - w) * 10}px)`;
        });
        const act = Math.round(f);
        if (act !== active) {
          active = act;
          steps.forEach((s, j) => s.classList.toggle("on", j === act));
          rail.forEach((r, j) => r.classList.toggle("on", j === act));
          dv.style.setProperty("--hs", S[act].hs);
          enter(act);
        }
      }
    };
  })());

  /* ── the page colour ─────────────────────────────────────────────────────
     Paper tints in from one section to the next and back to paper between:
     How it works (its card's own colour) → the handoff in peach → fit in mint.
     The race and the FAQ stay plain paper, so the page has somewhere to rest. */
  scenes.push((() => {
    const wash = $("#wash"), col = $("#how .dv-col");
    const Z = ([["#how", () => howTint], ["#handoff", () => TINT.peach], ["#fit", () => TINT.mint]] as const).map(([id, c]) => ({ el: $(id), c, top: 0, h: 0 }));
    return {
      measure() { Z.forEach(z => { z.top = docTop(z.el); z.h = z.el.offsetHeight; }); },
      update(y: number) {
        let sum = 0; const mix = [0, 0, 0];
        Z.forEach(z => {
          const e = smooth(clamp((y + H * .6 - z.top) / (H * .6))) * smooth(clamp((z.top + z.h - H * .4 - y) / (H * .6)));
          if (!e) return; sum += e; const c = z.c(); for (let j = 0; j < 3; j++) mix[j] += c[j] * e;
        });
        const amt = Math.min(1, sum) * .9;
        const c = [0, 1, 2].map(j => Math.round(lerp(PAPER[j], sum ? mix[j] / sum : PAPER[j], amt)));
        wash.style.opacity = amt > 0 ? "1" : "0";
        wash.style.background = `rgb(${c})`;
        col.style.backgroundColor = walkMob() ? `rgb(${c})` : "";
      }
    };
  })());

  /* ── 4 · THE HANDOFF ─────────────────────────────────────────────────── */
  scenes.push((() => {
    const sec = $("#handoff"), yrs = $$(".yr", sec), lines = $$(".yr-line i", sec), seats = $$(".seat", sec), stays = $$(".stay", sec), nums = $$("[data-st]", sec), boardYr = $("#boardYr"), note = $("#boardNote");
    const BOARD = [
      [["DK", "Dana K.", "peach"], ["LM", "Leo M.", "mint"], ["IR", "Ivy R.", "sky"], ["OS", "Omar S.", "butter"]],
      [["PN", "Priya N.", "lilac"], ["JT", "Jordan T.", "sky"], ["IR", "Ivy R.", "sky"], ["BC", "Ben C.", "rose"]],
      [["MA", "Maya A.", "rose"], ["AP", "Alex P.", "peach"], ["SO", "Sam O.", "mint"], ["BC", "Ben C.", "rose"]],
    ];
    const STAY = [[18, 22, 7, 46], [29, 44, 7, 97], [41, 63, 8, 151]];
    const NOTE = ["3 open tasks follow the role to whoever holds it", "Jordan took over Leo’s 3 open tasks on day one", "Alex took over Jordan’s 2 open tasks on day one"];
    let top = 0, h = 1, yr = -1, manual = -1, bucket = -1;
    function show(y: number) {
      if (y === yr) return; const prev = yr; yr = y;
      yrs.forEach((b, j) => b.classList.toggle("on", j === y));
      lines.forEach((l, j) => l.style.transform = `scaleX(${j < y ? 1 : 0})`);
      boardYr.textContent = `${2024 + y}–${25 + y} board`;
      note.textContent = NOTE[y];
      seats.forEach((s, j) => {
        const [ini, name, c] = BOARD[y][j], who = $(".who", s), nw = $(".new", s);
        const changed = prev >= 0 && BOARD[prev][j][1] !== name;
        const paint = () => { who.innerHTML = `<i class="av" style="--a:var(--${c})">${ini}</i>${name}`; };
        nw.classList.toggle("on", changed);
        if (!changed) { paint(); return; }
        later(() => { who.classList.add("flip"); later(() => { paint(); who.classList.remove("flip"); }, 260); }, j * 90);
      });
      nums.forEach((n, j) => {
        const from = prev < 0 ? STAY[y][j] : STAY[prev][j], to = STAY[y][j], lbl = n.querySelector("small")!.outerHTML, t0 = performance.now();
        const f = () => { if (!alive) return; const t = clamp((performance.now() - t0) / 700); n.innerHTML = Math.round(lerp(from, to, eo(t))) + lbl; if (t < 1) requestAnimationFrame(f); };
        requestAnimationFrame(f);
        if (prev >= 0) { later(() => stays[j].classList.add("bump"), j * 60); later(() => stays[j].classList.remove("bump"), 300 + j * 60); }
      });
    }
    yrs.forEach((b, j) => b.addEventListener("click", () => { manual = j; show(j); }, on));
    show(0);
    return {
      measure() { top = absTop(sec); h = sec.offsetHeight; },
      update(y: number) {
        const p = clamp((y + H * .3 - top) / (h * .8));
        const b = p < .4 ? 0 : p < .7 ? 1 : 2;
        if (b !== bucket) { bucket = b; manual = -1; }
        show(manual >= 0 ? manual : b);
      }
    };
  })());

  /* ── 5 · FITS YOUR ORG ───────────────────────────────────────────────── */
  (() => {
    // real nav order; Dashboard, Timeline and Members come with every org
    const P: [string, string, string, number?][] = [["dash", "Dashboard", "butter", 1], ["timeline", "Timeline", "sky", 1], ["meetings", "Meetings", "sky"], ["tasks", "Tasks", "peach"],
      ["members", "Members", "lilac", 1], ["ig", "Instagram", "peach"], ["treasury", "Treasury", "mint"], ["service", "Service", "mint"],
      ["prog", "Programming", "lilac"], ["parties", "Parties", "rose"]];
    const onSet = new Set(["meetings", "treasury"]);
    const fxNav = $("#fxNav"), pv = $("#fxPv"), note = $("#fxNote"), acts = $$("#fxActs .act");
    let cur = "dash";
    fxNav.innerHTML = P.map(([id, l, c]) => `<div class="pv-it" data-id="${id}" style="--c:var(--${c})"><div><div class="pv-row"><i></i><span class="lb">${l}</span></div></div></div>`).join("");
    const items = $$(".pv-it", fxNav);
    function render() {
      items.forEach((it, i) => { const [id, , , always] = P[i]; it.classList.toggle("on", !!(always || onSet.has(id))); it.classList.toggle("cur", id === cur); });
      acts.forEach(a => a.classList.toggle("on", onSet.has(a.dataset.p!)));
      pv.style.setProperty("--hs", `var(--${P.find(p => p[0] === cur)![2]})`);
      later(placeNote, 560);
    }
    const mem = $('[data-id="members"]', fxNav), memL = $(".lb", mem);
    function placeNote() { note.style.setProperty("--ny", (mem.offsetTop + 2) + "px"); }
    acts.forEach(a => a.addEventListener("click", () => {
      const id = a.dataset.p!;
      if (onSet.has(id)) { onSet.delete(id); if (cur === id) cur = "dash"; } else { onSet.add(id); cur = id; }
      render();
    }, on));
    // renaming, shown rather than explained: the roster label cycles through what orgs actually call it
    const LABELS = ["Members", "Brothers", "Dancers", "Players", "Sisters", "Reps"];
    let w = 0;
    if (!RM) {
      const iv = setInterval(() => {
        const r = pv.getBoundingClientRect();
        if (r.bottom < 0 || r.top > H) return;
        memL.classList.add("out");
        later(() => { w = (w + 1) % LABELS.length; memL.textContent = LABELS[w]; memL.classList.remove("out"); }, 260);
      }, 1900);
      cleanups.push(() => clearInterval(iv));
    }
    render(); placeNote();
  })();

  /* ── FAQ ─────────────────────────────────────────────────────────────── */
  $$("#faqList .qa").forEach(qa => $("button", qa).addEventListener("click", () => {
    const open = !qa.classList.contains("open");
    $$("#faqList .qa").forEach(o => { o.classList.remove("open"); $("button", o).setAttribute("aria-expanded", "false"); });
    if (open) { qa.classList.add("open"); $("button", qa).setAttribute("aria-expanded", "true"); }
  }, on));

  /* ── close ───────────────────────────────────────────────────────────── */
  scenes.push((() => {
    const sec = $("#start"), hEl = $("#closeH");
    if (!$(".cw", hEl)) hEl.innerHTML = (hEl.textContent ?? "").split(" ").map(w => `<span class="cw">${w}</span>`).join(" ");
    const ws = $$(".cw", hEl);
    let top = 0;
    return {
      measure() { top = docTop(sec); },
      update(y: number) {
        const p = clamp((y + H - top) / (H * .95));
        ws.forEach((w, i) => w.style.opacity = String(lerp(.12, 1, clamp(p * (ws.length + 2) - i - 1))));
      }
    };
  })());

  /* ── the thread ──────────────────────────────────────────────────────────
     The one loose end the hero couldn't dock. It runs down the margins, crosses
     in the gaps between sections, ducks under the privacy card and is tied off
     into a knot behind the closing line. A needle leads it, drawn to wherever
     the reader is looking. */
  scenes.push((() => {
    const svg = $<SVGSVGElement>("#seam"), pg = $<SVGPathElement>("#seamPage"), kn = $<SVGPathElement>("#seamKnot"), ndl = $<SVGGElement>("#needle");
    // the knot, authored on a 1440 × 520 board and stretched across the close
    const KNOT: [string, ...number[]][] = [["M", -20, 120], ["C", 200, 40, 320, 260, 520, 180], ["S", 760, 20, 900, 160], ["S", 1060, 380, 1180, 250],
      ["C", 1260, 160, 1340, 200, 1300, 270], ["C", 1260, 340, 1190, 290, 1230, 230], ["C", 1290, 150, 1400, 210, 1470, 300]];
    const STEP = 8;
    let Lp = 1, Lk = 1, ymax: number[] = [], jy = 0, last = NaN;
    const curve = (P: number[][]) => P.map((p, i) => {
      if (!i) return `M${p[0]} ${p[1]}`;
      const a = P[i - 2] || P[i - 1], b = P[i - 1], d = P[i + 1] || p;
      return `C${b[0] + (p[0] - a[0]) / 6} ${b[1] + (p[1] - a[1]) / 6} ${p[0] - (d[0] - b[0]) / 6} ${p[1] - (d[1] - b[1]) / 6} ${p[0]} ${p[1]}`;
    }).join("");
    const box = (id: string) => { const el = $(id); const t = docTop(el); return [t, t + el.offsetHeight]; };
    function lenAt(y: number) {
      let lo = 0, hi = ymax.length - 1;
      if (hi < 0 || y <= ymax[0]) return 0;
      if (y >= ymax[hi]) return Lp;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ymax[m] < y) lo = m; else hi = m; }
      return (lo + (y - ymax[lo]) / Math.max(1e-3, ymax[hi] - ymax[lo])) * STEP;
    }
    function tip(path: SVGPathElement, l: number) {
      const p = path.getPointAtLength(l), q = path.getPointAtLength(Math.max(0, l - 4));
      ndl.setAttribute("transform", `translate(${p.x} ${p.y}) rotate(${Math.atan2(p.y - q.y, p.x - q.x) * 180 / Math.PI})`);
    }
    return {
      measure() {
        const wrapW = Math.min(1180, W - 32), gw = (W - wrapW) / 2, L = gw * .5, R = W - gw * .5, sw = gw * .3;
        const [, hb] = box("#top"), [ra, rb] = box("#ask"), [ha, hz] = box("#how"), [oa, oz] = box("#handoff"),
          [fa, fz] = box("#fit"), [pa, pz] = box("#trust"), [qa, qz] = box("#faq"), [ca] = box("#start");
        const kx = W / 1440, ky = ca + 30;
        jy = ky + 120;
        const P = [[-30, hb - 30],
          [L + sw, ra + 90], [L - sw, (ra + rb) / 2], [L + sw, rb - 70],
          [R, ha + 80], [R - sw, ha + (hz - ha) * .4], [R + sw, ha + (hz - ha) * .75], [R, hz - 50],
          [L, oa + 90], [L + sw, (oa + oz) / 2], [L, oz - 100],
          [R, fa + 30], [R - sw, (fa + fz) / 2], [R, fz - 60],
          [W * .62, (pa + pz) / 2],
          [L, qa + 80], [L + sw, (qa + qz) / 2], [L, qz - 60],
          [-20 * kx, jy]];
        pg.setAttribute("d", curve(P));
        kn.setAttribute("d", KNOT.map(([c, ...n]) => c + n.map((v, i) => i % 2 ? v + ky : v * kx).join(" ")).join(""));
        svg.style.height = (ky + 560) + "px";
        Lp = pg.getTotalLength(); Lk = kn.getTotalLength();
        pg.style.strokeDasharray = String(Lp); kn.style.strokeDasharray = String(Lk);
        ymax = []; let m = -Infinity;
        for (let l = 0; l <= Lp; l += STEP) { m = Math.max(m, pg.getPointAtLength(l).y); ymax.push(m); }
        last = NaN;
      },
      update(y: number) {
        if (y === last) return; last = y;
        if (RM) { pg.style.strokeDashoffset = kn.style.strokeDashoffset = "0"; return; }
        const lead = y + H * .72, lp = lenAt(lead), kp = clamp((lead - jy) / (H * .9));
        pg.style.strokeDashoffset = String(Lp - lp);
        kn.style.strokeDashoffset = String(Lk * (1 - kp));
        const live = lp > 1 && kp < 1;
        ndl.classList.toggle("on", live);
        if (live) { if (lp < Lp) tip(pg, lp); else tip(kn, kp * Lk); }
      }
    };
  })());

  /* ── travellers ──────────────────────────────────────────────────────────
     An object lifts out of one section and is set down in the next while the
     page scrolls beneath it: the question you'd ask leaves the hero and becomes
     the race, the answer's date becomes the Timeline's next event, and the
     Treasurer role leaves the budget for next year's board. */
  const fly = $("#fly"), T: Traveller[] = [];
  cleanups.push(() => { fly.replaceChildren(); T.forEach(o => { o.src.style.visibility = o.dst.style.visibility = ""; }); });
  const rect = (el: Element) => el.getBoundingClientRect();
  function traveller(o: Partial<Traveller>) { const t = o as Traveller; t.el = document.createElement("div"); t.el.className = "tv"; fly.append(t.el); t.state = -1; t.init(t); T.push(t); return t; }
  // the same object on both ends: crossfade a copy of each, scaled to the box in flight
  const carry = (src: HTMLElement, dst: HTMLElement, o: CarryOpts) => traveller(Object.assign({ src, dst, arc: 50, rot: -4, fade: .25,
    init(o: Traveller) {
      o.fs = [src, dst].map(n => { const f = document.createElement("div"); f.className = "tv-f"; const c = n.cloneNode(true) as HTMLElement; c.removeAttribute("id"); c.style.visibility = ""; f.append(c); o.el.append(f); return f; });
    },
    measure(o: Traveller) {
      o.ws = [src, dst].map((n, i) => {
        const c = o.fs[i].firstChild as HTMLElement, cs = getComputedStyle(n);
        c.style.font = cs.font; c.style.letterSpacing = cs.letterSpacing;
        c.style.background = cs.backgroundColor; c.style.color = cs.color; c.style.borderColor = cs.borderColor; c.style.width = n.offsetWidth + "px"; c.style.margin = "0";
        return n.offsetWidth;
      });
    },
    paint(o: Traveller, t: number) {
      const a = rect(src), b = rect(dst), s = Math.sin(Math.PI * t), lift = 1 + s * .12;
      const w = lerp(a.width, b.width, t), h = lerp(a.height, b.height, t);
      const x = lerp(a.left, b.left, smooth(t)), y = lerp(a.top, b.top, t) - s * o.arc;
      o.el.style.width = w + "px"; o.el.style.height = h + "px";
      o.el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${s * o.rot}deg)`;
      const f = smooth(clamp((t - o.fade) / .3));
      o.fs.forEach((fc, i) => { fc.style.opacity = String(i ? f : 1 - f); fc.style.transform = `scale(${w / o.ws[i] * lift})`; });
    } }, o));

  const askPiece = $('.pc[data-k="ask"]'), askQ = $("#askQ"), Q = askQ.textContent ?? "";
  traveller({
    src: askPiece, dst: askQ,
    // on a phone the bar would sail over the race's headline and copy for a screen and a half
    enabled: () => !MOB,
    init(o) {
      o.el.classList.add("tv-ask");
      o.el.innerHTML = '<svg class="ic sp"><use href="#i-spark"/></svg><span class="ty"></span><span class="ph">Ask Chapt anything…</span><kbd>⌘K</kbd>';
      [o.sp, o.ty, o.ph, o.kb] = [...o.el.children] as HTMLElement[];
    },
    range() { const top = docTop($("#top")); return [top + ($("#top").offsetHeight - H) * .9, race.pre(askQ) - H * .5]; },
    // the bar you'd type into becomes the question, typed as you scroll
    paint(o, t) {
      const a = rect(askPiece), b = rect(askQ), s = Math.sin(Math.PI * t), st = o.el.style;
      const w = lerp(a.width, b.width, t), h = lerp(a.height, b.height, t);
      st.width = w + "px"; st.height = h + "px";
      st.transform = `translate3d(${lerp(a.left, b.left, smooth(t))}px, ${lerp(a.top, b.top, t) - s * 40}px, 0) rotate(${s * -3}deg)`;
      const k = smooth(clamp((t - .58) / .16)) * 100;
      st.background = `color-mix(in srgb, var(--ink) ${k}%, var(--card))`;
      st.color = `color-mix(in srgb, var(--paper) ${k}%, var(--ink))`;
      st.borderColor = `color-mix(in srgb, var(--ink) ${k}%, var(--line))`;
      const r = lerp(12, 16, t);
      st.borderRadius = `${r}px ${r}px ${lerp(12, 5, t)}px ${r}px`;
      st.padding = `${lerp(0, 7.5, t)}px ${lerp(10, 12.5, t)}px`;
      st.fontSize = lerp(.76, .9, t) + "rem";
      st.boxShadow = `0 ${s * 18}px ${s * 34}px -12px rgba(38,33,27,${s * .3})`;
      o.ty.textContent = Q.slice(0, Math.round(clamp((t - .08) / .55) * Q.length));
      o.ph.style.display = t > .08 ? "none" : "";
      const g = 1 - clamp((t - .5) / .3);
      o.sp.style.width = 14 * g + "px"; o.sp.style.marginRight = 8 * g + "px"; o.sp.style.opacity = String(g); o.kb.style.opacity = String(g);
    }
  });
  const vDate = $("#vDate"), tlNow = $("#tlNow");
  carry(vDate, tlNow, { fade: .08,
    enabled: () => !walkMob() && $("#fastVerdict").classList.contains("on"),
    range() { const y0 = Math.max(race.end, race.top(vDate) - H * .35); return [y0, Math.max(y0 + 300, docTop($("#how")) - (walkMob() ? H * .1 : 0))]; }
  });
  // the approved deadline drops onto the Timeline next to the meeting
  const wrDl = $("#wrDl"), tlDl = $("#tlDl");
  carry(wrDl, tlDl, { fade: .2, arc: 80, rot: 5,
    enabled: () => !walkMob() && $("#writ").classList.contains("ok"),
    range() { const y0 = Math.max(race.end, race.top(wrDl) - H * .5); return [y0, Math.max(y0 + 300, docTop($("#how")) - (walkMob() ? H * .1 : 0))]; }
  });
  const bdRole = $("#bdRole"), boardRole = $("#boardRole");
  carry(bdRole, boardRole, { arc: 70, rot: 6,
    // How it works is still on a phone, so nothing flies into or out of its cards there
    enabled: () => !walkMob(),
    range() { const s = $("#how"), y0 = docTop(s) + (s.offsetHeight - H) * .97 - (walkMob() ? H * .2 : 0); return [y0, Math.max(y0 + 300, docTop(boardRole) - H * .6)]; }
  });
  scenes.push({
    measure() { T.forEach(o => { [o.y0, o.y1] = o.range(); o.measure?.(o); o.state = -1; }); },
    update(y: number) {
      T.forEach(o => {
        const t = (y - o.y0) / (o.y1 - o.y0);
        const st = RM || (o.enabled && !o.enabled()) ? 3 : t <= 0 ? 0 : t >= 1 ? 2 : 1;
        if (st !== o.state) {
          const was = o.state; o.state = st;
          o.src.style.visibility = st === 1 || st === 2 ? "hidden" : "";
          o.dst.style.visibility = st === 0 || st === 1 ? "hidden" : "";
          o.el.classList.toggle("on", st === 1);
          if (st === 2 && was !== 2 && o.land) o.land();
        }
        if (st === 1) o.paint(o, t);
      });
    }
  });

  /* ── scroll-linked depth ─────────────────────────────────────────────────
     e: 0 as an element's top meets the bottom of the screen, 1 a screen later.
     c: where its middle sits against the screen's middle (0 centred, ±1 a screen away).
     Only translate / rotate / scale are touched, so the reveal transitions keep theirs. */
  type Fx = { el: HTMLElement; fn: (el: HTMLElement, e: number, c: number, i: number) => void; i: number; t: number; h: number };
  const FX: Fx[] = [];
  const fx = (sel: string, fn: Fx["fn"]) => $$(sel).forEach((el, i) => FX.push({ el, fn, i, t: 0, h: 0 }));
  // headings sit a little further back than the page
  fx(".hd, .walk-head, .priv-in > div:first-child", (el, e, c) => { el.style.translate = `0 ${c * -45}px`; });
  // the two lanes swing in from either side and settle as one
  fx("#raceBox .lane", (el, e, c, i) => { const k = 1 - eo(clamp(e / .8)), d = i ? 1 : -1;
    el.style.translate = `${d * k * (MOB ? 26 : 90)}px ${race.pinned ? 0 : c * (i ? -26 : 26)}px`; el.style.rotate = `${d * k * 4}deg`; });
  fx(".board", (el, e, c) => { el.style.translate = `0 ${c * -30}px`; el.style.rotate = `${-.8 + (1 - eo(clamp(e / .8))) * -3}deg`; });
  fx(".stays .stay", (el, e, c, i) => { const k = 1 - eo(clamp((e - i * .06) / .65)); el.style.translate = `${k * (MOB ? 30 : 70)}px ${c * 24}px`; });
  fx("#fxPv", (el, e, c) => { const k = 1 - eo(clamp(e / .85)); el.style.translate = `${k * (MOB ? 30 : 90)}px ${c * -50}px`; el.style.rotate = `${1.5 + k * 8}deg`; });
  fx("#fxActs .act", (el, e, c, i) => { const k = 1 - eo(clamp((e - .1 - i * .04) / .5)); el.style.translate = `${k * -50}px 0`; el.style.opacity = String(1 - k); });
  // the privacy card opens out to full size as it arrives
  fx("#trust", (el, e) => { const k = eo(clamp(e / .75)); el.style.scale = String(lerp(.9, 1, k)); el.style.borderRadius = lerp(72, MOB ? 26 : 32, k) + "px"; });
  fx("#trust .pp", (el, e, c, i) => { el.style.translate = `0 ${c * (i ? -60 : -30)}px`; });
  fx("#faqList .qa", (el, e, c, i) => { const k = 1 - eo(clamp((e - i * .05) / .55)); el.style.translate = `0 ${k * 50}px`; el.style.opacity = String(1 - k); });
  fx("#closeH", (el, e) => { el.style.scale = String(lerp(.9, 1, eo(clamp(e / .9)))); });
  scenes.push({
    measure() { FX.forEach(f => { f.t = docTop(f.el); f.h = f.el.offsetHeight; }); },
    update(y: number) {
      if (RM) return;
      FX.forEach(f => {
        const e = (y + H - f.t) / H, c = (f.t + f.h / 2 - y - H / 2) / H;
        if (e < -.25 || c < -1.8) return; // well off screen: leave it where it was
        f.fn(f.el, clamp(e), c, f.i);
      });
    }
  });

  /* ── loop ────────────────────────────────────────────────────────────── */
  // on touch, H is the height the page loaded at (browser bar showing) until the width changes:
  // the bar sliding away mid-scroll would otherwise re-place every pinned scene under your thumb
  function measureAll() { if (!alive) return; if (!TOUCH || innerWidth !== W) H = innerHeight; W = innerWidth; MOB = W < 760; readWash(); scenes.forEach(s => s.measure?.()); }
  addEventListener("pointermove", e => { mouse.tx = e.clientX / W * 2 - 1; mouse.ty = e.clientY / H * 2 - 1; }, { passive: true, signal: ac.signal });
  let rt = 0; const remeasure = () => { cancel(rt); rt = later(measureAll, 120); };
  // a height-only resize on touch is the browser bar: only the hero, whose stage tracks it, re-fits
  let ht = 0;
  addEventListener("resize", () => {
    if (!TOUCH || innerWidth !== W) remeasure();
    else { cancel(ht); ht = later(() => { if (alive) hero.measure(); }, 80); }
  }, on);
  // FAQ answers and the fit preview change the page's height; everything below has to re-measure
  const ro = new ResizeObserver(remeasure); ro.observe($("main", root));
  cleanups.push(() => ro.disconnect());
  function frame(t: number) {
    now = t;
    const prev = cur, tgt = scrollY;
    cur += (tgt - cur) * (RM || TOUCH ? 1 : .11);
    if (Math.abs(tgt - cur) < .1) cur = tgt;
    vel = lerp(vel, cur - prev, .18);
    if (!RM && W > 760) { mouse.x = lerp(mouse.x, mouse.tx, .06); mouse.y = lerp(mouse.y, mouse.ty, .06); }
    scenes.forEach(s => s.update(cur));
    raf = requestAnimationFrame(frame);
  }
  measureAll();
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(measureAll);
  raf = requestAnimationFrame(frame);

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    ac.abort();
    timeouts.forEach(id => clearTimeout(id)); timeouts.clear();
    cleanups.forEach(fn => fn());
  };
}
