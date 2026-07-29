import { Doodle, sx } from "../Doodle";

/**
 * THE pinned scene, and the first big demo you meet. The rail is tall, the
 * stage pins, and JS maps rail progress onto beat thresholds — so the reader
 * sets the pace. That matters here and nowhere else: these beats carry real
 * cognitive load (a reasoning ledger, a table of receipts, a drafted message
 * you have to actually read). Mobile drops the pin and plays through once.
 *
 * An officer's first objection isn't "does it track dues" — every competitor
 * does — it's "will this save me time or is it one more thing to maintain?"
 * Only this scene answers that, which is why it comes before the day tour.
 */
export function AskScene() {
  return (
    <section className="scene" id="ask" data-scene>
      <div className="scene__rail">
        <div className="scene__stage">
          <div className="scene__in">
            <div className="scene__side">
              <span className="eyebrow" style={sx({ "--eb": "var(--lilac)" })}>
                The part that changes everything
              </span>
              <h2>
                Ask your org
                <br />a question.
              </h2>
              <p className="lede">
                No more digging through spreadsheets. Just ask Chapt — it finds the answer,
                or handles the task for you.
              </p>

              <ol className="beatlist" data-beatlist>
                <li data-beat-nav="0">
                  <span className="n">1</span>
                  <span>You ask, in plain words</span>
                </li>
                <li data-beat-nav="1">
                  <span className="n">2</span>
                  <span>It checks the real records</span>
                </li>
                <li data-beat-nav="2">
                  <span className="n">3</span>
                  <span>You get an answer with receipts</span>
                </li>
                <li data-beat-nav="3">
                  <span className="n">4</span>
                  <span>You ask it to do something</span>
                </li>
                <li data-beat-nav="4">
                  <span className="n">5</span>
                  <span>Nothing sends without your OK</span>
                </li>
                <li data-beat-nav="5">
                  <span className="n">6</span>
                  <span>It follows up so you don&apos;t</span>
                </li>
              </ol>

              <Doodle
                id="swirl"
                className="scene__doodle"
                viewBox="0 0 120 46"
                style={sx({
                  width: "118px",
                  bottom: "-16px",
                  right: "8px",
                  color: "var(--lilac-ink)",
                  opacity: ".5",
                })}
              />
            </div>

            <div className="chat" data-chat>
              {/* beat 0 — the ask */}
              <div className="beat" data-beat="0">
                <div className="beat__in">
                  <div>
                    <p className="who who--right">
                      Priya · Treasurer{" "}
                      <span className="avatar avatar--sm" style={sx({ "--av": "var(--peach)" })}>
                        PS
                      </span>
                    </p>
                    <div className="bubble bubble--me">
                      who still owes dues this semester, and how bad is it?
                    </div>
                  </div>
                </div>
              </div>

              {/* beat 1 — the reasoning ledger */}
              <div className="beat" data-beat="1">
                <div className="beat__in">
                  <div>
                    <p className="who">
                      <span className="avatar avatar--sm" style={sx({ "--av": "var(--butter)" })}>
                        ✳
                      </span>{" "}
                      ChaptOS
                    </p>
                    <div className="ledger" data-ledger>
                      <p className="ledger__t">
                        <i className="spin" /> Checking before answering
                      </p>
                      <ul>
                        <li>
                          <i className="tick">
                            <Doodle id="check" viewBox="0 0 24 24" style={sx({ color: "var(--mint-ink)" })} />
                          </i>
                          Read 52 dues records for Fall 2026
                        </li>
                        <li>
                          <i className="tick">
                            <Doodle id="check" viewBox="0 0 24 24" style={sx({ color: "var(--mint-ink)" })} />
                          </i>
                          Matched 6 unlabeled payments to members
                        </li>
                        <li>
                          <i className="tick">
                            <Doodle id="check" viewBox="0 0 24 24" style={sx({ color: "var(--mint-ink)" })} />
                          </i>
                          Applied your Oct 1 late-fee rule
                        </li>
                      </ul>
                      <div className="consulted">
                        <span className="pill pill--calm">Dues ledger</span>
                        <span className="pill pill--calm">Roster</span>
                        <span className="pill pill--calm">Payment imports</span>
                        <span className="pill pill--calm">Chapter bylaws §4</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* beat 2 — the answer, with receipts */}
              <div className="beat" data-beat="2">
                <div className="beat__in">
                  <div className="acard">
                    <div className="acard__hd">
                      <span className="k">$1,480</span>
                      <span className="sub">
                        <b>9 of 52 members</b> still owe.
                        <br />4 are past the late-fee date.
                      </span>
                      <span className="pill pill--due" style={{ marginLeft: "auto" }}>
                        <i className="dot" />
                        Needs a nudge
                      </span>
                    </div>
                    <div className="acard__rows">
                      <div className="acard__row">
                        <span className="avatar avatar--sm" style={sx({ "--av": "var(--peach)" })}>MR</span>
                        <span className="nm">Maya R.</span>
                        <span className="pill pill--due">21 days late</span>
                        <span className="amt">$140</span>
                      </div>
                      <div className="acard__row">
                        <span className="avatar avatar--sm" style={sx({ "--av": "var(--sky)" })}>DO</span>
                        <span className="nm">Dev O.</span>
                        <span className="pill pill--part">Partial</span>
                        <span className="amt">$65</span>
                      </div>
                      <div className="acard__row">
                        <span className="avatar avatar--sm" style={sx({ "--av": "var(--lilac)" })}>JT</span>
                        <span className="nm">Jordan T.</span>
                        <span className="pill pill--due">9 days late</span>
                        <span className="amt">$140</span>
                      </div>
                    </div>
                    <p className="acard__ft">
                      <Doodle id="receipt" size={13} /> 6 more · every row opens the payment
                      it came from
                    </p>
                  </div>
                </div>
              </div>

              {/* beat 3 — the follow-up ask */}
              <div className="beat" data-beat="3">
                <div className="beat__in">
                  <div>
                    <p className="who who--right">
                      Priya · Treasurer{" "}
                      <span className="avatar avatar--sm" style={sx({ "--av": "var(--peach)" })}>
                        PS
                      </span>
                    </p>
                    <div className="bubble bubble--me">
                      draft a reminder for the 4 late ones. keep it kind — half of them are
                      broke, not avoiding me
                    </div>
                  </div>
                </div>
              </div>

              {/* beat 4 — the proposal, gated on approval */}
              <div className="beat" data-beat="4">
                <div className="beat__in">
                  <div className="draft">
                    <p className="draft__hd">
                      <Doodle id="shield" size={14} /> Waiting on you — ChaptOS never sends
                      on its own
                    </p>
                    <div className="draft__body">
                      <p className="msg">
                        Hey Maya — no stress, just a heads up that Fall dues ($140) are open
                        past the Oct 1 date. Payment plans are totally fine; reply here and
                        we&apos;ll split it into three. 💛 — Priya
                      </p>
                    </div>
                    <div className="draft__ft">
                      <button className="btn btn--sm" type="button">
                        Send to 4 members
                      </button>
                      <button className="btn btn--ghost btn--sm" type="button">
                        Edit
                      </button>
                      <span className="who-ok">Logged to the audit trail either way</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* beat 5 — the loop closes */}
              <div className="beat" data-beat="5">
                <div className="beat__in">
                  <div className="done">
                    <span className="done__ic">
                      <Doodle id="check" size={22} style={sx({ color: "var(--mint-ink)" })} />
                    </span>
                    <div
                      className="bubble bubble--bot"
                      style={{ boxShadow: "3px 3px 0 var(--mint)" }}
                    >
                      Sent to 4. I&apos;ll re-check Friday and only nudge whoever&apos;s
                      still open — and I&apos;ll leave the two on payment plans alone.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The payoff line that sits under the scene. */
export function AskPayoff() {
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
          That&apos;s four tabs, two spreadsheets and a guilt-ridden group text —{" "}
          <span className="hi" style={sx({ "--mark": "var(--mint)" })}>
            collapsed into one sentence.
          </span>
        </p>
      </div>
    </section>
  );
}
