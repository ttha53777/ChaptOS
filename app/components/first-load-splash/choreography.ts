/**
 * Beats 2 and 3 of the first load splash, plus the slow-session idle, the
 * pointer parallax and the exits. Ported from the <script> in
 * _design/First Load Splash Mock.html. Keyframes, durations, delays and easings
 * are the mock's; function names match it (becomeOrg, idle, scatter, flip,
 * handoff) so the two can be read side by side.
 *
 * Beat 1 is CSS (first-load-splash.css) so it runs before this file has even
 * downloaded. This only listens: the driver feeds it session() when
 * /api/auth/me resolves, loaded() when ChapterContext's hasLoaded flips, and
 * fail() when there's no user to open. Nothing here can hold the app back.
 * It's all WAAPI on elements inside the overlay, and the only per-frame JS is
 * the parallax, which runs on desktop pointers and only while the pointer moves.
 */
import { orgInitials } from "@/lib/org-initials";
import { markSplashSeen } from "@/lib/first-load-splash";

const SPRING = "cubic-bezier(.16,.9,.3,1.02)", OUT = "cubic-bezier(.22,1,.36,1)";
/** The mock's intro() returns 2000: when the draw has settled. */
const INTRO_MS = 2000;
/** Never trap anyone behind the paper: past this, leave regardless. */
const WATCHDOG_MS = 15_000;
/** How long hand-off waits for its landing spot to reach the DOM. */
const TARGET_WAIT_MS = 600;

export interface SplashOrg { name: string; logoUrl: string | null }
type Rect = { left: number; top: number; width: number; height: number };

const dash = (from: number, to: number): Keyframe[] => [
  { strokeDasharray: "1 2", strokeDashoffset: from }, { strokeDasharray: "1 2", strokeDashoffset: to },
];

export class SplashRun {
  private readonly reduce: boolean;
  private readonly introEnd: number;
  private timers: number[] = [];
  private stopParallax: (() => void) | null = null;
  private org: SplashOrg | null = null;
  private orgDone = false;
  private dataIn = false;
  private idling = false;
  private leaving = false;
  private finished = false;

  constructor(readonly root: HTMLElement, private readonly onDone: () => void) {
    this.reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const full = document.documentElement.getAttribute("data-fls") === "on" && !this.reduce;
    // Beat 1 started on first paint, long before we hydrated: read where it is
    // from the outline's CSS animation rather than assuming it starts now.
    const outlineAnim = full ? this.$(".fls-outline")?.getAnimations()[0] : undefined;
    const start = typeof outlineAnim?.startTime === "number" ? outlineAnim.startTime : performance.now();
    this.introEnd = full ? start + INTRO_MS : performance.now();
    if (!this.reduce) this.idle(Math.max(0, this.introEnd + 400 - performance.now()));
    this.parallax();
    this.later(WATCHDOG_MS, () => this.fade());
  }

  // ── inputs from the driver ────────────────────────────────────────────────

  /** /api/auth/me resolved. `instant` = it already had when we hydrated. */
  session(org: SplashOrg, instant: boolean): void {
    if (this.org || this.leaving) return;
    this.org = org;
    if (org.logoUrl) new Image().src = org.logoUrl;   // warm it for the drop at +520ms
    if (instant || this.reduce) {
      // Cached: ChaptOS is already drawn; go straight to their tile.
      this.finishBeat1();
      this.ticks(false);
      this.go(0);
      return;
    }
    // The mark gets to finish drawing first (the mock's orgAt).
    this.go(Math.max(0, this.introEnd + 250 - performance.now()));
  }

  /** ChapterContext's hasLoaded: the page's data is in. */
  loaded(): void {
    if (!this.dataIn) performance.mark("fls:loaded");
    this.dataIn = true;
    this.tryHandoff();
  }

  /** No user to open (no session, /me failed): just lift the paper. */
  fail(): void { this.fade(); }

  // ── beats ─────────────────────────────────────────────────────────────────

