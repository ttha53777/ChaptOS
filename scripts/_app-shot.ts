/**
 * Screenshot the APP (its dev web preview, mobile/scripts/app-web.mjs on :8799) at
 * phone width, signed in as a seeded member through the dev impersonation cookie.
 * Twin of scripts/_parity-capture.ts, which shoots the WEB at the same size.
 *
 *   npx tsx --env-file=.env.local scripts/_app-shot.ts <path> [--as 2] [--theme day|night] [--full] [--out file.png] [--wait 2500]
 *
 *   <path>   an app route: /, /timeline, /members, /more, /more/tasks, …
 *   --as     Brother id to impersonate (busy org: admin 2, member 12; day-one: 14, 16)
 *   --theme  day (light) or night (dark), via prefers-color-scheme
 *   --full   a 390×3200 viewport, like the web captures' "full" scene
 *   --tap    text to tap after load (repeatable), e.g. --tap Members to open a glance
 *
 * Prints console errors and the visible text so a broken render is obvious.
 * Writes default to _design/parity/app/ (gitignored like the web captures).
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { DEV_IMPERSONATE_COOKIE, signImpersonation } from "../lib/auth/dev-bypass";

const BASE = "http://localhost:8799";

async function main() {
  const argv = process.argv.slice(2);
  const opt = (k: string, d?: string) => { const i = argv.indexOf(k); return i > -1 ? argv[i + 1] : d; };
  const taps = argv.flatMap((a, i) => (a === "--tap" ? [argv[i + 1]!] : []));
  const route = argv.find((a, i) => a.startsWith("/") && argv[i - 1] !== "--out") ?? "/";
  const as = Number(opt("--as", "2"));
  const theme = opt("--theme", "day") === "night" ? "dark" : "light";
  const full = argv.includes("--full");
  const out = opt("--out") ?? `_design/parity/app/${route === "/" ? "home" : route.slice(1).replace(/\//g, "-")}-${as}-${theme === "dark" ? "night" : "day"}${full ? "-full" : ""}.png`;
  mkdirSync(path.dirname(out), { recursive: true });

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: full ? 3200 : 844 }, deviceScaleFactor: 3, colorScheme: theme, hasTouch: true, isMobile: true });
  await ctx.addCookies([{ name: DEV_IMPERSONATE_COOKIE, value: signImpersonation(as), url: BASE }]);
  const p = await ctx.newPage();
  const errs: string[] = [];
  p.on("pageerror", e => errs.push(`pageerror: ${e.message}`));
  p.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 240)); });
  p.on("response", r => { if (r.url().includes("/api/") && r.status() >= 400) errs.push(`${r.status()} ${r.url().replace(BASE, "")}`); });

  await p.goto(BASE + route, { waitUntil: "networkidle" });
  await p.waitForTimeout(Number(opt("--wait", "2500")));
  for (const t of taps) {
    await p.getByText(t, { exact: true }).first().click();
    await p.waitForTimeout(1200);
  }
  if (taps.length) await p.waitForTimeout(Number(opt("--settle", "0")));
  await p.screenshot({ path: out });
  const text = (await p.innerText("body").catch(() => "")).replace(/\s*\n\s*/g, " | ").slice(0, 400);
  console.log(out);
  console.log("text:", text);
  if (errs.length) console.log("errors:\n  " + [...new Set(errs)].slice(0, 12).join("\n  "));
  await b.close();
}
main();
