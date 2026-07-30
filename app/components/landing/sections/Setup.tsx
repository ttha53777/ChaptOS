"use client";

import { useEffect, useRef, useState } from "react";
import { Doodle, sx } from "../Doodle";

/**
 * The org-type switcher and the live blueprint sheet it drives.
 *
 * This is the one section that isn't static markup: the mock generated five
 * fragments with innerHTML from the KINDS map, so it becomes real state here.
 * The four templates are real starting shapes, not marketing variants — the
 * pages, the seat names, the vocabulary and the timeline categories each
 * differ, which is the whole point of the section.
 *
 * It auto-rotates once on screen and stops permanently the moment a visitor
 * takes over.
 */

const PAGES = [
  "Dashboard",
  "Timeline",
  "Roster",
  "Meetings",
  "Attendance",
  "Tasks",
  "Treasury",
  "Service",
  "Parties",
  "Announcements",
  "Docs",
] as const;

type Kind = {
  btn: string;
  name: string;
  slug: string;
  kind: string;
  /** The audience page under app/for/ that goes deeper on this shape. */
  guide: { href: string; label: string };
  on: string[];
  words: [string, string][];
  seats: [string, string, string][];
  cats: [string, string][];
  term: string;
  qa: { kind: string[]; beats: string[]; term: string[] };
};

const KINDS: Record<string, Kind> = {
  fraternity: {
    btn: "Fraternity",
    name: "Oozma Kappa",
    slug: "chaptos.app/oozma-kappa",
    kind: "Fraternity / sorority",
    guide: { href: "/for/fraternities-sororities", label: "fraternities & sororities" },
    on: ["Dashboard", "Timeline", "Roster", "Meetings", "Attendance", "Treasury", "Service", "Parties", "Docs"],
    words: [["Member", "Brother"], ["Meetings", "Chapter"], ["Term", "Semester"]],
    seats: [
      ["President", "everything", "rank 100"],
      ["Treasurer", "money + dues", "rank 50"],
      ["Social", "events + parties", "rank 50"],
      ["PR", "social content", "rank 50"],
    ],
    cats: [
      ["Social", "var(--butter-ink)"],
      ["Fundraiser", "var(--mint-ink)"],
      ["Programming", "var(--lilac-ink)"],
      ["Chapter", "var(--sky-ink)"],
    ],
    term: "Fall 2026 · Aug 24 – Dec 12",
    qa: {
      kind: ["Fraternity", "Sorority"],
      beats: ["Weekly meetings", "Dues", "Service hours", "Parties"],
      term: ["Semesters"],
    },
  },
  team: {
    btn: "Club team",
    name: "Club Soccer",
    slug: "chaptos.app/club-soccer",
    kind: "Sports / club team",
    guide: { href: "/for/club-teams", label: "club & intramural teams" },
    on: ["Dashboard", "Timeline", "Roster", "Attendance", "Tasks", "Announcements", "Docs"],
    words: [["Member", "Player"], ["Meetings", "Practice"], ["Term", "Season"]],
    seats: [
      ["Captain", "everything", "rank 100"],
      ["Coach", "roster + attendance", "rank 60"],
      ["Team manager", "comms + tasks", "rank 50"],
    ],
    cats: [
      ["Game", "var(--peach-ink)"],
      ["Practice", "var(--sky-ink)"],
      ["Tournament", "var(--lilac-ink)"],
    ],
    term: "Fall Season · Aug 18 – Nov 22",
    qa: {
      kind: ["Club team"],
      beats: ["Practices", "Games", "Travel forms"],
      term: ["Seasons"],
    },
  },
  service: {
    btn: "Volunteer corps",
    name: "Habitat Chapter",
    slug: "chaptos.app/habitat",
    kind: "Service / volunteer org",
    guide: { href: "/for/service-orgs", label: "service & volunteer orgs" },
    on: ["Dashboard", "Timeline", "Roster", "Meetings", "Attendance", "Tasks", "Treasury", "Service", "Announcements", "Docs"],
    words: [["Meetings", "Service events"], ["Term", "Semester"]],
    seats: [
      ["President", "everything", "rank 100"],
      ["Service chair", "service + events", "rank 50"],
      ["Treasurer", "money", "rank 50"],
      ["Comms chair", "announcements", "rank 50"],
    ],
    cats: [
      ["Service project", "var(--sky-ink)"],
      ["Fundraiser", "var(--mint-ink)"],
      ["Outreach", "var(--butter-ink)"],
    ],
    term: "Fall 2026 · Sep 1 – Dec 15",
    qa: {
      kind: ["Volunteer org"],
      beats: ["Service events", "Logged hours", "Fundraising", "Announcements"],
      term: ["Semesters"],
    },
  },
  arts: {
    btn: "Theatre company",
    name: "Playhouse Co.",
    slug: "chaptos.app/playhouse",
    kind: "Performing arts group",
    guide: { href: "/for/performing-arts", label: "bands, choirs & theatre" },
    on: ["Dashboard", "Timeline", "Roster", "Meetings", "Attendance", "Tasks", "Treasury", "Announcements", "Docs"],
    words: [["Member", "Cast member"], ["Meetings", "Rehearsal"], ["Event", "Rehearsal"]],
    seats: [
      ["Director", "everything", "rank 100"],
      ["Stage manager", "calls + attendance", "rank 60"],
      ["Treasurer", "money", "rank 50"],
      ["Publicity", "social + comms", "rank 50"],
    ],
    cats: [
      ["Performance", "var(--rose-ink)"],
      ["Auditions", "var(--sky-ink)"],
      ["Social", "var(--butter-ink)"],
    ],
    term: "Fall Production · Sep 7 – Dec 5",
    qa: {
      kind: ["Theatre"],
      beats: ["Rehearsals", "Performances", "Dues", "Scripts + scores"],
      term: ["By production"],
    },
  },
};