  private go(wait: number): void {
    this.later(wait, () => {
      if (this.leaving || !this.org) return;
      this.setMsg(`Opening ${this.org.name}`);
      const ms = this.becomeOrg(this.org);
      if (this.reduce) {
        this.anims(this.root).forEach(a => { if (isFinite(a.effect?.getComputedTiming().endTime as number)) a.finish(); });
        this.later(400, () => { this.orgDone = true; this.tryHandoff(); });
      } else {
        // leave as soon as both are true: the data is in, and the tile has finished turning
        this.later(ms + 150, () => { this.orgDone = true; this.tryHandoff(); });
      }
    });
  }

  private tryHandoff(): void {
    if (this.orgDone && this.dataIn && !this.leaving) void this.handoff();
  }

  /** 2. We know the org: the mark becomes their tile. */
  private becomeOrg(org: SplashOrg): number {
    this.idling = false;
    const logo = !!org.logoUrl;
    const lockup = this.$(".fls-lockup")!, mark = this.$(".fls-mark")!;

    // Fill the slots. The words cell can grow to fit the name, which re-centres
    // the lockup; slide it there instead of letting it jump.
    const before = mark.getBoundingClientRect().left;
    this.$(".fls-org-name")!.textContent = org.name;
    this.$(".fls-org-term")!.textContent = this.term();
    if (!this.term()) this.awaitTerm();
    this.$(".fls-org-init")!.textContent = orgInitials(org.name);
    if (org.logoUrl) this.$(".fls-org-img")!.setAttribute("href", org.logoUrl);
    // A long name on a phone: shrink it to fit (to 60%) before the ellipsis.
    const nameEl = this.$(".fls-org-name")!;
    const over = nameEl.scrollWidth / (nameEl.clientWidth || 1);
    if (over > 1) nameEl.style.fontSize = `${Math.max(.6, .97 / over) * parseFloat(getComputedStyle(nameEl).fontSize)}px`;
    const dx = mark.getBoundingClientRect().left - before;
    if (Math.abs(dx) > .5) {
      this.A(lockup, [{ transform: `translateX(${-dx / this.scale()}px)` }, { transform: "translateX(0)" }], { duration: 620, easing: SPRING });
    }

    // the face folds away: a last blink that doesn't reopen, the smile rolls up
    this.A(this.$(".fls-eyes")!, [{ transform: "scaleY(1)" }, { transform: "scaleY(.1)", offset: .5 }, { transform: "scale(0,.1)" }],
      { duration: 300, easing: "ease-in" });
    this.A(this.$(".fls-smile")!, [
      { strokeDasharray: "1 2", strokeDashoffset: 0, opacity: 1 },
      { strokeDasharray: "1 2", strokeDashoffset: -.85, opacity: 1, offset: .8 },
      { strokeDasharray: "1 2", strokeDashoffset: -1, opacity: 0 }], { duration: 300, delay: 40, easing: "ease-in" });
    // the tile squares off to the logo-tile proportions (36 × 36, r 11 at 40 units ≈ 34 × 34, r 10)
    this.$$(".fls-tile").forEach(r => this.A(r, [
      { x: "2.5px", y: "4.5px", width: "35px", height: "31px", rx: "9px" },
      { x: "3px", y: "3px", width: "34px", height: "34px", rx: "10px" }] as Keyframe[],
      { duration: 560, delay: 220, easing: SPRING }));
    this.A(this.$(".fls-tilt")!, [{ transform: "rotate(0) scale(1)" }, { transform: "rotate(4deg) scale(.9)", offset: .35 },
      { transform: "rotate(-3deg) scale(1)" }], { duration: 620, delay: 220, easing: SPRING });
    this.A(this.$(".fls-tile-shadow")!, [{ fill: this.css("--fls-lilac") }, { fill: this.css("--fls-peach") }], { duration: 400, delay: 260 });
    if (logo) {
      this.A(this.$(".fls-org-img")!, [{ opacity: 0, transform: "scale(1.25)" }, { opacity: 1, transform: "scale(1)" }],
        { duration: 460, delay: 520, easing: SPRING });
    } else {
      this.A(this.$(".fls-org-init")!, [{ opacity: 0, transform: "scale(.4) rotate(-8deg)" }, { opacity: 1, transform: "scale(1.12) rotate(2deg)", offset: .6 },
        { opacity: 1, transform: "scale(1) rotate(0)" }], { duration: 480, delay: 520, easing: SPRING });
    }
    // the page gives a little hop as their mark lands
    this.$$(".fls-shapes b").forEach((b, i) => this.A(b, [{ transform: "translateY(0)" }, { transform: "translateY(-1.6cqmin)", offset: .4 }, { transform: "translateY(0)" }],
      { duration: 520, delay: 600 + i * 45, easing: "cubic-bezier(.3,1.4,.5,1)", fill: "none" }));
    this.$$(".fls-word span").forEach((sp, i) => this.A(sp, [
      { transform: "translateY(0)", opacity: 1, filter: "blur(0)" },
      { transform: "translateY(-.4em)", opacity: 0, filter: "blur(4px)" }],
      { duration: 320, delay: 120 + i * 30, easing: "ease-in" }));
    this.A(this.$(".fls-org")!, [{ opacity: 0 }, { opacity: 1 }], { duration: 1, delay: 420 });
    this.A(this.$(".fls-org-name")!, [{ transform: "translateY(.4em)", opacity: 0, filter: "blur(4px)" }, { transform: "none", opacity: 1, filter: "blur(0)" }],
      { duration: 520, delay: 420, easing: SPRING });
    this.A(this.$(".fls-org-term")!, [{ transform: "translateY(.6em)", opacity: 0 }, { transform: "none", opacity: 1 }],
      { duration: 480, delay: 540, easing: SPRING });
    return 1040;
  }

