import { Doodle, sx } from "../Doodle";
import { Sep, ShotBar } from "./shot";

/**
 * The three claims a single Tuesday structurally can't make, because all three
 * are about accumulation over a term: money reconciling across two ledgers, a
 * member's whole story in one row, and an org that doesn't reset every May.
 * The long tail is one prose line at the bottom, not an eight-cell grid — the
 * dial already showed six real product screens and these show three more, so a
 * catalogue would be proving something already proved.
 */

const TABS = [
  { id: "money", icon: "wallet", label: "Treasury, dues & budget" },
  { id: "people", icon: "people", label: "Roster, standing & roles" },
  { id: "record", icon: "folder", label: "Docs, activity & terms" },
] as const;

export function Modules() {
  return (
    <section className="section" id="modules">
      <div className="wrap">
        <div className="modules__head">
          <span className="eyebrow" style={sx({ "--eb": "var(--mint)" })} data-reveal>
            The part a Tuesday can&apos;t show you
          </span>
          <h2 data-reveal style={sx({ marginTop: "16px", "--d": "60ms" })}>
            A day runs itself.
            <br />A semester is what piles up.
          </h2>
          <p
            className="lede"
            data-reveal
            style={sx({ marginTop: "18px", "--d": "110ms", maxWidth: "62ch" })}
          >
            Every moment on that dial took one person a few seconds. These three are what
            those seconds add up to by April — the money, the people and the record — and
            what the next board opens on their first day.
          </p>
        </div>
      </div>

      {/* The three surfaces share one stage — a tab per surface rather than three
          screen-tall blocks stacked. Server-rendered with the first panel on;
          modtabs() in LandingMotion swaps them. With JS off the noscript rule in
          LandingPage shows all three. */}
      <div className="wrap modtabs" role="tablist" aria-label="What piles up over a term" data-reveal>
        {TABS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`modtab-${t.id}`}
            aria-controls={`modpanel-${t.id}`}
            aria-selected={i === 0}
            className={i === 0 ? "modtab is-on" : "modtab"}
            data-modtab={i}
          >
            <Doodle id={t.icon} size={15} /> {t.label}
          </button>
        ))}
      </div>

      <div className="moddeck">
      {/* ---- module 1: money ---- */}
      <div className="mod is-on" role="tabpanel" id="modpanel-money" aria-labelledby="modtab-money" data-modpanel={0}>
        <div className="wrap mod__grid">
          <div className="mod__copy">
            <h3 data-reveal style={sx({ "--d": "50ms" })}>
              Two sets of books that can&apos;t disagree.
            </h3>

            <div
              className="mod__pain"
              data-reveal
              style={sx({
                "--d": "90ms",
                "--pain-bg": "var(--peach-soft)",
                "--pain-bd": "#F8D2C2",
              })}
            >
              &quot;Someone Venmo&apos;d $70 with a pizza emoji. Dues are $140. Is that
              half, or a different thing entirely? And did I ever write down the $84 I paid
              back?&quot;
              <span className="src">— every treasurer, week three</span>
            </div>

            <p className="mod__fix" data-reveal style={sx({ "--d": "130ms" })}>
              A running balance for every member, and one ledger for the whole org — wired
              together so they move at the same time. A dues payment or a reimbursement is a{" "}
              <em>request</em> until a treasurer approves it; approval mints the matching row
              and adjusts the balance in a single write. Nothing gets hard-deleted.
            </p>
          </div>

          <div className="mod__stage" data-para data-speed="-0.045">
            <figure className="shot" data-reveal="scale">
              <ShotBar
                path={
                  <>
                    Treasury <Sep /> Overview <Sep /> Fall 2026
                  </>
                }
              />
              <div className="shot__body">
                <div className="shot__toolbar">
                  <span className="shot__title">The ledger</span>
                  <span className="pill pill--paid">
                    <i className="dot" />
                    +$340 this week
                  </span>
                  <span className="shot__spacer" />
                  <span className="shot__tabs">
                    <span className="on">Overview</span>
                    <span>Budget</span>
                    <span>Reimbursements</span>
                  </span>
                </div>

                <div className="ui-meas" style={{ marginTop: "2px" }}>
                  <div className="meas">
                    <p className="meas__l">Balance</p>
                    <p className="meas__v">$4,820</p>
                    <p className="meas__d">→ $6,266 proj.</p>
                  </div>
                  <div className="meas">
                    <p className="meas__l">Income</p>
                    <p className="meas__v">$5,940</p>
                    <p className="meas__d">11 txns</p>
                  </div>
                  <div className="meas">
                    <p className="meas__l">Expenses</p>
                    <p className="meas__v">$1,120</p>
                    <p className="meas__d">$300 scheduled</p>
                  </div>
                  <div className="meas">
                    <p className="meas__l">Dues out</p>
                    <p className="meas__v">$1,480</p>
                    <p className="meas__d up">9 owing</p>
                  </div>
                </div>

                <div className="ui-table ui-table--4" style={{ marginTop: "14px" }}>
                  <div className="ui-th">
                    <span>Entry</span>
                    <span>Category</span>
                    <span>Date</span>
                    <span>Amount</span>
                  </div>
                  <div className="ui-tr">
                    <span className="who">
                      <i className="avatar avatar--sm" style={sx({ "--av": "var(--sky)" })}>DO</i>
                      Dues — Dev Okafor
                    </span>
                    <span className="txt">Dues</span>
                    <span className="txt mono">Oct 13</span>
                    <span className="amt">+$75.00</span>
                  </div>
                  <div className="ui-tr is-flagged">
                    <span className="who">
                      <i className="avatar avatar--sm" style={sx({ "--av": "var(--mint)" })}>NB</i>
                      Service supplies
                    </span>
                    <span className="txt">Service</span>
                    <span className="txt mono">Oct 12</span>
                    <span className="amt">−$84.20</span>
                  </div>
                  <div className="ui-tr">
                    <span className="who">
                      <i className="avatar avatar--sm" style={sx({ "--av": "var(--butter)" })}>FF</i>
                      Fall social — door
                    </span>
                    <span className="txt">Events</span>
                    <span className="txt mono">Oct 11</span>
                    <span className="amt">+$210.00</span>
                  </div>
                </div>

                <p className="ui-note">
                  <Doodle id="receipt" size={15} />
                  <span>
                    1 reimbursement waiting on you — approving posts the expense <b>and</b>{" "}
                    moves the balance, one write
                  </span>
                </p>
              </div>
            </figure>

            <div
              className="callout"
              data-reveal
              style={sx({ top: "-26px", right: "-22px", "--co": "var(--peach)", "--d": "220ms" })}
            >
              <b>The pizza-emoji problem, solved.</b>{" "}
              Money arrives attached to a person, not to somebody&apos;s memory.
            </div>
          </div>
        </div>
      </div>

      {/* ---- module 2: people ---- */}
      <div className="mod" role="tabpanel" id="modpanel-people" aria-labelledby="modtab-people" data-modpanel={1}>
        <div className="wrap mod__grid">
          <div className="mod__copy">
            <h3 data-reveal style={sx({ "--d": "50ms" })}>
              Everyone&apos;s whole story, one row each.
            </h3>

            <div
              className="mod__pain"
              data-reveal
              style={sx({
                "--d": "90ms",
                "--pain-bg": "var(--sky-soft)",
                "--pain-bd": "#CCDFFB",
              })}
            >
              &quot;Three misses and you&apos;re out — that&apos;s the policy. Nobody can
              prove who&apos;s at three, so the policy has never once been enforced.&quot;
              <span className="src">— secretary, 90-member org</span>
            </div>

            <p className="mod__fix" data-reveal style={sx({ "--d": "130ms" })}>
              Attendance, dues, service hours, GPA and anything else you decide to track, per
              member, per term — with the bands you set for on-track, watch, and at-risk. Open
              anyone and you get their history, not a number somebody typed.
            </p>
          </div>

          <div className="mod__stage" data-para data-speed="-0.045">
            <figure className="shot" data-reveal="scale">
              <ShotBar
                path={
                  <>
                    Brotherhood <Sep /> Roster <Sep /> Fall 2026
                  </>
                }
              />
              <div className="shot__body">
                <div className="shot__toolbar">
                  <span className="shot__title">Roster</span>
                  <span className="pill pill--info">52 members · 7 seats</span>
                  <span className="shot__spacer" />
                  <span className="shot__tabs">
                    <span className="on">All</span>
                    <span>At risk</span>
                    <span>Exec</span>
                  </span>
                </div>

                <div className="ui-table ui-table--4" style={{ marginTop: 0 }}>
                  <div className="ui-th">
                    <span>Member</span>
                    <span>Seat</span>
                    <span>Attendance</span>
                    <span>Dues</span>
                  </div>
                  <div className="ui-tr">
                    <span className="who">
                      <i className="avatar avatar--sm" style={sx({ "--av": "var(--butter)" })}>AC</i>
                      Ana Chen
                    </span>
                    <span className="txt">
                      <span className="pill pill--part">President</span>
                    </span>
                    <span className="txt mono">100%</span>
                    <span>
                      <span className="pill pill--paid">
                        <i className="dot" />
                        Paid
                      </span>
                    </span>
                  </div>
                  <div className="ui-tr">
                    <span className="who">
                      <i className="avatar avatar--sm" style={sx({ "--av": "var(--sky)" })}>DO</i>
                      Dev Okafor
                    </span>
                    <span className="txt">
                      <span className="pill pill--info">Treasurer</span>
                    </span>
                    <span className="txt mono">94%</span>
                    <span>
                      <span className="pill pill--part">
                        <i className="dot" />
                        Plan
                      </span>
                    </span>
                  </div>
                  <div className="ui-tr is-flagged">
                    <span className="who">
                      <i className="avatar avatar--sm" style={sx({ "--av": "var(--lilac)" })}>JT</i>
                      Jordan Tao
                    </span>
                    <span className="txt">—</span>
                    <span className="txt mono">75%</span>
                    <span>
                      <span className="pill pill--due">
                        <i className="dot" />
                        $140
                      </span>
                    </span>
                  </div>
                  <div className="ui-tr">
                    <span className="who">
                      <i className="avatar avatar--sm" style={sx({ "--av": "var(--mint)" })}>NB</i>
                      Nia Brooks
                    </span>
                    <span className="txt">
                      <span className="pill pill--calm">Service chair</span>
                    </span>
                    <span className="txt mono">97%</span>
                    <span>
                      <span className="pill pill--paid">
                        <i className="dot" />
                        Paid
                      </span>
                    </span>
                  </div>
                </div>

                <div className="ui-meas" style={{ marginTop: "14px" }}>
                  <div className="meas">
                    <p className="meas__l">Service hrs</p>
                    <p className="meas__v">14 / 12</p>
                    <p className="meas__d up">on track</p>
                  </div>
                  <div className="meas">
                    <p className="meas__l">GPA</p>
                    <p className="meas__v">3.42</p>
                    <p className="meas__d">steady</p>
                  </div>
                  <div className="meas">
                    <p className="meas__l">Section</p>
                    <p className="meas__v" style={{ fontSize: "1rem" }}>
                      Trumpet
                    </p>
                    <p className="meas__d">custom field</p>
                  </div>
                  <div className="meas">
                    <p className="meas__l">Standing</p>
                    <p className="meas__v" style={{ fontSize: "1rem" }}>
                      Watch
                    </p>
                    <p className="meas__d dn">2 of 8 missed</p>
                  </div>
                </div>

                <p
                  className="ui-note"
                  style={{
                    background: "var(--butter-soft)",
                    borderColor: "#F4DFA6",
                    color: "var(--butter-ink)",
                  }}
                >
                  <Doodle id="key" size={15} />
                  <span>
                    Treasurer sees money + roster · Service chair sees her committee ·{" "}
                    <b>nobody sees more than their seat</b>
                  </span>
                </p>
              </div>
            </figure>

            <div
              className="callout"
              data-reveal
              style={sx({ bottom: "-42px", left: "-32px", "--co": "var(--sky)", "--d": "220ms" })}
            >
              <b>Standing stops being a rumor.</b> The policy finally has a number behind it.
            </div>
          </div>
        </div>
      </div>

      {/* ---- module 3: the record ---- */}
      <div className="mod" role="tabpanel" id="modpanel-record" aria-labelledby="modtab-record" data-modpanel={2}>
        <div className="wrap mod__grid">
          <div className="mod__copy">
            <h3 data-reveal style={sx({ "--d": "50ms" })}>
              The org shouldn&apos;t reset every May.
            </h3>

            <div
              className="mod__pain"
              data-reveal
              style={sx({
                "--d": "90ms",
                "--pain-bg": "var(--butter-soft)",
                "--pain-bd": "#F4DFA6",
              })}
            >
              &quot;Everything our last president knew — the vendor, the form, the deadline,
              the login — left with her. We rebuilt it from scratch. Badly.&quot;
              <span className="src">— incoming exec board, spring transition</span>
            </div>

            <p className="mod__fix" data-reveal style={sx({ "--d": "130ms" })}>
              Bylaws, forms, vendor links and minutes live in a foldered library anyone can
              search. Every change writes an entry with who and when. Terms archive instead of
              vanishing — last year is still readable while this year starts clean.
            </p>
          </div>

          <div className="mod__stage" data-para data-speed="-0.045">
            <figure className="shot" data-reveal="scale">
              <ShotBar
                path={
                  <>
                    Docs <Sep /> Library
                  </>
                }
              />
              <div className="shot__body">
                <div className="shot__toolbar">
                  <span className="shot__title">Library</span>
                  <span className="pill pill--info">4 folders · 38 links</span>
                  <span className="shot__spacer" />
                  <span className="shot__tabs">
                    <span className="on">Newest</span>
                    <span>Name</span>
                    <span>Kind</span>
                  </span>
                </div>

                <div className="ui-docs" style={{ marginTop: 0 }}>
                  <div className="doccard">
                    <p className="fd">
                      <Doodle id="folder" style={sx({ color: "var(--butter-ink)" })} />
                      Governance
                    </p>
                    <p className="nm">Chapter bylaws (2026 rev.)</p>
                    <p className="by">pinned · added by Ana C.</p>
                  </div>
                  <div className="doccard">
                    <p className="fd">
                      <Doodle id="folder" style={sx({ color: "var(--sky-ink)" })} />
                      Forms
                    </p>
                    <p className="nm">Campus event request</p>
                    <p className="by">used 9× this term</p>
                  </div>
                  <div className="doccard">
                    <p className="fd">
                      <Doodle id="folder" style={sx({ color: "var(--mint-ink)" })} />
                      Vendors
                    </p>
                    <p className="nm">Formal venue — contract + contact</p>
                    <p className="by">added by Priya S.</p>
                  </div>
                </div>

                <div className="ui-log" style={{ marginTop: "16px" }}>
                  <div className="logrow">
                    <span className="ts">Oct 14</span>
                    <span className="tx">
                      Minutes published — <b>General Meeting</b>
                    </span>
                    <span className="pill pill--calm">Priya S.</span>
                  </div>
                  <div className="logrow">
                    <span className="ts">Oct 13</span>
                    <span className="tx">Bylaws replaced — v2026.1</span>
                    <span className="pill pill--calm">Ana C.</span>
                  </div>
                  <div className="logrow">
                    <span className="ts">Oct 11</span>
                    <span className="tx">Spring 2026 archived — 41 events, 214 records</span>
                    <span className="pill">term</span>
                  </div>
                </div>

                <p
                  className="ui-note"
                  style={{
                    background: "var(--mint-soft)",
                    borderColor: "#BDE7D2",
                    color: "var(--mint-ink)",
                  }}
                >
                  <Doodle id="export" size={15} />
                  <span>
                    Roster, ledger, attendance and docs export to CSV any time —{" "}
                    <b>including on the way out</b>
                  </span>
                </p>
              </div>
            </figure>

            <div
              className="callout"
              data-reveal
              style={sx({ bottom: "-26px", right: "-22px", "--co": "var(--butter)", "--d": "220ms" })}
            >
              <b>Year four still works.</b> The org keeps its memory even when everyone
              graduates.
            </div>
          </div>
        </div>
      </div>

      </div>

      {/* ---- the rest, in a line ---- */}
      <div className="wrap">
        <p className="mod__rest" data-reveal>
          Plus tasks, polls, service hours, party books, a social calendar, role permissions,
          several orgs on one login, and a phone app that isn&apos;t a squeezed dashboard. A
          12-person committee and a 200-member chapter run the same pages — just fewer of
          them, and turning one on mid-term doesn&apos;t cost you the history.{" "}
          <a href="/create">
            See every page <Doodle id="arrow-r" size={15} />
          </a>
        </p>
      </div>
    </section>
  );
}
