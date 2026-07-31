/**
 * Help centre content.
 *
 * Plain data, no JSX — the index page, the article pages AND the client-side
 * search all import this module, so it has to be safe on both sides of the
 * server/client line.
 *
 * ACCURACY IS THE POINT. Every claim below describes something that exists in
 * this codebase today. Where a thing is half-built or has a sharp edge, the
 * article says so in a `note` block rather than being quietly optimistic — the
 * failure mode for a help centre is not being terse, it's sending someone
 * looking for a button that isn't there. When you ship a feature that changes
 * one of these answers, change the answer in the same PR.
 *
 * Cross-checked against: lib/services/*, lib/permissions.ts, lib/validation/*,
 * app/[slug]/settings/page.tsx (section names), lib/nav-order.ts (page names),
 * and docs/trust-and-privacy-source-of-truth.md §11–13 for the honest limits.
 *
 * Inline markup understood by the renderer (see ./inline.tsx):
 *   **bold**   *italic*   `code`   [label](/href)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** A pastel from landing.css. Sets the category's icon chip and accent. */
export type Tint = "butter" | "sky" | "mint" | "lilac" | "rose" | "peach";

export type Block =
  /** Body paragraph. */
  | { k: "p"; t: string }
  /** Sub-heading inside an article. */
  | { k: "h"; t: string }
  /** Numbered procedure. One action per step. */
  | { k: "steps"; items: string[] }
  /** Bulleted list. `tone` swaps the marker for a tick or a cross. */
  | { k: "list"; items: string[]; tone?: "check" | "no" }
  /** Callout. Default is a calm aside; `warn`/`flag` are for sharp edges. */
  | { k: "note"; tone?: "info" | "warn" | "good" | "flag"; h: string; t: string }
  /** Two-column reference table. */
  | { k: "table"; head: [string, string]; rows: [string, string][] }
  /** "Where to find it" locator strip — the click path, in order. */
  | { k: "where"; path: string[] };

export interface Category {
  id: string;
  title: string;
  /** One line under the category heading on the index. */
  blurb: string;
  /** Doodle sprite id (see components/landing/DoodleSprite.tsx). */
  doodle: string;
  tint: Tint;
}

