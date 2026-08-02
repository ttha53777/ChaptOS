// The six audience pages linked from the marketing footer's "For" column.
//
// Content lives here and nowhere else; ./[slug]/page.tsx just arranges it. Every
// page answers the same two questions in the same order — "what does the setup
// look like for us" and "what does it actually do on a Tuesday" — so a visitor
// who reads two of them can compare.
//
// TRUTH RULES, same posture as app/trust and app/help:
//   1. The blueprint on each page is the REAL template from lib/org-types.ts —
//      the enabled workflows, the seeded seats and their ranks, the vocabulary
//      overrides and the starter event categories. If a template changes, these
//      change with it. Recommendations that go beyond the template (a seat the
//      org should add, a word it should rename) are labelled as recommendations.
//   2. Term windows come from lib/onboarding/terms.ts, so a date shown here is a
//      date the interview would actually suggest.
//   3. Every page carries a `limits` section, and it names things the product
//      genuinely cannot do — not soft caveats. It's the section most likely to
//      save someone a bad rollout, so it renders as prominently as the rest.
//
// Marks in copy: **bold**, *italic*, `code`, [label](/url) — see ../components/
// landing/inline.tsx. Nothing else is parsed.

/** Pastel family from landing.css. Same six as the help centre's categories. */
export type Tint = "butter" | "sky" | "mint" | "lilac" | "rose" | "peach";

/** One row of the blueprint sheet. Mirrors the sections of `.bp` in landing.css. */
export type BpSection =
  | { k: "pages"; on: readonly string[]; off: readonly string[]; note?: string }
  | { k: "words"; rows: readonly (readonly [string, string])[]; title?: string; note?: string }
  | { k: "seats"; rows: readonly (readonly [string, string, string])[]; title?: string; note?: string }
  | { k: "cats"; rows: readonly (readonly [string, string])[]; note?: string }
  | { k: "measures"; on: readonly string[]; off: readonly string[]; title?: string; note?: string }
  | { k: "term"; label: string; value: string };

export interface Audience {
  slug: string;
  /** Footer + index label. Matches the landing footer's "For" column exactly. */
  label: string;
  tint: Tint;
  /** Sprite id from ../components/landing/DoodleSprite. */
  doodle: string;
  /** One line on the index card. */
  blurb: string;
  /** Overrides the index card's "The setup, and the limits" call to action. */
  go?: string;

  eyebrow: string;
  title: string;
  lede: string;
  /** Four facts, read left to right under the hero. */
  glance: readonly { k: string; l: string }[];

  /** "A month in the life": what recurs, and what handles it. */
  monthTitle: string;
  monthLede: string;
  /** Overrides the section's "What recurs" eyebrow when the beats aren't a month. */
  monthEyebrow?: string;
  beats: readonly { when: string; what: string; how: string }[];

  /** The blueprint sheet + the argument for its shape. */
  setupTitle: string;
  setupLede: string;
  bp: { name: string; kind: string; sub: string; sections: readonly BpSection[] };
  why: readonly { h: string; p: string }[];

  /** The order to do things in, once it's built. */
  steps: readonly { t: string; p: string }[];
  /** Questions this particular org would actually type. */
  asks: readonly { q: string; a: string }[];
  /** What it will not do. Named plainly. */
  limits: readonly { h: string; p: string }[];
}

// ─────────────────────────────────────────────────────────────────────────────

