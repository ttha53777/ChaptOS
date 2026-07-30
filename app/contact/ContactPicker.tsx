"use client";

import { useRef, useState } from "react";
import { Doodle, sx } from "../components/landing/Doodle";
import {
  SUPPORT_EMAIL,
  emailAsText,
  gmailCompose,
  mailto,
  outlookCompose,
} from "@/lib/support";

/**
 * The reason picker and composer on /contact.
 *
 * The job here is not to route a ticket — there is no ticket system, and no
 * server-side sending: this app has no mail dependency and no verified sending
 * domain, so a form that POSTed somewhere would be a dead button wearing a
 * spinner. The job is to make the email the visitor sends a *good* email, and
 * to make sure pressing something always visibly does something.
 *
 * That second half is why this isn't just a mailto: link. A mailto: on a browser
 * with no registered mail handler does nothing at all — silently, unreportably.
 * So the design is:
 *
 *   1. The email is REAL TEXT ON THE PAGE, in an editable textarea. Even if
 *      every button failed, the draft is right there to read and copy. There is
 *      no invisible-failure state left.
 *   2. Sending offers channels that can't silently fail — Gmail and Outlook on
 *      the web are ordinary navigations, and copying needs nothing at all.
 *      mailto: stays, demoted to one of several ways rather than the only one.
 *   3. Every link composes from the LIVE textarea, so a visitor who fills the
 *      template in gets their own words in Gmail, not the blank template.
 *
 * Degradation: with JS off the panel still renders the first reason, its
 * template as the textarea's defaultValue, and working href-bearing links for
 * every channel. Only the reason switching and the copy button need JS.
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

/** Past this, mail clients start truncating mailto: bodies. */
const MAILTO_SAFE_LENGTH = 1500;

/** The article a visitor gave up on, when they arrived from /help/<slug>. */
export interface FromArticle {
  slug: string;
  title: string;
}

