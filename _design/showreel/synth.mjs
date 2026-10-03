// node synth.mjs → out/mix_raw.wav, out/mix.wav (-14 LUFS, -1 dBTP), beats.json, beats.js
// Everything is synthesized here: original 120 BPM cue in D major + UI SFX,
// all placed from timeline.js so picture and sound share one clock.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import vm from "node:vm";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// `node synth.mjs v1` scores the earlier cut (landing-page chat beats) from timeline-v1.js
const CUT = process.argv[2] === "v1" ? "-v1" : "";
const ctx = { module: {} }; vm.runInNewContext(readFileSync(`${here}/timeline${CUT}.js`, "utf8"), ctx);
const TL = ctx.TL, C = TL.c;
const SR = 48000, DUR = TL.dur, N = Math.ceil(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);       // dry bus
const RvL = new Float32Array(N), RvR = new Float32Array(N);   // reverb send
const Duck = new Float32Array(N).fill(1);
const KB = new Float32Array(N);                               // kick stem, for beat measurement                     // sidechain gain (music only)
const ML = new Float32Array(N), MR = new Float32Array(N);     // ducked music bus

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(20261002);
const noise = () => rnd() * 2 - 1;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const TAU = Math.PI * 2;

// RBJ biquad
function biquad(type, f, q = 0.707) {
  let b0, b1, b2, a1, a2, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const set = (f, q) => {
    const w = (TAU * Math.min(f, SR * 0.45)) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q);
    let B0, B1, B2; const A0 = 1 + al;
    if (type === "lp") { B0 = (1 - c) / 2; B1 = 1 - c; B2 = (1 - c) / 2; }
    else if (type === "hp") { B0 = (1 + c) / 2; B1 = -(1 + c); B2 = (1 + c) / 2; }
    else { B0 = al; B1 = 0; B2 = -al; } // bp
    b0 = B0 / A0; b1 = B1 / A0; b2 = B2 / A0; a1 = (-2 * c) / A0; a2 = (1 - al) / A0;
  };
  set(f, q);
  const p = x => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  p.set = set; return p;
}
// mix a generated voice into a bus. gen(i, t) → sample; pan -1..1
function voice(t0, dur, gen, { gain = 1, pan = 0, rev = 0, music = false } = {}) {
  const s0 = Math.round(t0 * SR), n = Math.round(dur * SR);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4), gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  const DL = music ? ML : L, DR = music ? MR : R;
  for (let i = 0; i < n; i++) {
    const j = s0 + i; if (j < 0 || j >= N) continue;
    const v = gen(i, i / SR); if (!v) continue;
    const pv = typeof pan === "function" ? pan(i / SR) : null;
    const l = pv == null ? gl : gain * Math.cos(((pv + 1) * Math.PI) / 4), r = pv == null ? gr : gain * Math.sin(((pv + 1) * Math.PI) / 4);
    DL[j] += v * l; DR[j] += v * r;
    if (rev) { RvL[j] += v * l * rev; RvR[j] += v * r * rev; }
  }
}

