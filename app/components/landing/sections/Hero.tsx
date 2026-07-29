import { Doodle, sx } from "../Doodle";

/**
 * The hero opens on a COLD OPEN, not a poster: the card chrome and the body's
 * full height are there from frame one, then the content fills in around it.
 * [data-hb] values are the build delay in ms — see heroBuild() in
 * LandingMotion.tsx. The order hands the eye a reading order, problem first:
 *
 *   0.2–0.5s  the paper pile drifts in — the spreadsheet, the 11:52 PM group
 *             chat, the Venmo notes — around an app window that hasn't loaded
 *   0.8–1.1s  kicker, greeting, digest, health ring: it already knows you
 *   1.4–1.6s  the measures
 *   1.9–2.0s  the attention queue — what today actually needs
 *   2.3s      ⌘K lands, then starts typing
 *
 * [data-hb] never sits on a [data-para] node: the parallax engine owns inline
 * transform there, so the build hooks nest one level in.
 */
export function Hero() {
  return (
    <section className="hero">
      <div className="wrap hero__grid">
        <div className="hero__copy">
          <span className="eyebrow" style={sx({ "--eb": "var(--peach)" })} data-reveal>
            For chapters · clubs · teams · councils · volunteer corps
          </span>

          <h1 data-reveal style={sx({ "--d": "60ms" })}>
            <span className="line">Open one page.</span>
            <span className="line">It already knows</span>
            <span className="line">
              <span className="hi" style={sx({ "--mark": "var(--butter)" })}>
                what today needs.
              </span>
            </span>
          </h1>

          <p className="lede hero__lede" data-reveal style={sx({ "--d": "140ms" })}>
            ChaptOS holds the whole org — roster, dues, meetings, events, service, docs —
            and opens on a briefing: what&apos;s late, what&apos;s this week, who&apos;s slipping.
            Everything else is one <em>question</em> away.
          </p>

          <div className="hero__actions" data-reveal style={sx({ "--d": "200ms" })}>
            <a className="btn btn--lg" href="/create">
              Set up your org — free
            </a>
            <a className="btn btn--ghost btn--lg" href="#ask">
              Ask it something first
              <Doodle id="arrow-r" size={17} />
            </a>
          </div>

          <p className="hero__fine" data-reveal style={sx({ "--d": "260ms" })}>
            <span>Built around your org, not a template</span>
            <span className="dot" />
            <span>No card, no contract</span>
            <span className="dot" />
            <span>Export everything, any time</span>
          </p>
        </div>

        <div className="hero__stage">
          {/* the product: the dashboard as it actually opens, first thing */}
          <div className="hero__card" data-para data-speed="-0.05">
            <div className="hero__cardbar">
              <i className="tl" />
              <i className="tl" />
              <i className="tl" />
              <span className="hero__crumb mono">chaptos.app / oozma-kappa</span>
            </div>
            <div className="hero__cardbody">
              <div className="ui-brief">
                <div>
                  <p className="ui-kick" data-hb="780">
                    Tue · Oct 14 · week 8 of Fall &apos;26
                  </p>
                  <p className="ui-greet" data-hb="840">
                    Good evening, Priya
                  </p>
                  <p className="ui-digest" data-hb="1100">
                    <span className="aichip">
                      <Doodle id="spark" size={9} />
                      Digest
                    </span>
                    <span>
                      Three deadlines land this week, dues are 76% in, and two members just
                      dropped below attendance standing.
                    </span>
                  </p>
                </div>
                <span
                  className="ui-ring ui-ring--sm"
                  data-ring="82"
                  data-hb="1100"
                  style={sx({ "--ring-c": "var(--mint-ink)" })}
                >
                  <i className="mono">
                    <span className="counter" data-count="82">
                      82
                    </span>
                    <small>health</small>
                  </i>
                </span>
              </div>

              <div className="ui-meas">
                <div className="meas" data-hb="1420">
                  <p className="meas__l">Attendance</p>
                  <p className="meas__v">
                    <span className="counter" data-count="92" data-suffix="%">
                      92%
                    </span>
                  </p>
                  <p className="meas__d up">▲ 4.2</p>
                </div>
                <div className="meas" data-hb="1485">
                  <p className="meas__l">Dues in</p>
                  <p className="meas__v">
                    <span className="counter" data-count="4820" data-prefix="$">
                      $4,820
                    </span>
                  </p>
                  <p className="meas__d">of $6,300</p>
                </div>
                <div className="meas" data-hb="1550">
                  <p className="meas__l">Service</p>
                  <p className="meas__v">
                    <span className="counter" data-count="312">
                      312
                    </span>{" "}
                    hrs
                  </p>
                  <p className="meas__d up">▲ 38</p>
                </div>
                <div className="meas" data-hb="1615">
                  <p className="meas__l">Balance</p>
                  <p className="meas__v">
                    <span className="counter" data-count="12480" data-prefix="$">
                      $12,480
                    </span>
                  </p>
                  <p className="meas__d">net</p>
                </div>
              </div>

              <div className="ui-att">
                <div className="att" data-hb="1880" style={sx({ "--hb-y": "14px" })}>
                  <span className="att__tag">Overdue</span>
                  <div className="att__b">
                    <p className="t">Submit the fall budget to the advisor</p>
                    <p className="m">Due Oct 10 · Treasurer · 4 days late</p>
                  </div>
                  <span className="att__a">Mark done</span>
                </div>
                <div className="att" data-hb="1975" style={sx({ "--hb-y": "14px" })}>
                  <span className="att__tag sky">Request</span>
                  <div className="att__b">
                    <p className="t">Reimbursement — $84.20, service supplies</p>
                    <p className="m">Nia Brooks · waiting on a treasurer</p>
                  </div>
                  <span className="att__a">Review</span>
                </div>
              </div>
            </div>
          </div>

          {/* the ⌘K spotlight, live on every page */}
          <div className="hero__spot" data-para data-speed="0.085">
            <div
              className="spotmini"
              data-spotmini
              data-hb="2290"
              style={sx({ "--hb-y": "18px" })}
            >
              <p className="spotmini__hd">
                <Doodle id="spark" size={13} style={sx({ color: "var(--lilac-ink)" })} />
                Ask Chapt <kbd>⌘K</kbd>
              </p>
              <p className="spotmini__q">
                <span
                  data-typer
                  data-lines="who still owes dues?|is anyone double-booked next week?|who missed the last two meetings?"
                />
              </p>
              <p className="spotmini__a" data-spotmini-a />
            </div>
          </div>

          {/* what it replaces: the pile of stuff officers use today. These land
              FIRST — the mess arrives, then the product fills in on top of it.
              They drift in from opposite directions so it reads as scattered
              paper rather than one wipe. */}
          <div className="hero__piles">
            <div className="pile pile--sheet" data-para data-speed="0.075">
              <div
                className="sticky-note"
                data-hb="220"
                style={sx({ "--note": "var(--mint)", "--rot": "-3.2deg", "--hb-y": "-14px" })}
              >
                <b>dues_FALL_v4_FINAL.xlsx</b>
                <br />
                <span style={{ fontSize: ".83rem", color: "var(--ink-2)" }}>
                  last edited by an officer who graduated
                </span>
              </div>
            </div>
            <div className="pile pile--chat" data-para data-speed="0.115">
              <div
                className="sticky-note"
                data-hb="330"
                style={sx({
                  "--note": "var(--rose)",
                  "--rot": "2.6deg",
                  "--tape-rot": "3deg",
                  "--hb-y": "18px",
                })}
              >
                <b>&quot;did anyone take attendance??&quot;</b>
                <br />
                <span style={{ fontSize: ".83rem", color: "var(--ink-2)" }}>
                  group chat, 11:52 PM
                </span>
              </div>
            </div>
            <div className="pile pile--receipt" data-para data-speed="0.095">
              <div
                className="sticky-note"
                data-hb="440"
                style={sx({
                  "--note": "var(--sky)",
                  "--rot": "-2deg",
                  "--tape-rot": "-4deg",
                  "--hb-y": "-16px",
                })}
              >
                <b>47 Venmo notes</b>
                <br />
                <span style={{ fontSize: ".83rem", color: "var(--ink-2)" }}>
                  🍕 🎉 &quot;dues i think&quot;
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* trust strip: the range of orgs it shapes itself to */}
      <div className="wrap trustbar" data-reveal>
        <p className="trustbar__label">There&apos;s a place here for every kind of org.</p>
        <div className="trustbar__row">
          <span className="orgchip">
            <Doodle id="star" className="doodle doodle--thin" viewBox="0 0 24 24" style={sx({ color: "var(--peach-ink)" })} />
            Greek Life
          </span>
          <span className="orgchip">
            <Doodle id="people" className="doodle doodle--thin" viewBox="0 0 24 24" style={sx({ color: "var(--lilac-ink)" })} />
            Cultural orgs
          </span>
          <span className="orgchip">
            <Doodle id="flag" className="doodle doodle--thin" viewBox="0 0 24 24" style={sx({ color: "var(--sky-ink)" })} />
            Club team
          </span>
          <span className="orgchip">
            <Doodle id="heart" className="doodle doodle--thin" viewBox="0 0 24 24" style={sx({ color: "var(--mint-ink)" })} />
            Volunteer corps
          </span>
          <span className="orgchip">
            <Doodle id="note" className="doodle doodle--thin" viewBox="0 0 24 24" style={sx({ color: "var(--rose-ink)" })} />
            Theatre &amp; band
          </span>
          <span className="orgchip">
            <Doodle id="clip" className="doodle doodle--thin" viewBox="0 0 24 24" style={sx({ color: "var(--butter-ink)" })} />
            Student government
          </span>
          <span className="orgchip">
            <Doodle id="mug" className="doodle doodle--thin" viewBox="0 0 24 24" style={sx({ color: "var(--lilac-ink)" })} />
            Honor society
          </span>
        </div>
      </div>
    </section>
  );
}
