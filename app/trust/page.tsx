// Trust & privacy — the public disclosure page, linked from the landing footer
// and from the landing page's own trust section.
//
// Every factual claim on this page is traceable to code. The extraction that
// backs it lives in docs/trust-and-privacy-source-of-truth.md, which also records
// the claims this page deliberately does NOT make (§8 "What we don't claim yet")
// and why. Before editing a security or retention sentence here, read that doc:
// the failure mode for this page is not being vague, it's being generous.
//
// Deliberately static and motionless — no LandingMotion, so no [data-reveal] /
// [data-para] / [data-hb] hooks may appear in this tree or they'd stay invisible.
// See the header comment in ./trust.css.
import type { Metadata } from "next";

import "../components/landing/landing.css";
import "./trust.css";

import { Doodle, sx } from "../components/landing/Doodle";
import { DoodleSprite } from "../components/landing/DoodleSprite";
import { landingFontClass } from "../components/landing/fonts";
import { PublicNav } from "../components/landing/PublicChrome";
import { Footer } from "../components/landing/sections/Footer";
import { APP_NAME } from "@/lib/domains";
import { SUPPORT_EMAIL } from "@/lib/support";

// ─────────────────────────────────────────────────────────────────────────────
// FILL THESE IN BEFORE THIS PAGE GOES LIVE.
//
// GDPR Art. 13(1)(a)–(b), CCPA §1798.130(a)(5) and CalOPPA all require an
// identified operator and a working contact channel — a policy without them is
// defective on its face. Anything left as a TODO renders as a loud dashed
// placeholder so it cannot ship unnoticed.
// ─────────────────────────────────────────────────────────────────────────────
const TODO = null;

const LEGAL_ENTITY: string | null = TODO;   // e.g. "ChaptOS Labs LLC"
// The one inbox a human reads (lib/support.ts), shared with /contact and /help.
const PRIVACY_EMAIL: string | null = SUPPORT_EMAIL;
const POSTAL_ADDRESS: string | null = TODO; // registered mailing address
const GOVERNING_STATE: string | null = TODO; // e.g. "Texas, USA"

/** Effective date shown in the header. Bump whenever the substance changes. */
const EFFECTIVE = "November 2, 2026";

function Fill({ value, label }: { value: string | null; label: string }) {
  if (value) return <>{value}</>;
  return <span className="tp__todo">[{label}]</span>;
}

export const metadata: Metadata = {
  title: `Trust & privacy — ${APP_NAME}`,
  description:
    "What data your organization keeps in ChaptOS, who can see it, where it goes, " +
    "how long it lives, and the things we deliberately don't claim.",
};

const SECTIONS = [
  ["roles", "Who we are, and who decides what"],
  ["never", "What we don't do"],
  ["data", "What your organization keeps here"],
  ["sensitive", "What not to put here"],
  ["access", "Who can see it"],
  ["assistant", "How the assistant works"],
  ["where", "Where your data lives"],
  ["security", "How isolation and security are enforced"],
  ["cookies", "Cookies and device storage"],
  ["public", "Public links and shareable secrets"],
  ["retention", "How long we keep things, and deletion"],
  ["rights", "Your rights, and how to use them"],
  ["bases", "Why we're allowed to process this"],
  ["changes", "Changes to this page"],
  ["contact", "Contact"],
] as const;