export interface Article {
  slug: string;
  title: string;
  /** One line under the title in listings. Also the meta description. */
  blurb: string;
  categoryId: string;
  /** Extra search terms — the words someone would actually type. */
  keywords: string[];
  /** Standfirst on the article page. */
  lede: string;
  body: Block[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────────────────────────────────────

export const CATEGORIES: Category[] = [
  {
    id: "start",
    title: "Getting started",
    blurb: "Making an org, joining one, and the term it asks for before anything else works.",
    doodle: "spark",
    tint: "butter",
  },
  {
    id: "members",
    title: "Members & roles",
    blurb: "Getting people in, deciding what each of them can touch, and tracking what you track.",
    doodle: "people",
    tint: "sky",
  },
  {
    id: "money",
    title: "Money",
    blurb: "Dues, reimbursements, the budget, and getting the numbers back out again.",
    doodle: "wallet",
    tint: "mint",
  },
  {
    id: "week",
    title: "The week",
    blurb: "Events, attendance, the excuses that follow it, and who owes what by Friday.",
    doodle: "cal",
    tint: "lilac",
  },
  {
    id: "ask",
    title: "Ask Chapt",
    blurb: "What the assistant can see, what it can change, and what to do when it's wrong.",
    doodle: "chat",
    tint: "rose",
  },
  {
    id: "record",
    title: "Docs & the record",
    blurb: "The library, the audit trail, and how a year ends without taking the org with it.",
    doodle: "folder",
    tint: "peach",
  },
  {
    id: "account",
    title: "Your account & orgs",
    blurb: "Signing in, belonging to more than one org, and leaving cleanly.",
    doodle: "key",
    tint: "sky",
  },
  {
    // Deliberately NOT folded into "Money". That category is the chapter's own
    // money — dues, reimbursements, the budget. This one is what the org pays
    // us. The services are firewalled from each other in the codebase for the
    // same reason (see lib/services/billing-service.ts): two different kinds of
    // money, and conflating them in the help centre is exactly the confusion
    // that separation exists to prevent.
    id: "billing",
    title: "What this costs",
    blurb: "The price, what counts toward it, and what happens when you outgrow the free plan.",
    doodle: "receipt",
    tint: "butter",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Articles
// ─────────────────────────────────────────────────────────────────────────────

export const ARTICLES: Article[] = [
  // ── Getting started ───────────────────────────────────────────────────────
  {
    slug: "set-up-your-org",
    title: "Setting up a new org",
    blurb: "The interview at /create, what it builds, and why you sign in near the end.",
    categoryId: "start",
    keywords: ["create", "new chapter", "sign up", "onboarding", "slug", "url", "start"],
    lede:
      "Setup is an interview, not a form. You answer questions about your org signed out, " +
      "and only sign in once there's something to save.",
    body: [
      { k: "steps", items: [
        "Go to [chaptos.com/create](/create). Nothing is created yet — you're just answering.",
        "Say what kind of org you are. That choice picks your starting roles, your vocabulary and which pages you begin with.",
        "Name it and pick a URL. Lowercase letters, numbers and single hyphens, 3–32 characters. Some words are reserved (`admin`, `api`, `help`, `trust`, and similar) so a workspace can never shadow a system page.",
        "Sign in with Google at the Build step. This is the first moment anything is written.",
        "Pick which pages your org shows on the screen that follows. You can change all of it later.",
      ] },
      { k: "note", tone: "good", h: "Your answers survive the sign-in", t:
        "The draft lives in your browser while you work, so getting bounced to Google and back " +
        "doesn't cost you the interview. It also means the draft is on **that** device — finish " +
        "on the machine you started on." },
      { k: "h", t: "What gets built" },
      { k: "list", items: [
        "The org itself, with you as its first admin.",
        "A set of roles for your org type, each already carrying a sensible bundle of permissions.",
        "The pages you chose, and only those. Turning more on later doesn't cost you history.",
      ] },
      { k: "p", t:
        "One thing is deliberately *not* created: a term. The first screen you'll see inside is " +
        "the app asking for one — that's [expected, and it's a hard block](/help/first-term)." },
    ],
  },
  {
    slug: "join-an-org",
    title: "Joining an org you were invited to",
    blurb: "What the /join link does, and what to do when it can't find your name.",
    categoryId: "start",
    keywords: ["invite", "invitation", "join", "link", "claim", "new member", "accept"],
    lede:
      "Someone sends you a link. The page tells you whose door it is before you sign in to " +
      "anything — that's on purpose.",
    body: [
      { k: "steps", items: [
        "Open the link you were sent. It looks like `/join/…` and shows the org's name, badge and headcount.",
        "Sign in with Google. It's the only way in — there's no password to make or forget.",
        "If the link asks for your name, type it exactly as your org has it on the roster.",
      ] },
      { k: "h", t: "Two kinds of link" },
      { k: "table", head: ["Kind", "What happens when you use it"], rows: [
        ["Open", "You're added as a new member. Nobody has to have listed you first."],
        ["Claim", "You're matched to a roster row an officer already created — you type your name, and it links your Google account to that existing record, history and all."],
      ] },
      { k: "note", tone: "warn", h: "\"We couldn't find that name\"", t:
        "A claim link matches on the name your org typed, not the one on your Google account. " +
        "Try the exact spelling on the roster (full legal name, no nickname). If it still misses, " +
        "ask an officer to check the roster row or send you an open link instead — guessing more " +
        "spellings won't help." },
      { k: "note", tone: "flag", h: "Dead link?", t:
        "Invite links can be set to expire, capped to a number of uses, or revoked outright. Any of " +
        "the three shows the same \"this link isn't valid\" page. Ask for a fresh one." },
    ],
  },
  {
    slug: "first-term",
    title: "Why it wants a term before it'll let you in",
    blurb: "The non-dismissable semester screen, and the two ways past it.",
    categoryId: "start",
    keywords: ["semester", "term", "active semester", "blocked", "modal", "stuck", "gate"],
    lede:
      "A brand-new org has no active term, and almost nothing in the app means anything without " +
      "one. So it stops and asks, rather than letting you fill a workspace that can't file it.",
    body: [
      { k: "p", t:
        "A term is your reporting period — a semester, a quarter, a season, whatever your year is " +
        "cut into. The **active** one drives the dashboard, every per-period number, and where " +
        "dated records land. Writes with a date outside it are refused outright, which is why " +
        "this screen doesn't have a \"skip\" button." },
      { k: "h", t: "If you're an admin" },
      { k: "list", items: [
        "**Create new** — name it, set the dates, and it becomes active immediately.",
        "**Extend current** — pushes the last term's end date out and reactivates it. Only offered when the org has had a term before, so a new org won't see it.",
      ] },
      { k: "where", path: ["Settings", "Operations", "Semesters"] },
      { k: "note", tone: "info", h: "If you're not an admin", t:
        "You'll see the same block with no form. It needs the permission that manages terms — ask " +
        "whoever holds it. It takes them about fifteen seconds." },
      { k: "note", tone: "good", h: "Dates you can change later", t:
        "Guessing the end date is fine. Extending a term later is one field, and it doesn't " +
        "disturb anything already filed under it." },
    ],
  },
  {
    slug: "first-week",
    title: "Your first week, in order",
    blurb: "The shortest path from an empty org to one your board will actually open.",
    categoryId: "start",
    keywords: ["checklist", "setup", "getting started", "first", "onboarding", "what now"],
    lede:
      "Do these in order and the rest of the app has something to stand on. Skip around and " +
      "you'll hit walls that look like bugs and aren't.",
    body: [
      { k: "steps", items: [
        "**Set a term.** Everything dated needs one. See [why it's asking](/help/first-term).",
        "**Get the exec board in.** Send one invite link to the people who'll set things up, before the whole roster. Fewer people, fewer questions.",
        "**Fix the roles.** The starting roles fit an average org, not yours. Check that your treasurer can touch money and that nobody has more than they need. See [roles and permissions](/help/roles-and-permissions).",
        "**Put one real thing in each page you turned on.** One event, one document, one dues charge. An empty page teaches nobody anything; a page with one real row teaches everybody.",
        "**Then invite everyone else.** Now the first thing they open isn't blank.",
      ] },
      { k: "note", tone: "info", h: "Turn pages off you're not ready for", t:
        "A twelve-person committee and a two-hundred-member chapter run the same pages — just " +
        "fewer of them. Hiding a page you'll want in March costs nothing, and turning it on then " +
        "doesn't lose the history. See [turning pages on and off](/help/turn-pages-on-and-off)." },
      { k: "note", tone: "warn", h: "Don't backfill the whole year on day one", t:
        "Records dated outside the active term are refused. If you want last year in here, make " +
        "last year's term first, file into it, then switch back." },
    ],
  },

  // ── Members & roles ───────────────────────────────────────────────────────
  {
    slug: "invite-people",
    title: "Inviting people",
    blurb: "Making a link, scoping it, and revoking it when the recruiting table closes.",
    categoryId: "members",
    keywords: ["invite", "link", "add members", "expire", "revoke", "max uses", "recruit"],
    lede:
      "One link, shared however you like. The whole design decision is that a link is easy to " +
      "pass around — which is exactly why you should scope it.",
    body: [
      { k: "where", path: ["Settings", "Membership", "Invitations"] },
      { k: "h", t: "What you choose when you make one" },
      { k: "table", head: ["Setting", "What it does"], rows: [
        ["Mode", "**Open** creates a new member on redemption. **Claim** routes them into matching an existing roster row you already made."],
        ["Expiry", "20 minutes, 1 day, 7 days, 14 days, or never. A short one is right for a link you're about to read aloud."],
        ["Label", "Your own name for it — \"spring rush table\", \"exec only\". Up to 60 characters, and only you see it."],
        ["Max uses", "A cap on redemptions, up to 500. Leave it blank for unlimited."],
      ] },
      { k: "note", tone: "flag", h: "The link is the credential", t:
        "Anyone holding it can join until it expires or you revoke it — there's no second check. " +
        "Treat it like a door code: scope it, share it narrowly, and revoke it when the reason " +
        "for it is over. Revoking takes effect immediately." },
      { k: "note", tone: "warn", h: "The use cap is soft", t:
        "It's enforced per redemption, not with a lock, so a burst of people clicking at the same " +
        "moment can push past the number. Use it as a guard rail, not a turnstile." },
      { k: "h", t: "Seeing who used it" },
      { k: "p", t:
        "Every redemption is recorded against the link — who joined, and when. Open the invite to " +
        "read the list. That's also how you check whether a link you shared went further than you " +
        "meant it to." },
    ],
  },
  {
    slug: "roles-and-permissions",
    title: "Roles, permissions and rank",
    blurb: "Fourteen switches, bundled into roles, ordered by rank so nobody promotes themselves.",
    categoryId: "members",
    keywords: ["permissions", "roles", "admin", "officer", "access", "rank", "president", "treasurer"],
    lede:
      "A role is a bundle of permission switches plus a rank. The switches decide what you can " +
      "touch; the rank decides who you can hand it to.",
    body: [
      { k: "where", path: ["Settings", "Membership", "Roles"] },
      { k: "h", t: "The fourteen switches" },
      { k: "list", items: [
        "**Members** — the roster: adding, editing, removing.",
        "**Treasury** — the ledger, dues balances, reimbursement decisions, the budget.",
        "**Events** — the timeline and the calendar.",
        "**Attendance** — taking it, and deciding excuses and exemptions.",
        "**Terms** — creating semesters and setting the active one.",
        "**Roles** — this screen. The one that hands out all the others.",
        "**Settings** — org identity, configuration and invite links.",
        "**Docs** — the library.",
        "**Announcements** — the pinned note on the dashboard.",
        "**Tasks** and **Polls** — creating and managing each.",
        "**Service**, **Parties** and **Instagram** — the three optional operational pages.",
      ] },
      { k: "note", tone: "info", h: "Rank is the part people miss", t:
        "Rank orders your roles against each other and gates delegation: you can't grant a role " +
        "that outranks your own. That's what stops a chair from quietly making themselves " +
        "president, and it's why the order of your roles is worth getting right once." },
      { k: "h", t: "Two things worth doing on day one" },
      { k: "list", items: [
        "Check the treasurer actually holds **Treasury** — the starting roles are a template for an average org, not yours.",
        "Check nobody except the people who should hold **Roles** and **Settings** holds them. Those two are the keys to the building.",
      ] },
      { k: "note", tone: "good", h: "There is no communications permission", t:
        "Announcements is its own switch and it's the only broadcast surface — there's no single " +
        "\"can message everyone\" bit to hand out or worry about." },
    ],
  },
  {
    slug: "member-fields",
    title: "Tracking your own member fields",
    blurb: "Jersey number, section, pledge class, major — your columns, on every member.",
    categoryId: "members",
    keywords: ["custom fields", "member fields", "columns", "major", "pledge class", "jersey"],
    lede:
      "The built-in fields cover what most orgs track. Everything else you care about is a field " +
      "you define once and then have on everybody.",
    body: [
      { k: "where", path: ["Settings", "Membership", "Member fields"] },
      { k: "p", t:
        "Define a field and it appears on every member record. Marching bands add *section*, " +
        "sports clubs add *jersey number*, Greek orgs add *pledge class* — the app has no opinion " +
        "about which, and it doesn't need one." },
      { k: "note", tone: "flag", h: "Don't put sensitive categories in here", t:
        "Health conditions, disabilities, religion, ethnicity, sexuality, immigration status — a " +
        "free-text field will happily accept any of it, and doing that puts your org on the wrong " +
        "side of privacy law with no warning from us. Keep it to the operational stuff. " +
        "[More on what not to store](/trust#sensitive)." },
      { k: "note", tone: "info", h: "Numbers you want to trend go elsewhere", t:
        "A member field holds a value. If you want something measured per term and rolled up — " +
        "chapter-wide averages, a health dial — that's **Custom metrics**, under Settings → " +
        "Operations." },
    ],
  },
  {
    slug: "standing",
    title: "Standing: on track, watch, at risk",
    blurb: "Where the flags on the dashboard come from, and how to set them to your policy.",
    categoryId: "members",
    keywords: ["thresholds", "at risk", "standing", "gpa", "attendance", "flag", "needs attention"],
    lede:
      "Every org has a policy. Most orgs can't enforce it because nobody can prove who's over " +
      "the line. The cutoffs live in one screen and everything downstream reads them.",
    body: [
      { k: "where", path: ["Settings", "Operations", "Thresholds"] },
      { k: "p", t:
        "Set the attendance percentage, the GPA and the service-hour minimum that mean *fine*, and " +
        "the app flags anyone under them. Those flags are what the dashboard's needs-attention " +
        "queue is built from, and what the roster's at-risk filter uses." },
      { k: "h", t: "Reading a member's standing" },
      { k: "p", t:
        "Open anyone on the roster and you get the history behind the number, not just the number: " +
        "which events they missed, what's excused, what they owe. A flag you can't explain to the " +
        "person it's about is worse than no flag." },
      { k: "note", tone: "info", h: "Set them to your bylaws, not to what feels strict", t:
        "The numbers only earn their keep if they match the rule you'd actually enforce. If your " +
        "policy is three misses, set the attendance cutoff so three misses trips it." },
    ],
  },
  {
    slug: "remove-someone",
    title: "Removing someone from the roster",
    blurb: "What works today, what refuses, and what to do about it.",
    categoryId: "members",
    keywords: ["delete member", "remove", "graduate", "quit", "off roster", "alumni"],
    lede:
      "Removing a member works — until they have attendance history, at which point the app " +
      "refuses. That's a real limitation, not a permissions problem.",
    body: [
      { k: "p", t:
        "If a member has ever been marked present or absent, deleting them fails with " +
        "*\"Cannot remove a brother with attendance records.\"* No amount of permission fixes it. " +
        "The record they're attached to is what's blocking, and we haven't built the path that " +
        "clears it safely yet." },
      { k: "h", t: "What to do instead" },
      { k: "list", items: [
        "**Someone graduated or went inactive:** mark them exempt for the term. They come out of every mandatory event's roll and stop dragging the chapter's numbers, and their history stays readable. See [excuses and exemptions](/help/excuses-and-exemptions).",
        "**Someone was added twice:** the duplicate with no attendance will delete normally.",
        "**Someone wants their data gone:** that's a rights request, not a roster edit. [Write to us](/contact) and we'll handle it properly.",
      ] },
      { k: "note", tone: "warn", h: "Money records outlive the member on purpose", t:
        "A dues payment stays in the ledger when the person leaves the roster. Removing someone " +
        "from your org must not erase the record that they paid you — your books would stop " +
        "balancing, and so would their side of the story." },
    ],
  },

  // ── Money ─────────────────────────────────────────────────────────────────
  {
    slug: "dues",
    title: "Dues: charging, collecting, waiving",
    blurb: "Why the roster balance and the ledger can't disagree, and the two ways each moves.",
    categoryId: "money",
    keywords: ["dues", "balance", "owed", "payment", "waive", "charge", "collect", "venmo"],
    lede:
      "There are exactly two ways a member's balance can move, and both leave a trail. That's the " +
      "whole design — one book saying everyone's square while the other says nothing came in is " +
      "the failure this is built to prevent.",
    body: [
      { k: "h", t: "Recording a payment (cash actually moved)" },
      { k: "p", t:
        "A treasurer posts a **Dues** income row through the normal transaction form, attributed to " +
        "the member. The same write that mints the ledger row decrements their balance. One action, " +
        "both books." },
      { k: "h", t: "Adjusting a balance (no cash moved)" },
      { k: "p", t:
        "Charging the term's dues, waiving a member's, correcting a mistake — these change what " +
        "someone **owes** without inventing income. They write no ledger row, on purpose, and each " +
        "carries the reason you typed." },
      { k: "note", tone: "good", h: "The balance is not an editable field", t:
        "You can't type over what someone owes. Every movement is one of the two above, which is " +
        "why the number can always be explained." },
      { k: "note", tone: "warn", h: "Voiding a payment gives the debt back", t:
        "If you void or re-price a dues row, the member's balance goes back up by the same amount. " +
        "That's the mirror image of recording it — but it does mean a \"quick fix\" to a ledger row " +
        "shows up on someone's account." },
      { k: "note", tone: "info", h: "We never touch your chapter's money", t:
        "No card numbers, no bank details, no processor for dues. What's here are *records* of " +
        "money that moved somewhere else. (Your org's own subscription to this app is separate and " +
        "does go through a processor — see [what this costs](/help/what-you-pay).) " +
        "[More in Trust & privacy](/trust)." },
    ],
  },
  {
    slug: "reimbursements",
    title: "Reimbursements",
    blurb: "Submitting one, approving one, and what approval actually writes.",
    categoryId: "money",
    keywords: ["reimbursement", "expense", "receipt", "pay me back", "approve", "decline"],
    lede:
      "A reimbursement is a request until a treasurer decides on it. Approving is what turns it " +
      "into money that left the account.",
    body: [
      { k: "h", t: "If you spent the money" },
      { k: "steps", items: [
        "Submit a request with the amount, what it was for, and which budget category it belongs to.",
        "It sits in the treasurer's queue. You can see where it is.",
        "When it's approved, the matching expense appears in the ledger.",
      ] },
      { k: "h", t: "If you're the treasurer" },
      { k: "p", t:
        "Approving posts the expense and moves the balance in one write — you don't also have to " +
        "remember to log it. Declining needs a reason, and the requester sees it. Nothing is " +
        "hard-deleted either way, so the queue stays a record of what was asked as well as what " +
        "was paid." },
      { k: "note", tone: "info", h: "An uncategorised approval still counts", t:
        "If neither the requester nor you named a budget category, the spend still hits the " +
        "treasury balance — it just won't land on a budget line. Name one if you want the budget " +
        "page to stay honest." },
    ],
  },
  {
    slug: "budget",
    title: "The term budget",
    blurb: "Splitting the pool by category, holding a reserve, and watching the burn.",
    categoryId: "money",
    keywords: ["budget", "allocation", "reserve", "carryover", "percent", "category", "burn rate"],
    lede:
      "The budget is a plan for the term, expressed as percentages of the pool rather than " +
      "amounts — so it survives a dues collection that comes in above or below what you hoped.",
    body: [
      { k: "list", items: [
        "**Allocations** are a percentage per category. They have to add up to 100 — the app won't save a plan that doesn't.",
        "**Carryover** is what last term left you.",
        "**Reserve** is what you're deliberately not spending.",
      ] },
      { k: "p", t:
        "Once it's set, every expense that names a category counts against that line, and you can " +
        "see how fast each bucket is going." },
      { k: "note", tone: "info", h: "Percentages, not dollars, on purpose", t:
        "You rarely know the pool on the day you plan the term. A percentage split stays correct " +
        "when dues come in at 80% of what you projected; a dollar split silently stops being a plan." },
    ],
  },
  {
    slug: "export-your-data",
    title: "Getting the numbers back out",
    blurb: "What exports to CSV today, what doesn't yet, and where to ask for the rest.",
    categoryId: "money",
    keywords: ["export", "csv", "download", "advisor", "audit", "backup", "spreadsheet"],
    lede:
      "Two exports exist right now. We'd rather tell you which two than let you find out at the " +
      "worst possible moment.",
    body: [
      { k: "table", head: ["What", "How"], rows: [
        ["The ledger", "Treasury → export. Date, type, category, description, amount, payment method and term, filtered to one term or all of them. Needs the Treasury permission."],
        ["The roster", "The roster page's export button. Name, role, attendance %, GPA, service hours, dues owed and standing — exactly the rows your current filter is showing, so filter first."],
      ] },
      { k: "note", tone: "warn", h: "Attendance and docs don't export yet", t:
        "There is no CSV for attendance records or for the document library. It's a known gap and " +
        "it's on the list. If you need either — for an audit, an advisor, or on your way out — " +
        "[write to us](/contact) and we'll get it to you." },
      { k: "note", tone: "good", h: "Including on the way out", t:
        "Exports aren't gated on your account being in good standing or your subscription being " +
        "current. If you can see it, you can take it." },
    ],
  },

  // ── The week ──────────────────────────────────────────────────────────────
  {
    slug: "timeline-and-events",
    title: "The timeline and event types",
    blurb: "One line for the whole org's week, categorised in the words you use.",
    categoryId: "week",
    keywords: ["timeline", "calendar", "events", "event types", "categories", "colors", "schedule"],
    lede:
      "Every event carries a type. The type sets its colour, where it shows up, and whether it " +
      "counts for attendance — so it's worth ten minutes on the types before you add fifty events.",
    body: [
      { k: "where", path: ["Settings", "Operations", "Event types"] },
      { k: "list", items: [
        "The built-in types can be **renamed and recoloured** — if your org calls it *rehearsal*, call it that.",
        "You can **add your own**, and remove ones you'll never use.",
        "Colour is doing real work here: a timeline you can read at a glance is one where the categories are visually distinct.",
      ] },
      { k: "note", tone: "info", h: "Events live inside a term", t:
        "An event dated outside the active term is refused. If you're planning next semester, make " +
        "next semester's term first — see [terms](/help/first-term)." },
    ],
  },
  {
    slug: "attendance",
    title: "Taking attendance",
    blurb: "Marking a roll, what counts as mandatory, and how the percentage is built.",
    categoryId: "week",
    keywords: ["attendance", "roll call", "present", "absent", "mandatory", "percentage", "missed"],
    lede:
      "Attendance is per event, per member, per term. The chapter-wide percentage everyone argues " +
      "about is just those marks added up.",
    body: [
      { k: "steps", items: [
        "Open the event.",
        "Mark the roll. The eligible set is everyone on the roster who isn't exempt for this term.",
        "Save. Every member's percentage and standing recalculate from it.",
      ] },
      { k: "p", t:
        "Only mandatory events count toward the percentage. Optional ones can still be tracked — " +
        "they just don't put anyone's standing at risk." },
      { k: "note", tone: "info", h: "The excuse comes after the absence", t:
        "Mark the roll honestly on the night. An excuse is a separate request with its own decision " +
        "and its own paper trail — see [excuses and exemptions](/help/excuses-and-exemptions). " +
        "Fixing it by quietly marking someone present is how a policy stops meaning anything." },
      { k: "note", tone: "good", h: "Nobody sees more than their seat", t:
        "Taking attendance needs the Attendance permission. Members see their own record without it." },
    ],
  },
  {
    slug: "excuses-and-exemptions",
    title: "Excuses and exemptions",
    blurb: "One event versus a whole term — two different things that people mix up constantly.",
    categoryId: "week",
    keywords: ["excuse", "exempt", "absence", "study abroad", "injured", "approve", "decline"],
    lede:
      "An excuse forgives one absence. An exemption takes someone out of the roll for the whole " +
      "term. Reaching for the wrong one is the most common mistake on this page.",
    body: [
      { k: "table", head: ["", "What it is"], rows: [
        ["Excuse", "A member's request about **one event**, with a reason. Someone with the Attendance permission approves or declines it, and the decision is recorded."],
        ["Exemption", "An officer marking someone out for **the whole term** — studying abroad, injured, on leave. They come out of every mandatory event's eligible set and sit at a distinct place on the roster, not at 0%."],
      ] },
      { k: "note", tone: "good", h: "Why exemption isn't just \"excuse everything\"", t:
        "Someone abroad for the semester shouldn't need to file twelve excuses, and they shouldn't " +
        "show up as a 0% attendance crisis on your dashboard either. The exemption says *not " +
        "counted*, which is different from *didn't come*." },
      { k: "note", tone: "info", h: "Both leave a trail", t:
        "Every excuse decision and every exemption is recorded with who decided and when. That's " +
        "the point — it means the answer to \"why is she at 100% when she wasn't there\" is one " +
        "click, not an argument." },
    ],
  },
  {
    slug: "tasks-and-polls",
    title: "Tasks and polls",
    blurb: "Assigning to a person or a whole role, and asking the chapter something.",
    categoryId: "week",
    keywords: ["tasks", "todo", "assign", "deadline", "poll", "vote", "survey"],
    lede:
      "Both do the same useful trick: they can target a **role** instead of a list of names, so " +
      "they keep working when the people in that role change.",
    body: [
      { k: "h", t: "Tasks" },
      { k: "p", t:
        "Give it a title, a due date and assignees. An assignee is a member or a role — assign " +
        "something to *Recruitment* and everyone holding that role owns it, including whoever picks " +
        "it up in February." },
      { k: "h", t: "Polls" },
      { k: "p", t:
        "Options, a target audience, and a live tally. Same targeting: ask the whole chapter, or " +
        "ask the exec board by naming the role." },
      { k: "note", tone: "info", h: "Both live inside the active term", t:
        "A due date or a poll dated outside it is refused. See [terms](/help/first-term)." },
    ],
  },

  // ── Ask Chapt ─────────────────────────────────────────────────────────────
  {
    slug: "ask-basics",
    title: "What to ask it",
    blurb: "Opening it, the questions it's actually good at, and how to phrase a date.",
    categoryId: "ask",
    keywords: ["ask", "chat", "assistant", "ai", "cmd k", "search", "question"],
    lede:
      "Press **⌘K** (or Ctrl+K) anywhere in the app. It answers from your org's live records — " +
      "not from a help article, and not from a general knowledge of student orgs.",
    body: [
      { k: "h", t: "Questions it's good at" },
      { k: "list", items: [
        "\"Who hasn't paid dues?\"",
        "\"What did we spend on formal last year?\"",
        "\"Who's missed three or more meetings this term?\"",
        "\"What's on the calendar for next week?\"",
        "\"How much is left in the social budget?\"",
      ] },
      { k: "p", t:
        "It shows its working as it goes — the steps it's taking and what it consulted — and the " +
        "rows in its answer open the underlying record, so you can check it rather than trust it." },
      { k: "note", tone: "warn", h: "Say which month you mean", t:
        "A bare \"the 14th\" gets anchored to the month already in play in the conversation, which " +
        "is right more often than not — but if you've switched topics, it can land in the wrong " +
        "month. Say \"March 14th\" when the month isn't obvious." },
      { k: "note", tone: "info", h: "It takes a few seconds on a real question", t:
        "Anything that has to consult several records has a genuine pause in it while it does. The " +
        "step list is live, not decoration — it's telling you where it is." },
    ],
  },
  {
    slug: "ask-what-it-sees",
    title: "What it can see",
    blurb: "Your org, your permissions, and nothing on the other side of either line.",
    categoryId: "ask",
    keywords: ["privacy", "ai", "data", "permissions", "training", "what does it know"],
    lede:
      "Two boundaries, and neither of them is advisory: it answers inside your organization, and " +
      "inside what your own seat can see.",
    body: [
      { k: "list", tone: "check", items: [
        "**Your org only.** It cannot read another organization's records, and that isolation is enforced by the database, not by asking the model nicely.",
        "**Your permissions only.** A service chair asking about the ledger doesn't get the ledger. Asking a different way doesn't change that.",
        "**Live records.** It reads what's in your workspace now, so a number it gives you is the number on the page.",
      ] },
      { k: "note", tone: "info", h: "What leaves the building", t:
        "Answering a question sends the relevant slice of your org's records to the model provider. " +
        "It is not used to train anyone's model. The complete account of what's sent, to whom, and " +
        "what's kept is in [Trust & privacy](/trust#assistant) — worth reading once if you're the " +
        "person who has to answer for it." },
      { k: "note", tone: "warn", h: "It can be wrong inside those lines", t:
        "The boundaries are about *access*, not accuracy. Everything it says is checkable against " +
        "the records it names, and [sometimes you should check](/help/ask-got-it-wrong)." },
    ],
  },
  {
    slug: "ask-approvals",
    title: "When it wants to change something",
    blurb: "Proposals, why nothing is written until you press the button, and what gets recorded.",
    categoryId: "ask",
    keywords: ["approve", "proposal", "write", "change", "confirm", "automation", "log dues"],
    lede:
      "Ask it to add a deadline or log a payment and it doesn't do it. It draws you a card of " +
      "exactly what it would do, and waits.",
    body: [
      { k: "p", t:
        "It can propose a task or deadline, a calendar event, a transaction, a dues payment, an " +
        "Instagram task, or a programming event. Every one of those arrives as a card you read " +
        "before anything happens." },
      { k: "list", tone: "check", items: [
        "**Nothing is written until a human approves.** There is no setting that turns this off.",
        "**You need the permission anyway.** A proposal to log a transaction is only approvable by someone who could have logged it by hand.",
        "**The card can't be tampered with.** Its contents are signed by the server when it's drafted; a modified card writes nothing at all.",
        "**The approval is recorded** — what was proposed, who approved it, and when.",
      ] },
      { k: "note", tone: "good", h: "This is the whole safety model", t:
        "The assistant proposes and a permitted person decides. Nothing with a consequence happens " +
        "on the model's say-so alone — which is also the honest answer when someone on your board " +
        "asks whether \"the AI can move money\"." },
    ],
  },
  {
    slug: "ask-got-it-wrong",
    title: "When it gets something wrong",
    blurb: "How to tell, what usually causes it, and what telling us actually does.",
    categoryId: "ask",
    keywords: ["wrong", "hallucination", "incorrect", "feedback", "rating", "bad answer", "fix"],
    lede:
      "It will be wrong sometimes. The design goal isn't an assistant that never errs — it's one " +
      "where you can always see how it got there.",
    body: [
      { k: "steps", items: [
        "**Open the trace.** The steps it took are kept with the answer. Nine times in ten the mistake is visible there — it looked at the wrong term, or the wrong month.",
        "**Check the row.** Answers link to the records behind them. Open one; either the record is wrong or the answer is.",
        "**Rate it.** The thumbs are read by a person, and the question text comes with it.",
      ] },
      { k: "h", t: "The usual causes, in order" },
      { k: "list", items: [
        "**The wrong term is active.** Most \"that number is wrong\" is a term boundary. Check which term is active before anything else.",
        "**A bare date.** \"The 14th\" gets pinned to the month in play. Say the month.",
        "**The record really is wrong.** If nobody marked the roll for three weeks, no assistant can tell you who's at risk.",
      ] },
      { k: "note", tone: "info", h: "If it's badly wrong, tell a human", t:
        "A rating helps us; it doesn't get you an answer today. [Write to us](/contact) with what " +
        "you asked and what it said, and you'll get a person." },
    ],
  },

  // ── Docs & the record ─────────────────────────────────────────────────────
  {
    slug: "docs-library",
    title: "The docs library",
    blurb: "Folders, pinning, ordering, and the difference between moving and reordering.",
    categoryId: "record",
    keywords: ["docs", "documents", "files", "folders", "bylaws", "links", "pin", "drag", "sort"],
    lede:
      "Bylaws, forms, vendor contacts, minutes, the link to the thing nobody can ever find. One " +
      "library, foldered, searchable, with credit attached to whoever filed it.",
    body: [
      { k: "h", t: "Moving versus reordering" },
      { k: "list", items: [
        "**Moving** a document into a folder: drag it onto the folder header.",
        "**Reordering** within a folder: switch the sort to **Manual** first. Drag does nothing while the list is sorted by name or date — it can't, since the order isn't yours to set.",
      ] },
      { k: "h", t: "Pinning" },
      { k: "p", t:
        "Pin the four or five things people actually ask for. A library where the bylaws are pinned " +
        "gets asked about the bylaws far less." },
      { k: "note", tone: "info", h: "Saved links fetch a preview", t:
        "When you save a link, we fetch the page once to pull its title and description. That means " +
        "the destination site sees a request from us — it's how the preview exists. Nothing else is " +
        "sent, and nothing is fetched again unless you refresh it." },
      { k: "note", tone: "warn", h: "No CSV export for docs yet", t:
        "The library doesn't export. Documents you uploaded can be downloaded individually. See " +
        "[getting the numbers out](/help/export-your-data)." },
    ],
  },
  {
    slug: "activity-log",
    title: "The activity log",
    blurb: "Who changed what, when — and the argument it's designed to end.",
    categoryId: "record",
    keywords: ["audit", "log", "history", "who changed", "activity", "trail", "accountability"],
    lede:
      "Every change across the app writes an entry: what changed, who did it, and when. It's the " +
      "answer to \"who deleted that\" and, more often, the protection for whoever didn't.",
    body: [
      { k: "where", path: ["Settings", "System", "Activity log"] },
      { k: "p", t:
        "It's chronological and it covers the whole org, not one page. Money edits, roster changes, " +
        "role grants, term switches, document moves — all of it lands here." },
      { k: "note", tone: "good", h: "It mostly protects the officers", t:
        "It reads like surveillance and works like an alibi. The person who handles your money is " +
        "the person a log with their name on every legitimate action helps most." },
      { k: "note", tone: "info", h: "Entries are permanent", t:
        "Log entries aren't edited or pruned, including the names in them. That's deliberate — an " +
        "audit trail you can rewrite isn't one. [What that means for retention](/trust#retention)." },
    ],
  },
  {
    slug: "ending-a-term",
    title: "Ending a term",
    blurb: "Starting the new year without losing the last one — the May problem.",
    categoryId: "record",
    keywords: ["archive", "semester", "end of year", "transition", "new board", "graduate", "rollover"],
    lede:
      "The transition where everything an outgoing board knew leaves with them is the failure this " +
      "is built around. Ending a term is one action, and it doesn't delete anything.",
    body: [
      { k: "steps", items: [
        "Create the new term with its dates.",
        "Make it active.",
        "That's it. The old term stops being the default view and stays completely readable.",
      ] },
      { k: "where", path: ["Settings", "Operations", "Semesters"] },
      { k: "p", t:
        "Last term's events, ledger, attendance and standings are all still there, filed under it. " +
        "The dashboard starts clean because it shows the active term, not because the old one went " +
        "anywhere. You can ask about it — \"what did we spend on formal last year?\" — and get an " +
        "answer." },
      { k: "note", tone: "info", h: "Do it before the handover, not after", t:
        "Flipping the term while the outgoing board is still around means someone who knows the " +
        "answers is there when the first \"where did X go\" comes in. It's usually a five-minute " +
        "conversation in April and a fortnight of archaeology in September." },
    ],
  },

  // ── Your account & orgs ───────────────────────────────────────────────────
  {
    slug: "signing-in",
    title: "Signing in",
    blurb: "Google, and only Google — plus what to do when the wrong account is signed in.",
    categoryId: "account",
    keywords: ["login", "sign in", "google", "password", "oauth", "cant log in", "locked out"],
    lede:
      "There's no password to make, forget, reuse or leak. You sign in with Google, and that " +
      "account is your identity everywhere in the app.",
    body: [
      { k: "note", tone: "warn", h: "Use the same Google account every time", t:
        "Your personal Gmail and your university account are two different people as far as the app " +
        "is concerned. If you joined with one and sign in with the other, you'll look like a " +
        "stranger — sign out of Google, and back in with the one you joined with." },
      { k: "h", t: "\"I'm signed in but I can't get to my org\"" },
      { k: "list", items: [
        "You signed in with a different Google account than the one that joined. Check which one, at the top right.",
        "Your invite was never redeemed — being *sent* a link isn't the same as having used it.",
        "You were removed, or your access was revoked. An officer can see this on the roster.",
      ] },
      { k: "p", t: "If none of those fit, [tell a human](/contact) — include the email address you're signing in with." },
    ],
  },
  {
    slug: "multiple-orgs",
    title: "Being in more than one org",
    blurb: "One login, several workspaces, and one wrinkle worth knowing about.",
    categoryId: "account",
    keywords: ["multiple", "switch", "two orgs", "several", "membership", "another chapter"],
    lede:
      "One Google account, as many organizations as you belong to. Switching between them is a " +
      "menu, not a second login.",
    body: [
      { k: "p", t:
        "Each org is a separate workspace with its own roster, money, roles and records — the " +
        "isolation between them is enforced at the database, not just hidden in the interface. " +
        "Your permissions are per-org too: you can be president of one and an ordinary member of " +
        "another, and neither leaks into the other." },
      { k: "note", tone: "info", h: "The wrinkle", t:
        "Your **home org** — the one you first joined — is still what the member roster, attendance " +
        "and dues pages scope by today. So if you belong to two orgs, you can open, use and " +
        "administer both, but you'll appear on the roster of your home org only. It surprises " +
        "people, so: it's known, it's a migration in progress, and nothing is lost by it." },
    ],
  },
  {
    slug: "leaving-or-deleting",
    title: "Leaving an org, or deleting one",
    blurb: "Three different exits, and exactly what each one destroys.",
    categoryId: "account",
    keywords: ["leave", "delete", "unlink", "quit", "close account", "remove org", "shut down"],
    lede:
      "Leaving, unlinking and deleting are three different things with three different blast " +
      "radii. Pick deliberately.",
    body: [
      { k: "table", head: ["Action", "What it does"], rows: [
        ["**Leave an org**", "Drops your membership and your role grants in that org. Your record there stays for their books. Refused if you're the last admin — an org with nobody who can administer it is a dead org."],
        ["**Unlink your account**", "Disconnects your Google account and signs you out. Your member record and its history **remain** — this is a sign-out with intent, not an erasure."],
        ["**Delete the org**", "An admin types the org's exact slug to confirm. Everything the org holds goes, in one transaction, across the whole workspace."],
      ] },
      { k: "note", tone: "flag", h: "Deleting an org is not reversible", t:
        "Roster, ledger, attendance, events, documents, roles, invites and the audit trail. There " +
        "is no undo and no thirty-day grace period. [Export what you need](/help/export-your-data) " +
        "first." },
      { k: "note", tone: "info", h: "It doesn't delete people who have somewhere else to be", t:
        "Members whose only org this was are deleted with it. Anyone who belongs to another org " +
        "keeps their account and is re-homed there — so the deletion summary's count is smaller " +
        "than your headcount, and that's correct." },
      { k: "p", t:
        "Want your own personal data erased rather than an org deleted? That's a rights request — " +
        "[write to us](/contact) and see [your rights](/trust#rights)." },
    ],
  },
  {
    slug: "turn-pages-on-and-off",
    title: "Turning pages on and off",
    blurb: "Showing only the surfaces your org uses, and reordering what's left.",
    categoryId: "account",
    keywords: ["workflows", "pages", "sidebar", "hide", "nav", "reorder", "simplify", "modules"],
    lede:
      "Most orgs need about half of what's here. Hiding the rest is one screen, and it's the " +
      "single highest-value thing a new admin can do.",
    body: [
      { k: "where", path: ["Settings", "Operations", "Workflows"] },
      { k: "list", items: [
        "Turn a whole page on or off. **Dashboard, Timeline and Chapter are always on** and can't be hidden.",
        "Turn off individual pieces of a page you keep — a KPI card you don't track, the health dial, the announcement banner.",
        "Reorder the sidebar within each group, so the page your org opens most is at the top.",
      ] },
      { k: "note", tone: "good", h: "Turning something off never deletes it", t:
        "Hidden means hidden. Turn Service back on in March and every hour logged before you hid it " +
        "is still there." },
      { k: "note", tone: "warn", h: "Carry the whole set when you change one", t:
        "A couple of workflows — attendance and events among them — have no toggle of their own on " +
        "this screen. If you're changing your enabled set through anything other than this editor, " +
        "carry the existing ones through or you'll silently drop them." },
    ],
  },
  {
    slug: "rename-the-words",
    title: "Renaming the words the app uses",
    blurb: "Say chapter, or crew, or section — the app doesn't care which.",
    categoryId: "account",
    keywords: ["vocabulary", "rename", "wording", "terminology", "brother", "member", "language"],
    lede:
      "A sorority, a marching band and a robotics team do not use the same nouns. Swap them once " +
      "and every page follows.",
    body: [
      { k: "where", path: ["Settings", "Identity", "Vocabulary"] },
      { k: "p", t:
        "Rename the platform's default words to the ones your org actually uses — members, the org " +
        "itself, the reporting period, the recurring meeting. The change ripples across every page, " +
        "including the assistant's answers." },
      { k: "note", tone: "info", h: "Do it before you invite everyone", t:
        "The vocabulary is the first thing people notice and the last thing they mention. Get it " +
        "right before the roster arrives and nobody ever has to be told \"ignore that word\"." },
    ],
  },

  // ── What this costs ───────────────────────────────────────────────────────
  // Every figure in these four articles is stated in prose, which means it can
  // drift from lib/billing/tiers.ts. If you change a band, change these too —
  // the /pricing page derives its numbers and can't go stale, but this file
  // can. That's the trade for keeping help content free of imports.
  {
    slug: "what-you-pay",
    title: "What this costs",
    blurb: "One price per org, set by headcount. Free to four, $25/month to fifty.",
    categoryId: "billing",
    keywords: ["price", "pricing", "cost", "plan", "subscription", "free", "how much", "billing", "$"],
    lede:
      "One price for the whole organization, decided by how many people are on it. Not per person, " +
      "not per term, and not a smaller product at the lower prices.",
    body: [
      { k: "table", head: ["Organization size", "Per month"], rows: [
        ["1–4 people",     "Free"],
        ["5–50 people",    "$25"],
        ["51–120 people",  "$65"],
        ["121+ people",    "Quoted — talk to us"],
      ] },
      { k: "p", t:
        "The band you land in is worked out from your live headcount, so it moves on its own. Add " +
        "people and it goes up at the boundary; graduate a class and it comes back down. Nobody has " +
        "to remember to tell us." },
      { k: "h", t: "Every feature is on every plan" },
      { k: "p", t:
        "This is worth stating plainly because most software doesn't work this way: there is no " +
        "feature in this product locked behind a higher price, and no screen that asks you to " +
        "upgrade to see something. The roster, dues, the ledger, attendance, documents, the " +
        "assistant, exports and the audit log are all there on the free plan. The price only " +
        "tracks how many of you there are." },
      { k: "note", tone: "info", h: "Two different kinds of money", t:
        "This is what your org pays *us*. It has nothing to do with the dues and budget you track " +
        "inside the app — those never touch this, and this never touches those. See " +
        "[Dues](/help/dues) for the other one." },
      { k: "where", path: ["Settings", "System", "Billing"] },
    ],
  },
  {
    slug: "member-limit",
    title: "What happens when you hit the limit",
    blurb: "The one thing that stops, and the many things that don't.",
    categoryId: "billing",
    keywords: ["limit", "cap", "full", "can't add", "at capacity", "402", "blocked", "seat", "maximum"],
    lede:
      "Growing past what you're paying for blocks exactly one thing: adding the next person. " +
      "Everything you already have keeps working.",
    body: [
      { k: "h", t: "What stops" },
      { k: "list", tone: "no", items: [
        "Adding a new member to the roster.",
        "A new person redeeming an invite link.",
        "Un-archiving someone who was archived.",
      ] },
      { k: "h", t: "What doesn't" },
      { k: "list", tone: "check", items: [
        "Every member you already have keeps their access — nobody is removed or locked out.",
        "Every page keeps working: roster, dues, attendance, timeline, documents, the assistant.",
        "Your exports keep working, so your data is never held hostage.",
        "Nothing is deleted, hidden, or degraded.",
      ] },
      { k: "note", tone: "good", h: "It only ever blocks growth", t:
        "The check runs when something would make your org bigger, and never on anything you " +
        "already have. Running past your plan is an inconvenience, not a shutdown." },
      { k: "h", t: "Clearing it" },
      { k: "steps", items: [
        "An org admin opens Settings → Billing.",
        "Add a payment method. You're not charged for doing this while you're still within the free band — the card just sits there.",
        "Add the person. Billing catches up with the new headcount on its own.",
      ] },
      { k: "note", tone: "warn", h: "Only an org admin can clear it", t:
        "Billing is org-admin authority, not a permission you can hand out — it belongs to whoever " +
        "set the organization up. A Treasurer running the chapter's money can't add the card." },
      { k: "note", tone: "info", h: "Above 120 people it needs a conversation", t:
        "Past that size we price per organization rather than off a table, so the button asks for a " +
        "quote instead of a card. [Talk to us](/contact) and we'll come back with a number." },
    ],
  },
  {
    slug: "paying-and-invoices",
    title: "Cards, invoices and failed payments",
    blurb: "Where the card lives, how to get receipts, and what a declined payment does.",
    categoryId: "billing",
    keywords: ["card", "invoice", "receipt", "payment", "stripe", "portal", "past due", "declined", "failed"],
    lede:
      "Payment is handled by Stripe end to end. We never see or store your card, and everything you " +
      "might want to do with it lives in one place.",
    body: [
      { k: "where", path: ["Settings", "System", "Billing", "Manage billing"] },
      { k: "p", t:
        "That button opens Stripe's own billing portal, where you can change the card, download " +
        "every past invoice, update the billing address and cancel. We deliberately didn't rebuild " +
        "any of that — handling card details ourselves would mean taking on risk for no benefit to " +
        "you." },
      { k: "h", t: "When a payment fails" },
      { k: "p", t:
        "Cards expire and banks decline things. When that happens the subscription goes to " +
        "**past due**, and Stripe retries on a schedule of its own while emailing the address on " +
        "the account." },
      { k: "list", tone: "check", items: [
        "Nobody is removed and nothing is deleted.",
        "Every existing member keeps working access.",
        "You can't add new members until it's resolved — same rule as the member limit.",
      ] },
      { k: "note", tone: "good", h: "Fixing it is faster than waiting", t:
        "Updating the card in the portal settles it immediately rather than waiting for the next " +
        "automatic retry." },
      { k: "note", tone: "info", h: "Who gets the emails", t:
        "Stripe sends receipts and payment warnings to the email on the billing account — the " +
        "person who set the subscription up. If that person has graduated, change the address in " +
        "the portal before it matters." },
    ],
  },
  {
    slug: "cancelling",
    title: "Cancelling",
    blurb: "How to stop paying, what you keep, and what the free plan means afterwards.",
    categoryId: "billing",
    keywords: ["cancel", "stop paying", "downgrade", "unsubscribe", "refund", "end subscription"],
    lede:
      "Cancelling takes a couple of clicks, doesn't require emailing anyone, and doesn't take your " +
      "records with it.",
    body: [
      { k: "steps", items: [
        "An org admin opens Settings → Billing.",
        "Click Manage billing to open the Stripe portal.",
        "Cancel there. It takes effect at the end of the period you've already paid for.",
      ] },
      { k: "h", t: "What happens next" },
      { k: "list", tone: "check", items: [
        "You keep full use of the rest of the month you paid for.",
        "After that the org drops back to the free plan.",
        "Every record stays exactly where it is — nothing is deleted by cancelling.",
        "Exports keep working, so you can take the ledger and roster with you whenever.",
      ] },
      { k: "note", tone: "warn", h: "The free plan caps new members at four", t:
        "Dropping back doesn't remove anyone — if you're 40 people, you stay 40 people with full " +
        "access. But you won't be able to add the 41st until you subscribe again. The cap is on " +
        "growth, not on what exists." },
      { k: "note", tone: "info", h: "Cancelling is not deleting", t:
        "They're separate. If you want the organization and its data actually gone, that's a " +
        "different action with its own confirmation — see " +
        "[Leaving or deleting](/help/leaving-or-deleting)." },
      { k: "note", tone: "info", h: "Changed your mind before it ends?", t:
        "A cancellation that hasn't taken effect yet can be resumed from the same portal, and " +
        "nothing will have changed in the meantime." },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Derived indexes
// ─────────────────────────────────────────────────────────────────────────────

export const ARTICLES_BY_SLUG: ReadonlyMap<string, Article> = new Map(
  ARTICLES.map(a => [a.slug, a]),
);

export const CATEGORIES_BY_ID: ReadonlyMap<string, Category> = new Map(
  CATEGORIES.map(c => [c.id, c]),
);

export function articlesIn(categoryId: string): Article[] {
  return ARTICLES.filter(a => a.categoryId === categoryId);
}

/**
 * The three journeys people are actually on when they open a help centre, each
 * pointing at the article that unblocks them. Order matters — this is the first
 * thing under the search box.
 */
export const QUICK_PATHS: { slug: string; label: string; hint: string; doodle: string; tint: Tint }[] = [
  {
    slug: "set-up-your-org",
    label: "I'm setting one up",
    hint: "From nothing to a workspace your board will open.",
    doodle: "plant",
    tint: "butter",
  },
  {
    slug: "join-an-org",
    label: "I was sent a link",
    hint: "What the invite does, and what to do when it doesn't work.",
    doodle: "hand",
    tint: "sky",
  },
  {
    slug: "first-term",
    label: "It won't let me past a screen",
    hint: "Almost always the term. Here's the thirty-second fix.",
    doodle: "clock",
    tint: "peach",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Search index
// ─────────────────────────────────────────────────────────────────────────────

/** Flatten a block's prose so the search index covers article bodies. */
function blockText(b: Block): string {
  switch (b.k) {
    case "p":
    case "h":
      return b.t;
    case "steps":
      return b.items.join(" ");
    case "list":
      return b.items.join(" ");
    case "note":
      return `${b.h} ${b.t}`;
    case "table":
      return [...b.head, ...b.rows.flat()].join(" ");
    case "where":
      return b.path.join(" ");
  }
}

/** One row per article, everything already lowercased for matching. */
export interface SearchRow {
  slug: string;
  title: string;
  blurb: string;
  categoryId: string;
  categoryTitle: string;
  /** title + blurb + keywords + category, lowercased. A hit here ranks high. */
  head: string;
  /** The full body prose, lowercased. A hit here ranks lower. */
  body: string;
}

/**
 * Built once at module scope and passed to the client browser. It's ~30KB of
 * text, which is cheaper than a round-trip per keystroke and lets the whole
 * thing work with the network off.
 */
export const SEARCH_INDEX: SearchRow[] = ARTICLES.map(a => {
  const cat = CATEGORIES_BY_ID.get(a.categoryId)!;
  return {
    slug: a.slug,
    title: a.title,
    blurb: a.blurb,
    categoryId: a.categoryId,
    categoryTitle: cat.title,
    head: [a.title, a.blurb, a.keywords.join(" "), cat.title].join(" ").toLowerCase(),
    body: [a.lede, ...a.body.map(blockText)].join(" ").toLowerCase(),
  };
});
