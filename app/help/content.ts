/**
 * Help centre content.
 *
 * Plain data, no JSX — the article pages, the index's client-side search, the
 * contact page (?from=<slug>) and the sitemap all import this module, so it has
 * to be safe on both sides of the server/client line. The pictures that open
 * each article live in ./figures.ts, keyed by the same slug.
 *
 * ACCURACY IS THE POINT. Every claim below was checked against the code on
 * 2026-11-01, and every label quoted in **bold** is the one the real screen
 * shows (e.g. SemesterGate's tabs are "Extend it / Start new", whatever its
 * header comment says). Where a thing is half-built or has a sharp edge, the
 * article says so in a `note` rather than being quietly optimistic. When you
 * ship a feature that changes one of these answers — or one of the figures —
 * change it in the same PR.
 *
 * Inline markup understood by the renderer (components/landing/inline.tsx):
 *   **bold**   *italic*   `code`   [label](/href)
 */

import type { PaperIconName, PaperTone } from "../components/paper/PaperIcon";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** A Paper pastel. Sets a category's tile, highlighter and section rule. */
export type Tint = PaperTone;

/** Who an article is for: no permission needed, some permission, or org admin. */
export type Audience = "member" | "officer" | "admin";

export type Block =
  /** Body paragraph. */
  | { k: "p"; t: string }
  /** Sub-heading inside an article. Also an "On this page" entry. */
  | { k: "h"; t: string }
  /** Numbered procedure. The numbers match the pins in the article's figure. */
  | { k: "steps"; items: string[] }
  /** Bulleted list. `tone` swaps the marker for a tick or a cross. */
  | { k: "list"; items: string[]; tone?: "check" | "no" }
  /** Callout. warn/flag/good render as sticky notes; the default is a calm aside. */
  | { k: "note"; tone?: "info" | "warn" | "good" | "flag"; h: string; t: string }
  /** Two-column reference table. */
  | { k: "table"; head: [string, string]; rows: [string, string][] }
  /** "Where to find it" — the click path, in order. A leading one becomes the
      article's "Where it lives" fact instead of rendering in the body. */
  | { k: "where"; path: string[] };

export interface Category {
  id: string;
  title: string;
  /** One line under the category on the index. */
  blurb: string;
  icon: PaperIconName;
  tint: Tint;
}

