/**
 * "More details" on a calendar event — the typed list stored on
 * CalendarEvent.details (and, blanked, on CalendarEventType.detailTemplate).
 *
 * Each detail is a small form of its own: a checklist, a budget, a sign-up sheet
 * of who's bringing what, a point of contact, who's invited, a head-count cap,
 * a dress code, getting-there notes with a door code, links, or a field the
 * officer names. The event form (app/components/timeline/EventDetailsEditor.tsx)
 * edits the list; the timeline rail (EventDetailsRail.tsx) reads it.
 *
 * This file owns the shape, the parse that guards every read (the column is
 * plain JSONB), the member-facing strip (checklist + budget are officers-only),
 * the blank template a type remembers, and the two in-place actions members and
 * officers take from the rail (claim a supply, tick a checklist item).
 *
 * Pure — no db imports — because the client form and rail import it.
 */
import { z } from "zod";

export const DETAIL_ID_RE = /^[A-Za-z0-9_-]{1,24}$/;
const detailId = z.string().regex(DETAIL_ID_RE);
const brotherId = z.number().int().positive();
const text = (max: number) => z.string().max(max);

export const DRESS_CODES = ["Casual", "Business casual", "Formal", "Athletic", "Theme"] as const;
export const GUEST_MODES = ["members", "plus", "invite", "public"] as const;
export const CUSTOM_KINDS = ["text", "number", "yesno", "date", "choice"] as const;
export const CONTACT_PREFS = ["text", "call"] as const;

const checklist = z.object({
  id: detailId, type: z.literal("checklist"),
  items: z.array(z.object({ id: detailId, t: text(200), done: z.boolean() })).max(50),
});
const budget = z.object({
  id: detailId, type: z.literal("budget"),
  items: z.array(z.object({ id: detailId, label: text(120), amt: z.number().nonnegative().max(10_000_000).nullable() })).max(50),
});
const supplies = z.object({
  id: detailId, type: z.literal("supplies"),
  items: z.array(z.object({ id: detailId, item: text(120), who: brotherId.nullable() })).max(50),
});
const contact = z.object({
  id: detailId, type: z.literal("contact"),
  who: brotherId.nullable(), phone: text(40), prefer: z.enum(CONTACT_PREFS),
});
const guests = z.object({
  id: detailId, type: z.literal("guests"),
  mode: z.enum(GUEST_MODES), plus: z.number().int().min(1).max(3),
});
const capacity = z.object({
  id: detailId, type: z.literal("capacity"),
  cap: z.number().int().min(1).max(100_000),
});
const dress = z.object({
  id: detailId, type: z.literal("dress"),
  pick: z.enum(DRESS_CODES).nullable(), note: text(200),
});
const directions = z.object({
  id: detailId, type: z.literal("directions"),
  text: text(1000), code: text(20),
});
const links = z.object({
  id: detailId, type: z.literal("links"),
  items: z.array(z.object({ id: detailId, label: text(80), url: text(2000) })).max(20),
});
const custom = z.object({
  id: detailId, type: z.literal("custom"),
  label: text(80), kind: z.enum(CUSTOM_KINDS),
  value: z.union([text(2000), z.boolean(), z.null()]),
  options: z.array(text(60)).max(20),
});

export const eventDetail = z.discriminatedUnion("type", [checklist, budget, supplies, contact, guests, capacity, dress, directions, links, custom]);
export type EventDetail = z.infer<typeof eventDetail>;
export type DetailType = EventDetail["type"];
export type DetailOf<T extends DetailType> = Extract<EventDetail, { type: T }>;

export const MAX_EVENT_DETAILS = 12;
/** Every write validates against this: at most one of each kind except custom. */
export const eventDetailsSchema = z.array(eventDetail).max(MAX_EVENT_DETAILS).superRefine((list, ctx) => {
  const seen = new Set<string>();
  for (const d of list) {
    if (seen.has(d.id)) ctx.addIssue({ code: "custom", message: "Duplicate detail id" });
    seen.add(d.id);
    if (d.type !== "custom") {
      if (seen.has(`type:${d.type}`)) ctx.addIssue({ code: "custom", message: `Only one ${DETAIL_KINDS[d.type].name} per event` });
      seen.add(`type:${d.type}`);
    }
  }
});

/**
 * A stored value. Entries that no longer match their shape are dropped one by
 * one rather than losing the whole list to one bad row.
 */
