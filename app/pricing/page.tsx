// Pricing — the public page. A 1:1 port of _design/Pricing Paper Mock.html;
// only the nav and footer are the shared public chrome instead of the mock's.
//
// Every number on this page is derived from lib/billing/tiers.ts, the same
// module the app charges from and scripts/stripe-setup.ts builds the Stripe
// Price out of. An earlier version of this copy drifted into saying "free under
// 25 members, $29/term" while the app charged $25/month above 4, so nothing here
// is a hand-typed figure.
//
// ACCURACY, same standard as the help centre. Each claim was checked against
// the code rather than assumed:
//   · "every feature on every plan" — there is no tier gating anywhere in this
//     codebase. enabledWorkflows and disabledFeatures are org config, not plan.
//   · "only growth stops" — PaymentRequiredError is raised on growth paths only
//     (lib/billing/guard.ts; see its doc comment in lib/errors/index.ts).
//   · who counts — lib/billing/seats.ts: active roster rows; archived members
//     and pending JoinRequests (which create no Membership) don't.
//   · admin-only billing — assertCanManageBilling.
//   · group plans — GROUP_PLAN_ORG_THRESHOLD = 2 in billing-service.ts.
//   · promo codes — checkout allows promotion codes.
// The roster names, the crowd and the queue are illustrative.
import type { Metadata } from "next";

import "../components/landing/landing.css";
import "../components/landing/public-chrome.css";
import "./pricing.css";

import { sx } from "../components/landing/Doodle";
import { DoodleSprite } from "../components/landing/DoodleSprite";
import { landingFontClass } from "../components/landing/fonts";
import { PublicNav } from "../components/landing/PublicChrome";
import { Footer } from "../components/landing/sections/Footer";
import { PricingMotion } from "./PricingMotion";
import { APP_NAME } from "@/lib/domains";
import { BILLING_BANDS, SELF_SERVE_MAX, formatPrice, formatRange, tierForCount, type BillingBand } from "@/lib/billing/tiers";

const [FREE, STANDARD, PRO, CUSTOM] = BILLING_BANDS;

export const metadata: Metadata = {
  title: `Pricing — ${APP_NAME}`,
  description:
    `Free for organizations of ${FREE.upTo} or fewer. ` +
    `${formatPrice(STANDARD.priceCents)} a month above that, for the whole organization. ` +
    "Every feature included at every price.",
};

/** "$25" / "$0" / "Quoted" — the mock says Quoted where tiers.ts says Custom. */
const price = (b: BillingBand) => (b.priceCents === null ? "Quoted" : formatPrice(b.priceCents));
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const word = (n: number) => WORDS[n] ?? String(n);

/** Pastel per band, ascending. Shared with PricingMotion through data-tone. */
const TONE = ["butter", "sky", "lilac", "rose"] as const;

const BAND_COPY: { blurb: string; mini: string; icon: string }[] = [
  { blurb: `${word(FREE.upTo ?? 4).replace(/^./, c => c.toUpperCase())} seats for every org, for good. Enough for a board to set things up.`, mini: "No card, no checkout", icon: "d-check" },
  { blurb: `Same price at ${word(STANDARD.from)} people or ${STANDARD.upTo === 50 ? "fifty" : STANDARD.upTo}.`, mini: `Same product as ${FREE.label}`, icon: "d-check" },
  { blurb: `For the big houses, up to ${PRO.upTo}.`, mini: `Same product as ${FREE.label}`, icon: "d-check" },
  { blurb: `Past ${SELF_SERVE_MAX}, a person quotes you — not a checkout.`, mini: "Talk to us", icon: "d-chat" },
];

