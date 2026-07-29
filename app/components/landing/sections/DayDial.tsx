import { Doodle, sx } from "../Doodle";
import { Sep, ShotBar } from "./shot";

/**
 * Not pinned — §5 (the ask scene) spends the page's whole motion budget, and
 * two pinned scenes back to back read as the same trick twice. This one only
 * has to prove the surfaces are real, and a dial does that in ~1.4 screens
 * with six real product shots.
 *
 * The marks sit at even 60° steps, not true 24h angles. 8:12a→11:58p on a real
 * dial crams every moment into a 123°–360° arc with 27° between 7:31 and 9:20,
 * and the labels collide. The one literal touch is the closing segment: the 60°
 * running 11:58 PM back round to 8:12 AM is dashed, because that arc IS the
 * part of the day nobody is doing admin — which is the whole argument.
 */

const TICKS = [
  { a: "0deg", label: "8:12 AM", cap: "The briefing says what's late" },
  { a: "60deg", label: "12:40 PM", cap: "An idea becomes a real event" },
  { a: "120deg", label: "3:05 PM", cap: "A payout gets approved — and booked" },
  { a: "180deg", label: "7:31 PM", cap: "Roll call, 52 names, 40 seconds" },
  { a: "240deg", label: "9:20 PM", cap: "Notes that members actually read" },
  { a: "300deg", label: "11:58 PM", cap: "The day writes its own record" },
];

function CardNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="dialcard__note">
      <Doodle id="check" style={sx({ color: "var(--mint-ink)" })} />
      <span>{children}</span>
    </p>
  );
}

function PersonHere({ name }: { name: string }) {
  return (
    <span className="ui-person is-here">
      <i className="mk">
        <Doodle id="check" viewBox="0 0 24 24" style={sx({ color: "#fff" })} />
      </i>
      {name}
    </span>
  );
}

