import { PaperIcon } from "../../../components/paper/PaperIcon";
import "./timeline-dayone.css";

/** First visit with nothing on the calendar at all: three pictures and one pair of
 *  buttons, the same shape as Meetings' and Fundraisers' day one. Add event opens
 *  the normal event form; Add a deadline goes where the header's Add Deadline goes. */
export function TimelineDayOne({ canEvents, canDeadlines, known, onAddEvent, onAddDeadline }: {
  canEvents: boolean; canDeadlines: boolean; known: boolean; onAddEvent: () => void; onAddDeadline: () => void;
}) {
  return <div className="tl1">
    <section className="tl1-card" aria-label="How the timeline works">
      <figure>
        <div className="pic">
          <span className="tl1-ticket" aria-hidden="true">
            <span className="stub"><small>Nov</small><b>14</b></span>
            <span className="body"><b>Fall formal</b><span>Fri · 8 pm</span><em>Party</em></span>
          </span>
        </div>
        <figcaption><b>1 · Add an event or deadline</b><span>What and when. Once.</span></figcaption>
      </figure>
      <figure>
        <div className="pic">
          <span className="tl1-line" aria-hidden="true">
            <span className="row past sky"><time>Nov 3</time>Chapter meeting</span>
            <span className="today">Today</span>
            <span className="row sky"><time>Nov 10</time>Chapter meeting</span>
            <span className="row new rose"><time>Nov 14</time>Fall formal</span>
            <span className="row dl butter"><time>Nov 20</time>Dues due</span>
          </span>
        </div>
        <figcaption><b>2 · It joins the line</b><span>In date order, for everyone.</span></figcaption>
      </figure>
      <figure>
        <div className="pic">
          <span className="tl1-door" aria-hidden="true">
            <span className="stamp">Here</span>
            <small>Tonight · required</small>
            <b>Chapter meeting</b>
            <span className="tap"><PaperIcon name="check" />I’m here</span>
            <span className="dots">{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < 9 ? "" : "o"} />)}</span>
            <span className="turn">9 of 10 here</span>
          </span>
        </div>
        <figcaption><b>3 · Tap in on the day</b><span>Required events count who came.</span></figcaption>
      </figure>
    </section>
    {/* until /me lands, can() reads false: show neither rather than flash the member line */}
    {!known ? null : canEvents || canDeadlines
      ? <div className="tl1-cta">
          {canDeadlines && <button type="button" className="tl1-btn soft" onClick={onAddDeadline}><PaperIcon name="flag" />Add a deadline</button>}
          {canEvents && <button type="button" className="tl1-btn" onClick={onAddEvent}><PaperIcon name="plus" />Add your first event</button>}
        </div>
      : <p className="tl1-note">Nothing on the line yet. An officer will add the first event or deadline.</p>}
  </div>;
}
