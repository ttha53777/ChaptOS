"use client";

/**
 * How the board works, derived from the rules themselves.
 *
 * Every line here is computed from STAGES + REQUIRED_FIELDS. A help screen that
 * keeps its own copy of the rules is one that goes quietly wrong the first time
 * somebody changes one — and unlike broken code, nobody notices, because help
 * text is only read by people who don't yet know what it should say.
 *
 * Bool fields are filtered out, which is why Confirmed reads as two errands
 * rather than three: attendance is always answered (a boolean is satisfied by
 * existing), so listing it would name a chore that doesn't exist.
 */

import { Modal } from "../dashboard/primitives";
import { HELP, helpRows } from "@/lib/programme/board";

export function EventsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal tone="dusk" title={HELP.title} onClose={onClose} maxWidthClass="max-w-lg">
      <div className="ev-ov space-y-3">
        <p className="ev-ov-sub">
          {HELP.lead}
        </p>

        <div className="ev-ov-list divide-y divide-[rgba(var(--ink-rgb),0.06)] overflow-hidden rounded-xl border border-[rgba(var(--ink-rgb),0.08)] bg-[rgba(var(--ink-rgb),0.015)]">
          {helpRows().map(r => (
            <div key={r.stage} className="ev-ov-row px-3 py-2.5" data-stage={r.stage}>
              <div className="flex items-baseline gap-2">
                <span className={`ev-help-dot ${r.stage}`} aria-hidden />
                <span className="ev-ov-lbl font-semibold">{r.label}</span>
                <span className="ev-ov-hint">{r.meaning}</span>
              </div>
              <p className="ev-ov-sub mt-1 pl-4">{r.cost}</p>
            </div>
          ))}
        </div>

        <p className="ev-ov-hint">
          {/* Both spaces are explicit {" "}: this vendored Next drops a literal
              space that follows a closing tag, which ran "Done" into "appear". */}
          {HELP.foot[0]}<b className="ev-ov-strong">{HELP.foot[1]}</b>{" "}{HELP.foot[2]}{" "}
          <b className="ev-ov-strong">{HELP.foot[3]}</b>{" "}
          {HELP.foot[4]}
        </p>
      </div>
    </Modal>
  );
}
