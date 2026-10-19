"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Doodle, sx } from "../components/landing/Doodle";
import {
  SUPPORT_EMAIL,
  emailAsText,
  gmailCompose,
  mailto,
  outlookCompose,
} from "@/lib/support";

/**
 * The letter on /contact: six postage stamps (the reasons), the letter they
 * start, and the "after you send" thread that lights up once it's gone.
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
 *   2. Sending offers channels that can't silently fail — Gmail is the primary
 *      button (every account here is a Google account) and copying needs
 *      nothing at all. mailto: and Outlook are folded under "Other ways", with
 *      the one honest caveat beside them.
 *   3. Every link composes from the LIVE textarea and subject, so a visitor who
 *      fills the template in gets their own words in Gmail, not the blank one.
 *
 * The prompts in each template ("What I was doing:") double as a progress
 * meter: a prompt counts as answered once something is written beneath it, and
 * the "What to include" checklist ticks along with it. That answers "what am I
 * supposed to write?" while the visitor is writing rather than before.
 *
 * Pressing Gmail or Copy postmarks the letter and moves the thread to step one.
 * We can't know the email was actually sent — so the copy says "press Send
 * there", never "sent".
 *
 * Degradation: with JS off the panel still renders the opening reason, its
 * template as the textarea's value, and working href-bearing links for every
 * channel. Only the stamp switching, the menu and the copy buttons need JS.
 */

type Tint = "peach" | "sky" | "butter" | "lilac" | "mint" | "rose";

interface Reason {
  id: string;
  /** The stamp face. */
  short: string;
  hint: string;
  /** Heading over the checklist — the reason in the visitor's own words. */
  label: string;
  doodle: string;
  tint: Tint;
  subject: string;
  /** Body template. Lines ending in ":" are the prompts; blank lines are where the sender writes. */
  body: string;
  /** What to include, so the first reply can be the answer. */
  include: string[];
  /** Optional sticky note shown beside the checklist for reasons that need it. */
  note?: { h: string; t: string; tone: "warn" | "good" | "info"; trust?: boolean };
}