const FEATS: [string, string, string][] = [
  ["d-people", "Roster & join requests", "Invite links, reviewed approvals, roles"],
  ["d-wallet", "Dues", "Who owes what, per member"],
  ["d-receipt", "Treasury ledger", "Income, expenses, the balance"],
  ["d-check", "Attendance & check-in", "Roll for every event"],
  ["d-cal", "Timeline", "Every event and deadline in one place"],
  ["d-board", "Tasks", "Assigned, dated, ticked off"],
  ["d-folder", "Docs", "The chapter’s files, filed"],
  ["d-chat", "The assistant", "Ask your chapter a question"],
  ["d-export", "CSV exports", "Ledger and roster, any time"],
];

const ROSTER: [string, string, string, string, boolean?][] = [
  ["MC", "Maya Chen", "President", "var(--butter)"],
  ["DO", "Dev Okafor", "Treasurer", "var(--sky)"],
  ["PS", "Priya Shah", "Class of ’26", "var(--peach)", true],
  ["LB", "Leo Brandt", "", "var(--mint)"],
  ["SK", "Sam Kim", "Class of ’26", "var(--lilac)", true],
  ["NA", "Nia Adams", "Recruitment", "var(--rose)"],
  ["TW", "Theo Walsh", "Class of ’26", "var(--sky)", true],
  ["RG", "Rosa Garcia", "Class of ’26", "var(--butter)", true],
];
const ROSTER_TOTAL = 52;
const SENIORS = ROSTER.filter(r => r[4]).length;

/** The dial's scale, past the self-serve ceiling so the quote band shows. */
const DIAL_MAX = 160;
const CROWD_EDGES = BILLING_BANDS.filter(b => b.upTo !== null).map(b => (b.upTo as number) - 1);

// The meter's first frame (one board member); PricingMotion counts up from here.
const START = 1;
const START_BAND = tierForCount(START);

// Confetti is decorative and rendered once on the server.
const CONFETTI = Array.from({ length: 26 }, (_, i) => ({
  left: i * 3.6 + Math.random() * 2,
  bg: `var(--${["butter", "sky", "mint", "lilac", "rose", "peach"][i % 6]})`,
  dur: 7 + Math.random() * 6,
  delay: -Math.random() * 12,
}));

const Icon = ({ id }: { id: string }) => (
  <svg>
    <use href={`#${id}`} />
  </svg>
);

const Tick = ({ delay }: { delay: number }) => (
  <span className="tick" style={sx({ "--td": `${delay}s` })}>
    <svg viewBox="0 0 24 24">
      <path d="M4.5 13.2 9.4 18 19.5 6.4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);

/** Glyphs the mock uses that the landing sprite doesn't carry. */
function PricingSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="d-x" viewBox="0 0 24 24">
          <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </symbol>
        <symbol id="d-plus" viewBox="0 0 24 24">
          <path d="M12 4.5v15M4.5 12h15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </symbol>
        <symbol id="d-archive" viewBox="0 0 24 24">
          <rect x="3.2" y="4" width="17.6" height="4.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="2.1" />
          <path d="M5 8.6v9.6c0 1 .8 1.8 1.8 1.8h10.4c1 0 1.8-.8 1.8-1.8V8.6M10 12.4h4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        </symbol>
        <symbol id="d-inbox" viewBox="0 0 24 24">
          <path d="M3.4 13.4 6 5.6c.2-.6.8-1 1.4-1h9.2c.6 0 1.2.4 1.4 1l2.6 7.8v5c0 .9-.7 1.6-1.6 1.6H5c-.9 0-1.6-.7-1.6-1.6v-5Z" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
          <path d="M3.6 13.4h4.6l1.4 2.4h4.8l1.4-2.4h4.6" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
        </symbol>
      </defs>
    </svg>
  );
}

