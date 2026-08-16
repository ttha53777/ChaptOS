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
import { REQUIRED_FIELDS } from "@/lib/programming";
import { STAGES, STAGE_LABELS, STAGE_MEANINGS } from "@/lib/state/programming-stage";

/** What entering this lane costs, in words, or null when it costs no new field. */
function costOf(stage: (typeof STAGES)[number]): string | null {
  const own = REQUIRED_FIELDS.filter(f => f.gate === stage && f.kind !== "bool");
  if (own.length === 0) return null;
  const names = own.map(f => f.label.toLowerCase());
  return names.length === 1
    ? `A ${names[0]}.`
    : `A ${names.slice(0, -1).join(", a ")} and a ${names[names.length - 1]}.`;
}

export function EventsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal tone="dusk" title="How this board works" onClose={onClose} maxWidthClass="max-w-lg">
      <div className="space-y-3">
        <p className="text-[12.5px] leading-relaxed text-[#958d7c]">
          Four lanes. Each one costs something to enter and buys something in return.
        </p>

        <div className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.015]">
          {STAGES.map(s => {
            const cost = costOf(s);
            return (
              <div key={s} className="px-3 py-2.5">
                <div className="flex items-baseline gap-2">
                  <span className={`ev-help-dot ${s}`} aria-hidden />
                  <span className="text-[12.5px] font-semibold text-[#ece7dd]">{STAGE_LABELS[s]}</span>
                  <span className="text-[11.5px] text-[#6b6354]">{STAGE_MEANINGS[s]}</span>
                </div>
                <p className="mt-1 pl-4 text-[11.5px] leading-relaxed text-[#958d7c]">
                  {cost ?? (s === "done"
                    // Done costs no new FIELD — what makes it distinct is the
                    // route it must arrive by.
                    ? "Nothing new — but it has to come from Confirmed. How it went is asked when you wrap it up."
                    : "Nothing.")}
                </p>
              </div>
            );
          })}
        </div>

        <p className="text-[11.5px] leading-relaxed text-[#6b6354]">
          Only <b className="font-semibold text-[#958d7c]">Confirmed</b> and{" "}
          <b className="font-semibold text-[#958d7c]">Done</b> appear on the chapter&apos;s
          timeline. Ideas and plans stay on this board until somebody confirms them.
        </p>
      </div>
    </Modal>
  );
}
