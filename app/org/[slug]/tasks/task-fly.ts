// The "filing" animation from _design/Task Poll Forms Paper Mock.html: when a
// new task saves, its preview row lifts off the sheet, arcs across the page and
// drops into its slot in the pile, which opens a gap for it as it flies.
//
// Two halves, because the sheet and the list never share a render: the Tasks
// page calls armTaskFlight(id) the moment the POST succeeds (the sheet is still
// on screen, so the preview's rect is real), and the list calls
// takeTaskFlight(id) once the new row has mounted.
//
// Motion rules that keep it smooth: the landing spot is measured before
// anything moves; position is transform-only, on two nested layers whose X and
// Y easings differ (that bends the path into one arc, no corner); the card
// stretches its width while the row inside is laid out at its final width, so
// nothing re-wraps mid-flight; and the phases overlap instead of waiting.

type Armed = { id: number; from: DOMRect; at: number };
let armed: Armed | null = null;

/** Remember where the sheet's preview row sits, for the task about to land. */
export function armTaskFlight(id: number): void {
  const el = document.querySelector<HTMLElement>("[data-task-preview]");
  armed = el ? { id, from: el.getBoundingClientRect(), at: performance.now() } : null;
}

/** Fly the armed preview into `li` (the new row). False when nothing was armed for it. */
export function takeTaskFlight(id: number, li: HTMLElement | null): boolean {
  const a = armed;
  armed = null;
  // A flight armed long ago (the save raced a navigation) is stale.
  if (!a || a.id !== id || !li || performance.now() - a.at > 4000) return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { land(li); return true; }
  fly(li, a.from);
  return true;
}

const LIFT = 170, FLIGHT = 700, TOTAL = LIFT + FLIGHT;

function fly(li: HTMLElement, r0: DOMRect) {
  // Bring the row into view first (instantly, so the measurements hold).
  const top = li.getBoundingClientRect().top;
  if (top < 80 || top > window.innerHeight - 120) window.scrollBy(0, top - window.innerHeight * 0.4);

  const r1 = li.getBoundingClientRect();
  const cs = getComputedStyle(li);
  li.style.visibility = "hidden";

  // The card: a copy of the real row inside the same scope + pile classes, so
  // its tokens and stub colours match the row it becomes.
  const pile = li.closest(".over") ? "over" : "up";
  const fx = document.createElement("div");
  fx.className = "tks-scope tsh-fly-x";
  const fy = document.createElement("div");
  fy.className = "tsh-fly-y";
  const card = document.createElement("div");
  card.className = `tsh-flyer ${pile}`;
  const list = document.createElement("ul");
  const copy = li.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  copy.classList.remove("fresh");
  copy.style.visibility = "";
  copy.style.width = `${r1.width}px`;
  list.appendChild(copy);
  card.appendChild(list);
  fy.appendChild(card);
  fx.appendChild(fy);
  document.body.appendChild(fx);
  card.style.width = `${r0.width}px`;

  const dx = r0.left - r1.left, dy = r0.top - r1.top, climbing = dy > 0;
  const at = `translate(${r1.left}px,${r1.top}px)`;
  fx.style.transform = at;

  // The pile opens the gap while the card is in the air, done just before it lands.
  const gap = li.animate(
    [{ height: "0px", paddingTop: "0px", paddingBottom: "0px", borderTopWidth: "0px" },
     { height: `${r1.height}px`, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, borderTopWidth: cs.borderTopWidth }],
    { duration: 520, delay: 160, easing: "cubic-bezier(.22,.72,.24,1)", fill: "backwards" },
  );
  li.style.overflow = "hidden";

  // X eases in-out; Y eases out when climbing and in when dropping: one arc.
  fx.animate([{ transform: `translate(${r1.left + dx}px,${r1.top}px)` }, { transform: at }],
    { duration: FLIGHT, delay: LIFT, easing: "cubic-bezier(.5,0,.3,1)", fill: "both" });
  fy.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
    { duration: FLIGHT, delay: LIFT, easing: climbing ? "cubic-bezier(.25,.1,.25,1)" : "cubic-bezier(.55,-0.45,.6,1)", fill: "both" });

  // Lift and tilt, stretch to the list width mid-air, level out to land.
  const air = card.animate([
    { width: `${r0.width}px`, transform: "translateY(0) rotate(0deg) scale(1)", boxShadow: "2px 2px 0 var(--butter), 0 0 0 transparent", easing: "cubic-bezier(.3,.7,.4,1)" },
    { width: `${r0.width}px`, transform: "translateY(-12px) rotate(-2deg) scale(1.035)", boxShadow: "6px 8px 0 var(--butter), 0 18px 34px -12px rgba(38,33,27,.28)", offset: LIFT / TOTAL, easing: "cubic-bezier(.65,0,.35,1)" },
    { transform: "translateY(-4px) rotate(1deg) scale(1.03)", boxShadow: "7px 9px 0 var(--butter), 0 22px 38px -12px rgba(38,33,27,.3)", offset: 0.62, easing: "cubic-bezier(.4,0,.2,1)" },
    { width: `${r1.width}px`, transform: "translateY(0) rotate(0deg) scale(1)", boxShadow: "3px 3px 0 var(--butter), 0 4px 10px -6px rgba(38,33,27,.2)" },
  ], { duration: TOTAL, fill: "forwards" });

  const done = () => {
    fx.remove();
    gap.cancel();
    li.style.overflow = "";
    li.style.visibility = "";
    land(li);
  };
  air.finished.then(() => {
    puffs(r1);
    // Settle: a soft press, the shadow and border melt into the row.
    return card.animate([
      { transform: "scale(1)", boxShadow: "3px 3px 0 var(--butter), 0 4px 10px -6px rgba(38,33,27,.2)", borderColor: "var(--ink)", borderRadius: "16px" },
      { transform: "scale(1.008, .975)", boxShadow: "1px 1px 0 var(--butter), 0 0 0 transparent", offset: 0.35, easing: "cubic-bezier(.3,.7,.4,1)" },
      { transform: "scale(1)", boxShadow: "0 0 0 transparent, 0 0 0 transparent", borderColor: "transparent", borderRadius: "0px" },
    ], { duration: 280, easing: "ease-out", fill: "forwards" }).finished;
  }).then(done, done);
}