const ORDER = Object.keys(KINDS);
const SWAP_MS = 200;
const ROTATE_MS = 4200;

function Chips({ list }: { list: string[] }) {
  return (
    <>
      {list.map(t => (
        <span key={t} className="qa__chip picked">
          {t}
        </span>
      ))}
    </>
  );
}

export function Setup() {
  const [current, setCurrent] = useState("fraternity");
  const [swapping, setSwapping] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  // A visitor click stops the rotation for good; the ref is read inside the
  // interval, so it must not be state.
  const touched = useRef(false);
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function swapTo(key: string) {
    setCurrent(prev => {
      if (key === prev) return prev;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return key;
      setSwapping(true);
      swapTimer.current = setTimeout(() => setSwapping(false), SWAP_MS);
      return key;
    });
  }

  function pick(key: string) {
    touched.current = true;
    swapTo(key);
  }

  // Auto-rotate once the section is on screen, until the visitor takes over.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    let interval: ReturnType<typeof setInterval> | null = null;
    let idx = 0;
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (!e.isIntersecting || touched.current) continue;
          io.disconnect();
          interval = setInterval(() => {
            if (touched.current) {
              if (interval) clearInterval(interval);
              return;
            }
            idx = (idx + 1) % ORDER.length;
            swapTo(ORDER[idx]);
          }, ROTATE_MS);
        }
      },
      { threshold: 0.3 },
    );
    io.observe(root);

    return () => {
      io.disconnect();
      if (interval) clearInterval(interval);
      if (swapTimer.current) clearTimeout(swapTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const k = KINDS[current];

  return (
    <section
      className="section setup"
      id="setup"
      ref={rootRef as React.RefObject<HTMLElement>}
    >
      <div className="wrap">
        <div style={{ maxWidth: "720px" }}>
          <span className="eyebrow" style={sx({ "--eb": "var(--butter)" })} data-reveal>
            Before you even sign in
          </span>
          <h2 data-reveal style={sx({ marginTop: "16px", "--d": "60ms" })}>
            You describe the org.
            <br />
            It writes the workspace.
          </h2>
          <p
            className="lede"
            data-reveal
            style={sx({ marginTop: "18px", "--d": "110ms", maxWidth: "60ch" })}
          >
            Setup is a short interview, not a settings tour. Answer what your org actually
            does in a normal month and it drafts the pages, the seats, the words your org
            uses, your timeline categories and your first term — then shows you the whole
            blueprint to edit before anything is built.
          </p>

          <div className="switch" data-reveal style={sx({ "--d": "150ms" })}>
            {ORDER.map(key => (
              <button
                key={key}
                type="button"
                className={key === current ? "on" : undefined}
                onClick={() => pick(key)}
              >
                {KINDS[key].btn}
              </button>
            ))}
          </div>
        </div>

        <div className="setup__grid">
          <div data-reveal>
            <div className="qa">
              <p className="qa__q">What kind of organization is this?</p>
              <div className="qa__row">
                <Chips list={k.qa.kind} />
              </div>

              <p className="qa__q" style={{ marginTop: "8px" }}>
                In a normal month, which of these actually happen?
              </p>
              <div className="qa__row">
                <Chips list={k.qa.beats} />
              </div>

              <p className="qa__q" style={{ marginTop: "8px" }}>
                How does your year break up?
              </p>
              <div className="qa__row">
                <Chips list={k.qa.term} />
              </div>
            </div>

            <p className="setup__fine">
              Free text works too — describe the org in a sentence and it asks the two or
              three specific follow-ups it needs to settle the page set. If the model is
              having a bad day the interview keeps working; it just stops guessing.
            </p>

            <div
              className="sticky-note"
              style={sx({
                "--note": "var(--butter)",
                "--rot": "-1.6deg",
                marginTop: "30px",
                maxWidth: "340px",
              })}
            >
              <b>Sign-in comes last.</b>
              <br />
              <span style={{ fontSize: ".88rem", color: "var(--ink-2)" }}>
                You build the whole thing signed out. Google sign-in happens at the final
                step, and your answers survive the round trip.
              </span>
            </div>
          </div>

          <div data-reveal style={sx({ "--d": "120ms" })}>
            <div className={swapping ? "bp is-swap" : "bp"}>
              <div className="bp__hd">
                <span className="k">{k.name}</span>
                <span className="pill pill--calm">{k.kind}</span>
                <span className="sub mono" style={{ marginLeft: "auto" }}>
                  {k.slug}
                </span>
              </div>

              <div className="bp__sec">
                <p className="bp__t">Pages</p>
                <div className="bp__chips">
                  {PAGES.map(p => (
                    <span key={p} className={k.on.includes(p) ? "chip" : "chip off"}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bp__sec">
                <p className="bp__t">Words your org uses</p>
                <div className="bp__words">
                  {k.words.map(([from, to]) => (
                    <div className="wordrow" key={from}>
                      <span className="from">{from}</span>
                      <Doodle
                        id="arrow-r"
                        size={14}
                        style={sx({ color: "var(--line-2)", flex: "none" })}
                      />
                      <span className="to">{to}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bp__sec">
                <p className="bp__t">Seats</p>
                <div style={{ marginTop: "6px" }}>
                  {k.seats.map(([name, can, rank]) => (
                    <div className="seat" key={name}>
                      <span className="nm">{name}</span>
                      <span className="ab">{can}</span>
                      <span className="rk">{rank}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bp__sec">
                <p className="bp__t">Timeline categories</p>
                <div className="bp__chips">
                  {k.cats.map(([label, color]) => (
                    <span className="chip" key={label}>
                      <i className="sw" style={sx({ "--c": color })} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              <div
                className="bp__sec"
                style={{
                  background: "var(--paper-2)",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <p className="bp__t">First term</p>
                  <p
                    className="mono"
                    style={{ marginTop: "6px", fontSize: ".9rem", fontWeight: 600 }}
                  >
                    {k.term}
                  </p>
                </div>
                <a className="btn btn--sm" style={{ marginLeft: "auto" }} href="/create">
                  Build it
                </a>
              </div>
            </div>

            <p className="dayslide__note" style={{ marginTop: "14px" }}>
              <Doodle id="pencil" style={sx({ color: "var(--butter-ink)" })} />
              <span>
                Every line above is editable on this sheet — and again in Settings, next
                semester, when the org has changed its mind.
              </span>
            </p>

            {/* The way deeper for whichever shape is currently on screen: why
                this page set, the first week, and what it won't do. */}
            <p className="setup__guide">
              <a href={k.guide.href}>
                The full setup for {k.guide.label}
                <Doodle id="arrow-r" size={15} viewBox="0 0 24 24" />
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
