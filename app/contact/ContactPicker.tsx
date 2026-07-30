"use client";

import { useState } from "react";
import { Doodle, sx } from "../components/landing/Doodle";
import { SUPPORT_EMAIL, mailto } from "@/lib/support";

/**
 * The reason picker on /contact.
 *
 * The job here is not to route a ticket — there is no ticket system. It's to
 * make the email that gets sent a *good* email: pre-filled with the right
 * subject, and with the three or four facts that turn "it's broken" into
 * something answerable on the first reply instead of the third.
 *
 * Everything degrades: the address is plain text on the page, every reason is a
 * real <a href="mailto:">, and the first reason is selected on mount so the
 * panel is never empty. Nothing here needs the network.
 */

interface Reason {
  id: string;
  label: string;
  hint: string;
  doodle: string;
  tint: string;
  subject: string;
  /** Body template. Blank lines are where the sender writes. */
  body: string;
  /** What to include, so the first reply can be the answer. */
  include: string[];
  /** Optional extra shown under the checklist for reasons that need it. */
  note?: { h: string; t: string; tone?: "warn" | "good" };
}

const REASONS: Reason[] = [
  {
    id: "broken",
    label: "Something's broken",
    hint: "An error, a page that won't load, a number that's wrong.",
    doodle: "flag",
    tint: "peach",
    subject: "Something's broken",
    body:
      "What I was doing:\n\n\n" +
      "What I expected:\n\n\n" +
      "What happened instead:\n\n\n" +
      "My org (and the page URL):\n\n",
    include: [
      "The URL you were on — it names the org and the page.",
      "What you clicked, and what happened instead.",
      "The exact error text, if there was any. A screenshot is fine.",
      "Whether it happens every time or happened once.",
    ],
  },
  {
    id: "stuck",
    label: "I can't work out how to do something",
    hint: "It's probably possible. It might also genuinely not be yet.",
    doodle: "hand",
    tint: "sky",
    subject: "How do I…",
    body:
      "What I'm trying to do:\n\n\n" +
      "What I've tried:\n\n\n" +
      "My role in the org (president, treasurer, member…):\n\n",
    include: [
      "What you're trying to achieve, not just which button you're hunting for.",
      "Your role in the org — half of \"I can't see it\" is a permission.",
      "Whether you've searched the help centre, so we don't send you back to a page you've read.",
    ],
  },
  {
    id: "setup",
    label: "I'm setting up an org",
    hint: "Getting a real chapter in and running, not a demo.",
    doodle: "plant",
    tint: "butter",
    subject: "Setting up an org",
    body:
      "What kind of org:\n\n" +
      "Roughly how many members:\n\n" +
      "What we're using today (spreadsheet, GroupMe, nothing):\n\n" +
      "What we most need it to fix:\n\n",
    include: [
      "What kind of org, and roughly how many people.",
      "What you're running on today — a spreadsheet, five spreadsheets, someone's memory.",
      "The one thing that would make this worth switching for. That's the part worth designing around.",
    ],
    note: {
      h: "Setting up is meant to take about ten minutes",
      t: "If it's taking longer than that, something is wrong with the flow rather than with you, and that's a useful thing to hear about.",
      tone: "good",
    },
  },
  {
    id: "missing",
    label: "You don't have the thing I need",
    hint: "A feature, an export, a page that doesn't exist yet.",
    doodle: "star",
    tint: "lilac",
    subject: "Feature request",
    body:
      "What I need:\n\n\n" +
      "What I'm doing instead today:\n\n\n" +
      "How often this comes up:\n\n",
    include: [
      "What you need it to do, in the words your org would use.",
      "What you do instead today. The workaround tells us more than the request does.",
      "How often it comes up — once a year at audit is a different problem from every Tuesday.",
    ],
    note: {
      h: "Some gaps are already known",
      t: "Attendance and document exports don't exist yet, and an individual member can't be deleted once they have attendance history. Saying you need one of those still helps — it moves it up.",
      tone: "warn",
    },
  },
  {
    id: "security",
    label: "Security or privacy",
    hint: "A vulnerability, a leak, or something that looks wrong.",
    doodle: "shield",
    tint: "mint",
    subject: "Security report",
    body:
      "What I found:\n\n\n" +
      "How to reproduce it:\n\n\n" +
      "What it exposes:\n\n\n" +
      "Whether it's been disclosed anywhere else:\n\n",
    include: [
      "What you found, and how to reproduce it.",
      "What it exposes, as far as you can tell.",
      "Whether you've told anyone else yet.",
    ],
    note: {
      h: "Please write before disclosing publicly",
      t: "We won't pursue anyone who reports a genuine issue in good faith, and we'll tell you what we did about it. What's actually enforced today is written down in Trust & privacy, including the parts that aren't.",
      tone: "good",
    },
  },
  {
    id: "data",
    label: "My data, or my org's",
    hint: "Access, correction, deletion, or getting it all out.",
    doodle: "export",
    tint: "rose",
    subject: "Data request",
    body:
      "What I'm asking for (access, correction, deletion, export):\n\n\n" +
      "Which org this concerns:\n\n" +
      "The email address on my account:\n\n",
    include: [
      "Which of access, correction, deletion or export you want.",
      "Which org it concerns.",
      "The email address on your account — we may need to verify you control it, usually by having you write from it.",
    ],
    note: {
      h: "Acknowledged within 5 business days, completed within 30",
      t: "That's the shorter of the windows the major privacy laws set. If a request needs longer, we'll say so before the 30 days are up rather than after.",
    },
  },
];

