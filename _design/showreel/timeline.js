// Shared cue sheet — loaded as a classic <script> by film.html and through
// node:vm by synth.mjs, so picture and sound read the same numbers.
// 120 BPM: beat = 0.5s, 8th = 0.25s, 16th = 0.125s. Every cue sits on the grid.
var TL = {
  bpm: 120,
  dur: 20,
  S: { hook: [0, 3], build: [3, 6], week: [6, 9], ask: [9, 12], roll: [12, 15], metric: [15, 17.5], logo: [17.5, 20] },
  c: {
    // 1 · hook — "Your org is everywhere. Literally."
    words: [0, 0.5, 1.0, 1.5, 2.5],
    scraps: [1.5, 1.625, 1.75, 1.875, 2.0, 2.125, 2.25, 2.375],
    hookOut: 2.75,
    // 2 · the product assembles
    shell: 3.0, bar: 3.125, brief: 3.25, meas: [3.375, 3.5, 3.625, 3.75], att: [3.875, 4.0],
    lines2: [3.0, 4.5, 5.0], pop: 4.75, zoomIn: 5.5,
    // 3 · the week — the real dashboard (local demo DB), then Priya's task
    match: 6.0, tilt: 6.375, lift: [6.5, 6.5625, 6.625, 6.6875], lab3: [6.5, 6.625], fly: 6.875,
    rows3: [7.0, 7.0625, 7.125, 7.1875], focus: 7.375, due: 7.5, morphRow: 7.875,
    cur1: 7.9375, cur1At: 8.25, click1: 8.375, collapse: 8.5, toPill: 8.625,
    // 4 · Ask Chapt — the real spotlight, morphing state to state
    pill: 9.0, lab4: 9.125, typeA: 9.25, typeB: 9.75, enter: 9.875, thinkEnd: 10.75,
    answer: 10.75, lab4b: 10.75, rows4: [11.0, 11.0625, 11.125], hl4: 11.25, out2: 11.75,
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