export interface Article {
  slug: string;
  categoryId: string;
  icon: PaperIconName;
  /** Drives the index's "Show me what's for" filter. */
  aud: Audience[];
  title: string;
  /** The part of the title the highlighter sits behind. */
  hi?: string;
  /** One line under the title in listings. Also the meta description. */
  blurb: string;
  /** Extra search terms — the words someone would actually type. */
  keywords: string[];
  /** The "Who can" fact: which permission it takes. */
  who: string;
  /** Standfirst on the article page. */
  lede: string;
  /** Caption under the figure. */
  cap: string;
  body: Block[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Categories + articles
// ─────────────────────────────────────────────────────────────────────────────

export const CATEGORIES: Category[] = [
  {
    id: "start",
    title: "Getting started",
    icon: "plant",
    tint: "butter",
    blurb: "Making an org, joining one, and the term everything is filed under.",
  },
  {
    id: "members",
    title: "Members & roles",
    icon: "people",
    tint: "sky",
    blurb: "Getting people in, deciding what they can touch, and what you track.",
  },
  {
    id: "money",
    title: "Money",
    icon: "wallet",
    tint: "mint",
    blurb: "The ledger, dues, reimbursements, categories, and getting numbers out.",
  },
  {
    id: "week",
    title: "The week",
    icon: "cal",
    tint: "lilac",
    blurb: "Events, meetings and minutes, attendance, excuses, tasks and polls.",
  },
  {
    id: "pages",
    title: "Optional pages",
    icon: "board",
    tint: "peach",
    blurb: "Service, Programming, Parties, Instagram and Fundraisers.",
  },
  {
    id: "ask",
    title: "Ask Chapt",
    icon: "spark",
    tint: "rose",
    blurb: "What the assistant sees, what it can change, and when it's wrong.",
  },
  {
    id: "record",
    title: "Docs & the record",
    icon: "folder",
    tint: "butter",
    blurb: "The library, the activity log, and ending a term cleanly.",
  },
  {
    id: "account",
    title: "Your account & orgs",
    icon: "key",
    tint: "sky",
    blurb: "Signing in, several orgs, your dashboard, and leaving.",
  },
  {
    id: "billing",
    title: "What this costs",
    icon: "receipt",
    tint: "mint",
    blurb: "The price, who counts, and what happens at the limit.",
  },
];

export const ARTICLES: Article[] = [
  {
    slug: "set-up-your-org",
    categoryId: "start",
    icon: "plant",
    aud: ["admin"],
    title: "Setting up a new org",
    hi: "new org",
    blurb: "The interview at /create, the charter it builds, and why you sign in at the very end.",
    keywords: ["create", "new chapter", "sign up", "onboarding", "slug", "url", "start", "charter", "interview"],
    who: "Anyone with a Google account. You become the org's first admin.",
    lede: "Setup is a conversation, not a form. You answer questions signed out, review everything on one sheet, and only sign in once there's something to save.",
    cap: "The six steps of /create. Nothing exists until step 6.",
    body: [
      {
        k: "steps",
        items: [
          "Go to [chaptos.com/create](/create) and type your org's name. Nothing is created yet. You're only answering.",
          "Answer the interview: who you are, what kind of group it is, your role, what happens in a normal month, whether you handle money, whether people share files and links, what to track for each member, and which term you're in right now. Each answer turns pages on or off.",
          "Check **who can do what**. The starting seats come from your kind of org. Rename them and choose what each one can touch.",
          "Check **what lands on your timeline**: the categories every dated thing is tagged with. Rename them, recolour them or add your own.",
          "Review the **charter**. Everything on it is editable in place, including the web address and the term. The web address is the one thing that can stop the build.",
          "Continue with Google. This is the first moment anything is written, and the whole charter is created in one go.",
        ],
      },
      {
        k: "note",
        tone: "info",
        h: "Web address rules",
        t: "3–32 characters: lowercase letters, numbers and single hyphens. Some words are reserved (`admin`, `api`, `help`, `trust` and similar) so a workspace can never shadow a system page. The charter checks availability as you type.",
      },
      {
        k: "note",
        tone: "good",
        h: "Your answers survive the sign-in",
        t: "The draft lives in your browser while you work, so getting bounced to Google and back doesn't cost you the interview. It also means the draft is on **that** device — finish on the machine you started on.",
      },
      { k: "h", t: "What gets built" },
      {
        k: "list",
        items: [
          "The org, with you as its first **org admin** — every permission, whatever roles you hold. See [org admins](/help/org-admins).",
          "The seats you reviewed, as roles. Yours carries every permission; the others can be renamed or deleted later.",
          "The pages your answers turned on, and only those.",
          "Your timeline categories and the per-member tracking you picked.",
          "Your first term, already **active**, so you land in a working workspace rather than in front of [the term screen](/help/first-term).",
        ],
      },
      {
        k: "p",
        t: "You then land on a welcome page with your first-week list. Its first real step is making the link that brings people in — see [making invite links](/help/invite-people).",
      },
    ],
  },
  {
    slug: "join-an-org",
    categoryId: "start",
    icon: "hand",
    aud: ["member"],
    title: "Joining an org you were invited to",
    hi: "invited to",
    blurb: "What the /join link does, why you wait for approval, and what each screen means.",
    keywords: ["invite", "invitation", "join", "link", "new member", "accept", "pending", "waiting", "approval", "declined"],
    who: "Anyone with the link — an officer still has to approve you.",
    lede: "An invite link doesn't put you on the roster. It lets you ask. An officer approves you, and only then are you in.",
    cap: "The four screens of a /join link, with their real headings.",
    body: [
      {
        k: "steps",
        items: [
          "Open the link you were sent. It looks like `/join/…` and shows the org's name and badge before you sign in to anything.",
          "Continue with Google. It's the only way in, so there's no password to make or forget.",
          "Check that the account shown is the one you mean to use, type your full name, and choose **Request to join**.",
          "Wait for an officer. The page says you're waiting and keeps checking while it's open.",
        ],
      },
      {
        k: "table",
        head: ["What the page says", "What it means"],
        rows: [
          ["You're in …", "You already belong to this org. There's no form — just **Go to** the org."],
          [
            "Waiting on …",
            "Your request is with the officers. Nothing about you exists in the org yet. Opening the link again shows the same screen and doesn't send a second request.",
          ],
          [
            "Your request wasn't approved",
            "An officer declined. This link won't work for you again. If they change their mind, they can send you a different link.",
          ],
          [
            "This invite link has expired / has been turned off / has reached its limit",
            "The link itself is dead. Ask for a new one.",
          ],
          [
            "All places on this link are reserved…",
            "The link has a use limit, and people already waiting have taken every place. Ask for another link.",
          ],
        ],
      },
      {
        k: "note",
        tone: "info",
        h: "The name you type is the one they see",
        t: "There's no list of names to match you against. The name you enter is what officers see on your request and, once approved, on that org's roster. It can be changed later, in that org only.",
      },
      {
        k: "note",
        tone: "info",
        h: "All your requests in one place",
        t: "The waiting screen links to **View all your join requests**, across every org.",
      },
      {
        k: "note",
        tone: "flag",
        h: "Wrong Google account?",
        t: "The page shows which account you're signed in with, and switching is one click. Ask with the account you'll keep using — see [signing in](/help/signing-in).",
      },
    ],
  },
  {
    slug: "first-term",
    categoryId: "start",
    icon: "clock",
    aud: ["officer"],
    title: "When it asks for a term before letting you in",
    hi: "a term",
    blurb: "The semester screen that can't be dismissed: when it shows up, and the two ways past it.",
    keywords: [
      "semester",
      "term",
      "active semester",
      "blocked",
      "modal",
      "stuck",
      "gate",
      "ended",
      "period closed",
      "extend",
    ],
    who: "Fixing it needs the Semesters permission. Everyone else sees the screen with no form.",
    lede: "Orgs made at /create start with an active term, so most people meet this screen later: the day the active term's end date passes.",
    cap: "The screen can't be dismissed. Its two tabs are the only ways past it.",
    body: [
      {
        k: "p",
        t: "A term is your reporting period — a semester, a quarter, a season. The **active** one drives the dashboard and every per-term number. Events, tasks, polls, service events, programming, parties and fundraisers must be dated inside it, and attendance and excuses need one to exist. So without an active term the app stops and asks.",
      },
      { k: "h", t: "The two ways past it" },
      {
        k: "list",
        items: [
          "**Extend it** — pick the new last day (**Run it through**) and choose **Extend & reactivate**. Only offered when the org has had a term before.",
          "**Start new** — name it, set when it starts and ends, and choose **Create & activate**. It's active straight away.",
        ],
      },
      { k: "where", path: ["Settings", "Operations", "Semesters"] },
      {
        k: "note",
        tone: "info",
        h: "If you don't hold Semesters",
        t: "You'll see the same screen with no form. Ask someone who holds the **Semesters** permission — an org admin always does.",
      },
      {
        k: "note",
        tone: "good",
        h: "Dates you can change later",
        t: "Guessing the end date is fine. Settings → Semesters lets you fix a term's dates or switch which one is active.",
      },
      {
        k: "note",
        tone: "warn",
        h: "The ledger is the exception",
        t: "Transactions aren't refused for a date outside the active term. Everything else with a date is.",
      },
    ],
  },
  {
    slug: "first-week",
    categoryId: "start",
    icon: "flag",
    aud: ["admin"],
    title: "Your first week, in order",
    hi: "in order",
    blurb: "The shortest path from an empty org to one your board will actually open.",
    keywords: ["checklist", "setup", "getting started", "first", "onboarding", "what now", "welcome"],
    who: "Whoever set the org up.",
    lede: "Do these in order and the rest of the app has something to stand on. Skip around and you'll hit walls that look like bugs and aren't.",
    cap: "Your welcome page ticks these off from real data. The last step only shows if you keep a Treasury.",
    body: [
      {
        k: "steps",
        items: [
          "**Check the term.** Setup made one active. Make sure its dates are right in Settings → Operations → Semesters.",
          "**Get the exec board in.** Make one invite link, send it to the people who'll help set up, and [approve their requests](/help/join-requests). You can give each a role as you approve.",
          "**Fix the roles.** The starting seats fit an average org, not yours. Check your treasurer holds **Treasury** and nobody holds more than they need. See [roles and permissions](/help/roles-and-permissions).",
          "**Schedule your first meeting.** It lands on the timeline. If you track money, hand out this term's dues from Treasury → Dues.",
          "**Put one real thing in each page you kept.** An empty page teaches nobody anything; a page with one real row teaches everybody.",
          "**Then invite everyone else.** Now the first thing they open isn't blank.",
        ],
      },
      {
        k: "note",
        tone: "info",
        h: "Turn pages off you're not ready for",
        t: "Hiding a page costs nothing, and turning it back on doesn't lose its history. See [turning pages on and off](/help/turn-pages-on-and-off).",
      },
      {
        k: "note",
        tone: "warn",
        h: "Don't backfill the whole year on day one",
        t: "Dated records outside the active term are refused, and creating a term makes it active straight away. To file last year: create last year's term, add to it, then switch the active term back in Settings → Semesters.",
      },
    ],
  },
  {
    slug: "invite-people",
    categoryId: "members",
    icon: "link",
    aud: ["officer"],
    title: "Making invite links",
    hi: "invite links",
    blurb: "Making a link, scoping it, and turning it off when the recruiting table closes.",
    keywords: ["invite", "link", "add members", "expire", "revoke", "max uses", "limit", "recruit", "replacement"],
    who: "Org settings permission. (Approving who it brings in needs Roster.)",
    lede: "A link lets people ask to join; it doesn't let them in. Every request still needs an officer's approval. Scoping the link limits who can ask, and how many.",
    cap: "The three things you choose, and the five states a link can be in.",
    body: [
      { k: "where", path: ["Settings", "Membership", "Invitations"] },
      { k: "p", t: "**Invite people** in your profile menu opens the same screen." },
      {
        k: "table",
        head: ["Setting", "What it does"],
        rows: [
          [
            "1 · Label",
            "Your name for it — “spring rush table”, “exec only”. Up to 60 characters. Officers see it on every request that came through the link.",
          ],
          [
            "2 · Expires after",
            "20 minutes, 1 day, 7 days, 14 days, or never. A short one is right for a link you're about to read aloud.",
          ],
          ["3 · Maximum uses", "Optional. A cap from 1 to 500 on how many people the link can bring in."],
        ],
      },
      {
        k: "note",
        tone: "info",
        h: "Waiting requests hold a place",
        t: "On a capped link, a request holds a place while it waits. When people approved plus people waiting reach the cap, the link shows **All places reserved** and refuses new requests. Declining someone frees their place.",
      },
      {
        k: "note",
        tone: "good",
        h: "The cap is exact",
        t: "Requests and approvals for an org are handled one at a time, so a burst of people clicking at once can't push a link past its limit.",
      },
      {
        k: "note",
        tone: "warn",
        h: "Never expires, no limit",
        t: "The screen warns you when a link would work forever for anyone who gets it. That's the link most likely to end up somewhere you didn't mean.",
      },
      { k: "h", t: "Turning a link off" },
      {
        k: "p",
        t: "**Revoke** stops new requests immediately. People already waiting can still be approved, and people already admitted keep their access. It can't be undone. Dead links are hidden until you tick **Show inactive links**; each has **Create replacement link**, which starts a new link with the same settings.",
      },
      { k: "h", t: "Seeing who used it" },
      {
        k: "p",
        t: "Each link records everyone admitted through it, and when — that's also how you check whether a link went further than you meant.",
      },
    ],
  },
  {
    slug: "join-requests",
    categoryId: "members",
    icon: "envelope",
    aud: ["officer"],
    title: "Approving join requests",
    hi: "join requests",
    blurb: "The review queue on the roster: approving, declining, and choosing a role.",
    keywords: ["join request", "approve", "decline", "reject", "pending", "queue", "new member", "add member", "waiting"],
    who: "Roster permission.",
    lede: "Everyone who opens an invite link and asks to join lands here. Nothing about them exists in your org until someone approves them — and approving is the only way anyone gets onto the roster.",
    cap: "The band at the top of the Members page, and the approve dialog it opens.",
    body: [
      { k: "where", path: ["Members page", "Top of the page"] },
      {
        k: "p",
        t: "The count also shows under **Needs you** in the sidebar, and waiting requests appear on the dashboard's members card.",
      },
      {
        k: "steps",
        items: [
          "Open the roster. The band lists who's waiting, oldest first, with the link each came through.",
          "Search by name or email, or narrow it to one invite link.",
          "Choose **Review & approve**. Pick a role, or leave it at no role.",
          "**Approve**. They're on the roster and can get in immediately, starting with no dues, no attendance and no recorded hours.",
        ],
      },
      {
        k: "note",
        tone: "info",
        h: "Roles below your own",
        t: "The role list only offers roles ranked below yours. Org admins can give any role. You can change it later from the roster.",
      },
      { k: "h", t: "Declining" },
      {
        k: "p",
        t: "Declining tells them the request wasn't approved, and that link stops working for them. If you change your mind, send them a different link — asking through a new link starts a fresh request.",
      },
      {
        k: "note",
        tone: "warn",
        h: "At your plan's limit",
        t: "People can still ask. Approving is what's blocked, with “Adding another member needs a billing update.” An org admin fixes that in Billing — see [the member limit](/help/member-limit).",
      },
      {
        k: "note",
        tone: "good",
        h: "Two officers, one request",
        t: "If another officer decides first, you're told it was already reviewed and the queue refreshes. Nobody gets added twice.",
      },
      {
        k: "note",
        tone: "info",
        h: "Already a member somewhere else?",
        t: "If the person already uses ChaptOS in another org, approving links that same account. Each org keeps its own roster entry.",
      },
    ],
  },
  {
    slug: "roles-and-permissions",
    categoryId: "members",
    icon: "key",
    aud: ["officer"],
    title: "Roles, permissions and rank",
    hi: "rank",
    blurb: "Fifteen switches, bundled into roles, ordered by rank so nobody promotes themselves.",
    keywords: ["permissions", "roles", "admin", "officer", "access", "rank", "president", "treasurer"],
    who: "Roles permission.",
    lede: "A role is a bundle of permission switches plus a rank. The switches decide what you can touch; the rank decides who you can hand it to.",
    cap: "A Treasurer role: two switches on, and a rank that only reaches down. Rank numbers are illustrative.",
    body: [
      { k: "where", path: ["Settings", "Membership", "Roles"] },
      {
        k: "table",
        head: ["Switch", "What it covers"],
        rows: [
          ["Roster", "Editing member details, approving join requests, archiving and removing people."],
          ["Attendance", "Taking attendance, opening check-in, deciding excuses, setting exemptions."],
          ["Roles", "This screen: creating roles and handing out ones ranked below your own."],
          [
            "Org settings",
            "The org's setup: pages, vocabulary, thresholds, member fields, custom metrics, event types, the logo and Instagram handle, the sidebar order and the dashboard layout. Also invite links.",
          ],
          [
            "Treasury",
            "Recording transactions and dues, deciding reimbursements, money categories, the opening balance, exporting the books.",
          ],
          ["Fundraisers", "Planning fundraisers, their shopping lists, and counting them up."],
          [
            "Events",
            "Timeline events, meetings and their minutes, agenda templates, event fields, the Programming board.",
          ],
          ["Parties", "Creating and wrapping up parties."],
          ["Service", "Service events, and logging hours for other people."],
          ["Semesters", "Creating terms, fixing their dates, choosing the active one."],
          ["Announcement", "The pinned note on the dashboard."],
          ["Docs", "Adding, editing, pinning and organising the library."],
          ["Tasks", "Creating, assigning and deleting tasks and deadlines."],
          ["Polls", "Creating, assigning, closing and deleting polls."],
          ["Instagram", "The Instagram content calendar."],
        ],
      },
      { k: "h", t: "Rank is the part people miss" },
      {
        k: "p",
        t: "Every role has a rank. You can only create, edit, grant, take away or delete roles ranked **below** your highest one, and you can't put a switch into a role unless you hold it yourself. That's what stops a chair from quietly making themselves president.",
      },
      { k: "h", t: "Two things worth doing on day one" },
      {
        k: "list",
        items: [
          "Check the treasurer actually holds **Treasury** — the starting roles are a template, not your org.",
          "Check that only the right people hold **Roles** and **Org settings**. Those two are the keys to the building.",
        ],
      },
      {
        k: "note",
        tone: "info",
        h: "Org admins sit above all of this",
        t: "An org admin has every switch regardless of roles. See [org admins](/help/org-admins).",
      },
      {
        k: "note",
        tone: "good",
        h: "There is no messaging permission",
        t: "ChaptOS doesn't send emails or notifications, so there's no “can message everyone” switch. The Announcement switch controls the pinned note people see on the dashboard.",
      },
    ],
  },
  {
    slug: "org-admins",
    categoryId: "members",
    icon: "star",
    aud: ["admin"],
    title: "Org admins",
    hi: "admins",
    blurb: "The person who set the org up, what only they can do, and the one thing they can't do yet.",
    keywords: ["admin", "org admin", "owner", "founder", "promote", "last admin", "full access"],
    who: "Settings → Membership → Accounts shows who's an admin.",
    lede: "An org admin isn't a role. It's a mark on someone's membership that gives every permission in that org, whatever roles they hold.",
    cap: "Admin is a mark, not a role. Three things stay with it.",
    body: [
      {
        k: "p",
        t: "Whoever creates the org at /create is its first org admin. It's per org: an admin of one chapter is an ordinary member of another unless they're an admin there too.",
      },
      { k: "h", t: "Only an org admin can" },
      {
        k: "list",
        items: [
          "Run billing — plans, cards, cancelling.",
          "Delete the org.",
          "Turn calendar subscriptions on or off.",
        ],
      },
      {
        k: "p",
        t: "Everything else about the org's setup — pages, vocabulary, thresholds, member fields, custom metrics, event types, the logo, the Instagram handle, the sidebar order and the dashboard layout — belongs to the **Org settings** permission, which you can give to a role.",
      },
      {
        k: "note",
        tone: "flag",
        h: "Making another org admin needs us",
        t: "There's no button for an org admin to make someone else an admin — that switch is only available to ChaptOS staff right now. [Write to us](/contact) and say who should be one.",
      },
      {
        k: "note",
        tone: "warn",
        h: "The last admin can't leave",
        t: "The last org admin can't leave the org or delete their account. Get a second admin first, or delete the org.",
      },
    ],
  },
  {
    slug: "member-card",
    categoryId: "members",
    icon: "eye",
    aud: ["member", "officer"],
    title: "A member's card",
    hi: "card",
    blurb: "What opens when you click someone on the roster, and what you can change there.",
    keywords: ["profile", "member card", "spotlight", "edit member", "details", "exempt", "archive"],
    who: "Anyone can open it. Officers and the member themself see the full card.",
    lede: "Click anyone on the roster and their card opens: who they are, their numbers, anything that needs acting on, and the details your org keeps.",
    cap: "The card, and its menu (Roster permission). Figures are illustrative.",
    body: [
      {
        k: "list",
        items: [
          "**Who** — name, roles, and one sentence about their standing.",
          "**Their numbers** — each opens the detail behind it: which events they missed, what's excused, what they owe.",
          "**Needs attention** — only things someone has to act on, like a waiting excuse. Hidden when there's nothing.",
          "**About** — roles, email, your custom fields and metrics.",
        ],
      },
      {
        k: "p",
        t: "Officers — anyone with the Roster, Treasury, Attendance or Service permission — and the member themself see the full card. Everyone else sees a smaller contact card.",
      },
      { k: "h", t: "What can be changed here" },
      {
        k: "table",
        head: ["Change", "Who"],
        rows: [
          ["Their name in this org", "The member, or Roster. Other orgs keep their own name for them."],
          ["Custom fields and metric values", "The member, or Roster."],
          ["Roles", "Roles — and only roles ranked below your own."],
          ["Attendance exemption", "Attendance."],
          ["Log service hours", "Service."],
          [
            "Archive, or remove permanently",
            "Roster. See [archiving or removing](/help/remove-someone).",
          ],
        ],
      },
      {
        k: "note",
        tone: "info",
        h: "One value at a time",
        t: "Each change saves on its own. Most show an Undo; dues waivers and excuse decisions don't, because they're recorded decisions.",
      },
    ],
  },
  {
    slug: "member-fields",
    categoryId: "members",
    icon: "form",
    aud: ["officer"],
    title: "Your own member fields and metrics",
    hi: "fields",
    blurb: "Jersey number, section, pledge class — plus numbers you want measured per member.",
    keywords: ["custom fields", "member fields", "columns", "major", "pledge class", "jersey", "custom metrics", "goal"],
    who: "Org settings permission to define them. The member or Roster fills them in.",
    lede: "The built-in measures cover what most orgs track. Everything else is a field or a metric you define once and then have on everybody.",
    cap: "A value you record vs. a number you measure against a goal.",
    body: [
      { k: "h", t: "Member fields — a value" },
      { k: "where", path: ["Settings", "Membership", "Member fields"] },
      {
        k: "p",
        t: "Marching bands add *section*, sports clubs add *jersey number*, Greek orgs add *pledge class*. Up to 20 fields. Each shows on every member's card; the member or a Roster officer fills it in. Removing a field hides what was recorded rather than deleting it, and adding the field back brings it back.",
      },
      { k: "h", t: "Custom metrics — a number with a goal" },
      { k: "where", path: ["Settings", "Operations", "Custom metrics"] },
      {
        k: "p",
        t: "Give it a name, an optional unit, a goal per member, an **At Risk below** number and, optionally, a **Watch below** number, plus how the dashboard headline adds it up. Values are entered on each member's card. Deleting a metric keeps the values but stops showing it.",
      },
      {
        k: "note",
        tone: "flag",
        h: "Don't put sensitive categories in here",
        t: "Health conditions, disabilities, religion, ethnicity, sexuality, immigration status — a free-text field will accept any of it, and that puts your org on the wrong side of privacy law with no warning from us. Keep it operational. [More on what not to store](/trust#sensitive).",
      },
    ],
  },
  {
    slug: "standing",
    categoryId: "members",
    icon: "flag",
    aud: ["member", "officer"],
    title: "Standing: good, watch, at risk",
    hi: "at risk",
    blurb: "Exactly what puts someone on watch or at risk, and how to set it to your policy.",
    keywords: ["thresholds", "at risk", "watch", "standing", "gpa", "attendance", "flag", "cutoff"],
    who: "Everyone sees the badges. Changing the cutoffs needs Org settings.",
    lede: "Every member gets one of three badges, worked out from the cutoffs in one screen. Here's the exact rule.",
    cap: "The defaults. Every cutoff is yours to change in Thresholds.",
    body: [
      { k: "where", path: ["Settings", "Operations", "Thresholds"] },
      {
        k: "table",
        head: ["Badge", "When"],
        rows: [
          [
            "At risk",
            "Attendance below the at-risk cutoff (default 65%), or GPA below the at-risk cutoff (default 2.7).",
          ],
          [
            "Watch",
            "Not at risk, but any of: attendance below the watch cutoff (80%), GPA below the watch cutoff (3.0), any dues owed, or service hours below the goal (10).",
          ],
          ["Good", "None of the above."],
        ],
      },
      {
        k: "list",
        items: [
          "**Only what you track counts.** Attendance, GPA, dues and service hours are each switched by their KPI under Settings → Workflows → Dashboard widgets. Turn one off and it leaves the roster and never flags anyone.",
          "**Exempt members aren't judged on attendance** for that term.",
          "**Custom metrics carry their own cutoffs**, but they don't change the badge.",
        ],
      },
      {
        k: "note",
        tone: "info",
        h: "Set them to your bylaws, not to what feels strict",
        t: "If your policy is three misses, set the attendance cutoff so three misses trips it.",
      },
    ],
  },
  {
    slug: "remove-someone",
    categoryId: "members",
    icon: "door",
    aud: ["officer"],
    title: "Archiving or removing someone",
    hi: "removing",
    blurb: "Archive to keep their history, remove to erase it — and what each one leaves behind.",
    keywords: ["delete member", "remove", "archive", "graduate", "quit", "off roster", "alumni", "erase"],
    who: "Roster permission.",
    lede: "Archive when someone leaves and you want their history. Remove permanently when you've been asked to erase them, or they shouldn't have been added.",
    cap: "✓ stays · ✕ goes.",
    body: [
      {
        k: "steps",
        items: [
          "Open their card from the roster.",
          "Open the menu and choose **Archive**, or **Remove permanently…** and type their name to confirm.",
        ],
      },
      { k: "p", t: "Settings → Membership → Accounts can also remove someone." },
      {
        k: "note",
        tone: "flag",
        h: "Bringing an archived member back",
        t: "Archiving shows an **Undo** straight away. After that there's no screen to restore someone yet — [write to us](/contact). Restoring also takes a seat on your plan.",
      },
      {
        k: "note",
        tone: "warn",
        h: "Two things refuse",
        t: "The org's last admin can't be removed, and neither can an account held by ChaptOS staff.",
      },
      {
        k: "note",
        tone: "good",
        h: "The books outlive the person",
        t: "A payment someone made stays in the ledger after they're removed. Erasing a member must not make your books stop balancing.",
      },
      {
        k: "note",
        tone: "info",
        h: "Leaving is different",
        t: "Members can leave an org themselves. See [leaving or deleting](/help/leaving-or-deleting).",
      },
    ],
  },
  {
    slug: "treasury-basics",
    categoryId: "money",
    icon: "bars",
    aud: ["member", "officer"],
    title: "How the Treasury works",
    hi: "Treasury",
    blurb: "One ledger, a balance worked out from it, and who can see and change what.",
    keywords: ["treasury", "ledger", "balance", "transactions", "opening balance", "scheduled", "books", "finance"],
    who: "Everyone can read the books. Changing them needs Treasury.",
    lede: "One ledger of money in and out, a balance worked out from it, and the tabs that read it.",
    cap: "The one balance formula the whole app shares. Amounts are illustrative.",
    body: [
      { k: "h", t: "How the balance is worked out" },
      { k: "p", t: "**Opening balance + posted income + party door revenue − posted expenses.**" },
      {
        k: "list",
        items: [
          "An expense marked **Scheduled** (not paid yet) doesn't come off until it's posted.",
          "A party's door revenue counts. The party's expenses figure doesn't — log that spending as an expense transaction too.",
          "Fundraisers never touch the Treasury. See [fundraisers](/help/fundraisers).",
        ],
      },
      { k: "h", t: "Recording a transaction" },
      {
        k: "p",
        t: "Income or expense, a category, the amount, date and description, an optional payment method, optional linked events, and the Scheduled switch. A **Dues** income row attributed to a member also lowers what that member owes — see [dues](/help/dues).",
      },
      { k: "h", t: "The opening balance" },
      { k: "where", path: ["Settings", "Operations", "Opening balance"] },
      {
        k: "p",
        t: "What was in the account when you started keeping books here. $0 is a fine answer. Until it's set, Treasury holders are asked for it when they open the page, and everyone else sees that the books haven't been opened yet.",
      },
      {
        k: "note",
        tone: "warn",
        h: "There's no budget screen right now",
        t: "The Budget tab is switched off, so there's nowhere to set allocations at the moment. The “budget category” on a reimbursement is its expense category.",
      },
      {
        k: "note",
        tone: "info",
        h: "Everyone can read the books",
        t: "Any member can open the Treasury and read the ledger. Ask Chapt answers money questions for anyone for the same reason.",
      },
    ],
  },
  {
    slug: "dues",
    categoryId: "money",
    icon: "jar",
    aud: ["member", "officer"],
    title: "Dues: handing out, recording, waiving",
    hi: "waiving",
    blurb: "Charges on people's tabs, payments that hit the books, and waivers that don't.",
    keywords: ["dues", "balance", "owed", "payment", "waive", "charge", "collect", "venmo", "overdue", "hand out"],
    who: "Everyone sees the Dues tab. Every control needs Treasury.",
    lede: "Dues are charges on people's tabs. Handing them out puts nothing in the books; money only reaches the ledger when someone actually pays.",
    cap: "Three actions, two books. Only a payment touches the ledger.",
    body: [
      { k: "where", path: ["Treasury", "Dues"] },
      { k: "h", t: "Handing out dues" },
      {
        k: "steps",
        items: [
          "**Who's paying?** Everyone (and leave anyone out), By role (a rate for each role, plus members with no role and a base rate), or Pick people — for fines, shirts and one-offs.",
          "**What's it for?** Name it, then either each person pays the same amount or you split a total.",
          "**When's it due?** A date, or none. Add an optional note for members, like where to pay.",
          "Hand it out. It shows up on each tab right away. **Nobody is messaged.**",
        ],
      },
      {
        k: "p",
        t: "Anyone who already has a charge with the same name this term is skipped, unless you choose to bill them again.",
      },
      { k: "h", t: "Recording a payment (money actually moved)" },
      {
        k: "p",
        t: "Open the person from the Dues tab and choose **Record payment**. That posts a Dues income row to the books and takes it off their tab in one step. Payments come off their oldest charge first.",
      },
      { k: "h", t: "Waiving (no money moved)" },
      {
        k: "p",
        t: "**Waive some** lowers what they owe without touching the books, with an optional reason. **Take off** removes them from a single charge.",
      },
      {
        k: "note",
        tone: "good",
        h: "The balance isn't a field you can type over",
        t: "Every movement is a charge, a payment or a waiver, which is why what someone owes can always be explained.",
      },
      {
        k: "note",
        tone: "warn",
        h: "Voiding a payment gives the debt back",
        t: "If you void or re-price a dues row in the ledger, the member's balance goes back up by the same amount.",
      },
      {
        k: "note",
        tone: "info",
        h: "We never touch your chapter's money",
        t: "No card numbers, no bank details, no processor for dues. What's here are *records* of money that moved somewhere else. Your org's subscription is separate — see [what this costs](/help/what-you-pay).",
      },
    ],
  },
  {
    slug: "reimbursements",
    categoryId: "money",
    icon: "receipt",
    aud: ["member", "officer"],
    title: "Reimbursements",
    hi: "Reimbursements",
    blurb: "Asking to be paid back, with the receipt, and what approval writes.",
    keywords: ["reimbursement", "expense", "receipt", "pay me back", "approve", "decline", "photo", "pdf"],
    who: "Any member asks for themselves. Deciding needs Treasury.",
    lede: "A reimbursement is a request until a treasurer decides on it. Approving is what turns it into money that left the account.",
    cap: "Ask with the receipt attached, wait, get approved and posted.",
    body: [
      { k: "h", t: "If you spent the money" },
      {
        k: "steps",
        items: [
          "Treasury → Reimbursements → **Request reimbursement**. Enter the date, the amount, what it was for, its category, and attach the receipt — a photo or a PDF.",
          "It waits for the treasurer. If it's declined, you'll see their note if they left one.",
          "Once approved, the expense is in the ledger. You don't have to do anything else.",
        ],
      },
      { k: "h", t: "Receipts" },
      {
        k: "list",
        items: [
          "JPEG, PNG, WebP, HEIC or PDF, up to 4 MB. Big phone photos are shrunk on your device before they upload, so a straight-off-the-camera shot is fine.",
          "Forgot it, or the upload failed? **Attach receipt** on your request card adds it, as long as the request is still waiting.",
          "Only you and the treasurer can open it, from **View receipt** on the request.",
          "If you're removed from the org, delete your account, or the org is deleted, the receipt file is erased too.",
        ],
      },
      { k: "h", t: "If you're the treasurer" },
      {
        k: "p",
        t: "**Approve & post** puts the expense in the ledger, dated the day it was spent, and moves the balance in one step. You can change the category as you approve. Declining can carry an optional note, shown to the person who asked. Nothing is deleted either way; decided requests sit under **Show resolved**.",
      },
    ],
  },
  {
    slug: "money-categories",
    categoryId: "money",
    icon: "sheet",
    aud: ["officer"],
    title: "Money categories",
    hi: "categories",
    blurb: "The income and expense streams your books file money under.",
    keywords: ["categories", "income", "expense", "rename", "hide", "ledger categories", "streams"],
    who: "Treasury permission. Only shown when the Treasury page is on.",
    lede: "Every transaction is filed under a category. They're yours to name — the two the app posts to itself just can't be removed.",
    cap: "Locked = posted to by the app. Rename them; you can't hide or delete them.",
    body: [
      { k: "where", path: ["Settings", "Operations", "Money categories"] },
      {
        k: "list",
        items: [
          "Separate lists for income and expenses, up to 60 in all.",
          "Rename or recolour any of them. The name it was first filed under is permanent behind the scenes, so renaming never rewrites history.",
          "**Hide** one you've stopped using. **Delete** only works while nothing is filed under it — it tells you what's still using it.",
          "**Dues** (income) and **Reimbursement** (expense) are posted to by the app itself. Rename them freely; they can't be hidden or deleted.",
        ],
      },
    ],
  },
  {
    slug: "export-your-data",
    categoryId: "money",
    icon: "upload",
    aud: ["member", "officer"],
    title: "Getting your data back out",
    hi: "back out",
    blurb: "What exports today, what doesn't yet, and where to ask for the rest.",
    keywords: ["export", "csv", "download", "advisor", "audit", "backup", "spreadsheet", "minutes"],
    who: "Ledger: Treasury. Roster, minutes and events: anyone who can see them.",
    lede: "Here's every way to get data out right now — and the gaps, so you don't find them at the worst moment.",
    cap: "Four ways out, one gap.",
    body: [
      {
        k: "table",
        head: ["What", "How"],
        rows: [
          [
            "The ledger",
            "Treasury → **Export CSV**. Date, Type, Category, Description, Amount, Payment Method and Semester, for one term or all of them. Needs the Treasury permission.",
          ],
          [
            "The roster",
            "Members page → **Export CSV**. Name, Role, Attendance %, GPA, Service Hours, Dues Owed and Status — exactly the rows your current filter shows, so filter first.",
          ],
          ["Meeting minutes", "One meeting at a time: **Copy as text**, **Download .md** or **Print**."],
          ["One event", "**Add this event** sends a copy to Google or Apple Calendar."],
        ],
      },
      {
        k: "note",
        tone: "warn",
        h: "No export for attendance or the docs list",
        t: "There's no CSV for attendance records, and the docs library doesn't export (its items are links, so the files themselves live wherever they're hosted). If you need attendance for an audit or an advisor, [write to us](/contact).",
      },
      {
        k: "note",
        tone: "good",
        h: "Including on the way out",
        t: "Exports aren't gated on your plan or on payment being current. If you can see it, you can take it.",
      },
    ],
  },
  {
    slug: "timeline-and-events",
    categoryId: "week",
    icon: "timeline",
    aud: ["officer"],
    title: "The timeline and event types",
    hi: "event types",
    blurb: "One line for the whole org's week, categorised in the words you use.",
    keywords: [
      "timeline",
      "calendar",
      "events",
      "event types",
      "categories",
      "colors",
      "schedule",
      "required attendance",
    ],
    who: "Adding events: Events. Changing types: Org settings.",
    lede: "Every event carries a type. The type sets its colour and where it shows up, so it's worth ten minutes on the types before you add fifty events.",
    cap: "The five built-ins, as strips of washi tape (the same look Setup uses).",
    body: [
      { k: "where", path: ["Settings", "Operations", "Event types"] },
      {
        k: "list",
        items: [
          "Rename and recolour any type, including the five built-ins.",
          "Add your own, up to 40.",
          "A built-in can't be deleted, only hidden — and only while its page is turned off.",
          "One of your own can be deleted once no event uses it.",
        ],
      },
      {
        k: "p",
        t: "Adding an event needs the Events permission: give it a name, a type, a date and time, and choose whether it has **Required attendance** — that's what makes it take a roll and accept excuses. A location, notes and [more details](/help/event-details) are optional.",
      },
      {
        k: "note",
        tone: "info",
        h: "Events live inside a term",
        t: "An event dated outside the active term is refused. Planning next semester? Its term has to be the active one first — see [ending a term](/help/ending-a-term).",
      },
    ],
  },
  {
    slug: "event-details",
    categoryId: "week",
    icon: "clip",
    aud: ["officer", "member"],
    title: "More details on an event",
    hi: "More details",
    blurb: "Checklists, a budget, who's bringing what, and the rest of what an event can carry.",
    keywords: [
      "event details",
      "checklist",
      "supplies",
      "who's bringing",
      "dress code",
      "capacity",
      "contact",
      "directions",
      "theme",
    ],
    who: "Events to add them. Any member can claim a “Who's bringing what” item.",
    lede: "Beyond the date and place, an event can carry small extra sections. Add only the ones it needs.",
    cap: "The twelve kinds, grouped as the form groups them: plan it, people, on the day, make your own.",
    body: [
      {
        k: "list",
        items: [
          "One of each per event; your own fields can repeat.",
          "**Checklist and Budget are for officers.** Members don't see them.",
          "Any member can claim an item on **Who's bringing what**.",
          "**Start every [type] event with these** saves the sections, blank, as the starting point for that type's next event.",
        ],
      },
    ],
  },
  {
    slug: "meetings-and-minutes",
    categoryId: "week",
    icon: "note",
    aud: ["officer", "member"],
    title: "Meetings, minutes and agenda templates",
    hi: "minutes",
    blurb: "Scheduling meetings, repeating them, taking minutes and pulling out the action items.",
    keywords: ["meeting", "minutes", "agenda", "template", "repeat", "weekly", "chapter", "summary", "action items", "notes"],
    who: "Events to schedule and write minutes. Everyone reads them.",
    lede: "The Meetings page (your org may call it Chapter) is the minute book: what was said, who was there, and who owes what.",
    cap: "Add meeting with Repeat, and the minutes pad with what Summarize pulls out.",
    body: [
      { k: "h", t: "Adding a meeting" },
      {
        k: "list",
        items: [
          "Name, date, time and place.",
          "**Required attendance** counts toward standing and sends excuses for review. Optional means no roll is taken.",
          "Start the notes from an **agenda template**, or blank.",
          "**Repeat** weekly or every 2 weeks, until the end of the term or an earlier date — up to 52 meetings. Each one is its own meeting, so editing one never touches the rest.",
        ],
      },
      { k: "h", t: "Minutes" },
      {
        k: "p",
        t: "Writing the minutes needs the Events permission; everyone can read them. Write action items like “- Dev to send the budget by Oct 10” and **Summarize** pulls out the decisions and who owes what. If the notes change, **Re-summarize**. An action item can be ticked off by an officer or by the person it's assigned to. Copy, download or print the minutes from the meeting's menu.",
      },
      {
        k: "note",
        tone: "info",
        h: "Summaries use the AI provider",
        t: "Summarize sends the meeting's notes to our AI provider and saves the summary on the meeting. [What's sent](/trust#assistant).",
      },
      { k: "h", t: "Agenda templates" },
      {
        k: "p",
        t: "**Templates** on the Meetings page opens the drawer. A template is sections, checklist lines and bullets, plus blanks — `{{meeting_title}}`, `{{meeting_date}}`, `{{meeting_time}}`, `{{location}}` — filled in when a meeting is made from it. Make one the default and new meetings start from it. Editing a template never changes past meetings. Up to 50.",
      },
    ],
  },
  {
    slug: "attendance",
    categoryId: "week",
    icon: "check",
    aud: ["officer", "member"],
    title: "Taking attendance",
    hi: "attendance",
    blurb: "Live check-in from the room, marking a roll by hand, and how the percentage is built.",
    keywords: ["attendance", "roll call", "present", "absent", "mandatory", "percentage", "missed", "check-in", "check in"],
    who: "Opening check-in and marking a roll: Attendance. Tapping in: anyone.",
    lede: "Only events with Required attendance take a roll. Two ways to take it: open check-in and let people tap in, or mark it yourself.",
    cap: "The live check-in band on the dashboard. Members also get a bar that follows them onto every page.",
    body: [
      { k: "h", t: "Live check-in" },
      {
        k: "steps",
        items: [
          "On the dashboard, choose **Open check-in** and pick the event. Tonight's is picked for you; earlier ones are there for corrections.",
          "Members tap **I'm here** — on the dashboard, or from the bar that follows them onto any other page.",
          "The window lasts 60 minutes. **Close & record attendance** ends it sooner. Closing marks everyone who didn't tap in as absent; **Reopen check-in** is there if you closed too early.",
        ],
      },
      {
        k: "note",
        tone: "warn",
        h: "Closing is what counts the absences",
        t: "A member with no record for an event isn't counted for it at all. Until the window closes, everyone who hasn't tapped in has no record — so every percentage would read high. A window that times out closes itself.",
      },
      { k: "h", t: "By hand" },
      {
        k: "p",
        t: "Open the meeting on the Meetings page and choose **Take attendance**, or **Edit attendance** to correct it later. Correcting one person leaves everyone else's check-in alone.",
      },
      { k: "h", t: "How the percentage is built" },
      {
        k: "p",
        t: "For each required event, the people counted are everyone on the roster minus anyone exempt this term and anyone excused for that event. Present ÷ counted, added up across the term.",
      },
      {
        k: "note",
        tone: "info",
        h: "The excuse comes after the absence",
        t: "Mark the roll honestly on the night. An excuse is a separate request with its own decision — see [excuses and exemptions](/help/excuses-and-exemptions).",
      },
    ],
  },
  {
    slug: "excuses-and-exemptions",
    categoryId: "week",
    icon: "hand",
    aud: ["member", "officer"],
    title: "Excuses and exemptions",
    hi: "exemptions",
    blurb: "One event versus a whole term — two different things that people mix up constantly.",
    keywords: ["excuse", "exempt", "absence", "study abroad", "co-op", "inactive", "approve", "decline"],
    who: "Any member asks. Attendance decides excuses and sets exemptions.",
    lede: "An excuse forgives one absence. An exemption takes someone out of the roll for the whole term.",
    cap: "An excuse is one cell. An exemption takes the whole row out of the count — not 0%.",
    body: [
      {
        k: "table",
        head: ["", "What it is"],
        rows: [
          [
            "Excuse",
            "A member's request about **one required event**, with a reason — filed from the event on the Timeline, or by asking Ask Chapt. Someone with the Attendance permission approves or declines it, optionally with a note. A declined excuse can be sent again.",
          ],
          [
            "Exemption",
            "Set on a member's card by someone with the Attendance permission, for the active term: studying abroad, co-op or internship, inactive, or other, with an optional note. They leave every required event's roll and show as Exempt, not 0%.",
          ],
        ],
      },
      {
        k: "p",
        t: "Waiting excuses show under **Needs you** in the sidebar for whoever can decide them. An excuse filed by someone who holds the Attendance permission is approved automatically.",
      },
      {
        k: "note",
        tone: "good",
        h: "Why exemption isn't “excuse everything”",
        t: "Someone abroad shouldn't file twelve excuses, and shouldn't show up as a 0% crisis either. An exemption says *not counted*, which is different from *didn't come*.",
      },
    ],
  },
  {
    slug: "tasks-and-polls",
    categoryId: "week",
    icon: "box",
    aud: ["officer", "member"],
    title: "Tasks and polls",
    hi: "polls",
    blurb: "Assigning to a person, a role or everyone — and asking the chapter something.",
    keywords: ["tasks", "todo", "assign", "deadline", "everyone", "poll", "vote", "survey", "ballot"],
    who: "Creating: Tasks / Polls. Ticking your own task or voting: anyone assigned.",
    lede: "Both can target a **role** instead of a list of names, so they keep working when the people in that role change.",
    cap: "The two Everyone modes, and a ballot before you've voted.",
    body: [
      { k: "h", t: "Tasks" },
      {
        k: "p",
        t: "A title, an optional due date and notes, and who it's for: members, roles, or **Everyone**. A task with a due date shows on the Timeline as a deadline.",
      },
      {
        k: "table",
        head: ["Everyone, as…", "Means"],
        rows: [
          ["Every member does it", "Each person ticks off their own. It's done when everyone has."],
          [
            "One person does it",
            "Anyone can pick it up. The first to finish ticks it off for the chapter.",
          ],
        ],
      },
      { k: "h", t: "Polls" },
      {
        k: "list",
        items: [
          "A question, 2 to 10 options, an optional close date, and the voters — members and/or roles.",
          "Only assigned voters can vote. One choice each, changeable while the poll is open.",
          "Results stay hidden until you've voted or the poll closes. Whoever manages polls always sees them, plus who hasn't voted yet.",
          "Options lock once the first vote is in.",
          "Open polls also appear on each voter's dashboard, ready to vote on.",
        ],
      },
      {
        k: "note",
        tone: "info",
        h: "Both live inside the active term",
        t: "A due date or close date outside it is refused. See [terms](/help/first-term).",
      },
    ],
  },
  {
    slug: "calendar-subscription",
    categoryId: "week",
    icon: "cal",
    aud: ["member", "admin"],
    title: "Your events in your own calendar",
    hi: "own calendar",
    blurb: "Putting the org's events and deadlines in Google or Apple Calendar, kept up to date.",
    keywords: ["calendar", "google calendar", "apple calendar", "ical", "ics", "subscribe", "sync", "webcal"],
    who: "An org admin turns it on. Then anyone can add it.",
    lede: "Members can add your org's events and deadlines to Google or Apple Calendar, where they keep updating as you edit them here.",
    cap: "Two steps for an admin, once. Two steps for everyone else.",
    body: [
      { k: "where", path: ["Settings", "Operations", "Calendar subscription"] },
      {
        k: "steps",
        items: [
          "Choose your org's time zone.",
          "Choose **Turn on for members**. A check runs for about a minute and switches it on by itself.",
          "Anyone: Timeline → **Add to my calendar**.",
          "**Add to Google Calendar** (from a computer; it then syncs to your phone), or **Open in Apple Calendar** and choose Subscribe.",
        ],
      },
      {
        k: "note",
        tone: "warn",
        h: "Not available everywhere yet",
        t: "Calendar subscriptions are opening up org by org. If Settings says they aren't available for your organization yet, that's the reason — it isn't a switch you've missed.",
      },
      {
        k: "list",
        items: [
          "Programming events only appear once they're Confirmed. A finished task's deadline drops off.",
          "Google can take up to a day to refresh; Apple refreshes on its own schedule.",
          "If an admin pauses updates, events already in people's calendars stay but stop changing.",
          "If the link is replaced, add it again and remove the old one so nothing shows twice.",
          "**Add this event** on a single event works whether or not the subscription is on.",
        ],
      },
    ],
  },
  {
    slug: "service-hours",
    categoryId: "pages",
    icon: "heart",
    aud: ["member", "officer"],
    title: "Service hours",
    hi: "Service",
    blurb: "Service events, logging the hours, and the goal each member is measured against.",
    keywords: ["service", "hours", "volunteer", "community service", "log hours", "goal", "punch card"],
    who: "Service creates events and logs for others. Members log their own.",
    lede: "Service events, and the hours members put in at them. Each member's total counts toward the service-hour goal in Thresholds.",
    cap: "One hole per hour of the goal, punched as hours land.",
    body: [
      {
        k: "list",
        items: [
          "Officers with the Service permission create service events. They show on the Timeline as Community Service.",
          "After the event, **Log hours** records everyone who came. 0 hours is allowed.",
          "Members can **Log my hours** for an event themselves.",
          "Officers can correct or remove anyone's hours. Totals recalculate.",
        ],
      },
      {
        k: "note",
        tone: "warn",
        h: "Self-logged hours count straight away",
        t: "There's no review step for hours a member logs for themselves. Glance at each event's sheet afterwards.",
      },
      {
        k: "p",
        t: "The goal (default 10 hours) is in Settings → Operations → Thresholds. Falling short puts someone on Watch — see [standing](/help/standing).",
      },
    ],
  },
  {
    slug: "programming-board",
    categoryId: "pages",
    icon: "board",
    aud: ["officer"],
    title: "The Programming board",
    hi: "Programming",
    blurb: "Planning events from first idea to wrap-up, and when the chapter gets to see them.",
    keywords: ["programming", "events board", "idea", "planning", "confirmed", "wrap up", "event fields", "pipeline"],
    who: "Events permission.",
    lede: "Plan events in lanes. Nothing reaches the chapter's Timeline until it's Confirmed.",
    cap: "Each lane's cost, in the board's own words.",
    body: [
      {
        k: "table",
        head: ["Lane", "Needs"],
        rows: [
          ["Idea", "A title and a type."],
          ["Planning", "An owner — one person or one role. Still off the Timeline."],
          ["Confirmed", "A date and a real location. It now shows on everyone's Timeline."],
          [
            "Done",
            "It has to have been Confirmed first. Then wrap it up: what was spent, a 1–5 rating, and notes.",
          ],
        ],
      },
      {
        k: "p",
        t: "Events that have happened and still need a wrap-up show under **Needs you** in the sidebar. Moving a confirmed event back to Planning takes it off the Timeline.",
      },
      { k: "h", t: "Event fields" },
      { k: "where", path: ["Settings", "Operations", "Event fields"] },
      {
        k: "p",
        t: "The questions every event on the board answers, so a budget or a head count can be compared across the term. Ten are built in — Description, Budget, Attachment, Head count and Co-host start on; Point of contact, Setup time, Risk form, Dress code and Transportation start off. Rename them, add your own, or stop collecting one.",
      },
    ],
  },
  {
    slug: "parties",
    categoryId: "pages",
    icon: "ticket",
    aud: ["officer"],
    title: "Parties",
    hi: "Parties",
    blurb: "The night's details beforehand, the door and the roll afterwards.",
    keywords: ["party", "parties", "door", "wristband", "theme", "collab", "social", "wrap up"],
    who: "Parties permission.",
    lede: "Plan the night, then close it out with what came in at the door and who showed up.",
    cap: "The till receipt, and where each number goes.",
    body: [
      {
        k: "list",
        items: [
          "A name, date and time, **Open** (anyone with a wristband; door money counts) or **Closed** (members and their plus-ones), a theme and a collab org. It lands on the Timeline as a party.",
          "Afterwards, **wrap it up**: door revenue and expenses are required, notes are optional.",
          "If you can take attendance, you then tick off who came. It counts toward attendance only if the party is required.",
        ],
      },
      {
        k: "note",
        tone: "warn",
        h: "Door revenue reaches the Treasury; expenses don't",
        t: "A party's door revenue is added to the Treasury balance. Its expenses figure isn't subtracted — log that spending as expense transactions as well. See [how the Treasury works](/help/treasury-basics).",
      },
    ],
  },
  {
    slug: "instagram",
    categoryId: "pages",
    icon: "camera",
    aud: ["officer"],
    title: "The Instagram planner",
    hi: "Instagram",
    blurb: "A content calendar for posts — not a connection to Instagram.",
    keywords: ["instagram", "posts", "reel", "story", "carousel", "content calendar", "social media"],
    who: "Instagram permission.",
    lede: "Plan what goes up and when. ChaptOS doesn't connect to Instagram or post anything for you.",
    cap: "Stories, Reels and Carousels on their due dates. ✓ = marked posted.",
    body: [
      {
        k: "list",
        items: [
          "Each post is a Story, Reel or Carousel with a due date, optionally linked to the event it promotes.",
          "**Mark posted** when it's up.",
          "See the month at a glance.",
          "Ask Chapt can draft a post for you to approve.",
        ],
      },
      {
        k: "p",
        t: "The org's handle, shown on the page, is set in Settings → Identity → General by anyone with the Org settings permission.",
      },
    ],
  },
  {
    slug: "fundraisers",
    categoryId: "pages",
    icon: "cash",
    aud: ["officer", "member"],
    title: "Fundraisers",
    hi: "Fundraisers",
    blurb: "Three numbers: what the supplies cost, what came in, and what you made.",
    keywords: ["fundraiser", "bake sale", "car wash", "raffle", "drink sale", "supplies", "goal", "made"],
    who: "Everyone sees them. Planning and counting up need Fundraisers.",
    lede: "A fundraiser here is three numbers: supplies, what came in, and what you made. That's deliberately all.",
    cap: "The Fundraisers page's own three-step example.",
    body: [
      {
        k: "steps",
        items: [
          "**Plan it** — a name, a date, and optionally a time, a place and a goal. Name it “bake sale”, “car wash”, “raffle” or similar and it suggests a shopping list. Then list the supplies and what each cost.",
          "**Count up** after the day: one total for what came in.",
          "Made = came in − supplies.",
        ],
      },
      {
        k: "p",
        t: "It shows on the Timeline as Fundraising, and the sidebar nudges you when one is ready to count up.",
      },
      {
        k: "note",
        tone: "warn",
        h: "It never touches the Treasury",
        t: "Nothing here posts to the books. When the money's deposited, record it as an income transaction if you want it in your balance.",
      },
    ],
  },
  {
    slug: "ask-basics",
    categoryId: "ask",
    icon: "spark",
    aud: ["member"],
    title: "What to ask it",
    hi: "ask it",
    blurb: "Opening it, the questions it's actually good at, and how to phrase a date.",
    keywords: ["ask", "chat", "assistant", "ai", "cmd k", "search", "question"],
    who: "Anyone in the org.",
    lede: "Press **⌘K** (or Ctrl+K) anywhere in the app, or tap the Ask Chapt button. On a phone it opens as a full-height sheet. It answers from your org's live records.",
    cap: "It shows its working, then answers in rows you can open. Names and amounts are illustrative.",
    body: [
      { k: "h", t: "Questions it's good at" },
      {
        k: "list",
        items: [
          "“Who hasn't paid dues?”",
          "“What did we spend on formal last year?”",
          "“Who's missed three or more meetings this term?”",
          "“What's on the calendar for next week?”",
          "“How do I add a custom metric?” — it'll point you to the right screen.",
        ],
      },
      {
        k: "p",
        t: "It shows its working as it goes — the steps it's taking and what it consulted — and the rows in its answer open the record behind them, so you can check it rather than trust it.",
      },
      {
        k: "note",
        tone: "warn",
        h: "Say which month you mean",
        t: "A bare “the 14th” gets anchored to the month already in play in the conversation. If you've switched topics, say “March 14th”.",
      },
      {
        k: "note",
        tone: "info",
        h: "Your conversation stays in this browser",
        t: "History isn't stored on our servers. It lives in your browser, and **New** starts fresh.",
      },
      {
        k: "note",
        tone: "info",
        h: "No button?",
        t: "If Ask Chapt isn't switched on, its button simply doesn't appear.",
      },
    ],
  },
  {
    slug: "ask-what-it-sees",
    categoryId: "ask",
    icon: "eye",
    aud: ["member"],
    title: "What it can see",
    hi: "see",
    blurb: "Your org, what your seat can see in the app, and nothing past either line.",
    keywords: ["privacy", "ai", "data", "permissions", "training", "what does it know", "openai"],
    who: "Applies to everyone.",
    lede: "It reads your records through the same doors you'd use in the app: inside your organization, and inside what your seat can see.",
    cap: "Two boundaries. Neither is the model being polite.",
    body: [
      {
        k: "list",
        tone: "check",
        items: [
          "**Your org only.** It cannot read another organization's records — that's enforced by the database, not by asking the model nicely.",
          "**What you could see in the app.** Most records are open to every member — the roster, the calendar, the ledger, the Dues tab — so they're open to it too. The gated ones stay gated: join requests need Roster; exemptions need Attendance unless they're yours; other people's dues payments need Treasury; poll turnout needs Polls.",
          "**Live records.** A number it gives you is the number on the page right now.",
        ],
      },
      {
        k: "note",
        tone: "info",
        h: "What leaves the building",
        t: "Answering sends your question, a little of the recent conversation, and the results of the lookups it ran to OpenAI. We don't train any model on it; what OpenAI keeps is set by their API terms. The full account is in [Trust & privacy](/trust#assistant).",
      },
      {
        k: "note",
        tone: "warn",
        h: "It can be wrong inside those lines",
        t: "The boundaries are about *access*, not accuracy. See [when it gets something wrong](/help/ask-got-it-wrong).",
      },
    ],
  },
  {
    slug: "ask-approvals",
    categoryId: "ask",
    icon: "gavel",
    aud: ["member", "officer"],
    title: "When it wants to change something",
    hi: "change something",
    blurb: "The cards it drafts, why nothing is written until you approve, and what gets recorded.",
    keywords: ["approve", "proposal", "write", "change", "confirm", "approvals", "log dues", "card", "submit"],
    who: "Officer cards: the matching permission. Just-you cards: anyone.",
    lede: "Ask it to add a deadline or log a payment and it doesn't do it. It draws you a card of exactly what it would do, and waits.",
    cap: "An officer card and a just-you card, as Ask Chapt draws them.",
    body: [
      {
        k: "table",
        head: ["Card", "What it can do"],
        rows: [
          [
            "Officer actions",
            "Add a deadline, add a calendar event, log a transaction, record a dues payment, add an Instagram post, add a programming event. Only someone who holds the matching permission can **Approve** — if that's not you, the card names who can.",
          ],
          [
            "Just-you actions",
            "Submit an excuse, request a reimbursement, log your own service hours, mark your task done, cast your vote. These only ever touch your own record, and the button says **Submit**.",
          ],
        ],
      },
      {
        k: "list",
        tone: "check",
        items: [
          "**Nothing is written until you press it.** Discard writes nothing. There's no setting that turns this off.",
          "**It goes through the same checks as the button in the app**, so it can never do more than your own permissions allow.",
          "**Officer approvals are recorded** in the **Approvals** tab — what was approved, by whom, under which permission. Everyone in the org can read it.",
          "**The card is signed by the server when it's drafted**, so an altered card can't produce an approval record.",
        ],
      },
      {
        k: "note",
        tone: "good",
        h: "This is the whole safety model",
        t: "The assistant proposes and a permitted person decides. Nothing with a consequence happens on the model's say-so — the honest answer when someone asks whether “the AI can move money”.",
      },
    ],
  },
  {
    slug: "ask-got-it-wrong",
    categoryId: "ask",
    icon: "alert",
    aud: ["member"],
    title: "When it gets something wrong",
    hi: "wrong",
    blurb: "How to tell, what usually causes it, and what telling us actually does.",
    keywords: ["wrong", "hallucination", "incorrect", "feedback", "rating", "bad answer", "fix", "thumbs"],
    who: "Anyone.",
    lede: "It will be wrong sometimes. The design goal isn't an assistant that never errs — it's one where you can always see how it got there.",
    cap: "Three checks, in the order that finds most problems.",
    body: [
      {
        k: "steps",
        items: [
          "**Open the trace.** The steps it took are kept with the answer. Most mistakes are visible there — the wrong term, the wrong month.",
          "**Check the row.** Answers link to the records behind them. Open one: either the record is wrong or the answer is.",
          "**Rate it.** A thumbs up or down is recorded with the start of your question.",
        ],
      },
      { k: "h", t: "The usual causes, in order" },
      {
        k: "list",
        items: [
          "**The wrong term is active.** Most “that number is wrong” is a term boundary.",
          "**A bare date.** “The 14th” gets pinned to the month in play. Say the month.",
          "**The record really is wrong.** If nobody marked the roll for three weeks, no assistant can tell you who's at risk.",
        ],
      },
      {
        k: "note",
        tone: "info",
        h: "If it's badly wrong, tell a human",
        t: "A rating helps us; it doesn't get you an answer today. [Write to us](/contact) with what you asked and what it said.",
      },
    ],
  },
  {
    slug: "docs-library",
    categoryId: "record",
    icon: "folder",
    aud: ["member", "officer"],
    title: "The docs library",
    hi: "library",
    blurb: "Saved links in folders, pinning, and the difference between moving and reordering.",
    keywords: ["docs", "documents", "links", "folders", "bylaws", "pin", "drag", "sort", "library"],
    who: "Everyone browses. Docs permission to add, pin, move and delete.",
    lede: "The library is a set of saved links — the bylaws, the forms, the shared drive, the thing nobody can ever find — in folders, with the most-asked-for pinned to the top.",
    cap: "① Drop on a folder header to move. ② Drag within a section to reorder — the view flips to Manual.",
    body: [
      { k: "p", t: "Files themselves live wherever the link points; the library doesn't store uploads." },
      { k: "h", t: "Moving versus reordering" },
      {
        k: "list",
        items: [
          "**Move** a doc into a folder by dragging it onto the folder's header.",
          "**Reorder** by dragging within a section. The view switches to **Manual** so you can see the order you set.",
          "Dragging is off while a search or filter is narrowing the list.",
          "Sort by Manual, Newest, Name or Kind.",
        ],
      },
      { k: "h", t: "Pinning" },
      {
        k: "p",
        t: "Pin the four or five docs or folders people actually ask for. A library where the bylaws are pinned gets asked about the bylaws far less.",
      },
      {
        k: "note",
        tone: "info",
        h: "Saved links fetch a preview",
        t: "When a link is saved, we fetch the page once for its title and description, so the site sees a request from us. **Refresh preview** fetches it again.",
      },
      {
        k: "note",
        tone: "warn",
        h: "No export for the library",
        t: "The list of links doesn't export. See [getting your data out](/help/export-your-data).",
      },
    ],
  },
  {
    slug: "activity-log",
    categoryId: "record",
    icon: "timeline",
    aud: ["member"],
    title: "The activity log",
    hi: "activity log",
    blurb: "Who changed what, when — and the argument it's designed to end.",
    keywords: ["audit", "log", "history", "who changed", "activity", "trail", "accountability"],
    who: "Everyone in the org can read it.",
    lede: "Changes across the app write an entry: what changed, who did it, and when. It's the answer to “who deleted that” and, more often, the protection for whoever didn't.",
    cap: "Chronological, org-wide, permanent. Entries are illustrative.",
    body: [
      { k: "where", path: ["Settings", "System", "Activity log"] },
      { k: "p", t: "The dashboard's Activity card opens the same history." },
      {
        k: "note",
        tone: "good",
        h: "It mostly protects the officers",
        t: "It reads like surveillance and works like an alibi. The person who handles your money is the person a log with their name on every legitimate action helps most.",
      },
      {
        k: "note",
        tone: "info",
        h: "Entries aren't edited or pruned",
        t: "If someone is removed or deletes their account, their entries stay: the link to who did it is cleared, though a name written into an entry's text stays. [What that means for retention](/trust#retention).",
      },
    ],
  },
  {
    slug: "ending-a-term",
    categoryId: "record",
    icon: "refresh",
    aud: ["officer"],
    title: "Ending a term",
    hi: "Ending",
    blurb: "Starting the new term without losing the last one — and when to do it.",
    keywords: ["archive", "semester", "end of year", "transition", "new board", "rollover", "next term"],
    who: "Semesters permission.",
    lede: "Ending a term is starting the next one. Nothing is deleted; the old term just stops being the one in front of everyone.",
    cap: "Only one term is active. The rest stay on the shelf, fully readable.",
    body: [
      {
        k: "steps",
        items: [
          "Settings → Operations → Semesters → create the next term with its dates.",
          "That's it. It's active straight away, and the old term stays completely readable.",
        ],
      },
      {
        k: "p",
        t: "The dashboard starts clean because it shows the active term, not because the old one went anywhere. You can switch the active term back from the same screen, and you can ask Ask Chapt about it — “what did we spend on formal last year?”",
      },
      {
        k: "note",
        tone: "warn",
        h: "Don't create the next term early",
        t: "Creating a term makes it active immediately, so the current one stops being the default the moment you do. Do it at the changeover, or switch back afterwards.",
      },
      {
        k: "note",
        tone: "info",
        h: "If nobody does it",
        t: "When the active term's end date passes, the app locks with “Your semester has ended” until someone extends it or starts the next one. See [the term screen](/help/first-term).",
      },
    ],
  },
  {
    slug: "signing-in",
    categoryId: "account",
    icon: "key",
    aud: ["member"],
    title: "Signing in",
    hi: "Signing in",
    blurb: "Google, and only Google — plus what to do when you can't reach your org.",
    keywords: ["login", "sign in", "google", "password", "oauth", "cant log in", "locked out", "invite required"],
    who: "Anyone.",
    lede: "There's no password to make, forget, reuse or leak. You sign in with Google, and that account is your identity everywhere in the app.",
    cap: "The four reasons, most common first.",
    body: [
      {
        k: "note",
        tone: "warn",
        h: "Use the same Google account every time",
        t: "Your personal Gmail and your university account are two different people as far as the app is concerned. If you joined with one and sign in with the other, you'll look like a stranger.",
      },
      {
        k: "list",
        items: [
          "**Wrong account.** Check which Google account you're using.",
          "**Your request hasn't been approved yet**, or was declined. Open your invite link again — it tells you which. See [joining](/help/join-an-org).",
          "**You left, or were removed.** Coming back needs a new invite link and an officer's approval.",
          "**“Invite required”** means that account isn't a member of that org. You need an invite link from someone in it.",
        ],
      },
      {
        k: "p",
        t: "If none of those fit, [tell a human](/contact) — include the email address you're signing in with.",
      },
    ],
  },
  {
    slug: "multiple-orgs",
    categoryId: "account",
    icon: "swap",
    aud: ["member"],
    title: "Being in more than one org",
    hi: "more than one",
    blurb: "One login, several workspaces, each with its own roster entry for you.",
    keywords: ["multiple", "switch", "two orgs", "several", "membership", "another chapter"],
    who: "Anyone.",
    lede: "One Google account, as many organizations as you belong to. Switching between them is a menu, not a second login.",
    cap: "The switcher at the top of the sidebar, and one person's two separate roster entries.",
    body: [
      {
        k: "p",
        t: "Switch orgs from the org name at the top of the sidebar. Each org is a separate workspace with its own roster, money, roles and records — the isolation is enforced at the database. Your permissions are per org too: you can be president of one and an ordinary member of another.",
      },
      {
        k: "p",
        t: "Your roster place is per org as well — its own dues, attendance, GPA, service hours, office and name. Nothing an officer records about you in one org is visible to, or editable from, another. Leaving one org leaves the others untouched.",
      },
    ],
  },
  {
    slug: "leaving-or-deleting",
    categoryId: "account",
    icon: "door",
    aud: ["member", "admin"],
    title: "Leaving an org, or deleting your account or the org",
    hi: "deleting",
    blurb: "Three different exits, and exactly what each one destroys.",
    keywords: ["leave", "delete", "delete account", "quit", "close account", "remove org", "shut down", "erase"],
    who: "Leave / delete your account: you. Delete the org: an org admin.",
    lede: "Leaving, deleting your account and deleting the org are three different things with three different blast radii. Pick deliberately.",
    cap: "Small, medium, large. Only the first can be undone (by being invited back).",
    body: [
      {
        k: "table",
        head: ["Action", "What it does"],
        rows: [
          [
            "**Leave an org**",
            "Profile menu → Leave, or Settings → Membership → Accounts. Drops your membership and roles in that org; your records stay with them. Coming back needs a new invite and approval. Refused if you're its last admin.",
          ],
          [
            "**Delete your account**",
            "Settings → Membership → Accounts → Delete account, then type DELETE. Erases your login and removes you from every org — attendance, dues lines, hours, receipts and the rest. Money you paid stays on the books without your name. Refused while you're the last admin of any org, even one where you're the only member: delete that org first.",
          ],
          [
            "**Delete the org**",
            "An org admin, at the bottom of Settings → Identity → General, types the org's exact name. Everything the org holds goes, in one transaction.",
          ],
        ],
      },
      {
        k: "note",
        tone: "flag",
        h: "Deleting is not reversible",
        t: "Deleting an account or an org has no undo and no grace period. [Export what you need](/help/export-your-data) first.",
      },
      {
        k: "note",
        tone: "info",
        h: "Deleting an org doesn't delete people with somewhere else to be",
        t: "Anyone who belongs to another org keeps their account there.",
      },
    ],
  },
  {
    slug: "turn-pages-on-and-off",
    categoryId: "account",
    icon: "rail",
    aud: ["officer"],
    title: "Turning pages on and off",
    hi: "on and off",
    blurb: "Showing only the pages your org uses, and the dashboard widgets inside them.",
    keywords: ["workflows", "pages", "sidebar", "hide", "nav", "reorder", "simplify", "modules", "widgets", "kpi"],
    who: "Org settings permission.",
    lede: "Most orgs need about half of what's here. Hiding the rest is one screen, and it's the single highest-value thing a new admin can do.",
    cap: "Pages on the left, widgets on the right. Turning off a headline number also stops tracking it.",
    body: [
      { k: "where", path: ["Settings", "Operations", "Workflows"] },
      {
        k: "list",
        items: [
          "Turn a whole page on or off. **Dashboard and Timeline are always on**; everything else can be hidden.",
          "Turn off dashboard widgets you don't use — the announcement, the four headline numbers, the health widget, On your plate, member tracking.",
          "Reorder the sidebar within each group — here, or by dragging items in the sidebar itself.",
        ],
      },
      {
        k: "note",
        tone: "warn",
        h: "A headline number is also a tracking switch",
        t: "Turning off the Attendance, Dues, GPA or Service Hours number also stops tracking it: it leaves the roster and stops affecting anyone's [standing](/help/standing).",
      },
      {
        k: "note",
        tone: "good",
        h: "Turning something off never deletes it",
        t: "Hidden means hidden. Turn Service back on in March and every hour logged before is still there.",
      },
    ],
  },
  {
    slug: "arrange-dashboard",
    categoryId: "account",
    icon: "grip",
    aud: ["officer"],
    title: "Arranging the dashboard",
    hi: "dashboard",
    blurb: "One layout for the whole org — and what On your plate shows.",
    keywords: ["dashboard", "arrange", "customize", "layout", "widgets", "cards", "on your plate"],
    who: "Org settings permission.",
    lede: "Everyone in the org sees the same dashboard. Anyone with the Org settings permission can arrange it.",
    cap: "Arrange mode: drag cards, put some away, pull optional ones from the tray.",
    body: [
      {
        k: "steps",
        items: [
          "On the dashboard, choose **Arrange**.",
          "Drag cards into the order you want, and put away the ones you don't. Optional cards — money, dues, grades, service, Instagram, and one per custom metric — wait in the tray until you add them.",
          "Save.",
        ],
      },
      {
        k: "list",
        items: [
          "There's no per-person layout.",
          "A card for a page that's turned off doesn't appear. Turn the page back on and the card comes back where you left it.",
          "Some cards have a fixed place: they can be put away, not moved. The pinned note can also sit in the wide spot at the top.",
        ],
      },
      { k: "h", t: "On your plate" },
      {
        k: "p",
        t: "Everything waiting on whoever's looking: their tasks, votes and dues — plus late deadlines, wrap-ups, dues and reimbursements for officers who can act on them.",
      },
    ],
  },
  {
    slug: "rename-the-words",
    categoryId: "account",
    icon: "pencil",
    aud: ["officer"],
    title: "Renaming the words the app uses",
    hi: "words",
    blurb: "Say chapter, or crew, or section — the app doesn't care which.",
    keywords: ["vocabulary", "rename", "wording", "terminology", "brother", "member", "language"],
    who: "Org settings permission.",
    lede: "A sorority, a marching band and a robotics team do not use the same nouns. Swap them once and the app follows.",
    cap: "Sidebar labels and page headings follow as soon as you save.",
    body: [
      { k: "where", path: ["Settings", "Identity", "Vocabulary"] },
      {
        k: "table",
        head: ["Group", "Words"],
        rows: [
          ["People", "Member, Admin, Role"],
          ["Features", "Treasury, Dues, Meetings, Service, Attendance, Announcement, Doc"],
          ["Time", "Period (your term), Event"],
        ],
      },
      {
        k: "note",
        tone: "warn",
        h: "Ask Chapt doesn't use them yet",
        t: "The assistant can still say the default words — “brothers”, “semester” — in its answers.",
      },
    ],
  },
  {
    slug: "appearance",
    categoryId: "account",
    icon: "moon",
    aud: ["member"],
    title: "Light and dark",
    hi: "dark",
    blurb: "Choosing how the app looks on your device.",
    keywords: ["dark mode", "light mode", "theme", "appearance", "system"],
    who: "Anyone. Saved per device.",
    lede: "Your profile menu → **Appearance** → Dark, Light or System.",
    cap: "The profile menu's Appearance sheet. Try the sun and moon at the bottom of this sidebar.",
    body: [
      {
        k: "p",
        t: "It's saved in this browser, so each device remembers its own choice. System follows your device's setting as it changes.",
      },
    ],
  },
  {
    slug: "what-you-pay",
    categoryId: "billing",
    icon: "cash",
    aud: ["admin"],
    title: "What this costs",
    hi: "costs",
    blurb: "One price per org, set by headcount. Free to four, $25/month to fifty.",
    keywords: ["price", "pricing", "cost", "plan", "subscription", "free", "how much", "billing", "$"],
    who: "Billing is only visible to org admins.",
    lede: "One price for the whole organization, decided by how many people are on it. Not per person, not per term, and not a smaller product at the lower prices.",
    cap: "Four bands. Every feature is in every one.",
    body: [
      { k: "p", t: "There are two ways to pay:" },
      {
        k: "list",
        items: [
          "**Automatic** — the price follows your member count. Adding a card while you're at four or fewer charges nothing until the fifth person.",
          "**Choose a plan** — Standard ($25, up to 50) or Pro ($65, up to 120). It starts charging straight away and stays put as the roster changes; removing members doesn't lower it. You can't pick a plan smaller than your current count, and switching down takes effect at renewal.",
        ],
      },
      { k: "h", t: "Every feature is on every plan" },
      {
        k: "p",
        t: "There is no feature locked behind a higher price, and no screen that asks you to upgrade to see something. The price only tracks how many of you there are.",
      },
      {
        k: "note",
        tone: "info",
        h: "Two different kinds of money",
        t: "This is what your org pays *us*. It has nothing to do with the dues and books you keep inside the app.",
      },
      { k: "where", path: ["Settings", "System", "Billing"] },
    ],
  },
  {
    slug: "member-limit",
    categoryId: "billing",
    icon: "lock",
    aud: ["admin", "officer"],
    title: "What happens when you hit the limit",
    hi: "the limit",
    blurb: "The one thing that stops, and the many things that don't.",
    keywords: ["limit", "cap", "full", "can't add", "at capacity", "402", "blocked", "seat", "maximum"],
    who: "Only an org admin can clear it.",
    lede: "Growing past what you're paying for blocks exactly one thing: letting the next person in. Everything you already have keeps working.",
    cap: "The gate only ever blocks growth.",
    body: [
      { k: "h", t: "Clearing it" },
      {
        k: "steps",
        items: [
          "An org admin opens Settings → Billing.",
          "Choose a plan, or add a card for automatic billing.",
          "Once payment is confirmed, approve the waiting request. A chosen plan stops approvals again at its own capacity until you pick a bigger one.",
        ],
      },
      {
        k: "note",
        tone: "warn",
        h: "Only an org admin can clear it",
        t: "Billing belongs to org admins, not to a permission you can hand out. A treasurer running the chapter's money can't add the card.",
      },
      {
        k: "note",
        tone: "info",
        h: "Above 120 people it needs a conversation",
        t: "Past that size the page asks for a quote instead of a card. [Talk to us](/contact).",
      },
    ],
  },
  {
    slug: "paying-and-invoices",
    categoryId: "billing",
    icon: "envelope",
    aud: ["admin"],
    title: "Cards, invoices and failed payments",
    hi: "failed payments",
    blurb: "Where the card lives, how to get receipts, and what a declined payment does.",
    keywords: ["card", "invoice", "receipt", "payment", "stripe", "portal", "past due", "declined", "failed"],
    who: "Org admin.",
    lede: "Payment is handled by Stripe end to end. We never see or store your card.",
    cap: "What the Billing page shows when a payment fails.",
    body: [
      { k: "where", path: ["Settings", "System", "Billing", "Manage billing"] },
      {
        k: "p",
        t: "That opens Stripe's own portal: change the card, download past invoices, update the billing address. When a payment fails, the button reads **Update payment method**. Stripe handles retries and payment emails.",
      },
      {
        k: "list",
        tone: "check",
        items: [
          "Nobody is removed and nothing is deleted.",
          "Every existing member keeps working access.",
          "You can't approve new members until it's resolved — same rule as the member limit.",
        ],
      },
      {
        k: "note",
        tone: "info",
        h: "Who gets the emails",
        t: "Stripe emails the address on the billing account — the person who set it up. If they've graduated, change it in the portal before it matters.",
      },
    ],
  },
  {
    slug: "cancelling",
    categoryId: "billing",
    icon: "x",
    aud: ["admin"],
    title: "Cancelling",
    hi: "Cancelling",
    blurb: "How to stop paying, what you keep, and what the free plan means afterwards.",
    keywords: ["cancel", "stop paying", "downgrade", "unsubscribe", "refund", "end subscription", "resume"],
    who: "Org admin.",
    lede: "Cancelling takes a couple of clicks, doesn't need an email to anyone, and doesn't take your records with it.",
    cap: "Cancel today, keep everything, change your mind any time before renewal.",
    body: [
      {
        k: "steps",
        items: [
          "An org admin opens Settings → Billing and chooses **Cancel subscription**, then **Confirm cancellation**. (Stripe's portal, under Manage billing, can do it too.)",
          "Until your renewal date nothing changes — **Resume subscription** on the same page keeps it going.",
          "After that date the org is back on the free allowance. Every record stays; exports keep working.",
        ],
      },
      {
        k: "note",
        tone: "warn",
        h: "The free allowance is four",
        t: "Nobody is removed — 40 people stay 40 people with full access. But approving anyone past four needs a subscription again.",
      },
      {
        k: "note",
        tone: "info",
        h: "Cancelling is not deleting",
        t: "If you want the organization gone, that's a separate action — see [leaving or deleting](/help/leaving-or-deleting).",
      },
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
 * pointing at the article that unblocks them. The sticky notes under the search.
 */
export const QUICK_PATHS: { slug: string; label: string; hint: string; icon: PaperIconName; tint: Tint }[] = [
  {
    slug: "set-up-your-org",
    label: "I'm setting one up",
    hint: "From nothing to a workspace your board will open.",
    icon: "plant",
    tint: "butter",
  },
  {
    slug: "join-an-org",
    label: "I was sent a link",
    hint: "What the invite does, and why you wait for approval.",
    icon: "hand",
    tint: "sky",
  },
  {
    slug: "first-term",
    label: "It won't let me past a screen",
    hint: "Almost always the term. Here's the thirty-second fix.",
    icon: "clock",
    tint: "peach",
  },
];

/** "Through a term": four stops, each with the articles you need there. */
export const JOURNEY: { t: string; s: string; tint: Tint; items: string[] }[] = [
  {
    t: "Day one",
    s: "Getting the org standing",
    tint: "butter",
    items: ["set-up-your-org", "invite-people", "join-requests", "roles-and-permissions"],
  },
  {
    t: "Every week",
    s: "The rhythm of a term",
    tint: "sky",
    items: ["meetings-and-minutes", "attendance", "dues", "tasks-and-polls"],
  },
  {
    t: "When it's stuck",
    s: "Walls that aren't bugs",
    tint: "peach",
    items: ["first-term", "member-limit", "ask-got-it-wrong", "signing-in"],
  },
  {
    t: "End of term",
    s: "Handing it on",
    tint: "mint",
    items: ["ending-a-term", "remove-someone", "export-your-data", "activity-log"],
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
  /** title + blurb + keywords + category, lowercased. A hit here ranks high. */
  head: string;
  /** The lede, the "who can" line and the full body prose. A hit here ranks lower. */
  body: string;
}

/** Built once at module scope. Small enough to search on every keystroke. */
export const SEARCH_INDEX: SearchRow[] = ARTICLES.map(a => ({
  slug: a.slug,
  head: [a.title, a.blurb, a.keywords.join(" "), CATEGORIES_BY_ID.get(a.categoryId)!.title].join(" ").toLowerCase(),
  body: [a.lede, a.who, ...a.body.map(blockText)].join(" ").toLowerCase(),
}));
