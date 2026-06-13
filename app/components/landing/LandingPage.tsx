// Marketing landing page, rendered at "/" for signed-out visitors (signed-in
// users never see this — app/page.tsx redirects them into their org first).
//
// Design: "Dark Editorial, elevated" — the same warm-paper / Fraunces / violet
// language as the pre-auth pages (.auth-scope), scaled up to marketing display
// type with an inverted ivory chapter. Every product visual is a hand-built
// HTML/CSS vignette (no screenshots), so the page stays sharp at every DPI and
// ships zero image bytes. All vignettes are aria-hidden decoration; the real
// content is the copy around them.
import Link from "next/link";
import { APP_NAME } from "@/lib/domains";
import { Reveal } from "./Reveal";
import { Parallax, Tilt } from "./motion";
import "./landing.css";

export function LandingPage() {
  return (
    <div className="lp">
      {/* JS-off fallback: reveal everything immediately. */}
      <noscript>
        <style>{`.lp-reveal{opacity:1;transform:none}`}</style>
      </noscript>

      <Topbar />

      <main>
        <Hero />
        <StatsStrip />
        <Pillars />
        <WorkflowGrid />
        <Intelligence />
        <IvorySteps />
        <FinalCta />
      </main>

      <Footer />
    </div>
  );
}

/* ── Chrome ──────────────────────────────────────────────────────────────── */

function Topbar() {
  return (
    <header className="lp-topbar">
      <div className="lp-topbar-inner">
        <Link href="/" className="lp-wordmark" aria-label={`${APP_NAME} home`}>
          <span className="lp-glyph" aria-hidden="true">C</span>
          <span className="lp-wm-txt">{APP_NAME}</span>
        </Link>
        <nav className="lp-nav" aria-label="Sections">
          <a href="#product">Product</a>
          <a href="#workflows">Workflows</a>
          <a href="#intelligence">AI</a>
        </nav>
        <div className="lp-topbar-actions">
          <Link href="/login" className="lp-signin">Sign in</Link>
          <Link href="/login" className="lp-btn lp-btn-primary lp-btn-sm">
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-container lp-footer-inner">
        <div className="lp-wordmark">
          <span className="lp-glyph" aria-hidden="true">C</span>
          <span className="lp-wm-txt">{APP_NAME}</span>
        </div>
        <div className="links">
          <a href="#product">Product</a>
          <a href="#workflows">Workflows</a>
          <a href="#intelligence">AI</a>
          <Link href="/login">Sign in</Link>
        </div>
        <div className="legal">© {new Date().getFullYear()} {APP_NAME}</div>
      </div>
    </footer>
  );
}

/* ── Hero ────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="lp-hero">
      {/* Misty-lake sunrise photo, scrimmed into the page palette. Bleeds up
          behind the translucent topbar; fades to --paper before the mockup. */}
      <div className="lp-hero-bg" aria-hidden="true">
        <div className="img" />
      </div>
      <div className="lp-container">
        <div className="lp-rise d1">
          <span className="lp-hero-eyebrow">
            <span className="dot" aria-hidden="true" />
            The AI-native operating system for student orgs
          </span>
        </div>
        <h1 className="lp-h1 lp-rise d2">
          Run your chapter like an <em>institution</em>.
        </h1>
        <p className="lp-hero-lede lp-rise d3">
          Dues, attendance, programming, people — one calm, intelligent home
          with an AI that handles the busywork, so your time goes back to why
          you joined. If it has members and a mission, {APP_NAME}{" "}
          runs it.
        </p>
        <div className="lp-hero-ctas lp-rise d4">
          <Link href="/login" className="lp-btn lp-btn-primary">
            Start your chapter
            <ArrowRight />
          </Link>
          <a href="#product" className="lp-btn lp-btn-ghost">
            See the product
          </a>
        </div>
        <p className="lp-hero-micro lp-rise d4">
          Set up in minutes<span aria-hidden="true">·</span>One link to invite
          the roster<span aria-hidden="true">·</span>Sign in with Google
        </p>

        {/* Mockup gets a pointer tilt; the glass notification cards float
            around it on their own parallax speeds, so the stage gains depth
            the moment the page scrolls or the cursor moves. */}
        <div className="lp-mock-wrap">
          <div className="lp-mock-stage">
            <Tilt max={3}>
              <HeroMock />
            </Tilt>
            <Parallax speed={0.14} className="lp-float-pos pos-pay">
              <div className="lp-float tilt-l" aria-hidden="true">
                <span className="fic ok"><CheckIcon /></span>
                <span>
                  <span className="ft">Dues received</span>
                  <span className="fs" style={{ display: "block" }}>Jordan Tran — $120.00</span>
                </span>
                <span className="ftime">now</span>
              </div>
            </Parallax>
            <Parallax speed={0.22} className="lp-float-pos pos-att">
              <div className="lp-float tilt-r" aria-hidden="true">
                <span className="fic vio"><IconUsersSmall /></span>
                <span>
                  <span className="ft">Chapter check-in</span>
                  <span className="fs" style={{ display: "block" }}>41 of 46 present · 89%</span>
                </span>
              </div>
            </Parallax>
            <Parallax speed={0.08} className="lp-float-pos pos-event">
              <div className="lp-float tilt-r" aria-hidden="true">
                <span className="fic rose"><IconCalendarSmall /></span>
                <span>
                  <span className="ft">Event published</span>
                  <span className="fs" style={{ display: "block" }}>Alumni mixer · Fri 6:30 PM</span>
                </span>
              </div>
            </Parallax>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Idealized dashboard vignette — pure HTML/CSS/SVG, decoration only. */
