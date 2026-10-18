// Marketing landing page, rendered at "/" for signed-out visitors (signed-in
// users never see this — app/page.tsx redirects them into their org first).
//
// A 1:1 port of _design/Landing Motion Mock.html: hero (loose ends dock into
// one page, which then re-forms per org type) · the race · how it works (one
// card morphing Timeline → check-in → tasks → budget) · the handoff · fits your
// org · privacy, FAQ and the close, with one thread sewn through all of it.
//
// The markup is static and server-rendered; <LandingMotion> mounts once and
// drives it imperatively by id, the same shape as the mock's script, so the
// timing stays 1:1. Everything is scoped under `.lm` (landing-motion.css),
// which also carries the page's own tokens: the app's paper palette shares
// names (--ink, --paper, --line) and must not leak in.
//
// Wiring: every "Start your org" goes to /create (the pre-auth org charter),
// "Talk to us" to /contact. The top bar is the shared <SiteNav>.
import "./landing-motion.css";

import { sx } from "./Doodle";
import { hand } from "./hand-font";
import { landingFontClass } from "./fonts";
import { LandingMotion } from "./LandingMotion";
import { SiteNav } from "./SiteNav";
import { APP_NAME } from "@/lib/domains";

// With JS off everything is present and readable, just still: the reveals are
// shown, the hero sits as copy with its dashboard below, and the How it works
// steps carry no motion. The stacked layout is what phones get anyway.
const NO_JS_CSS = `
.lm [data-rv]{opacity:1 !important; transform:none !important; filter:none !important}
.lm .hero{height:auto}
.lm .hero-stage{position:static; height:auto; overflow:visible; padding:120px 0 60px}
.lm .hero-copy{position:static}
.lm .swap .a{display:none}
.lm .df,.lm .pieces,.lm .otypes{display:none}
.lm .dv-col{display:none}
.lm .st{opacity:1; min-height:0; padding-top:64px}
.lm .close-h .cw{opacity:1}
.lm .verdict,.lm .verdict .ai,.lm .step,.lm .turn2 > .ask-q,.lm .writ,.lm .feed .msg,.lm .feed .day{opacity:1; transform:none}
`;

