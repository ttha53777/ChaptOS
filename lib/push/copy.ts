/**
 * Every push's words. The lock screen can show these to anyone holding the
 * phone, so nothing here goes beyond what the recipient already sees in the app,
 * and money amounts stay off it entirely.
 */
import { resolveLabel } from "@/lib/vocab";
import type { VocabOverrides } from "@/lib/vocab-keys";

export interface PushCopy { title: string; body: string }

const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** "2026-03-06" → "Fri, Mar 6". The date is a calendar day, not an instant. */
export function shortDate(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export const pushCopy = {
  checkinOpened:   (event: string): PushCopy => ({ title: "Check-in is open", body: `${clip(event)}. Tap to check in.` }),
  checkinReopened: (event: string): PushCopy => ({ title: "Check-in reopened", body: `${clip(event)} is taking check-ins again.` }),
  task: (title: string, due: string | null): PushCopy => {
    const d = shortDate(due);
    return { title: "New task", body: d ? `${clip(title)} · due ${d}` : clip(title) };
  },
  poll: (question: string, closes: string | null): PushCopy => {
    const d = shortDate(closes);
    return { title: "New poll", body: d ? `${clip(question)} · closes ${d}` : clip(question) };
  },
  joined: (org: string): PushCopy => ({ title: "You're in", body: `Welcome to ${clip(org, 60)}.` }),
  dues: (name: string, due: string | null, vocab: VocabOverrides): PushCopy => {
    const d = shortDate(due);
    const word = resolveLabel("Dues", vocab).toLowerCase();
    return { title: `New ${word} charge`, body: d ? `${clip(name)}, due ${d}.` : `${clip(name)}.` };
  },
  excuseApproved: (event: string): PushCopy => ({ title: "Excuse approved", body: `You're excused from ${clip(event)}.` }),
  joinRequest: (name: string, org: string): PushCopy => ({ title: "New request to join", body: `${clip(name, 60)} wants to join ${clip(org, 60)}.` }),
};

/** A recipient in 2+ orgs sees which one: "Alpha Beta · Check-in is open". */
export function withOrg(title: string, orgName: string, multiOrg: boolean): string {
  return multiOrg ? `${clip(orgName, 40)} · ${title}` : title;
}