// ── drums ──
function kick(t0, big = 0) {
  let ph = 0;
  voice(t0, big ? 0.9 : 0.5, (i, t) => {
    const f = 44 + (big ? 130 : 105) * Math.exp(-t * 26);
    ph += (TAU * f) / SR;
    const a = Math.exp(-t * (big ? 4.2 : 7.5));
    const v = Math.tanh((Math.sin(ph) * a + noise() * Math.exp(-t * 380) * 0.35) * (big ? 1.9 : 1.4)) * 0.9;
    const j = Math.round(t0 * SR) + i; if (j >= 0 && j < N) KB[j] += v;
    return v;
  }, { gain: big ? 1.05 : 0.9 });
  const s0 = Math.round(t0 * SR);
  for (let i = 0; i < 0.42 * SR && s0 + i < N; i++) { const t = i / SR; Duck[s0 + i] = Math.min(Duck[s0 + i], 1 - (big ? 0.7 : 0.5) * Math.exp(-t * 9)); }
}
function sub(t0, m = 26, dur = 0.7) { let ph = 0; voice(t0, dur, (i, t) => { ph += (TAU * mtof(m)) / SR; return Math.sin(ph) * Math.exp(-t * 3.5) * Math.min(1, t * 200); }, { gain: 0.55 }); }
function clap(t0, g = 0.5) { const bp = biquad("bp", 1250, 1.1); voice(t0, 0.3, (i, t) => { const e = (t < 0.03 ? [0, 0.011, 0.022].reduce((s, o) => s + (t >= o ? Math.exp(-(t - o) * 260) : 0), 0) : 0) + Math.exp(-t * 18) * 0.55; return bp(noise()) * e * 2.2; }, { gain: g, rev: 0.25, pan: 0.05 }); }
function hat(t0, open = false, g = 0.16, pan = 0.2) { const hp = biquad("hp", 7600, 0.8); voice(t0, open ? 0.2 : 0.06, (i, t) => hp(noise()) * Math.exp(-t * (open ? 22 : 70)), { gain: g, pan }); }
function crash(t0, g = 0.32) { const hp = biquad("hp", 4200, 0.6), bp = biquad("bp", 6500, 3); voice(t0, 1.8, (i, t) => { const n = noise(); return (hp(n) * 0.8 + bp(n) * 0.6) * Math.exp(-t * 2.2); }, { gain: g, rev: 0.15, pan: -0.15 }); }
function slap(t0, k) { // paper scrap landing
  const bp = biquad("bp", 900 + k * 260, 1.4); let ph = 0;
  voice(t0, 0.22, (i, t) => { ph += (TAU * (150 + k * 22)) / SR; return bp(noise()) * Math.exp(-t * 45) * 1.6 + Math.sin(ph) * Math.exp(-t * 30) * 0.6; }, { gain: 0.55, pan: (k % 2 ? 0.45 : -0.45) * (0.4 + (k % 3) * 0.3), rev: 0.12 });
}

// ── tonal ──
function pluck(t0, m, g = 0.18, pan = 0) { // Karplus–Strong
  const f = mtof(m), n = Math.round(SR / f), buf = new Float32Array(n); for (let i = 0; i < n; i++) buf[i] = noise();
  let idx = 0, last = 0; const lp = biquad("lp", 3600, 0.7);
  voice(t0, 0.55, (i, t) => { const v = buf[idx]; const nv = 0.5 * (v + buf[(idx + 1) % n]) * 0.996; buf[idx] = nv; idx = (idx + 1) % n; last = v; return lp(v) * Math.min(1, t * 400); }, { gain: g, pan, rev: 0.3, music: true });
}
function saw(ph) { return 2 * (ph - Math.floor(ph + 0.5)); }
function bass(t0, m, dur = 0.22, g = 0.32) {
  const lp = biquad("lp", 300, 0.9); let p1 = 0, p2 = 0; const f = mtof(m);
  voice(t0, dur + 0.05, (i, t) => { p1 += f / SR; p2 += (f * 1.006) / SR; if (i % 32 === 0) lp.set(180 + 900 * Math.exp(-t * 18), 0.9); const a = Math.min(1, t * 300) * (t < dur ? 1 : Math.exp(-(t - dur) * 60)); return lp(saw(p1) + saw(p2) * 0.7 + Math.sin(TAU * p1 / 2) * 0.8) * a; }, { gain: g, music: true });
}
function pad(t0, dur, notes, g = 0.05, att = 0.6) {
  notes.forEach((m, k) => [-0.11, 0, 0.12].forEach((d, j) => {
    const lp = biquad("lp", 1500, 0.6); let ph = rnd(); const f = mtof(m + d);
    voice(t0, dur + 0.6, (i, t) => { ph += f / SR; const a = Math.min(1, t / att) * (t < dur ? 1 : Math.exp(-(t - dur) * 6)); return lp(saw(ph)) * a; }, { gain: g, pan: (j - 1) * 0.6, rev: 0.4, music: true });
  }));
}
function stab(t0, notes, g = 0.12, dur = 0.38) {
  notes.forEach((m, k) => { const lp = biquad("lp", 3000, 0.8); let p = 0, q = rnd(); const f = mtof(m);
    voice(t0, dur, (i, t) => { p += f / SR; q += (f * 1.008) / SR; if (i % 32 === 0) lp.set(700 + 4000 * Math.exp(-t * 14), 0.8); return lp(saw(p) + saw(q)) * Math.exp(-t * 7); }, { gain: g, pan: (k - 1) * 0.35, rev: 0.3 }); });
}
function bell(t0, m, g = 0.14, pan = 0) { const f = mtof(m); voice(t0, 1.6, (i, t) => [[1, 1, 2.2], [2.0, 0.5, 3.5], [3.01, 0.28, 5], [4.17, 0.16, 7]].reduce((s, [r, a, d]) => s + Math.sin(TAU * f * r * t) * a * Math.exp(-t * d), 0) * Math.min(1, t * 800), { gain: g, pan, rev: 0.45 }); }