  /** Session is slow: the mark stays alive, glancing and blinking. */
  private idle(from: number): void {
    this.idling = true;
    const loop = (t: number) => this.later(t, () => {
      if (!this.idling || this.leaving) return;
      const dir = Math.random() < .5 ? -1 : 1;
      this.A(this.$(".fls-face")!, [{ transform: "translateX(0)" }, { transform: `translateX(${dir * 1.6}px)`, offset: .2 },
        { transform: `translateX(${dir * 1.6}px)`, offset: .75 }, { transform: "translateX(0)" }],
        { duration: 1300, easing: "ease-in-out", fill: "none" });
      this.blink(560);
      loop(2600);
    });
    loop(from);
  }

  private blink(at: number): void {
    this.A(this.$(".fls-eyes")!, [{ transform: "scaleY(1)" }, { transform: "scaleY(.12)", offset: .45 }, { transform: "scaleY(1)" }],
      { duration: 220, delay: at, easing: "ease-in-out", fill: "none" });
  }

  /** The shapes slide off the page, each outward from the centre. */
  private scatter(): void {
    const R = this.root.getBoundingClientRect(), k = this.scale();
    const cx = R.left + R.width / 2, cy = R.top + R.height / 2, far = 0.45 * Math.max(R.width, R.height) / k;
    this.$$(".fls-shapes i").forEach((el, i) => {
      const r = getComputedStyle(el).getPropertyValue("--r").trim() || "0deg", bb = el.getBoundingClientRect();
      const vx = bb.left + bb.width / 2 - cx, vy = bb.top + bb.height / 2 - cy, len = Math.hypot(vx, vy) || 1;
      this.A(el, [{ transform: `rotate(${r}) scale(1)`, opacity: 1 },
        { transform: `translate(${vx / len * far}px, ${vy / len * far}px) rotate(${r}) rotate(${vx > 0 ? 25 : -25}deg) scale(.85)`, opacity: 0 }],
        { duration: 820, delay: i * 25, easing: "cubic-bezier(.6,0,.25,1)" });
    });
  }

