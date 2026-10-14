/* What happens when you delete an event from the timeline — _design/Event Delete Tear
   Mock.html, played on the real spine. The add stamp's twin: add lands a mint ON THE
   TIMELINE stamp, delete lands a rose OFF THE TIMELINE one, then the card is torn off.

   The slip drops away, a rose pen strikes the title through twice, the stamp thunks
   down (the card gives, a little ink kicks out), a rip runs down the card and its
   halves part, pop and fall with a few scraps. The spine dot pops and the slot closes:
   the rows below glide up and settle, and a month left empty folds away with it.

   Putting it back (Undo, or a DELETE that failed after the tear) plays it backwards:
   the slot reopens, the halves fly up onto the card, washi tape lands over the seam,
   the strike and stamp lift, then the tape peels. A failure that's known before the
   tear never tears at all: the stamp lifts and the card blushes where it stands.

   Plain DOM + Web Animations, like event-landing.ts. The page keeps the row mounted
   until `exit` resolves (its slot has closed), then drops the event from its state;
   to put it back it re-adds the event and hands over the fresh row. The pieces live
   on <body> as frozen copies of the card, so they outlive the row. */

import { docTop, glideTo, reducedMotion, scrollPlan } from "./event-landing";

const NS = "http://www.w3.org/2000/svg";
const TEAR_AT = 1260;   // strike, stamp and a beat of stillness come first

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
/** Played backwards, a delayed animation's `finished` can hang in Chrome (its time
 *  runs on below 0), so every wait on a reversed animation is capped. */
const settle = (anims: Animation[], ms: number) => Promise.race([Promise.all(anims.map(a => a.finished.catch(() => {}))), wait(ms)]);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const buzz = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* not allowed here */ } };
const cssVar = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim();

