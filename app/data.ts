// ─── Types ────────────────────────────────────────────────────────────────────

export type BrotherStatus = "Good" | "Watch" | "At Risk";
export type TaskStatus = "Upcoming" | "Due Soon" | "Urgent" | "Complete";
export type CalEventCategory = "chapter" | "social" | "fundy" | "program" | "party" | "deadline" | "service";
export type CalLayer = "all" | "mandatory" | "deadlines" | "parties" | "service";

export type IncomeCategory = "Door" | "Dues" | "Fines" | "Fundraiser" | "Event" | "Alumni donation" | "External / misc";
export type ExpenseCategory = "Party Supplies" | "Operations" | "Brotherhood" | "Events" | "House" | "Travel" | "Misc";
export type PaymentMethod = "venmo" | "cash" | "check" | "invoice";

export const INCOME_CATEGORIES: IncomeCategory[] = ["Door", "Dues", "Fines", "Fundraiser", "Event", "Alumni donation", "External / misc"];
export const EXPENSE_CATEGORIES: ExpenseCategory[] = ["Party Supplies", "Operations", "Brotherhood", "Events", "House", "Travel", "Misc"];
export const PAYMENT_METHODS: PaymentMethod[] = ["venmo", "cash", "check", "invoice"];

export interface Transaction {
  id: number;
  type: "income" | "expense";
  category: string;
  amount: number;
  date: string;
  description: string;
  paymentMethod?: string;
  paidTo?: string;
  semester?: string;
  status?: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Brother {
  id: number;
  name: string;
  role: string;
  attendance: number;
  duesOwed: number;
  gpa: number;
  serviceHours: number;
  avatarUrl?: string | null;
  roles?: { id: number; name: string; color: string | null; rank: number }[];
  /** Per-member values for org-defined custom fields. Absent on old cached data — treat as {}. */
  customFields?: Record<string, string | number | null>;
}

export interface Deadline {
  id: number;
  title: string;
  dueDate: string;
  owner: string;
  status: TaskStatus;
}

export interface InstagramTask {
  id: number;
  title: string;
  dueDate: string;
  owner: string;
  status: TaskStatus;
  type: string;
}

export interface ProgrammingChecklistItem {
  id: number;
  label: string;
  done: boolean;
  sortOrder: number;
}

export interface ProgrammingTask {
  id: number;
  title: string;
  dueDate: string | null;
  location: string;
  time?: string | null;
  status: TaskStatus;
  type: string;
  stage: "idea" | "planning" | "confirmed" | "done";
  collab: string | null;
  owner: string;
  description: string | null;
  itineraryUrl: string | null;
  roomStatus: "na" | "not_submitted" | "submitted" | "confirmed";
  flyerPosted: boolean;
  socialsMeeting: boolean;
  spendingCents: number;
  successRating: number | null;
  wrapUpNotes: string | null;
  docCount: number;
  checklist: ProgrammingChecklistItem[];
}

export interface PartyEvent {
  id: number;
  name: string;
  date: string;
  partyType: "Open" | "Closed";
  theme: string;
  collabOrg: string;
  doorRevenue: number;
  attendance: number;
  expenses: number;
  notes: string;
  completed: boolean;
  completedAt: string | null;
}

export interface CalendarEvent {
  id: number;
  title: string;
  date: string;
  time?: string;
  category: CalEventCategory;
  mandatory: boolean;
  description?: string;
  location?: string;
  notesSummary?: string | null;
  notesSummaryAt?: string | null;
  notesUpdatedAt?: string | null;
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

// Canonical default cutoffs now live in lib/thresholds.ts so server code can
// import them without reaching into app/. Re-exported here under the historical
// name so existing `import { THRESHOLDS } from "../data"` call sites keep working
// as the app-wide fallback. Per-org overrides flow through useThresholds() /
// resolveThresholds() and are passed explicitly to the helpers below.
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/thresholds";
export type { Thresholds } from "@/lib/thresholds";
export const THRESHOLDS = DEFAULT_THRESHOLDS;

// ─── Mock Data ────────────────────────────────────────────────────────────────

export const brothers: Brother[] = [
  { id: 1,  name: "Arijit Das",         role: "VP External · PD",                         attendance: 78, duesOwed: 0,   gpa: 3.4, serviceHours: 8  },
  { id: 2,  name: "Bryan Lee",           role: "President · Rush · Banquet",               attendance: 95, duesOwed: 0,   gpa: 3.7, serviceHours: 15 },
  { id: 3,  name: "Issac Chong",         role: "Treasurer · Banquet · Social",             attendance: 88, duesOwed: 0,   gpa: 3.5, serviceHours: 12 },
  { id: 4,  name: "Noah Kim",            role: "VP Internal · Social",                     attendance: 82, duesOwed: 75,  gpa: 3.2, serviceHours: 10 },
  { id: 5,  name: "Jacob Hwang",         role: "Programming · Alumni",                     attendance: 68, duesOwed: 0,   gpa: 2.8, serviceHours: 5  },
  { id: 6,  name: "Nathaniel Baccarey",  role: "Stroll · Rush",                            attendance: 58, duesOwed: 150, gpa: 2.6, serviceHours: 3  },
  { id: 7,  name: "Dariel Milfort",      role: "PR · Community Service",                   attendance: 92, duesOwed: 0,   gpa: 3.6, serviceHours: 20 },
  { id: 8,  name: "Rinchen Sherpalama",  role: "Academic · Programming · Fundraising",     attendance: 87, duesOwed: 0,   gpa: 3.9, serviceHours: 14 },
  { id: 9,  name: "Elvin De La Cruz",    role: "Brotherhood · Fundraising",                attendance: 74, duesOwed: 75,  gpa: 3.1, serviceHours: 7  },
  { id: 10, name: "Thalha Thabish",      role: "Secretary · Social · PR · Rush",           attendance: 90, duesOwed: 0,   gpa: 3.3, serviceHours: 11 },
];

export const deadlines: Deadline[] = [
  { id: 1, title: "Nationals Chapter Fee Deadline",  dueDate: "2026-06-01", owner: "Bryan Lee",          status: "Upcoming"  },
  { id: 2, title: "Risk Management Form Submission", dueDate: "2026-05-16", owner: "Noah Kim",           status: "Due Soon"  },
  { id: 3, title: "Spring Roster Update",            dueDate: "2026-05-25", owner: "Thalha Thabish",     status: "Upcoming"  },
  { id: 4, title: "Banquet Planning Final Submission",dueDate: "2026-05-14", owner: "Issac Chong",       status: "Urgent"    },
  { id: 5, title: "Brotherhood Event Proposal",      dueDate: "2026-06-10", owner: "Elvin De La Cruz",   status: "Upcoming"  },
  { id: 6, title: "Academic Standing Report",        dueDate: "2026-05-13", owner: "Rinchen Sherpalama", status: "Urgent"    },
  { id: 7, title: "IFC Chapter Report",              dueDate: "2026-06-15", owner: "Bryan Lee",          status: "Upcoming"  },
];

export const instagramTasks: InstagramTask[] = [
  { id: 1, title: "Rush Interest Post",      dueDate: "2026-05-13", owner: "Dariel Milfort",     status: "Urgent",   type: "Feed Post"   },
  { id: 2, title: "Meet the Bros Reel",      dueDate: "2026-05-18", owner: "Dariel Milfort",     status: "Due Soon", type: "Reel"        },
  { id: 3, title: "Spring Formal Flyer Drop",dueDate: "2026-05-14", owner: "Thalha Thabish",     status: "Urgent",   type: "Story + Feed"},
  { id: 4, title: "Community Service Recap", dueDate: "2026-05-22", owner: "Dariel Milfort",     status: "Upcoming", type: "Carousel"    },
  { id: 5, title: "Banquet Promo Post",      dueDate: "2026-05-24", owner: "Arijit Das",         status: "Upcoming", type: "Feed Post"   },
  { id: 6, title: "Stroll Practice Recap",   dueDate: "2026-05-28", owner: "Nathaniel Baccarey", status: "Upcoming", type: "Reel"        },
];

export const partyEvents: PartyEvent[] = [
  { id: 1, name: "Spring Rush Social",      date: "2026-02-14", partyType: "Open",   theme: "Casual",       collabOrg: "",    doorRevenue: 580, attendance: 94,  expenses: 120, notes: "Strong turnout from rush candidates",   completed: true,  completedAt: "2026-02-15T04:00:00.000Z" },
  { id: 2, name: "Kickback Night",          date: "2026-02-28", partyType: "Closed", theme: "Chill Vibes",  collabOrg: "",    doorRevenue: 420, attendance: 67,  expenses: 80,  notes: "Brothers-only mixer",                  completed: true,  completedAt: "2026-03-01T04:00:00.000Z" },
  { id: 3, name: "LPE × KDF Collab",        date: "2026-03-15", partyType: "Open",   theme: "Black & Gold", collabOrg: "KDF", doorRevenue: 750, attendance: 142, expenses: 200, notes: "Best collab event of the semester",     completed: true,  completedAt: "2026-03-16T04:00:00.000Z" },
  { id: 4, name: "Brotherhood Mixer",       date: "2026-04-05", partyType: "Closed", theme: "Fundraiser",   collabOrg: "",    doorRevenue: 320, attendance: 52,  expenses: 95,  notes: "Fundraising focus",                    completed: true,  completedAt: "2026-04-06T04:00:00.000Z" },
  { id: 5, name: "Spring Formal Pre-Party", date: "2026-04-26", partyType: "Open",   theme: "All White",    collabOrg: "",    doorRevenue: 890, attendance: 178, expenses: 310, notes: "Highest revenue event this semester",   completed: true,  completedAt: "2026-04-27T04:00:00.000Z" },
  { id: 6, name: "End of Year Kickback",    date: "2026-06-07", partyType: "Closed", theme: "",             collabOrg: "",    doorRevenue: 0,   attendance: 0,   expenses: 0,   notes: "",                                     completed: false, completedAt: null },
  { id: 7, name: "Summer Collab Night",     date: "2026-06-21", partyType: "Open",   theme: "",             collabOrg: "DSP", doorRevenue: 0,   attendance: 0,   expenses: 0,   notes: "",                                     completed: false, completedAt: null },
];

export const calendarEvents: CalendarEvent[] = [
  // ── Chapter meetings ──────────────────────────────────────────────────────
  { id: 101, title: "Chapter Meeting",         date: "2026-05-12", time: "7:00 PM", category: "chapter",  mandatory: true,  location: "Chapter Room" },
  { id: 102, title: "Chapter Meeting",         date: "2026-05-19", time: "7:00 PM", category: "chapter",  mandatory: true,  location: "Chapter Room" },
  { id: 103, title: "Chapter Meeting",         date: "2026-05-26", time: "7:00 PM", category: "chapter",  mandatory: true,  location: "Chapter Room" },
  { id: 104, title: "Chapter Meeting",         date: "2026-06-02", time: "7:00 PM", category: "chapter",  mandatory: true,  location: "Chapter Room" },
  { id: 105, title: "Chapter Meeting",         date: "2026-06-09", time: "7:00 PM", category: "chapter",  mandatory: true,  location: "Chapter Room" },

  // ── Social / mandatory ────────────────────────────────────────────────────
  { id: 201, title: "End-of-Semester Social",  date: "2026-05-15", time: "8:00 PM",  category: "social",   mandatory: true,  location: "Campus Center",   description: "Annual end-of-semester brotherhood social" },
  { id: 202, title: "Rush Social Night",       date: "2026-05-20", time: "7:30 PM",  category: "social",   mandatory: true,  location: "Student Lounge",  description: "Rush recruitment social" },
  { id: 203, title: "Brotherhood Dinner",      date: "2026-06-05", time: "6:00 PM",  category: "social",   mandatory: true,  location: "Restaurant TBD",  description: "Formal brotherhood dinner" },

  // ── Fundraisers ───────────────────────────────────────────────────────────
  { id: 301, title: "Boba Fundraiser",         date: "2026-05-14", time: "12:00 PM", category: "fundy",    mandatory: true,  location: "Student Union",   description: "Boba sales fundraiser – all brothers sell" },
  { id: 302, title: "Car Wash Fundraiser",     date: "2026-05-23", time: "11:00 AM", category: "fundy",    mandatory: true,  location: "Parking Lot B" },
  { id: 303, title: "Alumni Donation Drive",   date: "2026-06-01", time: "All Day",  category: "fundy",    mandatory: false, description: "Virtual alumni giving day" },

  // ── Programs ──────────────────────────────────────────────────────────────
  { id: 401, title: "Academic Workshop",       date: "2026-05-16", time: "3:00 PM",  category: "program",  mandatory: true,  location: "Library Rm 204" },
  { id: 402, title: "Spring Banquet",          date: "2026-05-30", time: "6:00 PM",  category: "program",  mandatory: true,  location: "Grand Ballroom",  description: "Annual spring banquet — formal attire" },
  { id: 403, title: "Leadership Retreat",      date: "2026-06-07", time: "9:00 AM",  category: "program",  mandatory: true,  description: "Officer transition & planning retreat" },
  { id: 404, title: "IFC Community Service",   date: "2026-06-12", time: "10:00 AM", category: "service",  mandatory: true,  location: "Community Center" },

  // ── Parties ───────────────────────────────────────────────────────────────
  { id: 501, title: "End-of-Year Kickback",    date: "2026-05-22", time: "9:00 PM",  category: "party",    mandatory: false, description: "End-of-year celebration" },
  { id: 502, title: "LPE × ΔΦΕ Collab",       date: "2026-05-29", time: "9:30 PM",  category: "party",    mandatory: false, description: "Collab party with Delta Phi Epsilon" },
  { id: 503, title: "Summer Kickoff",          date: "2026-06-13", time: "8:00 PM",  category: "party",    mandatory: false, description: "First party of summer" },
  { id: 504, title: "Post-Finals Rager",       date: "2026-06-20", time: "9:00 PM",  category: "party",    mandatory: false },

  // ── Deadlines ─────────────────────────────────────────────────────────────
  { id: 601, title: "Academic Standing Report",      date: "2026-05-13", category: "deadline", mandatory: false, description: "Submit to nationals" },
  { id: 602, title: "Banquet Final Submission",      date: "2026-05-14", category: "deadline", mandatory: true },
  { id: 603, title: "Risk Management Form",          date: "2026-05-16", category: "deadline", mandatory: true },
  { id: 604, title: "Spring Roster Update",          date: "2026-05-25", category: "deadline", mandatory: false },
  { id: 605, title: "Nationals Chapter Fee",         date: "2026-06-01", category: "deadline", mandatory: true },
  { id: 606, title: "Brotherhood Event Proposal",    date: "2026-06-10", category: "deadline", mandatory: false },
  { id: 607, title: "IFC Chapter Report",            date: "2026-06-15", category: "deadline", mandatory: true },
];

// ─── Transaction Seed Data ────────────────────────────────────────────────────

export const seedTransactions: Omit<Transaction, "id" | "createdAt" | "updatedAt" | "deletedAt">[] = [

  // ── January income ────────────────────────────────────────────────────────
  { type: "income", category: "Dues",           amount: 1200, date: "2026-01-10", description: "Spring dues collection — 16 brothers paid",    paymentMethod: "venmo",   semester: "SPR26" },
  { type: "income", category: "Fines",          amount:   75, date: "2026-01-18", description: "Late dues fine — 3 brothers",                   paymentMethod: "venmo",   semester: "SPR26" },
  { type: "income", category: "Alumni donation",amount:  500, date: "2026-01-22", description: "Donation from class of 2020 alumnus",           paymentMethod: "check",   semester: "SPR26" },

  // ── January expenses ──────────────────────────────────────────────────────
  { type: "expense", category: "Operations",    amount:  180, date: "2026-01-08", description: "Nationals chapter fee — spring semester",       paymentMethod: "check",   semester: "SPR26" },
  { type: "expense", category: "House",         amount:  250, date: "2026-01-12", description: "Chapter room deep clean & supply restock",      paymentMethod: "venmo",   semester: "SPR26" },
  { type: "expense", category: "Brotherhood",   amount:   90, date: "2026-01-25", description: "New member welcome dinner at Chipotle",         paymentMethod: "cash",    semester: "SPR26", paidTo: "Bryan Lee" },

  // ── February income ───────────────────────────────────────────────────────
  { type: "income", category: "Door",           amount:  580, date: "2026-02-14", description: "Spring Rush Social — door cut",                 paymentMethod: "cash",    semester: "SPR26" },
  { type: "income", category: "Fundraiser",     amount:  340, date: "2026-02-20", description: "Boba stand fundraiser — Student Union",         paymentMethod: "venmo",   semester: "SPR26" },
  { type: "income", category: "Door",           amount:  420, date: "2026-02-28", description: "Kickback Night — door cut",                     paymentMethod: "cash",    semester: "SPR26" },
  { type: "income", category: "Fines",          amount:   50, date: "2026-02-15", description: "Mandatory event absence fine — 2 brothers",    paymentMethod: "venmo",   semester: "SPR26" },

  // ── February expenses ─────────────────────────────────────────────────────
  { type: "expense", category: "Party Supplies",amount:  210, date: "2026-02-11", description: "Rush Social — cups, ice, decorations",         paymentMethod: "venmo",   semester: "SPR26", paidTo: "Issac Chong" },
  { type: "expense", category: "Travel",        amount:   85, date: "2026-02-16", description: "Gas reimbursement for venue run",              paymentMethod: "venmo",   semester: "SPR26", paidTo: "Noah Kim" },
  { type: "expense", category: "Events",        amount:  120, date: "2026-02-22", description: "Rush week flyers and printing",                paymentMethod: "cash",    semester: "SPR26" },
  { type: "expense", category: "Brotherhood",   amount:  160, date: "2026-02-27", description: "Big-Little reveal gift fund",                  paymentMethod: "venmo",   semester: "SPR26" },

  // ── March income ──────────────────────────────────────────────────────────
  { type: "income", category: "Door",           amount:  750, date: "2026-03-15", description: "LPE × KDF Collab — door cut (50/50 split)",    paymentMethod: "cash",    semester: "SPR26" },
  { type: "income", category: "Event",          amount:  280, date: "2026-03-21", description: "Ticketed study hall fundraiser",               paymentMethod: "venmo",   semester: "SPR26" },
  { type: "income", category: "Dues",           amount:  150, date: "2026-03-05", description: "Late spring dues — 2 brothers",                paymentMethod: "venmo",   semester: "SPR26" },
  { type: "income", category: "Fines",          amount:   25, date: "2026-03-12", description: "GPA probation fine",                          paymentMethod: "cash",    semester: "SPR26" },

  // ── March expenses ────────────────────────────────────────────────────────
  { type: "expense", category: "Party Supplies",amount:  185, date: "2026-03-13", description: "Collab event — supplies and mixers",          paymentMethod: "cash",    semester: "SPR26", paidTo: "Dariel Milfort" },
  { type: "expense", category: "Travel",        amount:  240, date: "2026-03-08", description: "Van rental — regional conclave trip",         paymentMethod: "invoice", semester: "SPR26" },
  { type: "expense", category: "Operations",    amount:   65, date: "2026-03-18", description: "IFC chapter dues payment",                    paymentMethod: "check",   semester: "SPR26" },
  { type: "expense", category: "Brotherhood",   amount:  110, date: "2026-03-22", description: "Food reimbursement — brotherhood dinner",     paymentMethod: "venmo",   semester: "SPR26", paidTo: "Rinchen Sherpalama" },
  { type: "expense", category: "House",         amount:  200, date: "2026-03-28", description: "Chapter room projector bulb replacement",     paymentMethod: "invoice", semester: "SPR26" },

  // ── April income ──────────────────────────────────────────────────────────
  { type: "income", category: "Door",           amount:  320, date: "2026-04-05", description: "Brotherhood Mixer — door cut",                paymentMethod: "cash",    semester: "SPR26" },
  { type: "income", category: "Fundraiser",     amount:  415, date: "2026-04-12", description: "Car wash fundraiser — Parking Lot B",         paymentMethod: "cash",    semester: "SPR26" },
  { type: "income", category: "Door",           amount:  890, date: "2026-04-26", description: "Spring Formal Pre-Party — door cut",          paymentMethod: "cash",    semester: "SPR26" },
  { type: "income", category: "Alumni donation",amount:  300, date: "2026-04-18", description: "Alumni donation — Spring Banquet support",    paymentMethod: "check",   semester: "SPR26" },
  { type: "income", category: "External / misc",amount:   60, date: "2026-04-10", description: "Lost & found item reclaim fee",               paymentMethod: "cash",    semester: "SPR26" },

  // ── April expenses ────────────────────────────────────────────────────────
  { type: "expense", category: "Events",        amount:  380, date: "2026-04-20", description: "Spring Banquet venue deposit — Grand Ballroom",paymentMethod: "invoice", semester: "SPR26" },
  { type: "expense", category: "Party Supplies",amount:  260, date: "2026-04-24", description: "Formal Pre-Party — glassware, ice, decor",   paymentMethod: "venmo",   semester: "SPR26", paidTo: "Elvin De La Cruz" },
  { type: "expense", category: "Brotherhood",   amount:  200, date: "2026-04-08", description: "Spring Brotherhood retreat supplies",         paymentMethod: "venmo",   semester: "SPR26" },
  { type: "expense", category: "Operations",    amount:  145, date: "2026-04-15", description: "Catering reimbursement — chapter meeting",   paymentMethod: "venmo",   semester: "SPR26", paidTo: "Thalha Thabish" },
  { type: "expense", category: "Misc",          amount:   40, date: "2026-04-28", description: "Office supplies — printer ink, folders",     paymentMethod: "cash",    semester: "SPR26" },

  // ── May income ────────────────────────────────────────────────────────────
  { type: "income", category: "Fundraiser",     amount:  290, date: "2026-05-03", description: "Boba fundraiser — final push",                paymentMethod: "venmo",   semester: "SPR26" },
  { type: "income", category: "Fines",          amount:  100, date: "2026-05-07", description: "End-of-semester attendance audit fines",      paymentMethod: "venmo",   semester: "SPR26" },
  { type: "income", category: "Event",          amount:  150, date: "2026-05-10", description: "Academic workshop ticket sales",               paymentMethod: "venmo",   semester: "SPR26" },
  { type: "income", category: "Dues",           amount:   75, date: "2026-05-02", description: "Remaining dues — 1 brother",                   paymentMethod: "cash",    semester: "SPR26" },

  // ── May expenses ──────────────────────────────────────────────────────────
  { type: "expense", category: "Events",        amount:  420, date: "2026-05-08", description: "Spring Banquet final payment — catering",     paymentMethod: "invoice", semester: "SPR26" },
  { type: "expense", category: "Operations",    amount:   95, date: "2026-05-04", description: "Chapter website domain & hosting renewal",    paymentMethod: "invoice", semester: "SPR26" },
  { type: "expense", category: "House",         amount:  175, date: "2026-05-09", description: "End-of-semester chapter room deep clean",     paymentMethod: "cash",    semester: "SPR26" },
  { type: "expense", category: "Travel",        amount:  130, date: "2026-05-06", description: "Reimbursement — conclave travel fuel",        paymentMethod: "venmo",   semester: "SPR26", paidTo: "Jacob Hwang" },
  { type: "expense", category: "Events",        amount:   70, date: "2026-05-11", description: "Photo printing — Spring Banquet slideshow",   paymentMethod: "venmo",   semester: "SPR26", paidTo: "Arijit Das" },
  { type: "expense", category: "Brotherhood",   amount:  115, date: "2026-05-13", description: "End-of-year gift cards for seniors",          paymentMethod: "venmo",   semester: "SPR26" },
];

export const treasuryTrend = [
  { month: "Jan", balance: 2000 },
  { month: "Feb", balance: 2800 },
  { month: "Mar", balance: 3500 },
  { month: "Apr", balance: 4000 },
  { month: "May", balance: 4250 },
];

export const TREASURY_BALANCE = 4250;
export const TREASURY_PROJECTED = 5500;

// ─── Activity Feed ────────────────────────────────────────────────────────────

export interface ActivityEntry {
  id: number;
  message: string;
  timestamp: string;
  type: "success" | "warning" | "info";
}

export const seedActivity: ActivityEntry[] = [
  { id: 1, message: "Nathaniel Baccarey flagged At Risk automatically", timestamp: "3h ago", type: "warning" },
  { id: 2, message: "Treasury updated after Spring Formal Pre-Party",   timestamp: "2d ago", type: "success" },
  { id: 3, message: "Spring Formal Flyer Drop added to Instagram queue",timestamp: "3d ago", type: "info"    },
  { id: 4, message: "Academic Standing Report marked Urgent",           timestamp: "4d ago", type: "warning" },
  { id: 5, message: "Noah Kim owes $75 — dues reminder sent",           timestamp: "5d ago", type: "info"    },
];

// ─── KPI Sparklines ───────────────────────────────────────────────────────────

export const KPI_SPARKLINES = {
  attendance: [75.0, 77.2, 79.5, 80.1, 81.2],
  dues:       [450,  375,  300,  225,  225 ],
  gpa:        [3.18, 3.22, 3.31, 3.35, 3.38],
  service:    [82,   88,   90,   98,   105 ],
  treasury:   [2000, 2800, 3500, 4000, 4250],
  door:       [0,    580,  1000, 1320, 1960],
  health:     [68,   71,   74,   76,   78  ],
};

// ─── Health Score ─────────────────────────────────────────────────────────────

export function calcHealthScore(
  bList: Brother[],
  dList: Deadline[],
  thresholds: Thresholds = THRESHOLDS,
): { score: number; label: "Healthy" | "Needs Attention" | "Critical"; breakdown: Record<string, number> } {
  const attScore  = Math.min(100, avg(bList.map(b => b.attendance)));
  const gpaScore  = Math.min(100, Math.max(0, ((avg(bList.map(b => b.gpa)) - 2.0) / 2.0) * 100));
  const duesScore = bList.length ? (bList.filter(b => b.duesOwed === 0).length / bList.length) * 100 : 0;
  const svcScore  = bList.length ? (bList.filter(b => b.serviceHours >= thresholds.serviceHoursGoal).length / bList.length) * 100 : 0;
  const urgentPenalty = dList.filter(d => d.status === "Urgent").length * 15;
  const dlScore   = Math.max(0, 100 - urgentPenalty);
  const score = Math.min(100, Math.max(0, Math.round(attScore * 0.30 + gpaScore * 0.25 + duesScore * 0.20 + svcScore * 0.15 + dlScore * 0.10)));
  const label = score >= 80 ? "Healthy" : score >= 60 ? "Needs Attention" : "Critical";
  return {
    score,
    label,
    breakdown: {
      Attendance: Math.round(attScore),
      GPA:        Math.round(gpaScore),
      Dues:       Math.round(duesScore),
      Service:    Math.round(svcScore),
      Deadlines:  Math.round(dlScore),
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getBrotherStatus(b: Brother, thresholds: Thresholds = THRESHOLDS): BrotherStatus {
  if (b.attendance < thresholds.attendanceAtRisk || b.gpa < thresholds.gpaAtRisk) return "At Risk";
  if (
    b.attendance < thresholds.attendanceWatch ||
    b.gpa < thresholds.gpaWatch ||
    b.duesOwed > 0 ||
    b.serviceHours < thresholds.serviceHoursGoal
  )
    return "Watch";
  return "Good";
}

export function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Round to 2 decimal places (cents). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function fmt$(n: number): string {
  return `$${(n ?? 0).toLocaleString()}`;
}

export function fmtDate(s: string): string {
  const [, m, d] = s.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[m - 1]} ${d}`;
}

// Re-exported so existing importers of `isoWeekBounds` from app/data keep working.
export { isoWeekBounds } from "@/lib/dates";

// "May 18–24" within a month, "May 30 – Jun 5" across months.
export function fmtRange(startISO: string, endISO: string): string {
  const [, sm, sd] = startISO.split("-").map(Number);
  const [, em, ed] = endISO.split("-").map(Number);
  if (sm === em) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[sm - 1]} ${sd}–${ed}`;
  }
  return `${fmtDate(startISO)} – ${fmtDate(endISO)}`;
}
