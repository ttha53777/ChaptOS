import { Doodle, sx } from "../Doodle";

export function Trust() {
  return (
    <section className="section" id="trust">
      <div className="wrap">
        <div className="trust__head">
          <span
            className="eyebrow"
            style={sx({ "--eb": "var(--sky)", justifyContent: "center" })}
            data-reveal
          >
            What earns it the keys
          </span>
          <h2
            data-reveal
            style={sx({
              marginTop: "16px",
              "--d": "60ms",
              maxWidth: "22ch",
              marginInline: "auto",
            })}
          >
            An assistant holding your org&apos;s money should be boring about it.
          </h2>
          <p className="lede" data-reveal style={sx({ marginTop: "18px", "--d": "110ms" })}>
            ChaptOS proposes; officers decide. Every number traces back to a record, every
            action lands in a log, and nothing writes without a human who&apos;s allowed to.
          </p>
        </div>

        <div className="guards">
          <div className="guard" data-reveal style={sx({ "--d": "0ms" })}>
            <span
              className="guard__ic"
              style={sx({ "--g": "var(--butter-soft)", "--gb": "#F4DFA6" })}
            >
              <Doodle
                id="shield"
                className="doodle doodle--thin"
                size={24}
                viewBox="0 0 24 24"
                style={sx({ color: "var(--butter-ink)" })}
              />
            </span>
            <h4>It can&apos;t act alone</h4>
            <p>
              Anything that touches money, members or the outside world arrives as a proposal
              with an Approve button — and it&apos;s checked against your seat before you
              ever see it. If your role can&apos;t do it, the card says so and names who can.
            </p>
          </div>
          <div className="guard" data-reveal style={sx({ "--d": "90ms" })}>
            <span
              className="guard__ic"
              style={sx({ "--g": "var(--sky-soft)", "--gb": "#CCDFFB" })}
            >
              <Doodle
                id="receipt"
                className="doodle doodle--thin"
                size={24}
                viewBox="0 0 24 24"
                style={sx({ color: "var(--sky-ink)" })}
              />
            </span>
            <h4>Every answer shows its work</h4>
            <p>
              No confident guesses. It reads your actual records, posts what it read as it
              goes, and every figure opens the payment, the meeting or the member it came
              from — so &quot;where did this number come from&quot; is a click, not an
              argument.
            </p>
          </div>
          <div className="guard" data-reveal style={sx({ "--d": "180ms" })}>
            <span
              className="guard__ic"
              style={sx({ "--g": "var(--mint-soft)", "--gb": "#BDE7D2" })}
            >
              <Doodle
                id="export"
                className="doodle doodle--thin"
                size={24}
                viewBox="0 0 24 24"
                style={sx({ color: "var(--mint-ink)" })}
              />
            </span>
            <h4>Your org, your data</h4>
            {/* Keep this claim inside what the product actually does: roster and
                ledger are the two CSV exports that exist (BrothersPage's own
                handleExport + /api/transactions/export), and deleting the whole
                workspace is genuinely self-serve for an org admin. Anything
                broader belongs on /trust, where the limits are stated too. */}
            <p>
              One org can&apos;t read another — that&apos;s enforced at the database, not
              just in the UI. Inside yours, seats decide who sees what. Roster and ledger
              export to CSV any time, and deleting the whole workspace is one
              confirmation away.
            </p>
          </div>
        </div>

        <p className="trust__more" data-reveal style={sx({ "--d": "240ms" })}>
          <a href="/trust">
            Read the full trust &amp; privacy page
            <Doodle
              id="arrow-r"
              className="doodle doodle--thin"
              size={18}
              viewBox="0 0 24 24"
            />
          </a>
          <span>
            Every mechanism named, plus the things we don&apos;t claim yet.
          </span>
        </p>
      </div>
    </section>
  );
}
