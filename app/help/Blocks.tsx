import { inline } from "../components/landing/inline";
import { PaperIcon, type PaperIconName } from "../components/paper/PaperIcon";
import type { Block } from "./content";

/**
 * Renders an article body. Server-only and stateless: the article page passes
 * the blocks straight from content.ts.
 *
 * Steps get the same ink pins as the figure above them, so step 3 and the
 * figure's ③ are visibly one thing. warn / flag / good notes are taped sticky
 * notes — the sharp edges you shouldn't skim past; plain notes are a calm aside.
 */

/** The anchor id an "h" block gets, and the "On this page" link to it. */
export function headingId(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const STICKY: Record<"warn" | "flag" | "good", { tint: string; icon: PaperIconName }> = {
  warn: { tint: "butter", icon: "alert" },
  flag: { tint: "peach", icon: "flag" },
  good: { tint: "mint", icon: "check" },
};

export function WherePath({ path }: { path: string[] }) {
  return (
    <span className="hc-path">
      {path.map((seg, i) => (
        <span key={i} style={{ display: "contents" }}>
          {i > 0 && <i>›</i>}
          <span>{seg}</span>
        </span>
      ))}
    </span>
  );
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="hc-body">
      {blocks.map((b, i) => {
        switch (b.k) {
          case "p":
            return <p key={i}>{inline(b.t)}</p>;
          case "h":
            return <h2 key={i} id={headingId(b.t)}>{inline(b.t)}</h2>;
          case "steps":
            return (
              <ol key={i} className="hc-steps">
                {b.items.map((item, j) => (
                  <li key={j}><i className="hc-pin">{j + 1}</i><span>{inline(item)}</span></li>
                ))}
              </ol>
            );
          case "list":
            return (
              <ul key={i} className={`hc-list${b.tone ? ` hc-${b.tone}` : ""}`}>
                {b.items.map((item, j) => <li key={j}>{inline(item)}</li>)}
              </ul>
            );
          case "note": {
            const s = b.tone && b.tone !== "info" ? STICKY[b.tone] : null;
            if (s) {
              return (
                <div key={i} className={`hc-sticky hc-t-${s.tint}`}>
                  <h5><PaperIcon name={s.icon} className="hc-ic" />{inline(b.h)}</h5>
                  <p>{inline(b.t)}</p>
                </div>
              );
            }
            return (
              <div key={i} className="hc-note">
                <PaperIcon name="chat" className="hc-ic" />
                <div><h5>{inline(b.h)}</h5><p>{inline(b.t)}</p></div>
              </div>
            );
          }
          case "table":
            return (
              <div key={i} className="hc-tw">
                <table>
                  <thead><tr><th>{b.head[0]}</th><th>{b.head[1]}</th></tr></thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}><th>{inline(r[0])}</th><td>{inline(r[1])}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "where":
            return (
              <div key={i} className="hc-where">
                <span className="hc-lbl-m"><PaperIcon name="pin" className="hc-ic" /></span>
                <WherePath path={b.path} />
              </div>
            );
        }
      })}
    </div>
  );
}