export function parseEventDetails(value: unknown): EventDetail[] {
  if (!Array.isArray(value)) return [];
  const out: EventDetail[] = [];
  for (const raw of value) {
    const parsed = eventDetail.safeParse(raw);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export type DetailHue = "mint" | "butter" | "peach" | "sky" | "lilac" | "rose";
export const DETAIL_KINDS: Record<DetailType, { name: string; hint: string; group: "Plan it" | "People" | "On the day" | "Make your own"; hue: DetailHue }> = {
  checklist:  { name: "Checklist",           hint: "Things to tick off beforehand", group: "Plan it",       hue: "mint" },
  budget:     { name: "Budget",              hint: "Planned costs, added up",       group: "Plan it",       hue: "butter" },
  supplies:   { name: "Who's bringing what", hint: "A sign-up list for supplies",   group: "Plan it",       hue: "peach" },
  contact:    { name: "Point of contact",    hint: "Who to ask on the day",         group: "People",        hue: "sky" },
  guests:     { name: "Who's invited",       hint: "Members, +1s, or the public",   group: "People",        hue: "lilac" },
  capacity:   { name: "Capacity",            hint: "A head-count cap",              group: "People",        hue: "rose" },
  dress:      { name: "Dress code",          hint: "What to wear",                  group: "On the day",    hue: "lilac" },
  directions: { name: "Getting there",       hint: "Parking, entrance, door code",  group: "On the day",    hue: "sky" },
  links:      { name: "Links",               hint: "Tickets, forms, playlists",     group: "On the day",    hue: "mint" },
  custom:     { name: "Your own field",      hint: "Name it, pick what it holds",   group: "Make your own", hue: "butter" },
};
export const DETAIL_ORDER: DetailType[] = ["checklist", "budget", "supplies", "contact", "guests", "capacity", "dress", "directions", "links", "custom"];

/** Kinds offered first for a built-in category; custom types get the generic three. */
const SUGGEST: Record<string, DetailType[]> = {
  chapter: ["checklist", "links", "contact"], social: ["guests", "dress", "supplies"], fundy: ["budget", "capacity", "links"],
  program: ["contact", "checklist", "capacity"], party: ["guests", "capacity", "dress"], service: ["directions", "supplies", "contact"],
};
export function suggestedKinds(category: string): DetailType[] {
  return SUGGEST[category] ?? ["checklist", "contact", "links"];
}

export const GUEST_LABEL: Record<(typeof GUEST_MODES)[number], { b: string; s: string }> = {
  members: { b: "Members",     s: "Roster only" },
  plus:    { b: "+ guests",    s: "Members bring people" },
  invite:  { b: "Invite-only", s: "A set list" },
  public:  { b: "Public",      s: "Anyone can come" },
};

/** Short random id for a detail or a row; unique enough within one event. */
export function newDetailId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, "").slice(0, 12);
  return Math.random().toString(36).slice(2, 14);
}

export function makeDetail(type: DetailType): EventDetail {
  const id = newDetailId();
  switch (type) {
    case "checklist":  return { id, type, items: [] };
    case "budget":     return { id, type, items: [] };
    case "supplies":   return { id, type, items: [] };
    case "contact":    return { id, type, who: null, phone: "", prefer: "text" };
    case "guests":     return { id, type, mode: "members", plus: 1 };
    case "capacity":   return { id, type, cap: 50 };
    case "dress":      return { id, type, pick: null, note: "" };
    case "directions": return { id, type, text: "", code: "" };
    case "links":      return { id, type, items: [] };
    case "custom":     return { id, type, label: "", kind: "text", value: null, options: [] };
  }
}

/** Planning kinds a non-officer never receives (stripped server-side in listCalendar). */
export const OFFICER_ONLY: ReadonlySet<DetailType> = new Set(["checklist", "budget"]);
export function forMembers(details: EventDetail[]): EventDetail[] {
  return details.filter(d => !OFFICER_ONLY.has(d.type));
}

/**
 * The blank set a type remembers: same kinds in the same order, custom fields
 * keep their name / kind / options, everything filled in is cleared.
 */
export function toTemplate(details: EventDetail[]): EventDetail[] {
  return details.map(d => {
    const blank = makeDetail(d.type);
    if (d.type === "custom" && blank.type === "custom") return { ...blank, label: d.label, kind: d.kind, options: d.options };
    if (d.type === "contact" && blank.type === "contact") return { ...blank, prefer: d.prefer };
    return blank;
  });
}
/** A fresh copy of a template for a new event — new ids so two events never share one. */
export function fromTemplate(template: unknown): EventDetail[] {
  return parseEventDetails(template).map(d => ({ ...d, id: newDetailId() }));
}

/** Is there anything worth showing a reader? An untouched detail shows nothing on the rail. */
export function isFilled(d: EventDetail): boolean {
  switch (d.type) {
    case "checklist": case "budget": case "supplies": case "links": return d.items.length > 0;
    case "contact":    return d.who != null;
    case "guests":     return true;
    case "capacity":   return true;
    case "dress":      return d.pick != null;
    case "directions": return !!(d.text.trim() || d.code.trim());
    case "custom":     return !!d.label.trim() && d.value !== null && d.value !== "";
  }
}