function HeroMock() {
  return (
    <div className="lp-mock" aria-hidden="true">
      <div className="lp-chrome">
        <div className="lp-chrome-dots">
          <span /><span /><span />
        </div>
        <div className="lp-chrome-url">chaptos.app/lambda-phi</div>
        <div className="lp-chrome-dots" style={{ visibility: "hidden" }}>
          <span /><span /><span />
        </div>
      </div>
      <div className="lp-mock-body">
        <div className="lp-mock-side">
          <div className="org">
            <span className="badge">ΛΦ</span>
            <span className="name">Lambda Phi</span>
          </div>
          <div className="group">Overview</div>
          <div className="lp-mock-nav-item active"><NavDot />Dashboard</div>
          <div className="lp-mock-nav-item"><NavDot />Timeline</div>
          <div className="group">Members</div>
          <div className="lp-mock-nav-item"><NavDot />Brotherhood</div>
          <div className="lp-mock-nav-item"><NavDot />Chapter</div>
          <div className="group">Operations</div>
          <div className="lp-mock-nav-item"><NavDot />Treasury</div>
          <div className="lp-mock-nav-item"><NavDot />Programming</div>
          <div className="lp-mock-nav-item"><NavDot />Service</div>
          <div className="lp-mock-nav-item"><NavDot />Docs</div>
        </div>
        <div className="lp-mock-main">
          <div className="lp-mock-header">
            <div className="hi">Good evening, Lambda Phi</div>
            <div className="sem">Spring ’26</div>
          </div>
          <div className="lp-kpis">
            <div className="lp-kpi">
              <div className="k">Attendance</div>
              <div className="v">92%</div>
              <div className="d up">▲ 4.2% vs last month</div>
            </div>
            <div className="lp-kpi">
              <div className="k">Dues collected</div>
              <div className="v">$18,440</div>
              <div className="d up">▲ 12 of 14 paid</div>
            </div>
            <div className="lp-kpi">
              <div className="k">Chapter GPA</div>
              <div className="v">3.42</div>
              <div className="d flat">— steady</div>
            </div>
            <div className="lp-kpi">
              <div className="k">Service hours</div>
              <div className="v">312</div>
              <div className="d up">▲ 38 this month</div>
            </div>
          </div>
          <div className="lp-mock-chart">
            <div className="row">
              <span className="t">Net balance</span>
              <span className="amt">$12,480</span>
            </div>
            <BalanceChart />
          </div>
          <div className="lp-mock-cols">
            <div className="lp-mock-panel">
              <div className="pt">This week</div>
              <div className="lp-mock-row" style={{ borderTop: 0 }}>
                <span className="date">THU</span>
                Chapter meeting
                <span className="spacer" />
                <span className="meta">7:00 PM</span>
              </div>
              <div className="lp-mock-row">
                <span className="date">FRI</span>
                Alumni mixer
                <span className="spacer" />
                <span className="meta">6:30 PM</span>
              </div>
              <div className="lp-mock-row">
                <span className="date">SAT</span>
                Beach cleanup
                <span className="spacer" />
                <span className="meta">9:00 AM</span>
              </div>
            </div>
            <div className="lp-mock-panel">
              <div className="pt">Dues</div>
              <div className="lp-mock-row" style={{ borderTop: 0 }}>
                <span className="lp-ava" style={{ background: "#7c5cd4" }}>MK</span>
                Marcus Kim
                <span className="spacer" />
                <span className="lp-pill ok">Paid</span>
              </div>
              <div className="lp-mock-row">
                <span className="lp-ava" style={{ background: "#4f8a6b" }}>DR</span>
                Diego Reyes
                <span className="spacer" />
                <span className="lp-pill ok">Paid</span>
              </div>
              <div className="lp-mock-row">
                <span className="lp-ava" style={{ background: "#a8743d" }}>JT</span>
                Jordan Tran
                <span className="spacer" />
                <span className="lp-pill owe">Owes $120</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BalanceChart({ color = "#A78BFA", gid = "lpGrad" }: { color?: string; gid?: string }) {
  return (
    <svg viewBox="0 0 560 130" fill="none" role="presentation">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[26, 56, 86].map(y => (
        <line
          key={y}
          x1="0"
          y1={y}
          x2="560"
          y2={y}
          stroke="rgba(236,231,221,0.06)"
          strokeDasharray="3 5"
        />
      ))}
      <path
        d="M0,104 C40,98 70,92 110,86 C150,80 180,90 220,78 C260,66 290,72 330,58 C370,44 400,52 440,38 C480,24 520,28 560,16 L560,130 L0,130 Z"
        fill={`url(#${gid})`}
      />
      <path
        d="M0,104 C40,98 70,92 110,86 C150,80 180,90 220,78 C260,66 290,72 330,58 C370,44 400,52 440,38 C480,24 520,28 560,16"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="560" cy="16" r="3.5" fill={color} />
    </svg>
  );
}

/* ── Stats strip ─────────────────────────────────────────────────────────── */

function StatsStrip() {
  return (
    <section className="lp-section" style={{ paddingTop: 0 }}>
      <div className="lp-container">
        <Reveal>
          <div className="lp-stats">
            <div className="lp-stat hue-vio">
              <div className="n">One <em>home</em>.</div>
              <p className="c">Money, meetings, events, service, docs, people — every workflow your org runs on, in a single source of truth.</p>
            </div>
            <div className="lp-stat hue-gold">
              <div className="n">Built by <em>AI</em>.</div>
              <p className="c">Describe your org once and the AI architects your whole workspace — workflows, roles, vocabulary — before your next meeting.</p>
            </div>
            <div className="lp-stat hue-green">
              <div className="n">An agent on <em>exec board</em>.</div>
              <p className="c">Ask it anything, hand it the busywork — it answers from your real data and drafts the changes for one-tap approval.</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Feature pillars ─────────────────────────────────────────────────────── */

function Pillars() {
  return (
    <section className="lp-section" id="product" style={{ paddingTop: 0 }}>
      <div className="lp-container">
        <Reveal>
          <div className="lp-section-head">
            <span className="lp-eyebrow">The system</span>
            <h2 className="lp-h2">
              Everything your exec board touches, <em>finally in one place</em>.
            </h2>
            <p className="lp-lede">
              The treasurer&apos;s spreadsheet, the secretary&apos;s sign-in
              sheet, the social chair&apos;s group chat — {APP_NAME} replaces
              the patchwork with one system the whole chapter can trust.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className="lp-pillar" data-accent="gold">
            <div className="lp-pillar-copy">
              <span className="lp-pillar-kicker">Treasury</span>
              <h3>Money, <em>accounted for</em>.</h3>
              <p>
                Every due, fine, and reimbursement in one ledger. See who&apos;s
                paid at a glance, watch the balance trend across the semester,
                and close the books without a single formula.
              </p>
              <ul className="lp-pillar-points">
                <li>Per-member dues statuses that update themselves</li>
                <li>Semester-over-semester balance trends</li>
                <li>A paper trail for every dollar</li>
              </ul>
            </div>
            <div className="lp-pillar-visual">
              <TreasuryVignette />
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="lp-pillar flip">
            <div className="lp-pillar-copy">
              <span className="lp-pillar-kicker">Chapter &amp; attendance</span>
              <h3>Meetings that <em>run themselves</em>.</h3>
              <p>
                Take attendance in seconds, not minutes. Momentum builds
                automatically — see who shows up, who&apos;s slipping, and how
                the chapter trends across the whole semester.
              </p>
              <ul className="lp-pillar-points">
                <li>One-tap check-ins at every meeting</li>
                <li>Attendance history per member, per semester</li>
                <li>Health signals before problems become problems</li>
              </ul>
            </div>
            <div className="lp-pillar-visual">
              <AttendanceVignette />
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="lp-pillar" data-accent="rose">
            <div className="lp-pillar-copy">
              <span className="lp-pillar-kicker">Programming</span>
              <h3>From idea to <em>calendar</em>.</h3>
              <p>
                Plan the semester on a stage board — pitch it, plan it, put it
                on the calendar. Everyone sees what&apos;s coming, who owns it,
                and what still needs a venue.
              </p>
              <ul className="lp-pillar-points">
                <li>Stage-based planning from pitch to published</li>
                <li>Owners, dates, and budgets on every event</li>
                <li>Promote to the chapter calendar when it&apos;s real</li>
              </ul>
            </div>
            <div className="lp-pillar-visual">
              <ProgrammingVignette />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function TreasuryVignette() {
  return (
    <div className="lp-vignette" aria-hidden="true">
      <div className="vt">
        Semester balance
        <span className="amt">$12,480</span>
      </div>
      <BalanceChart color="#DDB36A" gid="lpGradGold" />
      <div className="lp-mock-row" style={{ marginTop: 10 }}>
        <span className="lp-ava" style={{ background: "#7c5cd4" }}>MK</span>
        Marcus Kim
        <span className="spacer" />
        <span className="meta">Spring dues</span>
        <span className="lp-pill ok">Paid</span>
      </div>
      <div className="lp-mock-row">
        <span className="lp-ava" style={{ background: "#b35d7a" }}>AS</span>
        Aisha Singh
        <span className="spacer" />
        <span className="meta">Spring dues</span>
        <span className="lp-pill ok">Paid</span>
      </div>
      <div className="lp-mock-row">
        <span className="lp-ava" style={{ background: "#a8743d" }}>JT</span>
        Jordan Tran
        <span className="spacer" />
        <span className="meta">Spring dues</span>
        <span className="lp-pill owe">Owes $120</span>
      </div>
    </div>
  );
}

function AttendanceVignette() {
  const rows = [
    { who: "Chapter meeting", pct: 92 },
    { who: "Brotherhood night", pct: 88 },
    { who: "Service Saturday", pct: 74 },
    { who: "Alumni mixer", pct: 81 },
  ];
  return (
    <div className="lp-vignette" aria-hidden="true">
      <div className="vt">
        Turnout · last 4 events
        <span className="amt">84%</span>
      </div>
      {rows.map(r => (
        <div key={r.who} className="lp-att-row">
          <span className="who">{r.who}</span>
          <span className="lp-att-bar"><i style={{ width: `${r.pct}%` }} /></span>
          <span className="pct">{r.pct}%</span>
        </div>
      ))}
    </div>
  );
}

function ProgrammingVignette() {
  return (
    <div className="lp-vignette" aria-hidden="true">
      <div className="vt">Spring programming</div>
      <div className="lp-board">
        <div className="lp-board-col">
          <div className="bt"><span className="stage-dot" style={{ background: "#D98BA3" }} />Idea <span className="cnt">3</span></div>
          <div className="lp-board-card">
            <div className="n">Casino night</div>
            <div className="m">No owner yet</div>
          </div>
          <div className="lp-board-card">
            <div className="n">Intramural league</div>
            <div className="m">Needs budget</div>
          </div>
        </div>
        <div className="lp-board-col">
          <div className="bt"><span className="stage-dot" style={{ background: "#D9A05B" }} />Planned <span className="cnt">2</span></div>
          <div className="lp-board-card">
            <div className="n">Alumni mixer</div>
            <div className="m">Fri · D. Reyes</div>
          </div>
          <div className="lp-board-card">
            <div className="n">Beach cleanup</div>
            <div className="m">Sat · Service</div>
          </div>
        </div>
        <div className="lp-board-col">
          <div className="bt"><span className="stage-dot" style={{ background: "#7FB08A" }} />Live <span className="cnt">1</span></div>
          <div className="lp-board-card">
            <div className="n">Chapter meeting</div>
            <div className="m">Thu · Weekly</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Workflow bento ──────────────────────────────────────────────────────── */

/** Cell scaffolding: numbered editorial header, then title/copy, then an
 *  optional aria-hidden micro-visual pinned to the cell's bottom edge. */
function WfCell({
  num,
  hue,
  icon,
  title,
  desc,
  children,
}: {
  num: string;
  hue: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="lp-bcell" style={{ "--cell": hue } as React.CSSProperties}>
      <div className="bhead">
        <span className="ic">{icon}</span>
        <span className="bnum">{num}</span>
      </div>
      <h3>{title}</h3>
      <p>{desc}</p>
      {children && (
        <div className="bmini" aria-hidden="true">
          {children}
        </div>
      )}
    </div>
  );
}

function WorkflowGrid() {
  return (
    <section className="lp-section lp-wfband" id="workflows">
      <div className="lp-container">
        <Reveal>
          <div className="lp-section-head centered">
            <span className="lp-eyebrow centered">Workflows</span>
            <h2 className="lp-h2">
              Whatever your org runs on, <em>it runs here</em>.
            </h2>
            <p className="lp-lede">
              Treasury to timeline, rush week to alumni weekend — {APP_NAME}{" "}
              covers the full life of an organization, then shapes itself to
              yours. Turn on what you need today; everything else is one toggle
              away when you grow into it.
            </p>
          </div>
        </Reveal>
        <div className="lp-bento">
          <Reveal className="lp-bspan-3">
            <WfCell
              num="01"
              hue="#DDB36A"
              icon={<IconDollar />}
              title="Treasury"
              desc="Dues, fines, budgets, and balances — the full financial picture."
            >
              <div className="brow">
                <span>Semester balance</span>
                <span className="bamt">$12,480</span>
              </div>
              <BalanceChart color="#DDB36A" gid="lpWfSpark" />
            </WfCell>
          </Reveal>
          <Reveal className="lp-bspan-3" delay={70}>
            <WfCell
              num="02"
              hue="#A78BFA"
              icon={<IconUsers />}
              title="Brotherhood"
              desc="The living roster: roles, standing, and every member's story."
            >
              <div className="bavas">
                <span className="lp-ava" style={{ background: "#7c5cd4" }}>MK</span>
                <span className="lp-ava" style={{ background: "#4f8a6b" }}>DR</span>
                <span className="lp-ava" style={{ background: "#a8743d" }}>JT</span>
                <span className="lp-ava" style={{ background: "#b35d7a" }}>AS</span>
                <span className="lp-ava" style={{ background: "#5b7fb3" }}>CW</span>
                <span className="more">+41</span>
              </div>
              <div className="brow">
                <span>46 members</span>
                <span className="bamt">7 exec roles</span>
              </div>
            </WfCell>
          </Reveal>
          <Reveal className="lp-bspan-2">
            <WfCell
              num="03"
              hue="#7FB08A"
              icon={<IconCalendarCheck />}
              title="Chapter"
              desc="Meetings and one-tap attendance, archived by semester."
            >
              <div className="bbar">
                <span className="who">Chapter meeting</span>
                <span className="track"><i style={{ width: "92%" }} /></span>
                <span className="pct">92%</span>
              </div>
              <div className="bbar">
                <span className="who">Service Saturday</span>
                <span className="track"><i style={{ width: "74%" }} /></span>
                <span className="pct">74%</span>
              </div>
            </WfCell>
          </Reveal>
          <Reveal className="lp-bspan-2" delay={70}>
            <WfCell
              num="04"
              hue="#7EA6E0"
              icon={<IconKanban />}
              title="Programming"
              desc="Stage-based event planning, from first pitch to the calendar."
            >
              <div className="bstages">
                <span><i style={{ background: "#D98BA3" }} />Idea 3</span>
                <span><i style={{ background: "#D9A05B" }} />Planned 2</span>
                <span><i style={{ background: "#7FB08A" }} />Live 1</span>
              </div>
            </WfCell>
          </Reveal>
          <Reveal className="lp-bspan-2" delay={140}>
            <WfCell
              num="05"
              hue="#D98BA3"
              icon={<IconHeart />}
              title="Service"
              desc="Hours logged per member, tallied for the chapter automatically."
            >
              <div className="bstat">
                312<span>hours this semester</span>
              </div>
            </WfCell>
          </Reveal>
          <Reveal className="lp-bspan-2">
            <WfCell
              num="06"
              hue="#E09A6A"
              icon={<IconSparkles />}
              title="Parties"
              desc="Guest lists, capacity, and risk — handled before the doors open."
            />
          </Reveal>
          <Reveal className="lp-bspan-2" delay={70}>
            <WfCell
              num="07"
              hue="#6FB5AC"
              icon={<IconFile />}
              title="Docs"
              desc="Bylaws, minutes, and links in one shared, organized library."
            />
          </Reveal>
          <Reveal className="lp-bspan-2" delay={140}>
            <WfCell
              num="08"
              hue="#E0B65C"
              icon={<IconMegaphone />}
              title="Communications"
              desc="Announcements pinned where the whole chapter will see them."
            />
          </Reveal>
          <Reveal className="lp-bspan-6">
            <div className="lp-bcell is-strip" style={{ "--cell": "#9BA7E0" } as React.CSSProperties}>
              <div className="bhead">
                <span className="ic"><IconHistory /></span>
                <span className="bnum">09</span>
              </div>
              <div className="bcopy">
                <h3>Timeline</h3>
                <p>Every change in the chapter, on the record and searchable.</p>
              </div>
              <div className="blog" aria-hidden="true">
                <span><i />Dues received — Marcus Kim<em>2m</em></span>
                <span><i />Attendance closed — 41 of 46<em>1h</em></span>
                <span><i />Alumni mixer published<em>3h</em></span>
              </div>
            </div>
          </Reveal>
        </div>
        <Reveal>
          <p className="lp-grid-note">
            Toggle workflows as your org grows · the AI works across all of them
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Intelligence ────────────────────────────────────────────────────────── */

function Intelligence() {
  return (
    <section className="lp-section lp-intelband" id="intelligence">
      <div className="lp-container">
        <div className="lp-intel">
          <Reveal>
            <div>
              <span className="lp-eyebrow">Agentic AI, built in</span>
              <h2 className="lp-h2">
                Ask anything. <em>Delegate everything.</em>
              </h2>
              <p className="lp-lede">
                {/* {" "} is load-bearing: this Next's JSX transform drops the
                    plain space between the expression and the following text
                    here (the sibling paragraphs keep theirs — quirk). */}
                Your roster, your books, your calendar — {APP_NAME}{" "}
                already knows, so you can just ask. Who owes dues? How was
                turnout last week? Answers in seconds, grounded in your
                chapter&apos;s real data — never a generic chatbot guess.
              </p>
              <p className="lp-lede" style={{ marginTop: 14 }}>
                {/* Same space-drop quirk as above. */}
                Then hand it the work. Schedule the mixer, log the
                reimbursement, mark dues paid — {APP_NAME}{" "}
                drafts the change across any workflow and you approve it with
                one tap. You stay in charge; it does the typing.
              </p>
              <p className="lp-lede" style={{ marginTop: 14 }}>
                It&apos;s even your first hire: describe your organization in a
                sentence and the AI architects your workspace — workflows,
                roles, even your vocabulary.
              </p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <Parallax speed={0.06}>
            <div className="lp-chat" aria-hidden="true">
              <div className="q">Who still owes dues this semester?</div>
              <div className="a">
                Two brothers have an outstanding balance for Spring ’26 —
                everyone else is paid in full.
                <div className="sub">
                  <span>
                    <span className="lp-ava" style={{ background: "#a8743d" }}>JT</span>
                    Jordan Tran
                    <span className="amt">$120</span>
                  </span>
                  <span>
                    <span className="lp-ava" style={{ background: "#5b7fb3" }}>CW</span>
                    Chris Walker
                    <span className="amt">$60</span>
                  </span>
                </div>
              </div>
              <div className="q">How was turnout at last week&apos;s chapter?</div>
              <div className="a">
                41 of 46 brothers — 89%, up six points from the week before.
              </div>
              <div className="q">Put the alumni mixer on the calendar — Friday, 6:30.</div>
              <div className="a">
                Drafted and ready — approve it and it&apos;s live for the whole
                chapter.
                <div className="sub">
                  <span>
                    <span className="lp-ava" style={{ background: "#5b7fb3" }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M8 2v4" />
                        <path d="M16 2v4" />
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <path d="M3 10h18" />
                      </svg>
                    </span>
                    Alumni mixer · Fri 6:30 PM
                    <span className="lp-pill ok" style={{ marginLeft: "auto" }}>Approve</span>
                  </span>
                </div>
              </div>
              <div className="lp-chat-bar">
                <span className="caret" />
                Ask anything — or hand it the task…
                <span className="send"><ArrowUp /></span>
              </div>
            </div>
            </Parallax>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ── Ivory steps ─────────────────────────────────────────────────────────── */

function IvorySteps() {
  return (
    <section className="lp-ivory">
      <div className="lp-container lp-section">
        <Reveal>
          <div className="lp-section-head">
            <span className="lp-eyebrow">Getting started</span>
            <h2 className="lp-h2">
              Running before your <em>next meeting</em>.
            </h2>
          </div>
        </Reveal>
        <div className="lp-steps">
          <Reveal delay={0}>
            <div className="lp-step">
              <div className="num">01</div>
              <h3>Describe your org</h3>
              <p>
                A short AI interview architects your workspace — the right
                workflows, the right roles, even the words your org uses. No
                forms, no setup wizard, no IT person.
              </p>
            </div>
          </Reveal>
          <Reveal delay={90}>
            <div className="lp-step">
              <div className="num">02</div>
              <h3>Send one link</h3>
              <p>
                Members join with Google in seconds. Roles and permissions come
                pre-seeded, so the exec board is exec from day one.
              </p>
            </div>
          </Reveal>
          <Reveal delay={180}>
            <div className="lp-step">
              <div className="num">03</div>
              <h3>Run the semester</h3>
              <p>
                Dues, attendance, programming, service — live from the first
                meeting, with an AI teammate answering questions and drafting
                the busywork while everyone looks at the same truth.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ── Final CTA ───────────────────────────────────────────────────────────── */

function FinalCta() {
  return (
    <section className="lp-final">
      <div className="lp-container">
        <Reveal>
          <span className="lp-eyebrow centered">Ready when you are</span>
          <h2 className="lp-h2">
            Give your org an operating system — <em>and an AI to run it with</em>.
          </h2>
          <div className="lp-hero-ctas">
            <Link href="/login" className="lp-btn lp-btn-glow">
              Start your chapter
              <ArrowRight />
            </Link>
          </div>
          <p className="lp-hero-micro">
            Set up in minutes<span aria-hidden="true">·</span>AI included
            <span aria-hidden="true">·</span>Sign in with Google
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Icons (Lucide-style, 1.5px stroke) ──────────────────────────────────── */

function SvgBase({ children, size = 20 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function ArrowRight() {
  return (
    <SvgBase size={16}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </SvgBase>
  );
}

function ArrowUp() {
  return (
    <SvgBase size={13}>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </SvgBase>
  );
}

function NavDot() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <circle cx="5" cy="5" r="2" fill="currentColor" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <SvgBase size={15}>
      <path d="M20 6 9 17l-5-5" />
    </SvgBase>
  );
}

function IconUsersSmall() {
  return (
    <SvgBase size={15}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </SvgBase>
  );
}

function IconCalendarSmall() {
  return (
    <SvgBase size={15}>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
    </SvgBase>
  );
}

function IconDollar() {
  return (
    <SvgBase>
      <path d="M12 2v20" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </SvgBase>
  );
}

function IconUsers() {
  return (
    <SvgBase>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </SvgBase>
  );
}

function IconCalendarCheck() {
  return (
    <SvgBase>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
      <path d="m9 16 2 2 4-4" />
    </SvgBase>
  );
}

function IconKanban() {
  return (
    <SvgBase>
      <path d="M5 3v14" />
      <path d="M12 3v8" />
      <path d="M19 3v18" />
    </SvgBase>
  );
}

function IconHeart() {
  return (
    <SvgBase>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
    </SvgBase>
  );
}

function IconSparkles() {
  return (
    <SvgBase>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
    </SvgBase>
  );
}

function IconFile() {
  return (
    <SvgBase>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </SvgBase>
  );
}

function IconMegaphone() {
  return (
    <SvgBase>
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </SvgBase>
  );
}

function IconHistory() {
  return (
    <SvgBase>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </SvgBase>
  );
}
