import { PushCategory, type PushCategory as Cat } from "@/lib/state/push";
import type { Permission } from "@/lib/permissions";

/**
 * The switchable push categories, in Settings order. `officerPerm` hides a
 * category from members who can't act on it (they never receive it anyway).
 * Each one is an Android notification channel with the same id.
 */
export const PUSH_CATEGORY_INFO: ReadonlyArray<{
  id: Cat;
  label: string;
  description: string;
  defaultOn: boolean;
  officerPerm?: Permission;
}> = [
  { id: PushCategory.Checkin,    label: "Check-in",          description: "When check-in opens for something you're expected at.", defaultOn: true },
  { id: PushCategory.Tasks,      label: "Tasks and polls",   description: "When a task or poll lands on your plate.",              defaultOn: true },
  { id: PushCategory.Dues,       label: "Dues",              description: "When a new charge goes on your tab.",                    defaultOn: true },
  { id: PushCategory.Attendance, label: "Excuses",           description: "When your excuse is approved.",                          defaultOn: true },
  { id: PushCategory.Requests,   label: "Requests to join",  description: "When someone asks to join.",                             defaultOn: true, officerPerm: "MANAGE_BROTHERS" },
];

export function categoryDefault(id: Cat): boolean {
  return PUSH_CATEGORY_INFO.find(c => c.id === id)?.defaultOn ?? true;
}
