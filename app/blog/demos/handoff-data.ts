// The made-up chapter's library and board, shared by the handoff post's demos.
// Same people as ./roster.ts. No real members, ever.

export type Kind = "doc" | "sheet" | "form" | "drive" | "link";
export const KIND_LABEL: Record<Kind, string> = { doc: "Doc", sheet: "Sheet", form: "Form", drive: "Drive", link: "Link" };
export const KIND_HOST: Record<Kind, string> = {
  doc: "docs.google.com", sheet: "docs.google.com", form: "forms.gle", drive: "drive.google.com", link: "docusign.net",
};

/** Kind glyphs, the paths app/[slug]/docs/lib.tsx draws. */
export const KIND_PATH: Record<Kind, string> = {
  doc: "M14 3v4a1 1 0 001 1h4M5 3h9l5 5v11a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z",
  sheet: "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14",
  form: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  drive: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z",
  link: "M13.83 10.17a4 4 0 00-5.66 0l-4 4a4 4 0 105.66 5.66l1.1-1.1m-.76-4.9a4 4 0 005.66 0l4-4a4 4 0 00-5.66-5.66l-1.1 1.1",
};

export type Folder = { id: string; name: string; c: string };
/** Per-folder pastels, as the paper Docs page assigns them. */
export const FOLDERS: Folder[] = [
  { id: "bylaws", name: "Bylaws & handbook", c: "var(--sky)" },
  { id: "money", name: "Treasury", c: "var(--mint)" },
  { id: "rush", name: "Recruitment", c: "var(--peach)" },
  { id: "events", name: "Events", c: "var(--rose)" },
];

export type LibDoc = { id: string; title: string; note: string; kind: Kind; folder: string | null; pinned?: boolean; by: string };
export const LIBRARY: LibDoc[] = [
  { id: "bylaws", title: "Bylaws (2024 revision)", note: "Ratified Apr 2024. Article IV covers elections.", kind: "doc", folder: "bylaws", pinned: true, by: "Jordan" },
  { id: "handbook", title: "Officer handbook", note: "One page per seat. Update yours before you hand it over.", kind: "doc", folder: "bylaws", pinned: true, by: "Priya" },
  { id: "dues", title: "Dues tracker", note: "Fall dues, payment plans, who's waived.", kind: "sheet", folder: "money", pinned: true, by: "Andre" },
  { id: "risk", title: "Risk management policy", note: "Read before any event with a guest list.", kind: "doc", folder: "bylaws", by: "Jordan" },
  { id: "budget", title: "Fall budget", note: "Approved Sep 14.", kind: "sheet", folder: "money", by: "Andre" },
  { id: "reimb", title: "Reimbursement form", note: "Receipts within two weeks.", kind: "form", folder: "money", by: "Andre" },
  { id: "rushplan", title: "Rush week plan", note: "Night-by-night, with who runs each table.", kind: "doc", folder: "rush", by: "Sam" },
  { id: "interest", title: "Interest form", note: "Links from the tabling QR code.", kind: "form", folder: "rush", by: "Sam" },
  { id: "contract", title: "Grand Hall contract", note: "Formal venue. Deposit paid, final count due Nov 1.", kind: "link", folder: "events", by: "Sam" },
  { id: "formal", title: "Formal checklist", note: "", kind: "sheet", folder: "events", by: "Sam" },
  { id: "photos", title: "Spring formal photos", note: "", kind: "drive", folder: null, by: "Tyler" },
  { id: "alumni", title: "Alumni contact list", note: "For the spring dinner invites.", kind: "sheet", folder: null, by: "Jordan" },
  { id: "quiz", title: "New member quiz", note: "", kind: "form", folder: null, by: "Priya" },
];

// ─── the board ───────────────────────────────────────────────────────────────

export type Person = { name: string; tone: string };
export const P = {
  jordan: { name: "Jordan Reyes", tone: "var(--sky)" },
  andre: { name: "Andre Whitfield", tone: "var(--mint)" },
  priya: { name: "Priya Nair", tone: "var(--rose)" },
  sam: { name: "Sam Okafor", tone: "var(--butter)" },
  noah: { name: "Noah Kim", tone: "var(--lilac)" },
  eli: { name: "Eli Turner", tone: "var(--peach)" },
  marcus: { name: "Marcus Bell", tone: "var(--sky)" },
  tyler: { name: "Tyler Brooks", tone: "var(--mint)" },
} satisfies Record<string, Person>;
export type Who = keyof typeof P;

export const initials = (name: string) => name.split(/\s+/).map(s => s[0]).join("").slice(0, 2).toUpperCase();
export const first = (name: string) => name.split(" ")[0];

export type Seat = {
  id: string; role: string; c: string; holder: Who;
  can: string[];
  tasks: { t: string; due: string }[];
};
export const SEATS: Seat[] = [
  {
    id: "pres", role: "President", c: "var(--sky)", holder: "jordan",
    can: ["Approve join requests", "Manage roles", "Start a new term"],
    tasks: [{ t: "Book the spring retreat", due: "Dec 20" }, { t: "Send the national report", due: "Jan 8" }],
  },
  {
    id: "treas", role: "Treasurer", c: "var(--mint)", holder: "andre",
    can: ["Treasury & the ledger", "Charge and waive dues"],
    tasks: [{ t: "Reconcile December", due: "Jan 5" }, { t: "Send the spring dues reminder", due: "Jan 10" }, { t: "Pay the retreat deposit", due: "Jan 12" }],
  },
  {
    id: "sec", role: "Secretary", c: "var(--rose)", holder: "priya",
    can: ["Take attendance", "Arrange Docs", "Post announcements"],
    tasks: [{ t: "Post the last minutes of fall", due: "Dec 8" }],
  },
  {
    id: "social", role: "Social chair", c: "var(--butter)", holder: "sam",
    can: ["Plan events", "Run parties"],
    tasks: [{ t: "Send the spring theme poll", due: "Jan 15" }, { t: "Book a venue for spring formal", due: "Jan 30" }],
  },
];
/** Who's running for each seat. */
export const INCOMING: Record<string, Who[]> = {
  pres: ["marcus", "noah"],
  treas: ["noah", "eli", "tyler"],
  sec: ["eli", "tyler"],
  social: ["tyler", "marcus", "eli"],
};
