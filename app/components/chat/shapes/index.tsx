"use client";

// Answer shapes — the picture an answer is drawn as when a list isn't it
// (_design/Ask Chapt Reply States.html, _design/Ask Chapt List Forms Mock.html).
// Every number here came from the server (lib/ai-shapes), never model text.
//
// Each shape draws over the answer's own `rows`, which the server derived from
// the same data and lined up 1:1 with what it draws. That keeps keyboard
// selection (stepRow over `rows`) pointing at what's on screen, and a tap doing
// exactly what tapping the plain row would.
//
// One sheet per file; this registry is the only place that knows the types.
// A type missing here is drawn as the plain rows, like on an older client.

import type { ReactElement } from "react";

import type { AnswerRow, AnswerShape } from "../types";
import type { RenderRow, RowHandlers } from "./common";
import { BreakdownSheet } from "./Breakdown";
import { MissingSheet } from "./Missing";
import { TallySheet } from "./Tally";
import { WeekSheet } from "./Week";

export type { RowHandlers } from "./common";

interface SheetProps<S> {
  shape: S;
  rows: AnswerRow[];
  h: RowHandlers;
  renderRow: RenderRow;
}

type Registry = { [T in AnswerShape["type"]]?: (p: SheetProps<Extract<AnswerShape, { type: T }>>) => ReactElement | null };

const SHEETS: Registry = {
  tally: p => <TallySheet {...p} />,
  breakdown: p => <BreakdownSheet shape={p.shape} rows={p.rows} h={p.h} />,
  week: p => <WeekSheet shape={p.shape} rows={p.rows} h={p.h} />,
  missing: p => <MissingSheet shape={p.shape} rows={p.rows} renderRow={p.renderRow} />,
};

/** True when this client knows how to draw the shape; unknown types fall back to rows. */
export function isKnownShape(shape: AnswerShape | undefined): shape is AnswerShape {
  return !!shape && typeof shape.type === "string" && shape.type in SHEETS;
}

export function ShapeBlock({ shape, rows, h, renderRow }: SheetProps<AnswerShape>) {
  const draw = SHEETS[shape.type] as ((p: SheetProps<AnswerShape>) => ReactElement | null) | undefined;
  return draw ? draw({ shape, rows, h, renderRow }) : null;
}
