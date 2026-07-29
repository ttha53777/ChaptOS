"use client";

import { useEffect } from "react";

/* ============================================================================
   Motion + interaction for the landing page.

   Ported from the vanilla-JS block in _design/ChaptOS Landing Doodle Mock
   v5.html. The engines drive the page through data attributes on markup that
   stays server-rendered, rather than being rewritten as React state — the
   motion contract they implement is delicate and documented, and a client
   boundary around ~1,600 lines of static JSX would buy nothing.

   Everything is progressive: with JS off you get a complete, readable page
   (see the <noscript> block in LandingPage.tsx).

   Engines
     reveal()     IntersectionObserver → .is-in, one-shot
     parallax()   rAF + lerp; owns inline transform on [data-para] only
     chrome()     sticky nav state + scroll progress bar
     marquee()    exact loop seam measurement
     scene()      THE pinned one — scroll-scrubbed six-beat conversation
     dial()       the Tuesday clock; sweeps once on entry, click to steer
     typer()      hero ask bar cycling three real questions + their answers
     counters()   count-up + health ring on first view (everything below the hero)
     heroBuild()  the hero card's cold open — [data-hb] delays, one shot
     term()       semester-aware countdown + CTA plan labels

   The setup/blueprint switcher is the one piece that isn't here: it generated
   markup, so it lives in sections/Setup.tsx as real React state.

   Every engine returns a disposer. The mock was a fire-and-forget IIFE, but
   StrictMode runs this effect twice in dev — without teardown you get two
   typing loops fighting over one <span> and a hero that rebuilds itself.
   ========================================================================== */

