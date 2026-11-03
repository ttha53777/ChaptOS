// Terms of Service — the public contract page, linked from the marketing footer,
// the /create and /join agreement lines, and the in-app TermsGate.
//
// A sibling of /trust: same chrome, same reading layout (trust.css), and the same
// deliberate stillness — no LandingMotion, so no [data-reveal] / [data-para] /
// [data-hb] hooks may appear in this tree or they'd stay invisible. terms.css only
// adds what a contract needs and a disclosure page doesn't.
//
// Changing the SUBSTANCE of this page is publishing a new version: follow the
// steps at the top of lib/terms.ts, or existing members are never asked to agree.
// Section numbers are drawn by a CSS counter, and the text cross-references them
// ("section 22"), so adding or reordering a section means renumbering by hand.
import type { Metadata } from "next";

import "../components/landing/landing.css";
import "../trust/trust.css";
import "./terms.css";

import { Doodle, sx } from "../components/landing/Doodle";
import { DoodleSprite } from "../components/landing/DoodleSprite";
import { landingFontClass } from "../components/landing/fonts";
import { PublicNav } from "../components/landing/PublicChrome";
import { Footer } from "../components/landing/sections/Footer";
import { APP_NAME } from "@/lib/domains";
import { SUPPORT_EMAIL } from "@/lib/support";
import { GOVERNING_STATE, LEGAL_ENTITY, LEGAL_NAME, POSTAL_ADDRESS, VENUE } from "@/lib/legal";
import { TERMS_EFFECTIVE_LABEL } from "@/lib/terms";

export const metadata: Metadata = {
  title: `Terms of service — ${APP_NAME}`,
  description:
    "The contract for using ChaptOS: who's responsible for what, what we don't verify, " +
    "billing, liability and how disputes are resolved — each section summarized in plain English.",
};

/** The legal inbox, as a link. */
function Mail() {
  return <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;
}

/** A term still to be decided. Loud on purpose, same as /trust's placeholders:
 *  the page must not go out with one of these still showing. */
function Todo({ label }: { label: string }) {
  return <span className="tp__todo">[{label}]</span>;
}

const SECTIONS = [
  ["agreement", "Agreement"],
  ["who", "Who these terms cover"],
  ["eligibility", "Eligibility"],
  ["account", "Your account"],
  ["joining", "Joining, roles and permissions"],
  ["org-data", "Organization Data"],
  ["use", "Acceptable use"],
  ["content", "Your content"],
  ["events", "Events, parties and activities"],
  ["money", "Treasury, dues and fundraisers"],
  ["ai", "Ask Chapt and AI features"],
  ["billing", "Subscriptions and billing"],
  ["free", "Free plan and changes"],
  ["privacy", "Privacy"],
  ["third", "Third-party services"],
  ["ours", "Ownership of ChaptOS"],
  ["termination", "Suspension and termination"],
  ["after", "Data after you leave"],
  ["disclaimers", "Disclaimers"],
  ["liability", "Limitation of liability"],
  ["indemnity", "Indemnity"],
  ["disputes", "Disputes and arbitration"],
  ["law", "Governing law and venue"],
  ["general", "Changes and general terms"],
  ["contact", "Contact"],
] as const;

const SHORT_VERSION = [
  {
    icon: "board", tone: "lilac", border: "#DCD2FB",
    title: "Your org owns its records, and their accuracy",
    text: "Organizations enter GPA, dues, attendance and service hours themselves. We don't check them against any school, so they aren't official records.",
  },
  {
    icon: "wallet", tone: "mint", border: "#BDE7D2",
    title: "No money moves through us",
    text: "Treasury, dues and fundraisers are bookkeeping. The only payment we take is your subscription, through Stripe.",
  },
  {
    icon: "cal", tone: "butter", border: "#F4DFA6",
    title: "We keep the records, not the party",
    text: "ChaptOS doesn't plan, host or supervise events. Your org is responsible for what it runs, and hazing is banned outright.",
  },
  {
    icon: "flag", tone: "sky", border: "#CCDFFB",
    title: "Disputes go to arbitration, unless you opt out",
    text: "Talk to us first. Unresolved claims are settled one-on-one, not in class actions. You have 30 days to opt out by email.",
  },
] as const;

