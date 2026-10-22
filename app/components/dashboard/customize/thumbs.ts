import type { DashWidgetId } from "@/lib/dashboard-layout";

// Tiny schematic of each widget, drawn on its folded strip and its tray tile in
// Arrange mode. Ported from _design/Dashboard Arrange Mock.html. Static markup
// we author, drawn in the paper tokens so it follows the theme.

const L = (x: number, y: number, w: number, c = "var(--line-med)", h = 4) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${c}"/>`;
const SOL = ["var(--pp-mint)", "var(--pp-sky)", "var(--pp-butter)", "var(--pp-peach)", "var(--pp-lilac)"];

const G: Record<DashWidgetId, string> = {
  health: `<circle cx="30" cy="26" r="17" fill="none" stroke="var(--card-3)" stroke-width="7"/><circle cx="30" cy="26" r="17" fill="none" stroke="var(--p-fg)" stroke-width="7" stroke-linecap="round" stroke-dasharray="78 107" transform="rotate(-90 30 26)"/>${L(58, 14, 44, "var(--ink)", 7)}${L(58, 28, 54)}${L(58, 36, 38)}`,
  announcement: `<g transform="rotate(-4 60 26)"><rect x="22" y="6" width="76" height="40" rx="4" fill="var(--pp-butter)"/><rect x="48" y="2" width="24" height="8" fill="rgba(255,255,255,.6)"/>${L(30, 17, 56, "rgba(38,33,27,.5)")}${L(30, 26, 46, "rgba(38,33,27,.5)")}${L(30, 36, 26, "rgba(38,33,27,.3)")}</g>`,
  needs: [0, 1, 2].map(i => `<rect x="5" y="${6 + i * 14}" width="10" height="10" rx="3" fill="${i ? "var(--card)" : "var(--pp-mint)"}" stroke="var(--line-med)"/>${L(21, 9 + i * 14, 70 - i * 14, i ? "var(--ink-soft)" : "var(--line-med)")}${L(100, 9 + i * 14, 14)}`).join(""),
  members: [0, 1, 2, 3, 4, 5].map(i => `<circle cx="${12 + i * 15}" cy="17" r="7" fill="var(--card-3)" stroke="${["var(--pp-mint-ink)", "var(--pp-mint-ink)", "var(--pp-mint-ink)", "var(--pp-butter-ink)", "var(--pp-mint-ink)", "var(--pp-peach-ink)"][i]}" stroke-width="2"/>`).join("")
    + `<rect x="4" y="33" width="66" height="10" fill="var(--pp-mint)"/><rect x="70" y="33" width="28" height="10" fill="var(--pp-butter)"/><rect x="98" y="33" width="18" height="10" fill="var(--pp-peach)"/><rect x="4" y="33" width="112" height="10" rx="3" fill="none" stroke="var(--ink)" stroke-width="1.3"/>`,
  ballot: [70, 48, 26].map((w, i) => `<rect x="5" y="${6 + i * 14}" width="110" height="11" rx="5.5" fill="var(--card)" stroke="var(--line-med)"/><rect x="5" y="${6 + i * 14}" width="${w}" height="11" rx="5.5" fill="var(--p-fg)" fill-opacity=".45"/>`).join(""),
  week: Array.from({ length: 7 }, (_, i) => `<rect x="${3 + i * 16.5}" y="10" width="13.5" height="32" rx="4" fill="${i === 2 ? "var(--p-fg)" : "var(--card)"}" fill-opacity="${i === 2 ? ".35" : "1"}" stroke="var(--line-med)"/>${[0, 2, 3, 5].includes(i) ? `<circle cx="${9.75 + i * 16.5}" cy="34" r="2" fill="var(--p-fg)"/>` : ""}`).join(""),
  treasury: `<path d="M4 42 L20 35 L36 37 L52 27 L68 29 L84 19 L100 21 L116 9 L116 48 L4 48Z" fill="var(--p-fg)" fill-opacity=".22"/><path d="M4 42 L20 35 L36 37 L52 27 L68 29 L84 19 L100 21 L116 9" fill="none" stroke="var(--p-fg)" stroke-width="2" stroke-linejoin="round"/>`,
  activity: [0, 1, 2].map(i => `<rect x="5" y="${7 + i * 14}" width="10" height="10" rx="3" fill="${SOL[i + 1]}"/>${L(21, 10 + i * 14, 62 - i * 12, "var(--ink-soft)")}${L(100, 10 + i * 14, 15)}`).join(""),
};

export function thumbSvg(k: DashWidgetId): string {
  return `<svg viewBox="0 0 120 52" aria-hidden="true">${G[k]}</svg>`;
}
