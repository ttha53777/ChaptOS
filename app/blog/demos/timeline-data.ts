// The made-up chapter's fall semester, shared by the Timeline post's demos.
// Type colours are the app's own event-type palette (lib/event-types.ts), so
// the cards read the way they do on a real timeline.

export type TypeId = string;
export type EvType = { id: TypeId; label: string; color: string; builtin: boolean; required: boolean; creatable: boolean };

export const PALETTE = [
  { id: "blue", label: "Blue", color: "#3f6ea3" },
  { id: "rose", label: "Rose", color: "#b34f72" },
  { id: "clay", label: "Clay", color: "#c14a37" },
  { id: "teal", label: "Teal", color: "#2f8579" },
  { id: "gold", label: "Gold", color: "#9a7224" },
  { id: "green", label: "Green", color: "#4a7d4c" },
  { id: "purple", label: "Purple", color: "#6d28d9" },
  { id: "orchid", label: "Orchid", color: "#8b3fa3" },
] as const;

/** Built-ins as the app seeds them, plus the two custom types this chapter made. */
export const TYPES: EvType[] = [
  { id: "chapter", label: "Chapter", color: "#3f6ea3", builtin: true, required: true, creatable: true },
  { id: "party", label: "Party", color: "#b34f72", builtin: true, required: false, creatable: true },
  { id: "service", label: "Community Service", color: "#2f8579", builtin: true, required: false, creatable: true },
  { id: "deadline", label: "Deadline", color: "#c14a37", builtin: true, required: false, creatable: false },
  { id: "philanthropy", label: "Philanthropy", color: "#9a7224", builtin: false, required: false, creatable: true },
  { id: "alumni", label: "Alumni", color: "#8b3fa3", builtin: false, required: false, creatable: true },
];
export const typeOf = (types: EvType[], id: TypeId) => types.find(t => t.id === id) ?? types[0];

export type Ev = {
  key: string; title: string; type: TypeId;
  /** YYYY-MM-DD */
  date: string;
  /** "8:00 PM", or null for an all-day deadline. */
  time: string | null;
  place: string; required?: boolean;
};

export const SEMESTER: Ev[] = [
  { key: "ch8", title: "Chapter Meeting — Week 8", type: "chapter", date: "2026-10-19", time: "8:00 PM", place: "Chapter room", required: true },
  { key: "dues", title: "Fall dues due", type: "deadline", date: "2026-10-23", time: null, place: "" },
  { key: "food", title: "Food bank shift", type: "service", date: "2026-10-24", time: "9:00 AM", place: "Westside Food Bank" },
  { key: "ch9", title: "Chapter Meeting — Week 9", type: "chapter", date: "2026-10-26", time: "8:00 PM", place: "Chapter room", required: true },
  { key: "hall", title: "Halloween social", type: "party", date: "2026-10-31", time: "10:00 PM", place: "The house" },
  { key: "5k", title: "Philanthropy 5K", type: "philanthropy", date: "2026-11-07", time: "8:00 AM", place: "Riverside Park" },
  { key: "alum", title: "Alumni dinner", type: "alumni", date: "2026-11-14", time: "6:30 PM", place: "Rosewood Grill" },
  { key: "formal", title: "Fall formal", type: "party", date: "2026-11-21", time: "7:00 PM", place: "The Grand Hall" },
];

const D = (iso: string) => new Date(`${iso}T12:00:00Z`);
export const dayNum = (iso: string) => D(iso).getUTCDate();
export const weekday = (iso: string) => D(iso).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
export const monthOf = (iso: string) => D(iso).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
export const shortDate = (iso: string) => D(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const longDate = (iso: string) => D(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** "20:00" → "8:00 PM" */
export function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
/** Minutes past midnight of "8:00 PM", for ordering a day; all-day first. */
function minutesOf(t: string | null): number {
  if (!t) return -1;
  const m = /^(\d+):(\d+) (AM|PM)$/.exec(t);
  if (!m) return 0;
  return ((+m[1] % 12) + (m[3] === "PM" ? 12 : 0)) * 60 + +m[2];
}
export const byWhen = (a: Ev, b: Ev) => a.date.localeCompare(b.date) || minutesOf(a.time) - minutesOf(b.time);

/** Roster members the details demo can pick; id 99 is the reader. */
export const MEMBERS = [
  { id: 1, name: "Jordan Reyes", title: "President" },
  { id: 2, name: "Priya Nair", title: "Secretary" },
  { id: 3, name: "Andre Whitfield", title: "Treasurer" },
  { id: 4, name: "Sam Okafor", title: "Social" },
  { id: 5, name: "Marcus Bell" },
  { id: 6, name: "Tyler Brooks" },
  { id: 99, name: "You" },
];
export const nameOf = (id: number) => MEMBERS.find(m => m.id === id)?.name;
