/**
 * The figure that opens each help article: a small replica of the real screen
 * it's about, built from the real labels, with numbered pins (<i class="hc-pin">)
 * that match the article's numbered steps.
 *
 * Static markup by design. Every figure is authored here, takes no input, and
 * renders through dangerouslySetInnerHTML in [slug]/page.tsx — the same posture
 * as PaperSprite. The classes are the help centre's own mini-UI kit (help.css,
 * "mini-UI kit" section), and icons are the Paper sprite the root layout mounts.
 *
 * Accuracy rule as content.ts: when a screen's labels change, its figure
 * changes in the same PR. Names, amounts and dates are fictional and the
 * captions say so where it matters.
 */

/** A Paper sprite glyph. */
const I = (n: string, c = "ic") => `<svg class="hc-${c}"><use href="#pp-${n}"/></svg>`;
/** A numbered pin, matching step n. */
const P = (n: number) => `<i class="hc-pin">${n}</i>`;
/** The arrow between two stages of a flow. */
const AR = `<span class="hc-ar">${I("arrow-r")}</span>`;
/** An initials avatar on a pastel. */
const av = (t: string, c: string) => `<span class="hc-av" style="--av:var(--${c})">${t}</span>`;

export const FIGURES: Record<string, () => string> = {
  "set-up-your-org": () => `
    <div class="hc-flow">
      <div class="hc-st hc-t-butter"><i class="hc-pin">1</i><span class="hc-k">Name</span><b>Your org's name</b><p>The charter slides in beside it.</p></div>${AR}
      <div class="hc-st hc-t-sky"><i class="hc-pin">2</i><span class="hc-k">Interview</span><b>8 questions</b><p>You · kind · role · a normal month · money · files · tracking · term</p></div>${AR}
      <div class="hc-st hc-t-lilac"><i class="hc-pin">3</i><span class="hc-k">Roles</span><b>Who can do what</b><p>Seats as name badges.</p></div>
    </div>
    <div class="hc-flow" style="margin-top:14px">
      <div class="hc-st hc-t-mint"><i class="hc-pin">4</i><span class="hc-k">Timeline</span><b>Your categories</b><p>Rename, recolour, add.</p></div>${AR}
      <div class="hc-st hc-t-peach"><i class="hc-pin">5</i><span class="hc-k">Charter</span><b>Review it all</b><p>Web address, term, pages, words.</p></div>${AR}
      <div class="hc-st hc-hl hc-t-butter"><i class="hc-pin">6</i><span class="hc-k">Build</span><b>Continue with Google</b><p>The first moment anything is saved.</p><span class="hc-stamp hc-t-mint" style="position:absolute; right:8px; top:-12px; background:var(--card)">FILED</span></div>
    </div>`,
  "join-an-org": () => `
    <div class="hc-flow">
      <div class="hc-st hc-t-sky"><i class="hc-pin">1</i><span class="hc-k">You're invited</span><b>Join Oozma Kappa.</b><p>Org name and badge, before any sign-in.</p></div>${AR}
      <div class="hc-st hc-t-butter"><i class="hc-pin">2</i><span class="hc-k">Sign in</span><b>Continue with Google</b><p>No password, ever.</p></div>${AR}
      <div class="hc-st hc-t-lilac"><i class="hc-pin">3</i><span class="hc-k">Ask</span>
        <span class="hc-u-lb" style="margin-top:8px">Your full name</span><span class="hc-u-in">Maya Chen</span>
        <span class="hc-u-btn" style="margin-top:8px">Request to join</span></div>${AR}
      <div class="hc-st hc-hl hc-t-mint"><i class="hc-pin">4</i><span class="hc-k">Request sent</span><b>Waiting on Oozma Kappa.</b><p>Pending review — this page keeps checking.</p></div>
    </div>`,
  "first-term": () => `
    <div class="hc-f-grid2" style="align-items:center">
      <div class="hc-scr" style="max-width:380px; justify-self:center; width:100%">
        <div class="hc-scr-b" style="padding:18px">
          <span class="hc-lbl-m">${I("clock","ic")} </span><span class="hc-lbl-m">Period closed</span>
          <p class="hc-u-t" style="margin-top:8px; font-size:1.2rem">Your semester has <span class="hc-hi">ended</span>.</p>
          <p class="hc-u-s" style="margin-top:6px">The app stays locked until one is running.</p>
          <div class="hc-u-tabs" style="margin-top:14px"><span class="hc-on">Extend it</span><span>Start new</span></div>
          <span class="hc-u-lb" style="margin-top:12px">Run it through</span><span class="hc-u-in">May 20, 2027</span>
          <span class="hc-u-btn" style="margin-top:12px">Extend &amp; reactivate</span>
        </div>
      </div>
      <div style="display:grid; gap:8px">
        <div class="hc-st hc-t-peach"><span class="hc-k">Most common</span><b>Your semester has ended.</b><p>The active term's end date passed.</p></div>
        <div class="hc-st"><span class="hc-k">Rare</span><b>No active semester.</b><p>Terms exist, none is active.</p></div>
        <div class="hc-st"><span class="hc-k">Brand-new org</span><b>Set your first semester…</b><p>No terms at all.</p></div>
      </div>
    </div>`,
  "first-week": () => `
    <div class="hc-scr" style="max-width:460px; margin:0 auto">
      <div class="hc-scr-h">${I("plant")} Welcome · Your first week</div>
      <div class="hc-scr-b" style="padding:6px 14px">
        <div class="hc-u-row"><span class="hc-u-chk hc-on">${I("check")}</span><span class="hc-grow"><b>Describe your org</b><span class="hc-u-s">9 pages, your seats and your words</span></span></div>
        <div class="hc-u-row"><span class="hc-u-chk hc-on">${I("check")}</span><span class="hc-grow"><b>Set the term</b><span class="hc-u-s">Fall 2026 · Aug 24 – Dec 18 — active</span></span></div>
        <div class="hc-u-row"><span class="hc-u-chk"></span><span class="hc-grow"><b>Bring your people in</b><span class="hc-u-s">Send the link — you approve each request</span></span><span class="hc-u-btn">Make the invite link</span></div>
        <div class="hc-u-row"><span class="hc-u-chk"></span><span class="hc-grow"><b>Schedule your first chapter meeting</b><span class="hc-u-s">It lands on the timeline</span></span></div>
        <div class="hc-u-row"><span class="hc-u-chk"></span><span class="hc-grow"><b>Set this term's dues</b><span class="hc-u-s">One amount, one due date</span></span></div>
      </div>
    </div>`,
  "invite-people": () => `
    <div class="hc-f-grid2">
      <div class="hc-scr">
        <div class="hc-scr-h">${I("gear")} Settings · Invitations</div>
        <div class="hc-scr-b" style="display:grid; gap:10px">
          <div><span class="hc-u-lb">${P(1)} Label (optional)</span><span class="hc-u-in">Fall rush</span></div>
          <div><span class="hc-u-lb">${P(2)} Expires after</span><span class="hc-u-in" style="justify-content:space-between">7 days ${I("updown")}</span></div>
          <div style="display:flex; align-items:center; gap:8px"><span class="hc-u-chk hc-on">${I("check")}</span><span class="hc-u-lb" style="margin:0">${P(3)} Maximum uses</span><span class="hc-u-in" style="width:64px; margin-left:auto">25</span></div>
          <span class="hc-u-btn" style="justify-self:start">Create invite link</span>
        </div>
      </div>
      <div style="display:grid; gap:8px; align-content:start">
        <span class="hc-lbl-m">What a link can say</span>
        <div><span class="hc-pill hc-t-mint">Active</span> <span class="hc-u-s">people can ask</span></div>
        <div><span class="hc-pill hc-t-butter">All places reserved</span> <span class="hc-u-s">waiting requests fill the cap</span></div>
        <div><span class="hc-pill hc-t-butter">Admission limit reached</span> <span class="hc-u-s">cap is used up</span></div>
        <div><span class="hc-pill">Expired</span> <span class="hc-u-s">past its expiry</span></div>
        <div><span class="hc-pill hc-t-rose">Revoked</span> <span class="hc-u-s">turned off by you</span></div>
      </div>
    </div>`,
  "join-requests": () => `
    <div class="hc-f-grid2" style="grid-template-columns:minmax(0,1.25fr) minmax(0,1fr); align-items:start">
      <div class="hc-scr">
        <div class="hc-scr-h">${I("people")} Members</div>
        <div class="hc-scr-b">
          <div style="display:flex; gap:10px; align-items:flex-start">
            <span class="hc-tile hc-t-lilac">${I("envelope")}</span>
            <div style="min-width:0"><p class="hc-u-t">${P(1)} 3 people want in</p><p class="hc-u-s">They opened an invite link. Nothing is created until you approve.</p></div>
          </div>
          <div style="margin-top:10px; display:flex; gap:8px; align-items:center">${P(2)}<span class="hc-u-in hc-ph" style="flex:1">${I("search")}Search name or email</span></div>
          <div style="margin-top:6px">
            <div class="hc-u-row">${av("MC","sky")}<span class="hc-grow"><b>Maya Chen</b><span class="hc-u-s">via <b style="display:inline">Fall rush</b> link · 2d</span></span><span class="hc-u-btn">${I("check")}Review &amp; approve</span>${P(3)}</div>
            <div class="hc-u-row">${av("DP","butter")}<span class="hc-grow"><b>Dev Patel</b><span class="hc-u-s">via <b style="display:inline">Fall rush</b> link · 1d</span></span><span class="hc-u-btn hc-s">Decline</span></div>
          </div>
        </div>
      </div>
      <div class="hc-scr">
        <div class="hc-scr-b">
          <p class="hc-u-t">Approve Maya Chen?</p>
          <p class="hc-u-s" style="margin-top:6px">Approving creates their spot on the roster and lets them in immediately. They'll start with no dues, no attendance and no recorded hours.</p>
          <span class="hc-u-lb" style="margin-top:12px">Role</span><span class="hc-u-in" style="justify-content:space-between">No role — just a member ${I("updown")}</span>
          <div style="display:flex; justify-content:space-between; margin-top:14px; gap:6px; align-items:center"><span class="hc-u-btn hc-r">Decline</span><span style="display:flex; gap:6px; align-items:center"><span class="hc-u-btn hc-s">Cancel</span><span class="hc-u-btn">Approve</span>${P(4)}</span></div>
        </div>
      </div>
    </div>`,
  "roles-and-permissions": () => {
    const g = (t: string, tint: string, items: string[], on: number[]) => `<div class="hc-st hc-t-${tint}" style="padding:12px"><span class="hc-k">${t}</span><div style="margin-top:8px; display:grid; gap:6px">${items.map((x,i)=>`<div style="display:flex; align-items:center; gap:8px; font-size:.8rem"><span class="hc-u-tog ${on.includes(i)?"hc-on":""}"></span>${x}</div>`).join("")}</div></div>`;
    return `
    <div class="hc-f-grid2" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)">
      <div class="hc-f-grid2" style="gap:10px">
        ${g("People & access","sky",["Roster","Attendance","Roles","Org settings"],[0])}
        ${g("Money","mint",["Treasury","Fundraisers"],[0,1])}
        ${g("Calendar","lilac",["Events","Parties","Service","Semesters"],[])}
        ${g("Communication","peach",["Announcement","Docs","Tasks","Polls","Media"],[])}
      </div>
      <div class="hc-st" style="padding:14px">
        <span class="hc-k">Rank</span>
        <div style="margin-top:10px; display:grid; gap:6px">
          <div class="hc-u-row" style="padding:6px 0"><span class="hc-pill hc-t-butter">100</span><b style="display:inline">President</b></div>
          <div class="hc-u-row" style="padding:6px 0; border-color:var(--ink)"><span class="hc-pill hc-t-mint">60</span><b style="display:inline">Treasurer</b><span class="hc-u-s" style="margin-left:auto">you</span></div>
          <div class="hc-u-row" style="padding:6px 0"><span class="hc-pill">40</span>Social chair</div>
          <div class="hc-u-row" style="padding:6px 0"><span class="hc-pill">10</span>Member</div>
        </div>
        <p class="hc-u-s" style="margin-top:8px">↓ You can only create, edit or hand out roles <b style="display:inline; color:var(--ink)">below</b> yours.</p>
      </div>
    </div>`; },
  "org-admins": () => `
    <div class="hc-f-grid2" style="align-items:center">
      <div class="hc-scr"><div class="hc-scr-h">${I("people")} Settings · Accounts</div><div class="hc-scr-b" style="padding:4px 14px">
        <div class="hc-u-row">${av("JL","butter")}<span class="hc-grow"><b>Jordan Lee</b><span class="hc-u-s">President</span></span><span class="hc-pill hc-t-lilac">Admin</span><span class="hc-pill">You</span></div>
        <div class="hc-u-row">${av("PS","mint")}<span class="hc-grow"><b>Priya Shah</b><span class="hc-u-s">Treasurer</span></span></div>
      </div></div>
      <div style="display:grid; gap:8px">
        <span class="hc-lbl-m">${I("lock","ic")} Only an org admin</span>
        <div class="hc-f-row" style="gap:8px">
          <span class="hc-pill hc-t-butter">${I("receipt")}Billing</span><span class="hc-pill hc-t-rose">${I("trash")}Delete the org</span><span class="hc-pill hc-t-sky">${I("cal")}Calendar subscriptions</span>
        </div>
        <span class="hc-lbl-m" style="margin-top:10px">${I("key","ic")} Everything else → a permission</span>
        <p class="hc-u-s">Org settings, Roster, Treasury… can be handed to any role.</p>
      </div>
    </div>`,
  "member-card": () => `
    <div class="hc-f-grid2" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr); align-items:start">
      <div class="hc-scr"><div class="hc-scr-b">
        <div style="display:flex; gap:12px; align-items:center">${av("SO","peach")}<div><p class="hc-u-t">${P(1)} Sam Ortiz</p><p class="hc-u-s">Social chair · on watch — owes dues</p></div></div>
        <div class="hc-f-grid2" style="grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; margin-top:12px">
          <div class="hc-u-stat"><span class="hc-k">Attend.</span><div class="hc-v">86%</div></div>
          <div class="hc-u-stat"><span class="hc-k">GPA</span><div class="hc-v">3.4</div></div>
          <div class="hc-u-stat"><span class="hc-k">Dues</span><div class="hc-v">$60</div></div>
          <div class="hc-u-stat"><span class="hc-k">Service</span><div class="hc-v">7h</div></div>
        </div>
        <p class="hc-lbl-m" style="margin-top:12px">${P(2)} Needs attention</p>
        <div class="hc-u-row"><span class="hc-pill hc-t-butter">Excuse</span><span class="hc-grow">Chapter · Oct 14 — “Midterm”</span></div>
        <p class="hc-lbl-m" style="margin-top:8px">${P(3)} About</p>
        <div class="hc-u-row"><span class="hc-grow">Pledge class</span><span class="hc-u-s">Fall ’25</span></div>
      </div></div>
      <div class="hc-u-pop" style="--hs:var(--peach)">
        <div class="hc-r">${I("folder")}<span><b style="display:block">Archive</b><small>Hide from the roster and free a seat. History stays.</small></span></div>
        <hr>
        <div class="hc-r hc-danger">${I("trash")}<span><b style="display:block">Remove permanently…</b><small>For erasure requests or mistakes</small></span></div>
      </div>
    </div>`,
  "member-fields": () => `
    <div class="hc-f-grid2">
      <div class="hc-st hc-t-sky" style="padding:14px"><span class="hc-k">Member field — a value</span>
        <div class="hc-u-row" style="margin-top:8px"><span class="hc-grow">Pledge class</span><b style="display:inline">Fall ’25</b></div>
        <div class="hc-u-row"><span class="hc-grow">Section</span><b style="display:inline">Trumpet</b></div>
        <p class="hc-u-s" style="margin-top:6px">Up to 20. Remove one and its data is hidden, not deleted.</p></div>
      <div class="hc-st hc-t-mint" style="padding:14px"><span class="hc-k">Custom metric — a number with a goal</span>
        <p class="hc-u-t" style="margin-top:8px">Practice reps <span class="hc-u-s">· goal 20</span></p>
        <div class="hc-ruler" style="height:22px; margin-top:8px; border-width:1px"><span style="flex:8; background:var(--peach)">at risk</span><span style="flex:4; background:var(--butter)">watch</span><span style="flex:8; background:var(--mint)">on track</span></div>
        <div class="hc-ruler-ticks"><span style="left:40%">8</span><span style="left:60%">12</span><span style="left:100%">20</span></div>
        <p class="hc-u-s">At risk below 8 · watch below 12 (optional).</p></div>
    </div>`,
  "standing": () => `
    <div style="display:grid; gap:18px">
      <div><span class="hc-lbl-m">Attendance</span>
        <div class="hc-ruler" style="margin-top:6px"><span style="flex:65; background:var(--peach)">At risk</span><span style="flex:15; background:var(--butter)">Watch</span><span style="flex:20; background:var(--mint)">Good</span></div>
        <div class="hc-ruler-ticks"><span style="left:0">0%</span><span style="left:65%">65%</span><span style="left:80%">80%</span><span style="left:100%; transform:translateX(-100%)">100%</span></div></div>
      <div><span class="hc-lbl-m">GPA</span>
        <div class="hc-ruler" style="margin-top:6px"><span style="flex:27; background:var(--peach)">At risk</span><span style="flex:3; background:var(--butter)"></span><span style="flex:10; background:var(--mint)">Good</span></div>
        <div class="hc-ruler-ticks"><span style="left:0">0.0</span><span style="left:67.5%">2.7</span><span style="left:75%">3.0</span><span style="left:100%; transform:translateX(-100%)">4.0</span></div></div>
      <div class="hc-f-row" style="gap:8px; align-items:center"><span class="hc-lbl-m">Watch also if</span><span class="hc-pill hc-t-butter">${I("wallet")}owes any dues</span><span class="hc-pill hc-t-butter">${I("heart")}service hours below 10</span></div>
    </div>`,
  "remove-someone": () => {
    const col = (t: string, tint: string, keep: string[], go: string[]) => `<div class="hc-st hc-t-${tint}" style="padding:14px"><span class="hc-k">${t}</span>
      <ul class="hc-list hc-check" style="margin-top:8px; font-size:.8rem; gap:4px">${keep.map(x=>`<li>${x}</li>`).join("")}</ul>
      <ul class="hc-list hc-no" style="margin-top:6px; font-size:.8rem; gap:4px">${go.map(x=>`<li>${x}</li>`).join("")}</ul></div>`;
    return `<div class="hc-f-grid2">
      ${col("Archive","butter",["Attendance, dues, history","Their access to the org","Ledger entries"],["Their roster row","Their billable seat"])}
      ${col("Remove permanently","rose",["Ledger entries — without their name","Their records in other orgs"],["Attendance, excuses, exemptions","Dues, service hours, metrics","Roles, receipts"])}
    </div>`; },
  "treasury-basics": () => `
    <div class="hc-f-row" style="align-items:center; gap:8px">
      <div class="hc-st hc-t-butter" style="flex:1 1 110px"><span class="hc-k">Opening</span><b>$1,200</b></div><b style="flex:none">+</b>
      <div class="hc-st hc-t-mint" style="flex:1 1 110px"><span class="hc-k">Posted income</span><b>$3,450</b></div><b style="flex:none">+</b>
      <div class="hc-st hc-t-rose" style="flex:1 1 110px"><span class="hc-k">Party door</span><b>$640</b></div><b style="flex:none">−</b>
      <div class="hc-st hc-t-peach" style="flex:1 1 110px"><span class="hc-k">Posted expenses</span><b>$2,180</b></div><b style="flex:none">=</b>
      <div class="hc-st hc-hl hc-t-lilac" style="flex:1 1 120px"><span class="hc-k">Balance</span><b style="font-size:1.1rem">$3,110</b></div>
    </div>
    <div class="hc-f-row" style="margin-top:14px; gap:8px; align-items:center">
      <span class="hc-lbl-m">Not in it</span>
      <span class="hc-pill hc-x-out">Scheduled expenses</span><span class="hc-pill hc-x-out">Party expenses</span><span class="hc-pill hc-x-out">Fundraisers</span>
    </div>
    <div class="hc-u-tabs" style="margin-top:14px"><span class="hc-on">Overview</span><span>Transactions</span><span>Dues</span><span>Reports</span><span>Reimbursements</span></div>`,
  "dues": () => `
    <div style="display:grid; grid-template-columns:110px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr); gap:8px; align-items:stretch; overflow-x:auto">
      <span></span><span class="hc-lbl-m" style="align-self:end">Hand out dues</span><span class="hc-lbl-m" style="align-self:end">Record payment</span><span class="hc-lbl-m" style="align-self:end">Waive some</span>
      <span class="hc-st hc-t-lilac" style="padding:10px"><span class="hc-k">Their tab</span></span>
      <span class="hc-st" style="padding:10px"><b style="color:var(--peach-ink)">+ $120</b><p>owes more</p></span>
      <span class="hc-st" style="padding:10px"><b style="color:var(--mint-ink)">− $120</b><p>oldest charge first</p></span>
      <span class="hc-st" style="padding:10px"><b style="color:var(--mint-ink)">− $40</b><p>with a reason</p></span>
      <span class="hc-st hc-t-mint" style="padding:10px"><span class="hc-k">The books</span></span>
      <span class="hc-st hc-ghost" style="padding:10px"><b style="color:var(--ink-3)">nothing</b><p>no money moved</p></span>
      <span class="hc-st hc-hl hc-t-mint" style="padding:10px"><b>+ $120</b><p>a Dues income row</p></span>
      <span class="hc-st hc-ghost" style="padding:10px"><b style="color:var(--ink-3)">nothing</b><p>no money moved</p></span>
    </div>
    <div class="hc-f-row" style="margin-top:14px; gap:8px; align-items:center"><span class="hc-lbl-m">Standing</span><span class="hc-pill hc-t-mint">Paid</span><span class="hc-pill hc-t-sky">Due</span><span class="hc-pill hc-t-peach">Overdue</span><span class="hc-u-s">— past the due date with money owing</span></div>`,
  "reimbursements": () => `
    <div class="hc-flow">
      <div class="hc-st hc-t-sky" style="flex:1.2 1 200px"><i class="hc-pin">1</i><span class="hc-k">Request reimbursement</span>
        <div class="hc-f-grid2" style="gap:6px; margin-top:8px"><span class="hc-u-in">Oct 12</span><span class="hc-u-in">$46.20</span></div>
        <span class="hc-u-in" style="margin-top:6px">Decorations for formal</span>
        <span class="hc-u-in" style="margin-top:6px; border-style:dashed; color:var(--ink-3)">${I("receipt")}receipt.jpg</span></div>${AR}
      <div class="hc-st hc-t-butter"><i class="hc-pin">2</i><span class="hc-k">Waiting</span><b>Pending</b><p>${I("receipt","ic")}</p><span class="hc-u-btn hc-s" style="margin-top:4px">View receipt</span></div>${AR}
      <div class="hc-st hc-hl hc-t-mint"><i class="hc-pin">3</i><span class="hc-k">Treasurer</span><span class="hc-u-btn" style="margin-top:6px">Approve &amp; post</span><p>Expense lands in the ledger, dated the day it was spent.</p></div>
    </div>`,
  "money-categories": () => `
    <div class="hc-f-grid2">
      <div class="hc-st hc-t-mint" style="padding:14px"><span class="hc-k">Income</span><div class="hc-f-row" style="gap:6px; margin-top:8px"><span class="hc-pill hc-t-mint">${I("lock")}Dues</span><span class="hc-pill">Door</span><span class="hc-pill">Sponsorship</span><span class="hc-pill" style="border-style:dashed">${I("plus")}Add</span></div></div>
      <div class="hc-st hc-t-peach" style="padding:14px"><span class="hc-k">Expenses</span><div class="hc-f-row" style="gap:6px; margin-top:8px"><span class="hc-pill hc-t-peach">${I("lock")}Reimbursement</span><span class="hc-pill">Food</span><span class="hc-pill">Venue</span><span class="hc-pill hc-x-out">Old merch</span></div></div>
    </div>
    <div class="hc-f-row" style="margin-top:12px; gap:10px; align-items:center"><span class="hc-pill">${I("pencil")}Rename any</span><span class="hc-pill">${I("eye")}Hide unused</span><span class="hc-pill">${I("trash")}Delete only if nothing's filed under it</span></div>`,
  "export-your-data": () => {
    const f = (n: string, ext: string, t: string, tint: string, x?: boolean) => `<div class="hc-st ${x?"hc-ghost":""} hc-t-${tint}" style="text-align:center; padding:16px 10px"><span class="hc-tile hc-t-${tint}" style="margin:0 auto">${I(n)}</span><b style="font-family:var(--mono); font-size:.76rem; margin-top:8px" class="${x?"hc-x-out":""}">${ext}</b><p>${t}</p></div>`;
    return `<div class="hc-f-grid3" style="grid-template-columns:repeat(5,minmax(0,1fr))">
      ${f("sheet","transactions.csv","The ledger","mint")}
      ${f("people","brotherhood-roster.csv","The roster","sky")}
      ${f("doc",".md / print","Minutes","lilac")}
      ${f("cal",".ics","One event","butter")}
      ${f("check","attendance","No export yet","peach",true)}
    </div>`; },
  "timeline-and-events": () => {
    const t = (c: string, l: string, x: string) => `<div class="hc-tape" style="padding:10px 14px; border-radius:4px; background:color-mix(in srgb, ${c} 22%, var(--card)); border-left:4px solid ${c}; font-weight:600; font-size:.86rem; display:flex; justify-content:space-between; align-items:center">${l}<span class="hc-u-s" style="font-weight:500">${x}</span></div>`;
    return `<div style="display:grid; gap:12px; max-width:520px; margin:0 auto">
      ${t("var(--c-chapter)","Chapter","meetings · required by default")}
      ${t("var(--c-party)","Party","from Parties")}
      ${t("var(--c-service)","Community Service","from Service")}
      ${t("var(--c-deadline)","Deadline","tasks with a due date")}
      ${t("var(--c-fundy)","Fundraising","from Fundraisers")}
      <div style="padding:10px 14px; border-radius:4px; border:1.5px dashed var(--line-2); font-size:.86rem; color:var(--ink-3)">${"+ your own — up to 40 in all"}</div>
    </div>`; },
  "event-details": () => {
    const k = (n: string, tint: string, ic: string, x?: string) => `<div class="hc-st hc-t-${tint}" style="padding:10px; display:flex; gap:8px; align-items:center"><span class="hc-tile hc-t-${tint}" style="width:28px; height:28px">${I(ic)}</span><span style="min-width:0"><b style="margin:0; font-size:.8rem">${n}</b>${x?`<p style="margin:0">${x}</p>`:""}</span></div>`;
    return `<div class="hc-f-grid3" style="grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px">
      ${k("Checklist","mint","box","🔒 officers only")}${k("Budget","butter","wallet","🔒 officers only")}${k("Who's bringing what","peach","hand","members claim")}${k("Point of contact","sky","people")}
      ${k("Who's invited","lilac","envelope")}${k("Capacity","rose","ticket")}${k("Collabs","mint","link")}${k("Theme","peach","star")}
      ${k("Dress code","lilac","bag")}${k("Getting there","sky","pin")}${k("Links","mint","link")}${k("Your own field","butter","pencil","name it")}
    </div>`; },
  "meetings-and-minutes": () => `
    <div class="hc-f-grid2" style="align-items:start">
      <div class="hc-scr"><div class="hc-scr-h">${I("cal")} New chapter meeting</div><div class="hc-scr-b" style="display:grid; gap:9px">
        <div style="display:flex; align-items:center; gap:8px"><span class="hc-u-tog hc-on"></span><span style="font-size:.8rem"><b style="display:inline">Required attendance</b></span></div>
        <div><span class="hc-u-lb">Agenda</span><span class="hc-u-in">Weekly chapter meeting</span></div>
        <div style="display:flex; align-items:center; gap:8px"><span class="hc-u-tog hc-on"></span><b style="font-size:.8rem">Repeat</b><span class="hc-u-s">Every Tuesday</span></div>
        <div style="display:flex; gap:6px; flex-wrap:wrap"><div class="hc-u-tabs"><span class="hc-on">Weekly</span><span>Every 2 weeks</span></div><span class="hc-u-in" style="font-size:.74rem">Until · End of term</span></div>
        <span class="hc-u-btn" style="justify-self:start">Add 9 meetings</span>
      </div></div>
      <div class="hc-scr" style="background:var(--paper)"><div class="hc-scr-h">${I("pencil")} Meeting minutes</div>
        <div class="hc-scr-b" style="font-family:var(--mono); font-size:.76rem; line-height:1.9; background:repeating-linear-gradient(transparent 0 26px, var(--line) 26px 27px)">
          ## Treasury<br>• Formal deposit is due Friday<br>- Dev to send the budget by Oct 10<br>- Maya to book the bus
        </div>
        <div style="padding:10px 14px; border-top:1.5px dashed var(--line-2); display:grid; gap:6px">
          <span class="hc-lbl-m">${I("spark","ic")} Summarize → Action items</span>
          <div style="display:flex; gap:8px; align-items:center; font-size:.8rem"><span class="hc-u-chk hc-on">${I("check")}</span>Dev — send the budget · Oct 10</div>
          <div style="display:flex; gap:8px; align-items:center; font-size:.8rem"><span class="hc-u-chk"></span>Maya — book the bus</div>
        </div>
      </div>
    </div>`,
  "attendance": () => `
    <div class="hc-scr" style="display:grid; grid-template-columns:96px minmax(0,1fr); border-color:var(--ink); box-shadow:4px 4px 0 var(--sky)">
      <div style="background:var(--sky); filter:var(--note-filter); color:var(--note-ink); display:grid; place-items:center; border-right:2px dashed rgba(38,33,27,.3); font-family:var(--mono); font-size:.62rem; letter-spacing:.14em; writing-mode:vertical-rl; transform:rotate(180deg)">ADMIT ONE</div>
      <div class="hc-scr-b">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap"><div><span class="hc-lbl-m">Happening now</span><p class="hc-u-t">Chapter meeting <span class="hc-pill hc-t-peach" style="font-size:.66rem">Mandatory</span></p></div><span class="hc-stamp hc-t-mint">CHECK-IN OPEN</span></div>
        <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; align-items:center">${P(2)}<span class="hc-u-btn">${I("hand")}I'm here</span><span class="hc-u-s">31 of 44 here</span><span style="margin-left:auto; display:flex; gap:6px; align-items:center"><span class="hc-u-btn hc-s">Close &amp; record attendance</span>${P(3)}</span></div>
        <div style="margin-top:14px; height:8px; border-radius:6px; background:var(--paper-2); border:1px solid var(--line); overflow:hidden"><div style="width:62%; height:100%; background:var(--mint)"></div></div>
        <div style="display:flex; justify-content:space-between; font-family:var(--mono); font-size:.64rem; color:var(--ink-3); margin-top:4px"><span>${P(1)} opened 7:00</span><span>closes by itself 8:00</span></div>
      </div>
    </div>`,
  "excuses-and-exemptions": () => {
    const cell = (s: string) => `<span style="display:grid; place-items:center; height:28px; border-radius:7px; font-family:var(--mono); font-size:.7rem; font-weight:600; ${s==="P"?"background:var(--mint-soft); color:var(--mint-ink)":s==="A"?"background:var(--peach-soft); color:var(--peach-ink)":s==="E"?"background:var(--butter); color:var(--note-ink); box-shadow:0 0 0 1.5px var(--ink)":"background:var(--paper-3); color:var(--ink-3)"}">${s}</span>`;
    const row = (n: string, cells: string[], x?: string) => `<span style="font-size:.8rem; font-weight:600; align-self:center">${n}</span>${cells.map(cell).join("")}<span class="hc-u-s" style="align-self:center">${x||""}</span>`;
    return `<div style="display:grid; grid-template-columns:90px repeat(5,minmax(26px,1fr)) minmax(90px,1.2fr); gap:5px; overflow-x:auto">
      <span></span>${["Sep 2","Sep 9","Sep 16","Sep 23","Sep 30"].map(d=>`<span class="hc-lbl-m" style="text-align:center">${d}</span>`).join("")}<span></span>
      ${row("Maya",["P","P","P","P","P"])}
      ${row("Dev",["P","E","P","A","P"],"← one excuse")}
      ${row("Priya",["–","–","–","–","–"],"← exempt: abroad")}
    </div>`; },
  "tasks-and-polls": () => `
    <div class="hc-f-grid3">
      <div class="hc-st hc-t-mint" style="padding:14px"><span class="hc-k">Every member does it</span><p style="color:var(--ink-2)">Each ticks their own.</p><div style="display:flex; gap:4px; margin-top:10px">${[1,1,1,0,0].map(o=>`<span class="hc-u-chk ${o?"hc-on":""}">${o?I("check"):""}</span>`).join("")}</div><p class="hc-mono" style="margin-top:6px">3 of 5 done</p></div>
      <div class="hc-st hc-t-sky" style="padding:14px"><span class="hc-k">One person does it</span><p style="color:var(--ink-2)">First to finish closes it.</p><div style="display:flex; gap:6px; margin-top:10px; align-items:center"><span class="hc-u-chk hc-on">${I("check")}</span><span class="hc-u-s">Dev ticked it — done for everyone</span></div></div>
      <div class="hc-st hc-t-lilac" style="padding:14px"><span class="hc-k">Poll · blind until you vote</span><p style="color:var(--ink-2)">Formal theme?</p>
        <div style="display:grid; gap:5px; margin-top:8px">${["Masquerade","Great Gatsby","Under the sea"].map(o=>`<span class="hc-u-in" style="min-height:28px; font-size:.76rem">${o}<span style="margin-left:auto; color:var(--ink-3)">?</span></span>`).join("")}</div>
        <p class="hc-u-s" style="margin-top:6px">${I("lock","ic")}</p><p class="hc-u-s">Results show once you vote or it closes.</p></div>
    </div>`,
  "calendar-subscription": () => `
    <div class="hc-flow">
      <div class="hc-st hc-t-lilac"><i class="hc-pin">1</i><span class="hc-k">Settings · Calendar subscription</span><b>Choose the time zone</b><span class="hc-u-in" style="margin-top:6px">New York</span></div>${AR}
      <div class="hc-st hc-t-lilac"><i class="hc-pin">2</i><span class="hc-k">Org admin</span><span class="hc-u-btn" style="margin-top:8px">Turn on for members</span><p>A ~1 minute check, then it's on.</p></div>${AR}
      <div class="hc-st hc-t-sky"><i class="hc-pin">3</i><span class="hc-k">Timeline</span><span class="hc-u-btn hc-g" style="margin-top:8px">${I("cal")}Add to my calendar</span></div>${AR}
      <div class="hc-st hc-hl hc-t-mint"><i class="hc-pin">4</i><span class="hc-k">Anyone</span><b>Google or Apple</b><p>Keeps itself up to date.</p></div>
    </div>`,
  "service-hours": () => `
    <div class="hc-f-grid2" style="align-items:center">
      <div class="hc-st hc-t-mint hc-tape" style="padding:16px"><span class="hc-k">Punch card · Maya Chen</span>
        <div style="display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-top:10px">${Array.from({length:10},(_,i)=>`<span style="aspect-ratio:1; border-radius:50%; ${i<7?"background:var(--paper); box-shadow:inset 0 2px 3px rgba(0,0,0,.25)":"border:1.5px dashed var(--mint-ink)"}"></span>`).join("")}</div>
        <p class="hc-mono" style="margin-top:8px">7 of 10 hours</p></div>
      <div style="display:grid; gap:8px">
        <span class="hc-u-btn" style="justify-self:start">${I("clock")}Log my hours</span><span class="hc-u-s">Counts straight away — no review step.</span>
        <span class="hc-u-btn hc-g" style="justify-self:start; margin-top:6px">${I("clock")}Log hours</span><span class="hc-u-s">Officers, for everyone who came.</span>
      </div>
    </div>`,
  "programming-board": () => {
    const lane = (l: string, c: string, tint: string, pub?: boolean) => `<div class="hc-st hc-t-${tint} ${pub?"hc-hl":""}" style="padding:12px"><span class="hc-k">${l}</span><p style="color:var(--ink-2)">${c}</p>${pub?`<span class="hc-pill hc-t-mint" style="margin-top:8px">${I("timeline")}On the Timeline</span>`:`<span class="hc-pill" style="margin-top:8px">${I("lock")}Off the Timeline</span>`}</div>`;
    return `<div class="hc-flow">${lane("Idea","A title and a type.","butter")}${AR}${lane("Planning","Plus an owner — one person or role.","sky")}${AR}${lane("Confirmed","Plus a date and a place. Publishes it.","mint",true)}${AR}${lane("Done","It happened. Rate it and file it.","lilac",true)}</div>`; },
  "parties": () => `
    <div class="hc-f-grid2" style="align-items:center">
      <div class="hc-st hc-t-rose hc-tape" style="padding:16px; font-family:var(--mono); font-size:.78rem; line-height:1.9">
        <span class="hc-k">Wrap-up · All White</span><br>
        Door revenue ........ $640<br>Expenses ............ $210<br><span class="hc-u-s">Everyone starts ticked — untick the no-shows.</span>
      </div>
      <div style="display:grid; gap:8px">
        <div class="hc-st hc-t-mint" style="padding:10px"><b>Door revenue → Treasury balance ✓</b></div>
        <div class="hc-st hc-t-peach" style="padding:10px"><b>Expenses → not subtracted ✕</b><p>Log them as expense transactions too.</p></div>
      </div>
    </div>`,
  "instagram": () => `
    <div style="display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:5px; max-width:560px; margin:0 auto">
      ${["M","T","W","T","F","S","S"].map(d=>`<span class="hc-lbl-m" style="text-align:center">${d}</span>`).join("")}
      ${Array.from({length:14},(_,i)=>{const p = ({2:["Story","sky"],4:["Reel","rose"],9:["Carousel","butter"],11:["Reel ✓","mint"]} as Record<number, [string, string]>)[i]; return `<span style="min-height:52px; border-radius:9px; background:var(--card); border:1.5px solid var(--line); padding:4px; font-family:var(--mono); font-size:.62rem; color:var(--ink-3)">${i+1}${p?`<span class="hc-pill hc-t-${p[1]}" style="display:flex; margin-top:4px; font-size:.6rem; padding:1px 5px">${p[0]}</span>`:""}</span>`;}).join("")}
    </div>`,
  "fundraisers": () => `
    <div class="hc-flow" style="align-items:stretch">
      <div class="hc-st hc-t-peach"><i class="hc-pin">1</i><span class="hc-k">List your supplies</span><div style="font-family:var(--mono); font-size:.74rem; margin-top:6px; line-height:1.7">Flour &amp; sugar … $18<br>Butter … $14<br>Boxes … $11<br><b>Supplies … $43</b></div></div>${AR}
      <div class="hc-st hc-t-butter"><i class="hc-pin">2</i><span class="hc-k">Count what came in</span><b style="font-size:1.3rem; margin-top:10px">$180</b><p>One total, once the sale's over.</p></div>${AR}
      <div class="hc-st hc-hl hc-t-mint"><i class="hc-pin">3</i><span class="hc-k">See what you made</span><b style="font-size:1.3rem; margin-top:10px">$137</b><p>Came in, minus supplies.</p></div>
    </div>`,
  "ask-basics": () => `
    <div class="hc-scr" style="max-width:560px; margin:0 auto; border-color:var(--ink); box-shadow:4px 4px 0 var(--rose)">
      <div class="hc-scr-b">
        <span class="hc-u-in" style="border-color:var(--ink)">${I("spark")}Who hasn't paid dues?</span>
        <div style="margin-top:12px; padding-left:12px; border-left:2px solid var(--line-2); display:grid; gap:5px; font-size:.78rem; color:var(--ink-3)">
          <span style="display:flex; gap:6px; align-items:center">${I("check","ic")}Read the Dues board · 44 members</span>
          <span><span class="hc-pill" style="font-size:.66rem">Consulted · Dues</span> <span class="hc-pill" style="font-size:.66rem">Roster</span></span>
        </div>
        <p class="hc-u-t" style="margin-top:12px; font-size:1.06rem">Six people still owe — $540 in all.</p>
        <div style="margin-top:8px"><div class="hc-u-row">${av("SO","peach")}<span class="hc-grow">Sam Ortiz</span><span class="hc-mono">$120</span>${I("chev-r")}</div><div class="hc-u-row">${av("JR","sky")}<span class="hc-grow">Jamie Ruiz</span><span class="hc-mono">$90</span>${I("chev-r")}</div></div>
      </div>
    </div>`,
  "ask-what-it-sees": () => `
    <div class="hc-f-grid2" style="align-items:center">
      <div style="position:relative; aspect-ratio:1.25; max-width:340px; width:100%; justify-self:center">
        <div style="position:absolute; inset:0; border-radius:50%; border:2px dashed var(--line-2); display:grid; justify-items:center; padding-top:8px"><span class="hc-lbl-m">Other orgs — never</span></div>
        <div style="position:absolute; inset:14%; border-radius:50%; background:var(--sky-soft); border:1.5px solid var(--sky-bd); display:grid; justify-items:center; padding-top:10px"><span class="hc-lbl-m" style="color:var(--sky-ink)">Your org</span></div>
        <div style="position:absolute; inset:32%; border-radius:50%; background:var(--mint-soft); border:2px solid var(--ink); display:grid; place-items:center; text-align:center"><span class="hc-lbl-m" style="color:var(--mint-ink)">What your<br>seat can see</span></div>
      </div>
      <div style="display:grid; gap:6px; font-size:.82rem">
        <span class="hc-lbl-m">Open to everyone</span>
        <div class="hc-f-row" style="gap:5px"><span class="hc-pill hc-t-mint">Roster</span><span class="hc-pill hc-t-mint">Calendar</span><span class="hc-pill hc-t-mint">Ledger</span><span class="hc-pill hc-t-mint">Dues tab</span></div>
        <span class="hc-lbl-m" style="margin-top:8px">${I("lock","ic")} Gated, like in the app</span>
        <div class="hc-f-row" style="gap:5px"><span class="hc-pill hc-t-peach">Join requests · Roster</span><span class="hc-pill hc-t-peach">Exemptions · Attendance</span><span class="hc-pill hc-t-peach">Others' dues payments · Treasury</span><span class="hc-pill hc-t-peach">Poll turnout · Polls</span></div>
      </div>
    </div>`,
  "ask-approvals": () => {
    const card = (title: string, rows: [string, string][], perm: string, primary: string, secondary: string, hs: string) => `<div class="hc-scr" style="border-color:var(--ink); box-shadow:4px 4px 0 var(--${hs})"><div class="hc-scr-b">
      <span class="hc-pill hc-t-lilac" style="font-size:.66rem">Proposal</span><p class="hc-u-t" style="margin-top:8px">${title}</p>
      <div style="margin-top:6px">${rows.map(r=>`<div class="hc-u-row" style="padding:6px 0"><span class="hc-grow hc-u-s">${r[0]}</span><b style="display:inline">${r[1]}</b></div>`).join("")}</div>
      <p class="hc-u-s" style="margin-top:8px">${perm}</p>
      <div style="display:flex; gap:6px; margin-top:10px"><span class="hc-u-btn">${primary}</span><span class="hc-u-btn hc-s">${secondary}</span></div></div></div>`;
    return `<div class="hc-f-grid2">
      ${card("Record a dues payment",[["Member","Sam Ortiz"],["Amount","$120"]],`${I("lock","ic")}</p><p class="hc-u-s">Requires <b style="display:inline; color:var(--ink)">Manage dues</b>`,"Approve","Discard","lilac")}
      ${card("Submit an excuse",[["Event","Chapter · Oct 14"],["Reason","Midterm"]],"Only affects <b style='display:inline; color:var(--ink)'>your own</b> record","Submit","Discard","mint")}
    </div>`; },
  "ask-got-it-wrong": () => `
    <div class="hc-flow">
      <div class="hc-st hc-t-lilac"><i class="hc-pin">1</i><span class="hc-k">Open the trace</span><b>Read Fall 2026 ledger</b><p>…but you meant last year. There's the mistake.</p></div>${AR}
      <div class="hc-st hc-t-sky"><i class="hc-pin">2</i><span class="hc-k">Check the row</span><b>Open the record</b><p>Either the record or the answer is wrong.</p></div>${AR}
      <div class="hc-st hc-t-rose"><i class="hc-pin">3</i><span class="hc-k">Rate it</span><div style="display:flex; gap:6px; margin-top:6px"><span class="hc-u-btn hc-s">${I("thumb")}</span><span class="hc-u-btn hc-s" style="transform:scaleY(-1)">${I("thumb")}</span></div></div>
    </div>`,
  "docs-library": () => `
    <div class="hc-scr" style="max-width:560px; margin:0 auto"><div class="hc-scr-b">
      <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; align-items:center"><span class="hc-lbl-m">${I("tack","ic")}</span><div class="hc-u-tabs"><span class="hc-on">Manual</span><span>Newest</span><span>Name</span><span>Kind</span></div></div>
      <div style="margin-top:10px; padding:10px; border-radius:10px; background:var(--butter-soft); border:2px dashed var(--butter-ink); display:flex; gap:8px; align-items:center; font-weight:600; font-size:.84rem">${P(1)}${I("folder")} Recruitment <span class="hc-u-s" style="margin-left:auto">drop here to move</span></div>
      <div class="hc-u-row" style="margin-top:6px">${I("grip")}${I("doc")}<span class="hc-grow"><b>Bylaws 2026</b><span class="hc-u-s">docs.google.com</span></span><span class="hc-pill hc-t-butter">${I("tack")}Pinned</span></div>
      <div class="hc-u-row" style="background:var(--card); border:1.5px solid var(--ink); border-radius:10px; padding:8px; box-shadow:3px 3px 0 var(--lilac); transform:rotate(-1deg)">${P(2)}${I("grip")}${I("drive")}<span class="hc-grow"><b>Rush budget</b><span class="hc-u-s">drive.google.com</span></span></div>
      <div class="hc-u-row">${I("grip")}${I("form")}<span class="hc-grow"><b>Excuse form</b><span class="hc-u-s">forms.gle</span></span></div>
    </div></div>`,
  "activity-log": () => `
    <div class="hc-scr" style="max-width:520px; margin:0 auto"><div class="hc-scr-h">${I("timeline")} Settings · Activity log</div><div class="hc-scr-b" style="padding:4px 14px">
      <div class="hc-u-row">${av("PS","mint")}<span class="hc-grow">Priya recorded a $120 dues payment</span><span class="hc-mono hc-u-s">2h</span></div>
      <div class="hc-u-row">${av("JL","butter")}<span class="hc-grow">Jordan granted Treasurer to Priya</span><span class="hc-mono hc-u-s">1d</span></div>
      <div class="hc-u-row">${av("DP","sky")}<span class="hc-grow">Dev moved “Bylaws 2026” to Recruitment</span><span class="hc-mono hc-u-s">3d</span></div>
    </div></div>`,
  "ending-a-term": () => `
    <div class="hc-flow">
      <div class="hc-st"><span class="hc-k">Spring 2026</span><b>Readable</b><p>Events, ledger, attendance — all still there.</p></div>${AR}
      <div class="hc-st"><span class="hc-k">Fall 2026</span><b>Readable</b><p>Switch back to it any time.</p></div>${AR}
      <div class="hc-st hc-hl hc-t-butter"><span class="hc-k">Spring 2027</span><b>Active</b><p>Created → active immediately.</p><span class="hc-stamp hc-t-butter" style="position:absolute; right:10px; top:10px">ACTIVE</span></div>
    </div>`,
  "signing-in": () => `
    <div class="hc-st hc-t-butter" style="max-width:220px; margin:0 auto; text-align:center; padding:12px"><b>Signed in, but can't reach my org?</b></div>
    <div class="hc-f-grid3" style="grid-template-columns:repeat(4,minmax(0,1fr)); margin-top:14px">
      <div class="hc-st hc-t-sky"><span class="hc-k">Wrong account</span><p>Personal vs. school Gmail. Switch accounts.</p></div>
      <div class="hc-st hc-t-lilac"><span class="hc-k">Still waiting</span><p>Open your invite link — it says so.</p></div>
      <div class="hc-st hc-t-peach"><span class="hc-k">Left or removed</span><p>New link + an officer's approval.</p></div>
      <div class="hc-st hc-t-rose"><span class="hc-k">Invite required</span><p>That account isn't a member of that org.</p></div>
    </div>`,
  "multiple-orgs": () => `
    <div class="hc-f-grid2" style="align-items:center">
      <div class="hc-u-pop" style="--hs:var(--butter); max-width:300px; justify-self:center; width:100%">
        <div class="hc-r hc-on"><span class="hc-orglogo" style="width:28px; height:28px; font-size:.66rem">OK</span><span><b style="display:block">Oozma Kappa</b><small>Treasurer</small></span><span style="margin-left:auto; color:var(--mint-ink)">${I("check")}</span></div>
        <div class="hc-r"><span class="hc-orglogo" style="width:28px; height:28px; font-size:.66rem; background:var(--mint); transform:rotate(2deg)">MB</span><span><b style="display:block">Marching Band</b><small>Member</small></span></div>
      </div>
      <div class="hc-f-grid2" style="gap:8px">
        <div class="hc-st hc-t-butter"><span class="hc-k">Oozma Kappa sees</span><b>Rob</b><p>Treasurer · owes $120</p></div>
        <div class="hc-st hc-t-mint"><span class="hc-k">Marching Band sees</span><b>Robert Chen</b><p>Member · owes $0</p></div>
      </div>
    </div>`,
  "leaving-or-deleting": () => `
    <div class="hc-f-grid3">
      <div class="hc-st hc-t-butter" style="padding:14px"><span class="hc-k">Leave an org</span><div style="margin:10px 0; display:flex; gap:4px">${av("YO","butter")}<span class="hc-pill">one org</span></div><p>Your membership and roles there. Records stay with them.</p></div>
      <div class="hc-st hc-t-peach" style="padding:14px"><span class="hc-k">Delete your account</span><div style="margin:10px 0; display:flex; gap:4px">${av("YO","peach")}<span class="hc-pill">every org</span></div><p>Your login and your history everywhere. Type <b style="display:inline">DELETE</b>.</p></div>
      <div class="hc-st hc-t-rose hc-hl" style="padding:14px"><span class="hc-k">Delete the org</span><div style="margin:10px 0; display:flex; gap:-4px">${av("A","rose")}${av("B","sky")}${av("C","mint")}<span class="hc-pill">everyone in it</span></div><p>Everything the org holds. Type the org's exact name.</p></div>
    </div>`,
  "turn-pages-on-and-off": () => `
    <div class="hc-f-grid2" style="align-items:start">
      <div class="hc-scr"><div class="hc-scr-h">${I("gear")} Settings · Workflows</div><div class="hc-scr-b" style="padding:4px 14px">
        <div class="hc-u-row">${I("home")}<span class="hc-grow">Dashboard</span><span class="hc-pill">${I("lock")}Always on</span></div>
        <div class="hc-u-row">${I("timeline")}<span class="hc-grow">Timeline</span><span class="hc-pill">${I("lock")}Always on</span></div>
        <div class="hc-u-row">${I("note")}<span class="hc-grow">Meetings</span><span class="hc-u-tog hc-on"></span></div>
        <div class="hc-u-row">${I("wallet")}<span class="hc-grow">Treasury</span><span class="hc-u-tog hc-on"></span></div>
        <div class="hc-u-row">${I("camera")}<span class="hc-grow">Media</span><span class="hc-u-tog"></span></div>
      </div></div>
      <div class="hc-scr"><div class="hc-scr-h">${I("home")} Dashboard widgets</div><div class="hc-scr-b" style="padding:4px 14px">
        <div class="hc-u-row"><span class="hc-u-chk hc-on">${I("check")}</span><span class="hc-grow">Attendance KPI</span></div>
        <div class="hc-u-row"><span class="hc-u-chk">${""}</span><span class="hc-grow">GPA KPI <span class="hc-pill hc-t-peach" style="font-size:.64rem">also stops tracking GPA</span></span></div>
        <div class="hc-u-row"><span class="hc-u-chk hc-on">${I("check")}</span><span class="hc-grow">On your plate</span></div>
        <div class="hc-u-row"><span class="hc-u-chk hc-on">${I("check")}</span><span class="hc-grow">Announcement</span></div>
      </div></div>
    </div>`,
  "arrange-dashboard": () => `
    <div style="display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px">
      <div class="hc-st hc-t-butter" style="grid-column:1/-1; padding:10px"><span class="hc-k">Pinned note · top spot</span></div>
      <div class="hc-st hc-t-peach" style="padding:10px; min-height:70px"><span class="hc-k">On your plate</span></div>
      <div class="hc-st" style="padding:10px; border-color:var(--ink); box-shadow:4px 4px 0 var(--lilac); transform:rotate(-2deg)"><span class="hc-k">${I("grip","ic")}</span><span class="hc-k">Members</span><p>dragging…</p></div>
      <div class="hc-st hc-ghost" style="padding:10px"><p>drop here</p></div>
    </div>
    <div style="margin-top:12px; padding:10px; border-radius:12px; border:1.5px dashed var(--line-2); display:flex; gap:6px; flex-wrap:wrap; align-items:center"><span class="hc-lbl-m">Tray</span><span class="hc-pill hc-t-mint">Money</span><span class="hc-pill hc-t-sky">Dues</span><span class="hc-pill hc-t-lilac">Grades</span><span class="hc-pill hc-t-rose">Service</span><span class="hc-pill hc-t-peach">Media</span><span class="hc-pill">Practice reps</span></div>`,
  "rename-the-words": () => {
    const r = (a: string, b: string) => `<div class="hc-u-row"><span class="hc-grow hc-u-s">${a}</span>${I("arrow-r")}<b style="display:inline; min-width:110px">${b}</b></div>`;
    return `<div class="hc-scr" style="max-width:420px; margin:0 auto"><div class="hc-scr-h">${I("pencil")} Settings · Vocabulary</div><div class="hc-scr-b" style="padding:4px 14px">
      ${r("Member","Brother")}${r("Meetings","Chapter")}${r("Period","Season")}${r("Dues","Contributions")}
    </div></div>`; },
  "appearance": () => `
    <div class="hc-u-pop" style="--hs:var(--peach); max-width:260px; margin:0 auto">
      <div class="hc-r">${I("chev-l")}<b>Appearance</b></div><hr>
      <div class="hc-r hc-on">${I("moon")}Dark<span style="margin-left:auto; color:var(--mint-ink)">${I("check")}</span></div>
      <div class="hc-r">${I("sun")}Light</div>
      <div class="hc-r">${I("monitor")}System</div>
    </div>`,
  "what-you-pay": () => `
    <div style="display:grid; grid-template-columns:4fr 46fr 70fr 30fr; border:1.5px solid var(--ink); border-radius:12px; overflow:hidden; min-height:84px">
      <div style="background:var(--mint); filter:var(--note-filter); color:var(--note-ink); padding:10px 6px; text-align:center"><b style="display:block; font-size:.9rem">Free</b><span class="hc-mono" style="font-size:.66rem">1–4</span></div>
      <div style="background:var(--sky); filter:var(--note-filter); color:var(--note-ink); padding:10px; border-left:1.5px solid var(--ink)"><b style="display:block; font-size:1.1rem">$25</b><span class="hc-mono" style="font-size:.7rem">Standard · 5–50</span></div>
      <div style="background:var(--lilac); filter:var(--note-filter); color:var(--note-ink); padding:10px; border-left:1.5px solid var(--ink)"><b style="display:block; font-size:1.1rem">$65</b><span class="hc-mono" style="font-size:.7rem">Pro · 51–120</span></div>
      <div style="background:var(--paper-3); padding:10px; border-left:1.5px solid var(--ink)"><b style="display:block; font-size:.9rem">Quote</b><span class="hc-mono" style="font-size:.7rem">121+</span></div>
    </div>
    <p class="hc-u-s" style="margin-top:8px">Per month, for the whole org. Archived members don't count. Bar widths roughly follow headcount.</p>`,
  "member-limit": () => `
    <div class="hc-f-grid2">
      <div class="hc-st hc-t-peach" style="padding:14px"><span class="hc-k">Stops</span><ul class="hc-list hc-no" style="margin-top:8px; font-size:.84rem">
        <li>Approving a join request that would go over</li><li>Bringing back someone you just archived</li></ul></div>
      <div class="hc-st hc-t-mint" style="padding:14px"><span class="hc-k">Keeps working</span><ul class="hc-list hc-check" style="margin-top:8px; font-size:.84rem">
        <li>Everyone's access</li><li>Every page</li><li>Exports</li><li>People asking to join</li></ul></div>
    </div>`,
  "paying-and-invoices": () => `
    <div class="hc-scr" style="max-width:560px; margin:0 auto"><div class="hc-scr-b">
      <div class="hc-note" style="margin:0; background:var(--butter-soft); border-color:var(--butter-bd)">${I("alert")}<p><b>Your last payment didn't go through.</b> Everything still works and nobody has lost access.</p></div>
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-top:12px; flex-wrap:wrap"><span><b>Payment &amp; invoices</b><span class="hc-u-s" style="display:block">Cards, receipts and invoice history live in Stripe's portal.</span></span><span class="hc-u-btn">Update payment method</span></div>
    </div></div>`,
  "cancelling": () => `
    <div class="hc-flow">
      <div class="hc-st hc-t-butter"><i class="hc-pin">1</i><span class="hc-k">Today</span><span class="hc-u-btn hc-s" style="margin-top:6px">Cancel subscription</span></div>${AR}
      <div class="hc-st hc-t-sky"><i class="hc-pin">2</i><span class="hc-k">Until renewal</span><b>Nothing changes</b><span class="hc-u-btn hc-g" style="margin-top:6px">Resume subscription</span></div>${AR}
      <div class="hc-st hc-hl hc-t-mint"><i class="hc-pin">3</i><span class="hc-k">After renewal</span><b>Free allowance: 4</b><p>Everyone stays. Approving a 5th needs a subscription.</p></div>
    </div>`,
};