export function ContactPicker({ fromArticle = null }: { fromArticle?: FromArticle | null }) {
  // Arriving from a help article opens on "I can't work out how to do something"
  // — which is what being sent here by an article that didn't answer you means.
  const opening = fromArticle
    ? (REASONS.find(r => r.id === "stuck") ?? REASONS[0])
    : REASONS[0];

  // Prepended to whichever template is loaded, so switching reason keeps the
  // context rather than dropping the one fact we already knew.
  const context = fromArticle
    ? `I was reading /help/${fromArticle.slug} and I'm still stuck.\n\n`
    : "";
  const templateFor = (r: Reason) => context + r.body;

  const [active, setActive] = useState<string>(opening.id);
  const [body, setBody] = useState<string>(templateFor(opening));
  /**
   * Which reason's template the current draft was seeded from. Drives the "load
   * the template" offer, which must appear only when the draft belongs to a
   * DIFFERENT reason than the one now selected.
   *
   * Comparing the draft against the template instead would light the offer the
   * moment anyone typed a character — noise for the whole time you're filling
   * the template in, and a button that wipes your work sitting next to the box
   * you're typing in.
   */
  const [seededFrom, setSeededFrom] = useState<string>(opening.id);
  /** idle → nothing pressed; ok → in the clipboard; manual → clipboard refused. */
  const [copyState, setCopyState] = useState<"idle" | "ok" | "manual">("idle");
  /**
   * Which copy shortcut to name in the manual fallback. Resolved when the
   * failure happens rather than at render: sniffing the platform during the
   * first paint would make the server's HTML and the client's disagree, and this
   * state is only reachable from a click, which is comfortably post-hydration.
   */
  const [copyKeys, setCopyKeys] = useState("⌘C");
  const draftRef = useRef<HTMLTextAreaElement>(null);

  const reason = REASONS.find(r => r.id === active) ?? REASONS[0];
  const templateIsStale = seededFrom !== active;
  const longForMailto = body.length > MAILTO_SAFE_LENGTH;

  // Naming the article in the subject is worth a lot at triage time, and this
  // composes for every reason rather than needing a special case per reason.
  const subject = fromArticle
    ? `${reason.subject} (${fromArticle.title})`
    : reason.subject;

  /**
   * Switching reason must not eat something already written. If the draft is
   * still the outgoing reason's untouched template (or empty), swap it for the
   * new one; otherwise keep every word and offer the template as a link.
   */
  function pick(id: string) {
    const next = REASONS.find(r => r.id === id);
    if (!next) return;
    const untouched = body.trim() === templateFor(reason).trim() || body.trim() === "";
    setActive(id);
    if (untouched) {
      setBody(templateFor(next));
      setSeededFrom(id);
    }
    setCopyState("idle");
  }

  /** Replace the draft with the selected reason's template, deliberately. */
  function loadTemplate() {
    setBody(templateFor(reason));
    setSeededFrom(active);
    setCopyState("idle");
  }

  async function copyEmail() {
    const text = emailAsText(subject, body);
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("ok");
      window.setTimeout(() => setCopyState("idle"), 2400);
    } catch {
      // The Clipboard API is permission-gated and absent outside a secure
      // context (a plain-http LAN address during testing, say). Silently doing
      // nothing here is the exact failure this whole page exists to avoid, so
      // select the draft and say which keys to press.
      draftRef.current?.focus();
      draftRef.current?.select();
      setCopyKeys(/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘C" : "Ctrl+C");
      setCopyState("manual");
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
            onClick={() => pick(r.id)}
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
          <span className="v">{subject}</span>
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

        {/* ---- the draft, as real text ---- */}
        <div className="ct__drafthead">
          <label htmlFor="ct-draft">Your email</label>
          {templateIsStale && (
            <button type="button" className="ct__reset" onClick={loadTemplate}>
              Load this template
            </button>
          )}
        </div>
        <textarea
          id="ct-draft"
          ref={draftRef}
          className="ct__draft"
          value={body}
          onChange={e => {
            setBody(e.target.value);
            setCopyState("idle");
          }}
          rows={10}
          spellCheck
          aria-describedby="ct-draft-help"
        />
        <p className="ct__drafthelp" id="ct-draft-help">
          Fill it in here — every button below sends what you&apos;ve actually written, not
          the blank template.
        </p>

        {/* ---- send it ---- */}
        <div className="ct__actions">
          <a
            className="btn"
            href={gmailCompose(subject, body)}
            target="_blank"
            rel="noreferrer noopener"
          >
            Open in Gmail{" "}
            <Doodle id="arrow-r" size={16} viewBox="0 0 24 24" />
          </a>
          <button type="button" className="btn btn--ghost" onClick={copyEmail}>
            {copyState === "ok"
              ? "Copied"
              : copyState === "manual"
                ? `Press ${copyKeys}`
                : "Copy email"}
          </button>
        </div>

        {/* role=status so the copy outcome is announced, not just recoloured. */}
        <p className="ct__copystate" role="status">
          {copyState === "ok" && "Address, subject and message are on your clipboard."}
          {copyState === "manual" &&
            `Your browser blocked the clipboard — the draft is selected, so press ${copyKeys} now.`}
        </p>

        <div className="ct__ways">
          <p>
            Or open it in{" "}
            <a href={mailto(subject, body)}>your mail app</a>,{" "}
            <a
              href={outlookCompose(subject, body, "school")}
              target="_blank"
              rel="noreferrer noopener"
            >
              Outlook for school
            </a>{" "}
            or{" "}
            <a
              href={outlookCompose(subject, body, "personal")}
              target="_blank"
              rel="noreferrer noopener"
            >
              personal Outlook
            </a>
            . It all arrives at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="m">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
          {/* The honest note about the one control that can fail invisibly.
              Better said once, here, than discovered by a visitor who thinks
              the page is broken and gives up. */}
          <p className="ct__caveat">
            <b>If a button looks like it did nothing</b>{" "}— that&apos;s &ldquo;your mail
            app&rdquo; on a computer with no mail app set up. It can&apos;t report the
            failure, so use Gmail or copy instead.
            {longForMailto ? (
              <>
                {" "}
                Your message is also long enough that some mail apps would truncate it;
                Gmail and copy won&apos;t.
              </>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  );
}
