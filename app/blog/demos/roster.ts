// The made-up chapter every blog demo shares. No real members, ever.
import type { MentionTarget } from "@/app/components/meeting-notes/notes-markdown";

type Person = { name: string; role?: string; tone: number };
const PEOPLE: Person[] = [
  { name: "Jordan Reyes", role: "President", tone: 1 },
  { name: "Priya Nair", role: "Secretary", tone: 0 },
  { name: "Andre Whitfield", role: "Treasurer", tone: 3 },
  { name: "Sam Okafor", role: "Social", tone: 4 },
  { name: "Marcus Bell", tone: 2 },
  { name: "Tyler Brooks", tone: 5 },
  { name: "Noah Kim", tone: 1 },
  { name: "Eli Turner", tone: 3 },
];

const initials = (name: string) => name.split(/\s+/).map(s => s[0]).join("").slice(0, 2).toUpperCase();

/** People and roles the demo pads can @mention, shaped like the app's roster targets. */
export const MENTIONS: MentionTarget[] = [
  ...PEOPLE.map(p => ({ kind: "person" as const, name: p.name, label: p.name.split(" ")[0], initials: initials(p.name), tone: p.tone, sub: p.role ?? "Member" })),
  ...PEOPLE.filter(p => p.role).map(p => ({ kind: "role" as const, name: p.role!, label: p.role!, initials: "", tone: 0, sub: p.name })),
];

/** Who holds a role, for resolving "@Treasurer" to a person in a summary. */
export const ROLE_HOLDER: Record<string, string> = Object.fromEntries(PEOPLE.filter(p => p.role).map(p => [p.role!, p.name]));

/** Presence colours, as the app derives them per member. */
export const PEERS = {
  you: { name: "You", color: "#1B815B" },
  andre: { name: "Andre Whitfield", color: "#2A66C7" },
  sam: { name: "Sam Okafor", color: "#C23C77" },
  jordan: { name: "Jordan Reyes", color: "#9C6B08" },
};

/** A 52-member roll for the attendance demo: the eight above, then more invented first names. */
const MORE = ["Aiden", "Bryce", "Cole", "Dante", "Ethan", "Felix", "Gabe", "Hector", "Ian", "Jonah", "Kai", "Leo", "Miles",
  "Nico", "Oscar", "Reid", "Silas", "Wes", "Arjun", "Mateo", "Rafael", "Quentin", "Victor", "Xavier", "Yusuf", "Zane",
  "Elliot", "Damian", "Henry", "Jasper", "Rowan", "Tobias", "Caleb", "Owen", "Theo", "Isaac", "Nate", "Luis", "Ben", "Ryan",
  "Kofi", "Omar", "Devin", "Chris"];
export const ROLL: string[] = [...PEOPLE.map(p => p.name.split(" ")[0]), ...MORE].slice(0, 52);
