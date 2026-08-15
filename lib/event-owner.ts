/**
 * Resolving and labelling a programming event's owner.
 *
 * An event is owned by a PERSON or by a ROLE, never both. The role case is the
 * interesting one: a standing duty ("mixers belong to the Social Chair") should
 * not freeze on whoever held the title the day the card was made, so the stored
 * value is the role id and the display name resolves to today's holders. A role
 * rename propagates to every card for free — that is the entire point of role
 * owners, and it is why this pair is nullable FKs rather than a string.
 *
 * PURE MODULE — reached from the events page. No @/lib/db, no @/lib/errors.
 */

export type OwnerRef =
  | { kind: "brother"; id: number; name: string; initials: string }
  | { kind: "role"; id: number; name: string; holders: string[] }
  | null;

/** Two-letter initials from a display name: "Maya Chen" → "MC". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length === 1
    ? parts[0]!.slice(0, 2)
    : `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`;
  return letters.toUpperCase();
}

/** First name only — what a compact chip shows. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * Full label: "Maya Chen" for a person, "Social Chair (Maya / Thalha)" for a
 * role. The role name stays canonical because it is the half that doesn't go
 * stale; the parenthetical is a gloss saying who that happens to be today. A
 * role nobody currently holds renders as the bare role name rather than an empty
 * "()" — an unheld duty is still a real owner, and hiding that would misreport it
 * as unowned.
 */
export function ownerLabel(ref: OwnerRef): string | null {
  if (!ref) return null;
  if (ref.kind === "brother") return ref.name;
  return ref.holders.length
    ? `${ref.name} (${ref.holders.map(firstName).join(" / ")})`
    : ref.name;
}

/**
 * Card-length label — the role name alone.
 *
 * A kanban card is a handle, not a record: the role name already IS the fact
 * that doesn't go stale, and the "(Maya / Thalha)" gloss belongs where there is
 * room to say who that is today (the panel).
 */
export function ownerShortLabel(ref: OwnerRef): string | null {
  return ref ? ref.name : null;
}

/** Avatar text: a person's initials, a role's initials from its words. */
export function ownerInitials(ref: OwnerRef): string {
  if (!ref) return "?";
  if (ref.kind === "brother") return ref.initials;
  return ref.name
    .split(/\s+/)
    .map(w => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * The row shape the service selects for owner resolution.
 *
 * `ownerRole.brothers` is the role's current holders, resolved at READ time
 * rather than snapshotted — same posture as TaskAssignment's role targets, and
 * the reason granting someone the Social Chair role instantly makes them the
 * owner of every mixer.
 */
export interface OwnerRow {
  ownerBrotherId: number | null;
  ownerRoleId: number | null;
  ownerBrother: { id: number; name: string } | null;
  ownerRole: { id: number; name: string; brothers: { brotherId: number }[] } | null;
}

/**
 * Build the DTO's owner from a selected row.
 *
 * `nameFor` resolves a brotherId to the name THIS ORG uses (Membership.name,
 * falling back to Brother.name) — never Brother.name directly, which is the
 * account-canonical string no roster renders. Callers pass a map built from one
 * roster read, so no lookup here costs a query.
 *
 * Returns null when neither FK is set — including when one IS set but its
 * relation didn't load (a member erased mid-request), because a dangling id is
 * not an owner.
 */
export function resolveOwner(row: OwnerRow, nameFor: (brotherId: number) => string | null): OwnerRef {
  if (row.ownerBrother) {
    const name = nameFor(row.ownerBrother.id) ?? row.ownerBrother.name;
    return { kind: "brother", id: row.ownerBrother.id, name, initials: initialsOf(name) };
  }
  if (row.ownerRole) {
    return {
      kind:    "role",
      id:      row.ownerRole.id,
      name:    row.ownerRole.name,
      holders: row.ownerRole.brothers
        .map(b => nameFor(b.brotherId))
        .filter((n): n is string => n !== null),
    };
  }
  return null;
}