type Dispose = () => void;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".lp");
    if (!root) return;

    const q = <T extends Element>(s: string, r: ParentNode = root) => r.querySelector<T>(s);
    const qa = <T extends Element>(s: string, r: ParentNode = root) =>
      Array.from(r.querySelectorAll<T>(s));

    const mqReduce = matchMedia("(prefers-reduced-motion: reduce)");
    const mqMobile = matchMedia("(max-width: 860px)");
    const isCalm = () => mqReduce.matches;

    /* -------- counters + the health ring --------------------------------- */
    /* Hoisted above the engines because heroBuild() drives the hero's own
       count and ring off its timeline rather than an observer. */
    const rafIds = new Set<number>();
    function runCount(el: HTMLElement) {
      const to = parseFloat(el.getAttribute("data-count") ?? "") || 0;
      const dec = parseInt(el.getAttribute("data-decimals") ?? "0", 10);
      const pre = el.getAttribute("data-prefix") ?? "";
      const suf = el.getAttribute("data-suffix") ?? "";
      const fmt = (v: number) =>
        pre + (dec ? v.toFixed(dec) : Math.round(v).toLocaleString("en-US")) + suf;
      if (isCalm()) {
        el.textContent = fmt(to);
        return;
      }
      const t0 = performance.now();
      const dur = 1500;
      const step = (t: number) => {
        const p = clamp((t - t0) / dur, 0, 1);
        el.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) rafIds.add(requestAnimationFrame(step));
      };
      rafIds.add(requestAnimationFrame(step));
    }

    function runRing(el: HTMLElement) {
      const pct = parseFloat(el.getAttribute("data-ring") ?? "") || 0;
      rafIds.add(requestAnimationFrame(() => el.style.setProperty("--pct", String(pct))));
    }

    /* -------- reveal ------------------------------------------------------ */
    function reveal(): Dispose {
      const els = qa<HTMLElement>("[data-reveal]");
      if (isCalm() || !("IntersectionObserver" in window)) {
        els.forEach(el => el.classList.add("is-in"));
        return () => {};
      }
      const io = new IntersectionObserver(
        entries => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        },
        { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
      );
      els.forEach(el => io.observe(el));
      return () => io.disconnect();
    }

    /* -------- parallax ----------------------------------------------------- */
    /* Layered depth with a little momentum: each element lerps toward its
       target offset, so a fast flick overshoots slightly before settling. */
    function parallax(): Dispose {
      const items = qa<HTMLElement>("[data-para]").map(el => ({
        el,
        speed: parseFloat(el.getAttribute("data-speed") ?? "") || 0.06,
        cur: 0,
        target: 0,
      }));
      if (!items.length) return () => {};

      let vh = innerHeight;
      let running = false;
      let idleFrames = 0;
      let raf = 0;

      function measure() {
        vh = innerHeight;
        for (const it of items) {
          const r = it.el.getBoundingClientRect();
          it.target = (r.top + r.height / 2 - vh / 2) * it.speed;
        }
      }

      function frame() {
        // a frame can already be queued when the viewport crosses into mobile;
        // bail rather than stamping a stale inline transform on the way out
        if (mqMobile.matches || isCalm()) {
          running = false;
          return;
        }
        let moving = false;
        for (const it of items) {
          it.cur += (it.target - it.cur) * 0.11; // momentum
          if (Math.abs(it.target - it.cur) > 0.08) moving = true;
          it.el.style.transform = `translate3d(0,${it.cur.toFixed(2)}px,0)`;
        }
        idleFrames = moving ? 0 : idleFrames + 1;
        if (idleFrames > 12) {
          running = false; // sleep until the next scroll
          return;
        }
        raf = requestAnimationFrame(frame);
      }

      function wake() {
        if (mqMobile.matches || isCalm()) return;
        measure();
        idleFrames = 0;
        if (!running) {
          running = true;
          raf = requestAnimationFrame(frame);
        }
      }

      function clear() {
        for (const it of items) {
          it.cur = it.target = 0;
          it.el.style.transform = "";
        }
        running = false;
      }

      // A desktop → mobile resize used to strand inline transforms mid-page.
      const sync = () => (mqMobile.matches || isCalm() ? clear() : wake());

      addEventListener("scroll", wake, { passive: true });
      addEventListener("resize", sync);
      mqMobile.addEventListener("change", sync);
      sync();

      return () => {
        cancelAnimationFrame(raf);
        removeEventListener("scroll", wake);
        removeEventListener("resize", sync);
        mqMobile.removeEventListener("change", sync);
        clear();
      };
    }

    /* -------- nav state + scroll progress ---------------------------------- */
    function chrome(): Dispose {
      const nav = q<HTMLElement>("[data-nav]");
      const bar = q<HTMLElement>("[data-progress]");
      function tick() {
        const y = scrollY;
        nav?.classList.toggle("is-stuck", y > 18);
        if (bar) {
          const max = document.documentElement.scrollHeight - innerHeight;
          bar.style.width = `${(max > 0 ? clamp(y / max, 0, 1) : 0) * 100}%`;
        }
      }
      addEventListener("scroll", tick, { passive: true });
      addEventListener("resize", tick);
      tick();
      return () => {
        removeEventListener("scroll", tick);
        removeEventListener("resize", tick);
      };
    }

    /* -------- marquee seam ------------------------------------------------- */
    function marquee(): Dispose {
      const sizers = qa<HTMLElement>("[data-marquee]").map(track => {
        const size = () => {
          const gap = parseFloat(getComputedStyle(track).columnGap || "20") || 20;
          track.style.setProperty("--shift", `-${(track.scrollWidth + gap) / 2}px`);
        };
        size();
        return size;
      });
      if (!sizers.length) return () => {};
      const onResize = () => sizers.forEach(f => f());
      addEventListener("resize", onResize);
      return () => removeEventListener("resize", onResize);
    }

    /* -------- the ask scene (the pinned one) -------------------------------- */
    /* Desktop: rail scroll position drives which beats have landed —
       cumulative, so the transcript accumulates rather than swapping. Mobile:
       no pin, no scrub, the conversation plays once on entry. Reduced motion:
       all of it, immediately. */
    function scene(): Dispose {
      const sceneRoot = q<HTMLElement>("[data-scene]");
      if (!sceneRoot) return () => {};
      const rail = q<HTMLElement>(".scene__rail", sceneRoot);
      const stage = q<HTMLElement>(".scene__stage", sceneRoot);
      const beats = qa<HTMLElement>(".beat", sceneRoot);
      const navs = qa<HTMLElement>("[data-beat-nav]", sceneRoot);
      const ledger = q<HTMLElement>("[data-ledger]", sceneRoot);
      if (!rail || !stage) return () => {};

      const AT = [0, 0.13, 0.29, 0.47, 0.63, 0.8]; // rail progress per beat
      const LEDGER_AT = AT[1] + 0.05; // the spinner reads before the ticks fill
      let timers: ReturnType<typeof setTimeout>[] = [];
      let io: IntersectionObserver | null = null;

      function paint(active: number, ledgerLive: boolean) {
        beats.forEach((b, i) => b.classList.toggle("is-in", i <= active));
        navs.forEach((n, i) => {
          n.classList.toggle("is-on", i === active);
          n.classList.toggle("is-done", i < active);
        });
        ledger?.classList.toggle("is-live", ledgerLive);
      }

      // section.scene is position:relative, so rail.offsetTop is ~0 and a nav
      // click would jump to the top of the page. Always go through the rect.
      const railY = () => rail!.getBoundingClientRect().top + scrollY;
      const span = () => rail!.offsetHeight - stage!.offsetHeight;

      function scrub() {
        const s = span();
        const p = s > 0 ? clamp(-rail!.getBoundingClientRect().top / s, 0, 1) : 0;
        let active = -1;
        for (let i = 0; i < AT.length; i++) if (p >= AT[i]) active = i;
        paint(active, p >= LEDGER_AT);
      }

      function playOnce() {
        timers.forEach(clearTimeout);
        timers = [];
        beats.forEach((_, i) => {
          timers.push(setTimeout(() => paint(i, i >= 1), 200 + i * 760));
        });
      }

      let mode: string | null = null;
      function setMode() {
        const next = isCalm() ? "all" : mqMobile.matches ? "mobile" : "scrub";
        if (next === mode) return;
        mode = next;
        removeEventListener("scroll", scrub);
        timers.forEach(clearTimeout);
        io?.disconnect();

        if (mode === "all") return paint(beats.length - 1, true);
        if (mode === "scrub") {
          addEventListener("scroll", scrub, { passive: true });
          scrub();
          return;
        }
        // mobile: hold at beat 0 until the section is on screen, then play through
        paint(0, false);
        if (!("IntersectionObserver" in window)) return paint(beats.length - 1, true);
        io = new IntersectionObserver(
          entries => {
            for (const e of entries) {
              if (!e.isIntersecting) continue;
              io?.disconnect();
              playOnce();
            }
          },
          { threshold: 0.22 },
        );
        io.observe(sceneRoot!);
      }

      const onNavClick = (i: number) => () => {
        if (mode !== "scrub") return;
        scrollTo({ top: railY() + span() * (AT[i] + 0.02), behavior: "smooth" });
      };
      const bound = navs.map((n, i) => {
        const h = onNavClick(i);
        n.style.cursor = "pointer";
        n.addEventListener("click", h);
        return [n, h] as const;
      });

      addEventListener("resize", setMode);
      mqMobile.addEventListener("change", setMode);
      mqReduce.addEventListener("change", setMode); // re-arm the moment it flips
      setMode();

      return () => {
        removeEventListener("scroll", scrub);
        removeEventListener("resize", setMode);
        mqMobile.removeEventListener("change", setMode);
        mqReduce.removeEventListener("change", setMode);
        timers.forEach(clearTimeout);
        io?.disconnect();
        bound.forEach(([n, h]) => n.removeEventListener("click", h));
      };
    }

    /* -------- the day dial -------------------------------------------------- */
    /* Not pinned, not scrubbed — §5 spends the page's motion budget. The hand
       sweeps through six marks once on entry and stops; clicking a mark takes
       over. Below 600px the circle is abandoned for a chip row + a snap
       carousel, so JS goes hands-off there. */
    function dial(): Dispose {
      const dialRoot = q<HTMLElement>("[data-dial]");
      if (!dialRoot) return () => {};
      const ticks = qa<HTMLElement>("[data-dial-tick]", dialRoot);
      const cards = qa<HTMLElement>("[data-dial-card]", dialRoot);
      const hand = q<SVGGElement>("[data-dial-hand]", dialRoot);
      const prog = q<SVGPathElement>("[data-dial-prog]", dialRoot);
      const count = q<HTMLElement>("[data-dial-count]", dialRoot);
      const cap = q<HTMLElement>("[data-dial-cap]", dialRoot);
      const replay = q<HTMLElement>("[data-dial-replay]", dialRoot);
      const mqFlat = matchMedia("(max-width: 600px)"); // the dial's own breakpoint
      const n = ticks.length;
      if (!n) return () => {};

      const STEP = 360 / n;
      const DWELL = 3200;
      let timers: ReturnType<typeof setTimeout>[] = [];
      let io: IntersectionObserver | null = null;
      let acc = 0;
      let prev = 0;
      let at = 0;

      // the caption carries what the beat list used to say; the tick only says a time
      const CAPS = ticks.map(t => t.getAttribute("data-dial-cap-text") ?? "");

      let len = 0;
      if (prog?.getTotalLength) {
        len = prog.getTotalLength();
        prog.style.strokeDasharray = String(len);
        prog.style.strokeDashoffset = String(len);
      }

      const clearTimers = () => {
        timers.forEach(clearTimeout);
        timers = [];
      };

      // shortest signed delta, accumulated — otherwise 11:58 → 8:12 spins back 300°
      function rotTo(deg: number) {
        const d = ((deg - prev + 540) % 360) - 180;
        acc += d;
        prev = deg;
        if (hand) hand.style.transform = `rotate(${acc}deg)`;
      }

      function go(i: number) {
        at = i;
        ticks.forEach((t, k) => {
          t.classList.toggle("is-on", k === i);
          t.classList.toggle("is-done", k < i);
        });
        cards.forEach((c, k) => c.classList.toggle("is-on", k === i));
        rotTo(i * STEP);
        if (prog && len) prog.style.strokeDashoffset = String(len * (1 - i / (n - 1)));
        if (count) count.textContent = `0${i + 1}`.slice(-2);
        if (cap && CAPS[i]) {
          cap.style.opacity = "0";
          timers.push(
            setTimeout(() => {
              cap.textContent = CAPS[i];
              cap.style.opacity = "1";
            }, 170),
          );
        }
      }

      function showAll() {
        clearTimers();
        ticks.forEach(t => {
          t.classList.remove("is-on");
          t.classList.add("is-done");
        });
        cards.forEach(c => c.classList.add("is-on"));
      }

      function play(from: number) {
        clearTimers();
        go(from);
        for (let i = from + 1; i < n; i++) {
          const k = i;
          timers.push(setTimeout(() => go(k), DWELL * (k - from)));
        }
      }

      const tickHandlers = ticks.map((t, i) => {
        const h = () => {
          clearTimers();
          go(i);
        };
        t.addEventListener("click", h);
        return [t, h] as const;
      });
      const onReplay = () => play(0);
      replay?.addEventListener("click", onReplay);

      let armed = false;
      function setMode() {
        clearTimers();
        io?.disconnect();
        if (isCalm() || mqFlat.matches) {
          showAll();
          armed = false;
          return;
        }
        if (armed) return go(at); // a resize back from flat shouldn't replay
        go(0);
        if (!("IntersectionObserver" in window)) {
          play(0);
          armed = true;
          return;
        }
        io = new IntersectionObserver(
          entries => {
            for (const e of entries) {
              if (!e.isIntersecting) continue;
              io?.disconnect();
              play(0);
            }
          },
          { threshold: 0.35 },
        );
        io.observe(dialRoot!);
        armed = true;
      }
      addEventListener("resize", setMode);
      mqFlat.addEventListener("change", setMode);
      mqReduce.addEventListener("change", setMode);
      setMode();

      return () => {
        removeEventListener("resize", setMode);
        mqFlat.removeEventListener("change", setMode);
        mqReduce.removeEventListener("change", setMode);
        clearTimers();
        io?.disconnect();
        tickHandlers.forEach(([t, h]) => t.removeEventListener("click", h));
        replay?.removeEventListener("click", onReplay);
      };
    }

    /* -------- hero ask bar ------------------------------------------------- */
    function typer(): Dispose {
      const el = q<HTMLElement>("[data-typer]");
      const mini = q<HTMLElement>("[data-spotmini]");
      const out = q<HTMLElement>("[data-spotmini-a]");
      if (!el) return () => {};

      const SETS = [
        {
          q: "who still owes dues?",
          a: "<b>9 of 52</b> still owe — $1,480 total, 4 past the late-fee date.",
        },
        {
          q: "is anyone double-booked next week?",
          a: "Thursday 8 PM: <b>the formal and the food drive</b> overlap for 9 volunteers.",
        },
        {
          q: "who missed the last two meetings?",
          a: "<b>Jordan T.</b> (2 unexcused) and <b>Sam W.</b> (1 excused, lab conflict).",
        },
      ];

      const txt = document.createElement("span");
      const caret = document.createElement("i");
      caret.className = "caret";
      el.textContent = "";
      el.append(txt, caret);

      if (isCalm()) {
        txt.textContent = SETS[0].q;
        if (out) out.innerHTML = SETS[0].a;
        mini?.classList.add("is-live");
        return () => {};
      }

      // StrictMode mounts this twice in dev; without the flag the first loop
      // keeps typing into a span the second loop is also writing to.
      let cancelled = false;
      const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

      void (async () => {
        let i = 0;
        // wait out heroBuild() — the spotlight itself doesn't land until 2290ms,
        // and typing under a card that's still filling in reads as two things
        // competing rather than one thing finishing
        await sleep(2650);
        while (!cancelled) {
          const set = SETS[i % SETS.length];
          for (let c = 1; c <= set.q.length; c++) {
            if (cancelled) return;
            txt.textContent = set.q.slice(0, c);
            await sleep(30 + Math.random() * 46);
          }
          await sleep(430);
          if (cancelled) return;
          if (out) out.innerHTML = set.a;
          mini?.classList.add("is-live");
          await sleep(3600);
          if (cancelled) return;
          mini?.classList.remove("is-live");
          await sleep(420);
          for (let d = set.q.length; d >= 0; d--) {
            if (cancelled) return;
            txt.textContent = set.q.slice(0, d);
            await sleep(15);
          }
          await sleep(280);
          i++;
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    /* -------- counters ----------------------------------------------------- */
    function counters(): Dispose {
      // the hero's figures belong to heroBuild()'s timeline, not this observer
      const notHero = (el: Element) => !el.closest(".hero");
      const nodes = qa<HTMLElement>(".counter").filter(notHero);
      const rings = qa<HTMLElement>("[data-ring]").filter(notHero);

      if (!("IntersectionObserver" in window)) {
        nodes.forEach(runCount);
        rings.forEach(runRing);
        return () => {};
      }
      const io = new IntersectionObserver(
        entries => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            io.unobserve(e.target);
            const el = e.target as HTMLElement;
            (el.classList.contains("counter") ? runCount : runRing)(el);
          }
        },
        { threshold: 0.4 },
      );
      [...nodes, ...rings].forEach(el => io.observe(el));
      return () => io.disconnect();
    }

    /* -------- hero cold open ----------------------------------------------- */
    /* Walks the hero card's ~13 objects in on the headline's own three beats,
       which is the only reason the lighter hero was easier to read. Each
       [data-hb] carries its delay in ms.

       Deliberately a timeline, not an IntersectionObserver: the hero is above
       the fold by definition, so there is nothing to wait for. One shot. */
    function heroBuild(): Dispose {
      const hero = q<HTMLElement>(".hero");
      if (!hero) return () => {};

      const steps = qa<HTMLElement>("[data-hb]", hero);
      const ring = q<HTMLElement>("[data-ring]", hero);
      const nums = qa<HTMLElement>(".counter", hero);
      if (!steps.length) return () => {};

      // Reduced motion gets the finished card with no build at all — leaving
      // .hb-in off entirely means the @media override is what's showing it.
      if (isCalm()) {
        if (ring) runRing(ring);
        nums.forEach(runCount);
        return () => {};
      }

      const timers = steps.map(el => {
        const at = parseInt(el.getAttribute("data-hb") ?? "0", 10) || 0;
        return setTimeout(() => {
          el.classList.add("hb-in");
          if (el === ring) runRing(el);
          qa<HTMLElement>(".counter", el).forEach(runCount);
        }, at);
      });

      return () => timers.forEach(clearTimeout);
    }

    /* -------- semester-aware CTA ------------------------------------------- */
    /* Picks the next term start and words the countdown (and the 3-step plan)
       around it — "starts in 30 days" in July reads very differently in week 4.
       Runs after mount rather than on the server: a date rendered server-side
       would either hydrate-mismatch or go stale in the static output. */
    function term(): Dispose {
      const days = q<HTMLElement>("[data-term-days]");
      if (!days) return () => {};
      const label = q<HTMLElement>("[data-term-label]");
      const unit = q<HTMLElement>("[data-term-unit]");
      const now = new Date();
      const y = now.getFullYear();
      const starts = [
        { name: "Spring term", d: new Date(y, 0, 12) },
        { name: "Fall term", d: new Date(y, 7, 24) },
        { name: "Spring term", d: new Date(y + 1, 0, 12) },
      ];
      const next = starts.find(s => s.d > now) ?? starts[starts.length - 1];
      const n = Math.max(0, Math.ceil((next.d.getTime() - now.getTime()) / 864e5));

      if (label) label.textContent = next.name;
      days.textContent = String(n);
      if (unit) unit.textContent = n === 1 ? "day" : "days";

      // In-term visitors get a nudge that doesn't lie about the calendar.
      if (n > 120) q<HTMLElement>("[data-term-card]")?.classList.add("is-midterm");

      const w1 = q<HTMLElement>("[data-term-w1]");
      const w2 = q<HTMLElement>("[data-term-w2]");
      if (w1) w1.textContent = n <= 21 ? "This week" : "Any afternoon";
      if (w2) w2.textContent = n <= 21 ? "Before day one" : `${n} days out`;
      return () => {};
    }

    const disposers = [
      reveal(),
      parallax(),
      chrome(),
      marquee(),
      scene(),
      dial(),
      typer(),
      counters(),
      heroBuild(),
      term(),
    ];

    return () => {
      disposers.forEach(d => d());
      rafIds.forEach(cancelAnimationFrame);
      rafIds.clear();
    };
  }, []);

  return null;
}