export function DayDial() {
  return (
    <section className="day" id="day" data-dial>
      <div className="wrap section" style={{ paddingTop: "clamp(64px,8vw,104px)" }}>
        {/* the head runs full width so the dial and the screen can sit as a pair
            underneath it — stacking copy + dial in one column left the dial
            floating at the bottom of a column twice the height of the card */}
        <div className="dial__head">
          <span className="eyebrow" style={sx({ "--eb": "var(--sky)" })} data-reveal>
            Tuesday, October 14
          </span>
          <h2 data-reveal style={sx({ marginTop: "16px", "--d": "60ms" })}>
            Nobody logs in to use software.
          </h2>
          <p className="lede" data-reveal style={sx({ marginTop: "18px", "--d": "110ms" })}>
            They log in because something&apos;s due, someone paid, roll needs taking, and
            the minutes have to say what we decided. Here&apos;s an ordinary day, in the
            order it actually happens.
          </p>
        </div>

        <div className="dial__grid">
          <div className="dial__side">
            <div className="dial" data-reveal style={sx({ "--d": "170ms" })}>
              <svg className="dial__face" viewBox="0 0 200 200" aria-hidden="true">
                <path className="dial__ring" d="M100 28 A72 72 0 1 1 37.65 64" />
                {/* the 60° nobody is doing admin */}
                <path className="dial__quiet" d="M37.65 64 A72 72 0 0 1 100 28" />
                <path className="dial__prog" d="M100 28 A72 72 0 1 1 37.65 64" data-dial-prog />
                <g className="dial__hand" data-dial-hand>
                  <line x1="100" y1="100" x2="100" y2="44" />
                  <circle cx="100" cy="41" r="4" />
                </g>
                <circle className="dial__disc" cx="100" cy="100" r="27" />
              </svg>

              <div className="dial__hub">
                <span className="c" data-dial-count>
                  01
                </span>
                <span className="l">of six</span>
              </div>

              <span className="dial__quiet-l" style={sx({ "--a": "330deg" })}>
                8 quiet hours
              </span>

              <div className="dial__ticks">
                {TICKS.map((t, i) => (
                  <button
                    key={t.label}
                    type="button"
                    className="dial__tick"
                    style={sx({ "--a": t.a })}
                    data-dial-tick={i}
                    data-dial-cap-text={t.cap}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="dial__cap" data-dial-cap>
              {TICKS[0].cap}
            </p>

            <div className="dial__replay">
              <button className="btn btn--ghost btn--sm" type="button" data-dial-replay>
                <Doodle id="loop" size={15} /> Play the day again
              </button>
            </div>

            <Doodle
              id="swirl"
              className="dial__doodle"
              viewBox="0 0 120 46"
              style={sx({
                width: "112px",
                bottom: "-30px",
                right: "-6px",
                color: "var(--sky-ink)",
                opacity: ".4",
              })}
            />
          </div>

          <div className="dialdeck" data-dial-deck>
            {/* 1 — the briefing */}
            <div className="dialcard" data-dial-card="0">
              <div>
                <p className="dialcard__t">8:12 AM · Dashboard</p>
                <figure className="shot">
                  <ShotBar
                    path={
                      <>
                        Dashboard <Sep /> Fall 2026
                      </>
                    }
                  />
                  <div className="shot__body">
                    <div className="shot__toolbar">
                      <span className="shot__title">Needs attention</span>
                      <span className="pill pill--due">
                        <i className="dot" />4
                      </span>
                      <span className="shot__spacer" />
                      <span className="mono" style={{ fontSize: ".78rem", color: "var(--ink-3)" }}>
                        resolved items drop off
                      </span>
                    </div>
                    <div className="ui-att" style={{ marginTop: 0 }}>
                      <div className="att">
                        <span className="att__tag">Overdue</span>
                        <div className="att__b">
                          <p className="t">Submit the fall budget to the advisor</p>
                          <p className="m">Due Oct 10 · Treasurer · 4 days late</p>
                        </div>
                        <span className="att__a">Mark done</span>
                      </div>
                      <div className="att">
                        <span className="att__tag gold">Dues</span>
                        <div className="att__b">
                          <p className="t">Maya Rivera — $140 outstanding</p>
                          <p className="m">21 days past the Oct 1 date</p>
                        </div>
                        <span className="att__a">Open profile</span>
                      </div>
                      <div className="att">
                        <span className="att__tag sky">Request</span>
                        <div className="att__b">
                          <p className="t">Reimbursement — $84.20, service supplies</p>
                          <p className="m">Nia Brooks · waiting on a treasurer</p>
                        </div>
                        <span className="att__a">Review</span>
                      </div>
                      <div className="att">
                        <span className="att__tag calm">Standing</span>
                        <div className="att__b">
                          <p className="t">Jordan Tao is one absence from review</p>
                          <p className="m">2 of 8 missed · policy is 3</p>
                        </div>
                        <span className="att__a">Open profile</span>
                      </div>
                    </div>
                  </div>
                </figure>
                <CardNote>
                  Nobody built a report to find these. The queue is what the dashboard opens
                  on, and rows leave it the moment they&apos;re handled.
                </CardNote>
              </div>
            </div>

            {/* 2 — programming board */}
            <div className="dialcard" data-dial-card="1">
              <div>
                <p className="dialcard__t">12:40 PM · Programming</p>
                <figure className="shot">
                  <ShotBar
                    path={
                      <>
                        Programming <Sep /> Fall 2026
                      </>
                    }
                  />
                  <div className="shot__body">
                    <div className="shot__toolbar">
                      <span className="shot__title">Alumni mixer</span>
                      <span className="pill pill--paid">
                        <i className="dot" />
                        Moved to Confirmed
                      </span>
                      <span className="shot__spacer" />
                      <span className="shot__tabs">
                        <span className="on">Board</span>
                        <span>Table</span>
                        <span>Calendar</span>
                      </span>
                    </div>

                    <div className="ui-board">
                      <div className="bcol">
                        <p className="bcol__h">
                          <i style={sx({ "--s": "var(--rose-ink)" })} />
                          Idea <b>3</b>
                        </p>
                        <div className="bcard">
                          Casino night<small>no owner yet</small>
                        </div>
                        <div className="bcard">
                          Intramural league<small>needs budget</small>
                        </div>
                      </div>
                      <div className="bcol">
                        <p className="bcol__h">
                          <i style={sx({ "--s": "var(--butter-ink)" })} />
                          Planning <b>2</b>
                        </p>
                        <div className="bcard">
                          Beach cleanup<small>Sat · service</small>
                        </div>
                      </div>
                      <div className="bcol">
                        <p className="bcol__h">
                          <i style={sx({ "--s": "var(--mint-ink)" })} />
                          Confirmed <b>2</b>
                        </p>
                        <div className="bcard is-moved">
                          Alumni mixer<small>Fri 6:30 · D. Reyes</small>
                        </div>
                        <div className="bcard">
                          Fall formal<small>Oct 23 · social</small>
                        </div>
                      </div>
                      <div className="bcol">
                        <p className="bcol__h">
                          <i style={sx({ "--s": "var(--line-2)" })} />
                          Done <b>6</b>
                        </p>
                        <div className="bcard" style={{ opacity: 0.62 }}>
                          Fundraiser night<small>Sep 28</small>
                        </div>
                      </div>
                    </div>

                    <ul className="ui-check">
                      <li className="done">
                        <i className="box">
                          <Doodle id="check" viewBox="0 0 24 24" style={sx({ color: "#fff", width: "11px", height: "11px" })} />
                        </i>
                        <span className="lbl">Venue confirmed — the Union, room 204</span>
                        <span className="owner pill pill--paid">
                          <i className="dot" />
                          Done
                        </span>
                      </li>
                      <li className="done">
                        <i className="box">
                          <Doodle id="check" viewBox="0 0 24 24" style={sx({ color: "#fff", width: "11px", height: "11px" })} />
                        </i>
                        <span className="lbl">Budget line approved — $340</span>
                        <span className="owner pill pill--paid">
                          <i className="dot" />
                          Done
                        </span>
                      </li>
                      <li>
                        <i className="box" />
                        <span className="lbl">Alumni list pulled + emailed</span>
                        <span className="owner pill pill--part">
                          <i className="dot" />
                          Due Thu
                        </span>
                      </li>
                    </ul>

                    <p
                      className="ui-note"
                      style={{
                        background: "var(--mint-soft)",
                        borderColor: "#BDE7D2",
                        color: "var(--mint-ink)",
                      }}
                    >
                      <Doodle id="cal" size={15} />
                      <span>
                        Confirmed events land on the org timeline —{" "}
                        <b>everyone sees Friday 6:30</b> without a single group-chat post
                      </span>
                    </p>
                  </div>
                </figure>
                <CardNote>
                  The social chair dragged one card. That&apos;s the whole announcement.
                </CardNote>
              </div>
            </div>

            {/* 3 — treasury: approval mints the ledger row */}
            <div className="dialcard" data-dial-card="2">
              <div>
                <p className="dialcard__t">3:05 PM · Treasury</p>
                <figure className="shot">
                  <ShotBar
                    path={
                      <>
                        Treasury <Sep /> Reimbursements
                      </>
                    }
                  />
                  <div className="shot__body">
                    <div className="shot__toolbar">
                      <span className="shot__title">Waiting on you</span>
                      <span className="pill pill--part">
                        <i className="dot" />2 pending
                      </span>
                      <span className="shot__spacer" />
                      <span className="mono" style={{ fontSize: ".9rem", fontWeight: 600 }}>
                        $12,480<span style={{ color: "var(--ink-3)" }}> balance</span>
                      </span>
                    </div>

                    <div className="ui-stat" style={{ gap: "14px" }}>
                      <span className="avatar" style={sx({ "--av": "var(--mint)" })}>
                        NB
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <p className="ui-stat__k">
                          $84.20{" "}
                          <span
                            style={{
                              fontSize: ".9rem",
                              color: "var(--ink-3)",
                              fontFamily: "var(--sans)",
                              fontWeight: 500,
                            }}
                          >
                            — service supplies
                          </span>
                        </p>
                        <p className="ui-stat__l">
                          Nia Brooks · Oct 12 · receipt attached · category: Service
                        </p>
                      </div>
                      <span style={{ marginLeft: "auto", display: "flex", gap: "8px", flex: "none" }}>
                        <span className="btn btn--sm" style={sx({ "--btn-shadow": "var(--mint)" })}>
                          Approve
                        </span>
                        <span className="btn btn--ghost btn--sm">Decline</span>
                      </span>
                    </div>

                    <p
                      className="ui-note"
                      style={{
                        background: "var(--butter-soft)",
                        borderColor: "#F4DFA6",
                        color: "var(--butter-ink)",
                      }}
                    >
                      <Doodle id="receipt" size={15} />
                      <span>
                        Approving writes the expense row <b>and</b> moves the balance — one
                        transaction, both books
                      </span>
                    </p>

                    <div className="ui-table ui-table--4">
                      <div className="ui-th">
                        <span>Entry</span>
                        <span>Category</span>
                        <span>Date</span>
                        <span>Amount</span>
                      </div>
                      <div className="ui-tr" style={{ background: "var(--mint-soft)" }}>
                        <span className="who">
                          <i className="avatar avatar--sm" style={sx({ "--av": "var(--mint)" })}>NB</i>
                          Service supplies
                        </span>
                        <span className="txt">Service</span>
                        <span className="txt mono">Oct 14</span>
                        <span className="amt">−$84.20</span>
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
                      <div className="ui-tr">
                        <span className="who">
                          <i className="avatar avatar--sm" style={sx({ "--av": "var(--butter)" })}>FF</i>
                          Formal deposit
                        </span>
                        <span className="txt">Events</span>
                        <span className="txt mono">Oct 11</span>
                        <span className="amt">−$400.00</span>
                      </div>
                    </div>
                  </div>
                </figure>
                <CardNote>
                  Dues payments and payouts are <em>requests</em>{" "}
                  until a treasurer approves them. Nothing edits the balance behind
                  anyone&apos;s back.
                </CardNote>
              </div>
            </div>

            {/* 4 — roll call */}
            <div className="dialcard" data-dial-card="3">
              <div>
                <p className="dialcard__t">7:31 PM · Chapter meeting</p>
                <figure className="shot">
                  <ShotBar
                    path={
                      <>
                        Chapter <Sep /> General Meeting <Sep /> Oct 14
                      </>
                    }
                  />
                  <div className="shot__body">
                    <div className="shot__toolbar">
                      <span className="shot__title">Taking roll</span>
                      <span className="pill pill--paid">
                        <i className="dot" />
                        Live
                      </span>
                      <span className="shot__spacer" />
                      <span className="mono" style={{ fontSize: ".9rem", fontWeight: 600 }}>
                        47<span style={{ color: "var(--ink-3)" }}>/52 here</span>
                      </span>
                    </div>

                    <div className="ui-roll" style={{ marginTop: 0 }}>
                      <PersonHere name="Ana C." />
                      <PersonHere name="Dev O." />
                      <span className="ui-person is-late">
                        <i className="mk" />
                        Maya R.
                      </span>
                      <PersonHere name="Sam W." />
                      <PersonHere name="Priya S." />
                      <span className="ui-person is-out">
                        <i className="mk" />
                        Jordan T.
                      </span>
                      <PersonHere name="Leo M." />
                      <PersonHere name="Nia B." />
                    </div>

                    <p
                      className="ui-note"
                      style={{
                        background: "var(--butter-soft)",
                        borderColor: "#F4DFA6",
                        color: "var(--butter-ink)",
                      }}
                    >
                      <Doodle id="hand" size={15} />
                      <span>
                        Jordan T. filed an excuse — <b>lab conflict</b>, 2nd this term
                      </span>
                      <span style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
                        <span className="btn btn--sm" style={sx({ "--btn-shadow": "var(--mint)" })}>
                          Approve
                        </span>
                      </span>
                    </p>

                    <div className="ui-table">
                      <div className="ui-th">
                        <span>Standing</span>
                        <span>Missed</span>
                        <span>Status</span>
                      </div>
                      <div className="ui-tr">
                        <span className="who">
                          <i className="avatar avatar--sm" style={sx({ "--av": "var(--lilac)" })}>JT</i>
                          Jordan Tao
                        </span>
                        <span className="amt">2 of 8</span>
                        <span>
                          <span className="pill pill--part">
                            <i className="dot" />1 from review
                          </span>
                        </span>
                      </div>
                      <div className="ui-tr">
                        <span className="who">
                          <i className="avatar avatar--sm" style={sx({ "--av": "var(--mint)" })}>AC</i>
                          Ana Chen
                        </span>
                        <span className="amt">0 of 8</span>
                        <span>
                          <span className="pill pill--paid">
                            <i className="dot" />
                            Good standing
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                </figure>
                <CardNote>
                  Standing updates itself as the roll closes — so the attendance policy is
                  finally a number, not an argument.
                </CardNote>
              </div>
            </div>

            {/* 5 — minutes → decisions + assigned work */}
            <div className="dialcard" data-dial-card="4">
              <div>
                <p className="dialcard__t">9:20 PM · Minutes</p>
                <figure className="shot">
                  <ShotBar
                    path={
                      <>
                        Chapter <Sep /> Minutes <Sep /> Oct 14
                      </>
                    }
                  />
                  <div className="shot__body">
                    <div className="shot__toolbar">
                      <span className="shot__title">Meeting notes</span>
                      <span className="pill pill--calm">
                        <Doodle id="spark" size={13} /> Summarized
                      </span>
                      <span className="shot__spacer" />
                      <span className="mono" style={{ fontSize: ".78rem", color: "var(--ink-3)" }}>
                        saved · 52 members notified
                      </span>
                    </div>

                    <div className="ui-split" style={{ marginTop: 0 }}>
                      <div className="ui-raw">
                        <h5>What the secretary typed</h5>
                        <p>
                          ok so formal — voted, 31 yes 6 no, we&apos;re doing the 23rd not
                          the 30th…
                        </p>
                        <p>
                          maya asked about payment plans, priya says fine, 3 splits, needs a
                          vote next week
                        </p>
                        <p>
                          dev has to send the budget to advisor by friday!! also someone
                          confirm the van
                        </p>
                        <p>alumni mixer moved to confirmed, dr owns it</p>
                      </div>
                      <div className="ui-sum">
                        <h5>Decisions</h5>
                        <ul>
                          <li>
                            Fall formal set for Oct 23 <span className="pill pill--paid">31–6</span>
                          </li>
                          <li>Alumni mixer confirmed, owner D. Reyes</li>
                        </ul>
                        <h5>Action items</h5>
                        <ul>
                          <li>
                            Budget to the advisor by Fri{" "}
                            <span className="pill pill--info">Treasurer</span>
                          </li>
                          <li>
                            Confirm the van + 2 drivers{" "}
                            <span className="pill pill--info">Social</span>
                          </li>
                        </ul>
                        <h5>Discussed</h5>
                        <ul>
                          <li>Three-split payment plans — vote next week</li>
                        </ul>
                      </div>
                    </div>

                    <p className="ui-note">
                      <Doodle id="clip" size={15} />
                      <span>
                        Action items were handed to <b>the seat, not the person</b> —
                        whoever holds Treasurer next month inherits them
                      </span>
                    </p>
                  </div>
                </figure>
                <CardNote>
                  Two of those action items are now dated tasks. They&apos;ll be on
                  tomorrow&apos;s briefing whether anyone remembers or not.
                </CardNote>
              </div>
            </div>

            {/* 6 — the record */}
            <div className="dialcard" data-dial-card="5">
              <div>
                <p className="dialcard__t">11:58 PM · Timeline</p>
                <figure className="shot">
                  <ShotBar
                    path={
                      <>
                        Timeline <Sep /> Activity
                      </>
                    }
                  />
                  <div className="shot__body">
                    <div className="shot__toolbar">
                      <span className="shot__title">Today</span>
                      <span className="pill pill--info">14 entries</span>
                      <span className="shot__spacer" />
                      <span className="shot__tabs">
                        <span className="on">Today</span>
                        <span>Term</span>
                        <span>All</span>
                      </span>
                    </div>

                    <div className="ui-log">
                      <div className="logrow">
                        <span className="ts">11:41 PM</span>
                        <span className="tx">
                          Minutes published — <b>General Meeting, Oct 14</b>
                        </span>
                        <span className="pill pill--calm">Priya S.</span>
                      </div>
                      <div className="logrow">
                        <span className="ts">9:24 PM</span>
                        <span className="tx">2 tasks created from action items</span>
                        <span className="pill">auto</span>
                      </div>
                      <div className="logrow">
                        <span className="ts">7:58 PM</span>
                        <span className="tx">
                          Attendance closed — <b>47 of 52</b>, 1 excused
                        </span>
                        <span className="pill pill--calm">Priya S.</span>
                      </div>
                      <div className="logrow">
                        <span className="ts">7:44 PM</span>
                        <span className="tx">Excuse approved — Jordan T., lab conflict</span>
                        <span className="pill pill--calm">Ana C.</span>
                      </div>
                      <div className="logrow">
                        <span className="ts">3:06 PM</span>
                        <span className="tx">
                          Reimbursement approved — <b>$84.20</b>, expense row minted
                        </span>
                        <span className="pill pill--calm">Dev O.</span>
                      </div>
                      <div className="logrow">
                        <span className="ts">12:41 PM</span>
                        <span className="tx">
                          Alumni mixer → <b>Confirmed</b>, published to timeline
                        </span>
                        <span className="pill pill--calm">D. Reyes</span>
                      </div>
                      <div className="logrow">
                        <span className="ts">8:15 AM</span>
                        <span className="tx">Deadline completed — fall budget draft</span>
                        <span className="pill pill--calm">Dev O.</span>
                      </div>
                    </div>

                    <p
                      className="ui-note"
                      style={{
                        background: "var(--sky-soft)",
                        borderColor: "#CCDFFB",
                        color: "var(--sky-ink)",
                      }}
                    >
                      <Doodle id="loop" size={15} />
                      <span>
                        Nobody wrote a status update. <b>This is just what happened, in
                        order.</b>
                      </span>
                    </p>
                  </div>
                </figure>
                <CardNote>
                  Next May, the incoming board reads this instead of interviewing whoever
                  still answers texts.
                </CardNote>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The payoff line that sits under the day. */
export function DayPayoff() {
  return (
    <section className="section--tight">
      <div className="wrap--narrow" style={{ marginInline: "auto", textAlign: "center" }}>
        <p
          className="lede"
          data-reveal
          style={{
            fontSize: "clamp(1.2rem,2.4vw,1.7rem)",
            color: "var(--ink)",
            lineHeight: 1.4,
          }}
        >
          Five officers, six surfaces, one ordinary day — and not one of them{" "}
          <span className="hi" style={sx({ "--mark": "var(--mint)" })}>
            opened a spreadsheet.
          </span>
        </p>
      </div>
    </section>
  );
}
