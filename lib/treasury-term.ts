/**
 * Which term a ledger row belongs to. Pure, no db imports, so the treasury page
 * and the CSV export (server) agree on the same answer.
 *
 * `Transaction.semester` is a free-text label. For a long time every form
 * stamped the hardcoded demo label "SPR26" on whatever was logged, so an org
 * whose only term is "Fall 2026" carries rows labelled after a term it never
 * created. A label is trusted only when it names one of the org's real
 * Semester rows; otherwise (or when it's missing) the row is placed by its date.
 * A row that matches nothing keeps its own label rather than vanishing.
 */
export interface TermRow {
  label: string;
  startDate: string;
  endDate: string;
}

export function termOfTx(
  tx: { semester?: string | null; date: string },
  terms: readonly TermRow[],
): string | null {
  if (tx.semester && terms.some(t => t.label === tx.semester)) return tx.semester;
  const byDate = terms.find(t => tx.date >= t.startDate && tx.date <= t.endDate);
  return byDate?.label ?? tx.semester ?? null;
}

/** A dated thing (party, event) inside a term: by the term's own range when the
 *  label is a known Semester, else by the two-digit year a code like "SPR26"
 *  ends in, else unfiltered. */
export function inTerm(date: string, label: string, terms: readonly TermRow[]): boolean {
  const row = terms.find(t => t.label === label);
  if (row) return date >= row.startDate && date <= row.endDate;
  const yy = label.match(/(\d{2})\D*$/)?.[1];
  return yy ? date.startsWith(`20${yy}`) : true;
}
