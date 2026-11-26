/**
 * Settings → Calendar subscription (the admin checklist), as rules both clients run:
 * the status pill and its health line, what blocks "Turn on", each issue's sentence,
 * the group-chat message, and every word. Pure; the web's CalendarSubscription
 * (settings) and the app's settings/Calendar.tsx render from it.
 *
 *   GET   /api/calendar/subscription   the view (+ issues, health… for org admins)
 *   PATCH /api/calendar/subscription   { action: turnOn | timeZone | disable | rotate | link }  (org admins)
 *   PATCH /api/calendar/[id]           { schedule }   set a typed time properly
 *   DELETE /api/calendar/[id]          an old deadline entry
 *
 * Where the web splits a sentence into several JSX text runs, the helper returns the
 * runs (string[]); joining them shifts WebKit's text shaping.
 */

export type IssueKind = "legacy-deadline" | "invalid-date" | "time-unconfirmed" | "unlinked-service" | "unlinked-party" | "invalid-due-date";
export interface IssueLike { source: string; id: number; title: string; issue: string; blocking: boolean; kind: IssueKind; date?: string; time?: string | null }
export interface HealthLike { pending: boolean; failedAt: string | null; processedAt: string | null; failures: number }
export interface AdminViewLike {
  enabled: boolean; available: boolean; timeZone: string | null; orgName: string;
  configured?: boolean; turningOn?: boolean; validating?: boolean; health?: HealthLike; issues?: IssueLike[];
}

/** "New York" from "America/New_York". */
export const zoneName = (zone: string) => zone.split("/").pop()?.replace(/_/g, " ") ?? zone;

