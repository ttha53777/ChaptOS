import type { DashWidgetId } from "@/lib/dashboard-layout";

// Tiny schematic of each widget, drawn on its folded strip and its tray tile in
// Arrange mode. Ported from _design/Dashboard Arrange Mock.html. Static markup
// we author, drawn in the paper tokens so it follows the theme.

const L = (x: number, y: number, w: number, c = "var(--line-med)", h = 4) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${c}"/>`;
const SOL = ["var(--pp-mint)", "var(--pp-sky)", "var(--pp-butter)", "var(--pp-peach)", "var(--pp-lilac)"];

type Drawn = Exclude<DashWidgetId, `metric:${number}`> | "metric";

const G: Record<Drawn, string> = {
  health: `<circle cx="30" cy="26" r="17" fill="none" stroke="var(--card-3)" stroke-width="7"/><circle cx="30" cy="26" r="17" fill="none" stroke="var(--p-fg)" stroke-width="7" stroke-linecap="round" stroke-dasharray="78 107" transform="rotate(-90 30 26)"/>${L(58, 14, 44, "var(--ink)", 7)}${L(58, 28, 54)}${L(58, 36, 38)}`,
  announcement: `<g transform="rotate(-4 60 26)"><rect x="22" y="6" width="76" height="40" rx="4" fill="var(--pp-butter)"/><rect x="48" y="2" width="24" height="8" fill="rgba(255,255,255,.6)"/>${L(30, 17, 56, "rgba(38,33,27,.5)")}${L(30, 26, 46, "rgba(38,33,27,.5)")}${L(30, 36, 26, "rgba(38,33,27,.3)")}</g>`,
  needs: [0, 1, 2].map(i => `<rect x="5" y="${6 + i * 14}" width="10" height="10" rx="3" fill="${i ? "var(--card)" : "var(--pp-mint)"}" stroke="var(--line-med)"/>${L(21, 9 + i * 14, 70 - i * 14, i ? "var(--ink-soft)" : "var(--line-med)")}${L(100, 9 + i * 14, 14)}`).join(""),
  members: [0, 1, 2, 3, 4, 5].map(i => `<circle cx="${12 + i * 15}" cy="17" r="7" fill="var(--card-3)" stroke="${["var(--pp-mint-ink)", "var(--pp-mint-ink)", "var(--pp-mint-ink)", "var(--pp-butter-ink)", "var(--pp-mint-ink)", "var(--pp-peach-ink)"][i]}" stroke-width="2"/>`).join("")
    + `<rect x="4" y="33" width="66" height="10" fill="var(--pp-mint)"/><rect x="70" y="33" width="28" height="10" fill="var(--pp-butter)"/><rect x="98" y="33" width="18" height="10" fill="var(--pp-peach)"/><rect x="4" y="33" width="112" height="10" rx="3" fill="none" stroke="var(--ink)" stroke-width="1.3"/>`,
  ballot: [70, 48, 26].map((w, i) => `<rect x="5" y="${6 + i * 14}" width="110" height="11" rx="5.5" fill="var(--card)" stroke="var(--line-med)"/><rect x="5" y="${6 + i * 14}" width="${w}" height="11" rx="5.5" fill="var(--p-fg)" fill-opacity=".45"/>`).join(""),
  week: Array.from({ length: 7 }, (_, i) => `<rect x="${3 + i * 16.5}" y="10" width="13.5" height="32" rx="4" fill="${i === 2 ? "var(--p-fg)" : "var(--card)"}" fill-opacity="${i === 2 ? ".35" : "1"}" stroke="var(--line-med)"/>${[0, 2, 3, 5].includes(i) ? `<circle cx="${9.75 + i * 16.5}" cy="34" r="2" fill="var(--p-fg)"/>` : ""}`).join(""),
  treasury: `<path d="M4 42 L20 35 L36 37 L52 27 L68 29 L84 19 L100 21 L116 9 L116 48 L4 48Z" fill="var(--p-fg)" fill-opacity=".22"/><path d="M4 42 L20 35 L36 37 L52 27 L68 29 L84 19 L100 21 L116 9" fill="none" stroke="var(--p-fg)" stroke-width="2" stroke-linejoin="round"/>`,
  next: `<rect x="3" y="6" width="114" height="40" rx="8" fill="var(--card)" stroke="var(--ink)" stroke-width="1.5"/><rect x="6" y="9" width="26" height="34" rx="5" fill="var(--pp-sky)"/><path d="M35 9v34" stroke="var(--line-med)" stroke-dasharray="3 3"/>${L(42, 14, 48, "var(--ink)", 6)}${L(42, 26, 64)}${L(42, 34, 38)}`,
  docs: [0, 1, 2].map(i => `<path d="M7 ${6 + i * 14}h6l3 3v8H7z" fill="${SOL[[1, 2, 4][i]]}"/>${L(23, 10 + i * 14, 58 - i * 8, "var(--ink-soft)")}${L(102, 10 + i * 14, 12)}`).join(""),
  money: `${L(5, 8, 40, "var(--ink)", 8)}<rect x="5" y="24" width="78" height="7" rx="3.5" fill="var(--p-fg)"/><rect x="5" y="35" width="30" height="7" rx="3.5" fill="var(--line-med)"/>${L(90, 26, 24)}${L(90, 37, 18)}`,
  dues: Array.from({ length: 16 }, (_, i) => `<circle cx="${9 + (i % 8) * 14.5}" cy="${i < 8 ? 16 : 35}" r="5.6" fill="${i < 11 ? "var(--pp-butter)" : "none"}" stroke="${i < 11 ? "var(--pp-butter-ink)" : "var(--line-med)"}" stroke-width="1.4"${i < 11 ? "" : ' stroke-dasharray="2 2"'}/>`).join(""),
  service: [31, 26, 22, 18, 15, 14, 12, 11, 10, 10, 8, 6, 4, 2, 1].map((h, i) => `<rect x="${5 + i * 7.4}" y="${46 - h * 1.25}" width="5.4" height="${h * 1.25}" rx="1.5" fill="${h >= 10 ? "var(--pp-rose)" : "var(--card)"}" stroke="${h >= 10 ? "var(--pp-rose-ink)" : "var(--line-med)"}"/>`).join("") + `<path d="M3 33.5H117" stroke="var(--ink)" stroke-dasharray="3 2.5"/>`,
  gpa: [1, 3, 5, 9, 14, 12, 6, 2].map((n, i) => `<rect x="${6 + i * 14}" y="${46 - n * 2.7}" width="10" height="${n * 2.7}" rx="2" fill="${i < 2 ? "var(--pp-peach)" : "var(--pp-lilac)"}"/>`).join("") + `<path d="M32 6v40" stroke="var(--ink-soft)" stroke-dasharray="3 3"/>`,
  social: [0, 1, 2].map(i => `<g transform="rotate(${[-4, 3, -2][i]} ${24 + i * 36} 26)"><rect x="${8 + i * 36}" y="6" width="32" height="38" rx="3" fill="var(--card)" stroke="var(--line-med)"/><rect x="${11 + i * 36}" y="9" width="26" height="24" rx="2" fill="${SOL[[3, 1, 0][i]]}"/></g>`).join(""),
  metric: `<rect x="4" y="38" width="22" height="8" rx="2" fill="var(--pp-peach)"/><rect x="26" y="38" width="22" height="8" fill="var(--pp-butter)"/><rect x="48" y="38" width="68" height="8" rx="2" fill="var(--pp-mint)"/>` + [[10, 0], [30, 0], [40, 0], [52, 0], [52, 1], [60, 0], [60, 1], [60, 2], [70, 0], [70, 1], [82, 0], [92, 0], [104, 0]].map(([x, n]) => `<circle cx="${x}" cy="${31 - n * 8}" r="3.4" fill="${x >= 48 ? "var(--pp-mint-ink)" : x >= 26 ? "var(--pp-butter-ink)" : "var(--pp-peach-ink)"}"/>`).join(""),
  activity: [0, 1, 2].map(i => `<rect x="5" y="${7 + i * 14}" width="10" height="10" rx="3" fill="${SOL[i + 1]}"/>${L(21, 10 + i * 14, 62 - i * 12, "var(--ink-soft)")}${L(100, 10 + i * 14, 15)}`).join(""),
};

export function thumbSvg(k: DashWidgetId): string {
  return `<svg viewBox="0 0 120 52" aria-hidden="true">${G[k.startsWith("metric:") ? "metric" : k as Drawn]}</svg>`;
}
