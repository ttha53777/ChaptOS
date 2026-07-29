import type { ReactNode } from "react";
import { Doodle, sx } from "../Doodle";

type Gripe = {
  rot: string;
  tint?: string;
  quote: ReactNode;
  icon: string;
  who: string;
};

const ROW_ONE: Gripe[] = [
  {
    rot: "-.6deg",
    quote: (
      <>
        I spent <b>two hours</b>{" "}
        matching Venmo notes to a spreadsheet. One said &quot;🍕&quot;.
      </>
    ),
    icon: "wallet",
    who: "Treasurer, 60-member chapter",
  },
  {
    rot: ".5deg",
    tint: "var(--butter-soft)",
    quote: (
      <>
        Attendance is a <b>notebook</b>. The notebook is in someone&apos;s car. The car is
        in Ohio.
      </>
    ),
    icon: "clip",
    who: "Secretary, service club",
  },
  {
    rot: ".8deg",
    quote: (
      <>
        Minutes live in <b>three people&apos;s Notes app</b>. Nobody agrees what we
        decided.
      </>
    ),
    icon: "pencil",
    who: "Secretary, 90-member org",
  },
  {
    rot: "-.9deg",
    tint: "var(--sky-soft)",
    quote: (
      <>
        New treasurer asked where the money was. Honestly? <b>Four places.</b>
      </>
    ),
    icon: "receipt",
    who: "Outgoing president",
  },
  {
    rot: ".4deg",
    quote: (
      <>
        Our whole system was <b>one senior&apos;s Google Drive</b>. She graduated in May.
      </>
    ),
    icon: "people",
    who: "Incoming exec board",
  },
];

const ROW_TWO: Gripe[] = [
  {
    rot: ".7deg",
    tint: "var(--mint-soft)",
    quote: (
      <>
        I approved an <b>$84 reimbursement over text</b> and never wrote it down. The
        balance lied for a month.
      </>
    ),
    icon: "wallet",
    who: "Treasurer, 4 committees",
  },
  {
    rot: "-.5deg",
    quote: (
      <>
        Half the exec board <b>can&apos;t find</b>{" "}
        last year&apos;s event budget. It exists. Somewhere.
      </>
    ),
    icon: "folder",
    who: "President, 120-member org",
  },
  {
    rot: ".9deg",
    tint: "var(--lilac-soft)",
    quote: (
      <>
        Every term we rebuild the same roster sheet <b>from scratch.</b>
      </>
    ),
    icon: "loop",
    who: "Membership chair",
  },
  {
    rot: "-.8deg",
    quote: (
      <>
        Sent dues reminders to <b>nine people who&apos;d already paid.</b> Great look.
      </>
    ),
    icon: "chat",
    who: "Treasurer, honor society",
  },
];

function GripeCard({ g }: { g: Gripe }) {
  return (
    <div
      className={g.tint ? "gripe gripe--tint" : "gripe"}
      style={sx(g.tint ? { "--t": g.tint, "--rot": g.rot } : { "--rot": g.rot })}
    >
      <q>{g.quote}</q>
      <footer>
        <Doodle id={g.icon} size={14} />
        {g.who}
      </footer>
    </div>
  );
}

/**
 * The track renders its cards twice — the second half is what the loop wraps
 * onto, and marquee() measures the exact seam. Rendering from one array keeps
 * the halves from drifting apart.
 */
function MarqueeRow({ cards }: { cards: Gripe[] }) {
  return (
    <div className="marquee__row">
      <div className="marquee__track" data-marquee>
        {[...cards, ...cards].map((g, i) => (
          <GripeCard key={i} g={g} />
        ))}
      </div>
    </div>
  );
}

export function Pain() {
  return (
    <section className="pain" id="pain">
      <div className="wrap pain__head">
        <span className="eyebrow" style={sx({ "--eb": "var(--rose)" })} data-reveal>
          The 11 p.m. problem
        </span>
        <h2 data-reveal style={sx({ marginTop: "16px", "--d": "60ms" })}>
          Nobody signed up to be an admin.
        </h2>
        <p className="lede" style={{ marginTop: "18px" }} data-reveal>
          You ran for this because you cared about the org. Then the org turned out to be a
          filing system with a social calendar attached.
        </p>
        {/* ChaptOS hasn't launched, so these can't be customer quotes and the
            page shouldn't imply they are. */}
        <p className="pain__note" data-reveal style={sx({ "--d": "90ms" })}>
          Composites of the officer workload ChaptOS was designed around — not customer
          quotes.
        </p>
      </div>

      <div className="marquee" data-reveal style={sx({ "--d": "120ms" })}>
        <MarqueeRow cards={ROW_ONE} />
        <MarqueeRow cards={ROW_TWO} />
      </div>
    </section>
  );
}
