"use client";

/**
 * Day one, in the real app shell: the greeting, "your first week" (what the
 * charter already did, then what's next), and the one link that brings people
 * in — as a reviewed join, never straight onto the roster.
 *
 * Every step reads live data, so the page stays truthful if revisited: the term
 * step is done because a Semester is active, "bring your people in" turns done
 * once someone besides the founder is on the roster.
 */

import { useState } from "react";
import Link from "next/link";
import { Sidebar, isNavVisible, NAV } from "../../components/Sidebar";
import { PaperIcon } from "../../components/paper/PaperIcon";
import { joinUrl, useActiveInvites } from "../../components/members/InviteLinkSheet";
import { useToast } from "../../components/dashboard/Toast";
import { useChapter } from "../../context/ChapterContext";
import { useVocab } from "../../hooks/useVocab";
import { useOrgPath } from "../../hooks/useOrgPath";
import { useSemesters } from "../../hooks/useActiveSemester";
import { apiErrorMessage } from "../../lib/api";
import "./welcome.css";

const NOUN: Record<string, string> = {
  fraternity: "chapter",
  "generic-club": "club",
  "sports-team": "team",
  "service-org": "org",
  "honor-society": "society",
  "performing-arts": "company",
  "generic-org": "org",
};

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (iso: string) => {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${MON[Number(m) - 1] ?? ""} ${Number(d)}`;
};

interface Step {
  t: string;
  m: string;
  done: boolean;
  href?: string;
}

export function WelcomeFrame() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { currentUser, brotherList, loadedSections, can } = useChapter();
  const v = useVocab();
  const orgPath = useOrgPath();
  const { active: term, loaded: termLoaded } = useSemesters();
  const toast = useToast();
  const canInvite = can("MANAGE_SETTINGS");
  const { links, loaded: linksLoaded, error: linksError, create } = useActiveInvites(canInvite);
  const [making, setMaking] = useState(false);
  const [makeError, setMakeError] = useState<string | null>(null);

  const org = currentUser?.org;
  const workflows = org?.enabledWorkflows ?? [];
  const pageCount = NAV.filter(label => isNavVisible(label, workflows)).length;
  const firstName = (currentUser?.name ?? "").split(/\s+/)[0] || "there";
  const noun = NOUN[org?.orgType ?? ""] ?? "org";
  const meetings = v("Meetings");
  const meetingsOn = isNavVisible("Chapter", workflows);
  const financeOn = isNavVisible("Treasury", workflows);
  const rosterLoaded = loadedSections.has("brothers");
  const othersJoined = rosterLoaded && brotherList.length > 1;

  const steps: Step[] = [
    { t: "Describe your org", m: `${pageCount} pages, your seats and your words — from the interview`, done: true },
    {
      t: "Set the term",
      m: term ? `${term.label} · ${fmtDay(term.startDate)} – ${fmtDay(term.endDate)} — active` : "Pick the term you’re in",
      done: !!term,
      href: term ? undefined : orgPath("/"),
    },
    {
      t: "Bring your people in",
      m: othersJoined ? `${brotherList.length} on the roster` : "Send the link — you approve each request",
      done: othersJoined,
      href: orgPath("/brothers"),
    },
    {
      t: `Schedule your first ${meetings === "Chapter" ? "chapter meeting" : meetings.toLowerCase().replace(/s$/, "")}`,
      m: `It lands on the timeline as ${meetings}`,
      done: false,
      href: orgPath(meetingsOn ? "/chapter" : "/timeline"),
    },
  ];
  if (financeOn) {
    steps.push({
      t: `Set this term’s ${v("Dues").toLowerCase()}`,
      m: `One amount, one due date — ${v("Treasury")} does the rest`,
      done: false,
      href: orgPath("/treasury"),
    });
  }
  const doneCount = steps.filter(s => s.done).length;
  const nextIdx = steps.findIndex(s => !s.done);

  const link = links[0] ?? null;

  async function makeLink() {
    setMaking(true);
    setMakeError(null);
    try {
      await create();
    } catch (e) {
      setMakeError(apiErrorMessage(e, "Couldn’t make a link — try again."));
    } finally {
      setMaking(false);
    }
  }

  function copy(url: string) {
    navigator.clipboard.writeText(url).then(
      () => toast.success("Invite link copied"),
      () => setMakeError("Couldn’t copy — select the link and copy it by hand."),
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[color:var(--paper)]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeSection="Dashboard" onNavClick={() => {}} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="toolbar-frosted dash-toolbar relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-[rgba(var(--ink-rgb),0.05)] px-4 sm:px-6 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="tb-icon-btn flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--muted)] hover:bg-[rgba(var(--ink-rgb),0.07)]"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="truncate text-sm font-semibold">{org?.name ?? ""}</span>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="ocw">
            {/* Every line below is derived from the org and its term, so nothing
                renders until both have loaded — a half-loaded frame would greet
                "there" and count steps it hasn't checked. */}
            {!org || !termLoaded ? (
              <div className="wrap" aria-busy="true">
                <span className="skel skel--k" />
                <span className="skel skel--h" />
                <span className="skel skel--p" />
              </div>
            ) : (
            <div className="wrap">
              <p className="kick">
                {term?.label ?? org?.name ?? ""} <span className="chip">day one</span>
              </p>
              <h1 className="greet">
                <span>Welcome to {org?.name ?? "your org"},</span>{" "}
                <span className="hi">{firstName}.</span>
                <span className="wave" aria-hidden="true">
                  <PaperIcon name="hand" className="wv" />
                </span>
              </h1>
              <p className="digest">
                Your charter’s filed. <b>{doneCount} of {steps.length}</b> first-week steps are already done
                {othersJoined ? (
                  <> — next up: {steps[nextIdx]?.t.toLowerCase() ?? "nothing, you’re set"}.</>
                ) : (
                  <>
                    {" "}— the next one is the one that matters: a workspace with one person in it isn’t much of a {noun}.
                  </>
                )}
              </p>

              <div className="fe-grid">
                <section className="card">
                  <div className="card-h">
                    <span className="tile t-butter">
                      <PaperIcon name="flag" className="ic" />
                    </span>
                    <h3>Your first week</h3>
                  </div>
                  <div className="card-b">
                    <ol className="fw">
                      {steps.map((s, i) => {
                        const cls = s.done ? "done" : i === nextIdx ? "next" : "";
                        const body = (
                          <>
                            <span className="tk">{s.done ? <PaperIcon name="check" className="ic" /> : i + 1}</span>
                            <span>
                              <span className="t">{s.t}</span>
                              <span className="m">{s.m}</span>
                            </span>
                            {s.done ? (
                              <span className="pill t-mint">Done</span>
                            ) : i === nextIdx ? (
                              <span className="pill t-butter">Next</span>
                            ) : (
                              <PaperIcon name="chev-r" className="ic go" />
                            )}
                          </>
                        );
                        return (
                          <li key={s.t} className={cls}>
                            {s.href && !s.done ? <Link href={s.href}>{body}</Link> : <div>{body}</div>}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </section>

                <aside>
                  <div className="inv">
                    <p className="k">Bring your people in</p>
                    <h4>One link for the whole {noun}</h4>
                    <p>Drop it in the group chat. Opening it doesn’t put anyone on the roster — it asks to join.</p>
                    {!canInvite ? (
                      <p className="rv">Ask whoever runs {org?.name ?? "the org"} for the invite link.</p>
                    ) : link ? (
                      <div className="linkchip">
                        <code title={joinUrl(link.token)}>{joinUrl(link.token).replace(/^https?:\/\//, "")}</code>
                        <button type="button" className="btn btn--sm" onClick={() => copy(joinUrl(link.token))}>
                          <PaperIcon name="copy" className="ic" />
                          Copy
                        </button>
                      </div>
                    ) : (
                      <button type="button" className="btn makelink" disabled={!linksLoaded || making} onClick={() => void makeLink()}>
                        <PaperIcon name="link" className="ic" />
                        {making ? "Making the link…" : "Make the invite link"}
                      </button>
                    )}
                    {(makeError || linksError) && <p className="err">{makeError ?? linksError}</p>}
                    {link?.expiresAt && (
                      <p className="exp">
                        Works until {fmtDay(link.expiresAt)} · manage links on {v("Member", true)}
                      </p>
                    )}
                    <p className="rv">
                      <PaperIcon name="eye" className="ic" />
                      <span>
                        Each request waits for you on {v("Member", true)}. Approve it, and they’re on the roster,
                        ready for a seat.
                      </span>
                    </p>
                  </div>

                  <div className="out">
                    <Link href={orgPath("/")}>
                      <PaperIcon name="home" className="ic" />
                      Go to your dashboard
                      <PaperIcon name="arrow-r" className="ic" />
                    </Link>
                    <Link href={orgPath("/settings")}>
                      <PaperIcon name="gear" className="ic" />
                      Change anything from the charter in Settings
                      <PaperIcon name="arrow-r" className="ic" />
                    </Link>
                  </div>
                </aside>
              </div>
            </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
