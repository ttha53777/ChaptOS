"use client";

// The files attached to this conversation, as chips above the composer:
// uploading (with a progress bar) → reading → ready, or failed with the
// server's reason. Every chip can be removed; a removed file is gone from the
// server too, so a follow-up can no longer use it.

import { IcFile, IcSheet, IcX } from "./icons";
import type { AttachmentChip } from "./useAttachments";
import type { ChatAttachmentInfo } from "./types";

function plural(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function meta(info: ChatAttachmentInfo): string {
  const units = plural(info.unitCount, info.unitNoun);
  return info.truncated ? `first ${units}` : units;
}

export function AttachmentTray({ chips, onRemove }: { chips: AttachmentChip[]; onRemove: (key: string) => void }) {
  if (chips.length === 0) return null;
  return (
    <ul className="att-tray" aria-label="Attached files">
      {chips.map(c => {
        const sheet = c.info ? c.info.unitNoun === "sheet" : /\.(xlsx|csv)$/i.test(c.name);
        return (
          <li key={c.key} className={`att-chip is-${c.status}`} title={c.status === "failed" ? c.error : c.name}>
            <span className="att-ic">{sheet ? <IcSheet /> : <IcFile />}</span>
            <span className="att-txt">
              <span className="att-name">{c.name}</span>
              <span className="att-meta" aria-live="polite">
                {c.status === "uploading" && `Uploading ${Math.round(c.progress * 100)}%`}
                {c.status === "reading" && "Reading…"}
                {c.status === "ready" && c.info && meta(c.info)}
                {c.status === "failed" && c.error}
              </span>
            </span>
            <button type="button" className="att-x" aria-label={`Remove ${c.name}`} onClick={() => onRemove(c.key)}>
              <IcX />
            </button>
            {c.status === "uploading" && <span className="att-bar" style={{ transform: `scaleX(${c.progress})` }} aria-hidden />}
          </li>
        );
      })}
    </ul>
  );
}
