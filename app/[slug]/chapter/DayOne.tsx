import { PaperIcon } from "../../components/paper/PaperIcon";
import "./chapter-dayone.css";

/** First visit with no meetings at all: three pictures and one button, the same
 *  shape as Fundraisers' day one. The button opens the normal Add meeting form. */
export function MeetingsDayOne({ canManage, known, onAdd }: { canManage: boolean; known: boolean; onAdd: () => void }) {
  return <div className="mt1">
    <section className="mt1-card" aria-label="How meetings work">
      <figure>
        <div className="pic">
          <span className="mt1-cal" aria-hidden="true"><small>Tue · Nov</small><b>10</b><span>Chapter meeting<em>7 pm · the house</em></span></span>
        </div>
        <figcaption><b>1 · Add the meeting</b><span>When and where. Everyone sees it.</span></figcaption>
      </figure>
      <figure>
        <div className="pic">
          <span className="mt1-pad" aria-hidden="true">
            <span className="h">Old business</span>
            <span>Formal moved to Dec 5</span>
            <span className="act">– Ava: book the hall</span>
            <span>Dues due Nov 20<i className="cur" /></span>
          </span>
        </div>
        <figcaption><b>2 · Take the notes</b><span>Type as you go, right in the meeting.</span></figcaption>
      </figure>
      <figure>
        <div className="pic">
          <span className="mt1-filed" aria-hidden="true">
            <span className="stamp">Filed</span>
            <small>Nov 10 · who came</small>
            <span className="dots">{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < 9 ? "" : "o"} />)}</span>
            <span className="turn">9 of 10 came</span>
            <span className="todo"><span className="d"><i />Send the agenda</span><span><i />Ava · book the hall</span></span>
          </span>
        </div>
        <figcaption><b>3 · Keep the book</b><span>Who came, and who owes what next time.</span></figcaption>
      </figure>
    </section>
    {/* until /me lands, canManage reads false: show neither rather than flash the member line */}
    {!known ? null : canManage
      ? <div className="mt1-cta"><button type="button" className="mt1-btn" onClick={onAdd}><PaperIcon name="plus" />Add your first meeting</button></div>
      : <p className="mt1-note">No meetings yet. An officer will add the first one.</p>}
  </div>;
}
