"use client";

import { useEffect, useRef, useState } from "react";
import {
  BILLING_BANDS,
  SELF_SERVE_MAX,
  formatPrice,
  formatRange,
  tierForCount,
} from "@/lib/billing/tiers";
import { BrandMark } from "./DoodleSprite";

const FREE_BAND = BILLING_BANDS[0];

export function MobileDemoTask() {
  const [done, setDone] = useState(false);
  return (
    <div className={`task${done ? " done" : ""}`}>
      <button
        className="check"
        aria-label={`${done ? "Reopen" : "Mark"} fall budget${done ? "" : " as done"} in demo`}
        aria-pressed={done}
        onClick={() => setDone(!done)}
      />
      <div>
        <b>Send the fall budget</b>
        <small aria-live="polite">
          {done
            ? "Done · one less thing on your list"
            : "Needs you · Treasurer"}
        </small>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    id: "money",
    label: "The money",
    title: "Every dollar, accounted for.",
    tag: "Treasury",
    rows: [
      ["Semester dues", "$4,820 in", "of $6,300 collected"],
      ["Service supplies", "$84.20", "Reimbursement · needs review"],
      ["Org balance", "$12,480", "One shared view of the books"],
    ],
    foot: "Know what’s in, what’s owed, and what needs your OK.",
  },
  {
    id: "plans",
    label: "The plans",
    title: "Next up? Already here.",
    tag: "Timeline",
    rows: [
      ["Chapter meeting", "TUE 7 PM", "Student union · Room 204"],
      ["Park cleanup", "SAT 9 AM", "Service · Riverside Park"],
      ["Fall budget", "FRI", "Task · Treasurer"],
    ],
    foot: "Meetings, events, and deadlines. One shared rhythm.",
  },
  {
    id: "people",
    label: "The people",
    title: "People, not spreadsheet rows.",
    tag: "Roster",
    rows: [
      ["Priya Shah", "Treasurer", "Officer · Oozma Kappa"],
      ["Nia Brooks", "Member", "Service committee"],
      ["Join requests", "2 pending", "An officer reviews every new member"],
    ],
    foot: "A shared roster, with the right access for each role.",
  },
] as const;