export default function TermsPage() {
  return (
    <div className={`lp tp tos ${landingFontClass}`}>
      <DoodleSprite />

      <PublicNav />

      <main id="top">
        {/* ── header + the short version ─────────────────────────────────── */}
        <section className="tp__hero">
          <div className="wrap">
            <div className="tp__head">
              <span className="eyebrow" style={sx({ "--eb": "var(--peach)" })}>
                Terms of service
              </span>
              <h1>The deal between you, your org and {APP_NAME}, in plain English first.</h1>
              <p className="lede">
                These terms are the contract for using {APP_NAME}. Each section opens with a
                one-line summary so you can see what it does before you read it. The summaries
                help you read; the full text under each one is what applies. How we handle data
                lives on our <a href="/trust">Trust &amp; privacy</a>{" "}page, and the two are
                written to agree.
              </p>
              <div className="tp__meta">
                <span>
                  Effective <span className="k">{TERMS_EFFECTIVE_LABEL}</span>
                </span>
                <span>Operated by {LEGAL_ENTITY}</span>
                <span>Applies to every account and organization workspace</span>
              </div>
            </div>

            <div className="tp__tldr">
              {SHORT_VERSION.map(c => (
                <div className="tldr" key={c.icon}>
                  <span
                    className="tldr__ic"
                    style={sx({ "--g": `var(--${c.tone}-soft)`, "--gb": c.border })}
                  >
                    <Doodle
                      id={c.icon}
                      className="doodle doodle--thin"
                      size={20}
                      viewBox="0 0 24 24"
                      style={sx({ color: `var(--${c.tone}-ink)` })}
                    />
                  </span>
                  <h4>{c.title}</h4>
                  <p>{c.text}</p>
                </div>
              ))}
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

            <section className="tp__sec" id="agreement">
              <h2>Agreement</h2>
              <p className="tp__lede">Using ChaptOS means agreeing to these terms.</p>
              <p>These Terms of Service (<b>“Terms”</b>) are a contract between you and <b>{LEGAL_ENTITY}</b>{" "}(<b>“ChaptOS,” “we,” “us”</b>). They cover the ChaptOS website at chaptos.com, the web app, and any related services (together, the <b>“Service”</b>).</p>
              <p>You accept these Terms when you check the box or click to agree, create an organization, request to join one, or use the Service. If you don't agree, don't use the Service.</p>
              <div className="tp__note tp__note--flag">
                <h5>Read section 22</h5>
                <p>It contains an <b>arbitration agreement and a class-action waiver</b>, which change how disputes are resolved. You can opt out within 30 days.</p>
              </div>
            </section>

            <section className="tp__sec" id="who">
              <h2>Who these terms cover</h2>
              <p className="tp__lede">Your organization is our customer. You're a user, and officers act on the organization's behalf.</p>
              <ul className="tp__list">
                <li><strong>Organizations.</strong>{" "}A chapter, club, team, council or similar group with a ChaptOS workspace (an <b>“Organization”</b>). The Organization is our customer, and pays for the Service under these Terms.</li>
                <li><strong>Members.</strong>{" "}Each individual with an account (<b>“you”</b>), whether an officer, an administrator or a regular member of one or more Organizations.</li>
              </ul>
              <p>Some obligations fall on the Organization, some on you, and some on both. When you act as an officer or administrator, you act on behalf of your Organization.</p>
              <p><strong>Authority to bind.</strong>{" "}If you create an Organization's workspace, manage its billing, or accept these Terms for an Organization, you confirm that you have authority to bind that Organization. If you don't, you are personally responsible for complying with these Terms.</p>
            </section>

            <section className="tp__sec" id="eligibility">
              <h2>Eligibility</h2>
              <p className="tp__lede">You must be 16 or older. Groups with younger members need to talk to us first.</p>
              <ul className="tp__list">
                <li>You must be <b>at least 16 years old</b>{" "}to create an account.</li>
                <li>Organizations must not use the Service to collect information about children under 13.</li>
                <li>If your organization includes members under 16, for example a high school group, contact us before setting it up. That use needs a separate written agreement, usually with the school.</li>
                <li>You may not use the Service if the law bars you from it, or if we have terminated your account for violating these Terms.</li>
              </ul>
              <p>If you are under the age of majority where you live, you confirm that a parent or guardian has reviewed and agreed to these Terms with you.</p>
            </section>

            <section className="tp__sec" id="account">
              <h2>Your account</h2>
              <p className="tp__lede">One Google sign-in, any number of organizations. Keep it secure.</p>
              <ul className="tp__list">
                <li>You sign in through a third-party identity provider (currently Google). One account can belong to several Organizations.</li>
                <li>Keep your sign-in secure. You are responsible for activity on your account. Tell us promptly at <Mail />{" "}if you believe someone else has accessed it.</li>
                <li>Give accurate information about yourself. Don't impersonate anyone or create accounts for other people.</li>
                <li>You can delete your account from your profile settings. <a href="#after">Section 18</a>{" "}explains what happens to your data.</li>
              </ul>
            </section>

            <section className="tp__sec" id="joining">
              <h2>Joining, roles and permissions</h2>
              <p className="tp__lede">Your organization decides who gets in and who sees what. We don't.</p>
              <p><strong>Joining is reviewed.</strong>{" "}An invite link doesn't grant access by itself. Opening one sends a join request, and an officer with the right permission decides whether to approve it. We don't decide who belongs to any Organization, and we aren't responsible for its decision to approve, reject or remove anyone.</p>
              <p><strong>Roles and permissions are set by the Organization.</strong>{" "}Each Organization decides who holds which role and what each role can see and change, including other members' GPA, dues balances, attendance and excuse reasons. Officers are responsible for granting permissions carefully and removing them when someone leaves a role.</p>
              <p><strong>Officers' actions are the Organization's actions.</strong>{" "}When an officer approves a member, edits a record, records a payment, posts minutes or approves an Ask Chapt proposal, they do it for the Organization, not for ChaptOS.</p>
              <p><strong>Plan limits.</strong>{" "}Paid plans may limit the number of members. An Organization at its limit can still receive join requests, but may need to upgrade or remove members before approving more.</p>
            </section>

            <section className="tp__sec" id="org-data">
              <h2>Organization Data</h2>
              <p className="tp__lede">Your organization is responsible for what it puts in ChaptOS. We don't verify grades, service hours or attendance.</p>
              <p><b>“Organization Data”</b>{" "}means any information an Organization, its officers or its members submit to the Service: rosters and roles, GPA and other academic information, attendance and absence records, service hours, dues balances, treasury entries, meeting minutes, tasks, documents, event details and custom fields.</p>
              <h3>(a) The Organization is responsible for its data</h3>
              <p>Each Organization is solely responsible for the accuracy, completeness, legality and authorization of its Organization Data. That includes:</p>
              <ol className="tp__list tp__list--num">
                <li>having the right, and any consent it needs, to collect and enter the data, store it in the Service and show it to its members;</li>
                <li>telling its members what it collects and why;</li>
                <li>following the laws, school policies and national-organization policies that apply to the data; and</li>
                <li>keeping the data current and correcting errors.</li>
              </ol>
              <h3>(b) ChaptOS doesn't verify records</h3>
              <p>ChaptOS does not independently verify Organization Data. In particular, it does not verify <b>academic records</b>{" "}(such as GPA, grades, enrollment or academic standing) or <b>service records</b>{" "}(such as service hours, event participation or attendance). It does not get them from any school, registrar or other third party.</p>
              <div className="tp__note tp__note--warn">
                <h5>Not an official record</h5>
                <p>Totals, standings, thresholds, reports, dashboards and Ask Chapt answers only reflect what was entered. ChaptOS records are not official transcripts or certified service records. Before using them for eligibility, scholarships, discipline, awards or reports to a school or national organization, check them against the original source.</p>
              </div>
              <h3>(c) Disputes about records</h3>
              <p>If you think a record about you is wrong, raise it with your Organization, which controls the record. Disputes about the content of Organization Data are between you and the Organization. We may help where our tools allow, but we aren't responsible for settling them.</p>
              <h3>(d) Our role</h3>
              <p>For Organization Data, the Organization decides what is collected and why, and we process it on the Organization's behalf, as described on our <a href="/trust#roles">Trust &amp; privacy page</a>.</p>
            </section>

            <section className="tp__sec" id="use">
              <h2>Acceptable use</h2>
              <p className="tp__lede">No hazing, harassment, break-ins or abuse, and keep sensitive data out of it.</p>
              <h3>Don't use the Service to</h3>
              <ul className="tp__list tp__list--no">
                <li>break any law, or any school, university or national-organization rule that applies to you;</li>
                <li>plan, organize, record or conceal <b>hazing</b>, harassment, discrimination, threats or violence;</li>
                <li>post content that is defamatory or obscene, or that invades someone's privacy, including private information about a member shared to embarrass or punish them;</li>
                <li>upload content you don't have the right to share, or that infringes someone's copyright, trademark or other rights;</li>
                <li>send spam, or use invite links to reach people who haven't asked to join;</li>
                <li>get into another Organization's workspace, another person's account, or any part of the Service you aren't permitted to use;</li>
                <li>probe, scan or test the Service's security, except under the good-faith reporting terms on our <a href="/trust#contact">Trust &amp; privacy page</a>;</li>
                <li>interfere with the Service, overload it, or get around its limits or permission checks;</li>
                <li>scrape the Service, or copy, resell or reverse-engineer it, except as the law expressly allows; or</li>
                <li>use Ask Chapt or other features to generate unlawful content or content that violates these Terms.</li>
              </ul>
              <h3>Data you must not put in the Service</h3>
              <p>Custom fields and free-text notes will hold anything typed into them. Don't use them to collect:</p>
              <ul className="tp__list tp__list--no">
                <li>health, medical or disability information, including allergies, medications or accommodations;</li>
                <li>biometric data;</li>
                <li>racial or ethnic origin, religious or philosophical beliefs, political opinions, union membership, sex life or sexual orientation;</li>
                <li>government identifiers, such as Social Security, passport or driver's license numbers, or immigration status;</li>
                <li>financial account details, such as card or bank account numbers;</li>
                <li>precise geolocation, or anyone's home address as a tracked field; or</li>
                <li>grades or student records obtained from a school, rather than reported by the member themselves.</li>
              </ul>
              <p>The Organization is responsible if this data is entered anyway. We may delete it when we find it.</p>
            </section>

            <section className="tp__sec" id="content">
              <h2>Your content</h2>
              <p className="tp__lede">You own what you upload. We only use it to run ChaptOS for you, never for ads or AI training.</p>
              <p><strong>You keep ownership.</strong>{" "}You and your Organization own the content you submit, including Organization Data, documents, minutes, messages and images (<b>“Content”</b>).</p>
              <p><strong>Our license to use it.</strong>{" "}You give us a worldwide, non-exclusive, royalty-free license to host, store, copy, process, transmit and display your Content, only as needed to run, secure and improve the Service for you and to comply with law. It includes sending Content to the service providers listed on our Trust &amp; privacy page. We don't sell your Content, use it for advertising, or use it to train AI models.</p>
              <p><strong>Feedback.</strong>{" "}If you send us ideas or suggestions, we may use them without owing you anything.</p>
              <p><strong>We don't review Content in advance,</strong>{" "}and we aren't responsible for Content that users post. We may remove Content, or restrict access to it, if we believe it violates these Terms or the law, or creates a risk for ChaptOS or other users.</p>
              <h3>Copyright complaints</h3>
              <p>If you believe Content on the Service infringes your copyright, send a notice to our designated agent (see <a href="#contact">Contact</a>). Include your contact details; the work you say is infringed; where the material is on the Service; a statement that you believe in good faith the use isn't authorized; a statement, under penalty of perjury, that your notice is accurate and that you're the owner or authorized to act for them; and your signature. We may terminate the accounts of repeat infringers.</p>
            </section>

            <section className="tp__sec" id="events">
              <h2>Events, parties and activities</h2>
              <p className="tp__lede">ChaptOS keeps records of events. It doesn't run them, and your organization is responsible for what it does.</p>
              <p>ChaptOS is record-keeping and scheduling software. It is not an event organizer, host, venue, sponsor or supervisor.</p>
              <ul className="tp__list">
                <li><strong>We don't plan, host, approve or attend</strong>{" "}any meeting, party, social event, philanthropy event, service activity, recruitment event or trip. Features such as the Parties page, guest lists, wristband counts and check-in only record what the Organization chooses to record.</li>
                <li><strong>The Organization and its members alone are responsible</strong>{" "}for every activity they run, whether or not it is recorded in ChaptOS. That includes guest safety, alcohol and other substances, transportation, venue rules, risk-management and insurance requirements, and following the policies of their school, national organization and governing councils.</li>
                <li><strong>Hazing is prohibited</strong>{" "}(<a href="#use">section 7</a>). ChaptOS records are not evidence that an activity was safe, approved or compliant.</li>
                <li>We don't monitor activities or Content for safety issues, and we have no duty to warn anyone about them.</li>
              </ul>
              <div className="tp__note tp__note--flag">
                <h5>In an emergency</h5>
                <p>Call <b>911</b>{" "}or local emergency services. ChaptOS is not a way to get help.</p>
              </div>
            </section>

            <section className="tp__sec" id="money">
              <h2>Treasury, dues and fundraisers</h2>
              <p className="tp__lede">These pages are bookkeeping. No organization money passes through ChaptOS.</p>
              <ul className="tp__list">
                <li><strong>No money moves through ChaptOS for Organizations.</strong>{" "}We don't hold, collect, transfer or pay out funds for Organizations or members. We are not a bank, payment processor, money transmitter, escrow agent or fiduciary. Recording a payment doesn't make one happen, and recording a balance doesn't mean the money exists.</li>
                <li><strong>No financial, accounting, tax or legal advice.</strong>{" "}Balances, standings, charts, overdue lists and reminders are calculated from what the Organization entered (<a href="#org-data">section 6</a>). The Organization is responsible for its real books, bank accounts, taxes, audits and any reports it owes its school or national organization.</li>
                <li><strong>Fundraising compliance is the Organization's job.</strong>{" "}That includes charitable-solicitation and registration rules, raffle and gaming laws, tax-deductibility claims, and delivering funds to the cause promised.</li>
                <li><strong>Dues disputes</strong>{" "}between a member and their Organization are between them (<a href="#org-data">section 6(c)</a>).</li>
              </ul>
              <p>Organizations pay ChaptOS for their subscription through Stripe. That billing is covered in <a href="#billing">section 12</a>.</p>
            </section>

            <section className="tp__sec" id="ai">
              <h2>Ask Chapt and AI features</h2>
              <p className="tp__lede">The assistant can be wrong. It proposes changes, and a person always approves them.</p>
              <p>Some features use artificial intelligence, including Ask Chapt, meeting-notes summaries and digests (<b>“AI Features”</b>).</p>
              <ul className="tp__list">
                <li><strong>AI output can be wrong.</strong>{" "}It may be incomplete, out of date or inaccurate, even when it sounds certain, and it is only as good as the Organization Data it reads. Check anything important before relying on it.</li>
                <li><strong>It proposes; people decide.</strong>{" "}When Ask Chapt suggests a change, such as a record update or a payment entry, nothing happens until a person with the right permission approves it. The person who approves an action, and their Organization, are responsible for it.</li>
                <li><strong>No professional advice.</strong>{" "}AI output isn't legal, financial, tax, medical, academic or mental-health advice.</li>
                <li><strong>Third-party AI providers.</strong>{" "}To answer, AI Features send relevant parts of your question and Organization Data to our AI provider, as described on our <a href="/trust#assistant">Trust &amp; privacy page</a>.</li>
                <li><strong>Don't misuse AI Features</strong>{" "}to break these Terms, or to try to extract data you aren't permitted to see.</li>
              </ul>
              <p>We may change, limit or remove AI Features at any time.</p>
            </section>

            <section className="tp__sec" id="billing">
              <h2>Subscriptions and billing</h2>
              <p className="tp__lede">Organizations pay monthly, it renews automatically, and you can cancel online any time.</p>
              <div className="tp__note tp__note--warn">
                <h5>Automatic renewal</h5>
                <p><b>Paid subscriptions renew automatically every month and charge the payment method on file until canceled.</b>{" "}At checkout we show the price, the billing frequency and how to cancel, and you agree to the recurring charge before you're billed.</p>
              </div>
              <div className="tp__tw">
                <table className="tp__t">
                  <thead><tr><th scope="col">Topic</th><th scope="col">What applies</th></tr></thead>
                  <tbody>
                    <tr><th scope="row">Who pays</th><td>The Organization, not individual members. Whoever starts or manages a subscription confirms they're authorized to, and to use the payment method they provide.</td></tr>
                    <tr><th scope="row">Pricing</th><td>Shown on our <a href="/pricing">pricing page</a>{" "}and at checkout. US dollars, billed monthly, excluding taxes. A seat is one active member; archived members don't count.</td></tr>
                    <tr><th scope="row">Changes in size</th><td>Your price follows your active member count. Growing into a higher band may require moving to that band's price before approving more members. We show the new price before any change takes effect.</td></tr>
                    <tr><th scope="row">Cancel</th><td>Any time, online, from the Billing page. Takes effect at the end of the paid month; then the Organization drops to the free plan. Organization Data isn't deleted.</td></tr>
                    <tr><th scope="row">Refunds</th><td>Payments are non-refundable, and there are no credits for partial months, except where the law requires it or we agree otherwise in writing.</td></tr>
                    <tr><th scope="row">Price changes</th><td>At least <b>30 days'</b>{" "}email notice to the billing contact before a new price applies to a renewal. Cancel before it takes effect if you don't agree.</td></tr>
                    <tr><th scope="row">Failed payments</th><td>We may retry, notify the billing contact, and limit or downgrade paid features until payment is made. Downgrading doesn't delete data.</td></tr>
                    <tr><th scope="row">Processor</th><td>Stripe, under <a href="https://stripe.com/legal">Stripe's terms</a>. Card details are entered on Stripe's pages and never pass through our servers.</td></tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="tp__sec" id="free">
              <h2>Free plan and changes to the Service</h2>
              <p className="tp__lede">Small organizations can use ChaptOS free. Features will change as we build.</p>
              <p>Some Organizations use the Service for free, for example below a member threshold. The free plan, its limits and which features are paid may change.</p>
              <p>We improve the Service continually, so features may be added, changed or removed. If we remove a major feature an Organization is paying for, we will try to give reasonable notice.</p>
            </section>

            <section className="tp__sec" id="privacy">
              <h2>Privacy</h2>
              <p className="tp__lede">How we handle data is on the Trust &amp; privacy page. Where it overlaps with these terms, that page wins on personal data.</p>
              <p>Our <a href="/trust">Trust &amp; privacy page</a>{" "}explains what data we hold, who can see it, where it is stored, which service providers process it, and how long we keep it. Read it with these Terms. If the two seem to conflict about how we handle personal data, the Trust &amp; privacy page controls.</p>
              <p>Organizations are responsible for telling their members what they collect (<a href="#org-data">section 6</a>). We don't email your members or contact them on your behalf.</p>
            </section>

            <section className="tp__sec" id="third">
              <h2>Third-party services</h2>
              <p className="tp__lede">Google, Stripe and our infrastructure providers have their own terms. Treat shareable links like passwords.</p>
              <p>The Service relies on, and may link to, services run by others, including Google for sign-in, Stripe for billing, our hosting and database providers, and our AI provider. Some features, such as calendar feeds or Instagram planning, connect to apps you use. Third-party services are governed by their own terms. We aren't responsible for them, their availability, or what they do with data you choose to send them.</p>
              <p><strong>Shareable links.</strong>{" "}Some features create links that work without signing in, such as an Organization's calendar feed. Anyone with such a link can use it. Profile photos and organization logos are reachable at <a href="/trust#public">public URLs</a>.</p>
            </section>

            <section className="tp__sec" id="ours">
              <h2>Ownership of ChaptOS</h2>
              <p className="tp__lede">Your content is yours. The software, name and design are ours.</p>
              <p><strong>Web only.</strong>{" "}ChaptOS is currently offered only through a web browser. If we release a mobile app, we'll update these Terms to cover it before it launches.</p>
              <p><strong>Our property.</strong>{" "}Apart from your Content, we and our licensors own the Service, including its software, design, text, graphics and the ChaptOS name and logos. We give you a limited, revocable, non-transferable right to use the Service under these Terms. You get no other rights in it, and you may not use our name or logos without permission.</p>
            </section>

            <section className="tp__sec" id="termination">
              <h2>Suspension and termination</h2>
              <p className="tp__lede">You can leave any time. We can suspend accounts that break the rules or put people at risk.</p>
              <p><strong>You or your Organization may stop at any time</strong>{" "}by leaving an Organization, deleting your account, or having an administrator delete the workspace.</p>
              <p><strong>We may suspend or end access</strong>{" "}for an account or an Organization, with or without notice, if we reasonably believe that:</p>
              <ul className="tp__list">
                <li>these Terms have been violated, including the acceptable-use rules in <a href="#use">section 7</a>;</li>
                <li>someone is at risk of harm, or the law, a court or a regulator requires it;</li>
                <li>the use exposes ChaptOS, other users or third parties to risk or legal liability; or</li>
                <li>the Organization hasn't paid (<a href="#billing">section 12</a>).</li>
              </ul>
              <p>Where it's reasonable and lawful, we'll tell the Organization's administrators first and give them a chance to fix the problem. We may also end the Service as a whole with at least <b>30 days'</b>{" "}notice, and refund any prepaid fees for the period after it ends.</p>
            </section>

            <section className="tp__sec" id="after">
              <h2>Data after you leave</h2>
              <p className="tp__lede">Deleting removes your records. Ledger totals and audit logs stay so the books still balance.</p>
              <ul className="tp__list">
                <li><strong>Deleting your account</strong>{" "}removes you from every Organization you belong to, along with your records in each, as described on our <a href="/trust#retention">Trust &amp; privacy page</a>. You can't delete your account while you're the last administrator of an Organization.</li>
                <li><strong>Removal by an Organization</strong>{" "}erases that Organization's records about you. Records other Organizations hold about you are untouched.</li>
                <li><strong>Some records are kept on purpose.</strong>{" "}Ledger entries stay in the books without your name. Audit, activity and approval logs keep the names and roles of the people involved. We may also keep data where the law requires it, to resolve disputes, or to enforce these Terms.</li>
                <li><strong>Deleting an Organization</strong>{" "}permanently removes its workspace and Organization Data, and can't be undone once confirmed.</li>
                <li><strong>Getting a copy.</strong>{" "}Before deleting an Organization or ending a subscription, administrators can export what our export tools cover, or ask us at <Mail />{" "}for a copy. Deleted data may persist in backups for <Todo label="backup retention period" />{" "}before it is overwritten.</li>
              </ul>
              <p>Sections 6, 8, 9–11 and 18–24 survive the end of these Terms.</p>
            </section>

            <section className="tp__sec" id="disclaimers">
              <h2>Disclaimers</h2>
              <p className="tp__lede">ChaptOS is provided as is. Keep your own copies of records that matter.</p>
              <div className="tp__legal">
                <p>THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE FULLEST EXTENT THE LAW ALLOWS, CHAPTOS DISCLAIMS ALL WARRANTIES, WHETHER EXPRESS, IMPLIED OR STATUTORY, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT AND ACCURACY.</p>
                <p>WE DON'T PROMISE THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE OR ERROR-FREE, THAT DATA WILL NEVER BE LOST, OR THAT ANY CALCULATION, REPORT, REMINDER OR AI OUTPUT WILL BE ACCURATE OR COMPLETE. WE DON'T VERIFY ORGANIZATION DATA (SECTION 6), AND WE AREN'T RESPONSIBLE FOR THE CONDUCT OF ANY ORGANIZATION, OFFICER, MEMBER OR GUEST, ON OR OFF THE SERVICE.</p>
              </div>
            </section>

            <section className="tp__sec" id="liability">
              <h2>Limitation of liability</h2>
              <p className="tp__lede">If something goes wrong, what we owe is capped at what your organization paid us in the last 12 months, or $100 if that's more.</p>
              <div className="tp__legal">
                <p>TO THE FULLEST EXTENT THE LAW ALLOWS:</p>
                <p><b>(a) NO INDIRECT DAMAGES.</b>{" "}CHAPTOS AND ITS OWNERS, EMPLOYEES, CONTRACTORS AND SERVICE PROVIDERS WON'T BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE, FUNDS, DATA, GOODWILL, SCHOLARSHIPS OR OPPORTUNITIES, OR FOR PERSONAL INJURY OR PROPERTY DAMAGE ARISING FROM ANY EVENT OR ACTIVITY.</p>
                <p><b>(b) CAP.</b>{" "}OUR TOTAL LIABILITY FOR ALL CLAIMS RELATING TO THE SERVICE OR THESE TERMS IS LIMITED TO THE GREATER OF (1) THE AMOUNT THE ORGANIZATION PAID US IN THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM, OR (2) US $100.</p>
                <p><b>(c) SCOPE.</b>{" "}THESE LIMITS APPLY TO EVERY THEORY OF LIABILITY, WHETHER CONTRACT, TORT (INCLUDING NEGLIGENCE), STATUTE OR ANYTHING ELSE, EVEN IF WE WERE TOLD SUCH DAMAGES WERE POSSIBLE AND EVEN IF A REMEDY FAILS OF ITS ESSENTIAL PURPOSE, INCLUDING CLAIMS ARISING FROM DECISIONS MADE ON THE BASIS OF ORGANIZATION DATA OR AI OUTPUT.</p>
              </div>
              <p>Some places don't allow certain warranties or damages to be excluded. There, these limits apply only as far as the law permits, and nothing in these Terms limits liability that can't legally be limited.</p>
            </section>

            <section className="tp__sec" id="indemnity">
              <h2>Indemnity</h2>
              <p className="tp__lede">If what your organization does gets us sued, the organization covers it.</p>
              <p>To the fullest extent the law allows, <b>each Organization</b>{" "}will defend, indemnify and hold harmless ChaptOS and its owners, employees, contractors and service providers against third-party claims, damages, losses and costs, including reasonable attorneys' fees, arising from:</p>
              <ol className="tp__list tp__list--num">
                <li>its Organization Data or other Content, including its accuracy, legality and authorization (<a href="#org-data">section 6</a>);</li>
                <li>any event, party, activity, fundraiser or financial matter of the Organization or its members (<a href="#events">sections 9–10</a>);</li>
                <li>the actions of its officers and members, including decisions made using the Service; or</li>
                <li>a breach of these Terms or of law by the Organization or its members.</li>
              </ol>
              <p><strong>You personally</strong>{" "}agree to the same for claims arising from your own Content, your own conduct, or your own breach of these Terms or the law.</p>
              <p>We'll notify you of any such claim, and we may take part in the defense with our own lawyers. You may not settle a claim in a way that admits fault for us or binds us without our written consent.</p>
            </section>

            <section className="tp__sec" id="disputes">
              <h2>Disputes, arbitration and class-action waiver</h2>
              <p className="tp__lede">Talk to us first. If that fails, disputes go to individual arbitration, not court or class actions. You can opt out.</p>
              <div className="tp__note tp__note--flag">
                <h5>This affects your rights</h5>
                <p>To opt out of arbitration, email <Mail />{" "}within <b>30 days</b>{" "}of first accepting these Terms, with your name, the email you sign in with, and a clear statement that you opt out.</p>
              </div>
              <p><strong>(a) Talk to us first.</strong>{" "}Before filing any claim, send a written notice to <Mail />{" "}describing the dispute and what you want. We'll do the same if we have a claim against you. Both sides will try in good faith to resolve it within <b>60 days</b>.</p>
              <p><strong>(b) Binding arbitration.</strong>{" "}If it isn't resolved, you and ChaptOS agree that any dispute relating to the Service or these Terms will be decided by <b>binding individual arbitration</b>, not in court. The arbitration will be run by <Todo label="arbitration provider" />{" "}under its consumer or commercial rules, whichever applies, and the Federal Arbitration Act governs this section. The arbitrator decides all issues, including whether a dispute must be arbitrated, except as noted in (d) and (e).</p>
              <p><strong>(c) Class-action waiver.</strong> <b>Disputes will be resolved only on an individual basis.</b>{" "}Neither side may bring or join a class, collective, consolidated or representative action, and the arbitrator may not combine claims of different people.</p>
              <p><strong>(d) Exceptions.</strong>{" "}Either side may bring an individual claim in small-claims court, or ask a court for an injunction to stop infringement or misuse of intellectual property or unauthorized access to the Service.</p>
              <p><strong>(e) Mass filings.</strong>{" "}If 25 or more similar arbitration demands are filed by or with the help of the same lawyers or organizers, they will be handled in batches under the provider's mass-arbitration procedures. A court may enforce this paragraph.</p>
              <p><strong>(f) Opt out within 30 days,</strong>{" "}as described in the box above. Opting out doesn't affect any other part of these Terms.</p>
              <p><strong>(g) If (c) fails.</strong>{" "}If the class-action waiver is found unenforceable for a claim, that claim goes to court, not arbitration, and the rest of this section still applies to other claims.</p>
            </section>

            <section className="tp__sec" id="law">
              <h2>Governing law and venue</h2>
              <p className="tp__lede">{GOVERNING_STATE}{" "}law applies. Court cases, where allowed, are heard in {VENUE}.</p>
              <p>These Terms are governed by the laws of the State of {GOVERNING_STATE}{" "}and US federal law, without regard to conflict-of-law rules. Any claim not subject to arbitration will be brought only in the state or federal courts in <b>{VENUE}</b>, and you and ChaptOS consent to their jurisdiction. Any claim must be brought within <b>one year</b>{" "}after it arises, to the extent the law allows.</p>
            </section>

            <section className="tp__sec" id="general">
              <h2>Changes and general terms</h2>
              <p className="tp__lede">We'll give 30 days' notice before material changes, and ask you to accept the new version.</p>
              <p><strong>Changes to these Terms.</strong>{" "}The effective date at the top shows the current version. For material changes we'll give at least <b>30 days'</b>{" "}notice in the Service or by email to administrators, and we may ask you to accept the new version before continuing. If you keep using the Service after a change takes effect, you accept it. Changes to <a href="#disputes">section 22</a>{" "}don't apply to disputes already notified to us.</p>
              <ul className="tp__list">
                <li><strong>Entire agreement.</strong>{" "}These Terms and the policies they reference are the whole agreement about the Service. A separate signed agreement with an Organization controls where it conflicts.</li>
                <li><strong>Severability.</strong>{" "}If any part is unenforceable, the rest stays in effect.</li>
                <li><strong>No waiver.</strong>{" "}Not enforcing a right right away doesn't waive it.</li>
                <li><strong>Assignment.</strong>{" "}You may not transfer these Terms without our consent. We may transfer them in a merger, acquisition or sale of assets, or to a company formed to operate ChaptOS.</li>
                <li><strong>Force majeure.</strong>{" "}We aren't liable for delays or failures caused by events beyond our reasonable control, including outages at our service providers.</li>
                <li><strong>Independent parties.</strong>{" "}Nothing here creates a partnership, employment, agency or fiduciary relationship.</li>
                <li><strong>Notices.</strong>{" "}We may send notices to the email on your account or in the Service. Send legal notices to the addresses in <a href="#contact">Contact</a>.</li>
                <li><strong>Export and sanctions.</strong>{" "}You may not use the Service where US law prohibits it.</li>
              </ul>
            </section>

            <section className="tp__sec" id="contact">
              <h2>Contact</h2>
              <p className="tp__lede">
                Legal notices, arbitration opt-outs and copyright complaints all go to the same
                person.
              </p>
              <div className="tp__contact">
                <h3>Where to send things</h3>
                <p>Email is fastest. Mail is accepted for anything these Terms say must be in writing.</p>
                <dl className="tp__rows">
                  <div className="tp__row">
                    <dt>Operated by</dt>
                    <dd>{LEGAL_ENTITY}</dd>
                  </div>
                  <div className="tp__row">
                    <dt>Legal notices</dt>
                    <dd><Mail /></dd>
                  </div>
                  <div className="tp__row">
                    <dt>Mailing address</dt>
                    <dd>{POSTAL_ADDRESS}</dd>
                  </div>
                  <div className="tp__row">
                    <dt>Arbitration opt-out</dt>
                    <dd>
                      Email within 30 days of accepting (<a href="#disputes">section 22(f)</a>)
                    </dd>
                  </div>
                  <div className="tp__row">
                    <dt>Copyright agent</dt>
                    <dd>{LEGAL_NAME}, at the email and address above</dd>
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