const FRATERNITY: Audience = {
  slug: "fraternities-sororities",
  label: "Fraternities & sororities",
  tint: "butter",
  doodle: "people",
  blurb:
    "Weekly chapter, a dues ledger, service requirements and a full turnover every " +
    "spring. The heaviest setup, and the one this was built for first.",

  eyebrow: "For fraternities & sororities",
  title: "Dues, attendance, hours and standing — in one record the next exec inherits.",
  lede:
    "A chapter carries more operational load than any other org on campus: a meeting " +
    "every week with a roll behind it, a hundred dues balances, service requirements " +
    "that decide standing, parties with money at the door, and an exec board that " +
    "turns over every year. This is the shape it starts in.",
  glance: [
    { k: "9 pages", l: "on the day you build it, 2 held back" },
    { k: "4 seats", l: "President, Treasurer, Social, PR" },
    { k: "4 measures", l: "attendance, GPA, dues, service hours" },
    { k: "Semesters", l: "with a rollover the books survive" },
  ],

  monthTitle: "A month in the chapter, and what carries each part of it",
  monthLede:
    "Nothing below is a feature list — it's the five things that actually recur, in the " +
    "order they hit, and the surface that already handles each one.",
  beats: [
    {
      when: "Every week",
      what: "Chapter, and the roll behind it",
      how:
        "Take attendance on the meeting itself. Percentages are computed from those " +
        "records rather than typed anywhere, and they feed standing directly. Minutes " +
        "get an AI summary with the decisions and action items pulled out of them.",
    },
    {
      when: "First two weeks",
      what: "Dues go out, and then the chasing starts",
      how:
        "Every member carries a balance. A payment is a request a treasurer approves, " +
        "and the balance and the ledger entry move together or neither moves — so " +
        "\"did she pay?\" and \"is it in the books?\" can never disagree.",
    },
    {
      when: "All semester",
      what: "Service hours nobody wrote down",
      how:
        "Hours are summed from who actually showed at each service event. A member's " +
        "total always has an event list behind it, which is the difference between a " +
        "number you can defend and a spreadsheet cell.",
    },
    {
      when: "Two or three weekends",
      what: "A party with cash at the door",
      how:
        "Parties carry their own door revenue, expenses and wrap-up notes, on the same " +
        "books as everything else — so the social budget isn't a second, private ledger " +
        "in someone's Notes app.",
    },
    {
      when: "Every spring",
      what: "Turnover",
      how:
        "Seats are roles, not logins. Reassign Treasurer and the whole record — every " +
        "transaction, approval and roll — stays exactly where it is, with the old " +
        "treasurer's name still on what they did.",
    },
  ],

  setupTitle: "What it builds you, before you invite anyone",
  setupLede:
    "The interview asks what your chapter does in a normal month and drafts this sheet " +
    "from the answers. Every line is editable here, and again in Settings next semester " +
    "when the chapter has changed its mind.",
  bp: {
    name: "Oozma Kappa",
    kind: "Fraternity / sorority",
    sub: "chaptos.app/oozma-kappa",
    sections: [
      {
        k: "pages",
        on: ["Dashboard", "Timeline", "Roster", "Meetings", "Attendance", "Treasury", "Service", "Parties", "Docs"],
        off: ["Tasks", "Announcements"],
        note:
          "Tasks and Announcements start off on purpose — the chapter group chat already " +
          "does both, and a page nobody opens is worse than no page. Both are one toggle " +
          "in Settings the week exec outgrows the chat.",
      },
      {
        k: "words",
        rows: [
          ["Member", "Brother"],
          ["Meetings", "Chapter"],
          ["Term", "Semester"],
        ],
        note: "A sorority gets the same template with **Sister** instead of Brother.",
      },
      {
        k: "seats",
        rows: [
          ["President", "everything", "rank 100"],
          ["Treasurer", "money + dues", "rank 50"],
          ["Social", "events, parties + tasks", "rank 50"],
          ["PR", "social content", "rank 50"],
        ],
      },
      {
        k: "measures",
        on: ["Attendance", "GPA", "Dues owed", "Service hours"],
        off: [],
        note:
          "All four, because a chapter's standing rules usually reference all four. Each " +
          "carries its own threshold — 70% attendance, a 2.5 GPA floor, an hours goal — " +
          "and those are yours to set.",
      },
      {
        k: "cats",
        rows: [
          ["Social", "var(--butter-ink)"],
          ["Fundraiser", "var(--mint-ink)"],
          ["Programming", "var(--lilac-ink)"],
        ],
        note: "Seeded editable, alongside the built-in Chapter, Party, Service and Deadline types.",
      },
      { k: "term", label: "First term", value: "Fall 2026 · Aug 24 – Dec 18" },
    ],
  },
  why: [
    {
      h: "Standing is computed, not decided",
      p:
        "On track / watch / at risk falls out of the four measures against thresholds you " +
        "control. Move the attendance floor and every badge in the chapter moves with it — " +
        "nobody is flagged because an officer felt like flagging them.",
    },
    {
      h: "The books can't be quietly rewritten",
      p:
        "Deleting a ledger entry marks it deleted and keeps the history, and removing " +
        "someone from the roster never erases the record that they paid. An audit finds " +
        "the correction, not a hole.",
    },
    {
      h: "Rank stops a chair promoting themselves",
      p:
        "An officer can only grant or edit roles ranked strictly below their own. The " +
        "Social chair can hand out a committee seat; they cannot make themselves Treasurer.",
    },
  ],
  steps: [
    {
      t: "Build the whole thing signed out",
      p:
        "The interview at [/create](/create) runs before you have an account — describe the " +
        "chapter, edit the sheet, then sign in with Google at the last step. Your answers " +
        "survive the round trip.",
    },
    {
      t: "Open the semester first",
      p:
        "Nothing works without an active term, and the first screen after creation says so. " +
        "Confirm the dates the interview suggested; attendance, dues and budgets all hang " +
        "off that record.",
    },
    {
      t: "Seed the roster, then send one invite link",
      p:
        "Paste the names in first so people claim their own row. Set the link to expire, " +
        "revoke it after rush, and check the redemption list — an invite link is a door " +
        "code, and anyone holding it can get in until it dies.",
    },
    {
      t: "Set your thresholds before the first roll, not after",
      p:
        "Attendance floors, the GPA cutoffs, the service-hours goal. Set them while nobody " +
        "is failing them yet and the standing badges will never look political.",
    },
    {
      t: "Take one real roll and post one real dues charge",
      p:
        "The dashboard is honest about having no data. One meeting and one dues cycle is " +
        "the point where the health dial, the KPI strip and the attention queue start " +
        "telling you something you didn't already know.",
    },
  ],
  asks: [
    {
      q: "who's short on service hours with three weeks left?",
      a: "Reads the participation records behind each event — not a column somebody typed.",
    },
    {
      q: "who owes more than $100 in dues?",
      a: "Named rows with balances, and every figure links back to the record it came from.",
    },
    {
      q: "what did we decide about formal at chapter last week?",
      a: "Meeting notes are part of the record; the summary is the part with the action items.",
    },
  ],
  limits: [
    {
      h: "No payments, ever",
      p:
        "Dues are *records* of money that moved through Venmo, cash or a check. There's no " +
        "processor integrated, no card details anywhere, and nobody pays through this.",
    },
    {
      h: "Polls are not secret ballots",
      p:
        "Every vote records who cast it. That's fine for picking a formal venue. It is the " +
        "wrong tool for bids, for judicial, or for anything a member would expect to be " +
        "anonymous.",
    },
    {
      h: "GPA is typed in by you",
      p:
        "No registrar, no student information system, no integration that could. Read " +
        "[what not to put here](/trust#sensitive) before you add anything else sensitive " +
        "as a custom field.",
    },
    {
      h: "It doesn't message anybody",
      p:
        "There is no mail-sending capability in the product. Announcements are a page " +
        "inside the app; your group chat is still your group chat.",
    },
    {
      h: "Removing a member with history needs us",
      p:
        "The attendance records that depend on them block the delete, deliberately, so " +
        "history can't be silently destroyed. [Ask](/contact) and we'll complete it by hand " +
        "and tell you what was kept.",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────

const TEAM: Audience = {
  slug: "club-teams",
  label: "Club & intramural teams",
  tint: "sky",
  doodle: "flag",
  blurb:
    "One hard number — who's at practice — and a pile of forms. Attendance-forward, " +
    "dues-free, seasons instead of semesters.",

  eyebrow: "For club & intramural teams",
  title: "Who's at practice, who's playing Saturday, and where the waiver went.",
  lede:
    "A club team doesn't need most of what a chapter needs. It needs one number kept " +
    "honestly across a season, a way to handle the four people who are out every week, " +
    "and one place the forms live. That's what this setup is, and it's about ten " +
    "minutes of work.",
  glance: [
    { k: "7 pages", l: "no dues, no GPA, no service hours" },
    { k: "3 seats", l: "Captain, Coach, Team manager" },
    { k: "1 measure", l: "attendance, computed per player" },
    { k: "Seasons", l: "the calendar resets in August, not January" },
  ],

  monthTitle: "A week in the season, and what carries it",
  monthLede:
    "Four things recur on a club team, and three of them are really the same thing: " +
    "keeping an honest picture of who is actually showing up.",
  beats: [
    {
      when: "Every practice",
      what: "The roll",
      how:
        "Mark it on the day, on the practice itself. Percentages compute from the records; " +
        "you never type a number, and nobody's total drifts from what happened.",
    },
    {
      when: "Mid-week",
      what: "The four texts asking who's out Saturday",
      how:
        "A player files an excuse with a reason. A coach approves or rejects it, and the " +
        "decision is recorded with who made it and any note they left — so the same " +
        "conversation doesn't happen twice.",
    },
    {
      when: "Once a season",
      what: "The player who's abroad, injured or co-oping",
      how:
        "A season-long exemption drops them out of the percentage math entirely rather " +
        "than sinking their number to zero and dragging the team average with it.",
    },
    {
      when: "Game week",
      what: "Waivers, travel forms, the playbook",
      how:
        "The docs library holds the links, foldered and pinned, so \"where's the form\" " +
        "has one answer instead of four people searching a group chat.",
    },
    {
      when: "If you charge league fees",
      what: "Somebody has to track who paid",
      how:
        "Treasury is off by default and one toggle away in Settings. Turn it on and every " +
        "player gets a balance; leave it off and no dues column ever appears.",
    },
  ],

  setupTitle: "What it builds you, before your first practice",
  setupLede:
    "The template is deliberately the smallest of the six. A team that never charges dues " +
    "should never see a dues KPI, and a page you don't need is a page that makes the " +
    "sidebar harder to read.",
  bp: {
    name: "Club Soccer",
    kind: "Sports / club team",
    sub: "chaptos.app/club-soccer",
    sections: [
      {
        k: "pages",
        on: ["Dashboard", "Timeline", "Roster", "Attendance", "Tasks", "Announcements", "Docs"],
        off: ["Meetings", "Treasury", "Service", "Parties"],
        note:
          "Meetings is off because a team practises rather than holds chapter. If yours " +
          "runs formal officer meetings, turn it back on — nothing else changes.",
      },
      {
        k: "words",
        rows: [
          ["Member", "Player"],
          ["Meetings", "Practice"],
          ["Event", "Practice"],
          ["Term", "Season"],
        ],
      },
      {
        k: "seats",
        rows: [
          ["Captain", "everything", "rank 100"],
          ["Coach", "roster, attendance + schedule", "rank 60"],
          ["Team manager", "comms, tasks + docs", "rank 50"],
        ],
        note:
          "The coach sits at rank 60 and the manager at 50, so a coach can hand out the " +
          "manager's seat and never the reverse.",
      },
      {
        k: "measures",
        on: ["Attendance"],
        off: ["GPA", "Dues owed", "Service hours"],
        note:
          "One measure, tracked properly, beats four that are half-filled. The three that " +
          "are off don't appear as empty columns — they don't appear at all.",
      },
      {
        k: "cats",
        rows: [
          ["Game", "var(--peach-ink)"],
          ["Practice", "var(--sky-ink)"],
          ["Tournament", "var(--lilac-ink)"],
        ],
      },
      { k: "term", label: "First season", value: "Fall Season · Aug 15 – Dec 31" },
    ],
  },
  why: [
    {
      h: "Seasons, not semesters",
      p:
        "A fall season runs from August into the end of December and doesn't care where " +
        "finals fall. Picking Seasons in the interview renames every \"semester\" in the " +
        "interface and sets the window to match.",
    },
    {
      h: "Exemptions exist because injuries do",
      p:
        "Excuses handle a week; exemptions handle a term. Without the second one, every " +
        "long-term absence quietly corrupts the only number the team actually tracks.",
    },
    {
      h: "The coach isn't an admin",
      p:
        "The Coach seat carries roster, attendance and schedule permissions and stops " +
        "there. That's usually the right shape for someone who isn't a student and won't " +
        "be here in three years.",
    },
  ],
  steps: [
    {
      t: "Build it signed out, in one sitting",
      p:
        "At [/create](/create), name Practices and Games as what happens in a normal month. " +
        "Anything you don't name stays off — that's how the page list ends up this short.",
    },
    {
      t: "Open the season",
      p:
        "Confirm the window before anything else. Attendance percentages are per-season, so " +
        "the term record has to exist before the first roll.",
    },
    {
      t: "Paste last year's roster, then invite",
      p:
        "Seed the names and let players claim their own row. Revoke the link after tryouts " +
        "close — a live invite link lets anyone holding it join.",
    },
    {
      t: "Put the waiver and the playbook in Docs on day one",
      p:
        "Before week one, not after the first away game. Pin the two everyone asks for; " +
        "they float to the top of the library ahead of everything else.",
    },
    {
      t: "Take the roll at the very first practice",
      p:
        "It's the one habit the rest of this depends on. A season with a gap in week one " +
        "has percentages nobody trusts by week six.",
    },
  ],
  asks: [
    {
      q: "who's under 70% attendance this season?",
      a: "Reads the roll records, with exempt players correctly left out of the math.",
    },
    {
      q: "who has an approved excuse for Saturday?",
      a: "The decision, who made it, and the reason the player gave.",
    },
    {
      q: "how many practices have we had since the tournament?",
      a: "Counts events on the timeline rather than guessing from the calendar.",
    },
  ],
  limits: [
    {
      h: "No schedule import, no calendar feed",
      p:
        "Games and practices are entered here. Nothing syncs from a league site, and there " +
        "is no subscribable calendar to point Apple or Google Calendar at.",
    },
    {
      h: "No check-in",
      p:
        "Attendance is a person marking a roll on the day. There's no QR code, no location " +
        "check, and no player self-check-in.",
    },
    {
      h: "No texts, no email",
      p:
        "Announcements are a page inside the app. The product has no way to send a message " +
        "to anyone — that stays in your group chat.",
    },
    {
      h: "Treasury is a ledger, not a payment link",
      p:
        "Turn it on for league fees and you get balances and a record of what was paid — " +
        "collected somewhere else, by you.",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────

const SERVICE: Audience = {
  slug: "service-orgs",
  label: "Service & volunteer orgs",
  tint: "mint",
  doodle: "heart",
  blurb:
    "The number you have to produce — hours per member — derived from who actually " +
    "showed, with the event list still attached.",

  eyebrow: "For service & volunteer orgs",
  title: "Hours with an event behind them.",
  lede:
    "Every service org eventually has to produce the same number, for a national office, " +
    "a scholarship, an honor requirement or a re-registration form. It's also the number " +
    "most likely to be wrong, because it usually lives in a spreadsheet somebody types " +
    "into at the end of the term. Here it's summed from participation, and the evidence " +
    "stays attached.",
  glance: [
    { k: "10 pages", l: "the fullest set of the six" },
    { k: "4 seats", l: "President, Service chair, Treasurer, Comms" },
    { k: "3 measures", l: "attendance, hours, dues — no GPA" },
    { k: "Hours goal", l: "with an at-risk band under it" },
  ],

  monthTitle: "A month of projects, and what carries each part",
  monthLede:
    "Service orgs run on two loops at once: getting bodies to a Saturday build, and " +
    "keeping a defensible record of who was there.",
  beats: [
    {
      when: "Every project",
      what: "Who showed, and for how long",
      how:
        "Participation is recorded against the event. A member's hours total is the sum of " +
        "those records — you never edit the total directly, which is exactly why it can be " +
        "trusted later.",
    },
    {
      when: "Every month",
      what: "The member who's sure they did more",
      how:
        "Open their record and the events are right there with dates. The conversation " +
        "stops being about memory and starts being about a list.",
    },
    {
      when: "Recruiting for Saturday",
      what: "Getting the ask in front of people",
      how:
        "A pinned announcement sits at the top of everyone's dashboard, and tasks can be " +
        "assigned to a **role** rather than a person — so the Service chair's list follows " +
        "the seat when it changes hands.",
    },
    {
      when: "Fundraisers",
      what: "Money in, money out, and who's asking",
      how:
        "Income and expenses on one ledger with the term's budget beside it, exportable to " +
        "CSV when your advisor or your national wants the books.",
    },
    {
      when: "Three weeks before the deadline",
      what: "Who is going to miss the requirement",
      how:
        "The hours goal has an at-risk band under it, so the people who need one more " +
        "Saturday show up in the attention queue while there are still Saturdays left.",
    },
  ],

  setupTitle: "What it builds you",
  setupLede:
    "The service template keeps almost everything and drops parties. It's the widest of " +
    "the six because these orgs genuinely run meetings, projects, money and comms at the " +
    "same time.",
  bp: {
    name: "Habitat Chapter",
    kind: "Service / volunteer org",
    sub: "chaptos.app/habitat",
    sections: [
      {
        k: "pages",
        on: ["Dashboard", "Timeline", "Roster", "Meetings", "Attendance", "Tasks", "Treasury", "Service", "Announcements", "Docs"],
        off: ["Parties"],
        note: "Parties is the only page off by default, and it stays one toggle away.",
      },
      {
        k: "words",
        rows: [["Meetings", "Service events"]],
        note:
          "The only rename the template ships. Everything else already reads correctly for " +
          "a volunteer org.",
      },
      {
        k: "seats",
        rows: [
          ["President", "everything", "rank 100"],
          ["Service chair", "service + events", "rank 50"],
          ["Treasurer", "money", "rank 50"],
          ["Comms chair", "announcements + social", "rank 50"],
        ],
      },
      {
        k: "measures",
        on: ["Attendance", "Service hours", "Dues owed"],
        off: ["GPA"],
        note:
          "GPA is off — a service org rarely gates membership on it, and an unused column " +
          "that holds a grade is a liability rather than a feature.",
      },
      {
        k: "cats",
        rows: [
          ["Service project", "var(--sky-ink)"],
          ["Fundraiser", "var(--mint-ink)"],
          ["Outreach", "var(--butter-ink)"],
        ],
      },
      { k: "term", label: "First term", value: "Fall 2026 · Aug 24 – Dec 18" },
    ],
  },
  why: [
    {
      h: "Hours are a consequence, not a column",
      p:
        "Because the total is derived from participation records, it can't drift from " +
        "reality and it can't be nudged. If someone questions a number, the answer is a " +
        "list of events, not an argument.",
    },
    {
      h: "A goal, and a band under it",
      p:
        "Set the hours goal for the term and the roster flags who's short automatically. " +
        "The same threshold drives the dashboard's attention queue, so the two never " +
        "disagree about who needs a nudge.",
    },
    {
      h: "The chair's work follows the seat",
      p:
        "Tasks assigned to a role resolve to whoever holds it at the time you look. Hand " +
        "the Service chair role to someone new and the open items go with it — you don't " +
        "reassign twelve tasks by hand.",
    },
  ],
  steps: [
    {
      t: "Build it signed out",
      p:
        "At [/create](/create), name service events, fundraising and dues as things that " +
        "happen in a normal month. Anything you leave unnamed stays off.",
    },
    {
      t: "Open the term, then set the hours goal",
      p:
        "The goal is the number the whole page is organized around. Set it in Settings " +
        "before the first project rather than at the end when it decides who failed.",
    },
    {
      t: "Seed the roster and invite",
      p:
        "Names first, then one link with an expiry. Every redemption is recorded, so you " +
        "can see exactly who joined through which link and when.",
    },
    {
      t: "Log your first project the same week it happens",
      p:
        "Not at the end of term. The record is only worth what its timeliness is worth, and " +
        "a month-old memory of who came is the thing this replaces.",
    },
    {
      t: "Export the ledger once, early",
      p:
        "So you know what your treasurer will hand over in April, and so nobody discovers " +
        "the format the week the report is due.",
    },
  ],
  asks: [
    {
      q: "who's short on hours with three weeks left?",
      a: "Compares each member's summed participation against the goal you set.",
    },
    {
      q: "how many hours did we log at the food bank this term?",
      a: "Totals the participation records for those events, not a hand-kept tally.",
    },
    {
      q: "what did the fall fundraiser actually net?",
      a: "Income minus expenses off the ledger, with the rows it used.",
    },
  ],
  limits: [
    {
      h: "No supervisor sign-off",
      p:
        "Hours are recorded by an officer. Nothing here is counter-signed by the site lead, " +
        "and there's no signature field. If your national requires one, this isn't that.",
    },
    {
      h: "The hours report isn't a button yet",
      p:
        "The roster and the ledger export to CSV from the app. A per-member hours export is " +
        "a [request to us](/contact) today — we'll produce it, but it isn't self-service.",
    },
    {
      h: "Nothing syncs outward",
      p:
        "No integration with a national office's portal, a scholarship system, or a campus " +
        "service-hour tracker. What leaves here leaves as a CSV you send.",
    },
    {
      h: "It doesn't email volunteers",
      p:
        "There's no mail-sending capability at all. Announcements are pinned inside the " +
        "app; getting people to read them is still your job.",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────

const ARTS: Audience = {
  slug: "performing-arts",
  label: "Bands, choirs & theatre",
  tint: "rose",
  doodle: "star",
  blurb:
    "Rehearsal-shaped: the roster is a cast, the meeting is a rehearsal, and the thing " +
    "that breaks a week is a conflict nobody logged.",

  eyebrow: "For bands, choirs & theatre",
  title: "Calls, conflicts, and the score everyone's looking for.",
  lede:
    "An ensemble's admin is unusual in one specific way: attendance isn't a policy, it's " +
    "the schedule. One unlogged conflict costs an evening of everybody's time. This setup " +
    "puts rehearsals, the conflicts against them and the materials in one place, per " +
    "production.",
  glance: [
    { k: "9 pages", l: "no service hours, no parties" },
    { k: "4 seats", l: "Director, Stage manager, Treasurer, Publicity" },
    { k: "2 measures", l: "attendance and dues — no GPA" },
    { k: "Seasons", l: "named after the production" },
  ],

  monthTitle: "A production, and what carries each part of it",
  monthLede:
    "The cycle is short and repeats: call it, take it, log what went wrong, fix the next " +
    "one.",
  beats: [
    {
      when: "Every rehearsal",
      what: "Who was called, and who came",
      how:
        "The roll lives on the rehearsal itself. Percentages compute from it, so the " +
        "question of who's been missing has a number instead of a feeling.",
    },
    {
      when: "Constantly",
      what: "Conflicts",
      how:
        "A cast member files the conflict as an excuse with a reason; the stage manager " +
        "approves or rejects it and the decision is recorded. A standing Tuesday lab " +
        "becomes a term-long exemption instead of eleven separate excuses.",
    },
    {
      when: "Week one",
      what: "Scores, scripts, the rehearsal schedule",
      how:
        "The docs library holds the links — a Drive folder, a hosted PDF, the call sheet — " +
        "foldered per production and pinnable, so nobody is asked for the score twice.",
    },
    {
      when: "All term",
      what: "Dues, costume fees, the production budget",
      how:
        "One ledger and a term budget. Fees are balances a treasurer clears; expenses are " +
        "rows with a category, so \"what did we spend on set\" is a question with an answer.",
    },
    {
      when: "Two weeks out",
      what: "Publicity",
      how:
        "Publicity is a seat with exactly two permissions — the content plan and " +
        "announcements — which is the right amount of authority for the person making " +
        "posters.",
    },
  ],

  setupTitle: "What it builds you",
  setupLede:
    "The performing-arts template renames the org's core nouns, because \"member\" and " +
    "\"meeting\" are the wrong words in a rehearsal room and wrong words make people " +
    "distrust a tool.",
  bp: {
    name: "Playhouse Co.",
    kind: "Performing arts group",
    sub: "chaptos.app/playhouse",
    sections: [
      {
        k: "pages",
        on: ["Dashboard", "Timeline", "Roster", "Meetings", "Attendance", "Treasury", "Tasks", "Announcements", "Docs"],
        off: ["Service", "Parties"],
        note: "Meetings reads as **Rehearsals** everywhere once the vocabulary below is applied.",
      },
      {
        k: "words",
        rows: [
          ["Member", "Cast member"],
          ["Meetings", "Rehearsal"],
          ["Event", "Rehearsal"],
        ],
        note: "A band or a choir usually swaps *Cast member* for **Musician** or **Singer** in Settings.",
      },
      {
        k: "seats",
        rows: [
          ["Director", "everything", "rank 100"],
          ["Stage manager", "calls, attendance + tasks", "rank 60"],
          ["Treasurer", "money", "rank 50"],
          ["Publicity", "social + announcements", "rank 50"],
        ],
        note: "The stage manager outranks the treasurer — on calls, and only on calls.",
      },
      {
        k: "measures",
        on: ["Attendance", "Dues owed"],
        off: ["GPA", "Service hours"],
      },
      {
        k: "cats",
        rows: [
          ["Performance", "var(--rose-ink)"],
          ["Auditions", "var(--sky-ink)"],
          ["Social", "var(--butter-ink)"],
        ],
      },
      { k: "term", label: "First term", value: "Fall Season · Aug 15 – Dec 31" },
    ],
  },
  why: [
    {
      h: "A term can be a production",
      p:
        "The calendar model is semesters, quarters, seasons or year-round — but the term's " +
        "name is free text. Pick Seasons and call it *Spring Production 2027*; attendance, " +
        "budgets and exemptions all scope to it.",
    },
    {
      h: "Conflicts are records, not messages",
      p:
        "Once a conflict is an excuse with a decision on it, the stage manager stops being " +
        "the single point of failure for who knew what. It survives them being ill.",
    },
    {
      h: "The right person holds the calls",
      p:
        "Attendance and scheduling sit with the stage manager at rank 60, above the money " +
        "and publicity seats. That mirrors how the room actually runs.",
    },
  ],
  steps: [
    {
      t: "Build it signed out",
      p:
        "At [/create](/create), say rehearsals and performances happen in a normal month, " +
        "and pick Seasons when it asks how your calendar resets.",
    },
    {
      t: "Name the term after the show",
      p:
        "The label is yours. *Fall Musical 2026* reads better than *Fall 2026* on every " +
        "screen it appears on for the next four months.",
    },
    {
      t: "Rename the cast noun before you invite anyone",
      p:
        "Members see the vocabulary from their first screen. Changing it later is easy; " +
        "having it right the first time is free.",
    },
    {
      t: "Get the standing conflicts in as exemptions in week one",
      p:
        "Every cast member with a recurring class or job. Do it before the first roll and " +
        "the attendance numbers are usable all term instead of noisy.",
    },
    {
      t: "Pin the score and the schedule in Docs",
      p:
        "Two pinned links float above the rest of the library. It's the cheapest thing on " +
        "this list and it removes the most repeated question.",
    },
  ],
  asks: [
    {
      q: "who's missed more than two rehearsals this production?",
      a: "Counts the roll, with exempted cast members correctly excluded.",
    },
    {
      q: "what have we spent on set so far?",
      a: "Sums the ledger by category, against the term's budget.",
    },
    {
      q: "who hasn't paid their costume fee?",
      a: "Balances by member, straight off the dues records.",
    },
  ],
  limits: [
    {
      h: "No file storage",
      p:
        "The docs library holds **links** with previews, not uploads. The only files that " +
        "live here are images — a profile photo or a logo, under 2 MB. Your scores stay in " +
        "Drive or Dropbox and you link them.",
    },
    {
      h: "No ticketing or box office",
      p:
        "Nothing sells a ticket or counts a house. Box-office income is a row you enter on " +
        "the ledger after the fact.",
    },
    {
      h: "A rehearsal is one event",
      p:
        "There's no per-scene call breakdown and no \"who's called for Act II\" inside a " +
        "rehearsal. If you need that granularity, it's a separate event or a doc link.",
    },
    {
      h: "It doesn't send the call",
      p:
        "No email, no texts. The schedule lives on the timeline; getting people to look at " +
        "it is unchanged.",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────

const GOVERNMENT: Audience = {
  slug: "student-government",
  label: "Student government",
  tint: "lilac",
  doodle: "board",
  blurb:
    "Sessions, minutes, committees and a budget — set up so the record outlasts the " +
    "spring turnover.",

  eyebrow: "For student government",
  title: "The session, the minutes, and a record that outlasts the term.",
  lede:
    "A council's real output is a record: who sat, what was decided, where the money " +
    "went. It's also the org type where the record is most likely to be questioned, and " +
    "most likely to leave campus with the outgoing secretary's laptop. This setup " +
    "optimizes for the record, and it is blunt about the two things you must not use it " +
    "for.",
  glance: [
    { k: "9 pages", l: "meetings-forward, no parties or service" },
    { k: "4 seats", l: "3 seeded, plus a committee chair you add" },
    { k: "Attendance", l: "per session, per senator, on the record" },
    { k: "Semesters", l: "with the log surviving every one of them" },
  ],

  monthTitle: "A month of sessions, and what carries each part",
  monthLede:
    "Four things recur, and each one produces a document somebody will ask for later.",
  beats: [
    {
      when: "Every session",
      what: "The roll and the minutes",
      how:
        "Attendance is a record per member per session, so \"were we quorate\" has an " +
        "answer with names attached. Minutes get an AI summary that pulls out the decisions " +
        "and the action items, and both stay on the meeting.",
    },
    {
      when: "Between sessions",
      what: "Committee work that never gets done",
      how:
        "Tasks target a **role**, not a person. Assign it to the chair's seat and the next " +
        "chair inherits every open item the day they take the seat.",
    },
    {
      when: "Every term",
      what: "The budget, and the questions about it",
      how:
        "A term budget with a ledger under it. Deleting a transaction marks it deleted and " +
        "keeps the history, so a correction shows as a correction rather than as a gap.",
    },
    {
      when: "Whenever it matters",
      what: "\"Who changed this?\"",
      how:
        "The activity log names the member, the action and the time — every meaningful " +
        "change, including officers' own. It's the artifact that ends a dispute in about " +
        "thirty seconds.",
    },
    {
      when: "Every April",
      what: "Turnover",
      how:
        "Seats are roles. Reassign them and the record stays in place, with the previous " +
        "holder's name still on everything they did.",
    },
  ],

  setupTitle: "What it builds you, and the two edits to make",
  setupLede:
    "There's no student-government template — a council starts from the club template, " +
    "which is the right base. Two edits on day one make it fit: rename the nouns, and add " +
    "a committee-chair seat below the executive ones.",
  bp: {
    name: "Student Senate",
    kind: "Student club / organization",
    sub: "chaptos.app/senate",
    sections: [
      {
        k: "pages",
        on: ["Dashboard", "Timeline", "Roster", "Meetings", "Attendance", "Treasury", "Tasks", "Announcements", "Docs"],
        off: ["Service", "Parties"],
      },
      {
        k: "words",
        title: "Words worth renaming on day one",
        rows: [
          ["Member", "Senator"],
          ["Meetings", "Session"],
        ],
        note:
          "The club template ships no renames — these two are the recommendation, not the " +
          "default. Settings → vocabulary, and it applies everywhere at once.",
      },
      {
        k: "seats",
        rows: [
          ["President", "everything", "rank 100"],
          ["Treasurer", "money + budget", "rank 50"],
          ["Secretary", "events, announcements + tasks", "rank 50"],
          ["Committee chair", "tasks only — add this one", "rank 40"],
        ],
        note:
          "The first three are seeded. The fourth is the seat most councils discover they " +
          "need in week three; at rank 40 an exec officer can hand it out and its holder " +
          "can't hand out anything.",
      },
      {
        k: "measures",
        on: ["Attendance"],
        off: ["GPA", "Service hours", "Dues owed"],
        note:
          "Turn dues on only if you actually charge them. For most councils the money is a " +
          "budget, not a per-member balance.",
      },
      {
        k: "cats",
        rows: [
          ["Session", "var(--sky-ink)"],
          ["Committee", "var(--lilac-ink)"],
          ["Campus event", "var(--butter-ink)"],
        ],
        note: "Renamed from the three the template seeds — categories are editable from day one.",
      },
      { k: "term", label: "First term", value: "Spring 2027 · Jan 12 – May 8" },
    ],
  },
  why: [
    {
      h: "Rank is the delegation rule",
      p:
        "An officer can only grant or edit roles ranked strictly below their own. A " +
        "committee chair at rank 40 can't promote themselves or a friend — the constraint " +
        "is in the server, not in a norm.",
    },
    {
      h: "The log is the point",
      p:
        "Structured audit entries plus a readable activity feed, both naming who did what " +
        "and when. For a body whose legitimacy depends on process, that record is worth " +
        "more than any feature on the page.",
    },
    {
      h: "Nothing is stored on someone's laptop",
      p:
        "Minutes, the budget and the roll are org records with seats attached. The " +
        "secretary graduating is a role reassignment, not a data migration.",
    },
  ],
  steps: [
    {
      t: "Build it signed out",
      p:
        "At [/create](/create), name meetings, attendance and a budget as what happens in a " +
        "normal month. Skip service and parties and their pages never appear.",
    },
    {
      t: "Rename Member and Meetings before anyone joins",
      p:
        "Senator and Session. It takes a minute, and every screen a senator ever sees reads " +
        "in the language your constitution uses.",
    },
    {
      t: "Add the committee-chair role at rank 40",
      p:
        "One seat, tasks permission only. Then assign committee work to the seat rather " +
        "than to the person sitting in it this year.",
    },
    {
      t: "Decide where votes happen — and it isn't here",
      p:
        "Read the limits below with your exec before the first session. This is the single " +
        "thing about this product a council can get badly wrong.",
    },
    {
      t: "Take the roll at session one and summarize the minutes",
      p:
        "Both take under a minute and both are the artifacts you'll be asked for. Habit " +
        "beats an accurate first month.",
    },
  ],
  asks: [
    {
      q: "who's missed more than two sessions this term?",
      a: "Straight off the roll records, per senator, for the active term.",
    },
    {
      q: "what's left in the budget?",
      a: "The term budget against what the ledger has actually spent.",
    },
    {
      q: "what were the action items from last session?",
      a: "Reads the minutes and their summary, and cites the meeting it came from.",
    },
  ],
  limits: [
    {
      h: "Do not run elections here",
      p:
        "**Every vote records who cast it.** That's deliberate — it's how a vote survives a " +
        "voter being unassigned — but it means a poll is the wrong instrument for an " +
        "election, a judicial matter, or anything a member would expect to be anonymous.",
    },
    {
      h: "No motions, amendments or parliamentary procedure",
      p:
        "A poll is a question with two to ten options and one vote each. There's no " +
        "seconding, no amending, no roll-call vote object. Robert's Rules stay in the room.",
    },
    {
      h: "No quorum math",
      p:
        "Attendance gives you the roll and the count. Applying your own quorum threshold to " +
        "it is a human step.",
    },
    {
      h: "Not a public minutes page",
      p:
        "Everything here is internal to the org. There's no published record for your " +
        "constituents and no read-only public view — if you publish minutes, you publish " +
        "them somewhere else.",
    },
    {
      h: "Allocations to other orgs aren't modelled",
      p:
        "The ledger tracks your money. There's no application, review or award workflow for " +
        "funding the clubs you fund, and each of those clubs has its own separate workspace.",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────

const CUSTOM: Audience = {
  slug: "custom",
  label: "Custom & anything else",
  tint: "peach",
  doodle: "pencil",
  blurb:
    "Your org isn't on this list? Good — none of the five above is hard-coded either. " +
    "The pages, the words, the seats and the numbers are all yours.",
  go: "The setup, and how it bends",

  eyebrow: "For every other kind of org",
  title: "Nothing here is hard-coded. Not the pages, not the words, not the numbers.",
  lede:
    "The five pages before this one aren't five products — they're five different answers " +
    "the same workspace gave to five different sets of questions. A quiz bowl team, a " +
    "cultural association, a robotics lab, a debate union and a campus radio station all " +
    "get their own answer too, assembled the same way: eleven pages you switch on and off, " +
    "twelve words you rename, seats you invent, and the measures your org is actually " +
    "judged on.",
  glance: [
    { k: "11 pages", l: "and only two of them can't be switched off" },
    { k: "12 words", l: "renamed to whatever your org already calls them" },
    { k: "Any seat", l: "your titles, your powers, your ranks" },
    { k: "Your measures", l: "with a goal and an at-risk line you set" },
  ],

  monthEyebrow: "What bends",
  monthTitle: "Five things that are yours, and the moment each one is easiest to set",
  monthLede:
    "None of these is a settings page nobody opens — each one changes what a member sees " +
    "on the first screen they ever load. They're listed in the order you'll reach them.",
  beats: [
    {
      when: "In the interview",
      what: "The pages, chosen by what you actually do",
      how:
        "The interview asks what happens in a normal month rather than what category you " +
        "are. Name travel, dues, a weekly meeting or a build night and those pages turn on; " +
        "anything you don't name stays off. That's how one org ends up with six pages in " +
        "the sidebar and another with eleven.",
    },
    {
      when: "Before you invite anyone",
      what: "The words your org already uses",
      how:
        "Twelve words carry your vocabulary instead of ours — member, term, meeting, event, " +
        "attendance, treasury, dues, role, admin, service, announcement, doc. You store the " +
        "singular and plurals are derived, so *Debater* becomes *Debaters* on every screen " +
        "without a second field to fill in.",
    },
    {
      when: "Day one",
      what: "Seats your constitution already names",
      how:
        "A seat is a title, a color, a rank and any subset of fourteen abilities. " +
        "Quartermaster, Novice Master, Race Director, Station Manager — invent it, tick " +
        "what it can do, and rank it. Rank is the delegation rule: an officer can only " +
        "grant roles ranked strictly below their own.",
    },
    {
      when: "Week one",
      what: "The number your org is judged on",
      how:
        "Four built-in measures — attendance, GPA, dues, service hours — each carry a goal " +
        "and an at-risk line you set. Past those, define your own: a name, a unit, a goal, " +
        "an at-risk cutoff, and whether the headline is an average, a total, or a count of " +
        "who's on track. It lands in the dashboard's measure strip like a built-in.",
    },
    {
      when: "Any time after",
      what: "Second thoughts, which are free",
      how:
        "Every line above lives in Settings behind an org-admin gate: pages, the widgets " +
        "inside them, sidebar order, words, seats, member fields, measures, thresholds, " +
        "categories and terms. Turning a page off only hides it — its transactions, docs " +
        "and records are kept and come back unchanged when you turn it on.",
    },
  ],

  setupTitle: "What a from-scratch org starts as",
  setupLede:
    "Tell the interview you're another kind of org and you get the smallest template in " +
    "the product: six pages, one seat, our words. It's a floor rather than a guess — " +
    "every row below is editable on the sheet before anything is built, and again in " +
    "Settings for as long as the org exists.",
  bp: {
    name: "Debate Union",
    kind: "Generic organization",
    sub: "chaptos.app/debate-union",
    sections: [
      {
        k: "pages",
        on: ["Dashboard", "Timeline", "Roster", "Tasks", "Announcements", "Docs"],
        off: ["Meetings", "Attendance", "Treasury", "Service", "Parties"],
        note:
          "Six on, because a template with no assumptions shouldn't make five. Name " +
          "tournaments, dues or a weekly assembly in the interview and those pages arrive " +
          "switched on — your answers own this list, not the template. **Dashboard and " +
          "Timeline** are the only two that can never be turned off.",
      },
      {
        k: "words",
        title: "Twelve words you can rename",
        rows: [
          ["Member", "Debater"],
          ["Meetings", "Assembly"],
          ["Event", "Tournament"],
          ["Period", "Year"],
        ],
        note:
          "Four of the twelve, filled in the way a debate union would. The rest cover " +
          "**Attendance**, **Treasury**, **Dues**, **Role**, **Admin**, **Service**, " +
          "**Announcement** and **Doc** — one sparse map, read by every nav label and page " +
          "heading, so a rename lands everywhere at once.",
      },
      {
        k: "seats",
        title: "Seats you invent",
        rows: [
          ["Admin", "everything — the founder's seat", "rank 100"],
          ["Novice Master", "attendance + tasks", "rank 60"],
          ["Tournament Director", "events + docs", "rank 50"],
        ],
        note:
          "Only the first is seeded; the other two are invented, and so is every seat after " +
          "them. Ranks are yours to assign, and they're what stops a chair promoting " +
          "themselves — the constraint lives in the server, not in a norm.",
      },
      {
        k: "words",
        title: "Columns you add to a member",
        rows: [
          ["Novice year", "a number"],
          ["Shirt size", "a set of options"],
          ["Home region", "free text"],
        ],
        note:
          "Custom member fields carry a label, a type and a choice about whether they show " +
          "on the roster. Worth reading [what not to put in one](/trust#sensitive) before " +
          "you add the fourth.",
      },
      {
        k: "measures",
        title: "Numbers tracked per member",
        on: ["Attendance", "GPA", "Dues owed", "Service hours", "Anything you define"],
        off: [],
        note:
          "The four built-ins are on or off per org, each with your own goal and at-risk " +
          "line. A measure of your own adds a name, a unit, a goal, an at-risk cutoff and " +
          "an aggregation — *average per member*, *org total*, or *how many are on track*.",
      },
      {
        k: "cats",
        rows: [
          ["Social", "var(--butter-ink)"],
          ["Fundraiser", "var(--mint-ink)"],
        ],
        note:
          "The two this template seeds. They're editable rows rather than built-ins — " +
          "rename them to *Tournament* and *Practice round*, recolor them, reorder them, " +
          "or delete both.",
      },
      {
        k: "term",
        label: "How your calendar resets",
        value: "Semesters · Quarters · Seasons · Year-round",
      },
    ],
  },
  why: [
    {
      h: "The interview builds it, not a dropdown",
      p:
        "Seven templates exist, and which one you land on matters far less than what you " +
        "answered. An activity you didn't name leaves its page off even when the template " +
        "would have seeded it — otherwise the interview is theatre over a preset.",
    },
    {
      h: "A word your members don't use is a tool they don't trust",
      p:
        "Vocabulary is one map read by every nav label and heading, so *Member → Sister*, " +
        "*Player*, *Debater* or *Volunteer* changes the whole interface in one edit. No " +
        "half-renamed screens, and no plural typed twice.",
    },
    {
      h: "Your number is first-class, not a spreadsheet column",
      p:
        "A measure you define carries a goal and an at-risk line, so it computes an " +
        "on-track count and gets its own card and drawer on the dashboard — the same " +
        "treatment attendance gets. That's the difference between tracking something and " +
        "writing it down.",
    },
  ],
  steps: [
    {
      t: "Answer the interview about your month, not your category",
      p:
        "[/create](/create) runs signed out. Describe what actually happens — we travel " +
        "twice a term, we charge dues, we run a build night. The page list follows those " +
        "answers, which is how you get a short sidebar instead of a full one.",
    },
    {
      t: "Rename the nouns before a single person joins",
      p:
        "Members read the vocabulary on their first screen, and a tool that calls them the " +
        "wrong thing gets treated like one. It takes a minute now and it's free forever.",
    },
    {
      t: "Build the seats, then hand them out",
      p:
        "Create the offices your constitution already names, tick what each can do, and " +
        "rank the ones with real authority above the ones without. Then assign them — " +
        "seats are roles, so next year's turnover is a reassignment, not a migration.",
    },
    {
      t: "Define your one number in week one",
      p:
        "Every org has one: hours, tournaments, shifts, rehearsals, builds, points. Set the " +
        "goal and the at-risk line while nobody is failing them yet, and the standing it " +
        "produces will never look political.",
    },
    {
      t: "Come back at the end of the term and cut",
      p:
        "The page nobody opened, the field nobody filled, the measure that measured " +
        "nothing. This is the step everyone skips, and turning a page off keeps everything " +
        "underneath it — so there's nothing to lose by trying.",
    },
  ],
  asks: [
    {
      q: "who holds the tournament director seat right now?",
      a: "Reads the current role assignments rather than a title someone typed once.",
    },
    {
      q: "what's on the calendar in the next two weeks?",
      a: "Reads the timeline, in your categories and your words for them.",
    },
    {
      q: "how do I add a measure for tournament wins?",
      a: "It answers product questions about your own setup, and names the page to do it on.",
    },
  ],
  limits: [
    {
      h: "You can shape the eleven pages, not invent a twelfth",
      p:
        "Every page can be renamed, reordered, switched off, or trimmed section by section. " +
        "What you can't do is add a brand-new surface with its own data model — if what you " +
        "run genuinely needs one, [tell us](/contact); it's the request we most want.",
    },
    {
      h: "Words change; structure doesn't",
      p:
        "Renaming *Member* to *Debater* changes every label, not what a member row holds. A " +
        "custom field is likewise a column on a person rather than a new object with a page " +
        "of its own.",
    },
    {
      h: "Customization is per-org",
      p:
        "Each org is its own workspace with its own settings. There's no master template you " +
        "push to a dozen chapters at once, and no view that spans them.",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────

/** Display order — matches the landing footer's "For" column top to bottom. */
export const AUDIENCES: readonly Audience[] = [
  FRATERNITY,
  TEAM,
  SERVICE,
  ARTS,
  GOVERNMENT,
  CUSTOM,
];

export const AUDIENCES_BY_SLUG: ReadonlyMap<string, Audience> = new Map(
  AUDIENCES.map(a => [a.slug, a]),
);

/** The other five, in display order — the "not quite you?" strip at the foot. */
export function others(slug: string): Audience[] {
  return AUDIENCES.filter(a => a.slug !== slug);
}