const REASONS: Reason[] = [
  {
    id: "broken",
    short: "Something's broken",
    hint: "An error, a page that won't load, a wrong number.",
    label: "Something's broken",
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
    short: "How do I…",
    hint: "It's probably possible. Or genuinely not yet.",
    label: "I can't work out how to do something",
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
    short: "Setting up an org",
    hint: "Getting a real chapter in and running.",
    label: "I'm setting up an org",
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
    short: "Missing a feature",
    hint: "An export, a page, a thing that doesn't exist yet.",
    label: "You don't have the thing I need",
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
      t: "Attendance and document exports don't exist yet. Saying you need one still helps — it moves it up.",
      tone: "warn",
    },
  },
  {
    id: "security",
    short: "Security or privacy",
    hint: "A vulnerability, a leak, something that looks off.",
    label: "Security or privacy",
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
      trust: true,
    },
  },
  {
    id: "data",
    short: "My data",
    hint: "Access, correction, deletion, or all of it out.",
    label: "My data, or my org's",
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
      tone: "info",
      trust: true,
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

/** Template lines that end in a colon are the prompts the visitor answers. */
const promptsOf = (r: Reason) => r.body.split("\n").filter(l => /:\s*$/.test(l));

/**
 * For each prompt still present in the draft, whether anything is written
 * between it and the next prompt. A prompt the visitor deleted drops out of the
 * count rather than counting against them.
 */
function answered(r: Reason, draft: string): boolean[] {
  const prompts = promptsOf(r);
  const out: boolean[] = [];
  for (const p of prompts) {
    const at = draft.indexOf(p);
    if (at < 0) continue;
    const rest = draft.slice(at + p.length);
    let cut = rest.length;
    for (const o of prompts) {
      const j = rest.indexOf(o);
      if (j >= 0 && j < cut) cut = j;
    }
    out.push(rest.slice(0, cut).trim().length > 0);
  }
  return out;
}

type Sent = null | "gmail" | "other" | "copied";

export function ContactPicker({ fromArticle = null }: { fromArticle?: FromArticle | null }) {
  // Arriving from a help article opens on "How do I…" — which is what being
  // sent here by an article that didn't answer you means.
  const opening = fromArticle
    ? (REASONS.find(r => r.id === "stuck") ?? REASONS[0])
    : REASONS[0];

  // Prepended to whichever template is loaded, so switching reason keeps the
  // context rather than dropping the one fact we already knew.
  const context = fromArticle
    ? `I was reading /help/${fromArticle.slug} and I'm still stuck.\n\n`
    : "";
  const templateFor = (r: Reason) => context + r.body;
  // Naming the article in the subject is worth a lot at triage time.
  const subjectFor = (r: Reason) =>
    fromArticle ? `${r.subject} (${fromArticle.title})` : r.subject;

  const [active, setActive] = useState<string>(opening.id);
  const [body, setBody] = useState<string>(templateFor(opening));
  const [subject, setSubject] = useState<string>(subjectFor(opening));
  /** Once the visitor edits the subject, switching stamps stops overwriting it. */
  const [subjectTouched, setSubjectTouched] = useState(false);
  /**
   * Which reason's template the current draft was seeded from. Drives the "load
   * the template" offer, which must appear only when the draft belongs to a
   * DIFFERENT reason than the one now selected — comparing against the template
   * instead would light it the moment anyone typed a character.
   */
  const [seededFrom, setSeededFrom] = useState<string>(opening.id);
  const [sent, setSent] = useState<Sent>(null);
  /** Bumped on every stamp change so the corner stamp re-runs its drop-in. */
  const [stampKey, setStampKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  /** idle → nothing pressed; ok → in the clipboard; manual → clipboard refused. */
  const [copyState, setCopyState] = useState<"idle" | "ok" | "manual">("idle");
  const [addrCopied, setAddrCopied] = useState(false);
  /**
   * Which copy shortcut to name in the manual fallback. Resolved when the
   * failure happens rather than at render, so the server's HTML and the
   * client's can't disagree.
   */
  const [copyKeys, setCopyKeys] = useState("⌘C");
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const stampsRef = useRef<HTMLDivElement>(null);

  const moreRef = useRef<HTMLDetailsElement>(null);

  // A <details> doesn't close itself on an outside click or Escape; a menu should.
  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("click", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("click", away);
      document.removeEventListener("keydown", esc);
    };
  }, [menuOpen]);

  const reason = REASONS.find(r => r.id === active) ?? REASONS[0];
  const index = REASONS.indexOf(reason);
  const subjectOut = subject.trim() || reason.subject;
  const longForMailto = body.length > MAILTO_SAFE_LENGTH;

  const marks = answered(reason, body);
  const done = marks.filter(Boolean).length;
  const freeform = marks.length === 0 && body.trim().length > 0;
  // Checklist item k ticks with prompt k (they're written in the same order);
  // any extra items tick once every prompt is answered.
  const ticks = reason.include.map((_, k) =>
    marks.length > 0 && (k < marks.length ? marks[k] : done === marks.length),
  );

  /** Any edit after sending un-sends: the postmark belongs to the old text. */
  function edited() {
    setSent(null);
    setCopyState("idle");
  }

  /**
   * Switching reason must not eat something already written. If the draft is
   * still the outgoing reason's untouched template (or empty), swap it for the
   * new one; otherwise keep every word and offer the template as a link.
   */
  function pick(id: string) {
    const next = REASONS.find(r => r.id === id);
    if (!next || id === active) return;
    const untouched = body.trim() === templateFor(reason).trim() || body.trim() === "";
    setActive(id);
    if (untouched) {
      setBody(templateFor(next));
      setSeededFrom(id);
    }
    if (!subjectTouched) setSubject(subjectFor(next));
    setStampKey(k => k + 1);
    edited();
  }

  /** Arrow keys rove the stamp radiogroup, as a native radio set would. */
  function onStampKey(e: KeyboardEvent) {
    const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key];
    if (!step) return;
    e.preventDefault();
    const next = REASONS[(index + step + REASONS.length) % REASONS.length];
    pick(next.id);
    stampsRef.current?.querySelector<HTMLButtonElement>(`[data-id="${next.id}"]`)?.focus();
  }

  function loadTemplate() {
    setBody(templateFor(reason));
    setSeededFrom(active);
    edited();
    draftRef.current?.focus();
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(emailAsText(subjectOut, body));
      setCopyState("ok");
      setSent("copied");
      window.setTimeout(() => setCopyState(s => (s === "ok" ? "idle" : s)), 2400);
    } catch {
      // The Clipboard API is permission-gated and absent outside a secure
      // context. Silently doing nothing here is the exact failure this page
      // exists to avoid, so select the draft and say which keys to press.
      draftRef.current?.focus();
      draftRef.current?.select();
      setCopyKeys(/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘C" : "Ctrl+C");
      setCopyState("manual");
    }
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setAddrCopied(true);
      window.setTimeout(() => setAddrCopied(false), 1800);
    } catch {
      // The address is on screen in full; nothing to select that helps more.
    }
  }

  const status =
    copyState === "manual"
      ? `Your browser blocked the clipboard — the letter is selected, so press ${copyKeys} now.`
      : sent === "gmail"
        ? "Opened in Gmail with your letter filled in — press Send there. If you'd rather not, Copy works from anywhere."
        : sent === "other"
          ? "Opened your letter there — press Send in that window."
          : sent === "copied"
            ? "Address, subject and letter are on your clipboard — paste into any mail app."
            : "";

  const style = sx({
    "--p": `var(--${reason.tint})`,
    "--p-bg": `var(--${reason.tint}-soft)`,
    "--p-fg": `var(--${reason.tint}-ink)`,
  });

  return (
    <>
      {/* ---- the stamps ---- */}
      <div
        className="ct__stamps"
        role="radiogroup"
        aria-label="What's it about?"
        ref={stampsRef}
        onKeyDown={onStampKey}
      >
        {REASONS.map((r, i) => (
          <button
            key={r.id}
            type="button"
            role="radio"
            data-id={r.id}
            aria-checked={r.id === active}
            tabIndex={r.id === active ? 0 : -1}
            className="ct__stp"
            style={sx({
              "--p": `var(--${r.tint})`,
              "--p-bg": `var(--${r.tint}-soft)`,
              "--p-fg": `var(--${r.tint}-ink)`,
            })}
            onClick={() => pick(r.id)}
          >
            <span className="ct__stpin">
              <span className="ct__stptop">
                <Doodle id={r.doodle} className="doodle" viewBox="0 0 24 24" />
                <span className="den">0{i + 1}</span>
              </span>
              <b>{r.short}</b>
              <small>{r.hint}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="ct__desk">
        {/* ---- the letter ---- */}
        <article className={`ct__lt${sent ? " is-sent" : ""}`} style={style}>
          <div className="ct__lthead">
            <div className="ct__fields">
              <div className="ct__fld">
                <span className="l">To</span>
                <div className="ct__to">
                  <span>{SUPPORT_EMAIL}</span>
                  <button
                    type="button"
                    className={`ct__icbtn${addrCopied ? " is-ok" : ""}`}
                    onClick={copyAddress}
                    aria-label={addrCopied ? "Address copied" : "Copy address"}
                  >
                    <Doodle id={addrCopied ? "check" : "copy"} viewBox="0 0 24 24" />
                  </button>
                </div>
              </div>
              <div className="ct__fld">
                <label className="l" htmlFor="ct-subject">Subject</label>
                <input
                  id="ct-subject"
                  autoComplete="off"
                  value={subject}
                  onChange={e => {
                    setSubject(e.target.value);
                    setSubjectTouched(true);
                    edited();
                  }}
                />
              </div>
            </div>

            <div className="ct__ltstamp" key={stampKey} aria-hidden="true">
              <div className="s">
                <div>
                  <Doodle id={reason.doodle} viewBox="0 0 24 24" />
                  <span className="den">0{index + 1}</span>
                </div>
              </div>
              <svg className="ct__pm" viewBox="0 0 120 72" fill="none" stroke="currentColor">
                <circle cx="36" cy="36" r="30" strokeWidth="2.2" />
                <circle cx="36" cy="36" r="23" strokeWidth="1.2" />
                <text x="36" y="39" textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor" stroke="none" letterSpacing="1.2">
                  SENT
                </text>
                <path
                  d="M70 22c8-4 14 4 22 0s14 4 24 0M70 36c8-4 14 4 22 0s14 4 24 0M70 50c8-4 14 4 22 0s14 4 24 0"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>

          {fromArticle && (
            <p className="ct__from">
              <Doodle id="doc" viewBox="0 0 24 24" />
              <span>
                Coming from <a href={`/help/${fromArticle.slug}`}>{fromArticle.title}</a>
                {" "}— it&apos;s already named in the letter.
              </span>
            </p>
          )}

          <div className="ct__ltbody">
            <label htmlFor="ct-draft" className="ct__srl">Your message</label>
            <textarea
              id="ct-draft"
              ref={draftRef}
              className="ct__draft"
              value={body}
              onChange={e => {
                setBody(e.target.value);
                edited();
              }}
              rows={12}
              spellCheck
              aria-describedby="ct-prog"
            />
          </div>

          <div className="ct__prog" id="ct-prog" aria-live="polite">
            <span className="ct__dots" aria-hidden="true">
              {(marks.length ? marks : [freeform]).map((ok, i) => (
                <i key={i} className={ok ? "on" : undefined} />
              ))}
            </span>
            <span>
              {marks.length
                ? `${done} of ${marks.length} answered${done === marks.length ? " — ready to send" : ""}`
                : freeform
                  ? "Written in your own words"
                  : "Empty letter"}
            </span>
            {seededFrom !== active && (
              <button type="button" className="ct__reset" onClick={loadTemplate}>
                Load this stamp&apos;s template
              </button>
            )}
          </div>

          {/* ---- send it ---- */}
          <div className="ct__send">
            <a
              className="btn btn--sm"
              style={sx({ "--btn-shadow": "var(--sky)" })}
              href={gmailCompose(subjectOut, body)}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => setSent("gmail")}
            >
              <Doodle id="send" size={16} viewBox="0 0 24 24" />
              Send with Gmail
            </a>
            <button
              type="button"
              className={`btn btn--sm btn--ghost${copyState === "ok" ? " is-ok" : ""}`}
              style={sx({ "--btn-shadow": "var(--butter)" })}
              onClick={copyEmail}
            >
              <Doodle id={copyState === "ok" ? "check" : "copy"} size={16} viewBox="0 0 24 24" />
              {copyState === "ok" ? "Copied" : copyState === "manual" ? `Press ${copyKeys}` : "Copy email"}
            </button>

            {/* A <details> so "other ways" still opens with JS off. */}
            <details
              ref={moreRef}
              className="ct__more"
              open={menuOpen}
              onToggle={e => setMenuOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary className="ct__morebtn">
                <Doodle id="dots" size={16} viewBox="0 0 24 24" />
                Other ways
              </summary>
              <div className="ct__menu">
                <a
                  href={mailto(subjectOut, body)}
                  onClick={() => {
                    setMenuOpen(false);
                    setSent("other");
                  }}
                >
                  <Doodle id="monitor" size={16} viewBox="0 0 24 24" />
                  <span>Your mail app<small>Apple Mail, Outlook desktop…</small></span>
                </a>
                <a
                  href={outlookCompose(subjectOut, body, "school")}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={() => {
                    setMenuOpen(false);
                    setSent("other");
                  }}
                >
                  <Doodle id="envelope" size={16} viewBox="0 0 24 24" />
                  <span>Outlook for school<small>Your university Microsoft account</small></span>
                </a>
                <a
                  href={outlookCompose(subjectOut, body, "personal")}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={() => {
                    setMenuOpen(false);
                    setSent("other");
                  }}
                >
                  <Doodle id="envelope" size={16} viewBox="0 0 24 24" />
                  <span>Personal Outlook<small>@outlook.com, @hotmail.com</small></span>
                </a>
                {/* The honest note about the one control that can fail invisibly. */}
                <p>
                  &ldquo;Your mail app&rdquo; does nothing on a computer with none set up — and
                  can&apos;t tell us it failed. If nothing opens, use Gmail or Copy.
                  {longForMailto
                    ? " Your letter is also long enough that some mail apps would cut it off."
                    : null}
                </p>
              </div>
            </details>
          </div>

          {/* role=status so the outcome is announced, not just recoloured. */}
          <p
            className={`ct__status${copyState === "manual" || sent === "copied" ? " is-warn" : ""}`}
            role="status"
          >
            {status}
          </p>
        </article>

        {/* ---- the margin: what to include + the reason's note ---- */}
        <aside className="ct__rail">
          <div className="ct__ix" style={style}>
            <div className="ct__ixh">
              <span className="ct__tile">
                <Doodle id={reason.doodle} viewBox="0 0 24 24" />
              </span>
              <h3>{reason.label}</h3>
              <span className="n mono">
                {ticks.filter(Boolean).length}/{reason.include.length}
              </span>
            </div>
            <ul>
              {reason.include.map((t, i) => (
                <li key={i} className={ticks[i] ? "on" : undefined}>{t}</li>
              ))}
            </ul>
            <p className="ct__ixf">Ticks fill in as you answer each prompt in the letter.</p>
          </div>

          {reason.note && (
            <aside className={`ct__sticky ct__sticky--${reason.note.tone}`}>
              <span className="ct__tape" aria-hidden="true" />
              <h4>{reason.note.h}</h4>
              <p>
                {reason.note.t}
                {reason.note.trust ? (
                  <>
                    {" "}
                    <a href="/trust">Read it</a>.
                  </>
                ) : null}
              </p>
            </aside>
          )}
        </aside>
      </div>

      {/* ---- what happens next ---- */}
      <section className="ct__next" aria-labelledby="ct-next-h">
        <div className="ct__sechead">
          <div>
            <span className="eyebrow" style={sx({ "--eb": "var(--mint)" })}>After you send</span>
            <h2 id="ct-next-h">Here&apos;s exactly what happens.</h2>
          </div>
          <p>
            No portal to check and no reference number to keep. The whole conversation lives in
            your own inbox.
          </p>
        </div>
        <ol className="ct__thread">
          <li className={sent ? "is-on" : "is-next"}>
            <span className="num">1</span>
            <div>
              <h3>You send it</h3>
              <p>From any address you like. Your inbox keeps the copy, so there&apos;s nothing to log in to.</p>
              <span className="when">
                {sent === "copied" ? "Paste it into any mail app" : sent ? "Just now" : "Whenever you're ready"}
              </span>
            </div>
          </li>
          <li className={sent ? "is-next" : undefined}>
            <span className="num">2</span>
            <div>
              <h3>A person reads it</h3>
              <p>Someone who can actually change the product — not a triage bot, not a canned macro.</p>
              <span className="when">Usually within a day</span>
            </div>
          </li>
          <li>
            <span className="num">3</span>
            <div>
              <h3>You get a reply</h3>
              <p>
                Straight back to you. Nothing after three business days? Send it again — it was
                missed, not ignored.
              </p>
              <span className="when">From {SUPPORT_EMAIL}</span>
            </div>
          </li>
        </ol>
      </section>
    </>
  );
}
