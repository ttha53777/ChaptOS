// node render.mjs <v|s|w> [--sheet out.png] [--fps 60] [--out film.mp4] [--audio mix.wav] [--at t1,t2,…]
// Each frame is window.seek(t) → PNG → piped straight into ffmpeg (no frames on disk).
import { chromium } from "/Users/thalhat/figurints/node_modules/playwright/index.mjs";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const fmt = args[0] || "v";
const opt = k => { const i = args.indexOf("--" + k); return i < 0 ? null : args[i + 1]; };
const fps = +(opt("fps") || 60);
const DUR = 20;

const b = await chromium.launch();
const dims = { v: [1080, 1920], s: [1080, 1080], w: [1920, 1080] }[fmt];
const page = await b.newPage({ viewport: { width: dims[0], height: dims[1] }, deviceScaleFactor: 1 });
const errs = [];
page.on("pageerror", e => errs.push(String(e)));
page.on("console", m => m.type() === "error" && errs.push(m.text()));
const film = opt("film") || "film.html";
await page.goto(`file://${here}/${film}?f=${fmt}`);
await page.evaluate(() => window.READY);
if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
const shoot = async t => { await page.evaluate(t => window.seek(t), t); return page.screenshot({ type: "png" }); };

if (opt("sheet") || opt("at")) {
  // one frame per beat (mid-beat, so motion is caught mid-flight) unless --at given
  const times = opt("at") ? opt("at").split(",").map(Number) : Array.from({ length: 40 }, (_, i) => i * 0.5 + 0.25);
  const dir = resolve(opt("dir") || `${here}/sheet-${fmt}`);
  mkdirSync(dir, { recursive: true });
  for (const t of times) writeFileSync(`${dir}/t${t.toFixed(3).padStart(6, "0")}.png`, await shoot(t));
  console.log(`wrote ${times.length} frames → ${dir}`);
  await b.close();
  process.exit(0);
}

const out = resolve(opt("out") || `${here}/out/chaptos-${fmt}.mp4`);
mkdirSync(dirname(out), { recursive: true });
const audio = opt("audio");
const ff = spawn("ffmpeg", [
  "-v", "error", "-y",
  "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
  ...(audio ? ["-i", audio] : []),
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-preset", "slow",
  "-profile:v", "high", "-movflags", "+faststart",
  ...(audio ? ["-c:a", "aac", "-b:a", "256k", "-shortest"] : []),
  out,
], { stdio: ["pipe", "inherit", "inherit"] });
const N = Math.round(DUR * fps);
const t0 = Date.now();
for (let f = 0; f < N; f++) {
  const png = await shoot(f / fps);
  if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once("drain", r));
  if (f % 120 === 0) console.log(`${fmt} ${f}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await new Promise((r, j) => ff.on("close", c => (c ? j(new Error("ffmpeg " + c)) : r())));
await b.close();
if (errs.length) console.error("page errors:\n" + errs.join("\n"));
console.log("done →", out);