export function MobileFeatureTour() {
  const [selected, setSelected] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const feature = FEATURES[selected];
  return (
    <>
      <div
        className="tabs"
        role="tablist"
        aria-label="Explore product examples"
      >
        {FEATURES.map((item, index) => (
          <button
            key={item.id}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            id={`mobile-tab-${item.id}`}
            role="tab"
            aria-selected={selected === index}
            tabIndex={selected === index ? 0 : -1}
            aria-controls="mobile-feature"
            onClick={() => setSelected(index)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % FEATURES.length
                  : event.key === "ArrowLeft"
                    ? (index + FEATURES.length - 1) % FEATURES.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? FEATURES.length - 1
                        : null;
              if (next !== null) {
                event.preventDefault();
                setSelected(next);
                buttons.current[next]?.focus();
              }
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        className="feature-card"
        id="mobile-feature"
        role="tabpanel"
        aria-labelledby={`mobile-tab-${feature.id}`}
        tabIndex={0}
      >
        <div className="feature-head">
          <span className="mono">Example org</span>
          <span className="badge">{feature.tag}</span>
        </div>
        <h3>{feature.title}</h3>
        {feature.rows.map(([title, value, detail]) => (
          <div className="listrow" key={title}>
            <div>
              <strong>{title}</strong>
              <small>{detail}</small>
            </div>
            <span>{value}</span>
          </div>
        ))}
        <p className="feature-foot">{feature.foot}</p>
      </div>
    </>
  );
}

export function MobileAskDemo() {
  const [question, setQuestion] = useState<"dues" | "week">("dues");
  return (
    <>
      <div className="question-options" aria-label="Choose an example question">
        <button
          aria-pressed={question === "dues"}
          onClick={() => setQuestion("dues")}
        >
          Who still owes dues?
        </button>
        <button
          aria-pressed={question === "week"}
          onClick={() => setQuestion("week")}
        >
          What’s on this week?
        </button>
      </div>
      <div className="answer">
        <div className="answer-name">
          <BrandMark />
          Chapt <span className="demo-label">EXAMPLE ANSWER</span>
        </div>
        <div aria-live="polite">
          {question === "dues" ? (
            <>
              <p>
                <strong>$1,480 is still outstanding</strong> this semester.
                You’ve collected $4,820 of the $6,300 due.
              </p>
              <p>I can help draft a reminder for your review.</p>
            </>
          ) : (
            <>
              <p>
                <strong>Chapter on Tuesday. Service on Saturday.</strong> Your
                chapter meeting is at 7 PM in the student union; park cleanup
                starts at 9 AM.
              </p>
              <p>The fall budget is due Friday, too.</p>
            </>
          )}
        </div>
        <details className="source" key={question}>
          <summary>
            From:{" "}
            {question === "dues" ? "semester dues records" : "timeline + tasks"}
          </summary>
          <p>
            {question === "dues"
              ? "Demo dues ledger: $6,300 assessed − $4,820 collected = $1,480 outstanding."
              : "Demo timeline: Tuesday chapter, 7 PM; Saturday cleanup, 9 AM. Demo task: fall budget, due Friday."}
          </p>
        </details>
      </div>
      <noscript>
        <p className="feature-foot">
          These are example records.{" "}
          <a href="/help">Explore how Chapt works.</a>
        </p>
      </noscript>
    </>
  );
}

export function MobilePricing() {
  // Native range inputs remain draggable without JS. Keep the server-rendered
  // estimate fixed until React can update its headcount, price, and destination.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [members, setMembers] = useState(25);
  const band = tierForCount(members);
  const custom = band.priceCents === null;
  return (
    <>
      <div className="price-card">
        <label className="price-line" htmlFor="mobile-members">
          How many people?
          <output id="mobile-member-count" htmlFor="mobile-members">
            {members} {members === 1 ? "member" : "members"}
          </output>
        </label>
        <input
          id="mobile-members"
          type="range"
          disabled={!ready}
          min={1}
          max={SELF_SERVE_MAX + 30}
          value={members}
          onChange={(event) => setMembers(Number(event.target.value))}
          aria-valuetext={`${members} members, ${custom ? "custom quote" : `${formatPrice(band.priceCents)} per month`}`}
          aria-describedby="mobile-price-detail"
        />
        <div className="range-ends">
          <span>1 person</span>
          <span>{SELF_SERVE_MAX + 30} people</span>
        </div>
        <div className="amount" aria-live="polite">
          <span>{custom ? "Let’s talk" : formatPrice(band.priceCents)}</span>{" "}
          {!custom && <small>/ month</small>}
        </div>
        <p id="mobile-price-detail" className="price-detail">
          {formatRange(band)} ·{" "}
          {custom
            ? "a quote for your org"
            : band.priceCents === 0
              ? "no card needed"
              : "for the whole org"}
        </p>
        <a className="primary" href={custom ? "/contact" : "/create"}>
          {custom
            ? "Talk about your org"
            : `Start with your first ${FREE_BAND.upTo} — free`}{" "}
          <span aria-hidden="true">↗</span>
        </a>
      </div>
      <noscript>
        <p className="price-caption">
          The example above is for 25 people. All monthly rates are listed below.
        </p>
      </noscript>
      <p className="price-caption">
        {BILLING_BANDS.map(
          (item) =>
            `${item.upTo === null ? `${item.from}+` : `${item.from}–${item.upTo}`} ${item.priceCents === null ? "custom" : item.priceCents === 0 ? "free" : formatPrice(item.priceCents)}`,
        ).join(" · ")}
      </p>
      <p className="price-caption">
        <a href="/pricing">Full pricing details ↗</a>
      </p>
    </>
  );
}

export function MobileDock() {
  const [visible, setVisible] = useState(false);
  const dockRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    // Include wrapped text and the device safe area rather than assuming a
    // fixed bar height. CSS only reserves this clearance while the bar is shown.
    const root = document.documentElement;
    const property = "--mobile-landing-dock-height";
    const measure = () => root.style.setProperty(property, `${dock.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(dock, { box: "border-box" });
    return () => {
      observer.disconnect();
      root.style.removeProperty(property);
    };
  }, []);
  useEffect(() => {
    const media = matchMedia("(max-width: 767px)");
    let disconnect = () => {};
    const sync = () => {
      disconnect();
      setVisible(false);
      if (!media.matches) return;
      const hero = document.getElementById("mobile-hero-cta");
      const closing = document.getElementById("mobile-closing");
      if (!hero || !closing) return;
      let heroPassed = false;
      let closingVisible = false;
      const update = () => setVisible(heroPassed && !closingVisible);
      const heroObserver = new IntersectionObserver(([entry]) => {
        heroPassed = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        update();
      });
      const closingObserver = new IntersectionObserver(
        ([entry]) => {
          closingVisible = entry.isIntersecting;
          update();
        },
        { threshold: 0.1 },
      );
      heroObserver.observe(hero);
      closingObserver.observe(closing);
      disconnect = () => {
        heroObserver.disconnect();
        closingObserver.disconnect();
      };
    };
    sync();
    media.addEventListener("change", sync);
    return () => {
      disconnect();
      media.removeEventListener("change", sync);
    };
  }, []);
  return (
    <aside
      ref={dockRef}
      className={`dock${visible ? " visible" : ""}`}
      aria-label="Get started"
      inert={!visible}
    >
      <p>
        <b>Your org, together.</b>
        <br />
        Free for your first {FREE_BAND.upTo}.
      </p>
      <a className="primary" href="/create">
        Get started <span aria-hidden="true">↗</span>
      </a>
    </aside>
  );
}