/** The landed row: a butter wash, a marker swipe under the title, a NEW tape. */
function land(li: HTMLElement) {
  li.classList.add("tsh-landed");
  const tape = document.createElement("span");
  tape.className = "tsh-tape";
  tape.textContent = "NEW";
  tape.setAttribute("aria-hidden", "true");
  li.appendChild(tape);
  window.setTimeout(() => { tape.remove(); li.classList.remove("tsh-landed"); }, 3100);
}

function puffs(r: DOMRect) {
  const cols = ["#FFE5A0", "#CFE2FF", "#FFD5C4", "#C7EFDA", "#E1D8FF", "#FFD6E6"];
  for (let i = 0; i < 10; i++) {
    const p = document.createElement("i");
    p.className = "tsh-puff";
    p.style.background = cols[i % cols.length];
    const left = i < 5;
    p.style.left = `${left ? r.left + 6 : r.right - 6}px`;
    p.style.top = `${r.top + r.height * (0.25 + Math.random() * 0.5)}px`;
    document.body.appendChild(p);
    const dx = (left ? -1 : 1) * (26 + Math.random() * 40), dy = (Math.random() - 0.6) * 56;
    p.animate([
      { transform: "translate(0,0) scale(.4)", opacity: 0 },
      { transform: `translate(${dx * 0.35}px,${dy * 0.35}px) scale(1)`, opacity: 1, offset: 0.2 },
      { transform: `translate(${dx}px,${dy}px) scale(.3) rotate(${dx * 4}deg)`, opacity: 0 },
    ], { duration: 620 + Math.random() * 220, delay: Math.random() * 60, easing: "cubic-bezier(.22,.72,.24,1)", fill: "backwards" })
      .finished.then(() => p.remove(), () => p.remove());
  }
}
