"use client";

// Clarify tiles (_design/Ask Chapt Answer System Mock.html#clarify): each area
// a question back can offer gets a fixed colour, line and little sketch. The
// sketches are drawings, not data — they promise nothing Chapt hasn't read.

import type { ReactNode } from "react";

import type { AskBackArea } from "./types";
import { KindGlyph } from "./icons";

const ink = "var(--ink)";
const bar = (x: number, y: number, w: number, h: number, fill: string, k: number) =>
  <rect key={k} x={x} y={y} width={w} height={h} rx={2} fill={fill} stroke={ink} strokeWidth={1.2} />;

export const AREA_TILE: Record<AskBackArea, { tone: string; line: string; glyph: string; sketch: ReactNode }> = {
  attendance: {
    tone: "var(--pp-mint)", line: "Each meeting against your bar", glyph: "attendance",
    sketch: <>{[20, 23, 17, 14, 21, 19].map((hgt, i) => bar(i * 13, 26 - hgt, 8, hgt, i === 3 ? "var(--pp-peach)" : "var(--pp-mint)", i))}<path d="M0 10h80" stroke="var(--ink-soft)" strokeWidth={1.2} strokeDasharray="3 3" /></>,
  },
  money: {
    tone: "var(--pp-butter)", line: "Where it came from and went", glyph: "treasury",
    sketch: <>{bar(0, 8, 36, 12, "var(--pp-butter)", 0)}{bar(36, 8, 22, 12, "var(--pp-sky)", 1)}{bar(58, 8, 14, 12, "var(--pp-rose)", 2)}{bar(72, 8, 8, 12, "var(--pp-mint)", 3)}</>,
  },
  service: {
    tone: "var(--pp-sky)", line: "Hours per member against the goal", glyph: "service",
    sketch: <>{bar(0, 2, 68, 6, "var(--pp-sky)", 0)}{bar(0, 10, 50, 6, "var(--pp-sky)", 1)}{bar(0, 18, 24, 6, "var(--pp-peach)", 2)}</>,
  },
  tasks: {
    tone: "var(--pp-peach)", line: "What's open, done and late", glyph: "tasks",
    sketch: <>{[0, 1, 2, 3].map(i => bar(i * 15, 7, 12, 12, i < 2 ? "var(--pp-mint)" : i === 2 ? "var(--card)" : "var(--pp-peach)", i))}</>,
  },
  events: {
    tone: "var(--pp-lilac)", line: "What happened, by month", glyph: "events",
    sketch: <>{[[0, 4], [14, 4], [28, 4], [0, 16], [14, 16]].map(([x, y], i) => bar(x, y, 11, 8, "var(--pp-lilac)", i))}</>,
  },
  roster: {
    tone: "var(--pp-rose)", line: "Who's in, who joined, who's at risk", glyph: "roster",
    sketch: <>{[0, 1, 2, 3, 4, 5].map(i => <circle key={i} cx={6 + i * 12} cy={13} r={5} fill={i === 4 ? "var(--pp-peach)" : "var(--pp-rose)"} stroke={ink} strokeWidth={1.2} />)}</>,
  },
};

export function AreaGlyph({ area }: { area: AskBackArea }) {
  return <KindGlyph kind={AREA_TILE[area].glyph} size={15} />;
}