// ── UI sfx ──
function click(t0, g = 0.5) { voice(t0, 0.08, (i, t) => Math.sin(TAU * 2600 * t) * Math.exp(-t * 420) * 0.8 + noise() * Math.exp(-t * 1100) * 0.6 + Math.sin(TAU * 190 * t) * Math.exp(-t * 70) * 0.5, { gain: g, pan: 0.15 }); }
function popS(t0, m = 84, g = 0.22, pan = 0) { const f = mtof(m); let ph = 0; voice(t0, 0.12, (i, t) => { ph += (TAU * f * (0.75 + 0.25 * Math.min(1, t * 40))) / SR; return Math.sin(ph) * Math.exp(-t * 38); }, { gain: g, pan, rev: 0.15 }); }
function tick(t0, g = 0.1) { const bp = biquad("bp", 3200 + rnd() * 1500, 2.2); voice(t0, 0.03, (i, t) => bp(noise()) * Math.exp(-t * 300) * 3, { gain: g, pan: rnd() * 0.4 - 0.2 }); }
function wood(t0, hi = true, g = 0.4) { const f = hi ? 1650 : 1180; voice(t0, 0.12, (i, t) => (Math.sin(TAU * f * t) + Math.sin(TAU * f * 2.7 * t) * 0.3) * Math.exp(-t * 55), { gain: g, rev: 0.15 }); }
function whoosh(t0, dur, f0, f1, g = 0.35, p0 = -0.6, p1 = 0.6) {
  const bp = biquad("bp", f0, 0.9);
  voice(t0, dur, (i, t) => { const u = t / dur; if (i % 32 === 0) bp.set(f0 * Math.pow(f1 / f0, u), 0.9); return bp(noise()) * Math.pow(Math.sin(Math.PI * u), 2) * 2.2; }, { gain: g, pan: t => p0 + (p1 - p0) * (t / dur), rev: 0.08 });
}
function riser(t0, dur, g = 0.22) { const hp = biquad("hp", 400, 0.7); let ph = 0;
  voice(t0, dur, (i, t) => { const u = t / dur; if (i % 32 === 0) hp.set(400 + 6000 * u * u, 0.7); ph += (TAU * (220 + 660 * u * u)) / SR; return (hp(noise()) * 0.9 + Math.sin(ph) * 0.25) * u * u; }, { gain: g, rev: 0.3 }); }
function swipe(t0, g = 0.2) { whoosh(t0, 0.16, 1800, 5200, g, -0.3, 0.3); }

