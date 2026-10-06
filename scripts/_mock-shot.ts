// Screenshot a hash route of the Dashboard Paper Mock. HASH=treasury W=1440 OUT=… SHOTS like _page-shot
import { chromium } from "playwright";
const OUT = process.env.OUT ?? "_screenshots/mock";
const W = Number(process.env.W ?? 1440);
const THEME = process.env.THEME ?? "light";
const SHOTS = (process.env.SHOTS ?? "").split(";").filter(Boolean);
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: W, height: Number(process.env.H ?? 900) } })).newPage();
  await p.goto(`file://${process.cwd()}/_design/Dashboard%20Paper%20Mock.html#${process.env.HASH ?? ""}`);
  if (THEME === "dark") await p.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await p.addStyleTag({ content: "html{scroll-behavior:auto!important} .mockbar{display:none!important}" });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/00-page.png`, fullPage: process.env.FULL === "1" });
  for (const step of SHOTS) {
    const [name, act = ""] = step.split("=");
    const i = act.indexOf(":"); const kind = act.slice(0, i), sel = act.slice(i + 1);
    try {
      if (kind === "click") await p.locator(sel).first().click({ timeout: 6000 });
      else if (kind === "scroll") await p.locator(sel).first().scrollIntoViewIfNeeded();
      else if (kind === "esc") await p.keyboard.press("Escape");
      else if (kind === "eval") await p.evaluate(sel);
      await p.waitForTimeout(900);
      if (name) { await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: process.env.FULL === "1" }); console.log("shot", name); }
    } catch (e) { console.log("fail", name, String(e).slice(0, 160)); }
  }
  await b.close();
})();
