// Cuts real chaptos.com UI pieces out as transparent PNGs (dsf 3).
import { chromium } from "/Users/thalhat/figurints/node_modules/playwright/index.mjs";
const OUT = "/Users/thalhat/figurints/assets/ui";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 3 });
await p.goto("https://chaptos.com/", { waitUntil: "networkidle" });
await p.addStyleTag({ content: "html{scroll-behavior:auto!important}" });
await p.waitForTimeout(4000); // hero cold-open build
const only = process.argv[2];

async function iso(sel, idx, name, { scrollY, prep, vp } = {}) {
  if (only && !name.startsWith(only)) return;
  if (scrollY != null) { await p.evaluate(y => scrollTo(0, y), scrollY); await p.waitForTimeout(1500); }
  const ok = await p.evaluate(({ sel, idx, prep }) => {
    document.querySelectorAll("[data-iso-hide]").forEach(e => e.removeAttribute("data-iso-hide"));
    document.querySelectorAll("[data-iso-anc]").forEach(e => { e.style.cssText = e.dataset.isoAnc; e.removeAttribute("data-iso-anc"); });
    let st = document.getElementById("iso-style");
    if (!st) { st = document.createElement("style"); st.id = "iso-style"; document.head.append(st); }
    st.textContent = `html,body{background:transparent!important} [data-iso-hide]{visibility:hidden!important} [data-iso-on],[data-iso-on] *{visibility:visible!important}`;
    document.querySelectorAll("[data-iso-on]").forEach(e => e.removeAttribute("data-iso-on"));
    const el = document.querySelectorAll(sel)[idx]; if (!el) return false;
    document.querySelectorAll("body *").forEach(e => { if (!e.contains(el) && !el.contains(e) && !e.closest("svg:has(symbol)")) e.setAttribute("data-iso-hide", ""); });
    el.setAttribute("data-iso-on", "");
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      a.dataset.isoAnc = a.style.cssText;
      a.style.background = "transparent"; a.style.backgroundImage = "none"; a.style.overflow = "visible";
      a.style.maskImage = "none"; a.style.clipPath = "none"; a.style.contain = "none"; a.style.overflow = "visible"; a.style.setProperty("overflow-x","visible","important"); a.style.setProperty("overflow","visible","important"); a.style.webkitMaskImage = "none"; a.style.boxShadow = "none"; a.style.border = "0";
      a.style.setProperty("visibility", "hidden", "important"); a.style.opacity = "1"; if (getComputedStyle(a).transform !== "none") a.style.transform = "none";
    }
    if (prep) new Function("el", prep)(el);
    return true;
  }, { sel, idx, prep: prep || "" });
  if (!ok) { console.log("MISS", name); return; }
  const bb = await p.evaluate(({ sel, idx }) => { const r = document.querySelectorAll(sel)[idx].getBoundingClientRect(); return { x: r.left - 24, y: r.top + scrollY - 24, width: r.width + 48, height: r.height + 48 }; }, { sel, idx });
  if (vp) { bb.y -= await p.evaluate(() => scrollY); await p.screenshot({ path: `${OUT}/${name}.png`, omitBackground: true, clip: bb }); }
  else await p.screenshot({ path: `${OUT}/${name}.png`, omitBackground: true, fullPage: true, clip: bb });
  console.log("ok", name);
}

const show = `el.style.opacity=1; el.style.transform='none'; el.querySelectorAll('*').forEach(c=>{c.style.opacity=getComputedStyle(c).opacity==='0'?1:''; if(c.style) c.style.strokeDashoffset='0';});`;
// hero
await iso(".hero__card", 0, "hero-card", { scrollY: 0 });
await iso(".hero__cardbar", 0, "hero-cardbar");
await iso(".ui-brief", 0, "hero-brief");
for (let i = 0; i < 4; i++) await iso(".hero .meas", i, `hero-meas-${i}`);
for (let i = 0; i < 2; i++) await iso(".hero .att", i, `hero-att-${i}`);
await iso(".hero__spot", 0, "hero-ask");
for (let i = 0; i < 3; i++) await iso(".hero .pile", i, `hero-pile-${i}`, { prep: show });
await iso("[data-beat=\"5\"] .beat__in", 0, "ask-done-full", { scrollY: (await p.evaluate(() => document.getElementById("ask").getBoundingClientRect().top + scrollY)) + 3900, prep: show });
await iso(".hero:not(.pad) h1", 0, "hero-h1");
await iso(".hero .btn--lg", 0, "btn-setup");
// ask scene — sweep the scrub and grab each card at its settled state
const askTop = await p.evaluate(() => document.getElementById("ask").getBoundingClientRect().top + scrollY);
await iso(".bubble--me", 0, "ask-q1", { scrollY: askTop + 900, prep: show });
await iso(".ledger", 0, "ask-checking", { scrollY: askTop + 1500, prep: show });
await iso(".acard", 0, "ask-answer", { scrollY: askTop + 2200, prep: show });
await iso(".bubble--me", 1, "ask-q2", { scrollY: askTop + 2900, prep: show });
await iso(".draft", 0, "ask-draft", { scrollY: askTop + 3300, prep: show });
await iso(".done", 0, "ask-done", { scrollY: askTop + 3900, prep: show });
// day shots (6 product windows)
for (let i = 0; i < 6; i++) await iso("#day figure.shot", i, `day-${i}`, { scrollY: 6300, prep: show });
// modules
for (let i = 0; i < 3; i++) await iso("#modules figure.shot", i, `mod-${i}`, { scrollY: 7800 + i * 900, prep: show });
await iso("#setup .bp", 0, "setup-blueprint", { scrollY: 11000, prep: show });
for (let i = 0; i < 3; i++) await iso("#price .rung__in", i, `price-${i}`, { scrollY: 13400, prep: show });
if (!only || "gripe".startsWith(only) || only.startsWith("gripe")) { await p.setViewportSize({ width: 2600, height: 1000 }); await p.addStyleTag({ content: "#pain *{animation:none!important}" }); await p.waitForTimeout(800); }
for (let i = 0; i < 6; i++) await iso("#pain .gripe", i, `gripe-${i}`, { scrollY: 1100, prep: show });
await p.setViewportSize({ width: 1440, height: 1000 });
await iso(".cta__card", 0, "cta-card", { scrollY: 14400, prep: show });
await b.close();