// ═══════════════════ arrangement ═══════════════════
const CH = { D: [62, 66, 69], Bm: [59, 62, 66], G: [55, 59, 62], A: [57, 61, 64] };
const ROOT = { D: 38, Bm: 35, G: 31, A: 33 };
const prog = [[3, 5, "D"], [5, 7, "Bm"], [7, 9, "G"], [9, 11, "A"], [11, 13, "D"], [13, 15, "Bm"], [15, 16, "G"], [16, 17.5, "A"], [17.5, 20, "D"]];
const chordAt = t => (prog.find(([a, b]) => t >= a && t < b) || [0, 0, "D"])[2];

// 1 · hook: four word hits on the downbeats, scraps slap on 16ths, "Literally." is the big one
C.words.slice(0, 4).forEach((w, i) => { kick(w, 0); sub(w, [26, 26, 26, 33][i]); });
C.words.slice(0, 4).forEach((w, i) => stab(w, [[50, 57], [50, 57], [50, 57], [52, 59]][i], 0.07, 0.25));
C.scraps.forEach((s, k) => slap(s, k));
kick(C.words[4], 1); sub(C.words[4], 26, 1.2); crash(C.words[4]); stab(C.words[4], [62, 66, 69, 76], 0.11, 0.6);
whoosh(C.hookOut, 0.32, 3500, 250, 0.42, 0.7, -0.2);
riser(2.55, 0.45, 0.18);

// groove 3 → 15
for (let b = 3; b < 15; b += 0.5) kick(b, 0);
for (let b = 3.25; b < 6; b += 0.5) hat(b, false, 0.14);
for (let b = 6; b < 15; b += 0.125) { const off = Math.abs(((b - 6) % 0.5) - 0.25) < 1e-6; hat(b, off && (b * 4) % 2 === 1, off ? 0.11 : 0.04, (b * 8) % 2 ? 0.25 : -0.1); }
for (let b = 6.5; b < 15; b += 1) clap(b, 0.42);
crash(6.0, 0.22); crash(12.0, 0.2);
// bass: held roots while the UI builds, then 8ths with an octave bounce
for (let b = 3; b < 6; b += 1) bass(b, ROOT[chordAt(b)] + 12, 0.85, 0.26);
for (let b = 6; b < 15; b += 0.25) { const r = ROOT[chordAt(b)] + 12; bass(b, (b * 4) % 2 ? r + 12 : r, 0.18, 0.28); }
// plucked arpeggio, 16ths, two-octave up/down shape
for (let b = 3; b < 15; b += 0.125) { const ch = CH[chordAt(b)], k = Math.round((b - 3) * 8) % 8; const order = [0, 1, 2, 3, 2, 1, 0, 1]; const n = ch[order[k] % 3] + 12 * (order[k] === 3 ? 1 : 0) + 12; pluck(b, n, b < 6 ? 0.12 : 0.15, k % 2 ? 0.35 : -0.35); }
prog.forEach(([a, b, c]) => { if (a >= 3 && a < 15) pad(a, b - a, CH[c].map(n => n - 12), 0.022, 0.4); });

// 2 · build: each UI piece lands on a rising pentatonic pop
const PENT = [74, 76, 78, 81, 83, 86, 88, 90, 93];
[C.bar, C.brief, ...C.meas, ...C.att, C.pop].forEach((t, k) => popS(t, PENT[k % PENT.length], 0.2, (k % 2 ? 0.3 : -0.3)));
C.lines2.forEach(t => swipe(t, 0.12));
whoosh(C.zoomIn, 0.5, 300, 6000, 0.4, -0.2, 0.2); riser(C.zoomIn, 0.5, 0.15);

