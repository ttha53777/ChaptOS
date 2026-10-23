"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  canSitOnTop,
  nudgeCard,
  placeCard,
  setWidgetHidden,
  zoneOf,
  type DashBandId,
  type DashZone,
  type DashCardId,
  type DashWidgetId,
  type DashboardLayout,
} from "@/lib/dashboard-layout";
import { PaperIcon, type PaperIconName, type PaperTone } from "../../paper/PaperIcon";
import { thumbSvg } from "./thumbs";
import { DashPortal } from "./DashPortal";

/** What every arrangeable widget needs to draw its folded strip and tray tile. */
export interface WidgetMeta {
  label: string;
  icon: PaperIconName;
  tone: PaperTone;
  /** One line for the tray: what the widget is for. */
  blurb: string;
}

export interface GridCard extends WidgetMeta {
  node: React.ReactNode;
  /** Spans the full row once the grid collapses below desktop. */
  wide?: boolean;
}

/** A fixed-place widget (the health dial) this org can have. */
export interface GridBand extends WidgetMeta {
  id: DashBandId;
}

type Col = DashZone;
type Change = (next: DashboardLayout, message: string) => void;

const EASE = "cubic-bezier(.16,.9,.3,1.02)";
const reduceMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** One widget folded to a line: grip, tile, name, a little picture of it, ×. */
export function ArrangeStrip({
  id,
  meta,
  onPutAway,
  fixed,
  placeholder,
  landed,
}: {
  id: DashWidgetId;
  meta: WidgetMeta;
  onPutAway?: () => void;
  /** A band: it can be put away but stays in its spot. */
  fixed?: boolean;
  placeholder?: boolean;
  landed?: boolean;
}) {
  return (
    <article
      data-w={id}
      className={`ar-strip pp-t-${meta.tone}${fixed ? " fixed" : ""}${placeholder ? " ph" : ""}${landed ? " landed" : ""}`}
      tabIndex={placeholder ? -1 : 0}
      aria-label={fixed ? `${meta.label}. Delete puts it away.` : `${meta.label}. Arrow keys move it, Delete puts it away.`}
    >
      {!fixed && <span className="ar-grip" aria-hidden="true"><PaperIcon name="grip" /></span>}
      <span className="pp-tile" aria-hidden="true"><PaperIcon name={meta.icon} /></span>
      <b>{meta.label}</b>
      {fixed && <span className="ar-fixed-tag">Stays put</span>}
      <span className="ar-mini" aria-hidden="true" dangerouslySetInnerHTML={{ __html: thumbSvg(id) }} />
      {onPutAway && (
        <button type="button" data-x className="ar-x" aria-label={`Put ${meta.label} away`} title="Put away" onClick={onPutAway}>
          <PaperIcon name="x" />
        </button>
      )}
    </article>
  );
}

/** The bands' strips while arranging: shown in their fixed spot, × to put away. */
export function ArrangeBands({ layout, bands, onChange }: { layout: DashboardLayout; bands: GridBand[]; onChange: Change }) {
  const shown = bands.filter(b => !layout.hidden.includes(b.id));
  if (!shown.length) return null;
  return (
    <div className="ar-bands">
      {shown.map(b => (
        <ArrangeStrip key={b.id} id={b.id} meta={b} fixed onPutAway={() => onChange(setWidgetHidden(layout, b.id, true), `${b.label} put away`)} />
      ))}
    </div>
  );
}

interface Gesture {
  id: DashCardId;
  fromTray: boolean;
  touch: boolean;
  x0: number; y0: number; x: number; y: number;
  live: boolean;
  dx: number; dy: number; w: number;
  hold?: ReturnType<typeof setTimeout>;
}
interface Target { col: Col | null; at: number; trash: boolean }

/**
 * The dashboard's two-column grid, in whatever order the org's layout says, and
 * Arrange mode on top of it.
 *
 * `cards` holds only what this org can have (workflow + Settings switches);
 * ids the layout names that aren't in it are skipped, which is why a hidden
 * workflow's card keeps its slot for when it comes back.
 *
 * Arranging folds every card to a one-line strip (bodies unmount, so a drag
 * can't approve someone or cast a vote by accident). One gesture does
 * everything: drag a strip to move it, onto the tray to put it away, or a tray
 * tile up to add it. Mouse drags after 6px; touch after a 200ms hold, so a
 * swipe still scrolls. Every reorder glides (FLIP), keyed by card id because
 * moving between columns remounts the element.
 *
 * Below desktop the columns dissolve (`display: contents`) and the cards
 * interleave main/rail by CSS `order`; while arranging they stay two labelled
 * stacks, since that is what's being arranged.
 */