export function money(n: number): string {
  return "$" + (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
}
export function budgetTotal(d: DetailOf<"budget">): number {
  return d.items.reduce((a, i) => a + (i.amt ?? 0), 0);
}
export function customValueText(d: DetailOf<"custom">): string {
  if (d.kind === "yesno") return d.value === true ? "Yes" : d.value === false ? "No" : "";
  return typeof d.value === "string" ? d.value : "";
}

/** One line for a stamp / folded header; null when there is nothing to say yet. */
export function detailSummary(d: EventDetail, nameOf: (id: number) => string | undefined): string | null {
  switch (d.type) {
    case "checklist": { const n = d.items.length, k = d.items.filter(i => i.done).length; return n ? `${k}/${n} done` : null; }
    case "budget":    { const t = budgetTotal(d); return t ? `${money(t)} budget` : null; }
    case "supplies":  { const n = d.items.length, c = d.items.filter(i => i.who != null).length; return n ? `${c}/${n} items claimed` : null; }
    case "contact":   { const n = d.who != null ? nameOf(d.who) : undefined; return n ? `Ask ${n.split(" ")[0]}` : null; }
    case "guests":    return d.mode === "plus" ? `Members + ${d.plus}` : GUEST_LABEL[d.mode].b;
    case "capacity":  return `Cap ${d.cap}`;
    case "dress":     return d.pick ? (d.pick === "Theme" && d.note.trim() ? `Theme: ${d.note.trim()}` : d.pick) : null;
    case "directions":return d.code.trim() ? "Door code set" : d.text.trim() ? "Directions" : null;
    case "links":     { const n = d.items.filter(i => i.url.trim() || i.label.trim()).length; return n ? `${n} link${n > 1 ? "s" : ""}` : null; }
    case "custom":    { const v = customValueText(d); return d.label.trim() ? (v ? `${d.label.trim()}: ${v}` : d.label.trim()) : null; }
  }
}

/** Only http(s) links leave the app; a bare "example.com" gets https:// in front. */
export function safeHref(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null;
  return `https://${u}`;
}

// ─── In-place actions from the rail ───────────────────────────────────────────

export const detailActionInput = z.discriminatedUnion("op", [
  z.object({ op: z.literal("claim"), detailId, itemId: detailId, claim: z.boolean() }).strict(),
  z.object({ op: z.literal("tick"),  detailId, itemId: detailId, done: z.boolean() }).strict(),
]);
export type DetailAction = z.infer<typeof detailActionInput>;

export type DetailActionResult =
  | { ok: true; details: EventDetail[] }
  | { ok: false; reason: "not_found" | "forbidden" | "taken"; message: string };

/**
 * Apply one rail action. Shared by the service (authoritative, under a row lock)
 * and the rail (optimistic), so the two can't disagree about the rules:
 *  - claim: anyone claims an open item for themselves; you can drop your own
 *    claim; an officer can clear anyone's.
 *  - tick: officers only.
 */
export function applyDetailAction(
  details: EventDetail[], action: DetailAction, actor: { brotherId: number | null; isOfficer: boolean },
): DetailActionResult {
  const d = details.find(x => x.id === action.detailId);
  if (action.op === "claim") {
    if (!d || d.type !== "supplies") return { ok: false, reason: "not_found", message: "That sign-up list is gone." };
    const item = d.items.find(i => i.id === action.itemId);
    if (!item) return { ok: false, reason: "not_found", message: "That item was removed." };
    if (actor.brotherId == null) return { ok: false, reason: "forbidden", message: "Only members can sign up to bring something." };
    if (action.claim) {
      if (item.who === actor.brotherId) return { ok: true, details };
      if (item.who != null) return { ok: false, reason: "taken", message: "Someone else just claimed that." };
    } else if (item.who !== actor.brotherId && !actor.isOfficer) {
      return { ok: false, reason: "forbidden", message: "Only the person bringing it, or an officer, can clear it." };
    }
    const who = action.claim ? actor.brotherId : null;
    return { ok: true, details: details.map(x => x === d ? { ...d, items: d.items.map(i => i === item ? { ...i, who } : i) } : x) };
  }
  if (!d || d.type !== "checklist") return { ok: false, reason: "not_found", message: "That checklist is gone." };
  const item = d.items.find(i => i.id === action.itemId);
  if (!item) return { ok: false, reason: "not_found", message: "That checklist item was removed." };
  if (!actor.isOfficer) return { ok: false, reason: "forbidden", message: "Only an events officer can tick the checklist." };
  return { ok: true, details: details.map(x => x === d ? { ...d, items: d.items.map(i => i === item ? { ...i, done: action.done } : i) } : x) };
}