if (!CUT) {
// 3 · the week: match-cut thump, tilt whoosh, cards lift on 16ths, a tape-stop on the focus pull
sub(C.match, 38, 0.4); swipe(C.match, 0.14);
whoosh(C.tilt, 0.42, 300, 2600, 0.32, -0.5, 0.5);
C.lift.forEach((t, k) => popS(t, [79, 83, 86, 91][k], 0.15, k % 2 ? 0.35 : -0.35));
C.lab3.forEach(t => swipe(t, 0.1));
whoosh(C.fly, 0.38, 2200, 500, 0.34, 0.5, -0.3);
C.rows3.forEach((t, k) => tick(t, 0.14));
C.rows3.forEach((t, k) => popS(t, PENT[k + 2], 0.12, 0.2));
{ let ph = 0; voice(C.focus, 0.32, (i, tt) => { const f = 180 * Math.exp(-tt * 5); ph += (TAU * f) / SR; return Math.sin(ph) * Math.exp(-tt * 6); }, { gain: 0.35 }); } // tape-stop "whoomp"
swipe(C.due + 0.14, 0.2);
whoosh(C.morphRow, 0.3, 700, 3200, 0.24, -0.3, 0.3);
click(C.click1, 0.6);
bell(C.click1 + 0.06, 86, 0.11, -0.2); bell(C.click1 + 0.125, 90, 0.11, 0.2);
whoosh(C.collapse, 0.22, 2600, 500, 0.18, 0.2, -0.2);
whoosh(C.toPill, 0.36, 400, 3600, 0.3, -0.4, 0.4);

// 4 · Ask Chapt: pill opens, keys tick, the ledger settles step by step, the answer lands
popS(C.pill, 74, 0.2); whoosh(C.pill, 0.3, 500, 2800, 0.22, -0.2, 0.2);
swipe(C.lab4, 0.1);
for (let t = C.typeA; t < C.typeB; t += 0.0625) tick(t, 0.13);
click(C.enter, 0.45); whoosh(C.enter, 0.28, 900, 3000, 0.18, -0.2, 0.2);
[10.125, 10.375, 10.625].forEach((t, k) => popS(t, 86 + k * 3, 0.15, k % 2 ? 0.3 : -0.3));
bell(C.answer, 81, 0.12, -0.2); bell(C.answer + 0.0625, 86, 0.12, 0.2);
swipe(C.lab4b, 0.1);
C.rows4.forEach((t, k) => popS(t, PENT[k + 3], 0.14, (k - 1) * 0.4));
swipe(C.hl4, 0.18);
whoosh(C.out2, 0.3, 400, 3800, 0.4, -0.2, 0.2);

} else {
// 3 · ask (v1)
for (let t = C.typeA; t < C.typeB; t += 0.0625) tick(t, 0.12);
popS(C.check, 79, 0.15);
C.rows.forEach((t, k) => popS(t, 86 + k * 2, 0.16, 0.2));
whoosh(C.answer, 0.22, 600, 2400, 0.16, 0.2, -0.2);
click(C.click1);
whoosh(C.out1, 0.3, 2800, 400, 0.4, 0.8, -0.8);
// 4 · send (v1)
popS(C.q2, 81, 0.16);
whoosh(C.draft, 0.25, 900, 3000, 0.14, -0.2, 0.2);
click(C.click2, 0.55);
bell(C.done, 81, 0.11, -0.2); bell(C.done + 0.0625, 86, 0.12, 0.2);
swipe(C.hl2, 0.18);
whoosh(C.out2, 0.3, 400, 3800, 0.4, -0.2, 0.2);
}

// 5 · roll
C.chips.forEach((t, k) => popS(t, PENT[k], 0.14, k % 2 ? 0.4 : -0.4));
for (let t = C.lines5[1]; t < C.lines5[2] + 0.5; t += 0.0625) tick(t, 0.06);
click(C.click3, 0.55);
whoosh(C.flood, 0.65, 200, 4000, 0.5, -0.5, 0.5);
crash(14.875, 0.12);

