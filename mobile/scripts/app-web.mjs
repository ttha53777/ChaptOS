#!/usr/bin/env node
/**
 * The app's dev-only web preview: export the app for the web, then serve it on one
 * origin with /api proxied to the ISOLATED dev server, so a headless browser can drive
 * and screenshot it beside the web phone captures (_design/parity/web/).
 *
 *   node scripts/app-web.mjs [--build] [--port 8799] [--dir <export dir>]
 *
 *   --build  run `expo export --platform web` first (EXPO_PUBLIC_DEV_WEB=1, which makes
 *            the bundle sign in with the dev impersonation cookie instead of Supabase;
 *            see src/auth/dev-web.ts). Without it, serves the last export.
 *   --dir    where the export lives (default $TMPDIR/chaptos-app-web).
 *
 * Signing in: set the server's `dev_impersonate` cookie for `localhost` (cookies ignore
 * ports), signed with DEV_AUTH_BYPASS_SECRET; scripts/_app-shot.ts at the repo root does.
 *
 * Safety: the proxy only ever talks to http://localhost:3100, which must be running on
 * the throwaway database (dev and prod share the other one). It never points at :3000.
 * Not for a real phone, not shipped: nothing in the app imports this.
 */
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : dflt; };
const PORT = Number(flag("--port", "8799"));
const DIR = path.resolve(flag("--dir", path.join(os.tmpdir(), "chaptos-app-web")));
const API = { host: "localhost", port: 3100 };

if (args.includes("--build")) {
  const r = spawnSync("npx", ["expo", "export", "--platform", "web", "--output-dir", DIR, "--clear"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    stdio: "inherit",
    env: { ...process.env, EXPO_PUBLIC_DEV_WEB: "1" },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
if (!existsSync(path.join(DIR, "index.html"))) {
  console.error(`No export at ${DIR}. Run with --build.`);
  process.exit(1);
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".otf": "font/otf",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon", ".map": "application/json",
};

function serveStatic(req, res) {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file = path.join(DIR, url);
  if (!file.startsWith(DIR)) { res.writeHead(403).end(); return; }
  // A route (/more/tasks) is the single-page app: every unknown path is index.html.
  if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(DIR, "index.html");
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  createReadStream(file).pipe(res);
}

function proxy(req, res) {
  const headers = { ...req.headers, host: `${API.host}:${API.port}` };
  // The server's same-origin check compares Origin with its own host.
  if (headers.origin) headers.origin = `http://${API.host}:${API.port}`;
  if (headers.referer) headers.referer = `http://${API.host}:${API.port}/`;
  const up = http.request({ ...API, method: req.method, path: req.url, headers }, r => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  up.on("error", e => { res.writeHead(502, { "content-type": "text/plain" }).end(`:3100 unreachable: ${e.message}`); });
  req.pipe(up);
}

http.createServer((req, res) => (req.url?.startsWith("/api/") ? proxy(req, res) : serveStatic(req, res)))
  .listen(PORT, () => console.log(`app web preview on http://localhost:${PORT} (api → :${API.port}, export ${DIR})`));
