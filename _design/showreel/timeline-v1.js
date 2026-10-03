// v1 cut (landing-page chat beats) — shared cue sheet — loaded as a classic <script> by film.html and through
// node:vm by synth.mjs, so picture and sound read the same numbers.
// 120 BPM: beat = 0.5s, 8th = 0.25s, 16th = 0.125s. Every cue sits on the grid.
var TL = {
  bpm: 120,
  dur: 20,
  S: { hook: [0, 3], build: [3, 6], ask: [6, 9], send: [9, 12], roll: [12, 15], metric: [15, 17.5], logo: [17.5, 20] },
  c: {
    // 1 · hook — "Your org is everywhere. Literally."
    words: [0, 0.5, 1.0, 1.5, 2.5],
    scraps: [1.5, 1.625, 1.75, 1.875, 2.0, 2.125, 2.25, 2.375],
    hookOut: 2.75,
    // 2 · the product assembles
    shell: 3.0, bar: 3.125, brief: 3.25, meas: [3.375, 3.5, 3.625, 3.75], att: [3.875, 4.0],
    lines2: [3.0, 4.5, 5.0], pop: 4.75, zoomIn: 5.5,
    // 3 · Just ask
    q1: 6.0, typeA: 6.125, typeB: 6.75, check: 6.875, rows: [7.0, 7.125, 7.25, 7.375],
    answer: 7.5, cur1: 7.75, cur1At: 8.25, click1: 8.375, out1: 8.75,
    // 4 · Nothing sends without your OK
    q2: 9.0, draft: 9.375, cur2: 9.875, cur2At: 10.5, click2: 10.75, done: 11.0, hl2: 11.5, out2: 11.75,
    // 5 · Roll call, 52 names, 40 seconds
    lines5: [12.0, 12.25, 12.5], chips: [12.125, 12.1875, 12.25, 12.3125, 12.375, 12.4375, 12.5, 12.5625],
    zoom5: [12.625, 13.375], cur3: 13.25, cur3At: 13.75, click3: 14.0, flood: 14.25,
    // 6 · the number
    digits: [15.0, 15.5, 16.0, 16.5, 17.0], lines6: [16.0, 16.125], out6: 17.25,
    // 7 · lockup + CTA
    morph: 17.3, mark: 17.75, eyes: [17.875, 17.9375], smile: 18.0, word: 18.0, btn: 18.5,
    url: 19.0, cur4: 18.75, cur4At: 19.125, click4: 19.25, blink: 19.5,
  },
};
if (typeof module !== "undefined") module.exports = TL;