// 6 · the number: drums drop out, the clock takes over
pad(15, 2.5, [...CH.G, 74].map(n => n - 12), 0.03, 0.8);
C.digits.forEach((t, k) => { wood(t, k % 2 === 0, 0.42); sub(t, k < 2 ? 31 : 33, 0.45); });
for (let t = 15.25; t < 17; t += 0.5) wood(t, false, 0.12);
riser(16.0, 1.0, 0.22);
kick(C.digits[4], 1); crash(C.digits[4], 0.24); stab(C.digits[4], [57, 61, 64, 69], 0.1, 0.45);
whoosh(C.out6, 0.3, 3000, 300, 0.32, 0.4, -0.4);
whoosh(C.morph, 0.45, 2400, 180, 0.3, -0.3, 0.3);

// 7 · lockup
kick(C.mark, 1); sub(C.mark, 26, 1.6); crash(C.mark, 0.2);
pad(C.mark, 2.25, [50, 57, 62, 66, 69, 76], 0.03, 0.25);
[74, 78, 81, 86, 90].forEach((m, k) => bell(C.mark + k * 0.125, m, 0.1, (k - 2) * 0.25));
C.eyes.forEach((t, k) => popS(t, 93 + k * 2, 0.1));
whoosh(C.smile, 0.22, 800, 2600, 0.1);
popS(C.btn, 81, 0.2);
for (let b = 18.5; b < 19.75; b += 0.5) kick(b, 0);
for (let b = 18.75; b < 19.75; b += 0.5) hat(b, false, 0.1);
click(C.click4, 0.6);
bell(C.click4 + 0.125, 86, 0.1, 0.2);
popS(C.blink, 96, 0.06);

// ═══════════════════ mixdown ═══════════════════
for (let j = 0; j < N; j++) { L[j] += ML[j] * Duck[j]; R[j] += MR[j] * Duck[j]; RvL[j] += ML[j] * Duck[j] * 0.0; }
// Schroeder/Freeverb-ish reverb on the send
function reverb(inp, seedOff) {
  const out = new Float32Array(N);
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map(d => ({ b: new Float32Array(d + seedOff), i: 0, f: 0 }));
  const aps = [556, 441, 341].map(d => ({ b: new Float32Array(d + seedOff), i: 0 }));
  for (let j = 0; j < N; j++) {
    let s = 0; const x = inp[j];
    for (const c of combs) { const y = c.b[c.i]; c.f = y * 0.75 + c.f * 0.25; c.b[c.i] = x + c.f * 0.82; c.i = (c.i + 1) % c.b.length; s += y; }
    s /= combs.length;
    for (const a of aps) { const y = a.b[a.i]; const v = -s + y; a.b[a.i] = s + y * 0.5; a.i = (a.i + 1) % a.b.length; s = v; }
    out[j] = s;
  }
  return out;
}
const rl = reverb(RvL, 0), rr = reverb(RvR, 23);
const fadeOut = j => { const t = j / SR; return t > DUR - 0.35 ? Math.max(0, (DUR - t) / 0.35) : 1; };
const OL = new Float32Array(N), OR = new Float32Array(N);
for (let j = 0; j < N; j++) { const g = fadeOut(j); OL[j] = Math.tanh((L[j] + rl[j] * 0.9) * 0.9) * g; OR[j] = Math.tanh((R[j] + rr[j] * 0.9) * 0.9) * g; }

function wav(path, l, r) {
  const n = l.length, buf = Buffer.alloc(44 + n * 8);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 8, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 8, 28); buf.writeUInt16LE(8, 32); buf.writeUInt16LE(32, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 8, 40);
  for (let i = 0; i < n; i++) { buf.writeFloatLE(l[i], 44 + i * 8); buf.writeFloatLE(r[i], 48 + i * 8); }
  writeFileSync(path, buf);
}
mkdirSync(`${here}/out`, { recursive: true });
const raw = `${here}/out/mix${CUT}_raw.wav`, fin = `${here}/out/mix${CUT}.wav`;
wav(raw, OL, OR);

