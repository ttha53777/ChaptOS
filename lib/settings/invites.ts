/**
 * Settings → Invitations as words and rules: the expiry choices, each link's status
 * pill, its lines, the cap check, and every sentence the section says. Pure, shared by
 * the web section (app/org/[slug]/settings/sections/InvitationsSection.tsx) and the
 * native app (mobile/src/settings/Invitations.tsx).
 */
import type { InviteRow } from "@/lib/api-types";
import type { InviteStatus } from "@/lib/state";
import { INVITE_MAX_USES_CEILING, type InviteExpiry } from "@/lib/validation/invite";

export const EXPIRY_LABELS: Record<InviteExpiry, string> = {
  "20m":   "20 minutes",
  "1d":    "1 day",
  "7d":    "7 days",
  "14d":   "14 days",
  "never": "Never",
};

export type PillTone = "ok" | "muted" | "rose" | "gold" | "vio";

export const STATUS_PILL: Record<InviteStatus, { label: string; tone: PillTone }> = {
  active:    { label: "Active",    tone: "ok" },
  expired:   { label: "Expired",   tone: "muted" },
  revoked:   { label: "Revoked",   tone: "rose" },
  exhausted: { label: "Admission limit reached", tone: "gold" },
  reserved:  { label: "All places reserved", tone: "gold" },
};

/** The pill a row wears: an active link reads violet "Active". */
export const pillOf = (row: Pick<InviteRow, "status">) =>
  row.status === "active" ? { label: "Active", tone: "vio" as const } : STATUS_PILL[row.status];

/** A dead link's URL is noise — nobody should copy it. */
export const isDead = (row: Pick<InviteRow, "status">) => row.status !== "active" && row.status !== "reserved";

export function formatExpiry(iso: string | null, now = Date.now()): string {
  if (!iso) return "Never expires";
  const d = new Date(iso);
  if (d.getTime() <= now) return "Expired";
  return `Expires ${d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** "3 admitted · 1 waiting · 21 places available" */
export function countsLine(row: Pick<InviteRow, "redemptionCount" | "pendingCount" | "availableUses">): string {
  return `${row.redemptionCount} admitted · ${row.pendingCount} waiting${row.availableUses !== null ? ` · ${row.availableUses} places available` : ""}`;
}

/** The meter's fill (0–100), or null when the link is uncapped. */
export function meterOf(row: Pick<InviteRow, "maxUses" | "redemptionCount" | "pendingCount">): number | null {
  if (row.maxUses == null) return null;
  return Math.min(100, ((row.redemptionCount + row.pendingCount) / row.maxUses) * 100);
}

/** The date line's parts: when it ends (or was revoked), when it was made, by whom. */
export function dateParts(row: Pick<InviteRow, "status" | "revokedAt" | "expiresAt" | "createdAt" | "createdByName">, now = Date.now()): string[] {
  const first = row.status === "revoked" && row.revokedAt ? `Revoked ${formatDate(row.revokedAt)}` : formatExpiry(row.expiresAt, now);
  return [first, `Created ${formatDate(row.createdAt)}`, ...(row.createdByName ? [row.createdByName] : [])];
}

/** A typed cap as the number to send, or an error line. */
export function capOf(capOn: boolean, raw: string): { cap: number | undefined } | { error: string } {
  if (!capOn) return { cap: undefined };
  const cap = Number(raw);
  if (!Number.isInteger(cap) || cap < 1 || cap > INVITE_MAX_USES_CEILING) return { error: INVITE_COPY.capBad };
  return { cap };
}

/** A link that never expires and admits anyone is the one most likely to leak. */
export const capWarns = (expiry: InviteExpiry, capOn: boolean) => expiry === "never" && !capOn;

export const joinPath = (token: string) => `/join/${token}`;

export const INVITE_COPY = {
  lede: (memberWord: string) => ({
    a: "Generate a link to invite people to your organization. Opening it lets someone ",
    b: "ask",
    c: ` to join — they can’t see anything until an officer approves them on the ${memberWord} page. Links stay active until they expire, fill up, or you revoke them.`,
  }),
  review: "Review join requests",
  readyTitle: "Your invite link is ready",
  readyNote: "Share this link. Each person signs in and asks to join before an officer approves them.",
  readyLabel: "Invite link",
  copy: "Copy link",
  copied: "Copied",
  copyShort: "Copy",
  share: "Share…",
  done: "Done",
  label: "Label",
  optional: "(optional)",
  labelPlaceholder: "Fall rush",
  expires: "Expires after",
  limit: "Limit how many people can use it",
  maxUses: "Maximum uses",
  capWarning: "This link will work forever, for anyone who gets it. Consider an expiry or a use limit.",
  create: "Create invite link",
  creating: "Creating…",
  activeLinks: "Active links",
  allLinks: "All links",
  showInactive: "Show inactive links",
  loading: "Loading…",
  emptyAll: "No invite links yet",
  emptyActive: "No active invite links",
  emptyHint: (memberWord: string) => `Generate one above to start inviting ${memberWord}.`,
  revoke: "Revoke",
  reviewWaiting: (n: number) => `Review ${n} waiting`,
  replacement: "Create replacement link",
  viewJoins: "View joins",
  hideJoins: "Hide joins",
  joinsFailed: "Couldn’t load joins.",
  noJoins: "No joins yet.",
  retry: "Retry",
  revokeTitle: "Revoke this invite link?",
  revokeMessage: (row: Pick<InviteRow, "pendingCount" | "redemptionCount">) =>
    `New requests will stop immediately. ${row.pendingCount} pending requests will remain reviewable, and ${row.redemptionCount} admitted people keep their access. This cannot be undone.`,
  created: "Invite link created",
  revoked: "Invite link revoked",
  replacementNote: "Review the settings below to create a new link. The old link stays inactive.",
  capBad: "Maximum uses must be a whole number from 1 to 500",
  copyFailed: "Couldn't copy to clipboard",
  shareFailed: "Couldn't share this link. You can copy it instead.",
  loadFailed: "Failed to load invites",
  createFailed: "Failed to create invite",
  revokeFailed: "Failed to revoke invite",
} as const;