  /** Depth: shapes lean away from the pointer, nearer ones (higher data-d)
   *  more. Fine pointers only, so phones never run it. */
  private parallax(): void {
    if (this.reduce || !matchMedia("(pointer: fine)").matches) return;
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const els = this.$$(".fls-shapes i").map(el => [el, Number(el.dataset.d) || 0] as const);
    const tick = () => {
      x += (tx - x) * .06; y += (ty - y) * .06;
      for (const [el, d] of els) { el.style.setProperty("--px", (-x * d).toFixed(2) + "px"); el.style.setProperty("--py", (-y * d).toFixed(2) + "px"); }
      // settle, then stop: no frame loop while the pointer is still
      raf = Math.abs(tx - x) + Math.abs(ty - y) > .0005 ? requestAnimationFrame(tick) : 0;
    };
    const onMove = (e: PointerEvent) => {
      const R = this.root.getBoundingClientRect();
      tx = (e.clientX - R.left) / R.width - .5; ty = (e.clientY - R.top) / R.height - .5;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    addEventListener("pointermove", onMove, { passive: true });
    this.stopParallax = () => { removeEventListener("pointermove", onMove); cancelAnimationFrame(raf); };
  }

  /** FLIP `el` onto rect `b`, in local px (divided by any ancestor scale).
   *  Text (`to` = the target element) scales by font size, not box height, and
   *  lines up vertical centres: the two line-heights differ (1.02 vs 1.15), and
   *  the mock's height ratio landed the name 13% large, then snapped. */
  private flip(el: Element, b: Rect, origin: "center" | "left top", ms: number, to?: Element): Animation {
    const a = el.getBoundingClientRect(), k = this.scale();
    (el as HTMLElement).style.transformOrigin = origin;
    const fs = (x: Element) => parseFloat(getComputedStyle(x).fontSize);
    const s = to ? fs(to) / fs(el) : b.height / a.height;
    const [ox, oy] = origin === "center" ? [a.width / 2, a.height / 2] : [0, to ? a.height * s / 2 : 0];
    const bx = origin === "center" ? b.left + b.width / 2 : b.left;
    const by = origin === "center" || to ? b.top + b.height / 2 : b.top;
    const dx = (bx - (a.left + ox)) / k, dy = (by - (a.top + oy)) / k;
    return this.A(el, [{ transform: "translate(0,0) scale(1)" }, { transform: `translate(${dx}px,${dy}px) scale(${s})` }],
      { duration: ms, easing: "cubic-bezier(.7,0,.2,1)", composite: "add" });
  }

  /** 3. Ready: tile and name fly to where the app draws them. */
  private async handoff(): Promise<void> {
    this.leaving = true; this.idling = false;
    const t = await this.waitForTargets();
    if (this.finished) return;
    if (!t || this.reduce) { this.fade(this.reduce ? 200 : 280); return; }

    this.root.style.pointerEvents = "none";
    this.ticks(false);
    const ms = 760;
    this.A(this.$(".fls-status")!, [{ opacity: 1 }, { opacity: 0 }], { duration: 180 });
    // the svg's tile is inset 3/40 inside its box; flip the box so the tile lands on the logo tile
    const logo = t.logo.getBoundingClientRect(), pad = logo.width * 3 / 34;
    const fly = this.flip(this.$(".fls-mark")!, { left: logo.left - pad, top: logo.top - pad, width: logo.width + 2 * pad, height: logo.height + 2 * pad }, "center", ms);
    const name = this.$(".fls-org-name")!, term = this.$(".fls-org-term")!;
    if (t.name) this.flip(name, t.name.getBoundingClientRect(), "left top", ms, t.name);
    else this.A(name, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
    // the phone toolbar shows "Dashboard", not the term
    if (t.term && term.textContent?.trim()) this.flip(term, t.term.getBoundingClientRect(), "left top", ms, t.term);
    else this.A(term, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
    this.A(this.$(".fls-splash")!, [{ backgroundColor: this.css("--fls-paper") }, { backgroundColor: "transparent" }],
      { duration: 560, delay: 260, easing: "ease-out" });
    this.scatter();
    this.$$(".fls-dots, .fls-grain").forEach(w => this.A(w, [{ opacity: getComputedStyle(w).opacity }, { opacity: 0 }], { duration: 420, delay: 120 }));
    await fly.finished.catch(() => undefined);
    this.land();
    this.done();
  }

  /** Where the app draws the tile right now: the sidebar header on desktop,
   *  the toolbar tile on phones. Waits briefly for it to mount. */
  private async waitForTargets() {
    const until = performance.now() + TARGET_WAIT_MS;
    for (;;) {
      const t = this.targets();
      if (t || performance.now() > until || this.finished) return t;
      await new Promise(r => requestAnimationFrame(r));
    }
  }

  private targets(): { logo: Element; name: Element | null; term: Element | null } | null {
    const onScreen = (el: Element | null | undefined): el is Element => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
    };
    // a name target only counts when it shows the org's name (the tablet toolbar says "Dashboard")
    const named = (el: Element | null | undefined) => (onScreen(el) && el.textContent?.trim() === this.org?.name ? el : null);
    const sb = document.querySelector(".sb .sb-org .sb-logo");
    if (onScreen(sb)) {
      const head = sb.closest(".sb-org");
      const term = head?.querySelector(".sb-org-term");
      return { logo: sb, name: named(head?.querySelector(".sb-org-name")), term: onScreen(term) ? term : null };
    }
    const tb = Array.from(document.querySelectorAll(".tb-logo")).find(onScreen);
    if (tb) return { logo: tb, name: named(tb.closest("header")?.querySelector(".tb-title")), term: null };
    return null;
  }

  /** No flight: reveal the app and crossfade the paper away. */
  private fade(ms = 280): void {
    if (this.finished) return;
    this.leaving = true; this.idling = false;
    this.root.style.pointerEvents = "none";
    this.land();
    const a = this.A(this.root, [{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: "ease-out" });
    void a.finished.catch(() => undefined).then(() => this.done());
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  /** Unhide the real tile/name/term (the splash's own copies are still on top). */
  private land(): void { document.documentElement.setAttribute("data-fls-landed", ""); }

  private done(): void {
    if (this.finished) return;
    this.finished = true;
    // fls:loaded → fls:gone is everything the splash adds after the data is in
    performance.mark("fls:gone");
    this.timers.forEach(clearTimeout); this.timers = [];
    this.stopParallax?.();
    if (this.org) markSplashSeen();
    document.documentElement.removeAttribute("data-fls");
    document.documentElement.removeAttribute("data-fls-landed");
    this.onDone();
  }

  /** Jump beat 1's CSS to its end (the finite ones; drift and ticks loop). */
  private finishBeat1(): void {
    this.anims(this.root).forEach(a => {
      if (a instanceof CSSAnimation && isFinite(a.effect?.getComputedTiming().endTime as number)) a.finish();
    });
  }

  private setMsg(text: string): void {
    const m = this.$(".fls-msg")!;
    m.classList.add("fls-out");
    this.later(180, () => { m.textContent = text; m.classList.remove("fls-out"); });
  }
  private ticks(on: boolean): void { this.root.classList.toggle("fls-quiet", !on); }

  /** The term comes from /api/semesters, its own fetch, so it can land after
   *  /me. Fill it in when the sidebar gets it, rising in as the mock's does. */
  private awaitTerm(): void {
    const src = document.querySelector(".sb .sb-org-term");
    if (!src) return;
    const mo = new MutationObserver(() => {
      const text = this.term();
      if (!text) return;
      mo.disconnect();
      if (this.leaving) return;
      const el = this.$(".fls-org-term")!;
      el.textContent = text;
      this.A(el, [{ transform: "translateY(.6em)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 480, easing: SPRING });
    });
    mo.observe(src, { childList: true, characterData: true, subtree: true });
    const stop = this.stopParallax;
    this.stopParallax = () => { mo.disconnect(); stop?.(); };
  }

  /** The sidebar's own term label ("Fall 2026 · Wk 6"), so the two always agree. */
  private term(): string { return document.querySelector(".sb .sb-org-term")?.textContent?.trim() ?? ""; }

  private A(el: Element, kf: Keyframe[], o: KeyframeAnimationOptions): Animation {
    return el.animate(kf, { fill: "both", easing: OUT, ...o });
  }
  private anims(el: Element): Animation[] { return el.getAnimations({ subtree: true }); }
  private later(ms: number, fn: () => void): void { this.timers.push(window.setTimeout(fn, ms)); }
  private $(s: string) { return this.root.querySelector<HTMLElement>(s); }
  private $$(s: string) { return Array.from(this.root.querySelectorAll<HTMLElement>(s)); }
  private css(v: string) { return getComputedStyle(this.root).getPropertyValue(v).trim(); }
  private scale() { return this.root.getBoundingClientRect().width / (this.root.offsetWidth || 1) || 1; }
}