// ── loudness: two-pass EBU R128 to -14 LUFS / -1 dBTP ──
const m1 = spawnSync("ffmpeg", ["-hide_banner", "-i", raw, "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-"]).stderr.toString();
const st = JSON.parse(m1.slice(m1.lastIndexOf("{"), m1.lastIndexOf("}") + 1));
// static gain to target + a true-peak-safe limiter (no dynamic AGC pumping)
const meas = f => { const o = spawnSync("ffmpeg", ["-hide_banner", "-i", f, "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-"]).stderr.toString(); return JSON.parse(o.slice(o.lastIndexOf("{"), o.lastIndexOf("}") + 1)); };
let gain = -14 - +st.input_i, st2;
for (let pass = 0; pass < 4; pass++) {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-af", `volume=${gain.toFixed(3)}dB,aresample=192000,alimiter=limit=0.84:attack=1:release=60:level=false,aresample=48000`, "-c:a", "pcm_s24le", fin]);
  st2 = meas(fin);
  if (Math.abs(+st2.input_i + 14) < 0.1) break;
  gain += -14 - +st2.input_i;
}
console.log(`loudness: in ${st.input_i} LUFS → out ${st2.input_i} LUFS, TP ${st2.input_tp} dBTP (static gain ${gain.toFixed(2)} dB + limiter)`);

// ── measure the beat grid from the mix itself (low-band onsets) ──
// kick-band energy flux, onset = steepest rise; a 0.4s refractory window skips the offbeat bass
const lp = biquad("lp", 90, 0.7), lp2 = biquad("lp", 90, 0.7); const env = new Float32Array(N); let e = 0;
for (let j = 0; j < N; j++) { const x = Math.abs(KB[j]); e = Math.max(x, e * 0.999); env[j] = e; }
const hop = 16, flux = []; for (let j = hop; j < N; j += hop) flux.push([j / SR, env[j] - env[j - hop]]);
const fmax = Math.max(...flux.map(f => f[1])), onsets = [];
for (let i = 1; i < flux.length - 1; i++) {
  const [t, d] = flux[i];
  if (d < 0.18 * fmax || d < flux[i - 1][1] || d < flux[i + 1][1]) continue;
  if (onsets.length && t - onsets[onsets.length - 1] < 0.3) continue;
  onsets.push(t);
}
// fit period + phase on the four-on-the-floor stretch
const grid = onsets.filter(t => t >= 3 && t < 15);
const idx = grid.map(t => Math.round((t - 3) / 0.5));
const n = grid.length, sx = idx.reduce((a, b) => a + b, 0), sy = grid.reduce((a, b) => a + b, 0), sxx = idx.reduce((a, b) => a + b * b, 0), sxy = idx.reduce((a, b, i) => a + b * grid[i], 0);
const period = (n * sxy - sx * sy) / (n * sxx - sx * sx), phase0 = (sy - period * sx) / n;
const offset = phase0 - 3; // measured onset vs the nominal grid
const beats = Array.from({ length: Math.round(DUR / period) }, (_, k) => +(offset + k * period).toFixed(5));
const dev = grid.map((t, i) => Math.abs(t - (phase0 + idx[i] * period)));
const out = { bpm: +(60 / period).toFixed(3), period: +period.toFixed(6), offset: +offset.toFixed(5), maxDeviationMs: +(Math.max(...dev) * 1000).toFixed(2), beats, onsets: onsets.map(t => +t.toFixed(4)) };
writeFileSync(`${here}/beats${CUT}.json`, JSON.stringify(out, null, 1));
writeFileSync(`${here}/beats${CUT}.js`, `window.BEATS = ${JSON.stringify({ bpm: out.bpm, period: out.period, offset: out.offset })}; // measured by synth.mjs\n`);
console.log(`beat grid: ${out.bpm} BPM, offset ${(offset * 1000).toFixed(1)} ms, max dev ${out.maxDeviationMs} ms, ${onsets.length} onsets`);
