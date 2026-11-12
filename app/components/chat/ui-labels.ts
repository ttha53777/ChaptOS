// UI labels an answer may draw as a keycap. A closed list, like SCREEN_PATHS:
// an inline `code` span in a prose answer becomes a keycap only when its text is
// a control that really exists in the app, so the model can't dress an invented
// button up as a real one. Anything else renders as plain code.
//
// Add a label only after finding it in the UI (grep the component for it).
// Matching is case-sensitive on purpose — the keycap reads as the button.

export const UI_LABELS: ReadonlySet<string> = new Set([
  // Attendance
  "Open check-in",
  "Mark who attended",
  "Excuse",
  "Mark exempt…",
  // Treasury
  "Log Expense",
  "Log Revenue",
  "Add Transaction",
  "Mark Paid",
  // Tasks
  "Mark done",
  // Settings and its sections
  "Settings",
  "Thresholds",
  "Custom metrics",
  "Add metric",
  "Accounts",
  "Invitations",
  "Roles",
  "Member fields",
  "Semesters",
  "Event types",
  "Opening balance",
  "Money categories",
  "Workflows",
]);

export function isUiLabel(text: string): boolean {
  return UI_LABELS.has(text.trim());
}
