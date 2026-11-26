/**
 * Settings → Semesters, as rules both clients run: the form's checks and the request
 * it sends, the list's order after a write, and every sentence. Pure; the web's
 * SemestersSection and the app's settings/Semesters.tsx render from it.
 *
 *   POST  /api/semesters        create (and activate)            MANAGE_SEMESTERS
 *   PATCH /api/semesters/[id]   { label, startDate, endDate, activate: false } = fix one
 *   PATCH /api/semesters/[id]   no body = make it the active one
 */

export interface SemesterLike {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

/** The form's check before it sends anything. Dates are YYYY-MM-DD, so string order is date order. */
export function checkSemester(label: string, startDate: string, endDate: string): string | null {
  if (!label.trim() || !startDate || !endDate) return "All fields are required.";
  if (endDate < startDate) return "End date must be on or after the start date.";
  return null;
}

/** The body: an edit never switches which semester is active. */
export const semesterBody = (label: string, startDate: string, endDate: string, editing: boolean) =>
  ({ label: label.trim(), startDate, endDate, ...(editing ? { activate: false } : {}) });

/** A new one lands on top and becomes the only active one. */
export const withCreated = <S extends SemesterLike>(list: S[], s: S): S[] => [s, ...list.map(x => ({ ...x, isActive: false }))];
export const withActive = <S extends SemesterLike>(list: S[], id: number): S[] => list.map(s => ({ ...s, isActive: s.id === id }));
export const withEdited = <S extends SemesterLike>(list: S[], s: S): S[] => list.map(x => (x.id === s.id ? s : x));

export const SEMESTERS_COPY = {
  lede: "Switch the active semester, fix one’s dates, or create a new one.",
  newSemester: "New semester",
  editSemester: "Edit semester",
  loading: "Loading…",
  emptyTitle: "No semesters yet",
  emptyHint: "Create one to start scoping your reporting periods.",
  active: "Active",
  edit: "Edit",
  setActive: "Set active",
  setting: "Setting…",
  label: "Label",
  labelPlaceholder: "e.g. Fall 2026",
  start: "Start date",
  end: "End date",
  cancel: "Cancel",
  save: "Save",
  saving: "Saving…",
  create: "Create & activate",
  creating: "Creating…",
  loadFailed: "Could not load semesters.",
  activated: "Active semester updated.",
  activateFailed: "Failed to switch active semester.",
  saveFailed: "Failed to save semester.",
  createFailed: "Failed to create semester.",
  created: (label: string) => `Semester "${label}" created and set active.`,
  saved: (label: string) => `Semester "${label}" saved.`,
};

/** "2026-08-24 – 2026-12-18", as the row's sub line prints it: three text runs, as the web splits them. */
export const semesterRange = (s: Pick<SemesterLike, "startDate" | "endDate">): [string, string, string] => [s.startDate, " – ", s.endDate];
