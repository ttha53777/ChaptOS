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

function Bullet({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <li>
      <Doodle
        id="check"
        className="doodle doodle--thin"
        viewBox="0 0 24 24"
        style={sx({ color })}
      />{" "}
      {children}
    </li>
  );
}

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

      {/* ---- module 1: money ---- */}
      <div className="mod">
        <div className="wrap mod__grid">
          <div className="mod__copy">
            <span className="pill pill--paid" data-reveal>
              <Doodle id="wallet" size={14} /> Treasury, dues &amp; budget
            </span>
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

            <ul className="mod__list" data-reveal style={sx({ "--d": "170ms" })}>
              <Bullet color="var(--mint-ink)">
                Reimbursements and dues payments sit in one approval queue — approve to mint
                the ledger row, decline with a reason
              </Bullet>
              <Bullet color="var(--mint-ink)">
                A semester budget split by category as a percent of the pool, with a reserve
                target and burn-rate per bucket
              </Bullet>
              <Bullet color="var(--mint-ink)">
                Charge or waive a balance with a reason attached, never a silent overwrite —
                plus a CSV export your advisor accepts without a screenshot
              </Bullet>
            </ul>
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
      <div className="mod mod--flip">
        <div className="wrap mod__grid">
          <div className="mod__copy">
            <span className="pill pill--info" data-reveal>
              <Doodle id="people" size={14} /> Roster, standing &amp; roles
            </span>
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

            <ul className="mod__list" data-reveal style={sx({ "--d": "170ms" })}>
              <Bullet color="var(--sky-ink)">
                Your own member fields and your own metrics — jersey number, section, major,
                anything
              </Bullet>
              <Bullet color="var(--sky-ink)">
                Roles carry fourteen permission switches and a rank, so nobody can promote
                themselves
              </Bullet>
              <Bullet color="var(--sky-ink)">
                Excuses and exemptions are requests with a paper trail, approved in one tap
              </Bullet>
            </ul>
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
      <div className="mod">
        <div className="wrap mod__grid">
          <div className="mod__copy">
            <span className="pill pill--part" data-reveal>
              <Doodle id="folder" size={14} /> Docs, activity &amp; terms
            </span>
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

            <ul className="mod__list" data-reveal style={sx({ "--d": "170ms" })}>
              <Bullet color="var(--butter-ink)">
                Drag-and-drop filing, pinned essentials, link previews, contributor credit
              </Bullet>
              <Bullet color="var(--butter-ink)">
                An activity log the whole board can read — no &quot;who changed this?&quot;
              </Bullet>
              <Bullet color="var(--butter-ink)">
                Ask about last year: &quot;what did we spend on formal in 2025?&quot;
              </Bullet>
            </ul>
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
