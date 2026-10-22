/* What happens the moment you press "Add event" or "Save event" on the timeline —
   _design/Event Add Stamp Mock.html, played on the real spine.

   Nothing to click and no confirmation screen. The dialog closes first: the form
   condenses into the event's own card and flies to its date while the rows part
   to make room, then a stamp lands on the card, the card gives under it and the
   ink fades. Editing folds the form back into its card instead (a highlighter
   across what changed, a small SAVED press), and a moved date makes the card lift
   and travel to its new slot. A failed add takes the card back: the stamp smears
   off, the card blushes, then either flies back up into the reopened form (fast)
   or folds out of the timeline behind a toast (late).

   Plain DOM + Web Animations. The page commits the row with flushSync, then hands
   the live elements here, so every measurement is of the committed layout before
   the browser paints it. The page scrolls inside <main>, not the window, so every
   scroll here is that element's. */

const EASE = "cubic-bezier(.6,0,.12,1)";
/** Within this long after Add, a failure flies straight back into the form. */
const FAIL_FAST = 2600;
/** The panel's 1.5px edge, which the card's is too. */
const B = 1.5;

const buzz = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* not allowed here */ } };

export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ── Measuring ──────────────────────────────────────────────────────────────── */

/** The open event form as it looked when it was submitted: where the panel and its
 *  title sat, and a copy of it (typed values included) to fold away. Taken before
 *  the dialog unmounts. */
export interface FormShot {
  panel: DOMRect;
  title: DOMRect;
  titlePx: number;
  ghost: HTMLElement;
  scrim: HTMLElement | null;
  bg: string;
  border: string;
  shadow: string;
  radius: string;
}

/** The open event form's dialog panel. */
export function formPanel(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".ui-modal .cef-sheet")?.closest<HTMLElement>(".ui-modal-panel") ?? null;
}
function formTitle(panel: HTMLElement): HTMLElement | null {
  return panel.querySelector<HTMLElement>(".cef-p1 .cef-title, .cef-p2-head h2");
}

/** A copy of a live element with what's been typed into it (a clone keeps attributes, not values). */
function cloneLive(el: HTMLElement): HTMLElement {
  const copy = el.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  copy.querySelectorAll("[id]").forEach(n => n.removeAttribute("id"));
  // A cloned radio still in the document would share its group with the live one.
  copy.querySelectorAll("[name]").forEach(n => n.removeAttribute("name"));
  type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  const live = el.querySelectorAll<Field>("input, textarea, select");
  const dead = copy.querySelectorAll<Field>("input, textarea, select");
  live.forEach((src, i) => {
    const dst = dead[i];
    if (!dst) return;
    if (src instanceof HTMLInputElement && (src.type === "checkbox" || src.type === "radio")) (dst as HTMLInputElement).checked = src.checked;
    else dst.value = src.value;
  });
  copy.classList.add("tl-ghost");
  copy.setAttribute("aria-hidden", "true");
  copy.inert = true;
  return copy;
}

export function shootForm(): FormShot | null {
  const panel = formPanel();
  const title = panel && formTitle(panel);
  if (!panel || !title) return null;
  const cs = getComputedStyle(panel);
  const ghost = cloneLive(panel);
  ghost.querySelectorAll<HTMLElement>(".cef-title, .cef-p2-head h2, .cef-kicker").forEach(el => { el.style.visibility = "hidden"; });
  const scrim = panel.parentElement?.querySelector<HTMLElement>(".ui-modal-scrim");
  return {
    panel: panel.getBoundingClientRect(),
    title: title.getBoundingClientRect(),
    titlePx: parseFloat(getComputedStyle(title).fontSize),
    ghost,
    scrim: scrim ? (scrim.cloneNode(false) as HTMLElement) : null,
    bg: cs.backgroundColor,
    border: cs.borderTopColor,
    shadow: cs.boxShadow,
    radius: cs.borderTopLeftRadius,
  };
}

/** Where everything on the spine sits (in <main>'s scroll space), so what moves when
 *  the row goes in can part instead of jumping. */
export type Positions = Map<Element, number>;
const SPINE_ITEMS = ".tl-layout .tl-month, .tl-layout .past-bar, .tl-layout .today-marker, .tl-layout .tl-end, .tl-layout .spine > .tl-row";
export function docTop(main: HTMLElement, el: Element): number {
  return el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
}
export function recordPositions(main: HTMLElement): Positions {
  return new Map([...main.querySelectorAll(SPINE_ITEMS)].map(el => [el, docTop(main, el)]));
}
export function findRow(main: HTMLElement | null, id: number): HTMLElement | null {
  return main?.querySelector<HTMLElement>(`.tl-layout .spine > .tl-row[data-event-id="${id}"]`) ?? null;
}

/* ── Easing + scroll ────────────────────────────────────────────────────────── */

