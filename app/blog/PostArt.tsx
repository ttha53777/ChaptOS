// Cover art for a post's head, drawn in the app's paper style: a legal pad of
// minutes, the summary card it turns into, and the stamp on the vote. Pure
// decoration (aria-hidden); the post itself says everything this shows.
import { Doodle, sx } from "../components/landing/Doodle";
import { formatDate, type PostMeta } from "./posts";

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

/** The Timeline post's cover: the semester on one spine, the group-chat
 *  question it settles, the spreadsheet it replaced, and the date already in
 *  your calendar. */
export function TimelineArt() {
  const rows: { mon: string; day: number; t: string; m: string; c: string }[] = [
    { mon: "Oct", day: 26, t: "Chapter Meeting", m: "8:00 PM · Chapter room", c: "#3f6ea3" },
    { mon: "Oct", day: 31, t: "Halloween social", m: "10:00 PM · The house", c: "#b34f72" },
    { mon: "Nov", day: 7, t: "Philanthropy 5K", m: "8:00 AM · Riverside Park", c: "#9a7224" },
    { mon: "Nov", day: 21, t: "Fall formal", m: "7:00 PM · The Grand Hall", c: "#b34f72" },
  ];
  return (
    <div className="bl__art bl__art--tl" aria-hidden>
      <div className="bl__tlxls">
        <div className="ttl"><i /><s>Fall calendar v3 FINAL (2)</s></div>
        <div className="g"><span>Social</span><span>10/31?</span><span>Formal</span><span>11/14</span><span>5K</span><span>TBD</span></div>
      </div>

      <div className="bl__tlcard">
        <span className="tape" />
        <div className="hd">Fall semester</div>
        <ol>
          {rows.map(r => (
            <li key={r.t} style={sx({ "--c": r.c })}>
              <span className="d"><small>{r.mon}</small><b>{r.day}</b></span>
              <span className="t">
                <b>{r.t}</b><small>{r.m}</small>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="bl__tlchat">is formal the <s>14th</s> or the 21st??</div>

      <div className="bl__tlcal">
        <span className="pg"><span className="m">Nov</span><span className="n">21</span></span>
        <span className="tx"><b>Fall formal</b><small>Added to your calendar</small></span>
      </div>

      <Doodle id="star" size={28} viewBox="0 0 24 24" className="bl__artstar" style={sx({ color: "var(--peach-ink)" })} />
    </div>
  );
}

/** The handoff post's cover: the library's manila folder with its index card,
 *  the seat changing hands, and the access wall it retires. */
export function HandoffArt() {
  return (
    <div className="bl__art bl__art--ho" aria-hidden>
      <div className="bl__hofolder">
        <span className="tab">Bylaws &amp; handbook</span>
        <div className="body">
          <div className="card">
            <span className="tape" />
            <b>Officer handbook</b>
            <small>One page per seat. Update yours before you hand it over.</small>
          </div>
          <div className="row"><i style={sx({ "--c": "var(--sky)" })} />Bylaws (2024 revision)</div>
          <div className="row"><i style={sx({ "--c": "var(--mint)" })} />Dues tracker</div>
          <div className="row"><i style={sx({ "--c": "var(--lilac)" })} />Reimbursement form</div>
        </div>
      </div>

      <div className="bl__holock"><span className="lk" /><s>You need access</s></div>

      <div className="bl__hoseat">
        <span className="role">Treasurer</span>
        <div className="pass">
          <span className="p old"><i style={sx({ "--c": "var(--mint)" })}>AW</i>Andre</span>
          <Doodle id="arrow-r" size={18} viewBox="0 0 24 24" />
          <span className="p"><i style={sx({ "--c": "var(--lilac)" })}>NK</i>Noah</span>
        </div>
        <small>3 open tasks follow the seat</small>
      </div>

      <div className="bl__hostamp"><span>Handed over</span><small>2026–27</small></div>
      <Doodle id="star" size={28} viewBox="0 0 24 24" className="bl__artstar" style={sx({ color: "var(--peach-ink)" })} />
    </div>
  );
}

/** A post filed in a manila folder: the fallback cover for posts without art
 *  of their own. Everything written on it comes from the post's frontmatter. */
function FolderArt({ post }: { post: PostMeta }) {
  return (
    <div className="bl__art bl__art--folder" aria-hidden>
      <div className="bl__folder">
        <span className="tab">{post.tags[0] ?? "Notes"}</span>
        <div className="sheet">
          <span className="k">{formatDate(post.date)}</span>
          <span className="t">{post.title}</span>
          <i /><i /><i /><i />
        </div>
      </div>
      <div className="sticky-note bl__foldernote" style={sx({ "--note": "var(--butter)", "--rot": "4deg" })}>
        <b>{`${post.readingMinutes} min`}</b> read
      </div>
      <Doodle id="clip" size={44} viewBox="0 0 24 24" className="bl__folderclip" style={sx({ color: "var(--ink-2)" })} />
      <Doodle id="star" size={30} viewBox="0 0 24 24" className="bl__artstar" style={sx({ color: "var(--peach-ink)" })} />
      <Doodle id="swirl" size={92} viewBox="0 0 120 46" className="bl__artswirl" style={sx({ color: "var(--ink-3)" })} />
    </div>
  );
}

/** The cover a post shows on the blog index: its own art when it has some. */
export function CoverArt({ post }: { post: PostMeta }) {
  if (post.tags.includes("meetings")) return <MinutesArt />;
  if (post.tags.includes("timeline")) return <TimelineArt />;
  if (post.tags.includes("handoff")) return <HandoffArt />;
  return <FolderArt post={post} />;
}
