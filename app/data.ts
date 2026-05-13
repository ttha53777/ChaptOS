// ─── Types ────────────────────────────────────────────────────────────────────

export type BrotherStatus = "Good" | "Watch" | "At Risk";
export type TaskStatus = "Upcoming" | "Due Soon" | "Urgent" | "Complete";
export type CalEventCategory = "chapter" | "social" | "fundy" | "program" | "party" | "deadline";
export type CalLayer = "all" | "mandatory" | "deadlines" | "parties";

export interface Brother {
  id: number;
  name: string;
  role: string;
  attendance: number;
  duesOwed: number;
  gpa: number;
  serviceHours: number;
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

export interface PartyEvent {
  id: number;
  name: string;
  date: string;
  doorRevenue: number;
  attendance: number;
  notes: string;
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
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

export const THRESHOLDS = {
  attendanceAtRisk: 65,
  attendanceWatch: 80,
  gpaAtRisk: 2.7,
  gpaWatch: 3.0,
  serviceHoursGoal: 10,
} as const;

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
  { id: 1, name: "Spring Rush Social",      date: "2026-02-14", doorRevenue: 580, attendance: 94,  notes: "Strong turnout from rush candidates"     },
  { id: 2, name: "Kickback Night",          date: "2026-02-28", doorRevenue: 420, attendance: 67,  notes: "Brothers-only mixer"                     },
  { id: 3, name: "LPE × KDF Collab",        date: "2026-03-15", doorRevenue: 750, attendance: 142, notes: "Best collab event of the semester"        },
  { id: 4, name: "Brotherhood Mixer",       date: "2026-04-05", doorRevenue: 320, attendance: 52,  notes: "Fundraising focus"                       },
  { id: 5, name: "Spring Formal Pre-Party", date: "2026-04-26", doorRevenue: 890, attendance: 178, notes: "Highest revenue event this semester"      },
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
  { id: 404, title: "IFC Community Service",   date: "2026-06-12", time: "10:00 AM", category: "program",  mandatory: true,  location: "Community Center" },

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
};

// ─── Health Score ─────────────────────────────────────────────────────────────

export function calcHealthScore(
  bList: Brother[],
  dList: Deadline[]
): { score: number; label: "Healthy" | "Needs Attention" | "Critical"; breakdown: Record<string, number> } {
  const attScore  = avg(bList.map(b => b.attendance));
  const gpaScore  = Math.min(100, ((avg(bList.map(b => b.gpa)) - 2.0) / 2.0) * 100);
  const duesScore = bList.length ? (bList.filter(b => b.duesOwed === 0).length / bList.length) * 100 : 0;
  const svcScore  = bList.length ? (bList.filter(b => b.serviceHours >= THRESHOLDS.serviceHoursGoal).length / bList.length) * 100 : 0;
  const urgentPenalty = dList.filter(d => d.status === "Urgent").length * 15;
  const dlScore   = Math.max(0, 100 - urgentPenalty);
  const score = Math.round(attScore * 0.30 + gpaScore * 0.25 + duesScore * 0.20 + svcScore * 0.15 + dlScore * 0.10);
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

export function getBrotherStatus(b: Brother): BrotherStatus {
  if (b.attendance < THRESHOLDS.attendanceAtRisk || b.gpa < THRESHOLDS.gpaAtRisk) return "At Risk";
  if (
    b.attendance < THRESHOLDS.attendanceWatch ||
    b.gpa < THRESHOLDS.gpaWatch ||
    b.duesOwed > 0 ||
    b.serviceHours < THRESHOLDS.serviceHoursGoal
  )
    return "Watch";
  return "Good";
}

export function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function fmt$(n: number): string {
  return `$${n.toLocaleString()}`;
}

export function fmtDate(s: string): string {
  const [, m, d] = s.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[m - 1]} ${d}`;
}
