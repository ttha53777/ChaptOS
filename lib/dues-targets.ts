/**
 * "Hand out dues": who gets billed, and exactly how much each.
 *
 * The sheet's live receipt and the server both run this, so the receipt an
 * officer reads before pressing Bill is, to the cent, what gets written. The
 * server never trusts per-person amounts from the client — it re-resolves the
 * spec against the roster it just read.
 *
 * Three ways to pick people (DuesAudience all | role | pick):
 *   all  — the whole roster, minus anyone left out; one amount or a split total
 *   pick — hand-picked people; one amount or a split total
 *   role — a rate per row of the rate card. A member pays the SUM of every row
 *          that applies to them: Treasurer $60 + Social chair $40 = $100. Two
 *          rows aren't roles: "base" (everyone on the roster) and "none"
 *          (members who hold no role at all — roles here are officer roles).
 *
 * Pure module, safe on the client. Integer cents.
 */

export interface TargetMember {
  brotherId: number;
  name:      string;
  roleIds:   readonly number[];
}

export type DuesAmount =
  | { mode: "each";  cents: number }
  | { mode: "split"; totalCents: number };

/** A checked row of the rate card. `key` is a Role id, or one of the two non-role rows. */
export interface RateRow {
  key:         number | "base" | "none";
  amountCents: number;
}

export type DuesTargetSpec =
  | { kind: "all";  amount: DuesAmount; exclude: readonly number[] }
  | { kind: "pick"; amount: DuesAmount; brotherIds: readonly number[] }
  | { kind: "role"; rates: readonly RateRow[] };

/** A live charge already on the books, for the "already billed for this" check. */
export interface ExistingCharge {
  chargeId:   number;
  name:       string;
  brotherIds: ReadonlySet<number>;
}

export interface ResolvedLine {
  brotherId:   number;
  amountCents: number;
  /** role mode: the rows this person's amount is the sum of. */
  parts?:      { key: RateRow["key"]; amountCents: number }[];
}

export interface ResolvedTargets {
  lines:       ResolvedLine[];
  totalCents:  number;
  /** Everyone the spec selects, before the duplicate skip. */
  selected:    number;
  /** The same-named live charge, if there is one. */
  duplicateOf: number | null;
  /** Selected people who already have that charge. */
  already:     number[];
  /** Of those, the ones left off because onDuplicate is "skip". */
  skipped:     number[];
  /** role mode: people billed on two or more rows (their amount is the sum). */
  stacked:     number;
}

/** Same name, ignoring case and surrounding/inner runs of whitespace. */
export function sameChargeName(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(a) === norm(b);
}

const byName = (a: TargetMember, b: TargetMember) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.brotherId - b.brotherId;

/**
 * Split a total exactly: everyone gets the floor, and the leftover pennies go
 * one each to the first people in name order. $100 ÷ 3 = $33.34, $33.33, $33.33.
 */
export function splitCents(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  const each = Math.floor(totalCents / n);
  const extra = totalCents - each * n;
  return Array.from({ length: n }, (_, i) => each + (i < extra ? 1 : 0));
}

export function resolveTargets(
  spec: DuesTargetSpec,
  roster: readonly TargetMember[],
  opts: { name: string; existing?: readonly ExistingCharge[]; onDuplicate?: "skip" | "bill" } = { name: "" },
): ResolvedTargets {
  const members = [...roster].sort(byName);
  let selected: ResolvedLine[] = [];

  if (spec.kind === "role") {
    for (const m of members) {
      const parts: NonNullable<ResolvedLine["parts"]> = [];
      for (const r of spec.rates) {
        const applies = r.key === "base" ? true : r.key === "none" ? m.roleIds.length === 0 : m.roleIds.includes(r.key);
        if (applies && r.amountCents > 0) parts.push({ key: r.key, amountCents: r.amountCents });
      }
      if (!parts.length) continue;
      selected.push({ brotherId: m.brotherId, amountCents: parts.reduce((s, p) => s + p.amountCents, 0), parts });
    }
  } else {
    const who = spec.kind === "all"
      ? members.filter(m => !spec.exclude.includes(m.brotherId))
      : members.filter(m => spec.brotherIds.includes(m.brotherId));
    selected = who.map(m => ({ brotherId: m.brotherId, amountCents: spec.amount.mode === "each" ? spec.amount.cents : 0 }));
  }

  // Duplicates are decided before a split, so "skip them" divides the total
  // among the people actually billed, not everyone selected.
  const dup = opts.name.trim()
    ? opts.existing?.find(c => sameChargeName(c.name, opts.name)) ?? null
    : null;
  const already = dup ? selected.filter(l => dup.brotherIds.has(l.brotherId)).map(l => l.brotherId) : [];
  const skipped = (opts.onDuplicate ?? "skip") === "skip" ? already : [];
  const total = selected.length;
  let lines = skipped.length ? selected.filter(l => !skipped.includes(l.brotherId)) : selected;

  if (spec.kind !== "role" && spec.amount.mode === "split") {
    const shares = splitCents(spec.amount.totalCents, lines.length);
    lines = lines.map((l, i) => ({ ...l, amountCents: shares[i] }));
  }
  lines = lines.filter(l => l.amountCents > 0);

  return {
    lines,
    totalCents:  lines.reduce((s, l) => s + l.amountCents, 0),
    selected:    total,
    duplicateOf: dup?.chargeId ?? null,
    already,
    skipped,
    stacked:     lines.filter(l => (l.parts?.length ?? 0) > 1).length,
  };
}

/**
 * The stub's audience chip, frozen onto the charge when it's issued:
 * "Everyone", "Everyone but 2", "Treasurer", "By role", "3 people".
 */
export function audienceLabel(
  spec: DuesTargetSpec,
  billed: number,
  roleName: (id: number) => string | undefined,
): string {
  if (spec.kind === "all") return spec.exclude.length ? `Everyone but ${spec.exclude.length}` : "Everyone";
  if (spec.kind === "pick") return billed === 1 ? "1 person" : `${billed} people`;
  if (spec.rates.length === 1) {
    const k = spec.rates[0].key;
    return k === "base" ? "Everyone" : k === "none" ? "Members with no role" : roleName(k) ?? "By role";
  }
  return "By role";
}
