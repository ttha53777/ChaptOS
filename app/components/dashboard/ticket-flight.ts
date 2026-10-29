/**
 * Opening check-in from Up next: the ticket lifts off the card, flies up and
 * widens into the live band at the top of the dashboard. Ported from the
 * Dashboard view of _design/Up Next Widget Mock.html.
 *
 * Two components that never see each other share one hand-off. UpNext calls
 * `launchTicket` as the officer taps Open check-in, just before the page puts
 * the window up optimistically; LiveCheckIn calls `landTicket` in a layout
 * effect when the band first renders for that event, before paint, so the band
 * never shows in its place first. Everything after the hand-off is the Web
 * Animations API on transform / opacity (plus the ticket shell's own size), so
 * nothing in the page reflows per frame.
 *
 * No flight, just the band's own entrance, whenever: motion is reduced, the
 * ticket or the band's spot is off screen, or the band doesn't arrive within
 * a couple of seconds (the open is still waiting on a previous window to close).
 *
 * Plain DOM, no React: the flying copy lives on <body> (in a `.dash` wrapper so
 * it keeps the dashboard's tokens) because the page root carries
 * `will-change: transform`, which would make it the containing block for
 * anything `position: fixed` inside it — see customize/DashPortal.tsx.
 */

const DUR = 860;
/** The share of the flight spent lifting off before it travels. */
const LIFT = 0.2;
const TRAVEL = "cubic-bezier(.45,0,.12,1)";
const SETTLE = "cubic-bezier(.2,.7,.3,1)";
/** How long a launched ticket waits for its band before it's dropped. */
const WAIT_MS = 2000;

interface Pending {
  eventId: number;
  /** A copy taken at the tap: the same commit that puts the band up re-renders
   *  Up next onto the following event, so the live ticket is gone by landing. */
  ghost: HTMLElement;
  from: DOMRect;
  timer: ReturnType<typeof setTimeout>;
}

let pending: Pending | null = null;

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const onScreen = (r: DOMRect) => r.bottom > 0 && r.top < window.innerHeight && r.width > 0;

function release(p: Pending) {
  clearTimeout(p.timer);
  if (pending === p) pending = null;
}

/**
 * The officer tapped Open check-in on this ticket. Remember where it sits; the
 * band lands it. A no-op when the flight wouldn't be seen.
 */
export function launchTicket(eventId: number, ticket: HTMLElement | null): void {
  if (pending) release(pending);
  if (!ticket || reduced()) return;
  const from = ticket.getBoundingClientRect();
  if (!onScreen(from)) return;
  // The travelling shell: the ticket's own paper and stub, its words gone first
  // so nothing re-wraps as it stretches; the title rides along on one line.
  const ghost = ticket.cloneNode(true) as HTMLElement;
  // Off the card it leaves the card's container query, so pin what that query
  // decided (stub width, type sizes, what's hidden) or a narrow ticket would
  // snap to the wide layout the moment it lifts.
  const src = [ticket, ...ticket.querySelectorAll<HTMLElement>("*")];
  const dst = [ghost, ...ghost.querySelectorAll<HTMLElement>("*")];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el), d = dst[i];
    if (!d) return;
    if (cs.display === "none") d.style.display = "none";
    else if (el.matches(".un-stub > *, .un-title")) d.style.fontSize = cs.fontSize;
  });
  const stub = ticket.querySelector<HTMLElement>(".un-stub");
  ghost.style.gridTemplateColumns = `${stub?.offsetWidth ?? 128}px minmax(0, 1fr)`;
  ghost.classList.add("un-flying");
  ghost.querySelectorAll(".un-cd, .un-hit, .un-tags, .un-meta, .un-facts, .un-pad").forEach(el => el.remove());
  const p: Pending = { eventId, ghost, from, timer: setTimeout(() => release(p), WAIT_MS) };
  pending = p;
}

/**
 * The band for `eventId` just rendered. If a ticket is waiting for it, fly it
 * in; returns a cleanup that ends the flight early (the band unmounting, say a
 * failed open rolled back), for the caller's layout effect to return.
 */
export function landTicket(eventId: number, band: HTMLElement): (() => void) | undefined {
  const p = pending;
  if (!p || p.eventId !== eventId) return;
  release(p);

  // Where the band lands, and how far everything below it now sits.
  const to = band.getBoundingClientRect();
  if (!onScreen(to) || reduced()) return;
  const gap = parseFloat(getComputedStyle(band).marginTop) || 0;
  const H = to.height + gap;
  const below: HTMLElement[] = [];
  for (let el = band.nextElementSibling; el; el = el.nextElementSibling) if (el instanceof HTMLElement) below.push(el);

  const ghost = p.ghost;
  const host = document.createElement("div");
  host.className = "dash";
  host.style.display = "contents";
  host.append(ghost);
  document.body.append(host);
  const a = p.from;
  Object.assign(ghost.style, { left: "0px", top: "0px", width: `${a.width}px`, height: `${a.height}px`, transform: `translate(${a.left}px, ${a.top}px)` });

  band.classList.add("flown");
  band.style.opacity = "0";

  const anims: Animation[] = [];
  const play = (el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) => { const x = el.animate(frames, opts); anims.push(x); return x; };

  ghost.querySelectorAll(".un-stub > *").forEach(el => play(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: "ease-out", fill: "forwards" }));
  const title = ghost.querySelector(".un-title");
  if (title) play(title, [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: DUR, fill: "forwards" });

  // Everything under the band was pushed down by it; slide it there in step
  // with the flight instead of jumping.
  for (const el of below) {
    play(el, [
      { transform: `translateY(${-H}px)` },
      { transform: `translateY(${-H}px)`, offset: LIFT, easing: TRAVEL },
      { transform: "none" },
    ], { duration: DUR });
  }

  // the stub widens or narrows to the band's own as it travels
  const bandStub = band.querySelector<HTMLElement>(".live-stub");
  if (bandStub?.offsetWidth) {
    play(ghost, [
      { gridTemplateColumns: ghost.style.gridTemplateColumns },
      { gridTemplateColumns: ghost.style.gridTemplateColumns, offset: LIFT, easing: TRAVEL },
      { gridTemplateColumns: `${bandStub.offsetWidth}px minmax(0, 1fr)` },
    ], { duration: DUR, fill: "forwards", composite: "replace" });
  }

  const flight = play(ghost, [
    { transform: `translate(${a.left}px, ${a.top}px) rotate(0deg)`, width: `${a.width}px`, height: `${a.height}px`, borderRadius: "18px", boxShadow: "3px 3px 0 var(--c-fill)", easing: SETTLE },
    { transform: `translate(${a.left - 4}px, ${a.top - 12}px) rotate(-1.4deg)`, width: `${a.width}px`, height: `${a.height}px`, borderRadius: "18px", boxShadow: "10px 14px 0 var(--c-fill)", offset: LIFT, easing: TRAVEL },
    { transform: `translate(${to.left}px, ${to.top}px) rotate(0deg)`, width: `${to.width}px`, height: `${to.height}px`, borderRadius: "22px", boxShadow: "5px 5px 0 var(--pp-mint, var(--c-fill))" },
  ], { duration: DUR, fill: "forwards" });

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    for (const x of anims) x.cancel();
    host.remove();
    band.style.opacity = "";
    // It lands on the band's exact footprint, so the swap is invisible; the
    // band's words settle in and the stamp thumps.
    band.classList.add("landed");
  };
  flight.finished.then(finish, finish);
  return finish;
}