export function LandingPage() {
  return (
    <div className={`lm ${landingFontClass} ${hand.variable}`}>
      <noscript>
        <style>{NO_JS_CSS}</style>
      </noscript>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <symbol id="i-logo" viewBox="0 0 40 40"><rect x="2.5" y="4.5" width="35" height="31" rx="9" fill="var(--butter)" stroke="var(--note-ink)" strokeWidth="2.4"/><path d="M12 21.5c2.2 3.4 5 5 8.4 5 3.2 0 5.9-1.5 8-4.6" fill="none" stroke="var(--note-ink)" strokeWidth="2.4" strokeLinecap="round"/><circle cx="14.6" cy="16" r="1.9" fill="var(--note-ink)"/><circle cx="25.4" cy="16" r="1.9" fill="var(--note-ink)"/></symbol>
        <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></symbol>
        <symbol id="i-down" viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></symbol>
        <symbol id="i-spark" viewBox="0 0 24 24"><path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z" fill="currentColor"/></symbol>
        <symbol id="i-lock" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></g></symbol>
        <symbol id="i-eye" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></g></symbol>
        <symbol id="i-door" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3h5v18h-5M10 17l5-5-5-5M15 12H3"/></g></symbol>
        <symbol id="i-doc" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></g></symbol>
        <symbol id="i-pen" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></g></symbol>
        <symbol id="i-key" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/></g></symbol>
        <symbol id="i-cal" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></g></symbol>
        <symbol id="i-replay" viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></symbol>
      </svg>

      <SiteNav onLanding />

      <svg className="seam" id="seam" aria-hidden="true">
        <path className="th" id="seamPage"/><path className="th" id="seamKnot"/>
        <g className="ndl" id="needle"><path d="M-3 -1.7 L26 0 L-3 1.7 Z"/><ellipse cx="1" cy="0" rx="3.2" ry="1.3"/></g>
      </svg>
      <div className="fly" id="fly" aria-hidden="true" />
      <div className="wash" id="wash" />

      <main>
      {/* ═════════ 1 · HERO ═════════ */}
      <section className="hero" id="top">
        <div className="hero-stage" id="heroStage">

          <div className="hero-copy" id="heroCopy">
            <span className="eyebrow fade-a">For every student org</span>
            <h1 className="h1" id="heroH1">Your <span className="oword" id="oword"><span className="ow">club</span></span> runs<br /> on <span className="swap" id="swap"><span className="hi a">loose ends</span><span className="hi b">one page</span></span>.</h1>
            <p className="lede fade-a">Meetings, money, members and minutes, on one page your whole org can see.</p>
            <div className="cta-row fade-a">
              <a className="btn btn--lg" href="/create">Start your org, free <svg className="ic"><use href="#i-arrow" /></svg></a>
              <a className="cta-2" id="seeHow" href="#how">See how it works <span aria-hidden="true">↓</span></a>
            </div>
            <p className="cta-note fade-a"><span>No card needed</span><i /><span>Members join free</span><i /><span>Any kind of org</span></p>
          </div>

          <div className="df" id="df" aria-hidden="true">
            <aside className="df-sb">
              <div className="df-org"><span className="mark" data-o="logo">RC</span><div><b data-o="name">Robotics Club</b><small data-o="meta">FALL ’26 · 38</small></div></div>
              <div className="df-nav" id="dfNav" />
            </aside>
            <div className="df-main">
              <div className="df-top">
                <div className="df-hi"><small>Mon · Oct 20</small>Good evening, Maya</div>
                <div className="slot" data-k="ask" />
              </div>
              <div className="df-grid">
                <div className="slot" data-k="next" />
                <div className="slot" data-k="budget" />
                <div className="slot" data-k="att" />
                <div className="slot" data-k="tasks" />
                <div className="slot" data-k="members" />
                <div className="slot" data-k="minutes" />
                <div className="slot" data-k="mod" />
              </div>
            </div>
          </div>

          <div className="pieces" id="pieces" aria-hidden="true">
            <div className="pc" data-k="ask">
              <div className="pc-m m-note"><div className="pc-mi" style={sx({ "width": "180px", "height": "150px" })}>when’s the next meeting?? 😭</div></div>
              <div className="pc-c"><div className="pc-ci w-ask"><svg className="ic sp" style={sx({ "width": "14px" })}><use href="#i-spark" /></svg><span>Ask Chapt anything…</span><kbd>⌘K</kbd></div></div>
            </div>
            <div className="pc" data-k="next">
              <div className="pc-m m-chat"><div className="pc-mi" style={sx({ "width": "250px", "height": "170px" })}>
                <div className="bub"><b>Jordan</b>is the meeting tues or wed??</div>
                <div className="bub me">wed i think</div>
                <div className="bub"><b>Alex</b>it moved. check the insta story</div>
              </div></div>
              <div className="pc-c"><div className="pc-ci" style={sx({ "--eb": "var(--sky-ink)" })}>
                <div className="w-k">Next up</div>
                <div className="w-t" data-o="nextT">General meeting · Wed 6:00</div>
                <div className="w-s" data-o="nextS">Union 210 · moved from Tue · on everyone’s calendar</div>
                <div className="w-spine"><i style={sx({ "--c": "var(--sky)" })} /><i style={sx({ "--c": "var(--lilac)" })} /><i style={sx({ "--c": "var(--rose)" })} /><i style={sx({ "--c": "var(--peach)" })} /><i /><i style={sx({ "--c": "var(--mint)" })} /></div>
              </div></div>
            </div>
            <div className="pc" data-k="budget">
              <div className="pc-m m-rcpt"><div className="pc-mi" style={sx({ "width": "170px", "height": "200px" })}>
                <div style={sx({ "textAlign": "center", "fontWeight": "600" })}>CORNER MART</div>
                <div className="r"><span>chips ×4</span><span>12.99</span></div><div className="r"><span>soda ×12</span><span>18.40</span></div><div className="r"><span>plates</span><span>11.79</span></div>
                <div className="r" style={sx({ "borderTop": "1px dashed #998D7C", "marginTop": "3px", "paddingTop": "3px", "fontWeight": "600" })}><span>TOTAL</span><span>43.18</span></div>
                <div className="scrawl">pay me back pls<br />— alex</div>
              </div></div>
              <div className="pc-c"><div className="pc-ci" style={sx({ "--eb": "var(--mint-ink)" })}>
                <div className="w-k" data-o="budK">Budget left</div>
                <div className="w-big" data-o="budBig">$1,240 <small>/ 2,000</small></div>
                <div className="w-s" data-o="budS">Student gov allocation · 1 reimbursement</div>
                <div className="w-bar"><i data-bar="bud" style={sx({ "--v": "62%" })} /></div>
              </div></div>
            </div>
            <div className="pc" data-k="att">
              <div className="pc-m m-clip"><div className="pc-mi" style={sx({ "width": "190px", "height": "230px" })}>
                <div style={sx({ "fontWeight": "700" })}>SIGN IN!!</div>
                <div className="ln">Jordan T ✓</div><div className="ln">alex</div><div className="ln">Sam (left early)</div><div className="ln">?? illegible</div><div className="ln">Priya</div>
              </div></div>
              <div className="pc-c"><div className="pc-ci" style={sx({ "--eb": "var(--sky-ink)" })}>
                <div className="w-k">Attendance<span className="w-kx">{"\u00a0"}· last meeting</span></div>
                <div style={sx({ "display": "flex", "alignItems": "center", "gap": "10px", "marginTop": "auto" })}>
                  <div className="w-ring" style={sx({ "--p": "84" })} />
                  <div><div className="w-big" style={sx({ "margin": "0" })} data-o="attN">32<small>/38</small></div><div className="w-s">84% · up 6</div></div>
                </div>
              </div></div>
            </div>
            <div className="pc" data-k="tasks">
              <div className="pc-m m-note pk"><div className="pc-mi" style={sx({ "width": "170px", "height": "150px" })}>who’s booking the room??<br />(not me)</div></div>
              <div className="pc-c"><div className="pc-ci" style={sx({ "--eb": "var(--peach-ink)" })}>
                <div className="w-k">Tasks · this week</div>
                <div className="w-row"><i className="w-cb" /><span>Book the room</span><span className="to"><i className="av" style={sx({ "--a": "var(--sky)" })}>JT</i>Jordan</span></div>
                <div className="w-row"><i className="w-cb" /><span>Budget request</span><span className="to role">Treasurer</span></div>
                <div className="w-row"><i className="w-cb on" /><span>Trip waiver</span><span className="to all">Everyone</span></div>
              </div></div>
            </div>
            <div className="pc" data-k="members">
              <div className="pc-m m-dm"><div className="pc-mi" style={sx({ "width": "230px", "height": "140px" })}>
                <div className="hd"><i />Direct message</div>
                <div className="bub">hey how do i join?? is there a groupchat</div>
                <div className="seen">Seen 3 weeks ago</div>
              </div></div>
              <div className="pc-c"><div className="pc-ci" style={sx({ "--eb": "var(--lilac-ink)" })}>
                <div className="w-k" data-o="memK">Members</div>
                <div className="w-big" data-o="memN">38 <small>members</small></div>
                <div className="w-s" data-o="memS">2 requests to join</div>
                <div className="avs" style={sx({ "marginTop": "auto" })}>
                  <i className="av" style={sx({ "--a": "var(--peach)" })}>JT</i><i className="av" style={sx({ "--a": "var(--sky)" })}>AP</i><i className="av" style={sx({ "--a": "var(--mint)" })}>SO</i><i className="av" style={sx({ "--a": "var(--butter)" })}>PN</i><i className="av" style={sx({ "--a": "var(--rose)" })}>MA</i>
                </div>
              </div></div>
            </div>
            <div className="pc" data-k="minutes">
              <div className="pc-m m-pad"><div className="pc-mi" style={sx({ "width": "200px", "height": "190px" })}>minutes 10/9<br />- fall trip??<br />- van $$<br />…who took notes</div></div>
              <div className="pc-c"><div className="pc-ci" style={sx({ "--eb": "var(--butter-ink)" })}>
                <div className="w-k">Minutes · Oct 9</div>
                <div className="w-t" data-o="minT">Fall trip approved · 3 action items</div>
                <div className="w-row"><i className="w-cb on" /><span>Van quote</span><span className="to"><i className="av" style={sx({ "--a": "var(--sky)" })}>JT</i>Jordan</span></div>
                <div className="w-row"><i className="w-cb" /><span>Sign-up form</span><span className="to role">Secretary</span></div>
              </div></div>
            </div>
            <div className="pc" data-k="mod">
              <div className="pc-m m-drive"><div className="pc-mi" style={sx({ "width": "240px", "height": "130px" })}>
                <div className="fn"><i />Officer Handbook (2022)</div>
                <div className="lk">You need access. Owner: dana.k.2024 (graduated)</div>
                <span className="req">Request access</span>
              </div></div>
              <div className="pc-c"><div className="pc-ci" style={sx({ "--eb": "var(--teal-ink)" })}>
                <div className="w-k" data-o="modK">Docs</div>
                <div className="w-big" data-o="modBig" style={sx({ "fontSize": "1.15rem" })}>Officer handbook</div>
                <div className="w-s" data-o="modS">updated by this year’s board</div>
                <div className="w-bar" style={sx({ "opacity": "0" })}><i data-bar="mod" style={sx({ "--v": "0%", "--bc": "var(--teal-ink)" })} /></div>
              </div></div>
            </div>
          </div>

          <div className="otypes" id="otypes">
            <span className="lbl">Built for</span>
            <button className="ot on" data-t="club"><i style={sx({ "--c": "var(--mint)" })}>RC</i>Robotics club</button>
            <button className="ot" data-t="team"><i style={sx({ "--c": "var(--rose)" })}>DT</i>Dance team</button>
            <button className="ot" data-t="chapter"><i style={sx({ "--c": "var(--butter)" })}>ΔH</i>Greek chapter</button>
            <button className="ot" data-t="council"><i style={sx({ "--c": "var(--sky)" })}>EC</i>Student council</button>
          </div>
        </div>
      </section>

      {/* ═════════ 2 · RACE ═════════ */}
      <section className="sec" id="ask">
        <div className="wrap center">
          <div className="hd"><span className="eyebrow" style={sx({ "--eb": "var(--lilac-ink)" })}>Ask Chapt · same question, asked twice</span>
          <h2 className="race-q" style={sx({ "marginTop": "20px" })} data-split="">“When’s the next meeting, and what did we <span className="hi" style={sx({ "--mark": "var(--peach)" })}>decide?”</span></h2>
          <p className="sec-sub" data-rv="">The group chat took a day and still didn’t get there. Ask Chapt checked the Timeline and last week’s minutes, answered in seconds, then did the follow-up once you said yes.</p></div>
          <div className="race-run" id="raceRun"><div className="race" id="raceBox">
            <div className="lane" data-rv="">
              <div className="lane-h"><span className="avs"><i className="av" style={sx({ "--a": "var(--sky)" })}>J</i><i className="av" style={sx({ "--a": "var(--mint)" })}>A</i><i className="av" style={sx({ "--a": "var(--rose)" })}>S</i></span><b>The group chat</b><span className="tm" id="tSlow">0h 00m</span></div>
              <div className="feed" id="slowFeed">
                <div className="msg"><i className="av" style={sx({ "--a": "var(--butter)" })}>P</i><div className="bub"><b>Priya · 2:14 PM</b>when’s the next meeting? and did we decide on the fall trip</div></div>
                <div className="msg"><i className="av" style={sx({ "--a": "var(--sky)" })}>J</i><div className="bub"><b>Jordan · 2:40 PM</b>thursday i think?</div></div>
                <div className="msg"><i className="av" style={sx({ "--a": "var(--mint)" })}>A</i><div className="bub"><b>Alex · 3:05 PM</b>it moved, check the insta story</div></div>
                <div className="msg"><i className="av" style={sx({ "--a": "var(--peach)" })}>S</i><div className="bub"><b>Sam · 9:48 PM</b>the story expired lol</div></div>
                <div className="day">Next day</div>
                <div className="msg"><i className="av" style={sx({ "--a": "var(--rose)" })}>M</i><div className="bub"><b>Maya · 11:20 AM</b>wed 6pm, union. trip: idk who took notes</div></div>
                <div className="msg"><i className="av" style={sx({ "--a": "var(--sky)" })}>J</i><div className="bub"><b>Jordan · 1:02 PM</b>i did but they’re on my laptop at home</div></div>
                <div className="msg"><i className="av" style={sx({ "--a": "var(--mint)" })}>A</i><div className="bub"><b>Alex · 1:03 PM</b>so are we going or not 😭</div></div>
                <div className="msg"><i className="av" style={sx({ "--a": "var(--rose)" })}>M</i><div className="bub"><b>Maya · 1:15 PM</b>also can someone tell the treasurer about the van</div></div>
              </div>
              <div className="lane-f" id="slowFoot"><span className="typing"><i /><i /><i /></span></div>
            </div>
            <div className="lane fast" data-rv="" style={sx({ "--d": "120ms" })}>
              <div className="lane-h"><span className="sp"><svg className="ic" style={sx({ "width": "15px" })}><use href="#i-spark" /></svg></span><b>Ask Chapt</b><span className="tm" id="tFast">0.0 s</span></div>
              <div className="feed" style={sx({ "justifyContent": "flex-start" })}>
                <div className="ask-q" id="askQ">When’s the next meeting, and what did we decide about the trip?</div>
                <div className="ledger" id="fastSteps">
                  <div className="step">Reading the Timeline <span className="mono">· next 14 days</span></div>
                  <div className="step">Opening the Oct 9 minutes <span className="mono">· 3 decisions</span></div>
                  <div className="step">Checking who owns what <span className="mono">· 3 tasks</span></div>
                </div>
                <div className="verdict" id="fastVerdict">
                  <h4><em className="dt" id="vDate">Wed, Oct 22 · 6:00 PM</em> in Union 210. On Oct 9 you approved the fall trip, $600 from the budget for the van.</h4>
                  <div className="acts">
                    <div className="ai" style={sx({ "transitionDelay": ".05s" })}><span className="t">Book the van</span><span className="to"><i className="av" style={sx({ "--a": "var(--sky)" })}>JT</i>Jordan</span><span className="mono">Fri</span></div>
                    <div className="ai" style={sx({ "transitionDelay": ".12s" })}><span className="t">Trip sign-up form</span><span className="to role">Secretary</span><span className="mono">Mon</span></div>
                    <div className="ai" style={sx({ "transitionDelay": ".19s" })}><span className="t">Sign the trip waiver</span><span className="to all">Everyone · each</span><span className="mono">Nov 1</span></div>
                  </div>
                </div>
                {/* second turn: it does the follow-up, once someone with the permission says yes */}
                <div className="turn2" id="turn2">
                  <div className="ask-q">Log the van deposit and put the waiver deadline on the Timeline.</div>
                  <div className="ledger"><div className="step" id="step2">Drafting 2 changes <span className="mono">· Budget, Timeline</span></div></div>
                  <div className="writ" id="writ">
                    <div className="wr-h"><span>Proposed changes</span><span className="mono">2</span></div>
                    <div className="wr"><span className="pill t-mint">Budget</span><span className="t">Van deposit · fall trip</span><span className="mono out">−$600</span></div>
                    <div className="wr" id="wrDl"><span className="pill t-sky">Timeline</span><span className="t">Trip waiver due · Everyone</span><span className="mono">Nov 1</span></div>
                    <div className="wr-f"><span>Nothing changes until you approve.</span><span className="wr-ok" id="wrOk">Approve</span></div>
                    <div className="stamp" aria-hidden="true">Approved</div>
                  </div>
                </div>
              </div>
              <div className="lane-f" id="fastFoot" />
            </div>
          </div></div>
        </div>
      </section>

      {/* ═════════ 3 · HOW IT WORKS ═════════ */}
      <section className="walk" id="how">
        <div className="wrap walk-in">
          <div>
            <div className="walk-head">
              <span className="eyebrow" style={sx({ "--eb": "var(--sky-ink)" })}>How it works</span>
              <h2 className="sec-h" style={sx({ "marginTop": "18px" })} data-split="">Plan it once. <span className="hi" style={sx({ "--mark": "var(--sky)" })}>Everyone’s in the loop.</span></h2>
            </div>
            <div className="steps" id="steps">
              <div className="st"><span className="n">01 · Timeline</span><h3>Every meeting and event on one line.</h3><p>Meetings, events, socials and deadlines live on a Timeline the whole org can read. Members can subscribe so it shows up in their own Apple or Google calendar.</p><span className="pill t-sky">Syncs to Apple &amp; Google Calendar</span></div>
              <div className="st"><span className="n">02 · Attendance</span><h3>Take attendance in one tap.</h3><p>Open check-in when the meeting starts and members tap in from their phones. Attendance goes on each member’s record, so you finally know who’s actually active.</p><span className="pill t-butter">Excuses reviewed by officers</span></div>
              <div className="st"><span className="n">03 · Tasks</span><h3>Hand it to a person, a role, or everyone.</h3><p>Give a task to Jordan, to whoever is Treasurer, or to the whole roster at once. Tasks given to a role stay with the role, so next year’s treasurer picks them up automatically.</p><span className="pill t-peach">Members who join later get it too</span></div>
              <div className="st"><span className="n">04 · Money</span><h3>A budget the whole board can follow.</h3><p>Allocations, receipts and reimbursements go in one ledger. If your org collects dues, those payments post there too.</p><span className="pill t-mint">Reimbursements approved by officers</span></div>
            </div>
          </div>
          <div className="dv-col">
            <div className="dv-pin">
              <div className="dv-scale" id="dvScale">
                <div className="dv" id="dv">
                  <i className="dv-bg" style={sx({ "background": "var(--card)" })} />
                  <i className="dv-bg" style={sx({ "background": "#FFE5A0", "filter": "var(--note-filter)" })} />
                  <i className="dv-bg" style={sx({ "background": "var(--peach)", "filter": "var(--note-filter)" })} />
                  <i className="dv-bg" style={sx({ "background": "var(--card)" })} />
                  <i className="notch l" /><i className="notch r" />
                  <div className="dv-clip">
                    {/* 1 · timeline */}
                    <div className="dv-l tl">
                      <div className="tl-h"><b>Timeline</b><span className="pill t-lilac">Fall ’26</span></div>
                      <div className="tl-list">
                        <div className="ev" style={sx({ "--c": "var(--sky-ink)" })}><span className="d">Oct<b>9</b></span><span className="t">General meeting<small>Minutes posted · 3 decisions</small></span></div>
                        <div className="today">Today · Oct 20</div>
                        <div className="ev now" id="tlNow" style={sx({ "--c": "var(--sky-ink)" })}><span className="d">Oct<b>22</b></span><span className="t">General meeting<small>Union 210 · moved from Tue</small></span><span className="pill t-sky">Wed</span></div>
                        <div className="ev" style={sx({ "--c": "var(--lilac-ink)" })}><span className="d">Oct<b>25</b></span><span className="t">Build night<small>Eng lab 2</small></span></div>
                        <div className="ev" style={sx({ "--c": "var(--peach-ink)" })}><span className="d">Oct<b>31</b></span><span className="t">Funding request due<small>Deadline · Treasurer</small></span></div>
                        <div className="ev" id="tlDl" style={sx({ "--c": "var(--rose-ink)" })}><span className="d">Nov<b>1</b></span><span className="t">Trip waiver due<small>Deadline · Everyone</small></span></div>
                        <div className="ev" style={sx({ "--c": "var(--mint-ink)" })}><span className="d">Nov<b>8</b></span><span className="t">Fall trip<small>Event · 24 going</small></span></div>
                      </div>
                      <div className="tl-sub"><svg className="ic" style={sx({ "width": "16px", "color": "var(--sky-ink)" })}><use href="#i-cal" /></svg><span><b>Subscribe</b> to the org calendar</span><span className="pill t-sky">31 synced</span></div>
                    </div>
                    {/* 2 · check-in ticket */}
                    <div className="dv-l tk">
                      <div className="tk-stub"><div className="adm">ADMIT<br />ONE</div><div className="mono">General meeting<br />Wed · Oct 22 · 6:00<br />Union 210</div><div className="qr" /></div>
                      <div className="tk-main">
                        <div className="k">Check-in · live</div>
                        <div className="tk-n"><b id="tkN">32</b><span>/ 38 here</span></div>
                        <div className="tk-open"><i />Open · closes 7:00</div>
                        <div className="tk-arr" id="tkArr" />
                      </div>
                    </div>
                    {/* 3 · tasks */}
                    <div className="dv-l nt">
                      <div className="k">Tasks · this week</div>
                      <h4>Who’s on it</h4>
                      <div className="nt-seg" id="ntSeg"><span className="on">A person</span><span>A role</span><span>Everyone</span></div>
                      <ul id="ntList">
                        <li className="hl"><i className="cb" /><span className="tt">Book the van<small>due Fri</small></span><span className="to"><i className="av" style={sx({ "--a": "var(--sky)" })}>JT</i>Jordan</span></li>
                        <li><i className="cb" /><span className="tt">Funding request<small>whoever holds the role</small></span><span className="to role">Treasurer</span></li>
                        <li><i className="cb" /><span className="tt">Sign the trip waiver<span className="ech"><i style={sx({ "--v": "75%" })} id="ntBar" /><span id="ntCnt">18 of 24</span></span></span><span className="to all">Everyone</span></li>
                        <li className="done"><i className="cb" /><span className="tt">Post the recap<small>done Mon</small></span><span className="to role">Social chair</span></li>
                      </ul>
                    </div>
                    {/* 4 · budget */}
                    <div className="dv-l bd">
                      <div className="bd-h"><span className="k">Budget · Fall ’26</span><span className="to role" id="bdRole">Treasurer</span></div>
                      <div className="bd-bal">$1,240<small>left of $2,000</small></div>
                      <div className="bd-stack" id="bdStack"><i style={sx({ "--c": "var(--lilac-ink)" })} data-w="18%" /><i style={sx({ "--c": "var(--peach-ink)" })} data-w="12%" /><i style={sx({ "--c": "var(--sky-ink)" })} data-w="8%" /></div>
                      <div className="bd-leg"><span style={sx({ "--c": "var(--lilac-ink)" })}>Events $360</span><span style={sx({ "--c": "var(--peach-ink)" })}>Food $240</span><span style={sx({ "--c": "var(--sky-ink)" })}>Supplies $160</span></div>
                      <div className="bd-rows">
                        <div className="bd-r"><i className="av" style={sx({ "--a": "var(--mint)" })}>SG</i><span className="lab">Student gov allocation</span><span className="mono in">+$2,000</span></div>
                        <div className="bd-r"><i className="av" style={sx({ "--a": "var(--peach)" })}>AP</i><span className="lab">Reimburse Alex · snacks</span><span className="pill t-mint">Approved</span><span className="mono out">−$43.18</span></div>
                        <div className="bd-r"><i className="av" style={sx({ "--a": "var(--sky)" })}>JT</i><span className="lab">Fall trip · van deposit</span><span className="pill t-lilac">Via Ask Chapt</span><span className="mono out">−$600</span></div>
                      </div>
                      <div className="bd-foot">Collect dues? Turn it on and payments post here too.</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="rail" id="rail"><i className="on" /><i /><i /><i /></div>
            </div>
          </div>
        </div>
      </section>

      {/* ═════════ 4 · THE HANDOFF ═════════ */}
      <section className="sec" id="handoff">
        <div className="wrap ho">
          <div>
            <div className="hd"><span className="eyebrow" style={sx({ "--eb": "var(--peach-ink)" })}>The handoff</span>
            <h2 className="sec-h" style={sx({ "marginTop": "18px" })} data-split="">Your board graduates. <span className="hi" style={sx({ "--mark": "var(--peach)" })}>Your org doesn’t start over.</span></h2>
            <p className="sec-sub" data-rv="">Everything lives with the org, not in last year’s president’s Google Drive. New officers take a role and get its access and its open tasks on day one.</p></div>
            <div className="years" id="years">
              <button className="yr on" data-y="0">2024</button><span className="yr-line"><i /></span>
              <button className="yr" data-y="1">2025</button><span className="yr-line"><i /></span>
              <button className="yr" data-y="2">2026</button>
            </div>
            <div className="board" data-rv="">
              <div className="board-h"><b>Officers</b><span className="pill t-peach" id="boardYr">2024–25 board</span></div>
              <div className="seat"><span className="role">President</span><span className="who" /><span className="new">new</span></div>
              <div className="seat"><span className="role">Treasurer</span><span className="who" /><span className="new">new</span></div>
              <div className="seat"><span className="role">Secretary</span><span className="who" /><span className="new">new</span></div>
              <div className="seat"><span className="role">Events chair</span><span className="who" /><span className="new">new</span></div>
              <div className="board-f"><span className="to role" id="boardRole">Treasurer</span><span id="boardNote">3 open tasks follow the role to whoever holds it</span></div>
            </div>
          </div>
          <div className="stays" data-rv="" style={sx({ "--d": "120ms" })}>
            <div className="stays-h">What stays with the org</div>
            <div className="stay"><span className="tile" style={sx({ "--c": "var(--sky)" })}><svg><use href="#i-doc" /></svg></span><div><b>Docs &amp; the officer handbook</b><small>Folders the next board can actually open</small></div><span className="n" data-st="0">18<small>files</small></span></div>
            <div className="stay"><span className="tile" style={sx({ "--c": "var(--butter)", "--r": "2deg" })}><svg><use href="#i-pen" /></svg></span><div><b>Minutes from every meeting</b><small>Decisions, and who owned them</small></div><span className="n" data-st="1">22<small>meetings</small></span></div>
            <div className="stay"><span className="tile" style={sx({ "--c": "var(--lilac)" })}><svg><use href="#i-key" /></svg></span><div><b>Roles, access &amp; their tasks</b><small>Hand over a seat, not a password</small></div><span className="n" data-st="2">7<small>roles</small></span></div>
            <div className="stay"><span className="tile" style={sx({ "--c": "var(--mint)", "--r": "3deg" })}><svg><use href="#i-cal" /></svg></span><div><b>Calendar, agenda templates &amp; history</b><small>Every past event, and the agendas you reuse</small></div><span className="n" data-st="3">46<small>events</small></span></div>
          </div>
        </div>
      </section>

      {/* ═════════ 5 · TURN ON WHAT YOU RUN ═════════ */}
      <section className="sec" id="fit" style={sx({ "paddingTop": "60px" })}>
        <div className="wrap center">
          <div className="hd"><span className="eyebrow" style={sx({ "--eb": "var(--rose-ink)" })}>Fits your org</span>
          <h2 className="sec-h" style={sx({ "marginTop": "18px" })} data-split="">No box to fit into. <span className="hi" style={sx({ "--mark": "var(--rose)" })}>Just what you do.</span></h2>
          <p className="sec-sub" data-rv="">Tell it what a normal month looks like. You get a page for each thing you do, named the way you’d say it.</p></div>

          <div className="fx" data-rv="">
            <div>
              <div className="fx-q">in a normal month, we…</div>
              <div className="fx-acts" id="fxActs">
                <button className="act" data-p="meetings" style={sx({ "--c": "var(--sky)" })}><span className="bx"><svg><use href="#i-check" /></svg></span><span className="al">hold meetings</span><span className="pg">Meetings</span></button>
                <button className="act" data-p="tasks" style={sx({ "--c": "var(--peach)" })}><span className="bx"><svg><use href="#i-check" /></svg></span><span className="al">hand out tasks</span><span className="pg">Tasks</span></button>
                <button className="act" data-p="treasury" style={sx({ "--c": "var(--mint)" })}><span className="bx"><svg><use href="#i-check" /></svg></span><span className="al">handle money</span><span className="pg">Treasury</span></button>
                <button className="act" data-p="prog" style={sx({ "--c": "var(--lilac)" })}><span className="bx"><svg><use href="#i-check" /></svg></span><span className="al">run events &amp; fundraisers</span><span className="pg">Programming</span></button>
                <button className="act" data-p="parties" style={sx({ "--c": "var(--rose)" })}><span className="bx"><svg><use href="#i-check" /></svg></span><span className="al">throw socials</span><span className="pg">Parties</span></button>
                <button className="act" data-p="service" style={sx({ "--c": "var(--mint)" })}><span className="bx"><svg><use href="#i-check" /></svg></span><span className="al">volunteer</span><span className="pg">Service</span></button>
                <button className="act" data-p="ig" style={sx({ "--c": "var(--peach)" })}><span className="bx"><svg><use href="#i-check" /></svg></span><span className="al">post online</span><span className="pg">Instagram</span></button>
              </div>
            </div>
            <div className="fx-pv" id="fxPv">
              <div className="pv-org"><span className="mark">YO</span><div><b>Your org</b><small>FALL ’26</small></div></div>
              <div id="fxNav" />
              <div className="pv-note" id="fxNote">call it whatever you call it</div>
            </div>
          </div>
          <p className="fx-foot" data-rv=""><b>Change it anytime.</b> Turning a page off hides it and never deletes a thing.</p>
        </div>
      </section>

      {/* ═════════ 6 · PRIVACY · FAQ · CLOSE ═════════ */}
      <section className="priv" id="trust">
        <div className="wrap priv-in">
          <div><span className="eyebrow" style={sx({ "--eb": "var(--butter)" })}>Privacy</span><h2>Private by default.</h2><a className="priv-more" href="/trust">Read how we handle your data <span aria-hidden="true">→</span></a></div>
          <div className="priv-pts">
            <div className="pp" data-rv=""><span className="lk" style={sx({ "--c": "var(--butter)" })}><svg><use href="#i-door" /></svg></span><b>Joining is reviewed</b><p>An invite link files a request. An officer approves it before anyone sees the roster.</p></div>
            <div className="pp" data-rv="" style={sx({ "--d": "80ms" })}><span className="lk" style={sx({ "--c": "var(--lilac)" })}><svg><use href="#i-lock" /></svg></span><b>Every org walled off</b><p>One account works across all your orgs, and none of them can read another’s data.</p></div>
          </div>
        </div>
      </section>

      <section className="sec" id="faq">
        <div className="wrap center">
          <div className="hd"><span className="eyebrow">Questions</span>
          <h2 className="sec-h" style={sx({ "marginTop": "18px" })} data-split="">Before you bring it to <span className="hi">your board.</span></h2></div>
          <div className="faq" id="faqList">
            <div className="qa open"><button aria-expanded={true}>Is it free to start?<i className="pm" /></button><div className="ans"><div><p>Yes. Set up your org, invite members and start a semester for free, up to 4 members. Paid plans are priced by roster size.</p></div></div></div>
            <div className="qa"><button aria-expanded={false}>Is this just for Greek life?<i className="pm" /></button><div className="ans"><div><p>No. Setup starts with a few quick questions about how your org runs, and {APP_NAME} builds your pages from the answers. A robotics club and a fraternity each get a setup made for what they actually do.</p></div></div></div>
            <div className="qa"><button aria-expanded={false}>Does everyone get to change everything?<i className="pm" /></button><div className="ans"><div><p>No. Access comes with the role, not the person. Give your Treasurer role control of the money, your Secretary the docs and minutes, and your Social Chair the events, and everyone else just sees what’s theirs.</p></div></div></div>
            <div className="qa"><button aria-expanded={false}>What happens when our officers graduate?<i className="pm" /></button><div className="ans"><div><p>Move the role to the new officer. They get its access and its open tasks on day one, and the docs, minutes and calendar stay exactly where they were.</p></div></div></div>
            <div className="qa"><button aria-expanded={false}>How do our members get in?<i className="pm" /></button><div className="ans"><div><p>An officer sends an invite link. Members sign in with Google, and the request lands in front of an officer to approve, so nobody ends up on your roster without someone saying yes.</p></div></div></div>
          </div>
        </div>
      </section>

      <section className="close" id="start">
        <div className="wrap" style={sx({ "position": "relative" })}>
          <h2 className="close-h" id="closeH">Tie up the loose ends before your next meeting.</h2>
          <div className="cta-row">
            <a className="btn btn--lg" href="/create">Start your org, free <svg className="ic"><use href="#i-arrow" /></svg></a>
            <a className="btn btn--ghost btn--lg" href="/contact">Talk to us</a>
          </div>
          <div className="url">chaptos.com</div>
        </div>
      </section>
      </main>

      <footer>
        <div className="wrap">
          <div className="ft">
            <div><a className="brand" href="#top" style={sx({ "padding": "0" })}><svg className="logo"><use href="#i-logo" /></svg>{APP_NAME}</a><p>One place for every student org that outgrew its group chat.</p></div>
            <div><h5>Product</h5><a href="#ask">Ask Chapt</a><a href="#how">Treasury &amp; dues</a><a href="#how">Roster &amp; standing</a><a href="#how">Timeline &amp; meetings</a><a href="#how">Docs &amp; activity</a></div>
            <div><h5>For</h5><a href="/for/fraternities-sororities">Fraternities &amp; sororities</a><a href="/for/club-teams">Club &amp; intramural teams</a><a href="/for/service-orgs">Service &amp; volunteer orgs</a><a href="/for/performing-arts">Bands, choirs &amp; theatre</a><a href="/for/student-government">Student government</a><a href="/for/custom">Custom &amp; anything else</a></div>
            <div><h5>Company</h5><a href="/trust">Trust &amp; privacy</a><a href="/pricing">Pricing</a><a href="/help">Help center</a><a href="/blog">Blog</a><a href="/contact">Talk to a human</a></div>
          </div>
          <div className="ft-b"><span>© {new Date().getFullYear()} {APP_NAME} · chaptos.com</span><span>Made for meeting night, every week.</span></div>
        </div>
      </footer>

      <div className="mbar" id="mbar"><div><b>Run your org here</b><small>Free to start</small></div><a className="btn btn--sm" href="/create">Start</a></div>
    
      <LandingMotion />
    </div>
  );
}
