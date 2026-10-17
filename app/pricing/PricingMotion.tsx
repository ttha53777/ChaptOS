"use client";

/**
 * Everything that moves on /pricing, ported from the mock's script.
 *
 * The page is server-rendered markup; this mounts once, finds its nodes by id
 * and drives them imperatively — the same shape as the mock, so the timing and
 * feel stay 1:1. It renders nothing.
 *
 *   · the meter: dial, crowd, hanging tag, stamp, presets, and the count-up
 *     intro from one board member
 *   · the who-counts clipboard: archiving the seniors drops the tally across
 *     a band boundary
 *   · the limit: join requests keep arriving at a full room
 *   · reveals (.rv → .in) and the highlighter boot delay
 *
 * The meter prices from tierForCount, the function the app bills from, so the
 * dial can't quote a number the invoice wouldn't.
 */

import { useEffect } from "react";
import { BILLING_BANDS, SELF_SERVE_MAX, formatPrice, formatRange, tierForCount, type BillingBand } from "@/lib/billing/tiers";

const TONE: Record<string, string> = { free: "butter", standard: "sky", pro: "lilac", custom: "rose" };
const [FREE, STANDARD, PRO] = BILLING_BANDS;
const fmt = (b: BillingBand) => (b.priceCents === null ? "Quoted" : formatPrice(b.priceCents));

const NOTES: Record<string, (n: number) => string> = {
  free: n =>
    n < (FREE.upTo as number)
      ? `Four seats free for good. ${(FREE.upTo as number) - n} to go.`
      : `Four free. The fifth person starts ${fmt(STANDARD)}.`,
  standard: n =>
    n === STANDARD.upTo
      ? `Top of ${STANDARD.label}. The ${PRO.from}st moves the org to ${fmt(PRO)}.`
      : `Same ${fmt(STANDARD)} from ${STANDARD.from} to ${STANDARD.upTo}. ${(STANDARD.upTo as number) - n} more wouldn't change it.`,
  pro: n =>
    n === PRO.upTo
      ? `Top of self-serve. The ${SELF_SERVE_MAX + 1}st is a quote.`
      : `Same ${fmt(PRO)} from ${PRO.from} to ${PRO.upTo}.`,
  custom: () => `Past ${SELF_SERVE_MAX}, Billing asks for a quote instead of a card.`,
};

const ASK: [string, string][] = [
  ["Kai Morgan", "var(--peach)"],
  ["Ellie Park", "var(--mint)"],
  ["Omar Haddad", "var(--lilac)"],
  ["Zoe Lin", "var(--butter)"],
  ["Ben Foster", "var(--rose)"],
];