export function DashGrid({
  layout,
  cards,
  bands,
  numbers,
  editing,
  onChange,
  onUndo,
  onDone,
  onReset,
}: {
  layout: DashboardLayout;
  cards: Partial<Record<DashCardId, GridCard>>;
  bands: GridBand[];
  /** The headline numbers, drawn between the top spot and the columns. */
  numbers?: React.ReactNode;
  editing: boolean;
  onChange: Change;
  onUndo: () => void;
  onDone: () => void;
  onReset: () => void;
}) {
  const hidden = new Set(layout.hidden);
  const visible = useCallback((k: DashCardId) => !!cards[k] && !layout.hidden.includes(k), [cards, layout.hidden]);
  const shown = (c: Col) => layout[c].filter(k => !!cards[k] && !hidden.has(k));

  const [target, setTarget] = useState<(Target & { id: DashCardId; fromTray: boolean }) | null>(null);
  const [landed, setLanded] = useState<DashWidgetId | null>(null);
  const [focusId, setFocusId] = useState<DashCardId | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const colRef = useRef<Record<Col, HTMLDivElement | null>>({ top: null, main: null, rail: null });
  const trayRef = useRef<HTMLElement | null>(null);
  const placeTray = useRef<() => void>(() => {});
  const liftRef = useRef<HTMLDivElement>(null);
  const g = useRef<Gesture | null>(null);
  const tRef = useRef<Target | null>(null);
  const settling = useRef(false);
  const raf = useRef(0);
  const lastLayout = useRef(layout);
  lastLayout.current = layout;

  // The top spot and the numbers render as siblings of the grid (the page's
  // `.dash > .grid` rules need the grid to stay a direct child), so anything
  // that looks for strips searches the whole dashboard.
  const scope = useCallback((): HTMLElement | null => rootRef.current?.closest<HTMLElement>(".dash") ?? rootRef.current, []);

  // ── FLIP ──────────────────────────────────────────────────────────────────
  const rects = useRef<Map<string, DOMRect> | null>(null);
  const capture = useCallback(() => {
    const root = scope();
    if (!root || reduceMotion()) return;
    rects.current = new Map([...root.querySelectorAll<HTMLElement>("[data-w]")].map(el => [el.dataset.w!, el.getBoundingClientRect()]));
  }, [scope]);
  // Entering/leaving Arrange swaps cards for strips in one render: measure the
  // old DOM during that render, before React commits the new one.
  const wasEditing = useRef(editing);
  if (wasEditing.current !== editing) {
    wasEditing.current = editing;
    capture();
  }
  useLayoutEffect(() => {
    const before = rects.current;
    rects.current = null;
    const root = scope();
    if (!before || !root) return;
    for (const el of root.querySelectorAll<HTMLElement>("[data-w]")) {
      const a = before.get(el.dataset.w!);
      if (!a) continue;
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 340, easing: EASE });
      }
    }
  });

  const commit = useCallback((next: DashboardLayout, message: string, land?: DashWidgetId) => {
    if (next === lastLayout.current) return;
    capture();
    onChange(next, message);
    if (land) setLanded(land);
  }, [capture, onChange]);

  useEffect(() => {
    if (!landed) return;
    const t = setTimeout(() => setLanded(null), 650);
    scope()?.querySelector(`[data-w="${landed}"]`)?.scrollIntoView({ block: "nearest", behavior: reduceMotion() ? "auto" : "smooth" });
    return () => clearTimeout(t);
  }, [landed]);

  useLayoutEffect(() => {
    if (!focusId) return;
    scope()?.querySelector<HTMLElement>(`.ar-strip[data-w="${focusId}"]`)?.focus();
    setFocusId(null);
  }, [focusId, layout]);

  // ── Drag ──────────────────────────────────────────────────────────────────
  const label = (k: DashCardId) => cards[k]?.label ?? k;
  const addBack = (l: DashboardLayout, k: DashCardId) => placeCard(l, k, canSitOnTop(k) ? "top" : "main", canSitOnTop(k) ? 0 : Infinity, visible);

  const hitTest = useCallback((x: number, y: number, d: Gesture): Target => {
    const tr = trayRef.current?.getBoundingClientRect();
    const overTray = !!tr && x >= tr.left && x <= tr.right && y >= tr.top - 10 && y <= tr.bottom;
    if (overTray) return { col: null, at: 0, trash: !d.fromTray };
    let best: Col | null = null, bd = Infinity;
    for (const c of ["top", "main", "rail"] as Col[]) {
      const el = colRef.current[c];
      if (!el || (c === "top" && !canSitOnTop(d.id))) continue;
      const r = el.getBoundingClientRect();
      const dist = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
      if (dist < bd) { bd = dist; best = c; }
    }
    if (!best || bd > 140) {
      // A card already on the board keeps its last slot; a tray tile goes nowhere.
      const prev = tRef.current;
      return d.fromTray || !prev ? { col: null, at: 0, trash: false } : { ...prev, trash: false };
    }
    // Layout offsets, not rects: they ignore in-flight FLIP transforms, so the
    // slot doesn't jitter while its neighbours are still gliding.
    const col = colRef.current[best]!;
    const ry = y - col.getBoundingClientRect().top;
    const all = [...col.querySelectorAll<HTMLElement>(":scope > [data-w]")];
    // Measure as if the placeholder weren't there: it pushes every card below
    // it down a slot, and judging by those pushed positions pins the slot
    // wherever the pointer first entered the column.
    const ph = all.find(el => el.dataset.w === d.id);
    const lift = ph ? ph.offsetHeight + (parseFloat(getComputedStyle(col).rowGap) || 0) : 0;
    const sibs = all.filter(el => el !== ph);
    const i = sibs.findIndex(el => el.offsetTop - (ph && el.offsetTop > ph.offsetTop ? lift : 0) + el.offsetHeight / 2 > ry);
    return { col: best, at: i < 0 ? sibs.length : i, trash: false };
  }, []);

  const moveLift = useCallback(() => {
    const d = g.current, lift = liftRef.current;
    if (!d || !lift) return;
    lift.style.transform = `translate(${d.x - d.dx}px, ${d.y - d.dy}px)`;
  }, []);

  // The lifted copy mounts with the drag; place it before it paints.
  useLayoutEffect(() => {
    const d = g.current, lift = liftRef.current;
    if (!d?.live || !lift) return;
    lift.style.width = `${d.w}px`;
    moveLift();
  }, [target?.id, moveLift]);

  const follow = useCallback(() => {
    const d = g.current;
    if (!d?.live) return;
    moveLift();
    const t = hitTest(d.x, d.y, d);
    const p = tRef.current;
    if (p && p.col === t.col && p.at === t.at && p.trash === t.trash) return;
    tRef.current = t;
    capture();
    setTarget({ ...t, id: d.id, fromTray: d.fromTray });
  }, [capture, hitTest, moveLift]);

  const autoScroll = useCallback(() => {
    const d = g.current;
    if (!d?.live) return;
    const scroller = rootRef.current?.closest("main") ?? document.scrollingElement;
    const top = scroller instanceof HTMLElement && scroller !== document.scrollingElement ? scroller.getBoundingClientRect().top : 0;
    const trayTop = trayRef.current?.getBoundingClientRect().top ?? window.innerHeight;
    let v = 0;
    if (d.y < top + 70) v = -(top + 70 - d.y) / 4;
    else if (d.y > trayTop - 24 && d.y < trayTop + 4) v = 6;
    if (v && scroller) { scroller.scrollBy(0, v); follow(); }
    raf.current = requestAnimationFrame(autoScroll);
  }, [follow]);

  const startDrag = useCallback((el: HTMLElement) => {
    const d = g.current;
    if (!d) return;
    const r = el.getBoundingClientRect();
    d.live = true;
    d.dx = d.x - r.left;
    d.dy = d.y - r.top;
    const fromCol: Col | null = d.fromTray ? null : zoneOf(layout, d.id);
    d.w = r.width;
    const t: Target = fromCol ? { col: fromCol, at: shown(fromCol).indexOf(d.id), trash: false } : { col: null, at: 0, trash: false };
    tRef.current = t;
    setTarget({ ...t, id: d.id, fromTray: d.fromTray });
    document.body.classList.add("ar-dragging");
    navigator.vibrate?.(8);
    raf.current = requestAnimationFrame(autoScroll);
  }, [layout, autoScroll]);

  const endDrag = useCallback(() => {
    cancelAnimationFrame(raf.current);
    document.body.classList.remove("ar-dragging");
    const d = g.current;
    const t = tRef.current;
    g.current = null;
    tRef.current = null;
    if (!d || !t) { setTarget(null); return; }
    const finish = () => {
      settling.current = false;
      const l = lastLayout.current;
      capture();
      setTarget(null);
      if (t.trash) { onChange(setWidgetHidden(l, d.id, true), `${label(d.id)} put away`); setLanded(d.id); return; }
      if (!t.col) return;
      const next = placeCard(l, d.id, t.col, t.at, visible);
      if (next !== l) { onChange(next, d.fromTray ? `${label(d.id)} added` : `Moved ${label(d.id)}`); setLanded(d.id); }
    };
    const ph = scope()?.querySelector<HTMLElement>(`.ar-strip.ph[data-w="${d.id}"]`);
    const lift = liftRef.current;
    if (!t.col || !ph || !lift || reduceMotion()) { finish(); return; }
    // Glide the lifted strip into its slot, then let the real one take over.
    settling.current = true;
    const r = ph.getBoundingClientRect();
    lift.classList.add("settle");
    lift.style.transform = `translate(${r.left}px, ${r.top}px)`;
    lift.style.width = `${r.width}px`;
    setTimeout(finish, 230);
  }, [capture, onChange, visible, cards]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!editing || e.button > 0 || g.current || settling.current) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-w]");
    if (!el || (e.target as HTMLElement).closest("[data-x]") || el.classList.contains("fixed")) return;
    const id = el.dataset.w as DashCardId;
    const fromTray = !!el.closest(".ar-tray");
    g.current = { id, fromTray, touch: e.pointerType !== "mouse", x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, live: false, dx: 0, dy: 0, w: 0 };
    const d = g.current;
    if (d.touch) d.hold = setTimeout(() => { if (g.current === d && !d.live) startDrag(el); }, 200);

    const move = (ev: PointerEvent) => {
      if (g.current !== d) return;
      d.x = ev.clientX; d.y = ev.clientY;
      if (!d.live) {
        const moved = Math.hypot(d.x - d.x0, d.y - d.y0) > 6;
        if (moved && d.touch) { clearTimeout(d.hold); g.current = null; cleanup(); return; } // it was a scroll
        if (moved) startDrag(el);
        return;
      }
      follow();
    };
    const up = (ev: PointerEvent) => {
      cleanup();
      if (g.current !== d) return;
      clearTimeout(d.hold);
      if (d.live) { endDrag(); return; }
      g.current = null;
      // A tap on a tray tile brings it back: the pinned note to its spot at the
      // top, anything else to the end of the wide column.
      if (ev.type === "pointerup" && d.fromTray) commit(addBack(lastLayout.current, id), `${label(id)} added`, id);
    };
    function cleanup() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, [editing, startDrag, follow, endDrag, commit, visible, cards]);

  useEffect(() => () => { cancelAnimationFrame(raf.current); document.body.classList.remove("ar-dragging"); }, []);

  // The tray is portaled to <body> (the page root is a transform containing
  // block), so it centres itself on the page's scroll area by hand, clear of
  // the sidebar. The body class also tucks away the Ask Chapt launcher, which
  // would otherwise sit on top of the tray's corner.
  useLayoutEffect(() => {
    if (!editing) return;
    const main = rootRef.current?.closest("main");
    document.body.classList.add("dash-arranging");
    const place = placeTray.current = () => {
      const tray = trayRef.current;
      if (!tray || !main) return;
      const r = main.getBoundingClientRect();
      const gutter = r.width < 640 ? 16 : 32;
      tray.style.left = `${r.left + r.width / 2}px`;
      tray.style.width = `${Math.min(1124, r.width - gutter)}px`;
    };
    place();
    const ro = main ? new ResizeObserver(place) : null;
    if (main) ro!.observe(main);
    window.addEventListener("resize", place);
    return () => {
      document.body.classList.remove("dash-arranging");
      placeTray.current = () => {};
      ro?.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [editing]);
  useEffect(() => { if (!editing) { g.current = null; tRef.current = null; setTarget(null); } }, [editing]);
  // A live touch drag must stop the page scrolling under it. The blocking
  // listener has to exist before the finger lands: the browser decides at
  // touchstart whether it waits on script, and one added mid-gesture is ignored.
  useEffect(() => {
    if (!editing) return;
    const block = (ev: TouchEvent) => { if (g.current?.live) ev.preventDefault(); };
    document.addEventListener("touchmove", block, { passive: false });
    return () => document.removeEventListener("touchmove", block);
  }, [editing]);

  // ── Keyboard: the same moves without a pointer ────────────────────────────
  useEffect(() => {
    if (!editing) return;
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); capture(); onUndo(); return; }
      if (e.key === "Escape") {
        // The number picker closes on its own Escape; only leave when it's shut.
        if (!document.querySelector(".dn-pick")) onDone();
        return;
      }
      const el = (document.activeElement as HTMLElement | null)?.closest?.<HTMLElement>(".dash .ar-strip[data-w]");
      if (!el || el.closest(".ar-tray")) return;
      const l = lastLayout.current;
      if (el.classList.contains("fixed")) {
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          const b = bands.find(x => x.id === el.dataset.w);
          if (b) commit(setWidgetHidden(l, b.id, true), `${b.label} put away`);
        }
        return;
      }
      const k = el.dataset.w as DashCardId;
      const inMain = l.main.includes(k);
      const onTop = l.top.includes(k);
      let next = l;
      if (e.key === "ArrowUp") next = nudgeCard(l, k, "up", visible);
      else if (e.key === "ArrowDown") next = nudgeCard(l, k, "down", visible);
      else if (!onTop && ((e.key === "ArrowRight" && inMain) || (e.key === "ArrowLeft" && !inMain))) next = nudgeCard(l, k, "swap", visible);
      else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        commit(setWidgetHidden(l, k, true), `${label(k)} put away`, k);
        return;
      } else return;
      e.preventDefault();
      if (next !== l) { commit(next, `Moved ${label(k)}`); setFocusId(k); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [editing, visible, bands, commit, onUndo, onDone, capture, cards]);

  // ── Render ────────────────────────────────────────────────────────────────
  const columnIds = (c: Col): DashCardId[] => {
    const ids = shown(c);
    if (!target) return ids;
    const out = ids.filter(k => k !== target.id);
    if (target.col === c) out.splice(Math.min(target.at, out.length), 0, target.id);
    return out;
  };
  const top = columnIds("top");
  const main = columnIds("main");
  const rail = columnIds("rail");
  const topAvailable = (Object.keys(cards) as DashCardId[]).some(canSitOnTop);

  const order: DashCardId[] = [];
  for (let i = 0; i < Math.max(main.length, rail.length); i++) {
    if (main[i]) order.push(main[i]);
    if (rail[i]) order.push(rail[i]);
  }

  const column = (c: Col, ids: DashCardId[]) => (
    <div
      ref={el => { colRef.current[c] = el; }}
      className={`col ${c === "main" ? "col-main" : "rail col-rail"}${target && target.col === c ? " hot" : ""}`}
      data-col={c}
      data-label={c === "main" ? "Main" : "Side"}
    >
      {ids.map(k => {
        const card = cards[k]!;
        if (editing) {
          return (
            <ArrangeStrip
              key={k}
              id={k}
              meta={card}
              placeholder={target?.id === k}
              landed={landed === k}
              onPutAway={() => commit(setWidgetHidden(layout, k, true), `${card.label} put away`, k)}
            />
          );
        }
        return (
          <div key={k} data-w={k} className={`dw${card.wide ? " wide" : ""}`} style={{ order: order.indexOf(k) }}>
            <div className="dw-body">{card.node}</div>
          </div>
        );
      })}
    </div>
  );

  // Everything this org could show that isn't on the page: the tray.
  // That's a card the admin put away, or one the org can have that was never
  // placed: every optional card (money, grades, a custom metric) starts here.
  const placed = new Set([...layout.top, ...layout.main, ...layout.rail]);
  const offCards = (Object.keys(cards) as DashCardId[]).filter(k => (hidden.has(k) || !placed.has(k)) && !(target?.id === k && target.col));
  const offBands = bands.filter(b => hidden.has(b.id));
  const lifted = target ? cards[target.id] : null;

  // The spot under the health dial. Arranging shows it as a drop zone for as
  // long as there's a card that may sit there; otherwise only what's in it.
  const topZone = editing ? (topAvailable && (
    <div
      ref={el => { colRef.current.top = el; }}
      className={`col ar-top${target && target.col === "top" ? " hot" : ""}`}
      data-col="top"
      data-label="Top of the page"
      onPointerDown={onPointerDown}
    >
      {top.map(k => (
        <ArrangeStrip
          key={k}
          id={k}
          meta={cards[k]!}
          placeholder={target?.id === k}
          landed={landed === k}
          onPutAway={() => commit(setWidgetHidden(layout, k, true), `${cards[k]!.label} put away`, k)}
        />
      ))}
    </div>
  )) : top.map(k => (
    <div key={k} data-w={k} className="dw-band dw-top">{cards[k]!.node}</div>
  ));

  return (
    <>
      {topZone}
      {numbers}
      <div ref={rootRef} className={`grid dg${editing ? " arranging" : ""}`} onPointerDown={editing ? onPointerDown : undefined}>
        {column("main", main)}
        {column("rail", rail)}
      </div>

      {editing && (
        <DashPortal>
          <aside
            ref={el => { trayRef.current = el; if (el) placeTray.current(); }}
            className={`ar-tray${target?.trash ? " hot" : ""}`}
            aria-label="Not on the dashboard"
            onPointerDown={onPointerDown}
          >
            <div className="ar-tray-h">
              <b>Not on the dashboard</b>
              <span>{offCards.length + offBands.length ? "Drag one up, or tap to add it" : ""}</span>
              <button type="button" className="ar-reset" onClick={() => { capture(); onReset(); }}>Back to default</button>
            </div>
            <div className="ar-shelf">
              {offCards.length + offBands.length === 0 && <div className="ar-shelf-empty">Everything&apos;s on your dashboard.</div>}
              {offBands.map(b => (
                <button
                  key={b.id}
                  type="button"
                  className={`ar-it pp-t-${b.tone}${landed === b.id ? " landed" : ""}`}
                  aria-label={`Add ${b.label}`}
                  onClick={() => commit(setWidgetHidden(layout, b.id, false), `${b.label} added`)}
                >
                  <TrayFace id={b.id} meta={b} />
                </button>
              ))}
              {offCards.map(k => (
                <button
                  key={k}
                  type="button"
                  data-w={k}
                  className={`ar-it pp-t-${cards[k]!.tone}${target?.id === k ? " ph" : ""}${landed === k ? " landed" : ""}`}
                  aria-label={`Add ${cards[k]!.label}`}
                  onKeyDown={e => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    commit(addBack(layout, k), `${cards[k]!.label} added`, k);
                  }}
                >
                  <TrayFace id={k} meta={cards[k]!} />
                </button>
              ))}
            </div>
            <div className="ar-drop-hint" aria-hidden="true"><PaperIcon name="chev-d" /> Let go to put it away</div>
          </aside>
          {lifted && target && (
            <div ref={liftRef} className={`ar-lift${target.trash ? " trash" : ""}`} aria-hidden="true">
              <ArrangeStrip id={target.id} meta={lifted} />
            </div>
          )}
        </DashPortal>
      )}
    </>
  );
}

function TrayFace({ id, meta }: { id: DashWidgetId; meta: WidgetMeta }) {
  return (
    <>
      <span className="ar-it-r">
        <span className="pp-tile" aria-hidden="true"><PaperIcon name={meta.icon} /></span>
        <b>{meta.label}</b>
        <span className="ar-add" aria-hidden="true"><PaperIcon name="plus" /></span>
      </span>
      <span className="ar-th" aria-hidden="true" dangerouslySetInnerHTML={{ __html: thumbSvg(id) }} />
      <small>{meta.blurb}</small>
    </>
  );
}