export function ContactPicker() {
  const [active, setActive] = useState<string>(REASONS[0].id);
  const [copied, setCopied] = useState(false);
  const reason = REASONS.find(r => r.id === active) ?? REASONS[0];

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is permission-gated and unavailable over plain http. The
      // address is rendered as selectable text right next to this button, so
      // there's nothing to recover from — leave the label alone.
    }
  }

  return (
    <div className="ct__pick">
      {/* ---- left: what's it about ---- */}
      <div className="ct__reasons" role="radiogroup" aria-label="What's it about?">
        <h5>What&apos;s it about?</h5>
        {REASONS.map(r => (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={r.id === active}
            className={`ct__reason${r.id === active ? " is-on" : ""}`}
            onClick={() => setActive(r.id)}
          >
            <span
              className="ct__ric"
              style={sx({ "--g": `var(--${r.tint}-soft)`, "--gb": `var(--${r.tint})` })}
            >
              <Doodle
                id={r.doodle}
                className="doodle doodle--thin"
                size={18}
                viewBox="0 0 24 24"
                style={sx({ color: `var(--${r.tint}-ink)` })}
              />
            </span>
            <span className="ct__rtx">
              <b>{r.label}</b>
              {r.hint}
            </span>
          </button>
        ))}
      </div>

      {/* ---- right: the email that will get sent ---- */}
      <div className="ct__compose">
        <div className="ct__subject">
          <span className="l">Subject</span>
          <span className="v">{reason.subject}</span>
        </div>

        <h4>What to include</h4>
        <ul className="ct__inc">
          {reason.include.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>

        {reason.note && (
          <aside
            className={`ct__note${reason.note.tone ? ` ct__note--${reason.note.tone}` : ""}`}
          >
            <h5>{reason.note.h}</h5>
            <p>
              {reason.note.t}
              {reason.id === "security" || reason.id === "data" ? (
                <>
                  {" "}
                  <a href="/trust">Read it</a>.
                </>
              ) : null}
            </p>
          </aside>
        )}

        <div className="ct__actions">
          <a className="btn" href={mailto(reason.subject, reason.body)}>
            Write the email{" "}
            <Doodle id="arrow-r" size={16} viewBox="0 0 24 24" />
          </a>
          <button type="button" className="btn btn--ghost" onClick={copyAddress}>
            {copied ? "Copied" : "Copy address"}
          </button>
        </div>
        <p className="ct__addr">
          Or write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>{" "}
          yourself — the template is a convenience, not a requirement.
        </p>
      </div>
    </div>
  );
}