/** "just now", "4 min ago", "3 h ago", or the date. */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.round(minutes / 60)} h ago` : new Date(iso).toLocaleDateString();
}

export type PillTone = "ok" | "vio" | "muted";

export function statusPill(d: Pick<AdminViewLike, "enabled" | "turningOn">): { label: string; tone: PillTone } {
  return d.enabled ? { label: "On for members", tone: "ok" } : d.turningOn ? { label: "Turning on…", tone: "vio" } : { label: "Off for members", tone: "muted" };
}

/** The line beside the pill (on, or failing), and whether it reads as an error. */
export function healthLine(d: Pick<AdminViewLike, "enabled" | "health">, now = Date.now()): { text: string; error: boolean } | null {
  const h = d.health;
  if (!d.enabled && !h?.failedAt) return null;
  if (h?.failedAt) return { text: `Publishing calendar updates is failing (${h.failures} attempt${h.failures === 1 ? "" : "s"}); it retries automatically.`, error: true };
  if (h?.pending) return { text: "Calendar updates are waiting to publish.", error: false };
  if (h?.processedAt) return { text: `Calendar updated ${ago(h.processedAt, now)}.`, error: false };
  return { text: "Calendar updates haven't been published yet.", error: false };
}

export function splitIssues<I extends IssueLike>(issues: I[] = []) {
  return {
    blocking: issues.filter(i => i.blocking),
    unconfirmed: issues.filter(i => i.kind === "time-unconfirmed"),
    notes: issues.filter(i => !i.blocking && i.kind !== "time-unconfirmed"),
  };
}

/** Why "Turn on for members" can't be pressed yet, or null. */
export function blockReason(d: Pick<AdminViewLike, "configured" | "available">, blocking: number, zoneValid: boolean): string | null {
  return !d.configured ? "Calendar subscriptions aren't set up on this server yet. Ask your ChaptOS administrator."
    : !d.available ? "ChaptOS hasn't opened calendar subscriptions for your organization yet."
    : blocking ? `Fix the ${blocking === 1 ? "item" : `${blocking} items`} above first.`
    : !zoneValid ? "Choose your organization's time zone first."
    : null;
}

/** A blocking item's sentence. Legacy deadlines aren't in the feed at all (deadlines come from tasks). */
export function blockingText(issue: Pick<IssueLike, "kind" | "issue">): string {
  return issue.kind === "legacy-deadline" ? "An old deadline entry. Deadlines come from tasks now, so this one isn't in the calendar. Check it has a matching task, then delete it."
    : issue.kind === "unlinked-service" ? "A service project with no timeline entry, so it would be missing from members' calendars."
    : issue.kind === "unlinked-party" ? "A party with no timeline entry. It can't be added automatically because its attendance may belong to an existing event. Open Parties to review it."
    : issue.issue;
}

/** Where a blocking item's title opens. */
export const issuePath = (issue: Pick<IssueLike, "kind" | "id">) =>
  issue.kind === "unlinked-service" ? "/service" : issue.kind === "unlinked-party" ? "/parties" : `/timeline?event=${issue.id}`;

/** A note's reason after its title. */
export const noteText = (issue: Pick<IssueLike, "kind">) =>
  issue.kind === "invalid-due-date" ? "the task's due date isn't a real date." : "the event's date isn't a real date.";

/** The group-chat message. The link opens setup behind sign-in, never the feed. */
export const tellMessage = (orgName: string, link: string) =>
  `${orgName ? `${orgName}'s` : "Our"} calendar is now in ChaptOS. Add it to Google or Apple Calendar once and every meeting and deadline stays up to date on its own: ${link}`;

export const TELL_PATH = "/timeline?subscribe=1";

export const CALENDAR_COPY = {
  loading: "Loading subscription…",
  loadFailed: "Could not load calendar subscription",
  updateFailed: "Could not update calendar subscription",
  offForMembers: "Calendar subscriptions are off for your organization. An organization admin can turn them on here.",
  /** "Members add it from " + the Timeline link + "." */
  membersAddFrom: ["Members add it from ", "Timeline → Add to my calendar", "."] as const,
  timeZone: "Time zone",
  zoneLabel: "Organization time zone",
  zonePlaceholder: "Search a city, e.g. New York",
  useDeviceZone: (name: string) => ["Use this device's zone (", name, ")"] as const,
  fromDevice: " · from this device",
  change: "Change",
  zoneNote: "Times you add are in this zone. Members see them in their own.",
  saveZone: "Save time zone",
  cancel: "Cancel",
  zoneChangeNote: "Changing it doesn't move existing events or pause the calendar.",
  fixTitle: (n: number) => `Fix ${n} item${n === 1 ? "" : "s"} that would appear wrong or go missing`,
  turningOn: ["Turning on for members.", " ChaptOS is building your calendar and checking every entry. It takes about a minute and switches on by itself, so you can leave this page."] as const,
  turnOn: "Turn on for members",
  checking: "A publication check is running. This takes about a minute.",
  thenMembers: (orgName: string) => ["Members can then add ", orgName || "your organization", "'s events and deadlines to Google or Apple Calendar, and they stay up to date on their own."] as const,
  turnOnFailed: "It didn't turn on: the check found something to fix. Fix any items listed above and try again.",
  /** "<n> event shows / events show" (bold) + the rest. */
  unconfirmedHead: (n: number) => [String(n), " event", n === 1 ? " shows" : "s show", " as all-day in members' calendars"] as const,
  unconfirmedTail: " because ChaptOS can't read the time that was typed. Set a start time to fix it.",
  notesHead: (n: number) => [String(n), " other note", n === 1 ? "" : "s", " (left out of the calendar)"] as const,
  advanced: "Advanced",
  regenerate: "Regenerate URL",
  turnOff: "Turn off for members",
  turnOffNote: "Turning off keeps events already in members' calendars but stops updating them.",
  rotateWarn: "Everyone who subscribed will stop getting updates until they add the new link.",
  rotateConfirm: "Regenerate and revoke old URL",
  rotateKeep: "Keep current URL",
  delete: "Delete",
  deleteEntry: "Delete entry",
  keep: "Keep",
  addToTimeline: "Add to timeline",
  deleteFailed: "Could not delete it",
  linkFailed: "Could not add it to the timeline",
  tellTitle: "Tell your members",
  tellNote: "Paste this into your group chat. Members also get an invite on their dashboard.",
  copyMessage: "Copy message",
  copied: "Copied",
  copyFailed: "Couldn't copy automatically. The message is selected; copy it with Ctrl+C (⌘C on a Mac).",
  setTime: "Set time",
  saveTime: "Save time",
  timeFailed: "Could not save the time",
};
