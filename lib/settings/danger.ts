/**
 * Settings → Identity → Danger zone (delete the chapter): the rules and every
 * sentence, shared by the web (sections/DangerZone.tsx) and the app
 * (mobile/src/settings/DangerZone.tsx). Pure: no React, Node or Prisma.
 *
 * Org admins only (the service checks the same). The Delete button arms when the
 * org's exact name is typed; the request confirms with the slug.
 */
export interface DeletionSummaryLike {
  members: number;
  events: number;
  transactions: number;
  docs: number;
  parties: number;
}

export const deletionStats = (s: DeletionSummaryLike): [string, number][] => [
  ["Members", s.members],
  ["Events", s.events],
  ["Transactions", s.transactions],
  ["Parties", s.parties],
  ["Documents", s.docs],
];

export const deleteArmed = (typed: string, orgName: string, deleting: boolean) =>
  typed.trim() === orgName.trim() && orgName.trim().length > 0 && !deleting;

export const DANGER_COPY = {
  title: "Delete this chapter",
  body: (memberCount: number) =>
    `Removes the chapter and everything in it — roster, money, meetings, docs — for ${memberCount === 1 ? "the 1 person" : `all ${memberCount} people`} in it. This can't be undone.`,
  open: "Delete chapter…",
  modalTitle: "Delete organization",
  lead: (orgName: string) => ["This permanently deletes ", orgName, " and all of its data. ", "This action cannot be undone."] as const,
  who: "Members who belong only to this org are removed. Anyone who also belongs to another organization keeps their account.",
  summaryFailed: "Couldn’t load a summary of what will be removed — you can still delete below.",
  typeToConfirm: (orgName: string) => ["Type ", orgName, " to confirm"] as const,
  cancel: "Cancel",
  deleting: "Deleting…",
  confirm: "Delete forever",
  forbidden: "Only an org admin can delete this organization.",
  failed: "Couldn't delete the organization. Try again.",
} as const;