const stampDate = (date: string) => {
  try { return new Date(`${date}T12:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase(); }
  catch { return date; }
};

/* ── The slip ───────────────────────────────────────────────────────────────── */

/** The open delete slip as it looked when Delete was pressed, taken before the dialog
 *  unmounts so it can drop away instead of vanishing. */
export interface SlipShot { panel: HTMLElement; rect: DOMRect; scrim: HTMLElement | null }

export function shootSlip(): SlipShot | null {
  const panel = document.querySelector<HTMLElement>(".tl-del-slip")?.closest<HTMLElement>(".ui-modal-panel");
  if (!panel) return null;
  const ghost = panel.cloneNode(true) as HTMLElement;
  ghost.querySelectorAll("[id]").forEach(n => n.removeAttribute("id"));
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  const scrim = panel.parentElement?.querySelector<HTMLElement>(".ui-modal-scrim");
  return { panel: ghost, rect: panel.getBoundingClientRect(), scrim: scrim ? (scrim.cloneNode(false) as HTMLElement) : null };
}

export function dropSlip(shot: SlipShot | null) {
  if (!shot) return;
  const sheet = matchMedia("(max-width: 640px)").matches;
  const { panel: g, rect: r, scrim } = shot;
  if (scrim) {
    Object.assign(scrim.style, { position: "fixed", inset: "0", zIndex: "49", pointerEvents: "none" });
    document.body.append(scrim);
    scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reducedMotion() ? 1 : 340, easing: "ease", fill: "forwards" }).onfinish = () => scrim.remove();
  }
  Object.assign(g.style, {
    position: "fixed", zIndex: "50", margin: "0", pointerEvents: "none", maxWidth: "none", maxHeight: "none", animation: "none",
    left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
  });
  document.body.append(g);
  g.animate(sheet
    ? [{ transform: "none" }, { transform: "translateY(105%)" }]
    : [{ transform: "none", opacity: 1 }, { transform: "translateY(18px) rotate(1.2deg) scale(.96)", opacity: 0 }],
  { duration: reducedMotion() ? 1 : sheet ? 240 : 220, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" }).onfinish = () => g.remove();
}

/* ── Frozen copies ──────────────────────────────────────────────────────────── */

/** A copy of the card that looks the same anywhere: every element's computed style
 *  inlined (the page's styles are scoped under .dash, and the pieces live on <body>),
 *  ::before dots stood in for by spans, motion switched off. */
function freeze(el: HTMLElement): HTMLElement {
  const copy = el.cloneNode(true) as HTMLElement;
  const pairs: [Element, HTMLElement][] = [];
  const walk = (s: Element, d: HTMLElement) => { pairs.push([s, d]); [...s.children].forEach((c, i) => walk(c, d.children[i] as HTMLElement)); };
  walk(el, copy);
  for (const [s, d] of pairs) {
    const cs = getComputedStyle(s);
    for (let i = 0; i < cs.length; i++) {
      const k = cs[i];
      if (k.startsWith("transition") || k.startsWith("animation") || k === "visibility" || k === "cursor") continue;
      d.style.setProperty(k, cs.getPropertyValue(k));
    }
  }
  for (const [s, d] of pairs) {
    const before = getComputedStyle(s, "::before");
    if (before.content && before.content !== "none" && before.content !== "normal" && before.position !== "absolute") {
      const dot = document.createElement("span");
      Object.assign(dot.style, { display: "inline-block", flexShrink: "0", width: before.width, height: before.height, borderRadius: before.borderRadius, background: before.backgroundColor, marginRight: before.marginRight });
      d.prepend(dot);
    }
  }
  copy.querySelectorAll("[id]").forEach(n => n.removeAttribute("id"));
  copy.setAttribute("aria-hidden", "true");
  copy.inert = true;
  Object.assign(copy.style, { margin: "0", transform: "none", translate: "none", scale: "none", rotate: "none", position: "absolute", left: "0", top: "0" });
  return copy;
}

/* ── The pen and the stamp ──────────────────────────────────────────────────── */

/** Two strokes through the title, the second coming back a little lower. */
function strikeThrough(card: HTMLElement, drawn: boolean): SVGSVGElement | null {
  const t = card.querySelector<HTMLElement>(".t");
  if (!t) return null;
  const range = document.createRange();
  range.selectNodeContents(t);
  const tr = range.getBoundingClientRect(), box = t.getBoundingClientRect(), cr = card.getBoundingClientRect();
  const w = Math.max(24, Math.min(tr.width, box.width)), h = box.height, y = h * .56;
  const s = document.createElementNS(NS, "svg");
  s.classList.add("tl-strike");
  s.setAttribute("aria-hidden", "true");
  // inside the card's border box: absolute children sit on its padding box
  const bl = parseFloat(getComputedStyle(card).borderLeftWidth) || 0, bt = parseFloat(getComputedStyle(card).borderTopWidth) || 0;
  Object.assign(s.style, { left: `${box.left - cr.left - bl}px`, top: `${box.top - cr.top - bt}px`, width: `${w}px`, height: `${h}px` });
  s.innerHTML = `<path pathLength="1" d="M -4 ${y + 1.5} C ${w * .28} ${y - 2}, ${w * .62} ${y + 2.5}, ${w + 6} ${y - .8}"/>`
    + `<path pathLength="1" d="M ${w + 3} ${y + 3.4} C ${w * .7} ${y + 5}, ${w * .32} ${y + 1}, -2 ${y + 4.4}"/>`;
  card.append(s);
  if (!drawn) {
    const [p1, p2] = s.querySelectorAll("path");
    p1.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 240, easing: "cubic-bezier(.5,0,.3,1)", fill: "backwards" });
    p2.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 200, delay: 210, easing: "cubic-bezier(.4,0,.3,1)", fill: "backwards" });
  }
  return s;
}

/** OFF THE TIMELINE: the add stamp, in rose. */
function stampOff(card: HTMLElement, date: string, landed: boolean): HTMLElement {
  const s = document.createElement("span");
  s.className = "tl-stamp off";
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = `OFF THE TIMELINE<small>${stampDate(date)}</small>`;
  card.append(s);
  if (landed) return s;
  s.animate([
    { opacity: 0, transform: "translateY(-50%) rotate(-17deg) scale(2.3)", filter: "blur(1.5px)" },
    { opacity: 1, transform: "translateY(-50%) rotate(-7deg) scale(.94)", filter: "blur(0)", offset: .6 },
    { opacity: 1, transform: "translateY(-50%) rotate(-8deg) scale(1)" },
  ], { duration: 320, easing: "cubic-bezier(.3,0,.2,1)", fill: "backwards" });
  card.animate([{ translate: "0 0", scale: "1" }, { translate: "0 2px", scale: ".985", offset: .3 }, { translate: "0 0", scale: "1" }],
    { duration: 360, delay: 190, easing: "ease-out", composite: "add" });
  setTimeout(() => buzz(14), 190);
  const r = card.getBoundingClientRect(), sr = s.getBoundingClientRect();
  const cx = sr.left - r.left + sr.width / 2, cy = sr.top - r.top + sr.height / 2;
  for (let n = 0; n < 8; n++) {
    const a = (n / 8) * Math.PI * 2 + Math.random() * .5, dist = sr.width * .34 + 4 + Math.random() * 10, sz = 2 + Math.random() * 3;
    const d = document.createElement("i");
    d.className = "tl-splat off";
    Object.assign(d.style, { left: `${cx - sz / 2}px`, top: `${cy - sz / 2}px`, width: `${sz}px`, height: `${sz}px` });
    card.append(d);
    d.animate([
      { transform: "translate(0,0) scale(.4)", opacity: 0 },
      { transform: `translate(${Math.cos(a) * dist * .7}px, ${Math.sin(a) * dist * .4}px) scale(1)`, opacity: .9, offset: .35 },
      { transform: `translate(${Math.cos(a) * dist}px, ${Math.sin(a) * dist * .55}px) scale(.6)`, opacity: 0 },
    ], { duration: 600, delay: 190, easing: "cubic-bezier(.2,.7,.3,1)", fill: "both" }).onfinish = () => d.remove();
  }
  return s;
}

/** Lift the ink off a card that's staying: the stamp rises away, the strokes retract. */
function liftInk(card: HTMLElement) {
  card.querySelectorAll<HTMLElement>(".tl-stamp.off").forEach(s => {
    s.getAnimations().forEach(a => a.cancel());
    s.animate([{ opacity: 1, transform: "translateY(-50%) rotate(-8deg)" }, { opacity: 0, transform: "translateY(-60%) rotate(-3deg) scale(1.08)" }],
      { duration: 300, easing: "ease-in", fill: "forwards" }).onfinish = () => s.remove();
  });
  card.querySelectorAll<SVGSVGElement>(".tl-strike").forEach(st => {
    st.querySelectorAll("path").forEach((p, n) => {
      p.getAnimations().forEach(a => a.cancel());
      p.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: -1 }], { duration: 260, delay: n ? 0 : 120, easing: "cubic-bezier(.5,0,.5,1)", fill: "forwards" });
    });
    setTimeout(() => st.remove(), 420);
  });
}

/* ── Falling ────────────────────────────────────────────────────────────────── */

/** A thrown piece of paper: a little pop as it comes free, then gravity. */
function fallFrames({ ox = 0, ro = 0, dx, rot, v0, fallY, n = 28 }: { ox?: number; ro?: number; dx: number; rot: number; v0: number; fallY: number; n?: number }): Keyframe[] {
  const g = 2 * (fallY - v0), f: Keyframe[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let x: number, y: number, r: number, o = 1;
    if (t < .14) { const q = 1 - (1 - t / .14) ** 2; x = ox * q; y = 0; r = ro * q; }
    else {
      const s = (t - .14) / .86;
      x = ox + dx * s; y = v0 * s + .5 * g * s * s; r = ro + rot * s * (.55 + .45 * s);
      if (s > .52) o = Math.max(0, 1 - ((s - .52) / .48) ** 1.3);
    }
    f.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${r.toFixed(2)}deg)`, opacity: +o.toFixed(3) });
  }
  return f;
}

