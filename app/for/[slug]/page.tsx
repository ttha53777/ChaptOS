// One audience page — "here is the setup for an org like yours, and here is what
// it will and won't do for you".
//
// Statically generated from ../content.ts at build time (generateStaticParams
// enumerates all six slugs), so each page is a static document with no runtime
// data access — which is also why it's readable signed out.
//
// Motionless for the same reason as /help and /trust: no LandingMotion in this
// tree, so no [data-reveal] hooks anywhere or they'd stay invisible forever.
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import "../../components/landing/landing.css";
import "../../components/landing/public-chrome.css";
import "../for.css";

import { Doodle, sx } from "../../components/landing/Doodle";
import { DoodleSprite } from "../../components/landing/DoodleSprite";
import { landingFontClass } from "../../components/landing/fonts";
import { inline } from "../../components/landing/inline";
import { PublicNav } from "../../components/landing/PublicChrome";
import { Footer } from "../../components/landing/sections/Footer";
import { AudienceIcon } from "../AudienceIcon";
import { AUDIENCES, AUDIENCES_BY_SLUG, others, type BpSection } from "../content";
import { APP_NAME } from "@/lib/domains";

export function generateStaticParams() {
  return AUDIENCES.map(a => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const a = AUDIENCES_BY_SLUG.get(slug);
  if (!a) return { title: `Who it's for — ${APP_NAME}` };
  return {
    title: `${a.label} — ${APP_NAME}`,
    description: a.blurb,
  };
}

/** A note under a blueprint row. Carries inline marks; never louder than the row. */
function BpNote({ text }: { text: string }) {
  return <p className="bp__note">{inline(text)}</p>;
}

/** One section of the blueprint sheet. Same markup kit as the landing's setup. */
function BpRow({ s }: { s: BpSection }) {
  switch (s.k) {
    case "pages":
      return (
        <div className="bp__sec">
          <p className="bp__t">Pages</p>
          <div className="bp__chips">
            {s.on.map(p => (
              <span key={p} className="chip">
                {p}
              </span>
            ))}
            {s.off.map(p => (
              <span key={p} className="chip off">
                {p}
              </span>
            ))}
          </div>
          {s.note && <BpNote text={s.note} />}
        </div>
      );

    case "words":
      return (
        <div className="bp__sec">
          <p className="bp__t">{s.title ?? "Words your org uses"}</p>
          <div className="bp__words">
            {s.rows.map(([from, to]) => (
              <div className="wordrow" key={from}>
                <span className="from">{from}</span>
                <Doodle
                  id="arrow-r"
                  size={14}
                  style={sx({ color: "var(--line-2)", flex: "none" })}
                />
                <span className="to">{to}</span>
              </div>
            ))}
          </div>
          {s.note && <BpNote text={s.note} />}
        </div>
      );

    case "seats":
      return (
        <div className="bp__sec">
          <p className="bp__t">{s.title ?? "Seats"}</p>
          <div style={{ marginTop: "6px" }}>
            {s.rows.map(([name, can, rank]) => (
              <div className="seat" key={name}>
                <span className="nm">{name}</span>
                <span className="ab">{can}</span>
                <span className="rk">{rank}</span>
              </div>
            ))}
          </div>
          {s.note && <BpNote text={s.note} />}
        </div>
      );

    case "measures":
      return (
        <div className="bp__sec">
          <p className="bp__t">{s.title ?? "Tracked per member"}</p>
          <div className="bp__chips">
            {s.on.map(m => (
              <span key={m} className="chip">
                {m}
              </span>
            ))}
            {s.off.map(m => (
              <span key={m} className="chip off">
                {m}
              </span>
            ))}
          </div>
          {s.note && <BpNote text={s.note} />}
        </div>
      );

    case "cats":
      return (
        <div className="bp__sec">
          <p className="bp__t">Timeline categories</p>
          <div className="bp__chips">
            {s.rows.map(([label, color]) => (
              <span className="chip" key={label}>
                <i className="sw" style={sx({ "--c": color })} />
                {label}
              </span>
            ))}
          </div>
          {s.note && <BpNote text={s.note} />}
        </div>
      );

    // The closing row: the term, and the way into the flow that builds it.
    case "term":
      return (
        <div
          className="bp__sec"
          style={{
            background: "var(--paper-2)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <p className="bp__t">{s.label}</p>
            <p className="mono" style={{ marginTop: "6px", fontSize: ".9rem", fontWeight: 600 }}>
              {s.value}
            </p>
          </div>
          <a className="btn btn--sm" style={{ marginLeft: "auto" }} href="/create">
            Build it
          </a>
        </div>
      );
  }
}

export default async function AudiencePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const a = AUDIENCES_BY_SLUG.get(slug);
  if (!a) notFound();

  const tint = `var(--${a.tint})`;
  const tintInk = `var(--${a.tint}-ink)`;

  return (
    <div className={`lp pub fr ${landingFontClass}`}>
      <DoodleSprite />

      <PublicNav here="for" />

      <main id="top">
        {/* ── who this is for, and the shape of the answer ─────────────────── */}
        <section className="pub__hero">
          <div className="wrap">
            <div className="pub__head">
              {/* Parent only. The eyebrow under it already names this page, and
                  a crumb that repeats the eyebrow verbatim is two labels doing
                  one job — /help articles crumb the same way. */}
              <nav className="pub__crumbs" aria-label="Breadcrumb">
                <a href="/for">Who it&apos;s for</a>
              </nav>
              <span className="eyebrow" style={sx({ "--eb": tint })}>
                {a.eyebrow}
              </span>
              <h1>{a.title}</h1>
              <p className="lede">{inline(a.lede)}</p>
            </div>

            <div className="fr__glance">
              {a.glance.map(g => (
                <div key={g.l}>
                  <span className="k">{g.k}</span>
                  <span className="l">{g.l}</span>
                </div>
              ))}
            </div>

            <div className="fr__actions">
              <a className="btn btn--lg" href="/create">
                Set up your org{" "}
                <Doodle id="arrow-r" size={17} viewBox="0 0 24 24" />
              </a>
              <a className="btn btn--ghost btn--lg" href="/help/first-week">
                Read the first-week guide
              </a>
            </div>
          </div>
        </section>

        {/* ── the month, and what carries each part of it ──────────────────── */}
        <section className="fr__sec">
          <div className="wrap">
            <div className="fr__head">
              <span className="eyebrow" style={sx({ "--eb": "var(--sky)" })}>
                What recurs
              </span>
              <h2>{a.monthTitle}</h2>
              <p className="lede">{inline(a.monthLede)}</p>
            </div>

            <div className="fr__beats">
              {a.beats.map(b => (
                <div className="fr__beat" key={b.what}>
                  <p className="fr__when" style={sx({ "--bt": tintInk })}>
                    {b.when}
                  </p>
                  <div>
                    <h4>{inline(b.what)}</h4>
                    <p>{inline(b.how)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── the blueprint, and the argument for its shape ────────────────── */}
        <section className="fr__sec fr__sec--tint">
          <div className="wrap">
            <div className="fr__head">
              <span className="eyebrow" style={sx({ "--eb": "var(--butter)" })}>
                The optimal setup
              </span>
              <h2>{a.setupTitle}</h2>
              <p className="lede">{inline(a.setupLede)}</p>
            </div>

            <div className="fr__setup">
              <div className="fr__why">
                {a.why.map(w => (
                  <div key={w.h} style={sx({ "--wl": tint })}>
                    <h4>{inline(w.h)}</h4>
                    <p>{inline(w.p)}</p>
                  </div>
                ))}
              </div>

              <div className="fr__sheet">
                <div className="bp">
                  <div className="bp__hd">
                    <span className="k">{a.bp.name}</span>
                    <span className="pill pill--calm">{a.bp.kind}</span>
                    <span className="sub mono" style={{ marginLeft: "auto" }}>
                      {a.bp.sub}
                    </span>
                  </div>
                  {a.bp.sections.map((s, i) => (
                    <BpRow key={i} s={s} />
                  ))}
                </div>

                <p className="fr__bpfoot">
                  <Doodle id="pencil" style={sx({ color: "var(--butter-ink)" })} />
                  <span>
                    Every line is editable on this sheet before anything is built — and again
                    in Settings next term, when the org has changed its mind.
                  </span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── the order to do it in ────────────────────────────────────────── */}
        <section className="fr__sec">
          <div className="wrap">
            <div className="fr__head">
              <span className="eyebrow" style={sx({ "--eb": "var(--mint)" })}>
                Your first week
              </span>
              <h2>Do these five things, in this order.</h2>
              <p className="lede">
                Each one is cheap now and expensive later — that&apos;s the whole reason
                they&apos;re in this order.
              </p>
            </div>

            <ol className="fr__steps">
              {a.steps.map(s => (
                <li key={s.t}>
                  <h4>{inline(s.t)}</h4>
                  <p>{inline(s.p)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── what you'd actually ask it ───────────────────────────────────── */}
        <section className="fr__sec fr__sec--tint">
          <div className="wrap">
            <div className="fr__head">
              <span className="eyebrow" style={sx({ "--eb": "var(--lilac)" })}>
                Just ask
              </span>
              <h2>Three questions an org like yours actually types.</h2>
              <p className="lede">
                The assistant reads your real records and cites the rows it used. It drafts
                changes; a person with the right seat is what makes one happen.
              </p>
            </div>

            <div className="fr__asks">
              {a.asks.map(q => (
                <div className="spotmini is-live" key={q.q}>
                  <p className="spotmini__hd">
                    <Doodle id="spark" size={13} style={sx({ color: "var(--lilac-ink)" })} />
                    Ask Chapt <kbd>⌘K</kbd>
                  </p>
                  <p className="spotmini__q">{q.q}</p>
                  <p className="spotmini__a">{inline(q.a)}</p>
                </div>
              ))}
            </div>

            <p className="fr__asknote">
              <Doodle id="shield" size={16} viewBox="0 0 24 24" style={sx({ color: "var(--sky-ink)" })} />
              <span>
                Every draft is checked against your own seat before you see it. Without the
                permission the card is blocked rather than routed onward — and it names who
                does hold that authority.
              </span>
            </p>
          </div>
        </section>

        {/* ── what it won't do ─────────────────────────────────────────────── */}
        <section className="fr__sec">
          <div className="wrap">
            <div className="fr__head">
              <span className="eyebrow" style={sx({ "--eb": "var(--peach)" })}>
                Before you commit
              </span>
              <h2>What it won&apos;t do for you.</h2>
              <p className="lede">
                The section worth reading twice. Everything below is a real limit today, not
                a roadmap item dressed up as one — you should find this out here rather than
                in week three.
              </p>
            </div>

            <div className="fr__limits">
              {a.limits.map(l => (
                <div className="fr__limit" key={l.h}>
                  <h4>{inline(l.h)}</h4>
                  <p>{inline(l.p)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── the other five ───────────────────────────────────────────────── */}
        <section className="fr__other">
          <div className="wrap">
            <h3>Not quite you?</h3>
            <div className="fr__otherrow">
              {others(a.slug).map(o => (
                <a
                  className="fr__pill"
                  href={`/for/${o.slug}`}
                  key={o.slug}
                  style={sx({ "--pl": `var(--${o.tint})` })}
                >
                  <AudienceIcon doodle={o.doodle} tint={o.tint} size={15} />
                  {o.label}
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* ── the escalation, identical on every public page ───────────────── */}
        <section className="pub__ask">
          <div className="wrap">
            <div className="pub__askcard">
              <div className="t">
                <h3>Not sure this fits your org?</h3>
                <p>
                  Describe what you run in a normal month and we&apos;ll tell you plainly
                  whether this is the right tool — including when it isn&apos;t. One person
                  reads these, and they&apos;d rather say no early.
                </p>
              </div>
              <div className="a">
                <a className="btn btn--ghost" href="/help">
                  Browse the help centre
                </a>
                <a className="btn" href="/contact">
                  Talk to a human{" "}
                  <Doodle id="arrow-r" size={16} viewBox="0 0 24 24" />
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