/** cubic-bezier as a function: y(x) for driving things by hand, and x(y), "when does it get there". */
function bez(x1: number, y1: number, x2: number, y2: number) {
  const C = (a: number, b: number, u: number) => 3 * a * u * (1 - u) ** 2 + 3 * b * u * u * (1 - u) + u ** 3;
  const uAt = (pick: (u: number) => number, v: number) => {
    let lo = 0, hi = 1, u = v;
    for (let n = 0; n < 28; n++) { u = (lo + hi) / 2; if (pick(u) < v) lo = u; else hi = u; }
    return u;
  };
  return {
    y: (x: number) => C(y1, y2, uAt(u => C(x1, x2, u), x)),
    x: (y: number) => C(x1, x2, uAt(u => C(y1, y2, u), y)),
    css: `cubic-bezier(${x1},${y1},${x2},${y2})`,
  };
}
/** The page scroll, eased the same way as the card's fall so the slot and the card arrive together. */
const FALL = bez(.75, 0, .2, 1);
const SWIM = bez(.62, 0, .22, 1);

export function glideTo(main: HTMLElement, y: number, dur: number, ease: (t: number) => number = FALL.y) {
  const y0 = main.scrollTop, t0 = performance.now();
  main.style.scrollBehavior = "auto";
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / dur);
    main.scrollTop = y0 + (y - y0) * ease(k);
    if (k < 1) requestAnimationFrame(step);
    else main.style.scrollBehavior = "";
  };
  requestAnimationFrame(step);
}

/** Bring a slot (top/height in <main>'s scroll space) into view: settle it at ~45% of
 *  the window, unless it's already comfortably on screen. With jump, a long way off
 *  covers most of the distance at once (the scrim is still up to hide it) and the
 *  caller glides the rest. */
export function scrollPlan(main: HTMLElement, top: number, height: number, jump: boolean): number {
  const s0 = main.scrollTop, vh = main.clientHeight, rel = top - s0;
  const maxY = main.scrollHeight - vh;
  const want = rel >= 90 && rel + height <= vh - 70 ? s0 : Math.max(0, Math.min(maxY, top + height / 2 - vh * .45));
  const glide = vh * .55, far = want - s0;
  if (jump && Math.abs(far) > glide) {
    main.style.scrollBehavior = "auto";
    main.scrollTop = s0 + far - Math.sign(far) * glide;
    main.style.scrollBehavior = "";
  }
  return want;
}

/* ── Pieces ─────────────────────────────────────────────────────────────────── */

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** The dialog's scrim, which unmounts with it, fading the way it would have. */
function fadeScrim(shot: FormShot) {
  const s = shot.scrim;
  if (!s) return;
  Object.assign(s.style, { position: "fixed", inset: "0", zIndex: "49", pointerEvents: "none" });
  document.body.append(s);
  s.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, easing: "ease", fill: "forwards" }).onfinish = () => s.remove();
}

/** The type and box of a row's title/meta, copied inline so a copy reads the same
 *  outside the page's stylesheet scope (the flyer lives on <body>). */
const COPY = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "lineHeight", "textTransform", "color",
  "backgroundColor", "borderRadius", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "display", "alignItems",
  "gap", "flexWrap", "whiteSpace", "fontVariantNumeric", "borderWidth", "borderStyle", "borderColor"] as const;
function copyOf(el: Element): HTMLElement {
  const copy = el.cloneNode(true) as HTMLElement;
  // pair every element first: the ::before stand-ins prepended below would shift the indexes
  const pairs: [Element, HTMLElement][] = [];
  const walk = (s: Element, d: HTMLElement) => { pairs.push([s, d]); [...s.children].forEach((c, i) => walk(c, d.children[i] as HTMLElement)); };
  walk(el, copy);
  for (const [s, d] of pairs) {
    const cs = getComputedStyle(s);
    for (const k of COPY) d.style[k] = cs[k];
  }
  for (const [s, d] of pairs) {
    const before = getComputedStyle(s, "::before");
    if (before.content && before.content !== "none" && before.content !== "normal") {
      const dot = document.createElement("span");
      Object.assign(dot.style, { display: "inline-block", flexShrink: "0", width: before.width, height: before.height, borderRadius: before.borderRadius, background: before.backgroundColor });
      d.prepend(dot);
    }
  }
  return copy;
}

interface Box { left: number; top: number; width: number; height: number }
const box = (r: DOMRect, dy = 0): Box => ({ left: r.left, top: r.top + dy, width: r.width, height: r.height });

/** On a phone the form is a sheet nearly the height of the screen, and shrinking all
 *  of it into a card reads as a tall blank box sliding down. So it comes apart instead:
 *  the sheet drops away the way a sheet is dismissed, and its head (the kicker and the
 *  name) tears off along a perforation as a ticket, which is what flies to the date. */
const isSheet = (shot: FormShot, cardH: number) =>
  shot.panel.width > innerWidth * .8 && shot.panel.height > innerHeight * .5 && shot.panel.height > cardH * 3;
function headOf(shot: FormShot): number {
  return Math.min(shot.panel.height, Math.max(64, shot.title.bottom - shot.panel.top + 20));
}