/** Shut an element's box (height, padding, margins, borders) to nothing. */
function shut(el: HTMLElement, duration: number, fade = false): Animation {
  const cs = getComputedStyle(el), h = el.offsetHeight;
  const from: Keyframe = { height: `${h}px`, minHeight: `${h}px`, marginTop: cs.marginTop, marginBottom: cs.marginBottom, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, borderTopWidth: cs.borderTopWidth, borderBottomWidth: cs.borderBottomWidth };
  const to: Keyframe = { height: "0px", minHeight: "0px", marginTop: "0px", marginBottom: "0px", paddingTop: "0px", paddingBottom: "0px", borderTopWidth: "0px", borderBottomWidth: "0px" };
  if (fade) { from.opacity = 1; to.opacity = 0; }
  el.style.overflow = "hidden";
  return el.animate([from, to], { duration, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards" });
}
/** The same box, opening from nothing (a row React just put back). */
function open(el: HTMLElement, duration: number, fade = false): Animation {
  const a = shut(el, duration, fade);
  a.pause();
  a.currentTime = duration;
  a.playbackRate = -1;
  a.play();
  a.finished.then(() => { a.cancel(); el.style.overflow = ""; }).catch(() => {});
  return a;
}

/** The month header over a row's group, when nothing else in the group is staying. */
function lonelyHeader(row: HTMLElement): HTMLElement | null {
  const spine = row.parentElement;
  if (!spine?.classList.contains("spine")) return null;
  const others = [...spine.children].filter(r => r !== row && r.classList.contains("tl-row") && !(r as HTMLElement).dataset.going);
  if (others.length) return null;
  const head = spine.previousElementSibling as HTMLElement | null;
  return head?.classList.contains("tl-month") ? head : null;
}

/* ── Tearing ────────────────────────────────────────────────────────────────── */

export interface Tear {
  /** True once the row's slot has closed (the page may drop the event now); false
   *  when it was stopped before it tore. */
  exit: Promise<boolean>;
  /** Everything has played out, the pieces included. */
  done: Promise<void>;
  /** The server already said no: don't tear what isn't gone. True if it was stopped
   *  in time (the card is still whole, under its stamp). */
  stop(): boolean;
  /** Put it back on the row, which the page has just re-added (or never removed). */
  putBack(row: () => HTMLElement | null, opts: { fail: boolean; main: HTMLElement | null }): Promise<void>;
  /** It's gone for good. */
  finish(): void;
}

export function tearRow({ row, date }: { row: HTMLElement; date: string }): Tear {
  const card = row.querySelector<HTMLElement>(".tl-card") ?? row;
  row.dataset.going = "1";
  let stopped = false, torn = false;
  const pieces: HTMLElement[] = [], falls: Animation[] = [];
  let tearX = 0, cardBox: DOMRect | null = null, wash: Animation | null = null;

  if (reducedMotion()) {
    return {
      exit: Promise.resolve(true),
      done: Promise.resolve(),
      stop: () => false,
      putBack: async () => {},
      finish: () => {},
    };
  }

  let resolveDone!: () => void;
  const done = new Promise<void>(r => { resolveDone = r; });

  const exit = (async () => {
    strikeThrough(card, false);
    wash = card.animate([{ backgroundColor: getComputedStyle(card).backgroundColor }, { backgroundColor: cssVar(card, "--tl-del-wash") }], { duration: 360, fill: "forwards" });
    card.animate([{ translate: "0 0", rotate: "0deg" }, { translate: "0 -1px", rotate: "-.25deg", offset: .5 }, { translate: "0 0", rotate: "0deg" }],
      { duration: 420, easing: "ease-in-out", composite: "add" });
    await wait(400);
    stampOff(card, date, false);
    await wait(TEAR_AT - 400);
    if (stopped) { resolveDone(); return false; }
    torn = true;

    // the rip runs down the card…
    const b = card.getBoundingClientRect();
    cardBox = b;
    const cx = b.width * rand(.5, .62), n = 10, pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= n; i++) pts.push({ x: cx + (i === 0 || i === n ? rand(-4, 4) : rand(-9, 9)) + Math.sin(i * 1.7) * 3, y: -3 + (b.height + 6) * i / n });
    tearX = cx;
    const rip = document.createElementNS(NS, "svg");
    rip.classList.add("tl-rip");
    rip.setAttribute("width", String(b.width)); rip.setAttribute("height", String(b.height));
    rip.innerHTML = `<path pathLength="1" d="M ${pts.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")}"/>`;
    card.append(rip);
    rip.querySelector("path")!.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 170, easing: "cubic-bezier(.6,0,.4,1)", fill: "both" });
    card.animate([{ translate: "0 0", scale: "1 1" }, { translate: "-1.5px 0", scale: "1.006 1", offset: .35 }, { translate: "1px 0", scale: "1 1", offset: .7 }, { translate: "0 0", scale: "1 1" }],
      { duration: 200, composite: "add" });
    buzz([6, 40, 10]);
    await wait(190);
    rip.remove();

    // …and it comes apart: two frozen halves on <body>, the card itself hidden
    const frozen = freeze(card);
    const P = pts.map(p => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(", ");
    const ccs = getComputedStyle(card);
    const edge = `<svg class="tl-piece-edge" style="left:-${ccs.borderLeftWidth};top:-${ccs.borderTopWidth}" width="${b.width}" height="${b.height}" aria-hidden="true"><polyline points="${pts.map(q => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")}"/></svg>`;
    const piece = (clip: string, origin: string) => {
      const p = document.createElement("div");
      p.className = "tl-piece";
      p.setAttribute("aria-hidden", "true");
      Object.assign(p.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px`, transformOrigin: origin });
      const c = frozen.cloneNode(true) as HTMLElement;
      c.style.clipPath = clip;
      c.insertAdjacentHTML("beforeend", edge);
      p.append(c);
      document.body.append(p);
      pieces.push(p);
      return p;
    };
    const left = piece(`polygon(-4px -3px, ${P}, -4px ${b.height + 3}px)`, `${cx * .5}px ${b.height / 2}px`);
    const right = piece(`polygon(${b.width + 4}px -3px, ${P}, ${b.width + 4}px ${b.height + 3}px)`, `${cx + (b.width - cx) / 2}px ${b.height / 2}px`);
    card.style.visibility = "hidden";
    falls.push(
      left.animate(fallFrames({ ox: -7, ro: -2.2, dx: -rand(40, 60), rot: -rand(9, 14), v0: -rand(55, 75), fallY: rand(230, 270) }), { duration: 1150, fill: "forwards" }),
      right.animate(fallFrames({ ox: 7, ro: 2.6, dx: rand(55, 80), rot: rand(14, 20), v0: -rand(40, 60), fallY: rand(280, 330) }), { duration: 1200, delay: 50, fill: "forwards" }),
    );
    // scraps from the rip
    for (let i = 0; i < 6; i++) {
      const q = pts[1 + Math.floor(Math.random() * (n - 1))], sz = rand(5, 9);
      const s = document.createElement("i");
      s.className = "tl-scrap";
      Object.assign(s.style, { left: `${b.left + q.x - sz / 2}px`, top: `${b.top + q.y - sz / 2}px`, width: `${sz}px`, height: `${sz}px`,
        clipPath: `polygon(${rand(0, 40)}% 0, 100% ${rand(20, 60)}%, ${rand(20, 80)}% 100%, 0 ${rand(30, 80)}%)` });
      document.body.append(s);
      s.animate(fallFrames({ ox: rand(-6, 6), dx: rand(-50, 50), rot: rand(-240, 240), v0: -rand(40, 90), fallY: rand(140, 220), n: 16 }),
        { duration: rand(800, 1050), delay: rand(0, 80), fill: "both" }).onfinish = () => s.remove();
    }
    // the spine dot pops, the date goes with the card
    const dot = row.querySelector<HTMLElement>(".tl-node .dot");
    dot?.animate([{ scale: "1" }, { scale: "1.5", offset: .3 }, { scale: "0" }], { duration: 300, delay: 80, easing: "cubic-bezier(.3,0,.4,1)", fill: "forwards" });
    row.querySelector<HTMLElement>(".tl-date")?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: "forwards" });

    // and the slot closes behind it
    await wait(280);
    const head = lonelyHeader(row);
    const closing = [shut(row, 480), ...(head ? [shut(head, 480, true)] : [])];
    const below = (() => {
      const all = [...document.querySelectorAll<HTMLElement>(".tl-layout .spine > .tl-row")];
      return all.slice(all.indexOf(row) + 1).filter(r => !r.dataset.going).slice(0, 5);
    })();
    await Promise.all(closing.map(a => a.finished.catch(() => {})));
    // the rows below settle with a little give
    below.forEach((r, i) => r.animate([{ translate: "0 0" }, { translate: "0 -3px", offset: .35 }, { translate: "0 .5px", offset: .7 }, { translate: "0 0" }],
      { duration: 380, delay: i * 40, easing: "ease-out" }));
    Promise.all(falls.map(a => a.finished.catch(() => {}))).then(() => resolveDone());
    return true;
  })();

  return {
    exit,
    done,
    stop() {
      if (torn) return false;
      stopped = true;
      return true;
    },
    async putBack(get, { fail, main }) {
      await done;
      const fresh = get();
      if (!torn) {
        // it never tore: the same card, still under its stamp
        wash?.cancel();
        liftInk(card);
        delete row.dataset.going;
        if (fail) blush(card, true);
        return;
      }
      if (!fresh) { pieces.forEach(p => p.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" }).onfinish = () => p.remove()); return; }
      const nc = fresh.querySelector<HTMLElement>(".tl-card") ?? fresh;
      nc.style.visibility = "hidden";
      // the slot reopens (and its month, if that went too), brought into view if it's off screen
      const head = lonelyHeader(fresh);
      const opening = [open(fresh, 400), ...(head ? [open(head, 400, true)] : [])];
      if (main) {
        const want = scrollPlan(main, docTop(main, fresh), nc.offsetHeight, false);
        if (Math.abs(want - main.scrollTop) > 1) glideTo(main, want, 420);
      }
      await settle(opening, 460);
      // the halves fly back up onto the card, wherever it is now
      const nb = nc.getBoundingClientRect();
      if (cardBox) for (const p of pieces) {
        p.style.left = `${parseFloat(p.style.left) + nb.left - cardBox.left}px`;
        p.style.top = `${parseFloat(p.style.top) + nb.top - cardBox.top}px`;
      }
      falls.forEach(a => { a.playbackRate = -1.6; a.play(); });
      fresh.querySelector<HTMLElement>(".tl-node .dot")?.animate([{ scale: "0" }, { scale: "1.4", offset: .6 }, { scale: "1" }], { duration: 360, delay: 380, easing: "cubic-bezier(.3,0,.3,1)", fill: "backwards" });
      await settle(falls, 900);
      // whole again, ink still on it, taped over the seam
      nc.style.visibility = "";
      pieces.forEach(p => p.remove());
      strikeThrough(nc, true);
      stampOff(nc, date, true);
      const w = nc.animate([{ backgroundColor: cssVar(nc, "--tl-del-wash") }, { backgroundColor: cssVar(nc, "--tl-del-wash") }], { duration: 10_000, fill: "forwards" });
      const tape = document.createElement("i");
      tape.className = "tl-tape";
      tape.setAttribute("aria-hidden", "true");
      const rot = "rotate(-5deg)";
      Object.assign(tape.style, { left: `${tearX - 17}px`, top: "-10px", width: "34px", height: `${nb.height + 20}px`, transform: rot });
      nc.append(tape);
      tape.animate([{ opacity: 0, transform: `${rot} scale(1.25) translateY(-8px)` }, { opacity: 1, transform: `${rot} scale(.98)`, offset: .7 }, { opacity: 1, transform: rot }],
        { duration: 300, easing: "cubic-bezier(.3,0,.2,1)" });
      nc.animate([{ translate: "0 0", scale: "1" }, { translate: "0 1.5px", scale: ".992", offset: .4 }, { translate: "0 0", scale: "1" }], { duration: 320, delay: 160, composite: "add" });
      setTimeout(() => {
        tape.animate([{ opacity: 1, transform: rot }, { opacity: .9, transform: `${rot} translateY(-6px) rotate(4deg) scaleY(.96)`, offset: .4 }, { opacity: 0, transform: `${rot} translateY(-24px) rotate(12deg) scaleY(.8)` }],
          { duration: 460, easing: "cubic-bezier(.5,0,.7,.4)", fill: "forwards" }).onfinish = () => tape.remove();
      }, 1250);
      await wait(260);
      liftInk(nc);
      if (fail) blush(nc, true, w);
      else w.cancel();
    },
    finish() {
      pieces.forEach(p => p.remove());
    },
  };
}

/** It didn't go: the card shakes its head and blushes, then settles. */
function blush(card: HTMLElement, animate: boolean, hold?: Animation) {
  const wash = cssVar(card, "--tl-del-wash"), ink = cssVar(card, "--tl-del-ink");
  const bg = getComputedStyle(card).backgroundColor, bd = getComputedStyle(card).borderTopColor;
  hold?.cancel();
  if (!animate) return;
  card.animate([{ backgroundColor: wash, borderColor: ink }, { backgroundColor: wash, borderColor: ink, offset: .5 }, { backgroundColor: bg, borderColor: bd }], { duration: 2200 });
  card.animate([
    { translate: "0 0" }, { translate: "-6px 0", offset: .2 }, { translate: "5px 0", offset: .4 }, { translate: "-3px 0", offset: .6 }, { translate: "2px 0", offset: .8 }, { translate: "0 0" },
  ], { duration: 380, delay: 80, composite: "add" });
}