export default function PricingPage() {
  const chipBand = tierForCount(ROSTER_TOTAL);
  const chipTone = TONE[BILLING_BANDS.indexOf(chipBand)];

  return (
    <div className={`lp pub pp boot ${landingFontClass}`} id="pp-root">
      <noscript>
        <style>{`.lp.pp .rv{opacity:1;transform:none}.lp.pp .sheet .tick path{stroke-dashoffset:0}`}</style>
      </noscript>
      <DoodleSprite />
      <PricingSprite />
      <div className="washes" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>

      <PublicNav here="pricing" />

      <main id="top">
        {/* ============================== HERO ============================== */}
        <section className="phero">
          <div className="wrap phero__grid">
            <div>
              <span className="eyebrow">Pricing</span>
              <h1>
                One price for the <span className="hi">whole org.</span>
                <br />
                Set by how many of you there are.
              </h1>
              <p className="lede">Not per person, not per term. Drag the dial — that&apos;s the whole pricing model.</p>
              <div className="phero__cta">
                <a className="btn btn--lg" href="/create">
                  Set up your org <Icon id="d-arrow-r" />
                </a>
                <a className="btn btn--ghost" href="#counts">
                  What counts as a member
                </a>
              </div>
              <div className="phero__fine">
                <span>
                  <Icon id="d-check" />
                  Free up to {word(FREE.upTo ?? 4)}, forever
                </span>
                <span>
                  <Icon id="d-check" />
                  No card to start
                </span>
                <span>
                  <Icon id="d-check" />
                  Every feature on every plan
                </span>
              </div>
            </div>

            <div className="meter" id="meter" data-band={START_BAND.id} style={{ position: "relative" }}>
              <svg
                className="scribble"
                viewBox="0 0 120 46"
                style={{ width: 118, left: -92, top: -38, transform: "rotate(14deg)" }}
                aria-hidden="true"
              >
                <use href="#d-swirl" />
              </svg>
              <div className="meter__top">
                <div>
                  <div className="meter__q">How many of you are there?</div>
                  <div className="meter__count">
                    <b id="mCount">{START}</b>
                    <span id="mWord">person</span>
                  </div>
                  <div className="meter__band">
                    <i />
                    <span id="mBand">
                      {START_BAND.label} · {formatRange(START_BAND)}
                    </span>
                  </div>
                  <div className="perhead" id="mHead">
                    $0 a head — because it’s $0
                  </div>
                </div>
                <div className="tag" id="tag" aria-live="polite">
                  <span className="tag__string" />
                  <div className="tag__body">
                    <span className="tag__hole" />
                    <div className="tag__price">
                      <span className="roll" id="tPrice">
                        {price(START_BAND)}
                      </span>
                    </div>
                    <div className="tag__per">
                      <span id="tPer">free, for good</span>
                      <small id="tSub">no card needed</small>
                    </div>
                  </div>
                </div>
              </div>

              <div className="crowd" id="crowd" aria-hidden="true">
                {Array.from({ length: DIAL_MAX }, (_, i) => (
                  <span
                    key={i}
                    className={`p${CROWD_EDGES.includes(i) ? " edge" : ""}${i < START ? " on" : ""}`}
                    data-b={i < START ? START_BAND.id : ""}
                  />
                ))}
              </div>

              <div className="pdial">
                <div className="ruler" id="ruler" aria-hidden="true">
                  {BILLING_BANDS.map(b => (
                    <i
                      key={b.id}
                      className={`r-${b.id}${b.id === START_BAND.id ? "" : " dim"}`}
                      style={{ flex: String((b.upTo ?? DIAL_MAX) - b.from + 1) }}
                    />
                  ))}
                </div>
                <label className="sr-only" htmlFor="dial">
                  Number of active members
                </label>
                <input type="range" id="dial" min={1} max={DIAL_MAX} defaultValue={START} />
              </div>
              <div className="ticks" aria-hidden="true">
                {[FREE, STANDARD, PRO].map((b, i) => (
                  <span key={b.id} style={{ left: `${(((b.upTo as number) - 0.5) / DIAL_MAX) * 100}%` }}>
                    {i === 0 ? `${b.label} to` : `${price(b)} to`}
                    <b>{b.upTo}</b>
                  </span>
                ))}
                <span style={{ left: "90%" }}>
                  quoted<b>{CUSTOM.from}+</b>
                </span>
              </div>

              <div className="meter__note">
                <Icon id="d-spark" />
                <p id="mNote" />
              </div>

              <div className="presets" id="presets">
                {(
                  [
                    ["Exec board", FREE.upTo as number],
                    ["Typical chapter", 38],
                    [`Just past ${STANDARD.upTo === 50 ? "fifty" : STANDARD.upTo}`, PRO.from],
                    ["Big house", 96],
                    [`Past ${SELF_SERVE_MAX}`, 140],
                  ] as const
                ).map(([label, n]) => (
                  <button key={label} className="pchip" data-n={n} type="button">
                    {label} <span className="mono">{n}</span>
                  </button>
                ))}
              </div>
              <span className="stamp" id="stamp">
                {STANDARD.label}
              </span>
            </div>
          </div>
        </section>

        {/* ============================== BANDS ============================== */}
        <section className="sec" id="bands">
          <div className="wrap">
            <div className="sec-h rv">
              <span className="eyebrow" style={sx({ "--eb": "var(--sky-ink)" })}>
                The {word(BILLING_BANDS.length)} bands
              </span>
              <h2>
                A flat fee per band.{" "}
                <span className="hi" style={sx({ "--mark": "var(--sky)" })}>
                  Not a fee per person.
                </span>
              </h2>
              <p className="lede">Your bill is whichever band your active member count lands in.</p>
            </div>

            <div className="line-wrap">
              <svg className="clothes" viewBox="0 0 1000 90" preserveAspectRatio="none" aria-hidden="true">
                <path d="M0 14 C 250 64, 750 64, 1000 14" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="1 0" />
              </svg>
              <div className="bands" id="bandCards">
                {BILLING_BANDS.map((b, i) => {
                  const quote = b.priceCents === null;
                  return (
                    <article key={b.id} className={`band${quote ? " q" : ""} rv`} data-d={i || undefined} data-id={b.id}>
                      <span className="peg" />
                      <div className="band__k">{b.label}</div>
                      <div className="band__name">{quote ? `${b.from}+` : b.label}</div>
                      <div className="band__price">
                        <b>{price(b)}</b>
                        {!quote && <span>/ month</span>}
                      </div>
                      <span className="band__range">{formatRange(b)}</span>
                      <p>{BAND_COPY[i].blurb}</p>
                      <div className="mini">
                        <Icon id={BAND_COPY[i].icon} />
                        {BAND_COPY[i].mini}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ============================== FEATURES ============================== */}
        <section className="sec" id="features">
          <div className="wrap">
            <div className="sec-h rv">
              <span className="eyebrow" style={sx({ "--eb": "var(--mint-ink)" })}>
                What you get
              </span>
              <h2>
                Every feature is on{" "}
                <span className="hi" style={sx({ "--mark": "var(--mint)" })}>
                  every plan.
                </span>
              </h2>
              <p className="lede">Nothing is locked behind a higher price. Only the member count changes.</p>
            </div>

            <div className="sheet rv" id="sheet">
              <span className="stamp bigstamp">All included</span>
              <div className="scroll-x">
                <table className="grid-t">
                  <thead>
                    <tr>
                      <th>
                        <span className="sr-only">Feature</span>
                      </th>
                      {BILLING_BANDS.map((b, i) => (
                        <th key={b.id}>
                          <span className="col">
                            <i style={{ background: `var(--${TONE[i]})` }} />
                            <b>{b.priceCents === null ? `${b.from}+` : b.label}</b>
                            <span>{b.priceCents === null ? "quoted" : b.priceCents === 0 ? "$0" : `${price(b)}/mo`}</span>
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {FEATS.map(([ic, t, s], r) => (
                      <tr key={t}>
                        <td>
                          <span className="fx">
                            <Icon id={ic} />
                            <span>
                              {t}
                              <small>{s}</small>
                            </span>
                          </span>
                        </td>
                        {BILLING_BANDS.map((b, c) => (
                          <td key={b.id}>
                            <Tick delay={(r * 4 + c) * 0.03 + 0.2} />
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="cap">
                      <td>
                        <span className="fx">
                          <Icon id="d-people" />
                          <span>
                            Active members<small>The only thing that changes</small>
                          </span>
                        </span>
                      </td>
                      {BILLING_BANDS.map(b => (
                        <td key={b.id}>{b.upTo === null ? `${b.from}+` : `up to ${b.upTo}`}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="sheet-foot">
                <p>
                  <b>The one row that changes</b> is the member count.
                </p>
                <a className="btn btn--sm" href="/create">
                  Set up your org <Icon id="d-arrow-r" />
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ============================== WHO COUNTS ============================== */}
        <section className="sec" id="counts">
          <div className="wrap counts">
            <div className="rv">
              <span className="eyebrow" style={sx({ "--eb": "var(--lilac-ink)" })}>
                Who counts
              </span>
              <h2 style={{ marginTop: 16 }}>
                You pay for who&apos;s{" "}
                <span className="hi" style={sx({ "--mark": "var(--lilac)" })}>
                  on the roster.
                </span>
              </h2>
              <p className="lede" style={{ marginTop: 16 }}>
                One seat is one active member.
              </p>
              <div className="rules">
                <div className="rule yes">
                  <span className="ri">
                    <Icon id="d-people" />
                  </span>
                  <div>
                    <b>Active members count</b>
                    <span>Officers and admins included.</span>
                  </div>
                </div>
                <div className="rule no">
                  <span className="ri">
                    <Icon id="d-archive" />
                  </span>
                  <div>
                    <b>Archived members don&apos;t</b>
                    <span>Graduates stop counting. Their history stays.</span>
                  </div>
                </div>
                <div className="rule no">
                  <span className="ri">
                    <Icon id="d-inbox" />
                  </span>
                  <div>
                    <b>Join requests don&apos;t</b>
                    <span>Nobody counts until an officer approves them.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="clip rv" data-d="1" id="clip" data-total={ROSTER_TOTAL} data-seniors={SENIORS}>
              <span className="clip__clamp" />
              <div className="clip__h">
                <div>
                  <span className="eyebrow" style={sx({ "--eb": "var(--sky-ink)" })}>
                    Roster · spring
                  </span>
                  <h3>Members</h3>
                </div>
                <div className="tally">
                  <b id="tally">{ROSTER_TOTAL}</b>
                  <span>billable</span>
                </div>
              </div>
              <div className="roster">
                {ROSTER.map(([ini, n, r, c, s]) => (
                  <div key={n} className={`row${s ? " senior" : ""}`}>
                    <span className="av" style={sx({ "--av": c })}>
                      {ini}
                    </span>
                    <span className="nm">
                      {n}
                      {r && (
                        <>
                          {" "}
                          <small>{r}</small>
                        </>
                      )}
                    </span>
                    <span>
                      <span className="ppill ppill--y">Counts</span>
                      <span className="ppill ppill--a">Archived</span>
                    </span>
                  </div>
                ))}
                <div className="row more">
                  <span className="av">+{ROSTER_TOTAL - ROSTER.length}</span>
                  <span>{ROSTER_TOTAL - ROSTER.length} more active members</span>
                </div>
              </div>
              <div className="reqs">
                <h4>
                  <span>Join requests</span>
                  <span>2 pending · not counted</span>
                </h4>
                <div className="row">
                  <span className="av" style={sx({ "--av": "var(--sky)" })}>
                    JT
                  </span>
                  <span className="nm">
                    Jordan Tate <small>via invite link</small>
                  </span>
                  <span className="ppill ppill--n">Waiting</span>
                </div>
                <div className="row">
                  <span className="av" style={sx({ "--av": "var(--mint)" })}>
                    AR
                  </span>
                  <span className="nm">
                    Ash Ramos <small>via invite link</small>
                  </span>
                  <span className="ppill ppill--n">Waiting</span>
                </div>
              </div>
              <div className="clip__foot">
                <span className="bandchip" id="bandchip" style={sx({ "--bc": `var(--${chipTone})` })}>
                  <span id="bcName">{chipBand.label}</span>
                  <span className="mono" id="bcPrice">
                    {price(chipBand)}/mo
                  </span>
                </span>
                <button className="toggle-btn" id="archiveBtn" type="button">
                  <Icon id="d-archive" />
                  <span>Archive the {word(SENIORS)} seniors</span>
                </button>
              </div>
              <p className="caveat">Illustrative roster.</p>
              <div className="archive-box">
                <b>{SENIORS}</b>archived · history kept
              </div>
            </div>
          </div>
        </section>

        {/* ============================== LIMIT ============================== */}
        <section className="sec" id="limit">
          <div className="wrap limit">
            <div className="house rv" id="house">
              <div className="room">
                <div className="room__h">
                  <b>Your org</b>
                  <span className="lamp">
                    <i />
                    Everything working
                  </span>
                </div>
                <div className="seats" aria-hidden="true">
                  {Array.from({ length: STANDARD.upTo as number }, (_, i) => (
                    <span key={i} className="p on" data-b={STANDARD.id} />
                  ))}
                </div>
                <div className="room__f">
                  <span>{STANDARD.label} plan</span>
                  <span>
                    <b>{STANDARD.upTo}</b> of {STANDARD.upTo} seats
                  </span>
                </div>
              </div>
              <div className="doorway">
                <div className="queue" id="queue" aria-hidden="true" />
                <div className="gate">
                  <div className="bar" />
                  Next approval needs a bigger plan
                </div>
              </div>
            </div>

            <div className="rv" data-d="1">
              <span className="eyebrow" style={sx({ "--eb": "var(--peach-ink)" })}>
                Hitting the limit
              </span>
              <h2 style={{ marginTop: 16 }}>
                Only{" "}
                <span className="hi" style={sx({ "--mark": "var(--peach)" })}>
                  growth
                </span>{" "}
                stops.
              </h2>
              <p className="lede" style={{ marginTop: 16 }}>
                Go past your plan and you can&apos;t add the next person. Nothing else changes.
              </p>
              <div className="lists">
                <div className="lst stop">
                  <h4>What stops</h4>
                  <ul>
                    <li>
                      <Icon id="d-x" />
                      <span>Approving requests past capacity (people can still send them).</span>
                    </li>
                    <li>
                      <Icon id="d-x" />
                      <span>Un-archiving someone.</span>
                    </li>
                  </ul>
                </div>
                <div className="lst keep">
                  <h4>What doesn&apos;t</h4>
                  <ul>
                    <li>
                      <Icon id="d-check" />
                      <span>Every member keeps access.</span>
                    </li>
                    <li>
                      <Icon id="d-check" />
                      <span>Every page keeps working.</span>
                    </li>
                    <li>
                      <Icon id="d-check" />
                      <span>Exports keep working.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================== STUBS ============================== */}
        <section className="sec" id="stubs">
          <div className="wrap">
            <div className="sec-h rv">
              <span className="eyebrow" style={sx({ "--eb": "var(--rose-ink)" })}>
                When things change
              </span>
              <h2>
                A failed card or a cancellation{" "}
                <span className="hi" style={sx({ "--mark": "var(--rose)" })}>
                  deletes nothing.
                </span>
              </h2>
            </div>
            <div className="stubs">
              <article className="stub rv">
                <div className="stub__k">
                  <span>Payment failed</span>
                  <span>Past due</span>
                </div>
                <h3>The card didn&apos;t go through</h3>
                <ol>
                  <li>Stripe retries and emails the billing address.</li>
                  <li>New members wait until it&apos;s sorted.</li>
                  <li>Updating the card settles it at once.</li>
                </ol>
                <div className="total">
                  <span>Records removed</span>
                  <b>0</b>
                </div>
                <span className="stamp">Nothing deleted</span>
              </article>
              <article className="stub rv" data-d="1">
                <div className="stub__k">
                  <span>Cancelling</span>
                  <span>No email needed</span>
                </div>
                <h3>You want to stop paying</h3>
                <ol>
                  <li>A few clicks in the billing portal; you keep the month you paid for, then drop to {FREE.label}.</li>
                  <li>40 people stay 40 — you just can&apos;t add the 41st.</li>
                  <li>Changed your mind? Resume before it ends.</li>
                </ol>
                <div className="total">
                  <span>Records removed</span>
                  <b>0</b>
                </div>
                <span className="stamp">Still yours</span>
              </article>
            </div>
          </div>
        </section>

        {/* ============================== FINE PRINT + FAQ ============================== */}
        <section className="sec" id="faq">
          <div className="wrap fine">
            <div className="receipt rv">
              <h3>The fine print</h3>
              <div className="cut">- - - - - - - - - - - - - - - - - - - -</div>
              <dl>
                {(
                  [
                    ["Billed", "Monthly, USD"],
                    ["Priced", "Per org, by band"],
                    ["Card handled by", "Stripe"],
                    ["Invoices & receipts", "Billing portal"],
                    ["Promo codes", "At checkout"],
                    ["Who can pay", "Org admins"],
                    ["Free seats", `${FREE.upTo}, forever`],
                    ["Self-serve up to", `${SELF_SERVE_MAX} members`],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="cut">- - - - - - - - - - - - - - - - - - - -</div>
              <div className="bc" />
              <div className="bcn">CHAPTOS.COM</div>
            </div>

            <div className="rv" data-d="1">
              <span className="eyebrow" style={sx({ "--eb": "var(--lilac-ink)" })}>
                Questions
              </span>
              <h2 style={{ margin: "16px 0 28px" }}>Asked before paying.</h2>
              <div className="faq">
                {(
                  [
                    ["Is this the same as the dues we track?", "No. This is what your org pays us. The dues and ledger you keep in the app never touch it."],
                    ["Who handles billing?", "Your org admins. They add the card, change the plan and see the invoices."],
                    [`We're bigger than ${SELF_SERVE_MAX}.`, "Billing asks for a quote instead of a card, and nothing stops working meanwhile."],
                    ["We run more than one org.", "Admins of two or more orgs can ask about a group plan from Billing."],
                  ] as const
                ).map(([q, a], i) => (
                  <details key={q} className="qa" open={i === 0}>
                    <summary>
                      {q}
                      <span className="pm">
                        <Icon id="d-plus" />
                      </span>
                    </summary>
                    <p className="ans">{a}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ============================== CLOSE ============================== */}
        <section className="close">
          <div className="confetti" aria-hidden="true">
            {CONFETTI.map((c, i) => (
              <i
                key={i}
                style={{
                  left: `${c.left}%`,
                  background: c.bg,
                  animationDuration: `${c.dur}s`,
                  animationDelay: `${c.delay}s`,
                }}
              />
            ))}
          </div>
          <div className="wrap rv" style={{ position: "relative" }}>
            <span className="eyebrow">Start free</span>
            <h2>
              Set it up with your board{" "}
              <span className="hi" style={sx({ "--mark": "var(--mint)" })}>
                for nothing.
              </span>
            </h2>
            <p>{word(FREE.upTo ?? 4).replace(/^./, c => c.toUpperCase())} seats free, no card.</p>
            <div className="phero__cta">
              <a className="btn btn--lg" href="/create">
                Set up your org <Icon id="d-arrow-r" />
              </a>
              <a className="btn btn--ghost btn--lg" href="/help/what-you-pay">
                Read the billing help
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
      <PricingMotion />
    </div>
  );
}