/** The rest of the sheet, below the tear: it gives a little at the perforation, then drops off the screen. */
function dropSheet(shot: FormShot, head: number, D: number) {
  const p = shot.panel;
  const body = shot.ghost.cloneNode(true) as HTMLElement;
  Object.assign(body.style, {
    position: "fixed", zIndex: "59", pointerEvents: "none", margin: "0", maxWidth: "none", maxHeight: "none",
    left: `${p.left}px`, top: `${p.top}px`, width: `${p.width}px`, height: `${p.height}px`,
    boxShadow: shot.shadow, clipPath: `inset(${head}px -24px -24px -24px)`,
  });
  const perf = document.createElement("i");
  perf.className = "tl-perf";
  perf.style.top = `${head - B}px`;
  body.append(perf);
  document.body.append(body);
  const off = innerHeight - p.top + 24;
  body.animate([
    { transform: "none" },
    { transform: "translateY(10px) rotate(.5deg)", offset: .2, easing: "cubic-bezier(.4,0,.9,.5)" },
    { transform: `translateY(${off}px) rotate(1.6deg)` },
  ], { duration: D * .8, easing: "cubic-bezier(.3,0,.5,1)", fill: "forwards" }).onfinish = () => body.remove();
}

/** The form condenses into the card: the shell, the title and the meta each travel to
 *  their place. `dy` moves the card's measured box to where it will be on arrival
 *  (the scroll still to come, and for an edit, the slot it's folding into). */
function condenseInto(card: HTMLElement, shot: FormShot, { dy, D, kicker }: { dy: number; D: number; kicker: string }): HTMLElement {
  const titleFrom = shot.title;
  const cr = card.getBoundingClientRect();
  const sheet = isSheet(shot, cr.height);
  // a sheet: the flyer is only its head, the ticket torn off the top
  const head = sheet ? headOf(shot) : shot.panel.height;
  const from = sheet ? new DOMRect(shot.panel.left, shot.panel.top, shot.panel.width, head) : shot.panel;
  if (sheet) dropSheet(shot, head, D);
  const titleEl = card.querySelector(".t"), metaEl = card.querySelector(".m");
  const to = box(cr, dy);
  const tTo = titleEl ? box(titleEl.getBoundingClientRect(), dy) : to;
  const mTo = metaEl ? box(metaEl.getBoundingClientRect(), dy) : to;
  const cardCs = getComputedStyle(card);

  const g = document.createElement("div");
  g.className = "tl-flyer";
  g.setAttribute("aria-hidden", "true");
  const snap = shot.ghost;
  Object.assign(snap.style, {
    position: "absolute", left: `-${B}px`, top: `-${B}px`, width: `${from.width}px`, height: `${shot.panel.height}px`, margin: "0",
    boxShadow: "none", animation: "none", borderColor: "transparent", maxWidth: "none", maxHeight: "none",
    transformOrigin: `${titleFrom.left - from.left}px ${titleFrom.top - from.top}px`,
  });
  const gk = document.createElement("span");
  gk.className = "k";
  gk.textContent = kicker;
  const gt = titleEl ? copyOf(titleEl) : document.createElement("div");
  const gm = metaEl ? copyOf(metaEl) : document.createElement("div");
  // the title rides unclipped: it starts at the form's size
  Object.assign(gt.style, { overflow: "visible", width: "max-content", maxWidth: "none", textOverflow: "clip", whiteSpace: "nowrap" });
  // at the card's width, so it wraps (or doesn't) exactly as the card's own meta does
  Object.assign(gm.style, { width: `${mTo.width}px`, height: `${mTo.height}px` });
  g.append(snap, gk, gt, gm);
  if (sheet) {
    // the torn edge it carries away
    const perf = document.createElement("i");
    perf.className = "tl-perf";
    perf.style.bottom = "0";
    g.append(perf);
    perf.animate([{ opacity: 1 }, { opacity: 0 }], { duration: D * .45, easing: "ease-in", fill: "forwards" });
  }
  document.body.append(g);

  const sk = Math.max(to.width / from.width, .3);
  snap.animate([
    { opacity: 1, transform: "none", filter: "blur(0)" },
    { opacity: 0, filter: "blur(2px)", offset: .4 },
    { opacity: 0, transform: `scale(${sk})`, filter: "blur(2px)" },
  ], { duration: D, easing: EASE, fill: "forwards" });
  g.animate([{ left: `${from.left}px`, width: `${from.width}px` }, { left: `${to.left}px`, width: `${to.width}px` }],
    { duration: D, easing: "cubic-bezier(.35,0,.1,1)", fill: "forwards" });
  g.animate([{ top: `${from.top}px`, height: `${from.height}px` }, { top: `${to.top}px`, height: `${to.height}px` }],
    { duration: D, easing: FALL.css, fill: "forwards" });
  g.animate([
    { borderRadius: shot.radius, boxShadow: shot.shadow, borderColor: shot.border, backgroundColor: shot.bg, transform: "rotate(0)" },
    { offset: .5, borderRadius: "18px", transform: `rotate(${sheet ? -2.4 : -1.4}deg)` },
    { borderRadius: cardCs.borderTopLeftRadius, boxShadow: "0 0 0 transparent", borderColor: cardCs.borderTopColor, backgroundColor: cardCs.backgroundColor, transform: "rotate(0)" },
  ], { duration: D, easing: EASE, fill: "forwards" });

  for (const el of [gt, gk, gm]) Object.assign(el.style, { position: "absolute", left: "0", top: "0", margin: "0", transformOrigin: "0 0" });
  // font-size would reflow every frame; scale the row-sized title up instead
  const k = shot.titlePx / (parseFloat(titleEl ? getComputedStyle(titleEl).fontSize : "16") || 16);
  gt.animate([
    { transform: `translate(${titleFrom.left - from.left - B}px, ${titleFrom.top - from.top - B + 2}px) scale(${k})` },
    { transform: `translate(${tTo.left - to.left - B}px, ${tTo.top - to.top - B}px) scale(1)` },
  ], { duration: D, easing: EASE, fill: "forwards" });
  gk.animate([
    { transform: `translate(${titleFrom.left - from.left - B}px, ${titleFrom.top - from.top - 26}px)`, opacity: 1 },
    { transform: `translate(${titleFrom.left - from.left - B}px, ${titleFrom.top - from.top - 40}px)`, opacity: 0, offset: .35 },
    { opacity: 0 },
  ], { duration: D, easing: EASE, fill: "forwards" });
  gm.animate([
    { transform: `translate(${mTo.left - to.left - B}px, ${mTo.top - to.top - B + 6}px)`, opacity: 0 },
    { offset: .65, opacity: 0, transform: `translate(${mTo.left - to.left - B}px, ${mTo.top - to.top - B + 4}px)` },
    { transform: `translate(${mTo.left - to.left - B}px, ${mTo.top - to.top - B}px)`, opacity: 1 },
  ], { duration: D, easing: EASE, fill: "forwards" });
  return g;
}

