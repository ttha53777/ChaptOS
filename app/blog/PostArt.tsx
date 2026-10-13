// Cover art for a post's head, drawn in the app's paper style: a legal pad of
// minutes, the summary card it turns into, and the stamp on the vote. Pure
// decoration (aria-hidden); the post itself says everything this shows.
import { Doodle, sx } from "../components/landing/Doodle";

export function MinutesArt() {
  return (
    <div className="bl__art" aria-hidden>
      <div className="bl__artpad">
        <span className="tape" />
        <div className="hd">
          <span>Chapter Meeting · Week 8</span>
          <span className="faces">
            <i style={sx({ "--c": "#2A66C7" })}>AW</i>
            <i style={sx({ "--c": "#C23C77" })}>SO</i>
            <i style={sx({ "--c": "#9C6B08" })}>JR</i>
          </span>
        </div>
        <ol>
          <li><b>§1</b>Call to order <em className="role">President</em></li>
          <li><b>§2</b>Officer reports</li>
          <li className="sub">Social: formal is sold out<span className="cur" /></li>
          <li><b>§3</b>Old business</li>
          <li className="sub">Voted 31–9–4. Motion passes.</li>
          <li><b>§4</b>New business</li>
        </ol>
      </div>

      <div className="bl__artcard">
        <span className="chip"><Doodle id="spark" size={12} viewBox="0 0 24 24" /> Summary</span>
        <div className="row done"><i /><span><em>@Marcus</em> order the grill</span><small>Fri</small></div>
        <div className="row"><i /><span><em className="role">@Treasurer</em> dues reminder</span><small>Fri</small></div>
      </div>

      <div className="bl__artstamp"><span>Passed</span><small>31–9–4</small></div>
      <Doodle id="star" size={30} viewBox="0 0 24 24" className="bl__artstar" style={sx({ color: "var(--peach-ink)" })} />
      <Doodle id="swirl" size={92} viewBox="0 0 120 46" className="bl__artswirl" style={sx({ color: "var(--ink-3)" })} />
    </div>
  );
}
