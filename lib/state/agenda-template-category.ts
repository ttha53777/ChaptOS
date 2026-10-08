// What an agenda template is filed under — the drawer's tabs on the Templates
// page. A fixed set, CHECK-constrained in the migration; per-org categories
// would be their own project.
export const AgendaTemplateCategory = {
  Meetings:   "meetings",
  Leadership: "leadership",
  Committees: "committees",
} as const;

export type AgendaTemplateCategory = (typeof AgendaTemplateCategory)[keyof typeof AgendaTemplateCategory];

export const AGENDA_TEMPLATE_CATEGORIES: readonly AgendaTemplateCategory[] = Object.values(AgendaTemplateCategory);

export function isAgendaTemplateCategory(value: unknown): value is AgendaTemplateCategory {
  return typeof value === "string" && (AGENDA_TEMPLATE_CATEGORIES as readonly string[]).includes(value);
}