function dismissFlyer(g: HTMLElement) {
  g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" }).onfinish = () => g.remove();
}

/** A ripple off the spine dot. */
function ring(row: HTMLElement, opts: KeyframeAnimationOptions, to = 2.6) {
  const node = row.querySelector(".tl-node");
  if (!node) return;
  const r = document.createElement("span");
  r.className = "tl-ring";
  node.append(r);
  r.animate([{ transform: "scale(.5)", opacity: .9 }, { transform: `scale(${to})`, opacity: 0 }], { easing: "cubic-bezier(.2,.7,.3,1)", fill: "both", ...opts })
    .onfinish = () => r.remove();
}

const stampDate = (date: string) => {
  try { return new Date(`${date}T12:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase(); }
  catch { return date; }
};

function stamp(card: HTMLElement, date: string, done: () => void): HTMLElement {
  const s = document.createElement("span");
  s.className = "tl-stamp";
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = `ON THE TIMELINE<small>${stampDate(date)}</small>`;
  card.append(s);
  setTimeout(() => buzz(14), 200);
  s.animate([
    { opacity: 0, transform: "translateY(-50%) rotate(-16deg) scale(2.3)", filter: "blur(1.5px)" },
    { opacity: 1, transform: "translateY(-50%) rotate(-7deg) scale(.94)", filter: "blur(0)", offset: .6 },
    { opacity: 1, transform: "translateY(-50%) rotate(-8deg) scale(1)" },
  ], { duration: 340, easing: "cubic-bezier(.3,0,.2,1)", fill: "both" });
  // the card gives under it
  card.animate([{ translate: "0 0", scale: "1" }, { translate: "0 1.5px", scale: ".988", offset: .3 }, { translate: "0 0", scale: "1" }],
    { duration: 380, delay: 200, easing: "ease-out", composite: "add" });
  // a little ink kicked out where it hit
  const r = card.getBoundingClientRect(), sr = s.getBoundingClientRect();
  const cx = sr.left - r.left + sr.width / 2, cy = sr.top - r.top + sr.height / 2;
  for (let n = 0; n < 7; n++) {
    const a = (n / 7) * Math.PI * 2 + Math.random() * .5, dist = sr.width * .32 + 4 + Math.random() * 10, sz = 2 + Math.random() * 3;
    const d = document.createElement("i");
    d.className = "tl-splat";
    Object.assign(d.style, { left: `${cx - sz / 2}px`, top: `${cy - sz / 2}px`, width: `${sz}px`, height: `${sz}px` });
    card.append(d);
    d.animate([
      { transform: "translate(0,0) scale(.4)", opacity: 0 },
      { transform: `translate(${Math.cos(a) * dist * .7}px, ${Math.sin(a) * dist * .4}px) scale(1)`, opacity: .9, offset: .35 },
      { transform: `translate(${Math.cos(a) * dist}px, ${Math.sin(a) * dist * .55}px) scale(.6)`, opacity: 0 },
    ], { duration: 620, delay: 200, easing: "cubic-bezier(.2,.7,.3,1)", fill: "both" }).onfinish = () => d.remove();
  }
  // a wash of mint under the card, then the ink lifts
  const mint = cssVar("--pp-mint-soft"), bg = getComputedStyle(card).backgroundColor;
  card.animate([{ backgroundColor: mint }, { backgroundColor: mint, offset: .45 }, { backgroundColor: bg }], { duration: 2400, delay: 200 });
  s.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(-50%) rotate(-8deg) scale(1.04)" }], { duration: 600, delay: 2100, fill: "forwards", easing: "ease-in" })
    .onfinish = () => { s.remove(); done(); };
  return s;
}

/** SAVED: the add stamp's little sibling: smaller, quicker, no ink kicked out. */
function smallStamp(card: HTMLElement) {
  const s = document.createElement("span");
  s.className = "tl-stamp small";
  s.setAttribute("aria-hidden", "true");
  s.textContent = "SAVED";
  card.append(s);
  setTimeout(() => buzz(8), 300);
  s.animate([
    { opacity: 0, transform: "translateY(-50%) rotate(-14deg) scale(1.9)", filter: "blur(1px)" },
    { opacity: 1, transform: "translateY(-50%) rotate(-5deg) scale(.95)", filter: "blur(0)", offset: .6 },
    { opacity: 1, transform: "translateY(-50%) rotate(-6deg) scale(1)" },
  ], { duration: 260, delay: 160, easing: "cubic-bezier(.3,0,.2,1)", fill: "both" });
  card.animate([{ translate: "0 0", scale: "1" }, { translate: "0 1px", scale: ".994", offset: .3 }, { translate: "0 0", scale: "1" }],
    { duration: 260, delay: 300, composite: "add" });
  s.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, delay: 1700, fill: "forwards" }).onfinish = () => s.remove();
}

/** What an edit changed that the row shows. */
export interface RowDiff { title: boolean; cat: boolean; date: boolean; time: boolean; location: boolean; req: boolean; details: boolean }

/** A highlighter swipe across whatever changed: in, held, out. */
function markChanges(row: HTMLElement, diff: RowDiff) {
  const parts = [
    diff.title && row.querySelector(".tl-card .t"),
    diff.cat && row.querySelector(".tl-card .m .cat"),
    diff.date && row.querySelector(".tl-date .dnum"),
    diff.time && row.querySelector(".tl-card .m .m-time"),
    diff.location && row.querySelector(".tl-card .m .m-loc"),
    diff.req && row.querySelector(".tl-card .m .req"),
  ].filter((el): el is HTMLElement => el instanceof HTMLElement);
  parts.forEach((el, n) => {
    el.classList.add("tl-hl");
    el.animate([
      { backgroundSize: "0% 58%", backgroundPosition: "0 75%" },
      { backgroundSize: "100% 58%", backgroundPosition: "0 75%", offset: .14 },
      { backgroundSize: "100% 58%", backgroundPosition: "100% 75%", offset: .8 },
      { backgroundSize: "0% 58%", backgroundPosition: "100% 75%" },
    ], { duration: 2300, delay: n * 110, easing: "cubic-bezier(.3,0,.3,1)", fill: "both" }).onfinish = () => el.classList.remove("tl-hl");
  });
  if (diff.details) row.querySelectorAll(".evd-stack i").forEach((ic, n) => ic.animate([
    { transform: "none" }, { transform: "translateY(-4px) rotate(-8deg) scale(1.15)", offset: .45 }, { transform: "none" },
  ], { duration: 380, delay: n * 70, easing: "cubic-bezier(.3,0,.3,1)" }));
}

/** The rows a new or moved row pushed: they start where they were and settle. */
function part(main: HTMLElement, before: Positions, skip: HTMLElement | null, delay: (el: Element) => number, duration: number, easing: string) {
  for (const [el, top] of before) {
    if (el === skip || !el.isConnected) continue;
    const dy = top - docTop(main, el);
    if (Math.abs(dy) < .5) continue;
    el.animate([{ translate: `0 ${dy}px` }, { translate: "0 0" }], { duration, delay: delay(el), easing, fill: "backwards" });
  }
}

/* ── Adding ─────────────────────────────────────────────────────────────────── */

export interface FailWhy { message: string; field?: "date" }
export interface AddLanding { fail(why: FailWhy): void }

export function landNew({ main, row, shot, before, date, restore, remove, toast }: {
  main: HTMLElement;
  row: HTMLElement;
  shot: FormShot;
  before: Positions;
  date: string;
  /** Reopen the form with the draft and the reason, laid out but not yet shown. Returns its panel. */
  restore: (why: FailWhy) => HTMLElement | null;
  /** Take the row out of the timeline (the optimistic event). */
  remove: () => void;
  /** Late: tell them it wasn't added, with the way back. */
  toast: (why: FailWhy) => void;
}): AddLanding {
  const t0 = performance.now();
  const card = row.querySelector<HTMLElement>(".tl-card") ?? row;
  let landed = false, failed: FailWhy | null = null;
  const late = () => performance.now() - t0 > FAIL_FAST;

  const rowTop = docTop(main, card), rowH = card.offsetHeight;
  row.style.visibility = "hidden";
  const want = scrollPlan(main, rowTop, rowH, true);
  fadeScrim(shot);

  if (reducedMotion()) {
    main.scrollTop = want;
    row.style.visibility = "";
    return {
      fail(why) {
        if (!late()) { const p = restore(why); if (p) p.style.visibility = ""; remove(); }
        else { remove(); toast(why); }
      },
    };
  }

  const D = 560;
  // the rows after it part to make room
  part(main, before, row, () => 60, D, EASE);
  const lift = want - main.scrollTop;
  const g = condenseInto(card, shot, { dy: -lift, D, kicker: "New calendar event" });
  if (lift) glideTo(main, want, D);

  row.querySelector(".tl-node .dot")?.animate([{ scale: "0" }, { scale: "1.6", offset: .55 }, { scale: "1" }],
    { duration: 420, delay: D - 60, easing: "cubic-bezier(.3,0,.3,1)", fill: "backwards" });
  ring(row, { duration: 700, delay: D + 40 });
  row.querySelectorAll(".evd-stack i").forEach((ic, n) => ic.animate([
    { opacity: 0, transform: "translateY(-10px) rotate(-14deg) scale(.6)" },
    { opacity: 1, transform: "translateY(1px) rotate(3deg) scale(1.08)", offset: .6 },
    { opacity: 1, transform: "none" },
  ], { duration: 360, delay: D + 520 + n * 80, easing: "cubic-bezier(.3,0,.3,1)", fill: "backwards" }));

  setTimeout(() => {
    row.style.visibility = "";
    landed = true;
    dismissFlyer(g);
    // a failure that came back mid-flight: it lands, but no stamp ever hits
    setTimeout(() => { if (failed) unstamp(); else stamp(card, date, () => {}); }, 80);
  }, D);

  /* When the save fails. The card landed before the server answered, so a failure
     takes it back, and never costs what was typed. */
  function unstamp() {
    const why = failed!;
    const rose = cssVar("--pp-rose-soft"), roseInk = cssVar("--pp-rose-ink");
    card.getAnimations().forEach(a => a.cancel());   // drop the mint wash and the press
    const s = card.querySelector<HTMLElement>(".tl-stamp");
    if (s) {
      s.getAnimations().forEach(a => a.cancel());
      // the ink smears off sideways, like a stamp dragged before it dried
      s.animate([
        { opacity: 1, transform: "translateY(-50%) rotate(-8deg)", filter: "blur(0)" },
        { opacity: 0, transform: "translateY(-50%) rotate(-8deg) translateX(30px) skewX(-24deg) scaleX(1.3)", filter: "blur(3px)" },
      ], { duration: 420, easing: "cubic-bezier(.4,0,.6,1)", fill: "forwards" }).onfinish = () => s.remove();
    }
    // the card shakes its head and blushes
    card.animate([{ backgroundColor: rose, borderColor: roseInk }, { backgroundColor: rose, borderColor: roseInk }], { duration: 1600, fill: "forwards" });
    card.animate([
      { translate: "0 0", rotate: "0deg" }, { translate: "-7px 0", rotate: "-.4deg", offset: .18 }, { translate: "6px 0", rotate: ".3deg", offset: .4 },
      { translate: "-4px 0", rotate: "0deg", offset: .62 }, { translate: "2px 0", offset: .82 }, { translate: "0 0", rotate: "0deg" },
    ], { duration: 460, delay: s ? 140 : 0, easing: "ease-out" });
    const isLate = late();
    setTimeout(() => isLate ? foldOut(why) : flyBack(why), s ? 950 : 750);
  }

  /** The row leaves its slot and the timeline closes the gap. */
  function collapse(delay: number) {
    const cs = getComputedStyle(row);
    row.style.overflow = "hidden";
    row.animate([
      { height: `${row.offsetHeight}px`, opacity: 1, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginBottom: cs.marginBottom },
      { height: "0px", opacity: 0, paddingTop: "0px", paddingBottom: "0px", marginBottom: "0px" },
    ], { duration: 380, delay, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" }).onfinish = remove;
  }

  /** Fast: the card lifts back up into the form, which reopens as it was. */
  function flyBack(why: FailWhy) {
    const D = 540;
    const from = card.getBoundingClientRect();
    const rt = card.querySelector(".t")?.getBoundingClientRect() ?? from;
    const rowTitlePx = parseFloat(getComputedStyle(card.querySelector(".t") ?? card).fontSize) || 16;
    const panel = restore(why);
    if (!panel) { foldOut(why); return; }
    panel.style.visibility = "hidden";
    const scrim = panel.parentElement?.querySelector<HTMLElement>(".ui-modal-scrim");
    scrim?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: "ease" });
    const to = panel.getBoundingClientRect();
    const titleEl = formTitle(panel);
    const tEl = (titleEl ?? panel).getBoundingClientRect();
    const pcs = getComputedStyle(panel);
    const g = document.createElement("div");
    g.className = "tl-flyer";
    g.setAttribute("aria-hidden", "true");
    const gt = card.querySelector(".t") ? copyOf(card.querySelector(".t")!) : document.createElement("div");
    Object.assign(gt.style, { position: "absolute", left: "0", top: "0", margin: "0", transformOrigin: "0 0", overflow: "visible", width: "max-content", maxWidth: "none", textOverflow: "clip" });
    // the restored form, laid out but hidden: copy it into the card so it can fade up as the card grows
    const snap = cloneLive(panel);
    snap.querySelectorAll<HTMLElement>(".cef-title").forEach(el => { el.style.visibility = "hidden"; });
    Object.assign(snap.style, {
      position: "absolute", left: `-${B}px`, top: `-${B}px`, width: `${to.width}px`, height: `${to.height}px`, margin: "0", boxShadow: "none",
      animation: "none", borderColor: "transparent", visibility: "visible", maxWidth: "none", maxHeight: "none",
      transformOrigin: `${tEl.left - to.left}px ${tEl.top - to.top}px`,
    });
    g.append(snap, gt);
    document.body.append(g);
    snap.animate([
      { opacity: 0, transform: `scale(${Math.max(from.width / to.width, .3)})`, filter: "blur(2px)" },
      { opacity: .15, offset: .22, filter: "blur(2px)" },
      { opacity: 1, transform: "none", filter: "blur(0)" },
    ], { duration: D, easing: EASE, fill: "forwards" });
    row.style.visibility = "hidden";
    collapse(60);
    // up first, then across: the arrival's arc, run backwards
    g.animate([{ top: `${from.top}px`, height: `${from.height}px` }, { top: `${to.top}px`, height: `${to.height}px` }], { duration: D, easing: "cubic-bezier(.3,0,.25,1)", fill: "forwards" });
    g.animate([{ left: `${from.left}px`, width: `${from.width}px` }, { left: `${to.left}px`, width: `${to.width}px` }], { duration: D, easing: "cubic-bezier(.65,0,.2,1)", fill: "forwards" });
    g.animate([
      { borderRadius: getComputedStyle(card).borderTopLeftRadius, borderColor: cssVar("--pp-rose-ink"), backgroundColor: cssVar("--pp-rose-soft"), boxShadow: `0 0 0 ${cssVar("--pp-rose")}`, transform: "rotate(0)" },
      { offset: .5, transform: "rotate(1.2deg)" },
      { borderRadius: pcs.borderTopLeftRadius, borderColor: pcs.borderTopColor, backgroundColor: pcs.backgroundColor, boxShadow: pcs.boxShadow, transform: "rotate(0)" },
    ], { duration: D, easing: EASE, fill: "forwards" });
    const big = (titleEl ? parseFloat(getComputedStyle(titleEl).fontSize) : rowTitlePx) / rowTitlePx;
    gt.animate([
      { transform: `translate(${rt.left - from.left - B}px, ${rt.top - from.top - B}px) scale(1)` },
      { transform: `translate(${tEl.left - to.left - B}px, ${tEl.top - to.top + 2}px) scale(${big})` },
    ], { duration: D, easing: EASE, fill: "forwards" });
    setTimeout(() => {
      panel.style.visibility = "";
      panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
      g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" }).onfinish = () => g.remove();
      panel.querySelector<HTMLElement>(".cef-p1 button[type=submit]")?.focus({ preventScroll: true });
    }, D);
  }

  /** Late: the card folds out, and a toast keeps the way back. */
  function foldOut(why: FailWhy) {
    card.animate([{ translate: "0 0", rotate: "0deg" }, { translate: "26px 0", rotate: "1.6deg" }], { duration: 320, easing: "ease-in", fill: "forwards" });
    collapse(140);
    toast(why);
  }

  return {
    fail(why) {
      if (failed) return;
      failed = why;
      if (landed) unstamp();   // otherwise the landing hands over to unstamp()
    },
  };
}

/* ── Editing ────────────────────────────────────────────────────────────────── */

/** Nothing changed: the dialog just closes. */
export function closeQuietly(shot: FormShot | null) {
  if (!shot) return;
  fadeScrim(shot);
  const g = shot.ghost;
  Object.assign(g.style, {
    position: "fixed", zIndex: "60", pointerEvents: "none", margin: "0", maxWidth: "none", maxHeight: "none",
    left: `${shot.panel.left}px`, top: `${shot.panel.top}px`, width: `${shot.panel.width}px`, height: `${shot.panel.height}px`,
  });
  g.querySelectorAll<HTMLElement>(".cef-title, .cef-p2-head h2, .cef-kicker").forEach(el => { el.style.visibility = ""; });
  document.body.append(g);
  g.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(10px) scale(.98)" }], { duration: 180, easing: "ease-in", fill: "forwards" })
    .onfinish = () => g.remove();
}

/** Changed in place: the form folds back into its own card, a highlighter swipes across
 *  what changed, a small SAVED press. Date moved: it folds into the card where it was,
 *  then the card lifts and travels to its new slot (the page following).
 *
 *  React has already moved the row by the time this runs, so "where it was" is played
 *  backwards: the row and everything it displaced hold their old places until the
 *  card has landed, then the row swims to its slot and the rows it passes step aside. */
export function landEdit({ main, row, shot, before, oldTop, diff }: {
  main: HTMLElement;
  row: HTMLElement;
  shot: FormShot;
  before: Positions;
  /** The row's top (in <main>'s scroll space) before the save. */
  oldTop: number;
  diff: RowDiff;
}) {
  const card = row.querySelector<HTMLElement>(".tl-card") ?? row;
  const yTo = docTop(main, row), d = oldTop - yTo;
  const moves = Math.abs(d) > 1;
  const cardOff = docTop(main, card) - yTo, cardH = card.offsetHeight;
  const want = scrollPlan(main, oldTop + cardOff, cardH, true);
  fadeScrim(shot);
  if (reducedMotion()) { main.scrollTop = scrollPlan(main, yTo + cardOff, cardH, false); return; }

  const D = 480;
  const D2 = moves ? Math.min(1400, 680 + Math.abs(d) * .38) : 0;
  const lift = want - main.scrollTop;
  const g = condenseInto(card, shot, { dy: d - lift, D, kicker: "Edit calendar event" });
  row.style.visibility = "hidden";
  if (want !== main.scrollTop) glideTo(main, want, D);

  if (moves) {
    // The rows in between step aside at the moment the card passes them, so the gap
    // closes behind it as it goes; until then they hold where they were.
    part(main, before, row, el => {
      const top = before.get(el)!;
      // how far along the path this row sits, then when the card's curve gets there:
      // it steps aside when the card is ~¾ of the way onto it, not once it's fully covered
      const reach = top + (d > 0 ? -1 : 1) * (el as HTMLElement).offsetHeight * .75;
      const p = Math.min(1, Math.max(0, (reach - oldTop) / (yTo - oldTop)));
      return D + Math.max(0, D2 * SWIM.x(p) - 120);
    }, 460, "cubic-bezier(.3,1.18,.5,1)");
    // the card holds its old slot under the flyer
    row.animate([{ translate: `0 ${d}px` }, { translate: "0 0" }], { duration: D2, delay: D, easing: SWIM.css, fill: "backwards" });
  }

  setTimeout(() => {
    row.style.visibility = "";
    dismissFlyer(g);
    const finish = () => { markChanges(row, diff); smallStamp(card); };
    if (!moves) { setTimeout(finish, 60); return; }
    travel(finish);
  }, D);

  /** The card lifts, travels to its new date and sets down. The move is one smooth curve
   *  (translate, started above); lift, lean and shadow ride on top on their own timings,
   *  pivoting on the spine dot so the dot never leaves the line. */
  function travel(done: () => void) {
    const wantNew = scrollPlan(main, yTo + cardOff, cardH, false);
    if (wantNew !== main.scrollTop) glideTo(main, wantNew, D2, SWIM.y);
    const down = d < 0, lean = down ? -1 : 1;      // the tail lags the way it's going
    const dot = row.querySelector(".tl-node .dot")?.getBoundingClientRect(), rr = row.getBoundingClientRect();
    row.style.zIndex = "3";
    row.style.position = "relative";
    row.style.transformOrigin = dot ? `${dot.left + dot.width / 2 - rr.left}px 50%` : "0 50%";
    const rest = "0 0 0 -12px rgba(38,33,27,0), 0 0 0 0 transparent";
    const lifted = "0 18px 26px -12px rgba(38,33,27,.28), 5px 7px 0 0 color-mix(in srgb, var(--pcc, var(--catc)) 34%, transparent)";
    row.animate([{ scale: "1" }, { scale: "1.045", offset: .2 }, { scale: "1.045", offset: .72 }, { scale: "1" }], { duration: D2, easing: "cubic-bezier(.45,0,.25,1)" });
    row.animate([{ rotate: "0deg" }, { rotate: `${lean * 1.6}deg`, offset: .28 }, { rotate: `${-lean * .7}deg`, offset: .84 }, { rotate: "0deg" }], { duration: D2, easing: "cubic-bezier(.45,0,.4,1)" });
    card.animate([{ boxShadow: rest }, { boxShadow: lifted, offset: .2 }, { boxShadow: lifted, offset: .72 }, { boxShadow: rest }], { duration: D2, easing: "ease-in-out" })
      .onfinish = () => {
        row.style.zIndex = "";
        row.style.position = "";
        // set down: a small press, and a ripple off the dot at its new spot
        row.animate([{ scale: "1" }, { scale: ".99", offset: .35 }, { scale: "1" }], { duration: 240, easing: "ease-out" });
        ring(row, { duration: 620 }, 2.4);
        setTimeout(() => { row.style.transformOrigin = ""; done(); }, 120);
      };
  }
}
