import { PaperIcon, type PaperIconName } from "../../../components/paper/PaperIcon";
import "./docs-dayone.css";

/** A taped mini index card for the third picture; only the front one is named. */
function Mini({ kind, label, name }: { kind: "doc" | "sheet" | "form"; label: string; name?: string }) {
  return <div className={`dx1-mini k-${kind}`}>
    <div className="tp"><span className="fav"><PaperIcon name={kind as PaperIconName} /></span><span className="kind">{label}</span></div>
    {name
      ? <><p className="nm">{name}</p><p className="op">Open<PaperIcon name="out" /></p></>
      : <><i className="ln" /><i className="ln" /></>}
  </div>;
}

/** First visit to an empty library (no docs, no folders): three pictures and one
 *  button, the same shape as Fundraisers' day one. The button opens the normal Add form. */
export function DocsDayOne({ canManage, known, onAdd }: { canManage: boolean; known: boolean; onAdd: () => void }) {
  return <div className="dx1">
    <section className="dx1-card" aria-label="How Docs works">
      <figure>
        <div className="pic">
          <span className="dx1-key" aria-hidden="true">⌘V</span>
          <div className="dx1-url"><span className="t"><PaperIcon name="link" /></span><span className="u">docs.google.com/…</span></div>
        </div>
        <figcaption><b>1 · Paste a link</b><span>Any Google Doc, Sheet, Form or website.</span></figcaption>
      </figure>
      <figure>
        <div className="pic">
          <div className="dx1-name k-doc">
            <div className="tp"><span className="fav"><PaperIcon name="doc" /></span><span className="kind">Doc</span></div>
            <p className="nm"><span>Chapter bylaws</span></p><i className="ln" /><i className="ln" />
          </div>
        </div>
        <figcaption><b>2 · Give it a name</b><span>What would a new member call it?</span></figcaption>
      </figure>
      <figure>
        <div className="pic">
          <div className="dx1-shelf">
            <Mini kind="sheet" label="Sheet" />
            <Mini kind="form" label="Form" />
            <Mini kind="doc" label="Doc" name="Bylaws" />
            <span className="dx1-av" aria-hidden="true"><i className="a">JP</i><i className="b">AK</i><i className="c">SL</i></span>
          </div>
        </div>
        <figcaption><b>3 · Everyone can open it</b><span>It sits here as a card. One tap opens it.</span></figcaption>
      </figure>
    </section>
    {/* until /me lands, canManage reads false: show neither rather than flash the member line */}
    {!known ? null : canManage
      ? <div className="dx1-cta"><button type="button" className="dx1-btn" onClick={onAdd}><PaperIcon name="plus" />Add your first doc</button></div>
      : <p className="dx1-note">Nothing here yet. An officer can add the first one.</p>}
  </div>;
}
