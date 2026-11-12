"use client";

// Decline (_design/Ask Chapt Answer System Mock.html#decline) — out of scope,
// said kindly. The scope line is fixed copy with the org's name; the closest
// questions Chapt can answer ride in the footing's follows like any answer.

import { IcCompass } from "../icons";
import type { DeclineShape } from "../types";

export function DeclineSheet({ shape }: { shape: DeclineShape }) {
  return (
    <div className="dc in in-3">
      <span className="dc-g"><IcCompass size={16} /></span>
      <div>
        <b>Outside what I can read</b>
        <p>{shape.scope}</p>
      </div>
    </div>
  );
}
