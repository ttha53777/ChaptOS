import { Doodle } from "../components/landing/Doodle";
import type { Block } from "./content";
import { inline } from "../components/landing/inline";

/**
 * Renders an article body. One component per block kind, all styled by
 * `.lp .hc__…` rules in ./help.css — no motion hooks anywhere in here, since
 * the help pages never mount LandingMotion (see public-chrome.css).
 */

/** The click path to a setting, rendered as a chevron-separated strip. */
function Where({ path }: { path: string[] }) {
  return (
    <div className="hc__where">
      <span className="hc__where-l">
        <Doodle id="key" size={14} viewBox="0 0 24 24" className="doodle doodle--thin" />
        Where
      </span>
      <span className="hc__where-p">
        {path.map((seg, i) => (
          <span key={seg} className={i === path.length - 1 ? "is-last" : undefined}>
            {seg}
          </span>
        ))}
      </span>
    </div>
  );
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.k) {
          case "h":
            return <h2 key={i}>{inline(b.t)}</h2>;

          case "p":
            return <p key={i}>{inline(b.t)}</p>;

          case "steps":
            return (
              <ol key={i} className="hc__steps">
                {b.items.map((t, j) => (
                  <li key={j}>{inline(t)}</li>
                ))}
              </ol>
            );

          case "list":
            return (
              <ul
                key={i}
                className={`hc__list${b.tone ? ` hc__list--${b.tone}` : ""}`}
              >
                {b.items.map((t, j) => (
                  <li key={j}>{inline(t)}</li>
                ))}
              </ul>
            );

          case "note":
            return (
              <aside
                key={i}
                className={`hc__note${b.tone && b.tone !== "info" ? ` hc__note--${b.tone}` : ""}`}
              >
                <h5>{inline(b.h)}</h5>
                <p>{inline(b.t)}</p>
              </aside>
            );

          case "table":
            return (
              // Wide tables scroll inside their own box — the page never scrolls
              // sideways. The first header cell is often empty (a label column
              // that needs no title), which is fine and stays in the DOM so the
              // column association survives.
              <div key={i} className="hc__tw">
                <table className="hc__t">
                  <thead>
                    <tr>
                      {b.head.map((h, j) => (
                        <th key={j}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        <th>{inline(r[0])}</th>
                        <td>{inline(r[1])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case "where":
            return <Where key={i} path={b.path} />;
        }
      })}
    </>
  );
}