export default function TrustPage() {
  return (
    <div className={`lp tp ${landingFontClass}`}>
      <DoodleSprite />

      <PublicNav />

      <main id="top">
        {/* ── header + the short version ─────────────────────────────────── */}
        <section className="tp__hero">
          <div className="wrap">
            <div className="tp__head">
              <span className="eyebrow" style={sx({ "--eb": "var(--sky)" })}>
                Trust &amp; privacy
              </span>
              <h1>
                Your org&apos;s records, its money and its people. Here is exactly what
                happens to all of it.
              </h1>
              <p className="lede">
                This page explains, in plain language, how {APP_NAME}{" "}handles your data as of
                the effective date below. Where a protection is real, we name the mechanism.
                Where it isn&apos;t built yet, we say so in <a href="#security">section 8</a>{" "}
                rather than leave you to find out. It describes our practices; it isn&apos;t a
                contract, and it will change as the product does.
              </p>
              {/* Separators are CSS ::before on each item after the first, not
                  standalone nodes — a wrapped row would otherwise strand a lone
                  bullet at the end of a line. */}
              <div className="tp__meta">
                <span>
                  Effective <span className="k">{EFFECTIVE}</span>
                </span>
                <span>
                  Operated by <Fill value={LEGAL_ENTITY} label="legal entity" />
                </span>
                <span>Applies to {APP_NAME}{" "}and every organization workspace on it</span>
              </div>
            </div>

            <div className="tp__tldr">
              <div className="tldr">
                <span
                  className="tldr__ic"
                  style={sx({ "--g": "var(--mint-soft)", "--gb": "#BDE7D2" })}
                >
                  <Doodle
                    id="wallet"
                    className="doodle doodle--thin"
                    size={20}
                    viewBox="0 0 24 24"
                    style={sx({ color: "var(--mint-ink)" })}
                  />
                </span>
                <h4>We don&rsquo;t hold your chapter&rsquo;s money</h4>
                <p>
                  Dues and reimbursements are <em>records</em>{" "}of money that moved somewhere
                  else — we don&apos;t ask for card numbers or bank details, and there is no
                  processor. Your own subscription is paid through Stripe, and your card details
                  go to them rather than to us.
                </p>
              </div>
              <div className="tldr">
                <span
                  className="tldr__ic"
                  style={sx({ "--g": "var(--sky-soft)", "--gb": "#CCDFFB" })}
                >
                  <Doodle
                    id="shield"
                    className="doodle doodle--thin"
                    size={20}
                    viewBox="0 0 24 24"
                    style={sx({ color: "var(--sky-ink)" })}
                  />
                </span>
                <h4>Nothing is sold or tracked</h4>
                <p>
                  No advertising, no data sales, and we don&apos;t use analytics or tracking
                  tools in the product.
                </p>
              </div>
              <div className="tldr">
                <span
                  className="tldr__ic"
                  style={sx({ "--g": "var(--butter-soft)", "--gb": "#F4DFA6" })}
                >
                  <Doodle
                    id="key"
                    className="doodle doodle--thin"
                    size={20}
                    viewBox="0 0 24 24"
                    style={sx({ color: "var(--butter-ink)" })}
                  />
                </span>
                <h4>One org can&apos;t read another</h4>
                <p>
                  Enforced twice: once in the data layer, once by the database itself. Not a
                  UI convention that a bug could undo.
                </p>
              </div>
              <div className="tldr">
                <span
                  className="tldr__ic"
                  style={sx({ "--g": "var(--lilac-soft)", "--gb": "#DCD2FB" })}
                >
                  <Doodle
                    id="hand"
                    className="doodle doodle--thin"
                    size={20}
                    viewBox="0 0 24 24"
                    style={sx({ color: "var(--lilac-ink)" })}
                  />
                </span>
                <h4>Your org owns the decisions</h4>
                <p>
                  You decide what to collect and who gets a seat. We store and compute it on
                  your instruction — we don&apos;t repurpose it.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── contents + body ────────────────────────────────────────────── */}
        <div className="wrap tp__layout">
          <aside className="tp__toc">
            <h5>Contents</h5>
            <ol>
              {SECTIONS.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`}>{label}</a>
                </li>
              ))}
            </ol>
          </aside>

          <div className="tp__body">
            {/* 1 ─ roles */}
            <section className="tp__sec" id="roles">
              <h2>Who we are, and who decides what</h2>
              <p className="tp__lede">
                Two different parties are responsible for the data in a {APP_NAME}{" "}workspace,
                and telling them apart explains almost everything else on this page.
              </p>
              <p>
                <strong>Your organization is the controller of its members&apos; data.</strong>{" "}
                The chapter, team, club or council decides what to collect, which fields
                exist, who holds which seat, and how long records stay. It is responsible for
                telling its members what it collects and for having the authority to hold it.
              </p>
              <p>
                <strong>We are a processor — a service provider.</strong>{" "}We store that data
                and compute over it on your organization&apos;s instruction. We do not mine
                it, sell it, profile anyone with it, or use it to build anything of our own.
              </p>
              <p>
                Separately, we are the controller of a narrow set of our own: the Google
                account identity you sign in with, the email address on it, service logs, the
                signals we use to stop abuse, and anything you send us when you ask for a quote.
              </p>
              <div className="tp__note">
                <h5>What that means for you in practice</h5>
                <p>
                  If you are a member and you want to see, correct or remove something in
                  your org&apos;s records, your officers can act on it immediately — they hold
                  the controls. Come to us when they can&apos;t, or when the request is about
                  your account rather than your org&apos;s records. Either route works; the
                  first is faster.
                </p>
              </div>
              <p>
                Organizations that need this in contract form — a data processing agreement
                with the sub-processor list in <a href="#where">section 7</a>{" "}and a
                change-notice commitment — should <a href="#contact">ask us</a>.
              </p>
            </section>

            {/* 2 ─ never */}
            <section className="tp__sec" id="never">
              <h2>What we don&apos;t do</h2>
              <p className="tp__lede">
                A short list of things the product isn&apos;t built to do, as of the effective
                date above.
              </p>
              <ul className="tp__list tp__list--no">
                <li>
                  <strong>We don&apos;t sell your data</strong>{" "}— and we don&apos;t share it
                  for cross-context behavioural advertising, which is the specific thing
                  California law gives people an opt-out from. There is nothing to opt out of
                  here.
                </li>
                <li>
                  <strong>We don&apos;t use analytics or tracking tools.</strong>{" "}No Google Analytics, no
                  PostHog, Mixpanel, Segment, Plausible or Vercel Analytics. No advertising
                  pixels, no session recorders, no fingerprinting, no third-party cookies.
                </li>
                <li>
                  <strong>We don&apos;t collect payment details.</strong>{" "}Nothing in the
                  product asks for card or bank details, so we don&apos;t store them — though
                  people can type anything into a free-text field, which is why{" "}
                  <a href="#sensitive">section 4</a>{" "}asks them not to. Your chapter&rsquo;s own
                  books have no processor behind them at all: &ldquo;payment method&rdquo; on a
                  dues record is a word someone typed — <code>venmo</code>, <code>cash</code>,
                  <code>check</code>. The one place real money moves is your subscription to
                  us, and that is handled end to end by Stripe on their own pages — we store an
                  identifier for your Stripe customer and nothing else.
                </li>
                <li>
                  <strong>We don&apos;t train models on your data</strong>, and we have no
                  model of our own. See <a href="#assistant">section 6</a>{" "}for the precise
                  position on the provider we call.
                </li>
                <li>
                  <strong>We don&apos;t let one organization read another.</strong>{" "}See{" "}
                  <a href="#security">section 8</a>.
                </li>
                <li>
                  <strong>We don&apos;t email your members</strong>{" "}or contact them on your
                  behalf. There is no mail-sending capability in the product.
                </li>
              </ul>
            </section>

            {/* 3 ─ data inventory */}
            <section className="tp__sec" id="data">
              <h2>What your organization keeps here</h2>
              <p className="tp__lede">
                The complete inventory, grouped the way you&apos;d actually go looking for it.
                Some of these fields exist only if your org turned that feature on.
              </p>

              <h3>Identity and account</h3>
              <div className="tp__tw">
                <table className="tp__t">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Where it comes from</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th>Google account identifier</th>
                      <td>Google, at sign-in. An opaque id — we never see your password.</td>
                    </tr>
                    <tr>
                      <th>Name</th>
                      <td>
                        Typed by you on the join form. Each org keeps its own copy, so you can
                        go by a different name in each org you belong to.
                      </td>
                    </tr>
                    <tr>
                      <th>Email address</th>
                      <td>From your Google account. Used for identification, not marketing.</td>
                    </tr>
                    <tr>
                      <th>Profile photo</th>
                      <td>
                        Your Google photo, or one you upload. Uploads are stored at a{" "}
                        <a href="#public">publicly reachable URL</a>{" "}— 2 MB limit, images only.
                      </td>
                    </tr>
                    <tr>
                      <th>Role / title text</th>
                      <td>Set by an officer, e.g. &ldquo;Treasurer&rdquo;.</td>
                    </tr>
                    <tr>
                      <th>Join requests</th>
                      <td>
                        Opening an invite link files a request with your name, email, photo and
                        account id <em>before</em>{" "}you are on any roster, so officers can review
                        it. A rejected request is kept, so the same link can&apos;t queue you
                        again; a new link from an officer reopens it.
                      </td>
                    </tr>
                    <tr>
                      <th>Quote requests</th>
                      <td>
                        If you ask us for a quote from the billing page, we keep your name,
                        email, member count and message so we can reply. We keep this even if
                        the org is later deleted.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3>Member records your org maintains</h3>
              <div className="tp__tw">
                <table className="tp__t">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th>Grade point average</th>
                      <td>
                        Entered by your organization. We never receive grades from a school or
                        registrar — see <a href="#sensitive">section 4</a>.
                      </td>
                    </tr>
                    <tr>
                      <th>Attendance percentage</th>
                      <td>Computed from per-event records, not typed in.</td>
                    </tr>
                    <tr>
                      <th>Dues owed</th>
                      <td>
                        A balance built from the charges a treasurer hands out, minus the
                        payments and waivers they record. A member&apos;s own payment request
                        changes nothing until a treasurer approves it.
                      </td>
                    </tr>
                    <tr>
                      <th>Service hours</th>
                      <td>Summed from per-event participation records.</td>
                    </tr>
                    <tr>
                      <th>Custom member fields</th>
                      <td>
                        Whatever your officers define — up to 20 fields. This is an open box:
                        read <a href="#sensitive">section 4</a>{" "}before filling it.
                      </td>
                    </tr>
                    <tr>
                      <th>Custom metrics</th>
                      <td>
                        Org-defined measures (practice reps, books read) with goal and at-risk
                        bands.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3>Attendance and absence</h3>
              <p>
                A record per member per event (present or not), plus excuses and
                semester-long exemptions. Excuses and exemptions carry{" "}
                <strong>free text written by the member</strong>{" "}— a reason, and optionally a
                note — along with who decided them and any rejection note.
              </p>
              <div className="tp__note tp__note--warn">
                <h5>Worth knowing before you write one</h5>
                <p>
                  An absence reason is the most likely place in the whole product for someone
                  to volunteer something medical or personal. Only people holding the
                  attendance-management permission can read it, in the app or through the
                  assistant, along with the member who wrote it. It is kept indefinitely.
                  &ldquo;Family emergency&rdquo; is enough; the details are not required.
                </p>
              </div>

              <h3>Money</h3>
              <p>
                A ledger of income and expenses (amount, category, description, date, the
                payment-method word, and optionally which member it&apos;s attributed to),
                dues charges, waivers and payments, reimbursement requests with their approval
                status and any rejection note, semester budgets, party door revenue and
                expenses, and fundraisers (a goal, what came in, and a shopping list of
                supplies with their costs).
              </p>
              <p>
                Ledger entries are <strong>never hard-deleted</strong>{" "}— deleting one marks it
                deleted and keeps the history, so the books can be audited and a mistake can be
                undone.
              </p>
              <p>
                A reimbursement request can carry a <strong>receipt</strong>{" "}— a photo or
                PDF, up to 4 MB. Receipts are kept in private storage: only the person who
                asked, org admins and people holding the treasury permission can open one,
                through a link that stops working after 60 seconds. A receipt often shows the
                last digits of a card or an address; crop those out if you can.
              </p>

              <h3>Governance and participation</h3>
              <p>
                Roles and who holds them, permission assignments, tasks and who has completed
                them, invite links, join requests and who approved or rejected them, and poll
                questions, options and votes.
              </p>
              <div className="tp__note tp__note--flag">
                <h5>Polls are not secret ballots</h5>
                <p>
                  The app never shows anyone how another member voted: tallies stay hidden
                  until results are released, and officers who manage polls only see who
                  hasn&apos;t voted yet. But every vote is stored with the name of the person
                  who cast it. The privacy comes from the app, not from the data, so
                  don&apos;t use a {APP_NAME}{" "}poll for anything that needs true anonymity.
                </p>
              </div>

              <h3>Content and events</h3>
              <p>
                Calendar and programming events with descriptions, locations, owners, prep
                checklists and wrap-up notes; an event&apos;s &ldquo;more details&rdquo; (sign-up
                sheets, a point of contact, getting-there notes, a head-count cap and similar),
                which every member can read apart from its checklist and budget; meeting minutes,
                written together live and saved with a revision history, the agenda templates
                they start from, and the AI summaries and action items generated from them;
                community-service events and participation; a docs library of external links
                with preview metadata fetched from those links; Instagram content plans; pinned
                announcements; and party details including theme, collaborating org and notes.
              </p>

              <h3>Audit and service logs</h3>
              <div className="tp__tw">
                <table className="tp__t">
                  <thead>
                    <tr>
                      <th>Log</th>
                      <th>What&apos;s in it</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th>Event stream</th>
                      <td>
                        A structured record of every meaningful change: what happened, to
                        which record, by whom, when. Its detail carries{" "}
                        <strong>member names, event titles and amounts</strong>.
                      </td>
                    </tr>
                    <tr>
                      <th>Activity feed</th>
                      <td>The readable version of the same thing, naming members and actions.</td>
                    </tr>
                    <tr>
                      <th>Approval records</th>
                      <td>
                        Every assistant proposal a member approved, with their name and role
                        captured as they were at that moment.
                      </td>
                    </tr>
                    <tr>
                      <th>Assistant feedback</th>
                      <td>
                        When someone rates an answer helpful or not, we keep the rating{" "}
                        <strong>and the question they asked, verbatim</strong>{" "}(up to 300
                        characters). This is the one
                        thing on this page we collect for our own purposes — to fix bad
                        answers.
                      </td>
                    </tr>
                    <tr>
                      <th>Server logs</th>
                      <td>
                        Errors and timings: a request id, the route, your member id, the error
                        message and its stack trace. No request bodies.
                      </td>
                    </tr>
                    <tr>
                      <th>Abuse counters</th>
                      <td>
                        Member id, or an <strong>IP address</strong>{" "}on pages you can reach
                        before signing in. Held in memory only, for minutes, never written to
                        the database.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* 4 ─ sensitive */}
            <section className="tp__sec" id="sensitive">
              <h2>What not to put here</h2>
              <p className="tp__lede">
                Custom fields and free-text notes will hold anything you type. A few
                categories create real obligations — for your org, and for us — the moment
                they land in a database, so they are out of bounds.
              </p>

              <h3>Don&apos;t use {APP_NAME}{" "}to collect any of this</h3>
              <ul className="tp__list tp__list--no">
                <li>
                  Health, medical or disability information, including allergies, dietary
                  restrictions recorded as medical needs, medications, or accommodation details
                </li>
                <li>Biometric data of any kind</li>
                <li>
                  Racial or ethnic origin, religious or philosophical beliefs, political
                  opinions, trade-union membership, sex life or sexual orientation
                </li>
                <li>
                  Government identifiers — Social Security or national insurance numbers,
                  passport or driver&apos;s licence numbers, immigration status
                </li>
                <li>
                  Financial account details — card numbers, bank accounts, routing numbers.
                  There is nowhere legitimate to put them and no reason to.
                </li>
                <li>Precise geolocation, or anyone&apos;s home address as a tracked field</li>
              </ul>
              <p>
                If your org needs to hold something on this list, hold it somewhere built for
                it. An emergency contact list belongs with your advisor or your national
                organization, not in a custom roster column.
              </p>

              <h3>Grades and student records</h3>
              <p>
                GPA is a field your organization fills in itself. We never receive it from a
                university, a registrar or any student information system, and we have no
                integration that could. That keeps {APP_NAME}{" "}outside the US federal student
                records regime (FERPA), which binds schools rather than the tools a student
                group chooses.
              </p>
              <p>
                Two situations change that, and both need a conversation with us first:{" "}
                <strong>a university adopting {APP_NAME}{" "}institutionally</strong>, which needs a
                written arrangement designating us appropriately; and{" "}
                <strong>an org loading grades obtained from the school</strong>{" "}rather than
                self-reported by members, which may not be permitted regardless of what we do.
              </p>

              <h3>Age</h3>
              <p>
                {APP_NAME}{" "}is built for organizations run by adults and by post-secondary
                students. <strong>You must be 16 or older to hold an account</strong>, and
                organizations must not use {APP_NAME}{" "}to collect information about children
                under 13. If you run a school group with members under 16, contact us before
                you set anything up — the answer may be yes, but it needs the right agreement
                with the school rather than a founder clicking through.
              </p>
            </section>

            {/* 5 ─ access */}
            <section className="tp__sec" id="access">
              <h2>Who can see it</h2>
              <p className="tp__lede">
                Inside an organization, access is decided by seats. Being specific here is
                more useful than reassuring, including where the honest answer is
                &ldquo;more people than you might assume&rdquo;.
              </p>

              <h3>The tiers</h3>
              <div className="tp__tw">
                <table className="tp__t">
                  <thead>
                    <tr>
                      <th>Tier</th>
                      <th>What it can do</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th>Member</th>
                      <td>
                        Exactly what their assigned roles grant. Holding several roles gives
                        the union of their permissions.
                      </td>
                    </tr>
                    <tr>
                      <th>Org admin</th>
                      <td>
                        Every permission, within that one organization only. Belonging to a
                        second org gives them no elevated access there.
                      </td>
                    </tr>
                    <tr>
                      <th>Our platform staff</th>
                      <td>
                        Can access any organization&apos;s workspace, for support and
                        incident response. See below.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3>The fifteen permissions</h3>
              <p>
                Each role is a named bundle of these: manage members, treasury, events,
                parties, Instagram, service, attendance, semesters, roles, docs, announcements,
                settings, tasks, polls, and fundraising. Roles also carry a rank, and{" "}
                <strong>
                  an officer can only grant or edit roles ranked strictly below their own
                </strong>
                , so nobody can promote themselves or their peers past their own authority.
              </p>

              <div className="tp__note tp__note--warn">
                <h5>The limit you should know about</h5>
                <p>
                  These permissions gate <em>changing</em>{" "}things far more than{" "}
                  <em>seeing</em>{" "}them.{" "}
                  <strong>
                    Every member of an org can read every other member&apos;s GPA, dues
                    balance, service hours and custom fields.
                  </strong>{" "}
                  Some screens show these mostly to officers, but the data is sent to every
                  member&apos;s browser, and the assistant will answer questions about it for
                  any member. There is no per-field privacy. If a field would be inappropriate
                  for your whole roster to read, don&apos;t create it.
                </p>
              </div>

              <h3>Our staff&apos;s access</h3>
              <p>
                A small number of our platform administrators can enter any organization&apos;s
                workspace with full permissions. This exists so we can investigate a bug you
                report, recover something you deleted by accident, and respond to incidents. We
                use it for those reasons and not to browse.
              </p>
              <p>
                Two things constrain it: those actions are written to{" "}
                <strong>the same audit trail as an officer&apos;s</strong>, under the staff
                member&apos;s own name, so they show up in your own logs rather than a private
                one; and the access is a flag on a few of our own sign-in accounts, set by us
                directly in the database rather than anywhere in the app. Your logs don&apos;t
                mark an entry as coming from staff.
              </p>

              <div className="tp__note tp__note--flag">
                <h5>Hidden member records</h5>
                <p>
                  Older versions of {APP_NAME}{" "}could create a member record flagged as
                  hidden: it can read the org like an ordinary member but doesn&apos;t appear
                  in the roster, member counts or attendance rolls. Nothing can create one
                  any more, but records made before that change still have their access.
                </p>
                <p>
                  We disclose it because an account you can&apos;t see in your own member
                  list is exactly the sort of thing you are entitled to know about. Anyone
                  holding the manage-members permission sees these accounts listed on the
                  members page. If you want written confirmation either way,{" "}
                  <a href="#contact">ask us</a>.
                </p>
              </div>
            </section>

            {/* 6 ─ assistant */}
            <section className="tp__sec" id="assistant">
              <h2>How the assistant works</h2>
              <p className="tp__lede">
                Ask Chapt answers questions about your org by reading your actual records, and
                it can draft changes — but it cannot make one. A human with the right
                permission does that, every time.
              </p>

              <h3>It proposes; you decide</h3>
              <ul className="tp__list tp__list--check">
                <li>
                  The assistant&apos;s write tools <strong>validate but never write</strong>.
                  Confirming a card is what performs the action, through the same
                  permission-checked path a button would use.
                </li>
                <li>
                  Each draft is checked against your seat <em>before</em>{" "}you see it. Lacking
                  the permission means the card is <strong>blocked, not routed onward</strong>{" "}
                  — and it names who does hold that authority.
                </li>
                <li>
                  Each draft is cryptographically signed, so what you approve is what the
                  server proposed and nothing tampered with in between.
                </li>
                <li>
                  Every approval becomes a durable record — what was approved, by whom, under
                  which permission — so an AI-assisted change is at least as auditable as a
                  manual one.
                </li>
                <li>
                  Answers cite the records behind them, and those citations are assembled from
                  the queries that actually ran rather than from anything the model claims.
                </li>
              </ul>
              <p>
                The assistant can&apos;t change anything on its own: every change it drafts
                needs a person holding the relevant permission to confirm it.
              </p>

              <h3>What is sent to our AI provider</h3>
              <p>
                The assistant is powered by OpenAI&apos;s API. Answering a question means
                sending them the question, a short window of the recent conversation, and{" "}
                <strong>the results of the lookups the model asked for</strong>{" "}— which contain
                real member names, dues balances, attendance and ledger rows. A small cached
                summary of your org also travels in the instructions: member count, how many
                owe dues and roughly how much, average attendance and GPA, and the treasury
                balance, all deliberately rounded.
              </p>
              <p>
                The assistant can also look up the minutes your officers wrote, open join
                requests, and your custom member fields, so any of those can be part of what
                is sent.
              </p>
              <p>Four other features use the same provider:</p>
              <ul className="tp__list">
                <li>
                  <strong>Meeting summaries</strong>{" "}— your raw meeting notes are sent, and the
                  summary is saved back onto the event.
                </li>
                <li>
                  <strong>The weekly digest</strong>{" "}— this week&apos;s deadlines, events,
                  parties and at-risk members.
                </li>
                <li>
                  <strong>Event ideas</strong>{" "}— when you open an event the assistant
                  suggested, its title, why it was suggested and the question you had asked are
                  sent, to explain the idea before you book it.
                </li>
                <li>
                  <strong>Setup help while creating an org</strong>{" "}— and this one runs{" "}
                  <em>before you have an account</em>. What a founder types into the setup
                  interview is sent to interpret it. Don&apos;t put anything sensitive in that
                  box; describe your org, not your members.
                </li>
              </ul>

              <h3>What we can and can&apos;t promise about it</h3>
              <div className="tp__split">
                <div className="tp__col tp__col--yes">
                  <h5>True today</h5>
                  <ul className="tp__list tp__list--check">
                    <li>
                      Every AI feature is off entirely unless configured, and all of it runs
                      server-side — the API key never reaches a browser.
                    </li>
                    <li>
                      The assistant is scoped to your organization. It cannot read another
                      org&apos;s data or propose changes to it.
                    </li>
                    <li>
                      <strong>Your chat transcripts are not stored on our servers.</strong>{" "}
                      History lives in your own browser, kept separately for each account
                      and org, and is erased when you sign out.
                    </li>
                    <li>We do not train any model on your data, and we have none to train.</li>
                  </ul>
                </div>
                <div className="tp__col tp__col--no">
                  <h5>Not yet stated</h5>
                  <ul className="tp__list tp__list--no">
                    <li>
                      What OpenAI itself retains or reviews is governed by their API data-use
                      terms. We will state our specific contractual position here once it is
                      signed, rather than paraphrase it now and be approximately right.
                    </li>
                    <li>
                      There is no per-organization switch to opt out of AI features while
                      keeping the rest. Today it is configured for the whole platform.
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* 7 ─ where */}
            <section className="tp__sec" id="where">
              <h2>Where your data lives</h2>
              <p className="tp__lede">
                The complete list of companies that can hold your data on our behalf. If this
                list changes we will update this page and note the date.
              </p>
              <div className="tp__tw">
                <table className="tp__t">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>What it does</th>
                      <th>What it holds</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th>Supabase</th>
                      <td>Database, sign-in, image storage</td>
                      <td>All application data, auth identities, photos and logos</td>
                    </tr>
                    <tr>
                      <th>Vercel</th>
                      <td>Hosting and application runtime</td>
                      <td>
                        All data in transit, plus server error and timing logs (request id,
                        route, member id, stack traces)
                      </td>
                    </tr>
                    <tr>
                      <th>Google</th>
                      <td>Sign-in only</td>
                      <td>
                        Authenticates you and returns your name, email and profile photo. It
                        receives no org data from us.
                      </td>
                    </tr>
                    <tr>
                      <th>Stripe</th>
                      <td>Subscription billing — what your org pays us</td>
                      <td>
                        Your card details, which go to Stripe directly and never reach our
                        servers, plus the org&apos;s name and web address, the billing contact
                        email, and your member count (the subscription is priced on it). No
                        chapter data — no roster, dues, attendance or documents.
                      </td>
                    </tr>
                    <tr>
                      <th>OpenAI</th>
                      <td>The AI features</td>
                      <td>
                        Questions and the record data needed to answer them — see{" "}
                        <a href="#assistant">section 6</a>
                      </td>
                    </tr>
                    <tr>
                      <th>Sentry</th>
                      <td>Error monitoring, when enabled</td>
                      <td>Exception messages, stack traces, route and member id as a tag</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>
                These providers run on infrastructure in the United States. If your
                organization or its members are in the UK, the EU or another region with
                transfer requirements, that means data is processed outside your region and
                transfer terms may be needed —{" "}<a href="#contact">tell us</a>{" "}and we&apos;ll
                work through it with you.
              </p>
            </section>

            {/* 8 ─ security */}
            <section className="tp__sec" id="security">
              <h2>How isolation and security are enforced</h2>
              <p className="tp__lede">
                Specific mechanisms, and then an honest list of the things people commonly
                claim at this point in a page like this which we are not going to claim.
              </p>

              <h3>Organizations are isolated twice, independently</h3>
              <p>
                The first layer is the data layer: the app&apos;s database operations run through
                a wrapper that attaches your organization to them automatically. Reading one
                record by its id is silently rewritten into &ldquo;read that record{" "}
                <em>within this org</em>&rdquo;, and updates and deletes verify ownership
                before they touch anything. That makes it hard for a developer to accidentally
                write a query that reaches across orgs, because the query they write isn&apos;t
                the query that
                runs.
              </p>
              <p>
                The second layer is the database itself. PostgreSQL row-level security policies
                restrict every org-scoped table to the organization the current request belongs
                to, and the connection declares that org on every query. If the first layer
                were ever bypassed by a bug,{" "}
                <strong>the database would still return nothing</strong>. A dedicated test
                suite exercises this boundary.
              </p>

              <h3>Other controls in place</h3>
              <ul className="tp__list tp__list--check">
                <li>
                  <strong>Encryption in transit and at rest</strong>, provided by our
                  infrastructure providers, plus HTTP Strict Transport Security so browsers
                  refuse to talk to us unencrypted.
                </li>
                <li>
                  <strong>Cross-site request forgery protection</strong>{" "}at a single choke
                  point every state-changing request passes through, including the sign-up
                  paths that run before you have an account.
                </li>
                <li>
                  <strong>Clickjacking and sniffing protections</strong>{" "}— the app refuses to
                  be embedded in a frame, declares strict referrer behaviour, and denies
                  camera, microphone and geolocation to itself outright.
                </li>
                <li>
                  <strong>Writes are schema-validated</strong>{" "}before they reach the
                  database, and permissions are checked on the server, not just in the
                  interface — hiding a button isn&apos;t the security control.
                </li>
                <li>
                  <strong>Members can&apos;t move money on their own.</strong>{" "}A member&apos;s
                  dues payment or reimbursement is a request; no balance and no ledger entry
                  changes until a treasurer approves, and then both change together or neither
                  does. Charges, waivers and recorded payments need the treasury permission.
                </li>
                <li>
                  <strong>Link previews can&apos;t be used to probe our network.</strong>{" "}When
                  a member saves a doc link, we resolve the destination and refuse private,
                  internal and cloud-metadata addresses, re-checking at every redirect.
                </li>
                <li>
                  <strong>The ledger export is neutralized</strong>{" "}against spreadsheet
                  formula injection, so a hostile transaction description can&apos;t become
                  executable when the CSV is opened in Excel.
                </li>
                <li>
                  <strong>Uploads are constrained.</strong>{" "}Profile photos and org logos are
                  images under 2 MB, and storage rules confine each person&apos;s writes to their
                  own folder. Receipts (images or PDF, under 4 MB) go to private storage that
                  only our server can read or write, after it has checked who is asking.
                </li>
                <li>
                  <strong>Credentials never reach the browser.</strong>{" "}Database and AI keys are
                  server-only. The impersonation tool our developers use to capture screenshots
                  is inert in production — it is gated on a development-only environment check
                  and additionally requires a cryptographic signature, so a stray cookie
                  can&apos;t impersonate anyone even locally.
                </li>
                <li>
                  <strong>Calendar subscription links are encrypted at rest</strong>, and any
                  error report that mentions one is dropped before it reaches our error
                  monitoring.
                </li>
              </ul>

              <h3>What we don&apos;t claim yet</h3>
              <p>
                Everything below is either not built, not audited, or not ours to assert. We
                would rather you read this list than discover it.
              </p>
              <ul className="tp__list tp__list--no">
                <li>
                  <strong>Our content security policy is in report-only mode.</strong>{" "}It
                  watches for violations and reports them; it does not yet block. Promoting it
                  to enforcing is on the list.
                </li>
                <li>
                  <strong>Rate limiting is coarse.</strong>{" "}It holds within a running server
                  instance and resets when one starts cold. It stops runaway loops and casual
                  spam; it is not a hard distributed guarantee.
                </li>
                <li>
                  <strong>No SOC 2, ISO 27001 or HIPAA compliance</strong>, and no business
                  associate agreements. We have not been independently audited or certified.
                </li>
                <li>
                  <strong>No third-party penetration test</strong>{" "}has been performed.
                </li>
                <li>
                  <strong>No uptime guarantee, backup commitment or disaster-recovery
                  commitment.</strong>{" "}
                  Our providers keep backups; we have not yet published a policy of our own, so
                  don&apos;t treat {APP_NAME}{" "}as your only copy of anything you can&apos;t lose.
                </li>
                <li>
                  <strong>No formal breach-notification window.</strong>{" "}Our aim is to tell
                  affected organizations in plain language once we understand what happened,
                  including what we don&apos;t know yet, and to meet whatever notification
                  deadlines the law sets.
                </li>
              </ul>
            </section>

            {/* 9 ─ cookies */}
            <section className="tp__sec" id="cookies">
              <h2>Cookies and device storage</h2>
              <p className="tp__lede">
                There is no cookie banner because there is nothing here to consent to. Every
                cookie we set is required to run the product. None of them are used for
                advertising, and none are third-party.
              </p>
              <div className="tp__tw">
                <table className="tp__t">
                  <thead>
                    <tr>
                      <th>Cookie</th>
                      <th>Purpose</th>
                      <th>Lifetime</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th className="m">sb-…</th>
                      <td>Keeps you signed in. Set by our sign-in provider and refreshed as you browse.</td>
                      <td>Session, refreshed</td>
                    </tr>
                    <tr>
                      <th className="m">active_org_id</th>
                      <td>
                        Remembers which organization you&apos;re working in when you belong to
                        more than one.
                      </td>
                      <td>1 year</td>
                    </tr>
                    <tr>
                      <th className="m">dev_impersonate</th>
                      <td>
                        A developer tool for capturing screenshots locally. Inert in
                        production — it is compiled out and additionally requires a signature.
                      </td>
                      <td>Development only</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3>Stored on your device, never sent to us</h3>
              <p>
                A few things live in your browser&apos;s local storage so the product behaves
                sensibly across visits. Clearing your browser data removes all of it.
              </p>
              <ul className="tp__list">
                <li>
                  <strong>Your assistant conversation history</strong>{" "}— this is the only copy
                  of the transcript; we keep none. It is kept per account and per org, so on a
                  shared computer the next person to sign in never sees yours, and signing out
                  erases it. The one exception is a question you explicitly rate helpful or
                  not, which we keep in order to fix bad answers (see{" "}
                  <a href="#data">section 3</a>).
                </li>
                <li>
                  <strong>An in-progress org setup draft</strong>, so the flow survives being
                  bounced through Google sign-in. It is validated and expired when it comes back.
                </li>
                <li>
                  Small interface preferences: which org you were last in, dismissed checklists,
                  and a cached copy of the weekly digest sentence.
                </li>
              </ul>
            </section>

            {/* 10 ─ public */}
            <section className="tp__sec" id="public">
              <h2>Public links and shareable secrets</h2>
              <p className="tp__lede">
                Two things in {APP_NAME}{" "}are protected by a URL being hard to guess rather
                than by a permission check. That is a normal engineering trade-off, and you
                should know which two.
              </p>

              <h3>Profile photos and org logos are publicly reachable</h3>
              <p>
                Uploaded photos and crests are served from public storage.{" "}
                <strong>
                  Anyone holding the URL can open it, signed in or not, member or not
                </strong>
                . The address is not guessable in practice and is never listed anywhere, but it
                is not access-controlled either. Treat a profile photo as public, because
                functionally it is.
              </p>

              <h3>Your org&apos;s calendar feed</h3>
              <p>
                When an admin turns on calendar subscriptions, the org gets one private feed
                link that every member can see and add to Apple, Google or any other calendar
                app. <strong>Anyone holding that link can read the feed</strong>, signed in or
                not: the titles, dates, times and locations of the events on your timeline,
                and the titles of open task deadlines. It never carries descriptions, notes or
                an event&apos;s more details. The calendar apps people subscribe with fetch the
                feed regularly, so they receive it too. If the link leaks, an admin can issue a
                new one, which stops the old one working, or turn the feed off.
              </p>

              <h3>Invite links don&apos;t let anyone in</h3>
              <p>
                An invite link only lets someone <em>ask</em>{" "}to join. Opening it files a
                request, and nobody sees your roster or any of your data until an officer
                with the manage-members permission approves them. A link can still be set to
                never expire and to allow unlimited uses, so a leaked one mostly means more
                requests to turn down — revoke it if that happens.
              </p>

              <h3>One outbound request you should know about</h3>
              <p>
                When a member saves a link in the docs library, our server fetches that page
                once to build a preview card. The destination site therefore learns that
                someone using {APP_NAME}{" "}saved the link. We identify ourselves honestly in that
                request, read only the page head, and never fetch internal addresses.
              </p>
            </section>

            {/* 11 ─ retention */}
            <section className="tp__sec" id="retention">
              <h2>How long we keep things, and deletion</h2>
              <p className="tp__lede">
                The straight answer: as long as your organization exists, unless someone
                deletes it. Nothing expires on a timer today, and we would rather tell you that
                than imply a schedule we don&apos;t run.
              </p>

              <h3>Deleting an organization</h3>
              <p>
                An org admin can delete the whole workspace from settings, confirming by typing
                its name. This removes members, attendance, the ledger and budgets, events,
                tasks, polls, docs, roles, invites, announcements, the activity feed and the
                audit trail — in one transaction, so it either all goes or none of it does. Any
                paid subscription is cancelled first, and the org&apos;s logo and receipts are
                removed from storage too.
              </p>
              <p>
                One nuance worth stating, because the confirmation screen&apos;s member count
                can otherwise be misread: a member who also belongs to{" "}
                <strong>another</strong>{" "}organization keeps their account and simply loses this
                membership. Only people for whom this was their sole org have their record
                removed. Nobody loses access to an unrelated org because you deleted this one.
              </p>

              <h3>What a member can do themselves</h3>
              <ul className="tp__list">
                <li>
                  <strong>Leave an organization</strong>{" "}— drops your membership and role
                  grants. The last remaining admin can&apos;t leave, so an org is never
                  orphaned.
                </li>
                <li>
                  <strong>Delete your account</strong>{" "}— from settings, in one step. It
                  removes you from every org you belong to, along with your attendance,
                  excuses, dues payments, reimbursements, votes, tasks and role grants in each,
                  your join requests, your photo, and your sign-in itself. It is refused while
                  you are the last admin of an org, so no org is left without one.
                </li>
                <li>
                  <strong>Remove your profile photo</strong>{" "}— deletes the stored image.
                </li>
              </ul>

              <h3>When an officer removes a member</h3>
              <p>
                Someone holding the manage-members permission can remove a member. Everything
                that org holds about them goes — attendance, excuses, dues payments and
                charges, reimbursements, votes, tasks, service records. If they belong to
                another org too, only this org&apos;s records go; the other org keeps theirs.
              </p>

              <h3>What survives a member being removed, and why</h3>
              <ul className="tp__list">
                <li>
                  <strong>Ledger entries stay, detached from the person.</strong>{" "}Their dues
                  payment records go, but the money those payments put in the books stays as
                  ledger entries with no name on them — otherwise removing someone from a
                  roster would silently rewrite the books.
                </li>
                <li>
                  <strong>Audit and activity entries keep their name.</strong>{" "}A log that can be
                  edited after the fact isn&apos;t a log, and it is what protects officers in a
                  dispute as much as anything.
                </li>
                <li>
                  <strong>Approval records keep the approver&apos;s name and role</strong>{" "}as
                  they were at the time.
                </li>
              </ul>
            </section>

            {/* 12 ─ rights */}
            <section className="tp__sec" id="rights">
              <h2>Your rights, and how to use them</h2>
              <p className="tp__lede">
                Depending on where you live you may have formal rights over your data. In
                practice we handle access, correction and deletion requests the same way for
                everyone, and the table below shows where each stands today.
              </p>
              <div className="tp__tw">
                <table className="tp__t">
                  <thead>
                    <tr>
                      <th>Right</th>
                      <th>Where it stands today</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th>Know and access</th>
                      <td>
                        This page is the full inventory. For a copy of your own records, ask
                        your officers or ask us.
                      </td>
                    </tr>
                    <tr>
                      <th>Take it with you</th>
                      <td>
                        The roster and the ledger export to CSV from the app today. For
                        attendance, docs or anything else, ask us and we will produce it —
                        those two exports aren&apos;t built into the interface yet.
                      </td>
                    </tr>
                    <tr>
                      <th>Correct it</th>
                      <td>
                        You can edit your own name and photo. Roster fields are corrected by an
                        officer, or by us if that stalls.
                      </td>
                    </tr>
                    <tr>
                      <th>Delete it</th>
                      <td>
                        See <a href="#retention">section 11</a>{" "}— self-service for your
                        account, your memberships and whole orgs, with some audit and financial
                        history deliberately kept without your name.
                      </td>
                    </tr>
                    <tr>
                      <th>Object or restrict</th>
                      <td>
                        Write to us and we will act on it case by case. There is no
                        self-service control for this yet.
                      </td>
                    </tr>
                    <tr>
                      <th>Not be sold or profiled</th>
                      <td>
                        Already true for everyone — see <a href="#never">section 2</a>. Nothing
                        to request.
                      </td>
                    </tr>
                    <tr>
                      <th>Human review</th>
                      <td>
                        The assistant only drafts changes; a person with the right permission
                        confirms each one. See <a href="#assistant">section 6</a>.
                      </td>
                    </tr>
                    <tr>
                      <th>No retaliation</th>
                      <td>
                        Exercising any of this never costs you access or degrades the service.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>
                Write to <Fill value={PRIVACY_EMAIL} label="privacy contact address" />. We aim
                to acknowledge within <strong>5 business days</strong>{" "}and to complete a
                request within <strong>30 days</strong>. Where a law gives you a deadline, we
                work to that deadline, and if a request will take longer we&apos;ll tell you why.
                We may need to verify you control the account — usually by having you write
                from its email address.
              </p>
              <p>
                If we get it wrong, you can complain to your local data protection authority.
                In the UK that&apos;s the ICO; in the EU it&apos;s your national supervisory
                authority. We&apos;d rather you gave us a chance to fix it first.
              </p>
            </section>

            {/* 13 ─ legal bases */}
            <section className="tp__sec" id="bases">
              <h2>Why we&apos;re allowed to process this</h2>
              <p className="tp__lede">
                For readers who need the formal grounds — mostly relevant under UK and EU law.
                Where your organization is the controller, it relies on its own grounds and we
                act on its instruction.
              </p>
              <div className="tp__tw">
                <table className="tp__t">
                  <thead>
                    <tr>
                      <th>Purpose</th>
                      <th>Ground we rely on</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th>Running your org&apos;s workspace</th>
                      <td>
                        Performance of a contract — with your org as controller and us as its
                        processor
                      </td>
                    </tr>
                    <tr>
                      <th>Signing you in and keeping you signed in</th>
                      <td>Performance of a contract</td>
                    </tr>
                    <tr>
                      <th>Enforcing seats and org boundaries</th>
                      <td>Performance of a contract, and our legitimate interest in security</td>
                    </tr>
                    <tr>
                      <th>Answering questions through the assistant</th>
                      <td>Performance of a contract — it is part of the service you signed up for</td>
                    </tr>
                    <tr>
                      <th>Keeping an audit trail</th>
                      <td>
                        Legitimate interest — accountability, dispute resolution, and protecting
                        officers who handle money
                      </td>
                    </tr>
                    <tr>
                      <th>Preventing abuse and rate-limiting</th>
                      <td>Legitimate interest in keeping the service available</td>
                    </tr>
                    <tr>
                      <th>Monitoring errors and reliability</th>
                      <td>Legitimate interest in the service working</td>
                    </tr>
                    <tr>
                      <th>Improving assistant answers from your ratings</th>
                      <td>
                        Legitimate interest in product quality. This one is ours rather than
                        your org&apos;s, which is why we call it out specifically in{" "}
                        <a href="#data">section 3</a>.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>
                {LEGAL_ENTITY ? `${LEGAL_ENTITY} is` : "We are"} based in{" "}
                <Fill value={GOVERNING_STATE} label="jurisdiction" />, and this page is governed
                by the law there, without limiting rights you hold under the law where you live.
              </p>
            </section>

            {/* 14 ─ changes */}
            <section className="tp__sec" id="changes">
              <h2>Changes to this page</h2>
              <p className="tp__lede">
                This page will change as the product does, and the changes that matter are the
                ones that make it <em>less</em>{" "}generous.
              </p>
              <p>
                The effective date at the top moves whenever the substance changes. For a
                change that expands what we collect, adds a provider to{" "}
                <a href="#where">section 7</a>, or reduces a protection described here, we aim
                to tell organization admins <strong>before it takes effect</strong>, and to say
                what changed rather than only that something did.
              </p>
              <p>
                Fixing wording, adding detail, and moving items out of{" "}
                <a href="#security">&ldquo;what we don&apos;t claim yet&rdquo;</a>{" "}as they get
                built are ordinary updates and just move the date.
              </p>
            </section>

            {/* 15 ─ contact */}
            <section className="tp__sec" id="contact">
              <h2>Contact</h2>
              <p className="tp__lede">
                A real person reads these. Privacy questions, rights requests, security reports
                and &ldquo;is this a hidden account in my org&rdquo; all go to the same place.
              </p>
              <div className="tp__contact">
                <h3>Get in touch</h3>
                <p>
                  If you believe you have found a security vulnerability, please write to us
                  before disclosing it publicly. If you report in good faith — you don&apos;t
                  access or change other people&apos;s data beyond what you need to show the
                  problem, you don&apos;t disrupt the service, and you give us reasonable time to
                  fix it before going public — we won&apos;t take legal action against you over
                  the report, and we&apos;ll tell you what we did about it.
                </p>
                <dl className="tp__rows">
                  <div className="tp__row">
                    <dt>Operated by</dt>
                    <dd>
                      <Fill value={LEGAL_ENTITY} label="legal entity name" />
                    </dd>
                  </div>
                  <div className="tp__row">
                    <dt>Privacy &amp; rights</dt>
                    <dd>
                      <Fill value={PRIVACY_EMAIL} label="privacy contact address" />
                    </dd>
                  </div>
                  <div className="tp__row">
                    <dt>Security reports</dt>
                    <dd>
                      <Fill value={PRIVACY_EMAIL} label="security contact address" />
                    </dd>
                  </div>
                  <div className="tp__row">
                    <dt>Postal address</dt>
                    <dd>
                      <Fill value={POSTAL_ADDRESS} label="registered postal address" />
                    </dd>
                  </div>
                  <div className="tp__row">
                    <dt>Response target</dt>
                    <dd>We aim for 5 business days to acknowledge, 30 days to complete</dd>
                  </div>
                </dl>
              </div>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
