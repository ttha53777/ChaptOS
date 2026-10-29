"use client";

// The screen Ask Chapt opens on, on a phone (the briefing scene). The desktop
// spotlight centers a line of copy over three pills; a phone gets a page of its
// own in the paper idiom: the greeting and the highlighted ask up top, the lede
// on a taped note, and the three starters as ink tickets down in the thumb
// zone. Same content as the desktop briefing — the starters are the widget's
// STARTERS, the name and org come off currentUser. Styles: chat-phone.css.
//
// With the keyboard up the note and greeting drop out and the tickets fold into
// a sideways strip directly above the composer, so a starter is still one tap.

import type { ReactNode } from "react";
import { greetingFor } from "../dashboard/ledger/BriefingHeader";
import { IcArrow } from "./icons";

export interface Starter { icon: ReactNode; label: string; q: string }

export function PhoneLanding({ firstName, orgName, timeZone, starters, onAsk }: {
  firstName: string | null;
  orgName: string | null;
  timeZone: string | null;
  starters: readonly Starter[];
  onAsk: (q: string) => void;
}) {
  const now = new Date();
  let date: string;
  try {
    date = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(timeZone ? { timeZone } : {}) });
  } catch {
    date = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  const greeting = greetingFor(now.getHours());

  return (
    <div className="pl">
      <div className="pl-top">
        <span className="pl-eye pl-rv">{orgName && <b>{orgName}</b>}{orgName && " · "}{date}</span>
        <h2 className="pl-h pl-rv" style={{ ["--d" as string]: 1 }}>
          <span className="hey">{greeting}{firstName ? `, ${firstName}` : ""}.</span>
          What do you want to{" "}
          <span className="nw">
            <em>know?</em>
            <svg className="spk" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <path d="M16 4v7M16 21v7M4 16h7M21 16h7M8 8l4 4M20 20l4 4M24 8l-4 4" />
            </svg>
          </span>
        </h2>
        <p className="pl-note pl-rv" style={{ ["--d" as string]: 2 }}>
          <b>Dues, attendance, events, the treasury</b>{" "}— ask, and I&apos;ll read the chapter&apos;s records and answer.
          <svg className="pl-doodle" viewBox="0 0 56 52" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 6c18 0 34 8 36 22 1 8-3 14-8 16" />
            <path d="M28 38l6 6 7-7" />
          </svg>
        </p>
      </div>
      <div className="pl-bot">
        <span className="pl-lbl pl-rv" style={{ ["--d" as string]: 3 }}>Start with one</span>
        <div className="pl-starters">
          {starters.map((s, i) => (
            <button
              key={s.label}
              type="button"
              className="pl-tkt pl-rv"
              style={{ ["--d" as string]: 4 + i }}
              onClick={() => onAsk(s.q)}
            >
              <span className="stub">{s.icon}</span>
              <span className="bd">
                <span className="k">{s.label}</span>
                <span className="q">{s.q}</span>
              </span>
              <span className="go"><IcArrow /></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