/** Restart a CSS animation by toggling its class across a reflow. */
function replay(el: HTMLElement, cls: string) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export function PricingMotion() {
  useEffect(() => {
    const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
    const root = $("pp-root");
    if (!root) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));

    // ── the meter ────────────────────────────────────────────────────────────
    const meter = $("meter"), dial = $<HTMLInputElement>("dial");
    const mCount = $("mCount"), mWord = $("mWord"), mBand = $("mBand"), mHead = $("mHead"), mNote = $("mNote");
    const tag = $("tag"), tPrice = $("tPrice"), tPer = $("tPer"), tSub = $("tSub"), stamp = $("stamp");
    const segs = [...$("ruler").querySelectorAll("i")];
    const people = [...$("crowd").querySelectorAll<HTMLElement>(".p")];
    const chips = [...$("presets").querySelectorAll<HTMLButtonElement>(".pchip")];
    const bandCards = [...$("bandCards").querySelectorAll<HTMLElement>(".band")];

    let shown = 0;
    let lastBand: string | null = null;
    function render(n: number, quiet = false) {
      const b = tierForCount(n);
      meter.dataset.band = b.id;
      mCount.textContent = String(n);
      mWord.textContent = n === 1 ? "person" : "people";
      mBand.textContent = `${b.label} · ${formatRange(b)}`;
      mHead.textContent =
        b.priceCents === null
          ? "priced per organization"
          : b.priceCents === 0
            ? "$0 a head — because it’s $0"
            : `≈ ${b.priceCents / n >= 100 ? "$" + (b.priceCents / n / 100).toFixed(2) : Math.round(b.priceCents / n) + "¢"} a head, if you split it`;
      mNote.textContent = NOTES[b.id](n);
      segs.forEach((s, i) => s.classList.toggle("dim", BILLING_BANDS[i].id !== b.id));
      dial.value = String(n);
      dial.setAttribute("aria-valuetext", `${n} members, ${b.label}, ${fmt(b)}${b.priceCents ? " a month" : ""}`);

      // crowd: pop in the new ones with a small stagger, fade the removed
      const prev = shown;
      people.forEach((p, i) => {
        const on = i < n;
        p.dataset.b = on ? b.id : "";
        if (on && i >= prev) {
          p.style.setProperty("--dl", Math.min((i - prev) * 8, 400) + "ms");
          p.classList.remove("on");
          void p.offsetWidth;
        }
        p.classList.toggle("on", on);
      });
      shown = n;

      if (b.id !== lastBand) {
        tPrice.textContent = fmt(b);
        tPrice.classList.toggle("word", b.priceCents === null);
        replay(tPrice, "roll");
        tPer.textContent =
          b.priceCents === null ? "priced per organization" : b.priceCents === 0 ? "free, for good" : "a month for the whole org";
        tSub.textContent = b.priceCents === null ? "request a quote" : b.priceCents === 0 ? "no card needed" : "billed monthly · USD";
        if (lastBand !== null && !quiet) {
          replay(tag, "swing");
          stamp.textContent = b.priceCents === null ? "Let’s talk" : b.label;
          replay(stamp, "thud");
        }
        lastBand = b.id;
        bandCards.forEach(c => c.classList.toggle("lit", c.dataset.id === b.id));
      }
      chips.forEach(c => c.classList.toggle("on", Number(c.dataset.n) === n));
    }

    let raf: number | null = null;
    let touched = false;
    const stopAuto = () => {
      touched = true;
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
    };
    function tweenTo(target: number, ms = 900) {
      stopAuto();
      const from = Number(dial.value), t0 = performance.now();
      if (reduce) return render(target);
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
        render(Math.round(from + (target - from) * e));
        raf = k < 1 ? requestAnimationFrame(step) : null;
      };
      raf = requestAnimationFrame(step);
    }
    const onInput = () => render(Number(dial.value));
    dial.addEventListener("input", onInput);
    dial.addEventListener("pointerdown", stopAuto);
    dial.addEventListener("keydown", stopAuto);
    const chipHandlers = chips.map(c => {
      const h = () => tweenTo(Number(c.dataset.n));
      c.addEventListener("click", h);
      return h;
    });

    // intro: count up from one board member, walking through Free into Standard
    render(1, true);
    later(() => {
      root.classList.remove("boot");
      if (!touched) {
        tweenTo(38, 1800);
        touched = false;
      }
    }, 450);

    // ── who counts ───────────────────────────────────────────────────────────
    const clip = $("clip"), tally = $("tally"), archiveBtn = $("archiveBtn");
    const bandchip = $("bandchip"), bcName = $("bcName"), bcPrice = $("bcPrice");
    const total = Number(clip.dataset.total), seniors = Number(clip.dataset.seniors);
    const btnLabel = archiveBtn.querySelector("span") as HTMLElement;
    const restLabel = btnLabel.textContent ?? "";
    let archived = false, autoArchived = false;
    function setChip(n: number) {
      const b = tierForCount(n);
      bcName.textContent = b.label;
      bcPrice.textContent = fmt(b) + "/mo";
      bandchip.style.setProperty("--bc", `var(--${TONE[b.id]})`);
    }
    function countTo(from: number, to: number) {
      let n = from;
      const dir = to < from ? -1 : 1;
      const tick = () => {
        n += dir;
        tally.textContent = String(n);
        if (n === STANDARD.upTo || n === PRO.from) {
          setChip(n);
          replay(bandchip, "flip");
        }
        if (n !== to) later(tick, 170);
        else setChip(n);
      };
      if (reduce) {
        tally.textContent = String(to);
        setChip(to);
      } else later(tick, 380);
    }
    function toggleArchive() {
      archived = !archived;
      clip.classList.toggle("archived", archived);
      btnLabel.textContent = archived ? "Bring them back" : restLabel;
      countTo(archived ? total : total - seniors, archived ? total - seniors : total);
    }
    setChip(total);
    archiveBtn.addEventListener("click", toggleArchive);

    // ── the limit: a full room, a queue that keeps arriving ──────────────────
    const queue = $("queue");
    let qi = 0, qTimer: ReturnType<typeof setInterval> | null = null;
    function pushTicket() {
      const [n, c] = ASK[qi++ % ASK.length];
      const t = document.createElement("div");
      t.className = "ticket";
      const av = document.createElement("span");
      av.className = "av";
      av.style.cssText = `--av:${c}; width:28px; height:28px`;
      av.textContent = n.split(" ").map(w => w[0]).join("");
      const nm = document.createElement("span");
      nm.className = "nm";
      nm.append(n);
      const sm = document.createElement("small");
      sm.textContent = "Request sent · still welcome to ask";
      nm.append(sm);
      const wait = document.createElement("span");
      wait.className = "wait";
      wait.textContent = "Waiting";
      t.append(av, nm, wait);
      t.style.transform = "translateX(-120%) rotate(-4deg)";
      t.style.opacity = "0";
      queue.prepend(t);
      const all = [...queue.children] as HTMLElement[];
      requestAnimationFrame(() =>
        all.forEach((el, i) => {
          el.style.zIndex = String(10 - i);
          el.style.opacity = i > 2 ? "0" : String(1 - i * 0.2);
          el.style.transform = `translateY(${i * 11}px) scale(${1 - i * 0.05}) rotate(${i % 2 ? 1.2 : -0.8}deg)`;
        }),
      );
      all.slice(4).forEach(el => later(() => el.remove(), 800));
    }

    // ── reveals + section triggers ───────────────────────────────────────────
    const io = new IntersectionObserver(
      es =>
        es.forEach(e => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          el.classList.add("in");
          io.unobserve(el);
          if (el === clip && !autoArchived) {
            autoArchived = true;
            later(() => {
              if (!archived) toggleArchive();
            }, 1100);
          }
          if (el.id === "house" && !qTimer) {
            pushTicket();
            pushTicket();
            pushTicket();
            qTimer = setInterval(pushTicket, reduce ? 99999 : 2600);
          }
        }),
      { threshold: 0.22, rootMargin: "0px 0px -6% 0px" },
    );
    root.querySelectorAll(".rv").forEach(el => io.observe(el));

    return () => {
      io.disconnect();
      stopAuto();
      timers.forEach(clearTimeout);
      if (qTimer) clearInterval(qTimer);
      dial.removeEventListener("input", onInput);
      dial.removeEventListener("pointerdown", stopAuto);
      dial.removeEventListener("keydown", stopAuto);
      chips.forEach((c, i) => c.removeEventListener("click", chipHandlers[i]));
      archiveBtn.removeEventListener("click", toggleArchive);
    };
  }, []);

  return null;
}
